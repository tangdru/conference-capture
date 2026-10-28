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

## Data architecture: local-first, synced to Supabase

Decided 2026-10-11, user override. Not yet built — `db.ts` today writes straight to Supabase with no offline queue (a dropped connection mid-session, e.g. bad conference WiFi, just fails the save).

Target shape: writes land on-device first (instant, fully offline-resilient — the actual point of this), then sync up to Supabase in the background when there's a connection. Supabase remains the durable copy and the thing the Edge Functions (`generate-deck`, `enrich-session`) read from, and is what gives the web version and native app a shared account/session history. Local storage is the fast primary copy, not a replacement for the cloud copy — this is a sync architecture, not a migration off Supabase.

Open implementation questions for when this gets built: local storage tech on iOS (Core Data / SQLite / plain files), what triggers a sync (on reconnect, periodic, on app foreground), and conflict resolution if the same session was edited both offline and on another device before syncing.

## Claude API key strategy

Decided 2026-10-11, user override (revised same day — originally deferred, now a build requirement, not an eventual nice-to-have). `generate-deck` and `enrich-session` currently use a single shared `ANTHROPIC_API_KEY` set as an Edge Function secret — safe today only because there's one user and no distributed binary exposing it. That's a fragile assumption to build on (breaks the moment a TestFlight build reaches even one other tester), so **this gets built in from the start of the native work, not retrofitted later.**

**Shape: bring-your-own-key, lightweight version.** The user's own Anthropic API key lives client-side only (`localStorage` on web, iOS Keychain on native) and is passed per-request to the existing Edge Functions, instead of the functions reading a fixed env secret. The Edge Functions' own logic doesn't change — they still do all the orchestration (read session items, download photos, build the prompt, call Claude, write results back) — only where the key comes from changes. The key itself is never persisted server-side. Scoped work: a settings field to enter/store the key, one line changed in each of `generate-deck` and `enrich-session` to read the key from the request instead of the env var, and plumbing the key through the two existing `db.ts` calls (`generateDeck`, `enrichSession`) that invoke them.

(Rejected alternative: client calls Claude directly, bypassing the Edge Functions entirely for AI calls. Keeps the key fully on-device with nothing transiting to the backend at all, but means replicating the Edge Functions' orchestration logic client-side — meaningfully more code for a security benefit the lightweight version already delivers.)

## Build requirements for the native work (not deferred, do these as part of it)

- [ ] **Bring-your-own Claude API key** (lightweight version above) — settings field + Edge Function changes + `db.ts` plumbing

## Rollout plan (as discussed, not yet started)

1. **Start Apple Developer Program enrollment ($99/yr) immediately, independent of everything else** — approval time is unpredictable (Apple states 24-48hrs; 2026 developer-forum reports range from days to months). It doesn't block any local work, so there's no reason to wait on it.
2. **Mac prerequisites:** Xcode 26 (current; required for Capacitor 8 and for App Store uploads since April 2026), Xcode Command Line Tools, Node 22+. Prefer **Swift Package Manager** over CocoaPods (Capacitor's current recommendation) — avoids the CocoaPods/Rosetta friction point on Apple Silicon.
3. **Full on-device testing does not require the paid program.** Xcode + a free Apple ID ("Personal Team") builds and installs directly onto the user's own iPhone via cable/wireless — this covers background audio, native camera, and the Speech framework plugin, everything except TestFlight distribution and push notifications (both gated behind the paid account).
4. Personal-team builds expire every 7 days and need a rebuild from Xcode to refresh. No data loss from this as long as the app isn't manually deleted and the bundle ID stays the same across rebuilds — true today because content lives in Supabase, not local storage, and will stay true once local-first storage ships too, since a synced local copy isn't the only copy.
5. Once enrollment clears: configure signing in Xcode, archive, upload to TestFlight (internal testers: instant, up to 100; external: up to 10,000, needs Beta App Review for the first build of each version).

## Scaffolding status

Done 2026-10-28, in a cloud session (not the Mac this doc originally deferred it to) — turns out `cap init`/`cap add ios`/`cap sync` are plain Node scripts that copy and patch template files; none of them shell out to Xcode or CocoaPods, so none of it actually needed macOS. What exists now:

- `capacitor.config.ts` at the repo root — `appId: com.tangdru.conferencecapture`, `appName: Conference Capture`, `webDir: dist`. The bundle id is a placeholder (easy to change in Xcode later, but harder once a build has shipped to a device/TestFlight under it) — confirm it before the first real device build.
- `ios/` — the native Xcode project (`ios/App/App.xcodeproj`), using **Swift Package Manager** (`ios/App/CapApp-SPM/`), not CocoaPods, matching this doc's own recommendation above. No Podfile, no Rosetta friction.
- `ios/App/App/Info.plist` — added `NSCameraUsageDescription` and `NSMicrophoneUsageDescription`, required for the app's two permission prompts; without these iOS kills the app outright on first camera/mic access instead of showing a prompt.
- `npm run ios:sync` (rebuilds the web app and runs `cap sync ios`) and `npm run ios:open` (same, then `cap open ios`) added to `package.json` — the latter needs macOS/Xcode since `cap open` shells out to `open`.

What still genuinely needs the Mac (unchanged from the prerequisites/rollout plan above): opening `ios/App/App.xcodeproj` in Xcode at all, first-launch Swift Package resolution, configuring a signing team, running on a physical device or simulator, and everything in the rollout plan (Apple Developer enrollment, TestFlight).

Not yet done, deliberately out of scope for scaffolding alone: the native Swift plugin layer (Speech framework, background audio, `Capacitor.isNativePlatform()` branches), the bring-your-own-key work, and local-first storage — all still as scoped above.
