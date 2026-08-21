-- ===========================================================================
-- FYB Dinner Night — the love note becomes the gate
-- ===========================================================================
-- You cannot ask someone to this dinner without writing them something real
-- first. The note was already required; this makes it substantial — a real
-- minimum length, enforced in the database, and room to actually write.
--
-- It is the mechanic that makes the whole thing feel like being asked rather
-- than being added to a list, so it belongs in the schema, not in a form.
-- ===========================================================================

alter table event_config
  add column if not exists min_love_note_length int not null default 40
    check (min_love_note_length between 0 and 400),
  add column if not exists max_love_note_length int not null default 500
    check (max_love_note_length between 50 and 2000),
  -- The public "who's coming" wall shows first names and photos only. The
  -- committee can switch it off if it ever feels like too much exposure.
  add column if not exists show_guest_wall boolean not null default true;

alter table invitations drop constraint if exists invitations_note_check;
alter table invitations
  add constraint invitations_note_check
  check (char_length(note) between 1 and 2000);

-- ---------------------------------------------------------------------------
-- send_invitation, with the love note enforced
-- ---------------------------------------------------------------------------
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

  -- No love note, no invitation.
  p_note := trim(coalesce(p_note, ''));
  if char_length(p_note) < v_cfg.min_love_note_length then raise exception 'NOTE_TOO_SHORT'; end if;
  if char_length(p_note) > v_cfg.max_love_note_length then raise exception 'NOTE_TOO_LONG';  end if;

  perform 1 from profiles where id = least(v_me, p_recipient)    for update;
  perform 1 from profiles where id = greatest(v_me, p_recipient) for update;

  select * into v_s from profiles where id = v_me;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  select * into v_r from profiles where id = p_recipient;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  if v_s.is_blocked or v_r.is_blocked            then raise exception 'BLOCKED';               end if;
  if v_s.review_status  <> 'approved'            then raise exception 'SENDER_NOT_APPROVED';   end if;
  if v_r.review_status  <> 'approved'            then raise exception 'RECIPIENT_UNAVAILABLE'; end if;
  if v_s.pairing_status <> 'unpaired'            then raise exception 'SENDER_PAIRED';         end if;
  if v_r.pairing_status <> 'unpaired'            then raise exception 'RECIPIENT_UNAVAILABLE'; end if;
  if v_s.gender is null or v_r.gender is null    then raise exception 'GENDER_MISSING';        end if;
  if v_s.gender = v_r.gender                     then raise exception 'SAME_GENDER';           end if;

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

-- ---------------------------------------------------------------------------
-- The public guest wall — first names and faces, nothing else
-- ---------------------------------------------------------------------------
create or replace function get_public_guests(p_limit int default 18)
returns table (
  first_name text,
  photo_url  text,
  paired     boolean
)
language sql stable security definer set search_path = public
as $$
  select p.first_name,
         p.photo_url,
         p.pairing_status = 'paired'
    from profiles p, event_config c
   where c.id
     and c.show_guest_wall
     and p.review_status = 'approved'
     and p.is_blocked = false
   order by p.created_at desc
   limit least(greatest(coalesce(p_limit, 18), 1), 60);
$$;

-- ---------------------------------------------------------------------------
-- Public love notes — consented and human-approved only, as before
-- ---------------------------------------------------------------------------
create or replace function get_public_love_notes(p_limit int default 20)
returns table (
  id         uuid,
  body       text,
  author     text,
  partner    text,
  created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select m.id,
         m.body,
         case when m.anonymise then 'Anonymous' else a.first_name end,
         case when m.anonymise then null
              else (case when pr.user_a_id = a.id then b2.first_name else a2.first_name end)
         end,
         m.created_at
    from date_messages m
    join profiles a  on a.id  = m.author_id
    join pairs    pr on pr.id = m.pair_id
    join profiles a2 on a2.id = pr.user_a_id
    join profiles b2 on b2.id = pr.user_b_id
   where m.share_consent = true
     and m.moderation_status = 'approved'
     and pr.status = 'confirmed'
   order by m.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 60);
$$;

revoke all on function send_invitation(uuid, text) from anon;
