-- Conference Capture schema: sessions, their timeline entries, and the
-- private storage buckets for photos, videos and generated decks. Every row
-- and file belongs to one user and only that user can see or change it.

create table public.cc_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Session',
  status text not null default 'recording'
    check (status in ('recording', 'suspended', 'enriching', 'complete')),
  started_at timestamptz not null default now(),
  accumulated_ms bigint not null default 0,
  live_span_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deck_status text not null default 'none'
    check (deck_status in ('none', 'generating', 'ready', 'error')),
  deck_path text,
  deck_error text,
  deck_generated_at timestamptz,
  enrichment jsonb,
  enrichment_error text,
  last_enriched_at timestamptz,
  enrichment_running_at timestamptz
);
create index cc_sessions_owner_id_idx on public.cc_sessions (owner_id);

create table public.cc_timeline_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cc_sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  type text not null
    check (type in ('note', 'photo', 'video', 'transcript', 'enrichment', 'highlight')),
  text text,
  caption text,
  photo_path text,
  item_timestamp timestamptz not null default now(),
  added_later boolean not null default false,
  created_at timestamptz not null default now(),
  video_path text,
  duration_ms integer,
  excluded boolean not null default false,
  position integer,
  subtype text,
  payload jsonb,
  placement_locked boolean not null default false,
  starred boolean not null default false
);
create index cc_timeline_items_session_id_idx on public.cc_timeline_items (session_id);

-- New tables aren't exposed to the Data API automatically in this project.
grant select, insert, update, delete on public.cc_sessions, public.cc_timeline_items to authenticated;
grant all on public.cc_sessions, public.cc_timeline_items to service_role;

alter table public.cc_sessions enable row level security;
alter table public.cc_timeline_items enable row level security;

create policy cc_sessions_select_own on public.cc_sessions for select using (auth.uid() = owner_id);
create policy cc_sessions_insert_own on public.cc_sessions for insert with check (auth.uid() = owner_id);
create policy cc_sessions_update_own on public.cc_sessions for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy cc_sessions_delete_own on public.cc_sessions for delete using (auth.uid() = owner_id);

create policy cc_timeline_items_select_own on public.cc_timeline_items for select using (auth.uid() = owner_id);
create policy cc_timeline_items_insert_own on public.cc_timeline_items for insert with check (auth.uid() = owner_id);
create policy cc_timeline_items_update_own on public.cc_timeline_items for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy cc_timeline_items_delete_own on public.cc_timeline_items for delete using (auth.uid() = owner_id);

-- Any change to an entry bumps its session's updated_at (the sessions list sorts by it).
create function public.cc_touch_session_on_item_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update cc_sessions
    set updated_at = now()
    where id = coalesce(new.session_id, old.session_id);
  return coalesce(new, old);
end;
$$;

create trigger cc_timeline_items_touch_session
  after insert or delete or update on public.cc_timeline_items
  for each row execute function public.cc_touch_session_on_item_change();

-- Storage: private buckets, files kept under <user id>/...
insert into storage.buckets (id, name, public) values
  ('cc-photos', 'cc-photos', false),
  ('cc-videos', 'cc-videos', false),
  ('cc-decks', 'cc-decks', false);

create policy cc_photos_select_own on storage.objects for select using (bucket_id = 'cc-photos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy cc_photos_insert_own on storage.objects for insert with check (bucket_id = 'cc-photos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy cc_photos_update_own on storage.objects for update using (bucket_id = 'cc-photos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy cc_photos_delete_own on storage.objects for delete using (bucket_id = 'cc-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy cc_videos_select_own on storage.objects for select using (bucket_id = 'cc-videos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy cc_videos_insert_own on storage.objects for insert with check (bucket_id = 'cc-videos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy cc_videos_update_own on storage.objects for update using (bucket_id = 'cc-videos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy cc_videos_delete_own on storage.objects for delete using (bucket_id = 'cc-videos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy cc_decks_select_own on storage.objects for select using (bucket_id = 'cc-decks' and auth.uid()::text = (storage.foldername(name))[1]);
create policy cc_decks_insert_own on storage.objects for insert with check (bucket_id = 'cc-decks' and auth.uid()::text = (storage.foldername(name))[1]);
create policy cc_decks_update_own on storage.objects for update using (bucket_id = 'cc-decks' and auth.uid()::text = (storage.foldername(name))[1]);
create policy cc_decks_delete_own on storage.objects for delete using (bucket_id = 'cc-decks' and auth.uid()::text = (storage.foldername(name))[1]);
