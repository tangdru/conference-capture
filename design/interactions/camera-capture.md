# Camera Capture Interaction
_Produced by: design-lead | Task 6 of 16_

---

## Implementation approach

**Native camera API throughout.** iOS uses `AVFoundation`; Android uses `CameraX`. The viewfinder surface is rendered inside the app using the platform's camera preview layer — the user never leaves the app. This gives tap-to-focus, pinch-to-zoom, auto-exposure, and auto-white-balance at no extra implementation cost.

---

## Trigger

| Action | Result |
|--------|--------|
| Tap camera icon (capture screen) | Viewfinder opens fullscreen |
| No pre-capture setup required | Native API initialises camera immediately |

---

## Viewfinder — Portrait

```
┌─────────────────────────────────┐  ── 0
│  Session · 00:42:17         ✕  │     TOP BAR (80pt)
├─────────────────────────────────┤
│                                 │
│         [camera feed]           │
│                                 │
│   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │
│   │                         │   │  RETICLE — fixed framing guide
│   │                         │   │
│   └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
│                                 │
│  [□][□]  2 captured             │  THUMBNAIL STRIP (appears after first capture)
│                                 │
│  Swipe down to return to notes  │  BOTTOM BAR
│              ◉                  │  SHUTTER
└─────────────────────────────────┘
```

### Reticle
| Property | Value |
|----------|-------|
| Type | Fixed framing guide — not interactive, no detection |
| Colour | `#00F0E0` |
| Stroke | 2pt |
| Corner size | 28×28pt |
| Opacity | 100% |
| Position | Centred in viewfinder, sized for a typical projected slide |
| v2 consideration | Edge detection / auto-snap is a future enhancement, not v1 |

---

## Viewfinder — Landscape

When the user rotates the phone counter-clockwise to frame a 16:9 slide:

```
┌────────────────────────────────────────────────┬──────────┐
│                                                │ 00:42:17 │
│              [camera feed]                     │    ✕     │
│                                                │          │
│   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐    │    ◉     │  SHUTTER
│   │                                     │    │          │
│   └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘    │          │
│                                                │ ← notes  │
│  [□][□][□]  thumbnails (left safe area)        │          │
└────────────────────────────────────────────────┴──────────┘
```

| Element | Portrait | Landscape |
|---------|---------|-----------|
| Shutter | Bottom, centred | Right strip, centred vertically |
| Dismiss (✕) | Top right | Top of right strip |
| Timer | Top bar | Top of right strip |
| Thumbnails | Bottom of viewfinder, horizontal row | Left safe area (59pt), centred vertically |
| Return hint | "Swipe down to return to notes" | "← notes" |

---

## Native gestures (provided by OS, no custom implementation)

| Gesture | Behaviour |
|---------|-----------|
| Tap anywhere in viewfinder | Focus + expose on tapped point. Native focus ring animates at tap location. |
| Pinch to zoom | Zoom in/out via native API |
| Zoom indicator | System-standard, appears during pinch, fades when gesture ends |

---

## Capture flow — multi-shot (Option A)

The viewfinder stays open after each photo. The user decides when to return to notes.

```
Tap camera icon
      ↓
Viewfinder opens
      ↓
[optional] tap to focus · pinch to zoom
      ↓
Tap shutter
      ↓
Photo captured → haptic confirmation
Photo drops into timeline at current timestamp
Thumbnail appears in viewfinder confirmation strip
      ↓
Tap shutter again → another photo (viewfinder stays open)
      ↓
Swipe down (or tap ✕) → viewfinder dismisses → back to capture screen
```

---

## Capture confirmation

| Element | Spec |
|---------|------|
| Haptic | Medium impact on shutter tap — confirms capture without sound |
| Shutter animation | Brief flash of the viewfinder (native camera capture feedback) |
| Thumbnail | Appears in confirmation strip immediately after capture |
| Timeline | Photo drops into timeline at the timestamp of capture — visible when user returns |

---

## Thumbnail confirmation strip

Appears after the first capture. Shows progress within the current burst.

| Property | Value |
|----------|-------|
| Thumbnail size | Natural photo ratio (16:9 for landscape shots, variable for portrait) |
| Height | 36pt |
| Border | 1.5pt, `#00F0E0` |
| Radius | 3pt |
| Gap between thumbnails | 8pt |
| Max visible | 3 thumbnails, then "+N more" label |
| Counter | "N captured" — 11pt Mono, `text-muted`, right of strip |
| Portrait placement | Bottom of viewfinder, horizontal row, 16pt inset |
| Landscape placement | Left safe area (59pt wide), vertical stack, centred vertically |

---

## Returning to notes

| Action | Result |
|--------|--------|
| Swipe down | Viewfinder dismisses, returns to capture screen |
| Tap ✕ | Same as swipe down |
| Auto-dismiss | Never — user controls when to return |
| On return | All captured photos are in the timeline at their timestamps |

---

## Shutter button

| Property | Portrait | Landscape |
|----------|---------|-----------|
| Size | 64pt diameter | 56pt diameter |
| Outer ring | 1.5pt stroke, `#00F0E0` | same |
| Inner fill | `#00F0E0` solid | same |
| Touch target | 64pt (button fills target) | 56pt |

---

## Accessibility

| Requirement | Implementation |
|------------|---------------|
| Shutter | VoiceOver label: "Capture photo" |
| Dismiss | VoiceOver label: "Stop camera, return to notes" |
| Capture confirmation | VoiceOver announces: "Photo captured, N total" |
| Reticle | Decorative — not announced by VoiceOver |
| Tap-to-focus | VoiceOver: "Focus set" after tap |
| Thumbnail strip | VoiceOver reads: "N photos captured" (group, not per-thumbnail) |
| Landscape | VoiceOver announces orientation change; all controls remain labelled |
| Haptic | Supplements but does not replace visual confirmation |
