# Live points and Remember this lines

**Status: ON HOLD (2026-11-15).** Agreed with Andrew, but he can't test it:
his phone is an iPhone 14, which has no Apple Intelligence, so the on-device
model never runs on it. Pick this up once there's an Apple Intelligence iPhone
to test on (15 Pro or newer). Top item in `design/backlog.md`.

Replaces the backlog's "Running 'so far' card" and part of "Suggested
moments".

## Where the idea came from

Andrew's picture: during the live transcript, the top 20-30% of the session
screen builds a list of important things to remember, as one-liners, so you
can keep tabs during the talk. If the user disagrees with one, they delete it
quickly; he leans towards a small × on the right of each line. Kept points are
treated like Remember this: each one keeps its text and its time.

His next idea, the same day: give Remember this taps a one-liner too.

## How things work today (2026-11-15)

- Nothing analyses a talk while it's live. The phone transcribes the speaker
  on the device and saves the transcript about every 30 s. Claude runs only
  when a presentation is made (generate-deck) or a question is asked
  (ask-session, or Claude through the connector).
- A Remember this tap saves only its time (a `highlight` row, no text). The
  timeline shows "Remembered this moment" and the time, plus a clip if Chui's
  audio is on. Its meaning is worked out later by Claude: generate-deck (and
  the connector's deck.ts) give it what was said from 90 s before the tap to
  20 s after (`formatHighlights`); the connector's get_session shows
  "[12:40] Remembered" among the transcript lines for Claude to read around.

## Why the on-device model, not Claude

- Claude live would mean Andrew's API key on every refresh. Under the free
  list rule (see the Claude API key plan memory) only listed accounts use his
  key; everyone else uses Claude through the connector, and the connector
  can't push anything into the app (Claude only answers when someone talks to
  it in Claude). So Claude could only do this for the free list, at a cost
  per refresh.
- Apple's on-device model: free, private (the talk never leaves the phone),
  works offline on conference Wi-Fi, and good at short one-liners. Weaker than
  Claude at deep analysis, which stays Claude's job in the presentation.
  Limits: Apple Intelligence iPhones only, and a small context (about 4,000
  tokens), so it reads the talk in chunks.
- Checked 2026-11-15: Xcode 27.2's iOS SDK has FoundationModels.framework;
  the app's deployment target is iOS 15, so the code sits behind
  `#available(iOS 26)` like SpeechAnalyzerTranscriber.

## What it is

1. **Live points.** While a session records, the top of the session screen
   shows "So far": one-line points worth remembering, written on the phone
   every couple of minutes from the live transcript. A small × on the right
   removes a point. Points not removed are kept like Remember this moments.
2. **Remember this lines.** A Remember this tap gets a one-line statement of
   what it marked ("The API is now free for students") instead of only the
   time.

Both use Apple's on-device model (Foundation Models, iOS 26, Apple
Intelligence iPhones: 15 Pro and newer). Free, private, offline, no API key,
so it works for everyone, not just the free list. On phones without it the
panel doesn't appear and taps stay as they are today.

## How it works

**Native plugin** (`LivePointsPlugin.swift`, `#available(iOS 26)`):
- `availability()`: available, or why not (not supported, Apple Intelligence
  off, model still downloading). The app shows the panel only when available.
- `points({ lines, kept, removed })`: lines are the new transcript lines with
  their numbers; returns 0-2 new points, each with its text and the number of
  the line it came from (guided generation, so the output is structured).
  Told not to repeat a kept point or bring back a removed one.
- `line({ lines })`: one line for a Remember this tap.

**Cadence:** after about 2 minutes or about 250 new words of transcript,
whichever comes later, and never while one is still running. The model's
context is about 4,000 tokens, so it reads the new stretch plus the list of
points so far, not the whole talk.

**Saving:** each point is saved at once as a Remember this entry
(`type: 'highlight'`) with its text in the row's `text` column and
`payload.by = 'phone'` (taps are `by: 'tap'` or no payload). Its time is when
the line was said, not when the point appeared. × deletes the entry. Saving at
once means nothing is lost if the app is closed mid-talk.

**Remember this lines:** 20 s after a tap (so the sentence can finish), the
model reads the transcript from 90 s before to 20 s after and writes the line
into the same `text` column. Until then the row says "Remembered this moment",
as today.

## Screen

- "So far" sits at the top of the session while recording, under the
  Transcribing light when that shows: about a quarter of the screen, its own
  scroll, newest at the bottom (like the timeline). Each row: the line, its
  time (mono), and the ×.
- During recording the phone's points show only in the panel, not also in the
  timeline. Once recording stops they appear in the timeline as ★ rows with
  their text, the same as taps.
- Remember this rows show their line under "Remembered this moment".
- Session options › During a talk: **Live points** (on), nested under Live
  transcript, since it needs the transcript. Hidden on phones without the
  model.

## Presentations and Claude

- generate-deck and the connector's `deck.ts`: each moment's line goes into
  the "Remember this" list next to what was said around it.
- The connector's get_session: `[12:40] Remembered: <line>`.
- Phone-written points and taps are weighted the same, as Andrew asked. The
  `by` field keeps them apart in case that changes.

## Testing

The simulator can't transcribe, but the model runs in the simulator when the
Mac has Apple Intelligence on, so the points can be checked by feeding it a
saved transcript. Timing, battery and the quality of the lines in real talks
need an Apple Intelligence iPhone, which is why this is on hold: Andrew's
iPhone 14 can't run it, and on it the panel would simply never appear.

## Not in this

- Typed marks (Action item, Question...) and voice asides: still backlog.
- Suggested moments after the talk: the live points cover most of it.
