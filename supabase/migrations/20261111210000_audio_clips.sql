-- The clip button (2026-11-11): a minute of the speaker's voice around a tap,
-- as a timeline entry of type 'audio'. Its kept part is uploaded to the
-- cc-videos bucket (same own-folder rules); its details (trim, waveform,
-- file path) are in payload.
alter table public.cc_timeline_items drop constraint if exists cc_timeline_items_type_check;
alter table public.cc_timeline_items add constraint cc_timeline_items_type_check
  check (type in ('note', 'photo', 'video', 'transcript', 'enrichment', 'highlight', 'audio'));
