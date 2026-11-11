-- Share by link (2026-11-10). A shared presentation is a copy of its page in
-- the public cc-shared bucket, at <owner>/<token>.html -- the token is long
-- and random, so the link can't be guessed. Anyone with the link can read
-- that one file; only its owner can add, replace or remove it.

insert into storage.buckets (id, name, public)
values ('cc-shared', 'cc-shared', true)
on conflict (id) do update set public = true;

drop policy if exists cc_shared_insert_own on storage.objects;
create policy cc_shared_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'cc-shared' and (auth.uid())::text = (storage.foldername(name))[1]);
drop policy if exists cc_shared_update_own on storage.objects;
create policy cc_shared_update_own on storage.objects for update to authenticated
  using (bucket_id = 'cc-shared' and (auth.uid())::text = (storage.foldername(name))[1]);
drop policy if exists cc_shared_delete_own on storage.objects;
create policy cc_shared_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'cc-shared' and (auth.uid())::text = (storage.foldername(name))[1]);
-- Owners can see their own files (for upsert); nobody can list the bucket.
drop policy if exists cc_shared_select_own on storage.objects;
create policy cc_shared_select_own on storage.objects for select to authenticated
  using (bucket_id = 'cc-shared' and (auth.uid())::text = (storage.foldername(name))[1]);

-- One link per session: sharing again replaces the page, the link stays.
create table if not exists cc_shared_decks (
  token text primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null unique references cc_sessions(id) on delete cascade,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table cc_shared_decks enable row level security;
drop policy if exists cc_shared_decks_own on cc_shared_decks;
create policy cc_shared_decks_own on cc_shared_decks for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Presentations someone else shared that this person added to their sessions.
create table if not exists cc_saved_shares (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token text not null,
  added_at timestamptz not null default now(),
  primary key (user_id, token)
);
alter table cc_saved_shares enable row level security;
drop policy if exists cc_saved_shares_own on cc_saved_shares;
create policy cc_saved_shares_own on cc_saved_shares for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- What a link points to, for anyone who has the link: answers only for the
-- tokens asked about, so shared presentations can't be listed.
create or replace function cc_shared_decks_lookup(tokens text[])
returns table (token text, owner_id uuid, title text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.token, d.owner_id, d.title, d.updated_at
  from cc_shared_decks d
  where d.token = any(tokens)
$$;
revoke all on function cc_shared_decks_lookup(text[]) from public;
grant execute on function cc_shared_decks_lookup(text[]) to anon, authenticated;
