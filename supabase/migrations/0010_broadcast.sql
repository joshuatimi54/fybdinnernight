-- ===========================================================================
-- FYB Dinner Night — committee broadcasts
-- ===========================================================================
-- Lets the committee write to a group of guests: venue changed, one day left,
-- thank you for coming.
--
-- It goes through the same outbox as everything else, so it inherits dedupe,
-- retries, the opt-out and the send log. A broadcast row is written first and
-- its id becomes part of every dedupe key, which means pressing Send twice
-- sends once.
-- ===========================================================================

create table if not exists broadcasts (
  id              uuid primary key default gen_random_uuid(),
  subject         text not null,
  body            text not null,
  segment         text not null,
  cta_label       text,
  cta_path        text,
  recipient_count int  not null default 0,
  test_only       boolean not null default false,
  created_by      uuid references profiles on delete set null,
  created_at      timestamptz not null default now()
);

alter table broadcasts enable row level security;

create policy broadcasts_admin_all on broadcasts
  for all using (is_admin()) with check (is_admin());

revoke insert, update, delete on broadcasts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Who a segment resolves to. One definition, used by both the count and the
-- send, so the number the committee sees is the number who actually get it.
-- ---------------------------------------------------------------------------
create or replace function broadcast_audience(p_segment text)
returns table (id uuid)
language sql stable security definer set search_path = public
as $$
  select p.id
    from profiles p
   where p.is_blocked = false
     and p.email_opt_out = false
     and p.email <> ''
     and case p_segment
       when 'everyone'      then p.review_status = 'approved'
       when 'unpaired'      then p.review_status = 'approved' and p.pairing_status = 'unpaired'
       when 'paired'        then p.review_status = 'approved' and p.pairing_status = 'paired'
       when 'seeking_help'  then p.review_status = 'approved'
                                 and p.pairing_status = 'unpaired'
                                 and p.seeking_help
       when 'pending'       then p.review_status = 'pending'
       when 'unfinished'    then p.review_status = 'draft'
       when 'unseated'      then p.review_status = 'approved'
                                 and p.pairing_status = 'paired'
                                 and exists (
                                   select 1 from pairs pr
                                    where pr.id = p.active_pair_id
                                      and pr.status = 'confirmed'
                                      and pr.table_id is null
                                 )
       else false
     end;
$$;

create or replace function admin_broadcast_count(p_segment text)
returns int
language sql stable security definer set search_path = public
as $$
  select case when is_admin()
              then (select count(*)::int from broadcast_audience(p_segment))
              else 0 end;
$$;

-- ---------------------------------------------------------------------------
create or replace function admin_broadcast(
  p_subject   text,
  p_body      text,
  p_segment   text,
  p_cta_label text default null,
  p_cta_path  text default null,
  p_test_only boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_id    uuid;
  v_count int := 0;
  v_row   record;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;

  p_subject := trim(coalesce(p_subject, ''));
  p_body    := trim(coalesce(p_body, ''));

  if char_length(p_subject) < 3   then raise exception 'SUBJECT_TOO_SHORT'; end if;
  if char_length(p_subject) > 120 then raise exception 'SUBJECT_TOO_LONG';  end if;
  if char_length(p_body) < 10     then raise exception 'BODY_TOO_SHORT';    end if;
  if char_length(p_body) > 5000   then raise exception 'BODY_TOO_LONG';     end if;

  if p_segment not in
     ('everyone','unpaired','paired','seeking_help','pending','unfinished','unseated') then
    raise exception 'UNKNOWN_SEGMENT';
  end if;

  -- The path is turned into a link inside the email, so it must stay on our
  -- own site — an admin account should not be able to mail out a link to
  -- anywhere else, deliberately or otherwise.
  if p_cta_path is not null and p_cta_path <> '' and left(p_cta_path, 1) <> '/' then
    raise exception 'CTA_PATH_MUST_BE_RELATIVE';
  end if;

  insert into broadcasts (subject, body, segment, cta_label, cta_path, created_by, test_only)
  values (p_subject, p_body, p_segment,
          nullif(trim(coalesce(p_cta_label, '')), ''),
          nullif(trim(coalesce(p_cta_path, '')), ''),
          v_me, coalesce(p_test_only, false))
  returning id into v_id;

  -- A test send goes to the admin who wrote it and nobody else.
  if coalesce(p_test_only, false) then
    perform queue_email_to(
      v_me, 'broadcast',
      jsonb_build_object('subject', p_subject, 'body', p_body,
                         'cta_label', p_cta_label, 'cta_path', p_cta_path,
                         'is_test', true),
      'bcast_' || v_id::text || '_' || v_me::text
    );

    update broadcasts set recipient_count = 1 where id = v_id;

    insert into audit_log (actor_id, action, target_type, target_id, payload)
    values (v_me, 'broadcast.test', 'broadcast', v_id,
            jsonb_build_object('segment', p_segment));

    return jsonb_build_object('ok', true, 'test', true, 'recipients', 1, 'id', v_id);
  end if;

  for v_row in select a.id from broadcast_audience(p_segment) a loop
    perform queue_email_to(
      v_row.id, 'broadcast',
      jsonb_build_object('subject', p_subject, 'body', p_body,
                         'cta_label', p_cta_label, 'cta_path', p_cta_path,
                         'is_test', false),
      'bcast_' || v_id::text || '_' || v_row.id::text
    );
    v_count := v_count + 1;
  end loop;

  update broadcasts set recipient_count = v_count where id = v_id;

  insert into audit_log (actor_id, action, target_type, target_id, payload)
  values (v_me, 'broadcast.sent', 'broadcast', v_id,
          jsonb_build_object('segment', p_segment, 'recipients', v_count,
                             'subject', p_subject));

  return jsonb_build_object('ok', true, 'test', false, 'recipients', v_count, 'id', v_id);
end;
$$;

revoke all on function admin_broadcast(text, text, text, text, text, boolean) from anon;
revoke all on function admin_broadcast_count(text)                            from anon;
revoke all on function broadcast_audience(text)                               from anon, authenticated;
