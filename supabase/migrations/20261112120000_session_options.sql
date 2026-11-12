-- Session options (2026-11-12): the account's settings for the capture
-- screen during a talk (which buttons the session bar shows), beside the
-- presentation options. Missing keys fall back to the app's defaults.
alter table public.cc_user_settings
  add column if not exists session_options jsonb not null default '{}'::jsonb;
