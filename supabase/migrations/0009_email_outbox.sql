-- ===========================================================================
-- FYB Dinner Night — transactional email
-- ===========================================================================
-- Emails are queued into an outbox by the same transaction that causes them,
-- and drained separately by /api/cron/email.
--
-- Why an outbox rather than sending from the server action:
--   * expiry runs inside pg_cron, where there is no request to send from
--   * a queued row is committed with the pairing, so an email can never claim
--     something that got rolled back — and can never be silently lost either
--   * dedupe_key makes double-sends impossible, which matters most for the
--     one email nobody should get twice: "you found your date"
--   * failures retry instead of vanishing into a server log
-- ===========================================================================

alter table profiles
  add column if not exists email_opt_out boolean not null default false;

create table if not exists email_outbox (
  id          bigserial primary key,
  to_email    text        not null,
  to_name     text,
  template    text        not null,
  payload     jsonb       not null default '{}'::jsonb,
  status      text        not null default 'queued'
                check (status in ('queued', 'sent', 'failed', 'skipped')),
  attempts    int         not null default 0,
  last_error  text,
  send_after  timestamptz not null default now(),
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  -- NULLs never collide in a unique index, so a null key means "always send".
  dedupe_key  text unique
);

create index if not exists email_outbox_pending_idx
  on email_outbox (send_after) where status = 'queued';

alter table email_outbox enable row level security;

create policy email_outbox_admin_read on email_outbox
  for select using (is_admin());

revoke insert, update, delete on email_outbox from anon, authenticated;

-- ---------------------------------------------------------------------------
create or replace function queue_email(
  p_to       text,
  p_name     text,
  p_template text,
  p_payload  jsonb   default '{}'::jsonb,
  p_dedupe   text    default null,
  p_after    timestamptz default now()
)
returns void
language sql security definer set search_path = public
as $$
  insert into email_outbox (to_email, to_name, template, payload, dedupe_key, send_after)
  select lower(trim(p_to)), p_name, p_template,
         coalesce(p_payload, '{}'::jsonb), p_dedupe, coalesce(p_after, now())
   where p_to is not null and trim(p_to) <> ''
  on conflict (dedupe_key) do nothing;
$$;

-- Convenience: queue by profile id, honouring the opt-out.
create or replace function queue_email_to(
  p_profile  uuid,
  p_template text,
  p_payload  jsonb default '{}'::jsonb,
  p_dedupe   text  default null,
  p_after    timestamptz default now()
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_p profiles;
begin
  select * into v_p from profiles where id = p_profile;
  if not found or v_p.email_opt_out or v_p.email = '' then return; end if;

  perform queue_email(v_p.email, v_p.first_name, p_template, p_payload, p_dedupe, p_after);
end;
$$;

-- ===========================================================================
-- Hook the emails into the transactions that cause them
-- ===========================================================================

-- --------------------------------------------------- invitation received --
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
  if v_me is null       then raise exception 'AUTH_REQUIRED'; end if;
  if v_me = p_recipient then raise exception 'SELF_INVITE';   end if;

  v_cfg := cfg();
  if not v_cfg.discovery_open then raise exception 'DISCOVERY_CLOSED'; end if;
  if v_cfg.pairing_deadline is not null and now() > v_cfg.pairing_deadline then
    raise exception 'DEADLINE_PASSED';
  end if;

  p_note := trim(coalesce(p_note, ''));
  if char_length(p_note) < v_cfg.min_love_note_length then raise exception 'NOTE_TOO_SHORT'; end if;
  if char_length(p_note) > v_cfg.max_love_note_length then raise exception 'NOTE_TOO_LONG';  end if;

  perform 1 from profiles where id = least(v_me, p_recipient)    for update;
  perform 1 from profiles where id = greatest(v_me, p_recipient) for update;

  select * into v_s from profiles where id = v_me;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  select * into v_r from profiles where id = p_recipient;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  if v_s.is_blocked or v_r.is_blocked         then raise exception 'BLOCKED';               end if;
  if v_s.review_status  <> 'approved'         then raise exception 'SENDER_NOT_APPROVED';   end if;
  if v_r.review_status  <> 'approved'         then raise exception 'RECIPIENT_UNAVAILABLE'; end if;
  if v_s.pairing_status <> 'unpaired'         then raise exception 'SENDER_PAIRED';         end if;
  if v_r.pairing_status <> 'unpaired'         then raise exception 'RECIPIENT_UNAVAILABLE'; end if;
  if v_s.gender is null or v_r.gender is null then raise exception 'GENDER_MISSING';        end if;
  if v_s.gender = v_r.gender                  then raise exception 'SAME_GENDER';           end if;

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

  -- The note itself goes in the email: it is the thing worth opening for.
  perform queue_email_to(
    p_recipient, 'invitation_received',
    jsonb_build_object(
      'from_name', v_s.first_name,
      'note', p_note,
      'expires_hours', v_cfg.invite_expiry_hours,
      'expires_at', now() + make_interval(hours => v_cfg.invite_expiry_hours)
    ),
    'inv_new_' || v_id::text
  );

  insert into audit_log (actor_id, action, target_type, target_id, payload)
  values (v_me, 'invitation.sent', 'invitation', v_id, jsonb_build_object('recipient', p_recipient));

  return v_id;
end;
$$;

-- ------------------------------------------- accepted / declined / voided --
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
  v_row   record;
begin
  if v_me is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_inv from invitations where id = p_invitation for update;
  if not found                       then raise exception 'INVITE_NOT_FOUND'; end if;
  if v_inv.recipient_id <> v_me      then raise exception 'NOT_YOURS';        end if;
  if v_inv.status       <> 'pending' then raise exception 'NOT_PENDING';      end if;

  if v_inv.expires_at <= now() then
    update invitations set status = 'expired', responded_at = now() where id = p_invitation;
    update profiles set invites_sent_count = greatest(0, invites_sent_count - 1)
     where id = v_inv.sender_id;
    return jsonb_build_object('accepted', false, 'reason', 'INVITE_EXPIRED');
  end if;

  -- ---------------------------------------------------------- decline ----
  -- The sender is told the person is no longer available. Never who, never
  -- that it was a refusal, and no counter is kept anywhere.
  if not coalesce(p_accept, false) then
    update invitations set status = 'declined', responded_at = now() where id = p_invitation;

    select * into v_pb from profiles where id = v_me;
    perform queue_email_to(
      v_inv.sender_id, 'no_longer_available',
      jsonb_build_object('other_name', v_pb.first_name),
      'inv_closed_' || p_invitation::text
    );

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
     set pairing_status = 'paired', active_pair_id = v_pair, seeking_help = false
   where id in (v_first, v_last);

  update invitations set status = 'accepted', responded_at = now() where id = p_invitation;

  -- Void the competing invitations, refund their senders, and tell each of
  -- them the neutral thing — one email each, deduped on the invitation id.
  for v_row in
    update invitations i
       set status = 'voided', responded_at = now()
     where i.status = 'pending'
       and i.id <> p_invitation
       and (i.sender_id in (v_me, v_other) or i.recipient_id in (v_me, v_other))
    returning i.id, i.sender_id, i.recipient_id
  loop
    update profiles
       set invites_sent_count = greatest(0, invites_sent_count - 1)
     where id = v_row.sender_id;

    if v_row.sender_id <> v_me and v_row.sender_id <> v_other then
      perform queue_email_to(
        v_row.sender_id, 'no_longer_available',
        jsonb_build_object(
          'other_name',
          (select first_name from profiles where id = v_row.recipient_id)
        ),
        'inv_closed_' || v_row.id::text
      );
    end if;
  end loop;

  v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));
  insert into passes (pair_id, code) values (v_pair, v_code);

  -- Both halves get the same news, each addressed to the other person.
  perform queue_email_to(v_other, 'pair_confirmed',
    jsonb_build_object('partner_name', v_pb.first_name, 'code', v_code, 'how', 'accepted'),
    'pair_' || v_pair::text || '_' || v_other::text);

  perform queue_email_to(v_me, 'pair_confirmed',
    jsonb_build_object('partner_name', v_pa.first_name, 'code', v_code, 'how', 'accepted'),
    'pair_' || v_pair::text || '_' || v_me::text);

  insert into audit_log (actor_id, action, target_type, target_id, payload)
  values (v_me, 'pair.confirmed', 'pair', v_pair,
          jsonb_build_object('invitation', p_invitation, 'partner', v_other));

  return jsonb_build_object('accepted', true, 'pair_id', v_pair, 'code', v_code);
end;
$$;

-- --------------------------------------------------------------- expiry --
create or replace function expire_invitations()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_row   record;
  v_count int := 0;
begin
  for v_row in
    update invitations i
       set status = 'expired', responded_at = now()
     where i.status = 'pending' and i.expires_at <= now()
    returning i.id, i.sender_id, i.recipient_id
  loop
    update profiles
       set invites_sent_count = greatest(0, invites_sent_count - 1)
     where id = v_row.sender_id;

    perform queue_email_to(
      v_row.sender_id, 'invitation_expired',
      jsonb_build_object(
        'other_name', (select first_name from profiles where id = v_row.recipient_id)
      ),
      'inv_exp_' || v_row.id::text
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Warns a recipient a few hours before an invitation lapses, so nobody misses
-- one simply because they did not open the app.
create or replace function remind_expiring_invitations(p_hours int default 6)
returns int
language plpgsql security definer set search_path = public
as $$
declare v_row record; v_count int := 0;
begin
  for v_row in
    select i.id, i.recipient_id, i.expires_at, p.first_name as sender_name
      from invitations i
      join profiles p on p.id = i.sender_id
     where i.status = 'pending'
       and i.expires_at > now()
       and i.expires_at <= now() + make_interval(hours => p_hours)
  loop
    perform queue_email_to(
      v_row.recipient_id, 'invitation_expiring',
      jsonb_build_object('from_name', v_row.sender_name, 'expires_at', v_row.expires_at),
      'inv_warn_' || v_row.id::text
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ------------------------------------------------------ profile reviewed --
create or replace function admin_review_profile(
  p_profile uuid, p_approve boolean, p_reason text default null
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

  perform queue_email_to(
    p_profile,
    case when p_approve then 'profile_approved' else 'profile_rejected' end,
    jsonb_build_object('reason', p_reason),
    case when p_approve then 'prof_ok_' || p_profile::text else null end
  );

  insert into audit_log (actor_id, action, target_type, target_id, payload)
  values (auth.uid(),
          case when p_approve then 'profile.approved' else 'profile.rejected' end,
          'profile', p_profile, jsonb_build_object('reason', p_reason));

  return jsonb_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------- matchmaker note --
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

  if v_pa.review_status  <> 'approved' or v_pb.review_status  <> 'approved' then raise exception 'NOT_APPROVED';  end if;
  if v_pa.pairing_status <> 'unpaired' or v_pb.pairing_status <> 'unpaired' then raise exception 'ALREADY_PAIRED'; end if;
  if v_pa.gender is null or v_pb.gender is null or v_pa.gender = v_pb.gender then raise exception 'SAME_GENDER';  end if;

  update invitations set status = 'voided', responded_at = now()
   where status = 'pending' and sender_id = p_a and recipient_id = p_b;

  v_note := coalesce(nullif(trim(coalesce(p_note, '')), ''),
                     'The FYB committee thinks you two would make a great table.');

  insert into invitations (sender_id, recipient_id, note, source, expires_at)
  values (p_a, p_b, v_note, 'matchmaker',
          now() + make_interval(hours => v_cfg.invite_expiry_hours))
  returning id into v_id;

  -- Both are told, and both are told it came from the committee — so neither
  -- of them is the one who had to ask.
  perform queue_email_to(p_b, 'matchmaker_match',
    jsonb_build_object('other_name', v_pa.first_name, 'note', v_note, 'to_answer', true),
    'mm_b_' || v_id::text);

  perform queue_email_to(p_a, 'matchmaker_match',
    jsonb_build_object('other_name', v_pb.first_name, 'note', v_note, 'to_answer', false),
    'mm_a_' || v_id::text);

  insert into audit_log (actor_id, action, target_type, target_id, payload)
  values (auth.uid(), 'matchmaker.proposed', 'invitation', v_id,
          jsonb_build_object('from', p_a, 'to', p_b));

  return v_id;
end;
$$;

-- ------------------------------------------------------- table assigned --
create or replace function admin_assign_table(p_pair uuid, p_table uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_cap   int;
  v_used  int;
  v_pair  pairs;
  v_label text;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;

  if p_table is null then
    update pairs set table_id = null where id = p_pair and status = 'confirmed';
    if not found then raise exception 'PAIR_NOT_FOUND'; end if;
    return jsonb_build_object('ok', true, 'table_id', null);
  end if;

  select t.capacity, t.label into v_cap, v_label from tables t where t.id = p_table for update;
  if not found then raise exception 'TABLE_UNAVAILABLE'; end if;

  select count(*) * 2 into v_used
    from pairs pr
   where pr.table_id = p_table and pr.status = 'confirmed' and pr.id <> p_pair;

  if v_used + 2 > v_cap then raise exception 'TABLE_FULL'; end if;

  update pairs set table_id = p_table where id = p_pair and status = 'confirmed'
  returning * into v_pair;
  if not found then raise exception 'PAIR_NOT_FOUND'; end if;

  perform queue_email_to(v_pair.user_a_id, 'table_assigned',
    jsonb_build_object('table_label', v_label), 'tbl_' || p_pair::text || '_a_' || p_table::text);
  perform queue_email_to(v_pair.user_b_id, 'table_assigned',
    jsonb_build_object('table_label', v_label), 'tbl_' || p_pair::text || '_b_' || p_table::text);

  insert into audit_log (actor_id, action, target_type, target_id, payload)
  values (auth.uid(), 'table.assigned', 'pair', p_pair, jsonb_build_object('table', p_table));

  return jsonb_build_object('ok', true, 'table_id', p_table);
end;
$$;

-- ------------------------------------------------------ pair dissolved ---
create or replace function admin_dissolve_pair(p_pair uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_pair pairs;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;

  select * into v_pair from pairs where id = p_pair for update;
  if not found                    then raise exception 'PAIR_NOT_FOUND'; end if;
  if v_pair.status <> 'confirmed' then raise exception 'NOT_CONFIRMED';  end if;

  update profiles set pairing_status = 'unpaired', active_pair_id = null
   where id in (v_pair.user_a_id, v_pair.user_b_id);

  delete from passes where pair_id = p_pair;

  update pairs
     set status = 'dissolved', table_id = null,
         dissolved_at = now(), dissolved_reason = p_reason
   where id = p_pair;

  perform queue_email_to(v_pair.user_a_id, 'pair_dissolved',
    jsonb_build_object('reason', p_reason), 'diss_' || p_pair::text || '_a');
  perform queue_email_to(v_pair.user_b_id, 'pair_dissolved',
    jsonb_build_object('reason', p_reason), 'diss_' || p_pair::text || '_b');

  insert into audit_log (actor_id, action, target_type, target_id, payload)
  values (auth.uid(), 'pair.dissolved', 'pair', p_pair, jsonb_build_object('reason', p_reason));

  return jsonb_build_object('ok', true);
end;
$$;

-- ===========================================================================
-- The nudge: everyone still without a date
-- ===========================================================================
-- Deliberately gentle, and deliberately deduped by day so nobody is nagged
-- twice. People who have already asked the committee for help are skipped —
-- they have done the thing we would be nudging them to do.
create or replace function queue_dateless_nudges()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg   event_config;
  v_row   record;
  v_day   text := to_char(now(), 'YYYYMMDD');
  v_count int := 0;
  v_left  int;
  v_days  numeric;
begin
  v_cfg := cfg();
  if not v_cfg.registration_open and not v_cfg.discovery_open then return 0; end if;

  v_days := case
    when v_cfg.pairing_deadline is null then null
    else round(extract(epoch from (v_cfg.pairing_deadline - now())) / 86400.0)
  end;

  -- Stop nudging once the deadline has passed; at that point it is the
  -- committee's job, not theirs.
  if v_days is not null and v_days < 0 then return 0; end if;

  select count(*) into v_left
    from profiles
   where review_status = 'approved' and pairing_status = 'unpaired' and is_blocked = false;

  for v_row in
    select p.id, p.first_name, p.gender, p.seeking_help
      from profiles p
     where p.review_status  = 'approved'
       and p.pairing_status = 'unpaired'
       and p.is_blocked     = false
       and p.email_opt_out  = false
       -- Nobody with a live invitation out is nudged: they are already waiting.
       and not exists (
         select 1 from invitations i
          where i.status = 'pending'
            and (i.sender_id = p.id or i.recipient_id = p.id)
       )
  loop
    perform queue_email_to(
      v_row.id, 'still_looking',
      jsonb_build_object(
        'days_left', v_days,
        'others_looking', greatest(0, v_left - 1),
        'seeking_help', v_row.seeking_help
      ),
      'nudge_' || v_day || '_' || v_row.id::text
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function queue_email(text, text, text, jsonb, text, timestamptz) from anon, authenticated;
revoke all on function queue_email_to(uuid, text, jsonb, text, timestamptz)    from anon, authenticated;
revoke all on function queue_dateless_nudges()                                 from anon, authenticated;
revoke all on function remind_expiring_invitations(int)                        from anon, authenticated;
revoke all on function expire_invitations()                                    from anon, authenticated;
