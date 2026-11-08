-- Per-account settings. One row per user; `presentation` holds the
-- Presentation options (see src/presentationOptions.ts). Missing keys mean
-- "use the default", so new options need no migration.
create table if not exists public.cc_user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  presentation jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.cc_user_settings enable row level security;

create policy "Own settings: read" on public.cc_user_settings
  for select using (user_id = auth.uid());
create policy "Own settings: insert" on public.cc_user_settings
  for insert with check (user_id = auth.uid());
create policy "Own settings: update" on public.cc_user_settings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
