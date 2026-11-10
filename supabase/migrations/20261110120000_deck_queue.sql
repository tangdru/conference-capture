-- Presentations build one at a time per account: one asked for while another
-- is building waits as 'queued' (deck_heartbeat_at = when it was queued) and
-- generate-deck starts it when the one before finishes.
alter table cc_sessions drop constraint if exists cc_sessions_deck_status_check;
alter table cc_sessions
  add constraint cc_sessions_deck_status_check
  check (deck_status in ('none', 'queued', 'generating', 'ready', 'error'));
