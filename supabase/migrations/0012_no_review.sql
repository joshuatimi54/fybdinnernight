-- ===========================================================================
-- FYB Dinner Night — registration without a review queue
-- ===========================================================================
-- The committee decided they do not want to approve profiles by hand. Sign up,
-- and you are in: you can reserve a seat with your date straight away.
--
-- What this trades away is worth naming, because it changes the safety model:
-- photos and names now appear to other guests the moment they are saved, with
-- nobody having looked at them first. The controls that remain are reactive
-- rather than preventive — report and block on every profile, and the
-- committee can still set a profile to 'rejected' or is_blocked to pull
-- somebody out of circulation. Somebody should still watch the moderation
-- queue; it is now the only line rather than the second one.
--
-- review_status is kept rather than dropped: it is still how a profile gets
-- removed, and dropping it would mean rewriting every policy that reads it.
-- ===========================================================================

-- Anyone who was mid-review when this shipped goes straight through, so no one
-- is left waiting for an approval that will never come.
update profiles
   set review_status = 'approved'
 where review_status = 'pending';

-- ---------------------------------------------------------------------------
-- Submitting now approves. Prompts are no longer part of a complete profile.
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

  -- Idempotent: re-saving an approved profile is a no-op, not an error.
  if v_p.review_status = 'approved' then
    return jsonb_build_object('status', 'approved');
  end if;

  if trim(v_p.first_name) = '' or trim(v_p.last_name) = '' then raise exception 'NAME_REQUIRED'; end if;
  if v_p.gender is null                        then raise exception 'GENDER_REQUIRED';   end if;
  if v_p.phone is null or trim(v_p.phone) = '' then raise exception 'PHONE_REQUIRED';    end if;
  if v_p.username is null                      then raise exception 'USERNAME_REQUIRED'; end if;
  if v_cfg.require_photo and (v_p.photo_url is null or v_p.photo_url = '') then
    raise exception 'PHOTO_REQUIRED';
  end if;

  update profiles
     set review_status = 'approved', rejection_reason = null
   where id = v_me;

  perform queue_email_to(v_me, 'profile_approved', '{}'::jsonb, 'prof_ok_' || v_me::text);

  insert into audit_log (actor_id, action, target_type, target_id)
  values (v_me, 'profile.registered', 'profile', v_me);

  return jsonb_build_object('status', 'approved');
end;
$$;

-- ---------------------------------------------------------------------------
-- A new photo no longer drops someone back into a queue that no longer exists.
-- It simply changes; the report button is what catches a bad one now.
-- ---------------------------------------------------------------------------
create or replace function guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() then
    return new;
  end if;

  -- Gender still cannot change once you are in circulation: it decides who
  -- sees whom, and flipping it mid-event would reshuffle the whole directory.
  if old.review_status = 'approved'
     and new.gender is distinct from old.gender then
    raise exception 'GENDER_LOCKED';
  end if;

  -- Nor can a username, once people may already be holding it.
  if old.review_status = 'approved'
     and old.username is not null
     and new.username is distinct from old.username then
    raise exception 'USERNAME_LOCKED';
  end if;

  return new;
end;
$$;
