-- ===========================================================================
-- FYB Dinner Night — the seating map
-- ===========================================================================
-- RLS lets you see your own pair and no one else's, so occupancy cannot be
-- counted from the client. This returns seat totals per table and nothing
-- about who is sitting there — enough to choose, not enough to work out who
-- else is in the room.
-- ===========================================================================

create or replace function get_table_map()
returns table (
  id          uuid,
  label       text,
  capacity    int,
  zone        text,
  is_open     boolean,
  seats_taken int,
  is_mine     boolean,
  sort_order  int
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_pair uuid;
begin
  if v_me is null then raise exception 'AUTH_REQUIRED'; end if;

  select p.active_pair_id into v_pair from profiles p where p.id = v_me;

  return query
  select t.id,
         t.label,
         t.capacity,
         t.zone,
         t.is_open,
         coalesce((
           select count(*)::int * 2 from pairs pr
            where pr.table_id = t.id and pr.status = 'confirmed'
         ), 0),
         v_pair is not null and exists (
           select 1 from pairs pr
            where pr.id = v_pair and pr.table_id = t.id
         ),
         t.sort_order
    from tables t
   order by t.sort_order asc, t.label asc;
end;
$$;

revoke all on function get_table_map() from anon;
