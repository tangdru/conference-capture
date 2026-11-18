# Release notes

Every TestFlight upload gets an entry here, newest first, with the notes that
went into its **What to Test**. Version stays **2**; only the build number
changes.

**Groups**
- **Internal** ("Conference test group"): every upload. No Apple review.
- **Friends** (external): only builds we choose to send, after Apple's beta
  review. When sending a build to Friends, combine the notes of every build
  since the last one Friends got (marked below).

**Last build sent to Friends: 97** (added 2026-11-17 and approved at
once -- "Testing"; Friends had build 89).

---

## Build 97 — internal, Friends

Uploaded 2026-11-17. End takes you back to the session list. The camera's
swipe-down arrow shows from the start. Video player: no ✕ (swipe down to
close), time centred above the video, shorter strip closer to it, and a
swipe-down hint at the bottom.

What to Test:

```
END
- Tap End in a session: it ends and you're back on the session list, with the session under past sessions.

CAMERA
- Open the camera: the teal ↓ next to "Swipe down to return to notes" shows before you take a photo.

VIDEO PLAYER
- No ✕. The time and length sit centred in the space above the video.
- The trim strip is shorter and closer under the video.
- "Swipe down to return to notes ↓" shows at the bottom; swiping down anywhere closes it.
- Dragging the trim handles never closes it.
```

Friends What to Test (builds 90–97 combined):

```
New since build 89:

VIDEO CLIPS
- In the camera, HOLD the shutter (or a volume button) to record a video clip, up to 30 seconds. A quick tap still takes a photo.
- Clips have sound, whether or not the session is transcribing.
- Back in the session, a "Video clip" row shows at the time you started, with its first frame and length.
- Tap it to play. Tap the video to pause or play. Swipe down to close.
- While the session is transcribing, clips play without sound (the microphone is busy). Pause the session to hear them.
- Drag the handles on the strip of frames to trim a clip. Tap the strip to jump to a point.
- Swipe a clip row left: Save to Photos saves the part you kept; Delete removes it.
- Clips stay on your phone for now. They don't upload or appear in presentations yet.

END A SESSION
- Tap End at the top right of a recording or paused session. The microphone stops, the Lock Screen recording goes away, and you're back on the session list with the session under past sessions.
- An ended session can still be edited: notes, photos, stars, trimming, presentations.
- Starting a new session while one is recording ends the old one.

RECORDING IN ANOTHER SESSION
- While a talk is recording, tapping record in another session asks first: Continue reading, Record here (ends the other talk), or Go to that talk.
- Tapping record in a session that ended a while ago asks: Resume recording, New session, or Cancel.

CAMERA
- The teal arrow next to "Swipe down to return to notes" now shows from the start.

FIXES
- Opening a session that was left recording no longer takes the microphone from the talk you're recording.
- Moving the microphone between sessions no longer saves the last line in both.
- After switching sessions, transcription starts again right away.
- If a phone call interrupts transcription and it can't restart, the message tells you to pause and resume to restart transcription.
```

## Build 96 — internal

Uploaded 2026-11-17. New wording in the record box, and the video player's
small play button by the trim strip is gone (tap the video to play or pause).

What to Test:

```
RECORD BOX
- While a talk is recording, open an older session and tap record. The box offers: Continue reading, Record here (ends the other talk), or Go to that talk.
- With nothing recording, tap record in a session that ended a while ago. The box offers: Resume recording, New session, or Cancel.

VIDEO PLAYER
- No play button next to the trim strip. Tap the video to play or pause; the big play symbol shows while it's paused.
- The trim strip now uses the full width; trimming and tapping to jump still work.
```

## Build 95 — internal

Uploaded 2026-11-17. End session button, and a check before recording in a
session that isn't live. Fixes from Chui's conference day: a new session no
longer leaves the last one recording, lines are no longer saved into two
sessions when the mic moves, and the mic no longer goes quiet after
switching sessions.

What to Test:

```
END A SESSION
- While recording (or paused), tap End at the top right. The mic stops, the Lock Screen recording goes away, and the session moves into past sessions right away.
- An ended session can still be edited: notes, photos, stars, trimming, presentations.
- Start a new session while one is recording: the old one ends and the new one gets the mic.

RECORDING IN ANOTHER SESSION
- While a talk is recording, open an older session and tap its record button. A box asks first: Keep reading (the talk keeps recording), Go to that talk, or Record here (which ends the other one).
- With nothing recording, tap record in a session that ended a while ago. A box asks: Keep reading, New session, or Record here.
- Pausing and resuming the talk you're in never asks.

FIXES
- Opening a session that was left recording no longer takes the mic from the talk being recorded.
- Moving the mic between sessions no longer saves the last line in both.
- After switching sessions, transcription starts again right away instead of going quiet until pause and resume.
```

## Build 94 — internal

Uploaded 2026-11-17. Video player: its own play button instead of the
system controls (no unmute, full screen or picture in picture), swipe down
to close, tap the strip to jump. Clearer interruption message.

What to Test:

```
VIDEO PLAYER
- While the session is listening, a clip plays without sound and there's no way to unmute it. The note under it says sound plays when transcription isn't running. Transcription keeps going.
- Pause the session: the clip plays with sound.
- No full screen or new window buttons in the top left.
- Tap the video or the play button to play or pause. Tap the strip of frames to jump to that point.
- Swipe down on the video to close it, like a photo. A short drag springs back.
- If transcription is ever interrupted, the message now says to pause and resume to restart transcription.
```

## Build 93 — internal

Uploaded 2026-11-16. Video clips step 2: clips show in the session, play,
trim, save to Photos and delete. Clips recorded while the session isn't
listening now sound like the others (raw mic, voice boost). The automatic
copy of every clip to Photos (build 90-92 test) is gone.

What to Test:

```
VIDEO CLIPS IN THE SESSION
- Hold the shutter to record a clip. Back in the session, a "Video clip" row shows at the time you started, with its first frame and length.
- Tap the row: it plays full screen. While the session is listening it plays without sound (the mic is busy); pause the session to hear it.
- Drag the handles on the strip of frames under the video to trim it. Close: the row shows the new length.
- Swipe the row left: Save to Photos saves just the kept part. Delete removes it.
- Leave the session and come back: a trimmed clip is cut down for good (Keep only the trimmed part).
- Record a clip with the session paused: its sound should match one recorded while listening.
- Check the X on the video player closes in one tap.
- Clips stay on this phone for now (no upload, not in presentations yet).
```

---

## Build 92 — internal

Uploaded 2026-11-16. Video clips now have sound (build 90's clips were saved
picture-only: the step that lays the sound under the picture failed). Also
has build 91's crash fix. Each clip is still copied to Photos for testing.

What to Test:

```
VIDEO CLIPS: SOUND
- In a live session (listening), open the camera and HOLD the shutter while someone talks. Let go, then open the clip in Photos: you should hear them.
- Pause the session (or turn Live transcript off), record another clip: it should have sound too (from the camera's own mic).
- Clips still don't show in the session yet; each one is copied to Photos for checking.
```

---

## Build 91 — internal

Uploaded 2026-11-16. Fixes build 90 closing when you open a session (the
camera's background setup for video clips was rejected by iOS).

What to Test:

```
CRASH FIX
- Open an ended session (e.g. Session 1 : 11/12 or Session 2 : 11/12): it opens and shows its transcript, no longer closing the app.
- Open the camera and HOLD the shutter to record a video clip as in build 90; a tap still takes a photo.
```

---

## Build 90 — internal

Uploaded 2026-11-15. Video clips, step 1 (recording only). Clips don't show
in the session yet; as a test shortcut every clip is also copied to the
Photos album (to be removed with step 2).

What to Test:

```
VIDEO CLIPS (first part)
- In a session, open the camera and HOLD the shutter (or a volume button): it records video. The shutter's centre turns into a red square and a timer shows at the top (up to 0:30). Let go to stop; it stops on its own at 30 s.
- A quick tap still takes a photo.
- The clip appears in the camera's thumbnail strip with a play mark; hold it to watch (muted).
- For now each clip is also saved to your Photos album (allow "Add to Photos" the first time). Check it there: picture upright, and the speaker's sound when the session was listening.
- Clips don't appear in the session yet -- that's next.
```

---

## Build 89 — internal, Friends

Uploaded 2026-11-15. Everything from 88, plus two haptics. Sent to Friends
2026-11-15.

What to Test:

```
HAPTICS
- Session list: swipe a session (live, ended or one with a presentation) left to open its menu (a tick), then swipe it shut or tap the card: a second tick once it's fully closed. A half swipe that springs back stays silent.
- Session list: tap a day heading to fold it, and again to open it: a tick each time.
```

For Friends (combined notes, builds 82–89 -- this is what went into App
Store Connect; written for accounts not on the free list, which is all of
Friends):

```
New since build 81:

CLAUDE MAKES YOUR PRESENTATIONS AND ANSWERS QUESTIONS
Presentations and questions now happen in Claude, which reads your sessions through a private link. You need the Claude app and a Claude Pro (or Max, Team, Enterprise) plan.
- After updating, an invitation asks you to connect. Connect to Claude opens the Claude app with Conference Capture filled in: tap Add. Not now hides it for a few days.
- Session list: the search button is now a chat button. It opens a new Claude chat ready to ask about all your sessions.
- Swipe left on a session and tap the sparkle: Claude opens ready to make the presentation. Tap send. The presentation, summary, action items and the rest appear back in the app.
- Inside a session, the speech bubble opens Claude ready to ask about that talk.
- Menu > Use in Claude: add it in Claude, or copy or share your link to add it on a computer (Claude > Settings > Connectors > Add custom connector). Keep the link private.
- Please try asking Claude about a talk while it's still going, too.

SESSION OPTIONS: DURING A TALK (Menu > Session options)
- Live transcript (on): turn it off and the microphone stays off: nothing is transcribed and there are no clips.
- Show transcript while live (on): turn it off and the timeline shows only your photos, notes, stars and clips while recording. A Transcribing light at the top shows bars that move while the speaker talks and the time recorded; it turns amber after 90 seconds of silence and red if transcription stops. Pause, and the full transcript appears.
- Stay live after a pause (3 min): how long a paused session stays at the top of your sessions, from 30 seconds to 10 minutes.

HAPTICS
- A light tick when a session's swipe menu snaps shut (as well as when it opens), and when you tap a day heading to fold or open it.

Also: slide photos now keep only the cropped copy, which saves storage.
```

## Build 88 — internal

Uploaded 2026-11-14. Replaces 87's Transcribing box (test this one; it has everything from 87).

What to Test:

```
TRANSCRIBING LIGHT
- Menu > Session options > Show transcript while live: off. Record: the Transcribing light now sits at the top of the timeline under the session title, with no box, and shows the time recorded ("1:32 recorded"). It stays put while the timeline scrolls.
- Bars move while the speaker talks; amber "Not hearing anything" after 90 seconds of silence; red if transcription stops.
- Everything else from 87 (Live transcript, Stay live after a pause, slide photos keep only the cropped copy).
```

---

## Build 87 — internal

Uploaded 2026-11-14. New Session options under "During a talk", and slide photos no longer keep a second, uncropped copy in storage.

What to Test:

```
SESSION OPTIONS: DURING A TALK (Menu > Session options)
- Live transcript (on): turn it off and record. Nothing is transcribed, the microphone stays off, a grey "Not transcribing" box says so, and the clip button is gone (Chui's audio greys out in Session options).
- Show transcript while live (on): turn it off and record. The timeline shows only your photos, notes, stars and clips. In place of the scrolling words, a "Transcribing" box shows bars that move while the speaker talks and how many minutes are written down. It turns amber ("Not hearing anything") after 90 seconds of silence and red if transcription stops. Pause: the full transcript appears in the timeline. Clips still show their words.
- Stay live after a pause (3 min): slide it to 30 sec or 10 min, pause a session, and check how long it stays at the top of your sessions.

PHOTOS
- Photograph a slide: it's cropped and straightened as before. Only the cropped photo is kept now (the unused uncropped copy is no longer uploaded).
```

---

## Build 86 — internal

Uploaded 2026-11-14. Adds the free list. Accounts whose email is in Supabase's cc_free_users table use Andrew's Claude API key in the app; everyone else (Andrew included) uses Claude through the connector, as in 85. The list starts empty. The server still lets every account use the shared key until Friends have this build (FREE_LIST_ONLY off).

What to Test:

```
FREE LIST AND CLAUDE
- Your account (not on the free list): everything works as in 85. The sparkle, the chat button and a session's ask button all open Claude.
- Menu: the hidden "Claude API key" screen is gone for good; nobody adds their own key.
- An account on the free list (add its email in Supabase): no "Connect to Claude" invitation. The sparkle builds the presentation in the app, the chat button opens the in-app Search or ask screen, and a session's speech bubble opens in-app Ask about this talk.
```

---

## Build 85 — internal

Replaces 84 (test this one; it has everything from 84). The only change: the sparkle now makes the presentation in Claude, and 84's extra speech-bubble-with-star swipe button is gone.

What to Test:

```
CLAUDE DOES THE ASKING AND PRESENTATIONS
- First open after updating (when not yet connected): a "Make presentations and ask questions in Claude" invitation. Connect to Claude opens the Claude app at Add custom connector with Name and URL filled in: tap Add. Not now closes it; it comes back after 3 days or 5 opens until you connect.
- Coming back from Claude after Connect: a short tour of where Claude is used.
- Session list: the search button is now a chat button. It opens a new Claude chat ready to ask about your sessions.
- Swipe left on a session and tap the sparkle (Generate / Regenerate presentation), or tap a failed presentation's red icon: Claude opens ready to make the presentation. Tap send; the presentation, summary, action items and other entries appear in the app, and notes move next to what they're about.
- Inside a session: the speech bubble opens Claude ready to ask about that talk.
- Not connected yet? Those buttons show the invitation first.
- Menu > Use in Claude: Add to Claude does the same as Connect; Copy and Share are for adding it on a computer.
- In-app search and the in-app Ask Claude screens are gone.
```

---

## Build 84 — internal

What to Test:

```
CLAUDE DOES THE ASKING AND PRESENTATIONS
- First open after updating (when not yet connected): a "Make presentations and ask questions in Claude" invitation. Connect to Claude opens the Claude app at Add custom connector with Name and URL filled in: tap Add. Not now closes it; it comes back after 3 days or 5 opens until you connect.
- Coming back from Claude after Connect: a short tour of where Claude is used.
- Session list: the search button is now a chat button. It opens a new Claude chat ready to ask about your sessions.
- Swipe left on a session: the speech bubble with a star (Make presentation in Claude) opens Claude ready to make and save its presentation. Tap send; the presentation, summary and other entries appear in the app.
- Inside a session: the speech bubble opens Claude ready to ask about that talk.
- Not connected yet? Those buttons show the invitation first.
- Menu > Use in Claude: Add to Claude does the same as Connect; Copy and Share are for adding it on a computer.
- In-app search and the in-app Ask Claude screens are gone. Sparkle in the app still works as before.
```

---

## Build 83 — internal

What to Test:

```
USE IN CLAUDE
- Menu > Use in Claude: Make my link, then Copy link or Share it to your computer.
- In Claude (Settings > Connectors > Add custom connector, no sign-in), paste the link and ask about your talks.
- Ask Claude to make a presentation of a talk and save it to the app: it should appear on the session like a Sparkle one, with its cover photo, plus a summary, action items and other entries, and notes moved next to what they're about.
- Status under the link shows "Connected · last used ..." once Claude has used it.
- Make a new link stops the old one; Turn off stops Claude reading your sessions.
```

---

## Build 82 — internal

What to Test:

```
SEARCH IS NOW ASK CLAUDE
- Tap the search button on the session list: it grows into a full screen with the keyboard up.
- Typing shows sessions and earlier chats that mention the words as you type. Press send to ask Claude across all your sessions.
- Each question you send becomes a chat that's kept. Close and reopen search: your 5 most recent chats are under Recent, with "Show N more" / "Show less" for older ones. Tap one to pick it back up; the back arrow returns to the list.
- Swipe a chat left to delete it.
- Check the grow/shrink animation from the search button looks right, and the list scrolls straight away after opening.
```

## Build 81 — internal, Friends

What to Test (internal):

```
- The camera opens fast: the live picture shows about 0.4 s after touching the camera button (it was ~1.5 s), and about 0.1 s when reopened within 20 seconds. Measured in builds 79-80.
- The timing line under the shutter is gone.
- Check the camera still works as before: focus, zoom/lenses, flash, photos, Remember this, closing and reopening.
```

For Friends (combined notes, builds 76–81 -- this is what went into App
Store Connect; the clip-end haptic is left out because clips only finish
while recording, when iOS keeps haptics silent):

```
New since build 75:

FASTER CAMERA
- The camera opens much faster: the live picture shows in about a third of a second (it was about 1.5 s), and almost at once if you reopen it within 20 seconds.
- Please check it all still works: focus, lens buttons and zoom, flash, photos, Remember this, closing and reopening.

SWIPE BACK
- Swipe right from the left edge of a presentation or a session to go back to the session list, like iOS's own back swipe. The list slides into view underneath; let go past about a third of the way (or flick) to go back, or less to stay.
- The list keeps its place when you come back.

HAPTICS
- A light tick when a swipe has gone far enough: going back, opening a swipe menu, pulling the list to refresh.
- A solid tap as a presentation or session leaves the screen.
- New Session and Resume: a crisp click. Pause: a soft bump.
- While a session is recording, iOS keeps haptics silent so they never touch the recording.
```

## Build 80 — internal (measuring build -- not for Friends)

What to Test:

```
- The camera should open much faster: build 79's timings showed ~1.4 s lost after the sensors were already on (each opening rebuilt the running camera and re-asked for permission). Now one picture is reused and the picture shows as soon as frames come.
- The timing line under the shutter is still there (TEMPORARY): please screenshot the same three cases as build 79 -- first opening after opening a session, an opening 20+ seconds after closing, and one within 20 seconds.
- Check the camera still works as before: focus, zoom/lenses, flash, photos, closing and reopening.
```

## Build 79 — internal (measuring build -- not for Friends)

What to Test:

```
- TEMPORARY: the camera shows a line of timings under the shutter -- ms for each step of opening, from your finger touching the camera button (touch, tap, access, sensors on / was on, ready, screen up, frame or timer).
- Please screenshot it for: (1) the first camera opening after opening a session, (2) an opening more than 20 seconds after closing the camera, (3) an opening within 20 seconds of closing it.
```

## Build 78 — internal

What to Test:

```
- In any session (recording, paused or finished), swipe right from the left edge of the timeline: the session follows your finger with the session list underneath, and goes back to the list when let go past about a third of the way (or flicked). A short drag settles back.
- Same feel as swiping away a presentation: a light tick once far enough, a solid tap as it leaves. While a session is recording, iOS keeps haptics silent.
- Still works: the back button, swiping left on an entry for its menu, the record/pause pill.
- Back on the list, it's still scrolled where you left it.
```

## Build 77 — internal

What to Test:

```
Haptics (feel them on the phone):
- Swipe a presentation away: a light tick when you've dragged far enough that letting go closes it, then a solid tap the moment it's off the screen (the X does the tap too).
- Swipe a session or an entry to open its menu: a light tick as it snaps open.
- Pull the session list down to refresh: a light tick when pulled far enough.
- New Session: a crisp click as recording starts.
- Pause recording: a soft bump. Resume: a crisp click.
- A clip that runs its whole countdown: a soft bump when it finishes (stopping it by hand doesn't add one).
```

## Build 76 — internal

What to Test:

```
- Open a presentation, then swipe right from the left edge of the screen: it follows your finger with the session list underneath, and goes back to the list when let go past about a third of the way (or flicked).
- A short drag settles back. Dragging along the title bar works too.
- The X button now slides the presentation away.
- Back on the list, it's still scrolled where you left it.
```

## Build 75 — internal, Friends

What to Test (internal):

```
- Tap the camera button: the live picture should show much sooner -- the camera starts switching on the moment your finger touches the button.
- Close the camera and reopen it within 20 seconds: the picture is there at once.
- After closing, the green camera dot stays on for about 20 seconds, then goes off. Leaving the session or switching apps turns it off straight away.
```

For Friends (combined notes, builds 69–75 -- this is what went into App
Store Connect):

```
New since build 68:

CAMERA -- NOW A NATIVE IPHONE CAMERA
- Feels like the Camera app: no shutter lag, a steadier picture, faster repeat shots. Everything is where it was.
- New: press volume up or down (or the Camera Control button) to take a photo.
- Tap to focus: it stays on the spot you tapped, and a photo waits for focus to settle -- fewer blurry slides.
- Opens with a quick fade. It starts switching on as your finger touches the camera button; reopen it within 20 seconds and the picture is there at once (the green camera dot stays on for those 20 seconds).
- Sideways: photos come out landscape, the icons turn upright, and the star slides behind the shutter.
- Please check it all still works: flash, lens buttons and pinch zoom, the last 3 photos top-left (hold one to see it larger), Remember this and the clip button, swipe down to close.

RECORDING
- Live transcription keeps going when you leave a recording session -- browse the list, another session or a presentation, and come back to no gap.
- The Lock Screen / Dynamic Island recording stays up while you browse, and its Pause works from any screen.
- Opening the app doesn't start listening by itself.
```

## Build 74 — internal

What to Test:

```
- Tap the camera button: the live picture shows within a moment of the camera opening -- the viewfinder no longer stays black.
- The camera still fades in (no slide up from the bottom).
```

## Build 73 — internal

What to Test:

```
- Tap the camera button: the camera fades in at once (no pause, no slide up from the bottom), and the live picture fades in a moment later.
- Swipe down to close: it fades out.
- Take a few photos, close and reopen a couple of times to make sure nothing sticks.
```

## Build 72 — internal

What to Test:

```
- The camera opens straight onto the live picture, with no black screen first. Try it right after opening a session, and again after closing and reopening the camera.
- The first time after installing, the camera-access question may still appear before the camera opens.
```

## Build 71 — internal

What to Test:

```
- The camera opens again after you close it, in the same session or a new one (in 70 it only opened once until the app was restarted).
- Turn the phone sideways: the star slides behind the shutter to its other side, instead of over it, and turns to stay upright as you hold the phone.
- Everything from build 70's camera still applies.
```

## Build 70 — internal

What to Test:

```
- The camera is now a native iPhone screen. It should feel like the Camera app: no lag on the shutter, a steadier preview, faster repeat shots. Everything is where it was.
- New: press volume up or down (or the Camera Control button) to take a photo while the camera is open.
- Focus: tap the preview to focus; it now stays on the spot you tapped instead of jumping back to the middle. A photo waits for focus to settle before it's taken, and the shutter's tap comes after the photo.
- Check it all still works: flash (off/auto/on), lens buttons and pinch zoom, the last 3 photos top-left (+N), hold a thumbnail to see it larger, Remember this and the clip button (with its countdown) while recording, swipe down to close.
- Turn the phone sideways: the photo comes out landscape and the icons turn upright.
- Photos still appear in the session at once, get straightened and read, and upload.
```

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
