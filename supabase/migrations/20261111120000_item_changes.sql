-- Load only what changed: each entry says when it last changed, and deleted
-- entries leave a note behind, so the app can ask for "everything since X"
-- instead of every entry of every session on every load.

alter table cc_timeline_items
  add column if not exists updated_at timestamptz not null default now();

create or replace function cc_timeline_items_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists cc_timeline_items_set_updated_at on cc_timeline_items;
create trigger cc_timeline_items_set_updated_at
  before update on cc_timeline_items
  for each row execute function cc_timeline_items_set_updated_at();

create index if not exists cc_timeline_items_owner_updated_idx
  on cc_timeline_items (owner_id, updated_at);

-- No foreign keys: a note must outlive its entry, its session and even the
-- account delete that cascades through here.
create table if not exists cc_deleted_items (
  id uuid primary key,
  session_id uuid not null,
  owner_id uuid not null,
  deleted_at timestamptz not null default now()
);

create index if not exists cc_deleted_items_owner_deleted_idx
  on cc_deleted_items (owner_id, deleted_at);

alter table cc_deleted_items enable row level security;

drop policy if exists cc_deleted_items_select_own on cc_deleted_items;
create policy cc_deleted_items_select_own on cc_deleted_items
  for select using (auth.uid() = owner_id);

create or replace function cc_timeline_items_note_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into cc_deleted_items (id, session_id, owner_id)
  values (old.id, old.session_id, old.owner_id)
  on conflict (id) do update set deleted_at = now();
  return old;
end;
$$;

drop trigger if exists cc_timeline_items_note_delete on cc_timeline_items;
create trigger cc_timeline_items_note_delete
  after delete on cc_timeline_items
  for each row execute function cc_timeline_items_note_delete();
