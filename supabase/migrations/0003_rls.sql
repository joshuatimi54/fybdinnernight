-- ===========================================================================
-- FYB Dinner Night — row level security
-- ===========================================================================
-- Shape of access:
--   * you read your own profile in full
--   * you read your confirmed partner in full (contact details unlock only
--     at pairing, and only for the two of them)
--   * everyone else reaches you through browse_profiles(), which strips
--     surname, phone and email before the row ever leaves the database
--   * admins see everything, and every admin action is written to audit_log
-- ===========================================================================

alter table profiles      enable row level security;
alter table invitations   enable row level security;
alter table pairs         enable row level security;
alter table passes        enable row level security;
alter table date_messages enable row level security;
alter table tables        enable row level security;
alter table reports       enable row level security;
alter table blocks        enable row level security;
alter table event_config  enable row level security;
alter table audit_log     enable row level security;

-- ------------------------------------------------------------- profiles --
-- A policy on `profiles` must never read `profiles` directly — that recurses
-- forever. SECURITY DEFINER runs as the table owner, which bypasses RLS and
-- breaks the cycle. Same reason is_admin() is defined the way it is.
create or replace function my_active_pair_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select p.active_pair_id from profiles p where p.id = auth.uid();
$$;

create policy profiles_select_self on profiles
  for select using (id = auth.uid());

-- Your partner, and only once the pair is actually confirmed. This is the
-- single moment contact details become visible to anyone.
create policy profiles_select_partner on profiles
  for select using (
    exists (
      select 1 from pairs pr
       where pr.id = my_active_pair_id()
         and pr.status = 'confirmed'
         and profiles.id in (pr.user_a_id, pr.user_b_id)
    )
  );

create policy profiles_select_admin on profiles
  for select using (is_admin());

create policy profiles_update_self on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_update_admin on profiles
  for update using (is_admin()) with check (is_admin());

-- RLS cannot restrict columns, so the fields a person must never set on
-- themselves -- review_status, is_admin, the invitation counters, pairing
-- state -- are withheld at the grant level instead. The SECURITY DEFINER
-- functions run as the table owner and are unaffected.
revoke update on profiles from authenticated;
grant  update (first_name, last_name, gender, phone, photo_url, bio,
               prompts, department, level, seeking_help)
  on profiles to authenticated;

-- Gender cannot change after approval: it decides who sees whom, and the
-- committee approved the profile as reviewed.
create or replace function guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() then
    return new;
  end if;

  if old.review_status = 'approved'
     and new.gender is distinct from old.gender then
    raise exception 'GENDER_LOCKED';
  end if;

  -- A new photo goes back through moderation, unless the person is already
  -- paired and therefore already in the room.
  if old.review_status = 'approved'
     and old.pairing_status = 'unpaired'
     and new.photo_url is distinct from old.photo_url then
    new.review_status := 'pending';
  end if;

  return new;
end;
$$;

create trigger profiles_guard before update on profiles
  for each row execute function guard_profile_update();

-- ---------------------------------------------------------- invitations --
-- Read only. Every write goes through send / respond / withdraw so the caps
-- and the pairing transaction can never be side-stepped.
create policy invitations_select_mine on invitations
  for select using (sender_id = auth.uid() or recipient_id = auth.uid());

create policy invitations_select_admin on invitations
  for select using (is_admin());

revoke insert, update, delete on invitations from authenticated, anon;

-- --------------------------------------------------------------- pairs ---
create policy pairs_select_mine on pairs
  for select using (user_a_id = auth.uid() or user_b_id = auth.uid());

create policy pairs_select_admin on pairs
  for select using (is_admin());

revoke insert, update, delete on pairs from authenticated, anon;

-- -------------------------------------------------------------- passes ---
create policy passes_select_mine on passes
  for select using (
    exists (
      select 1 from pairs pr
       where pr.id = passes.pair_id
         and (pr.user_a_id = auth.uid() or pr.user_b_id = auth.uid())
    )
  );

create policy passes_select_admin on passes
  for select using (is_admin());

revoke insert, update, delete on passes from authenticated, anon;

-- ------------------------------------------------------- date_messages ---
-- The only free-text channel between two people in the whole product.
create policy date_messages_select_pair on date_messages
  for select using (
    exists (
      select 1 from pairs pr
       where pr.id = date_messages.pair_id
         and pr.status = 'confirmed'
         and (pr.user_a_id = auth.uid() or pr.user_b_id = auth.uid())
    )
  );

create policy date_messages_select_admin on date_messages
  for select using (is_admin());

create policy date_messages_insert_own on date_messages
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from pairs pr
       where pr.id = date_messages.pair_id
         and pr.status = 'confirmed'
         and (pr.user_a_id = auth.uid() or pr.user_b_id = auth.uid())
    )
  );

create policy date_messages_update_own on date_messages
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy date_messages_admin_all on date_messages
  for all using (is_admin()) with check (is_admin());

-- Authors may write and revise their own note and toggle consent, but the
-- moderation verdict is the committee's alone.
revoke update on date_messages from authenticated;
grant  update (body, share_consent, anonymise) on date_messages to authenticated;

-- -------------------------------------------------------------- tables ---
create policy tables_select_all on tables
  for select to authenticated using (true);

create policy tables_admin_all on tables
  for all using (is_admin()) with check (is_admin());

revoke insert, update, delete on tables from anon;

-- ------------------------------------------------------------- reports ---
create policy reports_insert_own on reports
  for insert with check (reporter_id = auth.uid());

create policy reports_select_own on reports
  for select using (reporter_id = auth.uid());

create policy reports_admin_all on reports
  for all using (is_admin()) with check (is_admin());

-- -------------------------------------------------------------- blocks ---
create policy blocks_own_all on blocks
  for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy blocks_admin_select on blocks
  for select using (is_admin());

-- -------------------------------------------------------- event_config ---
-- No secrets live here, and the app needs the toggles to render correctly.
create policy event_config_select_all on event_config
  for select to anon, authenticated using (true);

create policy event_config_admin_update on event_config
  for update using (is_admin()) with check (is_admin());

revoke insert, update, delete on event_config from anon, authenticated;
grant  update on event_config to authenticated;

-- ----------------------------------------------------------- audit_log ---
create policy audit_log_admin_select on audit_log
  for select using (is_admin());

revoke insert, update, delete on audit_log from authenticated, anon;

-- Realtime is set up in 0004 against a dedicated counters table, so that
-- nothing carrying profile ids is ever published to the browser.
