-- Approved "free" accounts: people (family, testers) who may use the shared
-- server Claude key without adding their own. Everyone else needs their own
-- key (menu > Claude API key). Managed by hand in the Supabase dashboard:
--   insert into public.cc_free_users (email) values ('mom@example.com');
--   delete from public.cc_free_users where email = 'mom@example.com';
-- Emails are matched case-insensitively. No policies on purpose: the app can
-- never read or change this list; only the server functions (service role) can.
create table if not exists public.cc_free_users (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);

alter table public.cc_free_users enable row level security;

-- Is this account's email on the list? Service role only.
create or replace function public.cc_is_free_user(p_user uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from auth.users u
    join public.cc_free_users f on f.email = lower(u.email)
    where u.id = p_user
  )
$$;

revoke all on function public.cc_is_free_user(uuid) from public, anon, authenticated;
grant execute on function public.cc_is_free_user(uuid) to service_role;
