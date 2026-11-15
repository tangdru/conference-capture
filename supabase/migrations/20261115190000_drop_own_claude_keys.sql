-- Nobody adds their own Claude API key any more (free list since 2026-11-14,
-- enforced on the server from 2026-11-15). The table was empty, with no
-- Vault secrets left.
drop table if exists public.cc_claude_keys cascade;
drop function if exists public.cc_save_claude_key cascade;
drop function if exists public.cc_claude_key_for cascade;
drop function if exists public.cc_remove_claude_key cascade;
drop function if exists public.cc_claude_keys_drop_secret cascade;
