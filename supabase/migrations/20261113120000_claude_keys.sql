-- Each account's own Claude API key (menu > Claude API key). The key itself
-- is kept encrypted in Supabase Vault; this table only says which Vault
-- secret is whose, and the last 4 characters so the app can show which key
-- is saved. The app can read its own row but never the key: only the server
-- functions (service role) can, via cc_claude_key_for. Saving goes through
-- the claude-key function, which checks the key with Claude first.
create table if not exists public.cc_claude_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  secret_id uuid not null,
  last4 text not null,
  updated_at timestamptz not null default now()
);

alter table public.cc_claude_keys enable row level security;

create policy "Own Claude key: read" on public.cc_claude_keys
  for select using (user_id = auth.uid());

-- Save (or replace) an account's key. Service role only.
create or replace function public.cc_save_claude_key(p_user uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
begin
  select secret_id into existing from public.cc_claude_keys where user_id = p_user;
  if existing is not null and exists (select 1 from vault.secrets where id = existing) then
    perform vault.update_secret(existing, p_key);
  else
    existing := vault.create_secret(p_key, 'cc_claude_key_' || p_user::text || '_' || extract(epoch from now())::bigint::text);
  end if;
  insert into public.cc_claude_keys (user_id, secret_id, last4, updated_at)
  values (p_user, existing, right(p_key, 4), now())
  on conflict (user_id) do update
    set secret_id = excluded.secret_id, last4 = excluded.last4, updated_at = now();
end;
$$;

-- An account's key, decrypted. Service role only.
create or replace function public.cc_claude_key_for(p_user uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select s.decrypted_secret
  from public.cc_claude_keys k
  join vault.decrypted_secrets s on s.id = k.secret_id
  where k.user_id = p_user
$$;

-- Removes the caller's own key.
create or replace function public.cc_remove_claude_key()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.cc_claude_keys where user_id = auth.uid();
$$;

-- Removing a row (including when the account is deleted) removes the key.
create or replace function public.cc_claude_keys_drop_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id = old.secret_id;
  return old;
end;
$$;

create trigger cc_claude_keys_drop_secret
  after delete on public.cc_claude_keys
  for each row execute function public.cc_claude_keys_drop_secret();

revoke all on function public.cc_save_claude_key(uuid, text) from public, anon, authenticated;
revoke all on function public.cc_claude_key_for(uuid) from public, anon, authenticated;
revoke all on function public.cc_claude_keys_drop_secret() from public, anon, authenticated;
grant execute on function public.cc_save_claude_key(uuid, text) to service_role;
grant execute on function public.cc_claude_key_for(uuid) to service_role;
revoke all on function public.cc_remove_claude_key() from public, anon;
grant execute on function public.cc_remove_claude_key() to authenticated;
