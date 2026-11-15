# Backlog

Ideas agreed worth doing but not scheduled yet (2026-10-31). Newest thinking
on the native app is in `native-app-migration.md`.

## Top ticket (on hold)

- **Live points and Remember this lines.** A "So far" panel at the top of a
  live session with one-line points written on the phone every couple of
  minutes (× to remove one; kept ones count as Remember this moments), and a
  one-line statement for each Remember this tap. Uses Apple's on-device model:
  free, private, no API key. Full plan:
  `design/plans/2026-11-15-live-points-plan.md`. **On hold** until there's an
  Apple Intelligence iPhone (15 Pro or newer) to test on; Andrew's is an
  iPhone 14. (Agreed 2026-11-15.)

## Capture

*Dropped 2026-11-15:* an explicit End session, and a session photo album.
Ask during a live session works through the Claude connector.

- **Video clips: tap for a photo, hold the shutter for video.** Same camera,
  same shutter, like the iPhone camera. Claude can't take video directly
  (only images, text and PDFs), so the phone turns a clip into things it
  can read:
  - a few frames from the clip (one whenever the picture changes enough,
    e.g. each step of a demo), each sent like a photo with its own slide text;
  - the clip's sound, transcribed on the phone like the ambient transcript
    (or nothing new, when the ambient transcript is already running).
  Claude then reads the clip as "these frames, with this being said" --
  good for demos and animated slides, though motion between the frames is
  lost. The presentation shows the clip itself (or its best frame with a
  play button). Costs: clips are large, so they'd need the upload queue,
  a length cap (say 60 s) and a size limit in storage; frames count toward
  the 20 images Claude sees per presentation. Shares the upload path with
  the planned audio clips (`audio-clips-plan` notes). (Requested 2026-11-10.)

## Session options

Menu → Session options (account-wide, saved in
`cc_user_settings.session_options`, `src/sessionOptions.ts`). Built in
build 67 (2026-11-12): **Remember this** (on: shows the star) and **Chui's
audio** (off: hides the clip button). Turning an option off only hides or
stops something; it never removes anything already captured. Nothing
is waiting to be built here (2026-11-15).

*Built 2026-11-14 (after build 86), under "During a talk":* **Live
transcript** (on; off keeps the mic off, so no clips either), **Show
transcript while live** (on; off hides transcript entries while recording,
with a "Transcribing" light in their place: moving bars, minutes written
down, amber after 90 s of nothing heard, red if it stopped), and **Stay live
after a pause** (30 s-10 min, default 3 min).

*Dropped 2026-11-14:* hiding Ask during a live talk (Claude can already ask
about a live session, at most ~30 s behind, which is useful), and "Quote with
each clip" (a clip's words come from the transcript, which Ask and search
already read).

*Built 2026-11-12 (commit d63acdc), under Chui's audio:* clip length
before (0-60 s, default 5) and after (0-120 s, default 44), snap to
sentences, voice boost (saved clip only), upload on Wi-Fi only, keep only the
trimmed part, and clips in shared presentations (off). Clips go into
presentations (Sparkle v20) with a caption.

*Dropped 2026-11-15:* building the presentation automatically when a session
ends (presentations are made in Claude through the connector, which the app
can't start), and a date format setting for session names.

Open naming question: once capture settings and presentation settings both
exist, the menu might simply say "Options" with two sections.

## Native iOS

- **"Presentation ready" notification.** Generation takes minutes and is
  silent today. Push needs APNs (paid developer program, see
  `native-app-migration.md`); a local notification on return is a cheaper
  first step.
- **Name sessions from the calendar.** Read the event happening now (EventKit,
  with permission) and use it as the session title instead of "Session".
  (Untitled sessions are now named from their content when a presentation
  is generated, 2026-10-31.)
- **Faster capture.** Action Button / Control Center / Lock Screen control to
  take a slide photo, and App Intents ("Hey Siri, start a session").
- **Small native polish.** Haptic on note save; Spotlight indexing of
  sessions. (The shutter haptic is done.)

## Less note-taking (opt-in tools, the user stays in control)

Step by step toward not needing to type notes, building on "Remember this"
and starring any entry (2026-11-01). Rough order of value.

1. **Mark without looking at the phone.**
   - ★ Remember button on the recording Live Activity, next to Pause
     (Lock Screen and Dynamic Island).
   - "Remember this" as an Action Button / Control Center control.
   - Back Tap via a Shortcuts action.
2. **Say why it mattered, in one tap.**
   - Typed marks: long-press the star to pick Action item, Question,
     Quote, Key idea or Disagree; Sparkle and Ask use the type.
   - Voice aside: hold the star and whisper a thought; it becomes a note in
     the user's words, kept apart from the speaker's transcript.
3. **The app suggests, the user decides.**
   - Suggested moments after the talk: Claude proposes 3-5 moments that
     mattered as dimmed cards; tap to keep (starred), swipe to dismiss.
     Nothing is added unless kept.
   - Running "so far" card: now the top ticket (live points), see above.
4. **Turn it into things to do.**
   - Action items to Reminders with one tap (native Reminders).
   - QR codes and URLs on slide photos pulled out as tappable references.
     *(Shipped in build 54 for QR codes: decoded on the phone, listed in
     References.)*

## Product

- **Save Ask conversations** per session so they can be continued later,
  and/or save an answer as a note on the session.
- **Record the cost of each AI call** (token usage) to see what each
  question and sparkle really costs.

- **Export a written summary** to Notes, email or Notion, alongside the deck.

## Finding things across a conference

Shipped 2026-11-09/10: sessions grouped by day, and richer cards for
sessions with a presentation (Sparkle's chosen slide, speaker, read time; tap
opens it), plus Pin. The rest, roughly in order:

- **Build all of a day's presentations at once.** One tap runs Sparkle on
  every session of the day without a presentation, which also names the many
  sessions still called "Session".
- **Events.** Group days into an event (e.g. "IEEE VIS 2026"), suggested from
  dates or made by hand, with its own page of talks. Needs the day groups.
- **Event digest.** One presentation for a day or event: themes across the
  talks, where speakers agreed and differed, linking into each talk's
  presentation. Builds on Ask across sessions.
- **Desktop web layout.** Sessions by day on the left, the open presentation
  on the right; the browser version today is the phone layout stretched.
- **Share by link** -- built 2026-11-10 (build 62). Share → Share link gives a
  link anyone can open in a browser; someone with the app taps "Open in app"
  (or "Add to my sessions" on the website) and gets a "Shared with you" card
  that opens the owner's current version. Possible later: an expiry date, and
  a list of what you've shared with a "Stop sharing" switch.
- **Friends (sharing option 2).** Builds on Share by link: find people (a name,
  email, or a friend code / QR to scan at the conference), friend requests,
  then "Share with…" a friend puts the same "Shared with you" card straight
  into their list, with an accept/decline inbox and ideally a push
  notification (needs APNs, see Native iOS).
- **Filters.** Has a presentation, pinned, this week.
- **Export** to Notion or Google Docs.

## Storage and cost

Considered 2026-11-08, not decided. Supabase holds the main copy of
everything; the phone only queues items until they upload, plus Remember this
clips. Usage then: about 110 MB (photos 86 MB at ~0.9 MB each, presentations
13 MB, database 12 MB). The free plan has 1 GB of files; one busy conference
day is roughly 150-200 MB per person; Pro is $25/month for 100 GB.

- **Smaller photos.** Compress slide photos harder (about half the size);
  Claude still reads the text fine. Cheapest win, do first if storage grows.
- **Watch usage** and move to Supabase Pro only near 1 GB.
- **Sync only what changed.** The app now shows the copy saved on the phone
  at once, then reloads everything. Next step: ask only for entries new or
  changed since the last sync. Needs an updated-at time on entries and a
  record of deletions (a migration).
- **Load a session's entries when it's opened.** Only worth it at tens of
  thousands of entries; needs per-session summaries for the cards and search
  moved to the server.
- **Phone-first with iCloud** (as Apple Notes and Day One do): no server
  storage cost, but a large rewrite, since presentations, enrichment, Ask and
  titles run on the server and need the data there, as do the web version
  and moving to a new phone. Only worth it if the app goes public at scale.
