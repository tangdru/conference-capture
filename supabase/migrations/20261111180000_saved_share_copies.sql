-- A presentation someone added to their sessions is theirs to keep (2026-11-11):
-- adding it saves a copy in their own cc-decks folder, which stays when the
-- sender stops sharing or deletes it. While it's still shared, opening it shows
-- the sender's latest version (and refreshes the copy).
alter table cc_saved_shares
  add column if not exists title text not null default '',
  add column if not exists copy_path text,
  add column if not exists copied_at timestamptz;
