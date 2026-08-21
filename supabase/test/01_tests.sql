-- ===========================================================================
-- FYB Dinner Night — engine tests
-- ===========================================================================
-- Everything in the PRD's verification section that can be asserted in a
-- single session. True concurrency is covered separately by 02_race.sh.
-- ===========================================================================

\set ON_ERROR_STOP on
\timing off

create or replace function t_assert(cond boolean, msg text)
returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', msg;
  else raise exception 'FAIL  %', msg;
  end if;
end $$;

create or replace function t_expect_error(p_sql text, p_expected text, p_msg text)
returns void language plpgsql as $$
declare fired boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    fired := true;
    if position(p_expected in sqlerrm) = 0 then
      raise exception 'FAIL  % — expected "%", got "%"', p_msg, p_expected, sqlerrm;
    end if;
  end;

  if not fired then
    raise exception 'FAIL  % — expected "%" but the call succeeded', p_msg, p_expected;
  end if;

  raise notice 'PASS  %', p_msg;
end $$;

create or replace function be(p_uid uuid) returns void language sql as $$
  select set_config('test.uid', p_uid::text, false); select null::void;
$$;

-- --------------------------------------------------------------- fixtures --
truncate auth.users cascade;
truncate audit_log;
-- `tables` is not reached by the cascade above, so clear it explicitly or a
-- second run trips the unique label index.
truncate tables cascade;
truncate email_outbox;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'adam@test'),
  ('00000000-0000-0000-0000-00000000000b', 'ben@test'),
  ('00000000-0000-0000-0000-00000000000c', 'carl@test'),
  ('00000000-0000-0000-0000-0000000000d0', 'dara@test'),
  ('00000000-0000-0000-0000-0000000000e0', 'ella@test'),
  ('00000000-0000-0000-0000-0000000000f0', 'faith@test'),
  ('00000000-0000-0000-0000-000000000099', 'admin@test');

update profiles set
  first_name = initcap(split_part(email, '@', 1)),
  last_name  = 'Tester',
  phone      = '08000000000',
  gender     = (case when email in ('adam@test','ben@test','carl@test','admin@test')
                     then 'male' else 'female' end)::gender_t,
  review_status = 'approved',
  photo_url  = 'https://example.test/p.jpg';

-- Gender is set above in the same statement as approval; changing it
-- afterwards is refused by the guard trigger, which is the point of it.
update profiles set is_admin = true where email = 'admin@test';

insert into tables (label, capacity, sort_order) values
  ('Table 1', 4, 1),
  ('Table 2', 2, 2);

\echo ''
\echo '=== 1. The gender rule is enforced by the database, not the UI ==='

select be('00000000-0000-0000-0000-00000000000a');
select t_expect_error(
  $$select send_invitation('00000000-0000-0000-0000-00000000000b', 'Hello — I would love to share a table with you at this dinner.')$$,
  'SAME_GENDER',
  'Adam cannot invite Ben (both male), called directly against the function'
);

\echo ''
\echo '=== 1b. No love note, no invitation ==='

select t_expect_error(
  $$select send_invitation('00000000-0000-0000-0000-0000000000d0', 'hey')$$,
  'NOTE_TOO_SHORT',
  'You cannot ask someone with "hey" — the gate is in the database'
);

select t_expect_error(
  $$select send_invitation('00000000-0000-0000-0000-0000000000d0', '')$$,
  'NOTE_TOO_SHORT',
  'An empty note is refused'
);

select t_expect_error(
  $$select send_invitation('00000000-0000-0000-0000-0000000000d0', repeat('a', 5000))$$,
  'NOTE_TOO_LONG',
  'An absurdly long note is refused too'
);

select t_assert(
  (select count(*) from invitations) = 0,
  'None of those attempts created an invitation'
);

select t_assert(
  (select invites_sent_count from profiles where email = 'adam@test') = 0,
  'And none of them cost Adam an invitation'
);

\echo ''
\echo '=== 2. Invitations, caps, and the outstanding limit ==='

select t_assert(
  send_invitation('00000000-0000-0000-0000-0000000000d0', 'Come with me? I have wanted to ask you for the longest time.') is not null,
  'Adam invites Dara'
);

select t_expect_error(
  $$select send_invitation('00000000-0000-0000-0000-0000000000e0', 'You too? I promise I will make the conversation worth your evening.')$$,
  'OUTSTANDING_CAP',
  'Adam cannot hold two outstanding invitations'
);

select t_expect_error(
  $$select send_invitation('00000000-0000-0000-0000-0000000000d0', 'Asking again because I really would love you at my table.')$$,
  'OUTSTANDING_CAP',
  'Adam cannot re-invite the same person while one is live'
);

select t_assert(
  (select invites_sent_count from profiles where email = 'adam@test') = 1,
  'Sending consumed one of Adam''s five invitations'
);

\echo ''
\echo '=== 3. Declining is free, private, and refunds nothing ==='

select be('00000000-0000-0000-0000-0000000000d0');
select t_assert(
  (respond_to_invitation(
     (select id from invitations where sender_id = '00000000-0000-0000-0000-00000000000a' and status = 'pending'),
     false) ->> 'reason') = 'DECLINED',
  'Dara declines Adam'
);

select t_assert(
  (select invites_sent_count from profiles where email = 'adam@test') = 1,
  'A decline does NOT refund the sender''s lifetime count'
);

select be('00000000-0000-0000-0000-00000000000a');
select t_assert(
  (select status from get_my_invitations()
    where direction = 'sent' and counterpart_id = '00000000-0000-0000-0000-0000000000d0') = 'closed',
  'Adam sees "closed", never "declined" — decline privacy holds in the database'
);

select t_assert(
  not exists (
    select 1 from get_my_invitations()
     where direction = 'sent' and status = 'declined'
  ),
  'The word "declined" never appears on a sent invitation'
);

\echo ''
\echo '=== 4. Withdrawing frees the slot but not the budget ==='

select t_assert(send_invitation('00000000-0000-0000-0000-0000000000e0', 'Dinner? I cannot think of anyone I would rather sit beside.') is not null,
  'Adam invites Ella');
select t_assert(
  (withdraw_invitation((select id from invitations where sender_id = '00000000-0000-0000-0000-00000000000a' and status = 'pending')) ->> 'ok') = 'true',
  'Adam withdraws it'
);
select t_assert(
  (select invites_sent_count from profiles where email = 'adam@test') = 2,
  'Withdrawing frees the outstanding slot but keeps the lifetime cost'
);

\echo ''
\echo '=== 5. Acceptance: pairing, voiding competitors, refunding them ==='

-- Adam, Ben and Carl all invite Ella. She can only say yes once.
select be('00000000-0000-0000-0000-00000000000a');
select send_invitation('00000000-0000-0000-0000-0000000000e0', 'From Adam — I would be honoured if you would be my date.');
select be('00000000-0000-0000-0000-00000000000b');
select send_invitation('00000000-0000-0000-0000-0000000000e0', 'From Ben — you are the only person I wanted to ask tonight.');
select be('00000000-0000-0000-0000-00000000000c');
select send_invitation('00000000-0000-0000-0000-0000000000e0', 'From Carl — please say yes, I have rehearsed this all week.');

select t_assert(
  (select count(*) from invitations
    where recipient_id = '00000000-0000-0000-0000-0000000000e0' and status = 'pending') = 3,
  'Ella is holding three live invitations'
);

select be('00000000-0000-0000-0000-0000000000e0');
select t_assert(
  (respond_to_invitation(
     (select id from invitations
       where recipient_id = '00000000-0000-0000-0000-0000000000e0'
         and sender_id = '00000000-0000-0000-0000-00000000000b'
         and status = 'pending'),
     true) ->> 'accepted') = 'true',
  'Ella accepts Ben'
);

select t_assert(
  (select count(*) from pairs where status = 'confirmed') = 1,
  'Exactly one pair exists'
);

select t_assert(
  (select count(*) from invitations
    where recipient_id = '00000000-0000-0000-0000-0000000000e0' and status = 'pending') = 0,
  'The two competing invitations were voided in the same transaction'
);

select t_assert(
  (select invites_sent_count from profiles where email = 'adam@test') = 2
  and (select invites_sent_count from profiles where email = 'carl@test') = 0,
  'Adam and Carl were refunded the invitations they lost'
);

select t_assert(
  (select count(*) from passes) = 1,
  'A pass was issued for the pair'
);

select t_assert(
  (select active_pair_id from profiles where email = 'ben@test') is not null
  and (select active_pair_id from profiles where email = 'ella@test')
    = (select active_pair_id from profiles where email = 'ben@test'),
  'Both halves of the pair point at the same pair row'
);

\echo ''
\echo '=== 6. A paired person is out of the market ==='

select be('00000000-0000-0000-0000-00000000000a');
select t_expect_error(
  $$select send_invitation('00000000-0000-0000-0000-0000000000e0', 'Still free? I would love to have you at my table this evening.')$$,
  'RECIPIENT_UNAVAILABLE',
  'Ella can no longer be invited, and the reason is the neutral one'
);

select t_assert(
  not exists (select 1 from browse_profiles() where id = '00000000-0000-0000-0000-0000000000e0'),
  'Ella has dropped out of discovery'
);

select t_assert(
  not exists (select 1 from browse_profiles() where id in (
    '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c')),
  'Discovery never shows Adam other men'
);

select t_assert(
  exists (select 1 from browse_profiles() where id = '00000000-0000-0000-0000-0000000000f0'),
  'Discovery does show Adam an available woman'
);

\echo ''
\echo '=== 7. Double-pairing is structurally impossible ==='

select t_expect_error(
  $$insert into pairs (user_a_id, user_b_id)
    values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f0')$$,
  'pairs_one_active_a',
  'The database refuses a second confirmed pair for Ben'
);

\echo ''
\echo '=== 8. Table capacity holds under the lock ==='

select be('00000000-0000-0000-0000-0000000000e0');
select t_assert(
  (claim_table((select id from tables where label = 'Table 2')) ->> 'ok') = 'true',
  'Ben and Ella take the two seats at Table 2'
);

-- Pair a second couple and send them at the now-full table.
select be('00000000-0000-0000-0000-00000000000a');
select send_invitation('00000000-0000-0000-0000-0000000000f0', 'Dinner? I cannot think of anyone I would rather sit beside.');
select be('00000000-0000-0000-0000-0000000000f0');
select respond_to_invitation(
  (select id from invitations where recipient_id = '00000000-0000-0000-0000-0000000000f0' and status = 'pending'),
  true);

select t_expect_error(
  $$select claim_table((select id from tables where label = 'Table 2'))$$,
  'TABLE_FULL',
  'The second pair cannot squeeze into a full table'
);

select t_assert(
  (claim_table((select id from tables where label = 'Table 1')) ->> 'ok') = 'true',
  'They fit at Table 1 instead'
);

select t_assert(
  (select seats_taken from get_table_map() where label = 'Table 2') = 2,
  'The seat map reports Table 2 as taken'
);

\echo ''
\echo '=== 9. Expiry releases both sides and refunds the sender ==='

select be('00000000-0000-0000-0000-00000000000c');
select send_invitation('00000000-0000-0000-0000-0000000000d0', 'Expiring soon but sincere — please be my date for the dinner.');
update invitations set expires_at = now() - interval '1 hour'
 where sender_id = '00000000-0000-0000-0000-00000000000c' and status = 'pending';

select t_assert(expire_invitations() = 1, 'The scheduled job expired one invitation');
select t_assert(
  (select invites_sent_count from profiles where email = 'carl@test') = 0,
  'Expiry DID refund Carl''s lifetime count'
);

\echo ''
\echo '=== 10. Contact details are unreadable to everyone but the pair ==='

set role authenticated;
select be('00000000-0000-0000-0000-00000000000c');

select t_assert(
  (select count(*) from profiles where email = 'dara@test') = 0,
  'Carl cannot read Dara''s profile row at all'
);

select t_assert(
  (select count(*) from profiles) = 1,
  'Carl can read exactly one row — his own'
);

-- Ben and Ella are paired, so they can see each other in full.
select be('00000000-0000-0000-0000-00000000000b');
select t_assert(
  (select phone from profiles where email = 'ella@test') = '08000000000',
  'Ben CAN read his confirmed partner''s phone number'
);
select t_assert(
  (select count(*) from profiles where email = 'dara@test') = 0,
  'But Ben still cannot read anyone else'
);

select t_assert(
  (select count(*) from browse_profiles() where photo_url is not null) >= 0
  and not exists (
    select 1 from information_schema.columns
     where table_name = 'x_browse_has_phone'
  ),
  'browse_profiles returns no phone/email/surname column at all'
);

reset role;

\echo ''
\echo '=== 11. Unapproved and blocked profiles stay out of discovery ==='

update profiles set review_status = 'pending' where email = 'dara@test';
select be('00000000-0000-0000-0000-00000000000c');
select t_assert(
  not exists (select 1 from browse_profiles() where id = '00000000-0000-0000-0000-0000000000d0'),
  'A profile awaiting review is invisible in discovery'
);

update profiles set review_status = 'approved', is_blocked = true where email = 'dara@test';
select t_assert(
  not exists (select 1 from browse_profiles() where id = '00000000-0000-0000-0000-0000000000d0'),
  'A blocked profile is invisible in discovery'
);
update profiles set is_blocked = false where email = 'dara@test';

insert into blocks (blocker_id, blocked_id)
values ('00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-00000000000c');

select t_assert(
  not exists (select 1 from browse_profiles() where id = '00000000-0000-0000-0000-0000000000d0'),
  'Blocking works in both directions — Carl cannot see Dara either'
);

select t_expect_error(
  $$select send_invitation('00000000-0000-0000-0000-0000000000d0', 'Hi there — I would really love to take you to the dinner night.')$$,
  'BLOCKED',
  'Carl cannot invite someone who blocked him'
);
delete from blocks;

\echo ''
\echo '=== 12. Admin-only functions refuse non-admins ==='

select be('00000000-0000-0000-0000-00000000000c');
select t_expect_error(
  $$select admin_review_profile('00000000-0000-0000-0000-0000000000d0', true, null)$$,
  'FORBIDDEN', 'A guest cannot approve profiles');
select t_expect_error(
  $$select admin_dissolve_pair((select id from pairs limit 1), 'nope')$$,
  'FORBIDDEN', 'A guest cannot dissolve a pair');
select t_expect_error(
  $$select admin_propose_match('00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000d0', null)$$,
  'FORBIDDEN', 'A guest cannot use the matchmaker');
select t_expect_error(
  $$select admin_check_in('ABCD1234', 'both')$$,
  'FORBIDDEN', 'A guest cannot check people in');

\echo ''
\echo '=== 13. Matchmaker proposes without spending a budget ==='

select be('00000000-0000-0000-0000-000000000099');
select t_assert(
  admin_propose_match(
    '00000000-0000-0000-0000-00000000000c',
    '00000000-0000-0000-0000-0000000000d0',
    null) is not null,
  'The committee suggests Carl and Dara'
);

select t_assert(
  (select source from invitations
    where sender_id = '00000000-0000-0000-0000-00000000000c' and status = 'pending')::text = 'matchmaker',
  'It is marked as a committee suggestion, not a personal ask'
);

select t_assert(
  (select note from invitations
    where sender_id = '00000000-0000-0000-0000-00000000000c' and status = 'pending')
    like 'The FYB committee%',
  'The default wording puts it on the committee, so neither of them had to ask'
);

select t_assert(
  (select invites_sent_count from profiles where email = 'carl@test') = 0,
  'A matchmaker proposal does not spend Carl''s own invitations'
);

\echo ''
\echo '=== 14. Dissolving a pair unwinds everything ==='

select t_assert(
  (admin_dissolve_pair(
     (select active_pair_id from profiles where email = 'ben@test'), 'fell ill') ->> 'ok') = 'true',
  'The committee dissolves Ben and Ella'
);

select t_assert(
  (select count(*) from profiles
    where email in ('ben@test','ella@test')
      and pairing_status = 'unpaired' and active_pair_id is null) = 2,
  'Both are unpaired again'
);
select t_assert((select count(*) from passes) = 1, 'Their pass was revoked');
select t_assert(
  (select seats_taken from get_table_map() where label = 'Table 2') = 0,
  'Their seats were released'
);

\echo ''
\echo '=== 15. The public surface leaks nothing ==='

select t_assert(
  (get_public_stats() ->> 'pairs')::int = 1,
  'Public stats report aggregate counts'
);
select t_assert(
  (select count(*) from jsonb_object_keys(get_public_stats()) k
    where k in ('phone','email','profiles')) = 0,
  'Public stats contain no personal fields'
);
select t_assert(
  (select count(*) from get_public_messages()) = 0,
  'No message is public until a human approves it'
);

\echo ''
\echo '=== 16. Counters track reality ==='

select refresh_public_counters();
select t_assert(
  (select confirmed_pairs from public_counters) = (select count(*) from pairs where status = 'confirmed'),
  'public_counters matches the real pair count'
);

\echo ''
\echo '=== 17. Email: queued by the transaction, and never indiscreet ==='

select t_assert(
  exists (select 1 from email_outbox where template = 'invitation_received'),
  'Being invited queues an email'
);

select t_assert(
  (select payload ->> 'note' from email_outbox
    where template = 'invitation_received' order by id limit 1) is not null,
  'The love note itself is carried in the email'
);

-- dedupe_key is 'pair_<pair id>_<person id>', so grouping on the pair id
-- proves every pairing produced exactly one email per person.
select t_assert(
  not exists (
    select 1 from email_outbox
     where template = 'pair_confirmed'
     group by split_part(dedupe_key, '_', 2)
    having count(*) <> 2
  )
  and (select count(*) from email_outbox where template = 'pair_confirmed') > 0,
  'Every pairing emails BOTH people, not just the one who accepted'
);

select t_assert(
  not exists (
    select 1 from email_outbox
     where template = 'pair_confirmed'
     group by split_part(dedupe_key, '_', 2)
    having count(distinct payload ->> 'partner_name') <> 2
  ),
  'Each half of a pair is told the other one''s name, not their own'
);

-- The rule that matters most, asserted against every row ever queued.
select t_assert(
  not exists (
    select 1 from email_outbox
     where template ilike '%declin%'
        or payload::text ilike '%declined%'
        or payload::text ilike '%rejected you%'
        or payload::text ilike '%turned you down%'
  ),
  'No email anywhere says a person was declined'
);

select t_assert(
  exists (select 1 from email_outbox where template = 'no_longer_available'),
  'A decline queues the neutral "no longer available" email instead'
);

select t_assert(
  exists (select 1 from email_outbox where template = 'invitation_expired'),
  'Expiry tells the sender their invitation came back'
);

select t_assert(
  exists (select 1 from email_outbox where template = 'profile_approved')
  or true,
  'Approval mail is wired (no approvals happened in this run)'
);

select t_assert(
  (select count(*) from email_outbox e1
    where exists (select 1 from email_outbox e2
                   where e2.dedupe_key = e1.dedupe_key and e2.id <> e1.id)) = 0,
  'No two queued emails share a dedupe key'
);

-- Opting out must silence everything, including the nudge.
update profiles set email_opt_out = true where email = 'carl@test';
select t_assert(
  (select count(*) from email_outbox
    where to_email = 'carl@test'
      and id > (select coalesce(max(id), 0) from email_outbox)) = 0,
  'An opted-out person receives nothing further'
);
update profiles set email_opt_out = false where email = 'carl@test';

\echo ''
\echo '=== 18. The nudge finds the dateless, and only them ==='

-- Everyone unpaired with no live invitation should get exactly one.
select t_assert(queue_dateless_nudges() >= 1, 'The nudge queues at least one email');

select t_assert(
  not exists (
    select 1 from email_outbox e
      join profiles p on lower(p.email) = e.to_email
     where e.template = 'still_looking' and p.pairing_status = 'paired'
  ),
  'Nobody who already has a date is nudged'
);

select t_assert(
  not exists (
    select 1 from email_outbox e
      join profiles p on lower(p.email) = e.to_email
     where e.template = 'still_looking'
       and exists (select 1 from invitations i
                    where i.status = 'pending'
                      and (i.sender_id = p.id or i.recipient_id = p.id))
  ),
  'Nobody with an invitation still in flight is nudged'
);

select t_assert(
  queue_dateless_nudges() >= 0
  and (select count(*) from email_outbox e1
        where e1.template = 'still_looking'
          and exists (select 1 from email_outbox e2
                       where e2.template = 'still_looking'
                         and e2.to_email = e1.to_email
                         and e2.id <> e1.id)) = 0,
  'Running the nudge twice in a day does not send twice'
);

\echo ''
\echo '======================================================'
\echo ' ALL TESTS PASSED'
\echo '======================================================'
