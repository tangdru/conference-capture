-- generate-deck touches this each round, so the app can tell a build that
-- crashed (no way to report it) from one still running.
alter table public.cc_sessions add column if not exists deck_heartbeat_at timestamptz;
