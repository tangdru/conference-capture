# Backlog

Ideas agreed worth doing but not scheduled yet (2026-10-31). Newest thinking
on the native app is in `native-app-migration.md`.

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
- **Small native polish.** Haptics on shutter and note save; Spotlight
  indexing of sessions.

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
   - Running "so far" card during long talks, refreshed every few minutes,
     bullets starrable. Costs per refresh, so a setting.
4. **Turn it into things to do.**
   - Action items to Reminders with one tap (native Reminders).
   - QR codes and URLs on slide photos pulled out as tappable references.

## Product

- **Save Ask conversations** per session so they can be continued later,
  and/or save an answer as a note on the session.
- **Record the cost of each AI call** (token usage) to see what each
  question and sparkle really costs.

- **Export a written summary** to Notes, email or Notion, alongside the deck.
