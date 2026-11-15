-- Accounts that run Sparkle and Ask in the app on Andrew's Claude API key.
-- Everyone else uses Claude through the connector. Edit rows in the dashboard.
create table if not exists public.cc_free_users (
  email text primary key check (email = lower(email)),
  note text,
  added_at timestamptz not null default now()
);
alter table public.cc_free_users enable row level security;
revoke all on public.cc_free_users from anon, authenticated;

create or replace function public.cc_is_free_user(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u join public.cc_free_users f on f.email = lower(u.email)
    where u.id = p_user
  );
$$;
revoke all on function public.cc_is_free_user(uuid) from public, anon, authenticated;

-- For the app: is the signed-in account on the list?
create or replace function public.cc_am_free_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.cc_is_free_user(auth.uid());
$$;
revoke all on function public.cc_am_free_user() from public, anon;
grant execute on function public.cc_am_free_user() to authenticated;
