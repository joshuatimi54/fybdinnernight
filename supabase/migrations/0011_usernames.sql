-- ===========================================================================
-- FYB Dinner Night — usernames
-- ===========================================================================
-- For the people who already have a date.
--
-- Browsing is for finding someone new. If you already know who you are asking,
-- you need to point at exactly them — and "Amaka" is not a way to do that when
-- there are six of them. A username is the handle you send someone so they can
-- find you and nobody else.
--
-- Stored lowercase, so @Tunde and @tunde can never be two different people.
-- ===========================================================================

alter table profiles
  add column if not exists username text;

-- Letters, numbers and underscores; must start with a letter. Long enough to
-- be distinctive, short enough to type from a WhatsApp message.
alter table profiles drop constraint if exists profiles_username_format;
alter table profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-z][a-z0-9_]{2,19}$');

create unique index if not exists profiles_username_key on profiles (username);

-- Always stored lowercase and trimmed, whatever the client sends.
create or replace function normalise_username()
returns trigger language plpgsql as $$
begin
  if new.username is not null then
    new.username := lower(trim(new.username));
    if new.username = '' then new.username := null; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_normalise_username on profiles;
create trigger profiles_normalise_username before insert or update on profiles
  for each row execute function normalise_username();

grant update (username) on profiles to authenticated;

-- ---------------------------------------------------------------------------
create or replace function username_available(p_username text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null
     and lower(trim(coalesce(p_username, ''))) ~ '^[a-z][a-z0-9_]{2,19}$'
     and not exists (
       select 1 from profiles p
        where p.username = lower(trim(p_username))
          and p.id <> auth.uid()
     );
$$;

-- A suggestion to prefill the field, so most people never have to think.
create or replace function suggest_username()
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_base text;
  v_try  text;
  v_n    int := 0;
begin
  select lower(regexp_replace(coalesce(first_name, ''), '[^a-zA-Z]', '', 'g'))
    into v_base from profiles where id = auth.uid();

  if v_base is null or char_length(v_base) < 3 then v_base := 'guest'; end if;
  v_base := left(v_base, 12);

  v_try := v_base;
  while exists (select 1 from profiles where username = v_try) and v_n < 200 loop
    v_n := v_n + 1;
    v_try := v_base || v_n::text;
  end loop;

  return v_try;
end;
$$;

-- ---------------------------------------------------------------------------
-- Look someone up by their handle.
--
-- Everything that means "you cannot ask this person" collapses into a single
-- 'unavailable' — paired, unapproved, blocked and blocked-you all read the
-- same from outside, exactly as they do everywhere else.
-- ---------------------------------------------------------------------------
create or replace function find_by_username(p_username text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_my profiles;
  v_p  profiles;
  v_u  text := lower(trim(coalesce(p_username, '')));
begin
  if v_me is null then raise exception 'AUTH_REQUIRED'; end if;

  v_u := ltrim(v_u, '@');
  if v_u = '' then return jsonb_build_object('status', 'not_found'); end if;

  select * into v_my from profiles where id = v_me;
  if not found or v_my.review_status <> 'approved' then raise exception 'NOT_APPROVED'; end if;

  select * into v_p from profiles where username = v_u;
  if not found then return jsonb_build_object('status', 'not_found'); end if;

  if v_p.id = v_me         then return jsonb_build_object('status', 'yourself');     end if;
  if v_my.pairing_status <> 'unpaired' then return jsonb_build_object('status', 'you_are_paired'); end if;

  -- Gender is worth naming plainly: it is a rule of the event, not a comment
  -- on the person, and hiding it would just be confusing.
  if v_p.gender is not null and v_my.gender is not null and v_p.gender = v_my.gender then
    return jsonb_build_object('status', 'same_gender', 'first_name', v_p.first_name);
  end if;

  if v_p.review_status <> 'approved'
     or v_p.pairing_status <> 'unpaired'
     or v_p.is_blocked
     or exists (
       select 1 from blocks b
        where (b.blocker_id = v_me   and b.blocked_id = v_p.id)
           or (b.blocker_id = v_p.id and b.blocked_id = v_me)
     )
  then
    return jsonb_build_object('status', 'unavailable', 'first_name', v_p.first_name);
  end if;

  if exists (
    select 1 from invitations i
     where i.sender_id = v_me and i.recipient_id = v_p.id and i.status = 'pending'
  ) then
    return jsonb_build_object('status', 'already_invited', 'first_name', v_p.first_name);
  end if;

  return jsonb_build_object(
    'status', 'available',
    'profile', jsonb_build_object(
      'id',           v_p.id,
      'first_name',   v_p.first_name,
      'last_initial', case when trim(v_p.last_name) = '' then ''
                           else left(v_p.last_name, 1) || '.' end,
      'username',     v_p.username,
      'photo_url',    v_p.photo_url,
      'bio',          v_p.bio,
      'prompts',      v_p.prompts,
      'department',   v_p.department,
      'level',        v_p.level,
      'has_pending_from_me', false
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- A username is now part of a complete profile.
-- ---------------------------------------------------------------------------
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
  if v_p.gender is null                        then raise exception 'GENDER_REQUIRED';   end if;
  if v_p.phone is null or trim(v_p.phone) = '' then raise exception 'PHONE_REQUIRED';    end if;
  if v_p.username is null                      then raise exception 'USERNAME_REQUIRED'; end if;
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

-- Discovery cards carry the handle too, so you can pass one to a friend.
-- Adding a column changes the return type, which CREATE OR REPLACE cannot do.
drop function if exists browse_profiles(text, text, text, int, int);

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
  username            text,
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
         p.username,
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
          or p.last_name  ilike '%' || p_search || '%'
          or p.username   ilike '%' || lower(p_search) || '%')
   order by p.invites_received_count asc, p.created_at asc
   limit  least(greatest(coalesce(p_limit, 24), 1), 60)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function find_by_username(text)   from anon;
revoke all on function username_available(text) from anon;
revoke all on function suggest_username()       from anon;
