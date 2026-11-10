# Release notes

Every TestFlight upload gets an entry here, newest first, with the notes that
went into its **What to Test**. Version stays **2**; only the build number
changes.

**Groups**
- **Internal** ("Conference test group"): every upload. No Apple review.
- **Friends** (external): only builds we choose to send, after Apple's beta
  review. When sending a build to Friends, combine the notes of every build
  since the last one Friends got (marked below).

**Last build sent to Friends: 51** (sent 2026-11-10)

---

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
