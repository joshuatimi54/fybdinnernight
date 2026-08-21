#!/usr/bin/env bash
# ===========================================================================
# FYB Dinner Night — concurrency tests
# ===========================================================================
# The single-session suite proves the logic. It cannot prove the locking.
#
# These run genuinely parallel connections that all fire at the same wall-clock
# instant, which is the only way to catch a missing FOR UPDATE. Each scenario
# is repeated, because a race that fails one time in five is still a race.
#
#   bash supabase/test/02_race.sh [container] [rounds]
# ===========================================================================
set -uo pipefail
export MSYS_NO_PATHCONV=1

C="${1:-fyb-test}"
ROUNDS="${2:-5}"
FAILED=0

q()  { docker exec "$C" psql -U postgres -d fyb -tAc "$1" 2>/dev/null; }
qq() { docker exec "$C" psql -U postgres -d fyb -q -c "$1" >/dev/null 2>&1; }

ok()   { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILED=$((FAILED + 1)); }

# Fires `$3` as user `$2` at absolute time `$1`, in its own connection.
at_barrier() {
  local when="$1" uid="$2" sql="$3"
  docker exec "$C" psql -U postgres -d fyb -tAc "
    select set_config('test.uid', '$uid', false);
    select pg_sleep(greatest(0, extract(epoch from (timestamptz '$when' - clock_timestamp()))));
    $sql
  " 2>&1 | tail -1
}

barrier() { q "select (clock_timestamp() + interval '3 seconds')::text"; }

# ---------------------------------------------------------------- fixtures --
reset_world() {
  qq "truncate auth.users cascade; truncate audit_log;"
  qq "update event_config set max_outstanding_invites = 5, max_lifetime_invites = 20;"

  # -i is required: without it docker exec never attaches stdin and the
  # heredoc is silently discarded.
  docker exec -i "$C" psql -U postgres -d fyb -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'm1@t'),
  ('10000000-0000-0000-0000-000000000002', 'm2@t'),
  ('10000000-0000-0000-0000-000000000003', 'm3@t'),
  ('20000000-0000-0000-0000-000000000001', 'w1@t'),
  ('20000000-0000-0000-0000-000000000002', 'w2@t'),
  ('20000000-0000-0000-0000-000000000003', 'w3@t');

update profiles set
  first_name = upper(split_part(email, '@', 1)),
  last_name  = 'Race',
  phone      = '08000000000',
  gender     = (case when email like 'm%' then 'male' else 'female' end)::gender_t,
  review_status = 'approved',
  photo_url  = 'https://example.test/p.jpg';
SQL
}

echo "=============================================================="
echo " Concurrency — $ROUNDS rounds each"
echo "=============================================================="

# ===========================================================================
# A. One person holds three invitations and accepts all three at once.
# ===========================================================================
echo ""
echo "--- A. Three simultaneous accepts by the same recipient ---"

for round in $(seq 1 "$ROUNDS"); do
  reset_world

  for m in 1 2 3; do
    qq "select set_config('test.uid','10000000-0000-0000-0000-00000000000$m',false);
        select send_invitation('20000000-0000-0000-0000-000000000001','From m$m — I would be honoured if you would join me.');"
  done

  ids=$(q "select id from invitations where status='pending' order by created_at")
  [ "$(echo "$ids" | wc -l)" -eq 3 ] || { fail "A$round: setup expected 3 invitations"; continue; }

  B=$(barrier)
  for id in $ids; do
    at_barrier "$B" "20000000-0000-0000-0000-000000000001" \
      "select respond_to_invitation('$id', true) ->> 'accepted';" &
  done
  wait

  pairs=$(q "select count(*) from pairs where status='confirmed'")
  accepted=$(q "select count(*) from invitations where status='accepted'")
  voided=$(q "select count(*) from invitations where status='voided'")
  dupes=$(q "select count(*) from profiles where pairing_status='paired'")

  if [ "$pairs" = "1" ] && [ "$accepted" = "1" ] && [ "$voided" = "2" ] && [ "$dupes" = "2" ]; then
    ok "A$round: exactly one pair, one accept, two voided, two people paired"
  else
    fail "A$round: pairs=$pairs accepted=$accepted voided=$voided paired=$dupes"
  fi
done

# ===========================================================================
# B. Three different women accept the same man at the same instant.
#    This is the dangerous direction: the sender can only end up in one pair.
# ===========================================================================
echo ""
echo "--- B. Three simultaneous accepts of the same sender ---"

for round in $(seq 1 "$ROUNDS"); do
  reset_world

  for w in 1 2 3; do
    qq "select set_config('test.uid','10000000-0000-0000-0000-000000000001',false);
        select send_invitation('20000000-0000-0000-0000-00000000000$w','Pick me — I promise the best conversation in the room.');"
  done

  [ "$(q "select count(*) from invitations where status='pending'")" = "3" ] \
    || { fail "B$round: setup expected 3 invitations"; continue; }

  B=$(barrier)
  for w in 1 2 3; do
    id=$(q "select id from invitations where recipient_id='20000000-0000-0000-0000-00000000000$w' and status='pending'")
    at_barrier "$B" "20000000-0000-0000-0000-00000000000$w" \
      "select respond_to_invitation('$id', true) ->> 'accepted';" &
  done
  wait

  pairs=$(q "select count(*) from pairs where status='confirmed'")
  m1pairs=$(q "select count(*) from pairs where status='confirmed' and (user_a_id='10000000-0000-0000-0000-000000000001' or user_b_id='10000000-0000-0000-0000-000000000001')")
  paired=$(q "select count(*) from profiles where pairing_status='paired'")

  if [ "$pairs" = "1" ] && [ "$m1pairs" = "1" ] && [ "$paired" = "2" ]; then
    ok "B$round: the sender ended up in exactly one pair"
  else
    fail "B$round: pairs=$pairs sendersPairs=$m1pairs paired=$paired"
  fi
done

# ===========================================================================
# C. Two pairs claim the last two seats at the same table simultaneously.
# ===========================================================================
echo ""
echo "--- C. Two simultaneous claims on the last two seats ---"

for round in $(seq 1 "$ROUNDS"); do
  reset_world
  qq "delete from tables; insert into tables (label, capacity, sort_order) values ('Last Table', 2, 1);"

  # Pair m1+w1 and m2+w2 up front.
  for i in 1 2; do
    qq "select set_config('test.uid','10000000-0000-0000-0000-00000000000$i',false);
        select send_invitation('20000000-0000-0000-0000-00000000000$i','Hi there — please be my date for the dinner night.');"
    id=$(q "select id from invitations where recipient_id='20000000-0000-0000-0000-00000000000$i' and status='pending'")
    qq "select set_config('test.uid','20000000-0000-0000-0000-00000000000$i',false);
        select respond_to_invitation('$id', true);"
  done

  [ "$(q "select count(*) from pairs where status='confirmed'")" = "2" ] \
    || { fail "C$round: setup expected 2 pairs"; continue; }

  tid=$(q "select id from tables where label='Last Table'")

  B=$(barrier)
  for i in 1 2; do
    at_barrier "$B" "20000000-0000-0000-0000-00000000000$i" \
      "select claim_table('$tid') ->> 'ok';" &
  done
  wait

  seated=$(q "select count(*) from pairs where table_id='$tid' and status='confirmed'")
  overfull=$(q "select count(*) from tables t where (select count(*)*2 from pairs p where p.table_id=t.id and p.status='confirmed') > t.capacity")

  if [ "$seated" = "1" ] && [ "$overfull" = "0" ]; then
    ok "C$round: exactly one pair got the last two seats"
  else
    fail "C$round: seated=$seated overCapacityTables=$overfull"
  fi
done

# ===========================================================================
# D. Two people invite each other at the same instant — the deadlock case
#    the ordered locking in send_invitation() exists to prevent.
# ===========================================================================
echo ""
echo "--- D. Simultaneous invitations in opposite directions ---"

for round in $(seq 1 "$ROUNDS"); do
  reset_world

  B=$(barrier)
  at_barrier "$B" "10000000-0000-0000-0000-000000000001" \
    "select send_invitation('20000000-0000-0000-0000-000000000001','Would you be my date? I would really love your company.') is not null;" &
  at_barrier "$B" "20000000-0000-0000-0000-000000000001" \
    "select send_invitation('10000000-0000-0000-0000-000000000001','No — you be mine. I asked first, and I mean it sincerely.') is not null;" &
  wait

  sent=$(q "select count(*) from invitations")
  deadlocks=$(q "select count(*) from invitations where status='pending'")

  if [ "$sent" = "2" ] && [ "$deadlocks" = "2" ]; then
    ok "D$round: both invitations landed, no deadlock"
  else
    fail "D$round: invitations=$sent pending=$deadlocks"
  fi
done

# --------------------------------------------------------------- teardown --
qq "update event_config set max_outstanding_invites = 1, max_lifetime_invites = 5;"

echo ""
echo "=============================================================="
if [ "$FAILED" -eq 0 ]; then
  echo " ALL CONCURRENCY TESTS PASSED"
else
  echo " $FAILED CONCURRENCY TEST(S) FAILED"
fi
echo "=============================================================="
exit "$FAILED"
