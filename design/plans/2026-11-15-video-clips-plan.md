# Video clips

**Status: agreed 2026-11-15. Steps 1-2 built (2026-11-16, builds 90-92 and step 2); steps 3-5 to do.** Requested 2026-11-10 (backlog,
Capture). Andrew's decisions on 2026-11-15:

1. Up to **30 seconds** per clip, for now.
2. **720p.**
3. Andrew moves Supabase to **Pro** (storage), so no tighter limit is needed.
4. Presentations **play the clip** itself.
5. Clips can be **played and edited in the session**, like audio clips.

## What it is

In the camera, **tap the shutter for a photo, hold it for video**, like the
iPhone Camera app. Letting go stops; at 30 s it stops on its own. The clip
lands in the session timeline at the time it started, where it plays inline
and can be trimmed. Presentations play it where it fits in the talk.

## Why the app's own camera makes this easy

Since the native rebuild the camera is the app's own screen
(`CameraViewController.swift` on `CameraEngine.swift`, one `AVCaptureSession`
kept warm for the whole session), not Apple's Camera app. So:

- **Same camera:** a movie output is added next to the photo output. Same
  lenses, zoom, focus and orientation; no new screen.
- **Hold already works:** the shutter reacts on touch-down (`shutterDown`);
  a hold past ~0.3 s starts recording, a quick tap still takes a photo.
- **Volume buttons / Camera Control:** press = photo as today; hold = video
  (`AVCaptureEventInteraction` reports the press's start and end).

## Recording

- **Sound comes from what's already listening.** During a live session the
  mic is busy with the transcript and the clip button's memory of the last
  2 minutes (`ClipRecorder`, 24 kHz). The camera records **picture only**, and
  when the clip ends the phone lays that stretch of the listening mic under it
  (an `AVMutableComposition`), so the saved file has sound with no fight over
  the mic. Voice boost (Session options › Chui's audio) applies the same way.
- **When the session isn't listening** (paused, or Live transcript off), the
  camera records its own sound for the clip, set up like the listening mic
  (raw, 24 kHz, voice boost) so both sound the same.
- **720p, H.264, 30 fps** (H.264 rather than HEVC so every browser plays it in a presentation): about 13 MB for 30 s.
- **Screen while recording:** the shutter turns into a red stop square inside
  the ring, a red timer shows `0:12 / 0:30`, the last-photos strip hides. The
  same tick as the shutter when it starts; haptics stay muted while the mic
  records (iOS rule, see memory).
- **To check first:** whether adding a movie output turns off zero shutter
  lag or quick repeat shots for photos. If it does, add the movie output only
  for the hold (a short reconfigure) rather than keeping it on.

## In the session (play and edit, like audio clips)

- New entry type **`video`**, mirroring `audio`: `payload` holds `path`,
  `startedAt`, `durationMs`, `trimStartMs`, `trimEndMs`, `width`, `height`,
  `poster` (the poster frame's path).
- **Timeline row:** the poster frame with a play mark and the kept length.
  Tap opens the full-screen viewer, which plays only the kept part.
- **Trim (as built):** in the viewer, two handles over a strip of 10 frames
  (made on the phone when the clip is saved). Like audio clips, trimming is
  only on the phone that recorded it (it holds the full file); other
  devices and the web play the uploaded cut.
- **While the session listens** the viewer plays without sound: the mic holds
  the sound (same reason audio clips don't play then).
- **Keep only the trimmed part** (existing Chui's audio option) applies to
  video too, when leaving the session.
- Swipe menu as for other rows: Delete, Exclude from presentation, Star.
- Save to Photos from the row's menu.

## Upload and storage

- File cut to the kept part on the phone (`AVAssetExportSession`,
  passthrough), uploaded to the existing private `cc-videos` bucket as
  `<user>/<id>-<start>-<end>.mp4`, re-uploaded after a trim, like audio clips.
- Uses the **background upload queue** that photos use
  (`PhotoUploadsPlugin`), not the audio clips' JS queue, since 15 MB must
  survive leaving the app. "Upload on Wi-Fi only" applies.
- The poster frame uploads as a small JPEG.
- Storage on Pro is fine at this size (100 clips ≈ 1.5 GB).

## What Claude gets

Claude can't take video. For each clip the phone picks **frames where the
picture changed** (1-4 per clip, compared on the phone) and sends them like
slide photos, with any text read off them; the words come from the
transcript for that stretch, as audio clip captions do. Frames count toward
the 20 images Claude sees per presentation, so clips' frames come after
slide photos when that limit is hit.

## Presentations

- generate-deck and the connector's `deck.ts` get a "Video clips" list like
  audio clips (`VIDEO_1` placeholders, time, what was said, its frames) and
  place each as `<figure class="cc-video"><video controls playsinline
  preload="metadata" poster="..." src="VIDEO_1"></video><figcaption>`.
- **Clips are not embedded** in the saved page (audio clips are, being small).
  A 15 MB video per clip would bloat every presentation and share. The page
  keeps a reference the app turns into a fresh signed link when the
  presentation opens; to be worked out with `compactDeckPhotos`.
- Shared presentations: follow "Clips in shared presentations" (off by
  default), as audio.

## Not in this

- Longer clips (raise the cap later).
- Video from the photo library.
- Recording from the session screen without opening the camera.

## Build order

1. Camera: hold-to-record, the recording look, the 30 s stop, saving with the
   listening mic's sound. Test on Andrew's iPhone 14.
2. Timeline row: poster, inline play, trim, delete; local first.
3. Upload (background queue, poster, re-upload on trim) and the web player.
4. Frames picked on the phone; generate-deck and connector `deck.ts`.
5. Presentation playback and the signed-link handling.
