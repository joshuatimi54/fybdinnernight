-- ===========================================================================
-- FYB Dinner Night — the invitation feed
-- ===========================================================================
-- Two problems this solves.
--
-- 1. RLS deliberately stops you reading the profile of someone who invited
--    you, so the inbox cannot be assembled with a join from the client.
--
-- 2. Decline privacy has to hold at the database boundary, not just in the
--    interface. For an invitation you SENT, 'declined' and 'voided' are both
--    collapsed into 'closed' before the row leaves Postgres — so even a
--    hand-written API call cannot discover that a specific person said no.
-- ===========================================================================

create or replace function get_my_invitations()
returns table (
  id             uuid,
  direction      text,
  counterpart_id uuid,
  first_name     text,
  last_initial   text,
  photo_url      text,
  department     text,
  prompts        jsonb,
  note           text,
  status         text,
  source         invitation_source_t,
  expires_at     timestamptz,
  created_at     timestamptz,
  responded_at   timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'AUTH_REQUIRED'; end if;

  return query
  with feed as (
    -- Invitations addressed to you. The real status is safe here: you are
    -- the one who acted on it.
    select i.id                                  as f_id,
           'received'::text                      as f_direction,
           s.id                                  as f_counterpart,
           s.first_name                          as f_first_name,
           case when trim(s.last_name) = '' then ''
                else left(s.last_name, 1) || '.' end as f_last_initial,
           s.photo_url                           as f_photo,
           s.department                          as f_department,
           s.prompts                             as f_prompts,
           i.note                                as f_note,
           i.status::text                        as f_status,
           i.source                              as f_source,
           i.expires_at                          as f_expires,
           i.created_at                          as f_created,
           i.responded_at                        as f_responded
      from invitations i
      join profiles s on s.id = i.sender_id
     where i.recipient_id = v_me

    union all

    -- Invitations you sent. 'declined' and 'voided' both flatten to 'closed',
    -- so the outcome reads as "no longer available" and nothing more.
    select i.id,
           'sent'::text,
           r.id,
           r.first_name,
           case when trim(r.last_name) = '' then ''
                else left(r.last_name, 1) || '.' end,
           r.photo_url,
           r.department,
           r.prompts,
           i.note,
           case when i.status in ('declined', 'voided') then 'closed'
                else i.status::text end,
           i.source,
           i.expires_at,
           i.created_at,
           -- The exact moment is withheld too: learning it was answered in
           -- ninety seconds is its own kind of sting.
           case when i.status in ('declined', 'voided') then null
                else i.responded_at end
      from invitations i
      join profiles r on r.id = i.recipient_id
     where i.sender_id = v_me
  )
  select f.f_id,
         f.f_direction,
         f.f_counterpart,
         f.f_first_name,
         f.f_last_initial,
         f.f_photo,
         f.f_department,
         f.f_prompts,
         f.f_note,
         f.f_status,
         f.f_source,
         f.f_expires,
         f.f_created,
         f.f_responded
    from feed f
   order by case when f.f_status = 'pending' then 0 else 1 end,
            f.f_created desc;
end;
$$;

revoke all on function get_my_invitations() from anon;
