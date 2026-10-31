# Backlog

Ideas agreed worth doing but not scheduled yet (2026-10-31). Newest thinking
on the native app is in `native-app-migration.md`.

## Native iOS

- **Live Activity / Dynamic Island while recording.** Timer and pause on the
  Lock Screen and in the Dynamic Island, so it's obvious the app is still
  listening while the phone is locked or in another app. Needs a widget
  extension (ActivityKit).
- **"Presentation ready" notification.** Generation takes minutes and is
  silent today. Push needs APNs (paid developer program, see
  `native-app-migration.md`); a local notification on return is a cheaper
  first step.
- **Name sessions from the calendar.** Read the event happening now (EventKit,
  with permission) and use it as the session title instead of "Session".
- **Apple's long-form speech engine (SpeechAnalyzer, iOS 26).** Built for
  lectures; likely more accurate and would let us drop the pause-based
  segmenting workaround in `AmbientTranscriptionPlugin.swift`.
- **Faster capture.** Action Button / Control Center / Lock Screen control to
  take a slide photo, and App Intents ("Hey Siri, start a session").
- **Small native polish.** Haptics on shutter and note save; Spotlight
  indexing of sessions; background uploads (URLSession) so photos keep
  uploading after leaving the app.

## Product

- **"Remember this" button.** One tap marks the moment as important; the
  presentation emphasizes it and keeps the surrounding transcript.
- **Ask a session.** Questions answered from its transcript, notes and slides.
- **Search across sessions.** Easier once slide text is extracted (on-device
  text recognition, built 2026-10-31).
- **Export a written summary** to Notes, email or Notion, alongside the deck.
