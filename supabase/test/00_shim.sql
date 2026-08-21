-- ===========================================================================
-- Supabase shim — LOCAL TESTING ONLY. Never run this against a real project.
-- ===========================================================================
-- Recreates just enough of what Supabase provides (the auth schema, auth.uid(),
-- the anon/authenticated/service_role roles, the realtime publication) so the
-- real migrations can run unmodified against a stock Postgres container.
--
-- auth.uid() reads a session GUC, so a test can "become" any user with
--   select set_config('test.uid', '<uuid>', false);
-- ===========================================================================

create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants these by default on the public schema; mirror that so the
-- REVOKEs in the migrations have something real to take away.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;
