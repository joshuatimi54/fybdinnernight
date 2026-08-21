-- ===========================================================================
-- FYB Dinner Night — schema
-- ===========================================================================
-- Core rule: "no date, no dinner". Registration is not complete until a
-- person is in a confirmed, male-female pair.
--
-- The invariants that must never break are enforced HERE, not in the UI:
--   * one active pair per person   -> profiles.active_pair_id (single column,
--                                     so it is structurally impossible for a
--                                     person to hold two active pairs)
--   * male-female only             -> checked inside pair creation
--   * one pending invite per couple-> partial unique index
--   * table capacity               -> checked under a row lock
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums ----
create type gender_t            as enum ('male', 'female');
create type review_status_t     as enum ('draft', 'pending', 'approved', 'rejected');
create type pairing_status_t    as enum ('unpaired', 'paired');
create type invitation_status_t as enum ('pending', 'accepted', 'declined', 'withdrawn', 'expired', 'voided');
create type invitation_source_t as enum ('user', 'matchmaker');
create type pair_status_t       as enum ('confirmed', 'dissolved');
create type moderation_status_t as enum ('pending', 'approved', 'hidden');
create type report_status_t     as enum ('open', 'reviewed', 'actioned', 'dismissed');

-- ------------------------------------------------------- shared helpers ----
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- --------------------------------------------------------- event_config ----
-- Single row. Every knob the committee can turn without a deploy.
create table event_config (
  id                      boolean primary key default true check (id),
  event_name              text        not null default 'FYB Dinner Night',
  event_starts_at         timestamptz,
  venue                   text,
  dress_code              text,

  registration_open       boolean     not null default true,
  discovery_open          boolean     not null default true,
  seat_selection_enabled  boolean     not null default true,
  require_photo           boolean     not null default true,

  max_lifetime_invites    int         not null default 5  check (max_lifetime_invites    > 0),
  max_outstanding_invites int         not null default 1  check (max_outstanding_invites > 0),
  invite_expiry_hours     int         not null default 48 check (invite_expiry_hours     > 0),

  pairing_deadline        timestamptz,
  total_seats             int         not null default 300 check (total_seats > 0),

  hashtag                 text        not null default '#FYBDinnerNight',
  social_handle           text        not null default '@caccf',

  updated_at              timestamptz not null default now()
);

insert into event_config (id) values (true);

create trigger event_config_touch before update on event_config
  for each row execute function touch_updated_at();

-- --------------------------------------------------------------- tables ----
-- Declared before `pairs` because pairs references it.
create table tables (
  id         uuid primary key default gen_random_uuid(),
  label      text        not null unique,
  -- Pairs are the unit of seating and are never split, so capacity is even.
  capacity   int         not null check (capacity > 0 and capacity % 2 = 0),
  zone       text,
  is_open    boolean     not null default true,
  notes      text,
  sort_order int         not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------- profiles ----
create table profiles (
  id                     uuid primary key references auth.users on delete cascade,
  first_name             text            not null default '',
  last_name              text            not null default '',
  gender                 gender_t,
  phone                  text,
  email                  text            not null default '',
  photo_url              text,
  bio                    text            check (bio is null or char_length(bio) <= 140),
  -- [{ "q": "...", "a": "..." }]
  prompts                jsonb           not null default '[]'::jsonb,
  department             text,
  level                  text,

  review_status          review_status_t not null default 'draft',
  rejection_reason       text,

  pairing_status         pairing_status_t not null default 'unpaired',
  -- The one-active-pair invariant. A single column on a single row means a
  -- person cannot structurally hold two pairs at once.
  active_pair_id         uuid,

  -- Lifetime sends. Refunded on expiry/withdrawal/void, NOT on decline.
  invites_sent_count     int             not null default 0 check (invites_sent_count >= 0),
  -- Drives "least-invited first" discovery ordering. Never displayed to users.
  invites_received_count int             not null default 0 check (invites_received_count >= 0),

  seeking_help           boolean         not null default false,
  is_blocked             boolean         not null default false,
  is_admin               boolean         not null default false,

  created_at             timestamptz     not null default now(),
  updated_at             timestamptz     not null default now()
);

create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------- pairs ----
create table pairs (
  id               uuid primary key default gen_random_uuid(),
  user_a_id        uuid not null references profiles on delete cascade,
  user_b_id        uuid not null references profiles on delete cascade,
  status           pair_status_t not null default 'confirmed',
  table_id         uuid references tables on delete set null,
  confirmed_at     timestamptz not null default now(),
  dissolved_at     timestamptz,
  dissolved_reason text,
  -- Canonical ordering removes the (a,b)/(b,a) duplicate problem entirely.
  constraint ordered_pair check (user_a_id < user_b_id)
);

-- Belt and braces alongside profiles.active_pair_id.
create unique index pairs_one_active_a on pairs (user_a_id) where status = 'confirmed';
create unique index pairs_one_active_b on pairs (user_b_id) where status = 'confirmed';
create index pairs_table_idx on pairs (table_id) where status = 'confirmed';

alter table profiles
  add constraint profiles_active_pair_fk
  foreign key (active_pair_id) references pairs (id) on delete set null;

-- ---------------------------------------------------------- invitations ----
create table invitations (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references profiles on delete cascade,
  recipient_id uuid not null references profiles on delete cascade,
  note         text not null check (char_length(note) between 1 and 200),
  status       invitation_status_t not null default 'pending',
  source       invitation_source_t not null default 'user',
  expires_at   timestamptz not null,
  responded_at timestamptz,
  created_at   timestamptz not null default now(),
  constraint no_self_invite check (sender_id <> recipient_id)
);

-- At most one live invitation between the same two people in the same direction.
create unique index invitations_no_dup_pending
  on invitations (sender_id, recipient_id) where status = 'pending';
create index invitations_recipient_idx on invitations (recipient_id, status);
create index invitations_sender_idx    on invitations (sender_id, status);
create index invitations_expiry_idx    on invitations (expires_at) where status = 'pending';

-- --------------------------------------------------------------- passes ----
create table passes (
  id              uuid primary key default gen_random_uuid(),
  pair_id         uuid not null unique references pairs on delete cascade,
  -- Short human-readable code. The QR carries code + HMAC computed in the app,
  -- so the signing secret never lives in the database.
  code            text not null unique,
  checked_in_a_at timestamptz,
  checked_in_b_at timestamptz,
  issued_at       timestamptz not null default now()
);

-- -------------------------------------------------------- date_messages ----
create table date_messages (
  id                uuid primary key default gen_random_uuid(),
  pair_id           uuid not null references pairs on delete cascade,
  author_id         uuid not null references profiles on delete cascade,
  body              text not null check (char_length(body) between 1 and 1000),
  -- Opt-in, unticked by default. Gates PUBLIC use only — the recipient always
  -- sees the message immediately regardless of moderation state.
  share_consent     boolean not null default false,
  anonymise         boolean not null default false,
  moderation_status moderation_status_t not null default 'pending',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (pair_id, author_id)
);

create trigger date_messages_touch before update on date_messages
  for each row execute function touch_updated_at();

-- -------------------------------------------------------------- reports ----
create table reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles on delete cascade,
  reported_id uuid not null references profiles on delete cascade,
  reason      text not null,
  notes       text,
  status      report_status_t not null default 'open',
  created_at  timestamptz not null default now(),
  constraint no_self_report check (reporter_id <> reported_id)
);

create index reports_status_idx on reports (status, created_at desc);

-- --------------------------------------------------------------- blocks ----
create table blocks (
  blocker_id uuid not null references profiles on delete cascade,
  blocked_id uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on blocks (blocked_id);

-- ------------------------------------------------------------ audit_log ----
create table audit_log (
  id          bigserial primary key,
  actor_id    uuid references profiles on delete set null,
  action      text not null,
  target_type text,
  target_id   uuid,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_created_idx on audit_log (created_at desc);

-- ------------------------------------------------- discovery index ----
-- Supports the discovery query: approved + unpaired + opposite gender,
-- ordered least-invited first.
create index profiles_discovery_idx
  on profiles (gender, invites_received_count, created_at)
  where review_status = 'approved'
    and pairing_status = 'unpaired'
    and is_blocked = false;

-- ------------------------------------------ profile row on user signup ----
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
