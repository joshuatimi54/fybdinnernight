-- ===========================================================================
-- FYB Dinner Night — live counters + scheduled expiry
-- ===========================================================================

-- ------------------------------------------------------ public_counters --
-- Publishing `pairs` over realtime would stream profile ids to every anonymous
-- visitor on the landing page. This table holds nothing but totals, so the
-- ticker can be live without the directory leaking behind it.
create table public_counters (
  id                boolean primary key default true check (id),
  approved_profiles int not null default 0,
  confirmed_pairs   int not null default 0,
  seats_taken       int not null default 0,
  updated_at        timestamptz not null default now()
);

insert into public_counters (id) values (true);

alter table public_counters enable row level security;

create policy public_counters_read on public_counters
  for select to anon, authenticated using (true);

revoke insert, update, delete on public_counters from anon, authenticated;

create or replace function refresh_public_counters()
returns void
language sql security definer set search_path = public
as $$
  update public_counters set
    approved_profiles = (select count(*) from profiles where review_status = 'approved'),
    confirmed_pairs   = (select count(*) from pairs    where status = 'confirmed'),
    seats_taken       = (select count(*) * 2 from pairs where status = 'confirmed'),
    updated_at        = now()
  where id;
$$;

create or replace function bump_public_counters()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform refresh_public_counters();
  return null;
end;
$$;

-- Statement-level: one recount per statement, not per row.
create trigger pairs_bump_counters
  after insert or update or delete on pairs
  for each statement execute function bump_public_counters();

create trigger profiles_bump_counters
  after insert or update of review_status or delete on profiles
  for each statement execute function bump_public_counters();

select refresh_public_counters();

alter publication supabase_realtime add table public_counters;

-- --------------------------------------------------------- scheduled job --
-- Expiry has to run on a timer: an invitation nobody answers must release
-- both sides on its own, without either person having to say no.
--
-- Requires the pg_cron extension (Supabase: Database -> Extensions -> pg_cron).
-- If pg_cron is unavailable on your plan, call expire_invitations() from a
-- Netlify scheduled function hitting /api/cron/expire-invitations instead
-- (see netlify/functions/expire-invitations.mts).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;

    perform cron.unschedule(jobid)
       from cron.job where jobname = 'fyb-expire-invitations';

    perform cron.schedule(
      'fyb-expire-invitations',
      '*/15 * * * *',
      $cron$ select public.expire_invitations(); $cron$
    );
  else
    raise notice 'pg_cron unavailable - use the /api/cron/expire-invitations route instead';
  end if;
exception
  when insufficient_privilege or undefined_table or invalid_schema_name
    or undefined_function or feature_not_supported then
    raise notice 'pg_cron could not be scheduled here - use the API cron route instead';
end
$$;
