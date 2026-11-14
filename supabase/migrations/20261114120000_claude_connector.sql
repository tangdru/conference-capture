-- The Claude connector (menu > Use in Claude, 2026-11-14). An account gets a
-- private link to the `mcp` function, which lets Claude (desktop, claude.ai,
-- the phone app) read that account's sessions, photos and presentations.
-- The token in the link is long and random, so the link can't be guessed;
-- it reads, and can save a presentation to a session; making a new link (or
-- turning it off) stops the old one.
create table if not exists public.cc_mcp_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.cc_mcp_links enable row level security;

-- The owner can see their link (to copy it again); only the functions below
-- change it.
create policy "Own Claude connector link: read" on public.cc_mcp_links
  for select using (user_id = (select auth.uid()));

-- Makes (or replaces) the caller's link token and returns it.
create or replace function public.cc_create_mcp_link()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  insert into public.cc_mcp_links (user_id, token, created_at, last_used_at)
  values (auth.uid(), new_token, now(), null)
  on conflict (user_id) do update
    set token = excluded.token, created_at = now(), last_used_at = null;
  return new_token;
end;
$$;

-- Turns the caller's link off.
create or replace function public.cc_remove_mcp_link()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.cc_mcp_links where user_id = auth.uid();
$$;

-- Whose link this is (null if none), noting when it was last used.
-- Service role only: the mcp function.
create or replace function public.cc_mcp_user_for(p_token text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  update public.cc_mcp_links
    set last_used_at = now()
    where token = p_token
    returning user_id
$$;

revoke all on function public.cc_create_mcp_link() from public, anon;
revoke all on function public.cc_remove_mcp_link() from public, anon;
revoke all on function public.cc_mcp_user_for(text) from public, anon, authenticated;
grant execute on function public.cc_create_mcp_link() to authenticated;
grant execute on function public.cc_remove_mcp_link() to authenticated;
grant execute on function public.cc_mcp_user_for(text) to service_role;
grant select on public.cc_mcp_links to authenticated;
grant all on public.cc_mcp_links to service_role;
