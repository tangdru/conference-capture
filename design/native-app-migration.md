# Native App Migration (Capacitor / iOS)

_Defined 2026-10-10, user override. Planning only — nothing built yet. No Capacitor project exists in this repo. Setup is deferred to the user's Mac (this session has no macOS/Xcode access); the web app on GitHub Pages is untouched by any of this._

## Governing principle

**Once native, default to Apple's built-in frameworks over our own reimplementations, wherever iOS already has the capability.** Don't carry browser-era workarounds into the native build just because that's what the web version had to do.

## Architecture

One shared codebase, not a fork. Capacitor wraps the existing `src/` and build output in a native iOS shell — two build/release *targets* (GitHub Pages web, Xcode/TestFlight iOS), not two apps to maintain in parallel.

Native-only capabilities are added as:
1. A thin Swift plugin layer (new files, additive — existing JS/TS is not rewritten)
2. A `Capacitor.isNativePlatform()` branch in the handful of existing call sites that need it (e.g. `useAmbientTranscription.ts`) — native path calls the new plugin, web path keeps today's behavior unchanged as the fallback

## Concrete unlocks identified so far

| Capability | Web today | Native unlock |
|---|---|---|
| Transcription | WASM Whisper (transformers.js), single-threaded (GitHub Pages can't set COOP/COEP), ~26MB model download, foreground-only | Apple's Speech framework (`SFSpeechRecognizer` / iOS 26 `SpeechAnalyzer`) — runs on the Neural Engine, no WASM, no model download/cache at all. Needs a custom Capacitor plugin (no official one). Web build keeps WASM Whisper as its only option regardless — browsers can't reach Apple's Speech framework. |
| Background recording | Tab must stay foregrounded — JS gets suspended within seconds of backgrounding on iOS Safari; this is *why* the whole chunked/concurrent transcription architecture exists | `AVAudioSession` background audio mode — phone can be locked, user can walk around, recording keeps going. Removes the single biggest UX compromise in the current design. Needs a custom plugin. |
| Camera | Custom `MediaRecorder`/`getUserMedia` viewfinder; known WebKit bug breaks `<input capture>` in standalone/home-screen PWA mode | `AVFoundation` via the official `@capacitor/camera` plugin — no custom native code needed, just install + call. |
| Notifications | None — user has to keep the tab open and watch | `@capacitor/push-notifications` (official plugin) — "deck ready" push instead of babysitting a tab. **Requires the paid Apple Developer Program** (real APNs certs) — won't work even for local testing on a free/personal-team build. |
| Speaker diarization | Backlogged (see `transcript-enrichment-scope.md`) — too heavy for WASM-in-browser | Becomes more tractable with Neural Engine headroom via Core ML. Worth revisiting once native. |

**What does NOT change:** the Claude API still has no audio or video input type. Native doesn't let us skip transcription — it just changes which engine produces the transcript text before it reaches Claude.

## Rollout plan (as discussed, not yet started)

1. **Start Apple Developer Program enrollment ($99/yr) immediately, independent of everything else** — approval time is unpredictable (Apple states 24-48hrs; 2026 developer-forum reports range from days to months). It doesn't block any local work, so there's no reason to wait on it.
2. **Mac prerequisites:** Xcode 26 (current; required for Capacitor 8 and for App Store uploads since April 2026), Xcode Command Line Tools, Node 22+. Prefer **Swift Package Manager** over CocoaPods (Capacitor's current recommendation) — avoids the CocoaPods/Rosetta friction point on Apple Silicon.
3. **Full on-device testing does not require the paid program.** Xcode + a free Apple ID ("Personal Team") builds and installs directly onto the user's own iPhone via cable/wireless — this covers background audio, native camera, and the Speech framework plugin, everything except TestFlight distribution and push notifications (both gated behind the paid account).
4. Personal-team builds expire every 7 days and need a rebuild from Xcode to refresh. No data loss from this: the app's content (sessions/notes/photos/transcript) lives in Supabase, not local device storage, so it survives regardless as long as the user doesn't manually delete the app and keeps the same bundle ID across rebuilds.
5. Once enrollment clears: configure signing in Xcode, archive, upload to TestFlight (internal testers: instant, up to 100; external: up to 10,000, needs Beta App Review for the first build of each version).

## Next step, when ready

Scaffold the Capacitor project (`npx cap init`, `npx cap add ios`, `npx cap sync`) — explicitly deferred to a session running on the user's Mac.
