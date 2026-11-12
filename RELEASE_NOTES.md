# Release notes

Every TestFlight upload gets an entry here, newest first, with the notes that
went into its **What to Test**. Version stays **2**; only the build number
changes.

**Groups**
- **Internal** ("Conference test group"): every upload. No Apple review.
- **Friends** (external): only builds we choose to send, after Apple's beta
  review. When sending a build to Friends, combine the notes of every build
  since the last one Friends got (marked below).

**Last build sent to Friends: 68** (submitted for beta review 2026-11-12;
Friends had build 64, which App Store Connect shows was also sent).

---

## Build 69 — internal

What to Test:

```
- Live transcription keeps going when you leave a recording session. Start a session, go back to the sessions list (or open another session or a presentation) for a minute while someone talks, then come back: the transcript should have no gap.
- The Lock Screen / Dynamic Island recording stays up while you browse, and its Pause works from any screen.
- Pausing still stops the mic. Leaving a paused session still removes the Lock Screen recording.
- Opening the app doesn't start listening by itself, even if a session was left on REC.
```

## Build 68 — internal, Friends

The Friends notes below (builds 64–68) are build 68's What to Test in App
Store Connect for every group (it has one box), as with build 63.

What to Test (internal):

```
- Chui's audio has its own settings now: turn it on in Menu > Session options and they fold open underneath.
- Clip length: "Before the tap" (0-60 sec, default 5) and "After the tap" (0-2 min, default 44). Try a few lengths; the button's countdown should match "After".
- Snap to sentences (off): clips start and end at a pause instead of mid-word.
- Voice boost (on): turns down room noise in the saved clip only -- the live transcript is untouched. Compare a clip with it on and off in a noisy room.
- Upload on Wi-Fi only (off): on mobile data, clips wait on the phone and upload once you're on Wi-Fi.
- Keep only the trimmed part (on): trim a clip, leave the session, come back -- the handles can now only move inward.
- Clips in shared presentations (off): share a presentation that has clips -- the link and download leave them out; in the app they still play. Turn it on and share again to include them.
```

For Friends (combined notes, builds 64–68 — this is what went into App
Store Connect):

```
New since build 63:

SESSION OPTIONS (new, top of the menu)
- Remember this (on): the star that marks a key moment.
- Chui's audio (off): a button that keeps a clip of the speaker's voice. Turn it on and its settings fold open underneath.

CHUI'S AUDIO -- CLIPS OF THE SPEAKER
- While a talk is listening, tap the waveform button (beside the star, also in the camera): it keeps the seconds just heard and records on, with a countdown. Tap again to stop early.
- Set how long: "Before the tap" (default 5 sec, up to 1 min) and "After the tap" (default 44 sec, up to 2 min).
- Drag the handles on a clip's waveform to trim it. Play plays the kept part.
- Presentations include your clips: a play button with a one-line caption, in the chapter where it was said.
- Voice boost (on) cleans up room noise in the clip; Snap to sentences (off) starts and ends clips at a pause; Upload on Wi-Fi only (off); Keep only the trimmed part (on).
- Clips in shared presentations is off: links and downloads you share leave clips out unless you turn it on.

PRESENTATIONS
- When a talk doesn't say who's speaking, the speaker is the first author on the title slide.
- Share link opens the share sheet right away; the presentation uploads behind it.

SHARED WITH YOU
- Shared presentations are yours to keep: once added, one stays even if the sender deletes it ("Your saved copy").
- "Pinned" and "Shared with you" fold away like the days.

HOME AND SESSIONS
- New sessions are named "Session 1 : 11/12" (month/day) until Sparkle names them.
- A paused session leaves the live spot after 3 minutes.
- The home list keeps its place when you come back from a presentation or session.
- Remember this just marks the moment now (no audio).
```

---

## Build 67 — internal

What to Test:

```
- New "Session options" at the top of the menu, saved to your account. Two switches for the buttons beside the camera while a talk records: Remember this (on) shows the star; Chui's audio (off) shows the clip button. With the star off, the clip button takes its spot. Nothing captured is removed.
- New sessions are named with month/day: "Session 1 : 11/12".
- Sparkle names the first author on the title slide as the speaker when the talk doesn't say who's speaking (new and rebuilt presentations).
```

---

## Build 66 — internal

What to Test:

```
- The clip button is now a waveform icon. In the camera, the star and clip button sit in the same places as on the session screen; held sideways (star on the left), the clip button takes the star's spot.
- New sessions are named "Session 1 : 12/11", "Session 2 : 12/11"... (numbered within the day) until Sparkle names them.
- A paused session leaves the live spot after 3 minutes (was 20).
```

---

## Build 65 — internal

What to Test:

```
- New mic button beside the star (session and camera, while listening): records a clip of the speaker -- 15 seconds before the tap and 45 after. The button counts down; tap it again to stop early.
- Drag the handles on a clip's waveform to trim it. Play plays the kept part.
- Presentations now include your clips: a play button with a one-line caption, in the chapter where it was said.
- Remember this just marks the moment now (no audio). Older clips still play.
- Share link opens the share sheet right away; the presentation uploads behind it.
- The home list keeps its place when you come back from a presentation or session.
```

---

## Build 64 — internal

What to Test:

```
- Shared presentations are yours to keep: once you add one, it stays in "Shared with you" even if the sender deletes it ("Your saved copy"). While it's still shared you see their latest version.
- "Pinned" and "Shared with you" fold away like the days (tap the heading), and stay folded.
```

---

## Build 63 — internal, Friends

Sent to Friends with these combined notes (builds 52–63), which are also
build 63's What to Test for every group:

```
New since build 51:

SHARING
- Share > "Share link": a link anyone can open in a browser, no app needed. Sharing again updates the same link.
- Got a link from someone and have the app? Tap "Open in app" and it appears under "Shared with you" on your home screen.
- Share > "Download" sends the presentation file itself: save to Files, text, email or AirDrop.

WORKS ON BAD CONFERENCE WIFI
- New Session starts at once, even with no signal.
- Notes, edits, stars, renames, pins, deletes and pause/resume save on the phone first and send when there's a connection.
- The app opens straight to your sessions, and loads only what changed.
- Your recent presentations are kept on the phone and open instantly, offline too.

PRESENTATIONS (SPARKLE)
- Build several at once: they queue and build one at a time ("Presentation queued").
- Links from QR codes on slides go into the References.
- Tapping a chapter in the chapter bar scrolls to it; text no longer runs to the screen edge.
- A finished session leaves the live spot at the top, so its card opens the presentation.

HOME SCREEN
- Sessions grouped by day; tap a day to fold it.
- Finished presentations show a key slide, the speaker, the date and minutes to read.
- Swipe a session for Edit, Share, Rebuild, Pin and Delete.

CAMERA AND PHOTOS
- Swipe down on a photo to close it.
- In the camera, press and hold a thumbnail to see it large.
- A light tap you can feel when you take a photo.

CLEARER MESSAGES
- Errors say what happened in a short line (e.g. "No signal", "Build stopped partway"), and a failed presentation shows why on its card.
```

The build itself:

New in build 63:

- Share now offers "Share link" and "Download". Download opens the share
  sheet with the presentation file, to save to Files, text, email or AirDrop.
  (It was called "Share file".)

## Build 62 — internal

New in build 62: share presentations by link.

- Share → "Share link" gives a link anyone can open in a browser, on a phone
  or a computer, no app or sign-in needed. Sharing the same presentation again
  updates the page behind the same link.
- Someone with Conference Capture who opens the link taps "Open in app" (or
  "Add to my sessions" on the website): the presentation appears on their
  home screen under "Shared with you" and opens your current version.
- If you delete the session, the link stops opening and their card says "No
  longer shared" (swipe to remove it). Deleting your account removes your
  shared pages too.
- "Share file" still sends the page itself, for a copy that's theirs to keep.

## Build 61 — internal

New in build 61:

- Presentations: tapping a chapter in the sticky chapter bar scrolls to it,
  instead of leaving a black screen.
- Presentations whose text ran to the edge of the screen now get side
  margins when you view them (every presentation, old and new).
- (Server, already live:) Sparkle now always writes side margins into new
  presentations, so they look right when shared and opened outside the app.

## Build 60 — internal

New in build 60:

- Clean-up only: the old Enhance feature (hidden since October; Sparkle does
  its job now) is removed from the app, and its server function is deleted.
  Nothing you use changes.

## Build 59 — internal

New in build 59: errors say what happened.

- Every error is one short line, decided ahead of time -- e.g. "Out of
  Claude API credits", "No signal", "Signed out or sign-in expired",
  "Build stopped partway". Anything else reads "Something went wrong, try
  again". No more raw technical messages.
- A presentation that failed shows its reason on the card, beside the red !.
- Out of Claude API credits: the presentation goes back to the front of the
  queue and the rest keep their places, instead of each failing in turn. The
  app tries again every 15 minutes and carries on by itself once there's
  credit. (Server part live 2026-11-10.)
- A change the server refuses, or the phone running out of space, now says
  so instead of failing silently.

## Build 58 — internal

New in build 58: made for bad conference wifi.

- New Session starts at once, even with no signal.
- Notes, note edits, stars, hiding, moving, renaming, pinning, deleting, and
  pause/resume all save on the phone first and go to the server when the
  connection allows -- no more "failed to save".
- Opening the app or pulling to refresh loads only what changed since last
  time, not every session's entries again (a full reload at most once a day).
- A presentation's finished page (photos embedded, often 10 MB) goes back to
  the server only on a fast connection; it's kept on the phone meanwhile.
- Still need a connection: videos.

## Build 57 — internal

New in build 57:

- Presentations no longer show a stray "```html" line at the top. Ones
  already built are tidied the first time they're opened.
- (Server, already live:) new presentations are saved without it, and the
  website opens presentations as a page instead of showing their code.

## Build 56 — internal

New in build 56:

- Swipe down on a photo you're viewing in a session to close it, the same
  gesture as after taking a photo. A short drag springs back; when zoomed in,
  dragging moves around the photo instead.
- In the camera, press and hold a thumbnail in the row to see that photo
  large; let go to keep shooting.
- A light tap you can feel each time you take a photo.
- (Server, already live:) presentations build one at a time, so asking for
  several no longer hits Claude's rate limit; one asked for while another
  builds shows "Presentation queued" and starts by itself.

## Build 55 — internal

New in build 55:

- A session whose presentation finished building leaves the live spot at the
  top straight away, so its card opens the presentation.
- No signal? "Load failed" now reads "No connection", and the list reloads
  and the message clears by itself when you're back online.
- Presentations build one at a time: ask for another while one is building
  and its card says "Presentation queued" until its turn. (Server update
  went live 2026-11-10.)

## Build 54 — internal

New in build 54: links from QR codes

- Photograph a slide with a QR code and the phone reads the link, along with
  the slide's text. The link goes into the presentation's References and the
  session summary's references, named by what the slide says it's for, even
  when the photo itself is left out as a repeat. Search finds it too.
- Only photos taken on build 54 or later; older photos aren't re-read.
- Starting the app no longer flashes white before your sessions appear.

## Build 53 — internal

New in build 53: faster on a phone connection

- The app opens straight to your sessions, even when your sign-in needs
  renewing or there's no signal, instead of a blank screen.
- Presentations are kept on the phone: your 12 most recent (and pinned ones)
  download in the background once they're ready, so tapping a card opens
  them at once, with no signal too. Others are kept after the first open.
- Opening a presentation for the first time fetches its photos all at once
  instead of one by one.
- Swipe shows Edit only on sessions whose tap opens the presentation.

## Build 52 — internal

New in build 52: a home list you can scan

- Sessions are grouped by day (Today, Yesterday, "Sun, Nov 8") with a count.
  Tap a day to fold it away; it stays folded.
- A session with a finished presentation shows a slide from the talk, the
  speaker and where they're from, and the date and minutes to read. Tap it
  to open the presentation.
- Swipe a session for Edit (opens the session), Share, Rebuild, Pin and
  Delete. Pinned sessions sit at the top.
- The slide on the card is one Sparkle picks as the most telling (a chart or
  key idea, not the title slide); a photo you starred wins. Rebuild an older
  presentation to get Sparkle's pick and the reading time.

## Build 51 — internal, Friends

New in build 51: a photo deleted after its presentation was built is taken
out of the presentation when it opens, instead of showing as a broken image.

Friends got these notes (builds 49, 50 and 51 combined):

New since your last build (48):

Fixes
- A photo you delete from a session is taken out of a presentation built before you deleted it, instead of showing as a broken image.
- Past 1,000 entries in total, the newest sessions showed up empty or seemed missing. Everything loads now.
- Sign-in emails now show just the code, so work email security can't use it up before you type it.

Faster
- Your sessions show the moment the app opens, from a copy saved on the phone, then refresh. With no signal, the last loaded sessions still show.

Session cards and capture
- Session cards show how long each talk was recorded.
- While recording, the camera has a Remember this star right of the shutter, in the same spot as the star beside the camera button in the session. Held sideways, it's below the shutter.

Presentations
- Repeat photos of a slide that builds up are left out, keeping the fullest one (Presentation options > Skip repeated slides, on by default).

## Build 50 — internal

New in build 50: every session shows, and it opens faster

- Fixed: past 1,000 entries in total, the newest sessions showed up empty
  or seemed missing. Everything loads now.
- Your sessions show the moment the app opens, from a copy saved on the
  phone, then refresh. With no signal, the last loaded sessions still show.
- Session cards show how long each talk was recorded.
- The Remember this star sits just right of the camera button, and in the
  camera just right of the shutter, in the same spot. Held sideways, it's
  below the shutter.
- Building a presentation leaves out repeat photos of a slide that builds
  up, keeping the fullest one (Presentation options > Skip repeated slides,
  on by default).

## Build 49 — internal

New in build 49: Remember this from the camera

- While a session is recording, the camera has a star to the left of the
  shutter. Tap it to Remember this without leaving the camera: same as the
  star on the session screen (marks the moment and saves a short clip).

## Build 48 — internal, Friends

Friends got these notes (builds 45, 46 and 47 combined):

New since your last build (44):

Sparkle fills in the session
- Building a presentation saves a summary, action items, speaker bio, acronyms and references into the session, so you can find them and Ask about them. Rebuilding replaces them, except any you've left out.
- Menu → Presentation options has a new "Save to the session" group with a switch for each of those five, and the other options are regrouped: In the presentation, Layout and style, Writing.
- Building a presentation also moves notes and photos you haven't placed to the spot in the talk they're about.

Entries stay where you put them
- Dragging a note or photo puts it at that moment in the talk, and it stays there: Sparkle never moves an entry you've placed.

A guided tutorial
- Menu → Tutorial walks you around the home screen: New Session, your sessions, what's behind a swipe (build, view, share or rebuild the presentation; delete), search, sort and the menu.
- Open a session afterwards and a second tour shows record, camera, notes, what's behind a swipe on an item (save to Photos, star, leave out, delete, drag to reorder), Remember this and Ask.

Account and sign-in
- Sign-in codes are now 6 digits, typed into six boxes. Pasting or tapping the code iOS suggests fills them all, and it signs you in by itself.
- Menu → Privacy policy opens the policy in Safari.
- Menu → Delete account permanently deletes your account and everything in it, after showing what will go. Please don't try it on your real account.

Internally: same as build 47, which opened to a blank screen (built the wrong way for
the phone). Use build 48 instead; its notes are build 47's below.

## Build 47 — internal (blank screen; replaced by 48)

New in build 47: Sparkle fills in the session, and entries stay where you put them

- Building a presentation saves a summary, action items, speaker bio,
  acronyms and references into the session, so you can find them and Ask
  about them. Rebuilding replaces them, except any you've left out.
- Menu → Presentation options has a new "Save to the session" group with a
  switch for each of those five, and the other options are regrouped: In the
  presentation, Layout and style, Writing.
- Building a presentation also moves notes and photos you haven't placed to
  the spot in the talk they're about.
- Dragging a note or photo puts it at that moment in the talk, and it stays
  there: Sparkle never moves an entry you've placed.

## Build 46 — internal

New in build 46: delete account, privacy policy, simpler codes

- Menu → Delete account: shows what will be deleted, then permanently
  deletes your account, sessions, photos, videos, presentations and settings,
  and clears the app on this phone. Please don't try it on your real account;
  try it after Start without an account instead.
- Menu → Privacy policy opens the policy in Safari.
- Sign-in codes are now 6 digits, typed into six boxes, one per digit.
  Pasting or tapping the code iOS suggests fills them all, and it signs you
  in by itself.
- Tutorial: the search step mentions Ask Claude for questions across all
  your sessions.

## Build 45 — internal

New in build 45: a guided tutorial

- Menu → Tutorial walks you around the home screen: New Session, your
  sessions, what's behind a swipe (build, view, share or rebuild the
  presentation; delete), search, sort and the menu.
- Open a session afterwards and a second tour shows record, camera, notes,
  what's behind a swipe on an item (save to Photos, star, leave out, delete,
  drag to reorder), Remember this and Ask.
- A brand-new account sees the tutorial by itself the first time.

## Build 44 — internal, Friends

Friends got this build with the combined notes below (their What to Test,
covering builds 37–44). The internal-only notes for 44 follow.

**Friends notes**

What's new since build 36

Home screen
- The app logo replaces the title at the top.
- Search and sort are round buttons at the bottom, next to New Session. Tap
  search and it grows into a search field, with the keyboard sliding up
  alongside it.
- Sort your sessions: Newest first, Oldest first, Last activity, Name A-Z, or
  Has presentation. Sessions you're recording in stay at the top.

Menu (top right)
- Presentation options: choose what your presentations include and how they
  look. Turn the TL;DR, quotes, action items, references, chapter bar, speaker
  bio and chapter times on or off; pick still or scrollytelling, interactive
  charts or photos only, theme and accent color, full or short,
  all/starred/no photos, the voice, and the language. Saved to your account
  and used for presentations you build from now on.
- Your account email (or Add email), Send feedback, and Sign out. Tutorial,
  Claude API key, Privacy policy and Delete account are coming soon.

Session screen
- Record/pause, camera, star and Ask sit in one simple row at the bottom; the
  camera is where the shutter is.
- The row hides while you type a note, and the note field slides up with the
  keyboard.
- The timer is shorter (7:12 instead of 00:07:12), and the note and photo
  counts moved off the top (they're on the session card).
- The bar with arrows and a check mark above the keyboard is gone.

Presentations
- Sessions you haven't named get a title when you build their presentation.

Please try Presentation options and rebuild a presentation to see the
difference. Use Send feedback in the menu to tell us what you think.

**Internal notes**

New in build 44: a calmer, animated menu and the app logo

- The home screen header shows the app icon's two rings instead of the
  "Conference Capture" title.
- The menu is now a simple list on black with dotted lines between items;
  Sign out sits on its own at the bottom.
- Opening the menu: the menu icon's lines spread apart and the list opens
  out from the top. Tap the icon again to close it (there's no Done button).

## Build 43 — internal

New in build 43: menu and presentation options

- A menu button (☰) replaces Sign out at the top of the home screen.
- Presentation options: choose what your presentations include and how they
  look. Turn the TL;DR, quotes, action items, references, chapter bar,
  speaker bio and chapter times on or off; pick still or scrollytelling,
  interactive charts or photos only, theme and accent color, full or short,
  which photos, the voice and the language. Saved to your account, and used
  for presentations you build from now on.
- Also in the menu: your account email (or Add email), Send feedback, Sign
  out, and the build number. Tutorial, Claude API key, Privacy policy and
  Delete account are coming soon.
- New presentations of untitled sessions now get a generated title again.

Please try a few options and rebuild a presentation to see the difference.

## Build 42 — internal

New in build 42: search opens in one motion

- Tapping search now brings up the keyboard right away, so the search bar
  grows and slides up with the keyboard at the same time, just like closing.

## Build 41 — internal

New in build 41: search outline

- When you tap search, the teal outline now fades in as the search bar grows,
  instead of appearing only when the keyboard arrives.

## Build 40 — internal

New in build 40: the keyboard pushes things up smoothly

- Search: the search bar stays on screen and slides up with the keyboard,
  instead of vanishing and reappearing.
- Adding a note: the note field stays on screen and slides up with the
  keyboard the same way.

## Build 39 — internal

New in build 39: smoother typing and search

- While you type a note, the bottom row (record, camera, star, Ask) hides so
  the keyboard has room. It comes back when the keyboard closes.
- Ask is now just the speech-bubble icon.
- Tapping search grows the search bar first, then the keyboard slides up and
  lifts it. Tell us if the timing feels too slow or too fast.

## Build 38 — internal

New in build 38: a simpler session screen

- Record/pause, camera and Ask are now in one row at the bottom. The camera
  is in the middle, where the shutter is. Record and the timer are on the
  left; Ask is on the right.
- The star (Remember this) shows next to Ask while recording.
- The note and photo counts are gone from the top; the session card on the
  home screen still shows them.
- The timer is shorter: 7:12 instead of 00:07:12.
- The bar with arrows and a check mark above the keyboard is gone. Use
  Return, Search, × or the note's own check mark to finish typing.

## Build 37 — internal

New in build 37: a new bottom bar and sorting

- Search and sort moved to the bottom, next to New Session, as round buttons.
- Tap search and it grows into a search field across the bar; New Session and
  sort tuck away. Tap × to close and they come back.
- Sort your sessions: Newest first, Oldest first, Last activity, Name A–Z, or
  Has presentation. The app remembers your choice. Sessions you're recording
  in stay at the top.

## Build 36 — internal, Friends

New in build 36: sign in with your email

- Sign in with a code: enter your email, then type the code we email you. No
  more links opening Safari.
- Add email: if your account has no email, Add email replaces Sign out at the
  top of the home screen. Adding one keeps all your sessions and lets you get
  back to them on any phone.
- Signing out no longer loses your sessions. The app stays on the sign-in
  screen so you can sign back in.
- If you were signed out earlier: open the app, tap Add email (or use the
  sign-in screen), enter the email you signed up with, and type the code.

The sign-in email comes from Andrew's Gmail. If it doesn't arrive, check spam.

## Build 35 — internal, Friends

Save photos to your iPhone
- Swipe left on a photo and tap the download icon, or tap the same icon when
  viewing a photo.
- The first time, tap Allow so the app can add to your photo album.

Presentations with lots of photos
- Sessions with many photos no longer get stuck on "Building presentation."
- If a build ever stops, the session now shows an error so you can try again.
- The first time you open a new presentation it may take a little longer while
  the photos load.
- Star your most important slides. The AI looks at up to 20 photos closely,
  starred ones first. All your photos still appear in the presentation.

Audio clips (please try this)
- Remember this now saves a short audio clip, ending when the speaker finishes
  the thought.
- Pause or end the session to play it back.
- Clips stay on your phone for now and aren't added to presentations yet.

Also fixed
- The first tap after swiping a row no longer gets ignored.
- Deleting a session now removes its presentation too.

Please tell us how the audio clips sound in a real room, and whether saving
older photos works.
