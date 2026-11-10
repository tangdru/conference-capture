-- What a richer session card needs, all nullable so old app builds and old
-- sessions are unaffected:
--  - pinned_at: when the user pinned the session; pinned ones sit in their
--    own group at the top of the home list, the latest pin first.
--  - deck_cover_photo_id: the slide Sparkle chose as the most telling image
--    of the talk, shown on the card (a photo the user starred wins).
--  - deck_read_minutes: about how long the presentation takes to read.
alter table public.cc_sessions
  add column if not exists pinned_at timestamptz,
  add column if not exists deck_cover_photo_id uuid,
  add column if not exists deck_read_minutes integer;
