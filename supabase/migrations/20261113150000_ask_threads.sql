-- Ask Claude conversations across all sessions, kept so they can be resumed.
create table public.cc_ask_threads (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  turns jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cc_ask_threads_user_updated on public.cc_ask_threads (user_id, updated_at desc);

alter table public.cc_ask_threads enable row level security;

create policy "own ask threads" on public.cc_ask_threads
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
