-- ===========================================================================
-- FYB Dinner Night — the engine
-- ===========================================================================
-- Anyone can call the Supabase API directly with the public anon key, so the
-- interface is never the guard. Every rule that matters lives here.
--
-- Errors are raised as short SCREAMING_CASE codes; the app maps them to
-- human sentences. That keeps wording (especially around declines) in one
-- place in the UI rather than scattered through the database.
-- ===========================================================================

-- --------------------------------------------------------------- helpers --
create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select p.is_admin from profiles p where p.id = auth.uid()), false);
$$;

create or replace function cfg()
returns event_config
language sql stable security definer set search_path = public
as $$
  select * from event_config where id;
$$;

-- =========================================================================
-- Profile lifecycle
-- =========================================================================
create or replace function submit_profile_for_review()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_p   profiles;
  v_cfg event_config;
begin
  if v_me is null then raise exception 'AUTH_REQUIRED'; end if;

  v_cfg := cfg();
  if not v_cfg.registration_open then raise exception 'REGISTRATION_CLOSED'; end if;

  select * into v_p from profiles where id = v_me for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if v_p.review_status = 'approved' then raise exception 'ALREADY_APPROVED'; end if;

  if trim(v_p.first_name) = '' or trim(v_p.last_name) = '' then raise exception 'NAME_REQUIRED'; end if;
  if v_p.gender is null                                     then raise exception 'GENDER_REQUIRED'; end if;
  if v_p.phone is null or trim(v_p.phone) = ''              then raise exception 'PHONE_REQUIRED'; end if;
  if v_cfg.require_photo and (v_p.photo_url is null or v_p.photo_url = '') then
    raise exception 'PHOTO_REQUIRED';
  end if;

  update profiles
     set review_status = 'pending', rejection_reason = null
   where id = v_me;

  insert into audit_log (actor_id, action, target_type, target_id)
  values (v_me, 'profile.submitted', 'profile', v_me);

  return jsonb_build_object('status', 'pending');
end;
$$;

create or replace function admin_review_profile(
  p_profile uuid,
  p_approve boolean,
  p_reason  text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;

  update profiles
     set review_status    = case when p_approve then 'approved' else 'rejected' end::review_status_t,
         rejection_reason = case when p_approve then null else p_reason end
   where id = p_profile;

  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  insert into audit_log (actor_id, action, target_type, target_id, payload)
  values (auth.uid(),
          case when p_approve then 'profile.approved' else 'profile.rejected' end,
          'profile', p_profile, jsonb_build_object('reason', p_reason));

  return jsonb_build_object('ok', true);
end;
$$;

-- =========================================================================
-- Discovery
-- =========================================================================
-- A function rather than a view so the "least invited first" ordering can use
-- a counter that is never returned to the client. Popularity drives the sort
-- without ever being visible to anyone.
create or replace function browse_profiles(
  p_search     text default null,
  p_department text default null,
  p_level      text default null,
  p_limit      int  default 24,
  p_offset     int  default 0
)
returns table (
  id                  uuid,
  first_name          text,
  last_initial        text,
  photo_url           text,
  bio                 text,
  prompts             jsonb,
  department          text,
  level               text,
  has_pending_from_me boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_g   gender_t;
  v_cfg event_config;
begin
  if v_me is null then raise exception 'AUTH_REQUIRED'; end if;

  v_cfg := cfg();
  if not v_cfg.discovery_open and not is_admin() then raise exception 'DISCOVERY_CLOSED'; end if;

  select p.gender into v_g
    from profiles p
   where p.id = v_me and p.review_status = 'approved' and p.is_blocked = false;
  if v_g is null then raise exception 'NOT_APPROVED'; end if;

  return query
  select p.id,
         p.first_name,
         case when trim(p.last_name) = '' then '' else left(p.last_name, 1) || '.' end,
         p.photo_url,
         p.bio,
         p.prompts,
         p.department,
         p.level,
         exists (
           select 1 from invitations i
            where i.sender_id = v_me and i.recipient_id = p.id and i.status = 'pending'
         )
    from profiles p
   where p.review_status  = 'approved'
     and p.pairing_status = 'unpaired'
     and p.is_blocked     = false
     and p.gender        <> v_g
     and p.id            <> v_me
     and not exists (
           select 1 from blocks b
            where (b.blocker_id = v_me and b.blocked_id = p.id)
               or (b.blocker_id = p.id  and b.blocked_id = v_me)
         )
     and (p_department is null or p_department = '' or p.department = p_department)
     and (p_level      is null or p_level      = '' or p.level      = p_level)
     and (p_search     is null or p_search     = ''
          or p.first_name ilike '%' || p_search || '%'
          or p.last_name  ilike '%' || p_search || '%')
   order by p.invites_received_count asc, p.created_at asc
   limit  least(greatest(coalesce(p_limit, 24), 1), 60)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- =========================================================================
-- Invitations
-- =========================================================================
create or replace function send_invitation(p_recipient uuid, p_note text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_cfg     event_config;
  v_s       profiles;
  v_r       profiles;
  v_pending int;
  v_id      uuid;
begin
  if v_me is null            then raise exception 'AUTH_REQUIRED'; end if;
  if v_me = p_recipient      then raise exception 'SELF_INVITE';   end if;

  v_cfg := cfg();
  if not v_cfg.discovery_open then raise exception 'DISCOVERY_CLOSED'; end if;
  if v_cfg.pairing_deadline is not null and now() > v_cfg.pairing_deadline then
    raise exception 'DEADLINE_PASSED';
  end if;

  p_note := trim(coalesce(p_note, ''));
  if char_length(p_note) < 1 or char_length(p_note) > 200 then raise exception 'NOTE_LENGTH'; end if;

  -- Lock both rows in a deterministic order so concurrent invitations in
  -- opposite directions cannot deadlock.
  perform 1 from profiles where id = least(v_me, p_recipient)    for update;
  perform 1 from profiles where id = greatest(v_me, p_recipient) for update;

  select * into v_s from profiles where id = v_me;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  select * into v_r from profiles where id = p_recipient;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  if v_s.is_blocked or v_r.is_blocked            then raise exception 'BLOCKED';              end if;
  if v_s.review_status  <> 'approved'            then raise exception 'SENDER_NOT_APPROVED';  end if;
  if v_r.review_status  <> 'approved'            then raise exception 'RECIPIENT_UNAVAILABLE';end if;
  if v_s.pairing_status <> 'unpaired'            then raise exception 'SENDER_PAIRED';        end if;
  if v_r.pairing_status <> 'unpaired'            then raise exception 'RECIPIENT_UNAVAILABLE';end if;
  if v_s.gender is null or v_r.gender is null    then raise exception 'GENDER_MISSING';       end if;
  if v_s.gender = v_r.gender                     then raise exception 'SAME_GENDER';          end if;

  if exists (select 1 from blocks b
              where (b.blocker_id = v_me        and b.blocked_id = p_recipient)
                 or (b.blocker_id = p_recipient and b.blocked_id = v_me)) then
    raise exception 'BLOCKED';
  end if;

  if v_s.invites_sent_count >= v_cfg.max_lifetime_invites then raise exception 'LIFETIME_CAP'; end if;

  select count(*) into v_pending
    from invitations i where i.sender_id = v_me and i.status = 'pending';
  if v_pending >= v_cfg.max_outstanding_invites then raise exception 'OUTSTANDING_CAP'; end if;

  if exists (select 1 from invitations i
              where i.sender_id = v_me and i.recipient_id = p_recipient and i.status = 'pending') then
    raise exception 'ALREADY_PENDING';
  end if;

  insert into invitations (sender_id, recipient_id, note, expires_at)
  values (v_me, p_recipient, p_note, now() + make_interval(hours => v_cfg.invite_expiry_hours))
  returning id into v_id;

  update profiles set invites_sent_count     = invites_sent_count     + 1 where id = v_me;
  update profiles set invites_received_count = invites_received_count + 1 where id = p_recipient;

  insert into audit_log (actor_id, action, target_type, target_id, payload)
  values (v_me, 'invitation.sent', 'invitation', v_id, jsonb_build_object('recipient', p_recipient));

  return v_id;
end;
$$;

-- -------------------------------------------------------------------------
-- The critical transaction.
--
-- When someone holding three invitations accepts one, all of this must happen
-- together or not at all: re-verify both people are free, re-verify the gender
-- rule, create the pair, void the competing invitations, refund those senders,
-- and issue the pass.
--
-- Recoverable outcomes RETURN rather than RAISE. Raising would roll back the
-- bookkeeping we want to keep (voiding a stale invitation, expiring one that
-- ran out while it sat in the inbox).
-- -------------------------------------------------------------------------
create or replace function respond_to_invitation(p_invitation uuid, p_accept boolean)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_inv   invitations;
  v_other uuid;
  v_pa    profiles;
  v_pb    profiles;
  v_first uuid;
  v_last  uuid;
  v_pair  uuid;
  v_code  text;
begin
  if v_me is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_inv from invitations where id = p_invitation for update;
  if not found                       then raise exception 'INVITE_NOT_FOUND'; end if;
  if v_inv.recipient_id <> v_me      then raise exception 'NOT_YOURS';        end if;
  if v_inv.status       <> 'pending' then raise exception 'NOT_PENDING';      end if;

  if v_inv.expires_at <= now() then
    update invitations set status = 'expired', responded_at = now() where id = p_invitation;
    update profiles
       set invites_sent_count = greatest(0, invites_sent_count - 1)
     where id = v_inv.sender_id;
    return jsonb_build_object('accepted', false, 'reason', 'INVITE_EXPIRED');
  end if;

  -- ---------------------------------------------------------- decline ----
  -- Private by design. The sender is only ever told the person is no longer
  -- available, and no decline counter is written anywhere in the system.
  if not coalesce(p_accept, false) then
    update invitations set status = 'declined', responded_at = now() where id = p_invitation;
    insert into audit_log (actor_id, action, target_type, target_id)
    values (v_me, 'invitation.declined', 'invitation', p_invitation);
    return jsonb_build_object('accepted', false, 'reason', 'DECLINED');
  end if;

  -- ----------------------------------------------------------- accept ----
  v_other := v_inv.sender_id;
  v_first := least(v_me, v_other);
  v_last  := greatest(v_me, v_other);

  perform 1 from profiles where id = v_first for update;
  perform 1 from profiles where id = v_last  for update;

  select * into v_pa from profiles where id = v_other;
  select * into v_pb from profiles where id = v_me;

  -- The sender got paired with someone else while this sat in the inbox.
  if v_pa.pairing_status <> 'unpaired' or v_pa.active_pair_id is not null then
    update invitations set status = 'voided', responded_at = now() where id = p_invitation;
    return jsonb_build_object('accepted', false, 'reason', 'SENDER_ALREADY_PAIRED');
  end if;

  if v_pb.pairing_status <> 'unpaired' or v_pb.active_pair_id is not null then
    return jsonb_build_object('accepted', false, 'reason', 'ALREADY_PAIRED');
  end if;

  if v_pa.review_status <> 'approved' or v_pb.review_status <> 'approved' then
    raise exception 'NOT_APPROVED';
  end if;
  if v_pa.is_blocked or v_pb.is_blocked then raise exception 'BLOCKED'; end if;
  if v_pa.gender is null or v_pb.gender is null or v_pa.gender = v_pb.gender then
    raise exception 'SAME_GENDER';
  end if;

  insert into pairs (user_a_id, user_b_id) values (v_first, v_last) returning id into v_pair;

  update profiles
     set pairing_status = 'paired',
         active_pair_id = v_pair,
         seeking_help   = false
   where id in (v_first, v_last);

  update invitations set status = 'accepted', responded_at = now() where id = p_invitation;

  -- Void every other live invitation touching either person, and give those
  -- senders their invitation back.
  with voided as (
    update invitations i
       set status = 'voided', responded_at = now()
     where i.status = 'pending'
       and i.id <> p_invitation
       and (i.sender_id    in (v_me, v_other)
         or i.recipient_id in (v_me, v_other))
    returning i.sender_id
  ),
  refunds as (
    select v.sender_id, count(*)::int as n from voided v group by v.sender_id
  )
  update profiles p
     set invites_sent_count = greatest(0, p.invites_sent_count - r.n)
    from refunds r
   where p.id = r.sender_id;

  v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));
  insert into passes (pair_id, code) values (v_pair, v_code);

  insert into audit_log (actor_id, action, target_type, target_id, payload)
  values (v_me, 'pair.confirmed', 'pair', v_pair,
          jsonb_build_object('invitation', p_invitation, 'partner', v_other));

  return jsonb_build_object('accepted', true, 'pair_id', v_pair, 'code', v_code);
end;
$$;

create or replace function withdraw_invitation(p_invitation uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_inv invitations;
begin
  if v_me is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_inv from invitations where id = p_invitation for update;
  if not found                    then raise exception 'INVITE_NOT_FOUND'; end if;
  if v_inv.sender_id <> v_me      then raise exception 'NOT_YOURS';        end if;
  if v_inv.status    <> 'pending' then raise exception 'NOT_PENDING';      end if;

  update invitations set status = 'withdrawn', responded_at = now() where id = p_invitation;

  -- Withdrawing frees the outstanding slot but does NOT refund the lifetime
  -- count -- otherwise the budget means nothing and someone can work through
  -- the entire directory.
  insert into audit_log (actor_id, action, target_type, target_id)
  values (v_me, 'invitation.withdrawn', 'invitation', p_invitation);

  return jsonb_build_object('ok', true);
end;
$$;

-- Scheduled every 15 minutes. Releases both sides without anyone having to
-- say no, and refunds the sender's lifetime budget.
create or replace function expire_invitations()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
begin
  with expired as (
    update invitations i
       set status = 'expired', responded_at = now()
     where i.status = 'pending' and i.expires_at <= now()
    returning i.sender_id
  ),
  refunds as (
    select e.sender_id, count(*)::int as n from expired e group by e.sender_id
  ),
  applied as (
    update profiles p
       set invites_sent_count = greatest(0, p.invites_sent_count - r.n)
      from refunds r
     where p.id = r.sender_id
    returning r.n
  )
  select coalesce(sum(applied.n), 0)::int into v_count from applied;

  return v_count;
end;
$$;

-- =========================================================================
-- Matchmaker — the safety net
-- =========================================================================
-- Framed on both sides as a committee suggestion, so neither person is the
-- one who had to ask and neither is the one nobody asked. Does not consume
-- the sender's invitation budget.
create or replace function admin_propose_match(p_a uuid, p_b uuid, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg  event_config;
  v_pa   profiles;
  v_pb   profiles;
  v_id   uuid;
  v_note text;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_a = p_b      then raise exception 'SELF_INVITE'; end if;

  v_cfg := cfg();

  perform 1 from profiles where id = least(p_a, p_b)    for update;
  perform 1 from profiles where id = greatest(p_a, p_b) for update;

  select * into v_pa from profiles where id = p_a;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  select * into v_pb from profiles where id = p_b;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  if v_pa.review_status  <> 'approved' or v_pb.review_status  <> 'approved' then raise exception 'NOT_APPROVED'; end if;
  if v_pa.pairing_status <> 'unpaired' or v_pb.pairing_status <> 'unpaired' then raise exception 'ALREADY_PAIRED'; end if;
  if v_pa.gender is null or v_pb.gender is null or v_pa.gender = v_pb.gender then raise exception 'SAME_GENDER'; end if;

  update invitations
     set status = 'voided', responded_at = now()
   where status = 'pending' and sender_id = p_a and recipient_id = p_b;

  v_note := coalesce(nullif(trim(coalesce(p_note, '')), ''),
                     'The FYB committee thinks you two would make a great table.');

  insert into invitations (sender_id, recipient_id, note, source, expires_at)
  values (p_a, p_b, v_note, 'matchmaker',
          now() + make_interval(hours => v_cfg.invite_expiry_hours))
  returning id into v_id;

  insert into audit_log (actor_id, action, target_type, target_id, payload)
  values (auth.uid(), 'matchmaker.proposed', 'invitation', v_id,
          jsonb_build_object('from', p_a, 'to', p_b));

  return v_id;
end;
$$;

-- =========================================================================
-- Tables and seating
-- =========================================================================
create or replace function claim_table(p_table uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_pair uuid;
  v_cfg  event_config;
  v_cap  int;
  v_used int;
begin
  if v_me is null then raise exception 'AUTH_REQUIRED'; end if;

  v_cfg := cfg();
  if not v_cfg.seat_selection_enabled then raise exception 'SEAT_SELECTION_OFF'; end if;

  select p.active_pair_id into v_pair from profiles p where p.id = v_me;
  if v_pair is null then raise exception 'NOT_PAIRED'; end if;

  -- Lock the table row so two pairs cannot both take the last two seats.
  select t.capacity into v_cap
    from tables t where t.id = p_table and t.is_open
     for update;
  if not found then raise exception 'TABLE_UNAVAILABLE'; end if;

  select count(*) * 2 into v_used
    from pairs pr
   where pr.table_id = p_table and pr.status = 'confirmed' and pr.id <> v_pair;

  if v_used + 2 > v_cap then raise exception 'TABLE_FULL'; end if;

  update pairs set table_id = p_table where id = v_pair and status = 'confirmed';
  if not found then raise exception 'NOT_PAIRED'; end if;

  insert into audit_log (actor_id, action, target_type, target_id, payload)
  values (v_me, 'table.claimed', 'pair', v_pair, jsonb_build_object('table', p_table));

  return jsonb_build_object('ok', true, 'table_id', p_table);
end;
$$;

create or replace function admin_assign_table(p_pair uuid, p_table uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_cap  int;
  v_used int;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;

  if p_table is null then
    update pairs set table_id = null where id = p_pair and status = 'confirmed';
    if not found then raise exception 'PAIR_NOT_FOUND'; end if;
    return jsonb_build_object('ok', true, 'table_id', null);
  end if;

  select t.capacity into v_cap from tables t where t.id = p_table for update;
  if not found then raise exception 'TABLE_UNAVAILABLE'; end if;

  select count(*) * 2 into v_used
    from pairs pr
   where pr.table_id = p_table and pr.status = 'confirmed' and pr.id <> p_pair;

  if v_used + 2 > v_cap then raise exception 'TABLE_FULL'; end if;

  update pairs set table_id = p_table where id = p_pair and status = 'confirmed';
  if not found then raise exception 'PAIR_NOT_FOUND'; end if;

  insert into audit_log (actor_id, action, target_type, target_id, payload)
  values (auth.uid(), 'table.assigned', 'pair', p_pair, jsonb_build_object('table', p_table));

  return jsonb_build_object('ok', true, 'table_id', p_table);
end;
$$;

-- Fills every unseated pair into the emptiest open table first.
create or replace function admin_autofill_tables()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_pair   record;
  v_table  uuid;
  v_placed int := 0;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;

  for v_pair in
    select pr.id from pairs pr
     where pr.status = 'confirmed' and pr.table_id is null
     order by pr.confirmed_at asc
  loop
    select t.id into v_table
      from tables t
     where t.is_open
       and (select count(*) * 2 from pairs p2
             where p2.table_id = t.id and p2.status = 'confirmed') + 2 <= t.capacity
     order by (select count(*) from pairs p3
                where p3.table_id = t.id and p3.status = 'confirmed') desc,
              t.sort_order asc
     limit 1;

    exit when v_table is null;

    update pairs set table_id = v_table where id = v_pair.id;
    v_placed := v_placed + 1;
  end loop;

  insert into audit_log (actor_id, action, payload)
  values (auth.uid(), 'table.autofill', jsonb_build_object('placed', v_placed));

  return v_placed;
end;
$$;

-- =========================================================================
-- Dissolving a pair — admin only. People fall ill, plans change.
-- =========================================================================
create or replace function admin_dissolve_pair(p_pair uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_pair pairs;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;

  select * into v_pair from pairs where id = p_pair for update;
  if not found                      then raise exception 'PAIR_NOT_FOUND'; end if;
  if v_pair.status <> 'confirmed'   then raise exception 'NOT_CONFIRMED';  end if;

  update profiles
     set pairing_status = 'unpaired', active_pair_id = null
   where id in (v_pair.user_a_id, v_pair.user_b_id);

  delete from passes where pair_id = p_pair;

  update pairs
     set status = 'dissolved', table_id = null,
         dissolved_at = now(), dissolved_reason = p_reason
   where id = p_pair;

  insert into audit_log (actor_id, action, target_type, target_id, payload)
  values (auth.uid(), 'pair.dissolved', 'pair', p_pair, jsonb_build_object('reason', p_reason));

  return jsonb_build_object('ok', true);
end;
$$;

-- =========================================================================
-- Door check-in
-- =========================================================================
create or replace function admin_check_in(p_code text, p_side text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_pass passes;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_side not in ('a', 'b', 'both') then raise exception 'BAD_SIDE'; end if;

  select * into v_pass from passes where upper(code) = upper(trim(p_code)) for update;
  if not found then raise exception 'PASS_NOT_FOUND'; end if;

  update passes
     set checked_in_a_at = case when p_side in ('a', 'both')
                                then coalesce(checked_in_a_at, now()) else checked_in_a_at end,
         checked_in_b_at = case when p_side in ('b', 'both')
                                then coalesce(checked_in_b_at, now()) else checked_in_b_at end
   where id = v_pass.id;

  insert into audit_log (actor_id, action, target_type, target_id, payload)
  values (auth.uid(), 'pass.checked_in', 'pass', v_pass.id, jsonb_build_object('side', p_side));

  return jsonb_build_object('ok', true, 'pair_id', v_pass.pair_id);
end;
$$;

-- =========================================================================
-- Public stats — aggregates only, safe for anonymous visitors
-- =========================================================================
create or replace function get_public_stats()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'registered',        (select count(*) from profiles where review_status = 'approved'),
    'pairs',             (select count(*) from pairs    where status = 'confirmed'),
    'seats_taken',       (select count(*) * 2 from pairs where status = 'confirmed'),
    'total_seats',       c.total_seats,
    'seats_left',        greatest(0, c.total_seats - (select count(*) * 2 from pairs where status = 'confirmed')),
    'event_name',        c.event_name,
    'event_starts_at',   c.event_starts_at,
    'venue',             c.venue,
    'dress_code',        c.dress_code,
    'registration_open', c.registration_open,
    'discovery_open',    c.discovery_open,
    'pairing_deadline',  c.pairing_deadline,
    'hashtag',           c.hashtag,
    'social_handle',     c.social_handle
  )
  from event_config c where c.id;
$$;

-- The consented wall of pairs and the message carousel on the landing page.
create or replace function get_public_wall(p_limit int default 24)
returns table (
  pair_id      uuid,
  name_a       text,
  name_b       text,
  photo_a      text,
  photo_b      text,
  confirmed_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select pr.id,
         a.first_name,
         b.first_name,
         a.photo_url,
         b.photo_url,
         pr.confirmed_at
    from pairs pr
    join profiles a on a.id = pr.user_a_id
    join profiles b on b.id = pr.user_b_id
   where pr.status = 'confirmed'
   order by pr.confirmed_at desc
   limit least(greatest(coalesce(p_limit, 24), 1), 60);
$$;

create or replace function get_public_messages(p_limit int default 12)
returns table (
  id         uuid,
  body       text,
  author     text,
  created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select m.id,
         m.body,
         case when m.anonymise then 'Anonymous' else a.first_name end,
         m.created_at
    from date_messages m
    join profiles a on a.id = m.author_id
   where m.share_consent = true
     and m.moderation_status = 'approved'
   order by m.created_at desc
   limit least(greatest(coalesce(p_limit, 12), 1), 40);
$$;

-- =========================================================================
-- Grants — anon needs only the public read surface
-- =========================================================================
revoke all on function send_invitation(uuid, text)            from anon;
revoke all on function respond_to_invitation(uuid, boolean)   from anon;
revoke all on function withdraw_invitation(uuid)              from anon;
revoke all on function browse_profiles(text, text, text, int, int) from anon;
revoke all on function claim_table(uuid)                      from anon;
revoke all on function submit_profile_for_review()            from anon;
revoke all on function expire_invitations()                   from anon, authenticated;
revoke all on function admin_review_profile(uuid, boolean, text)   from anon;
revoke all on function admin_propose_match(uuid, uuid, text)       from anon;
revoke all on function admin_assign_table(uuid, uuid)              from anon;
revoke all on function admin_autofill_tables()                     from anon;
revoke all on function admin_dissolve_pair(uuid, text)             from anon;
revoke all on function admin_check_in(text, text)                  from anon;
