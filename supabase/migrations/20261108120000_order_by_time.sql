-- Timelines are now in time order, and a dragged entry moves to the moment
-- it was dropped at (placement_locked marks it as placed by the user, so
-- Sparkle never moves it). Sessions arranged the old way, with a position
-- saved for every entry, are converted here without changing what they show:
-- entries are walked in their saved order and nudged forward in time just
-- enough to keep that order, and their notes and photos count as placed by
-- the user (the old way couldn't tell which one was dragged).
alter table public.cc_timeline_items disable trigger cc_timeline_items_touch_session;

do $$
declare
  s record;
  r record;
  prev timestamptz;
begin
  for s in select distinct session_id from public.cc_timeline_items where position is not null loop
    prev := null;
    for r in
      select id, item_timestamp from public.cc_timeline_items
      where session_id = s.session_id
      order by position asc nulls last, item_timestamp asc, id asc
    loop
      if prev is not null and r.item_timestamp <= prev then
        prev := prev + interval '1 millisecond';
        update public.cc_timeline_items set item_timestamp = prev where id = r.id;
      else
        prev := r.item_timestamp;
      end if;
    end loop;
    update public.cc_timeline_items
      set placement_locked = true
      where session_id = s.session_id and type in ('note', 'photo');
    update public.cc_timeline_items set position = null where session_id = s.session_id;
  end loop;
end $$;

alter table public.cc_timeline_items enable trigger cc_timeline_items_touch_session;
