# Capture Screen
_Produced by: design-lead | Task 3 of 16_

---

## Layout

Three fixed zones. Only the timeline scrolls.

```
┌─────────────────────────────────┐  ─── 0
│  ● 00:42:17              [■]    │      56pt  HEADER
├─────────────────────────────────┤  ─── 56pt
│                                 │
│         TIMELINE                │      scrollable
│         (grows upward,          │
│          newest at bottom)      │
│                                 │
├─────────────────────────────────┤  ─── H - 72pt
│  [📷]   [ Tap to add a note...] │      72pt  ACTION BAR
└─────────────────────────────────┘  ─── H
```

---

## Header (56pt)

| Element | Spec |
|---------|------|
| Background | `bg-base` #0F0F0D — no surface elevation, header bleeds into timeline |
| Recording dot | 7pt circle, pink/magenta (user-defined colour — updated from teal in Figma), pulses at 2s interval (opacity 100→60→100) |
| Timer | Atkinson Mono, 12pt, `text-secondary` #9B9A94 — elapsed time HH:MM:SS |
| Stop button | 36×36pt, `bg-elevated` #282825, `radius-sm` 6pt, centred square icon 12×12pt in `text-secondary` |
| Stop placement | Right-aligned, 16pt from edge, vertically centred |
| Bottom border | 1px dashed, `rgba(238,238,233, 0.08)` — updated from solid to dashed in Figma |

**Stop button is in the header, not the action bar.** Prevents accidental taps while reaching for the camera or note trigger.

---

## Timeline

### Behaviour
- Scrollable, fills all space between header and action bar
- Items anchor to the bottom — newest item always at the bottom of the view
- New items appear with 150ms fade-in, no slide animation
- Scroll position auto-follows new items unless user has scrolled up (then stops auto-following)
- `bg-base` throughout — no surface cards, items sit directly on the ground

### Empty state
Shown when no items have been captured yet. Three lines, centred vertically in the timeline.

```
Tap below to add a note.
Tap 📷 to photograph a slide.
Audio is recording.
```

| Property | Value |
|----------|-------|
| Line 1 | 16pt Regular, `text-secondary` |
| Lines 2–3 | 14pt Regular, `text-muted` |
| Line height | 34pt between lines |
| Alignment | Centred horizontally, centred vertically in timeline |
| Disappears | When first item is added |

### Note item

```
│ ▌  embodied computing — weiser's calm tech      14:28 │
│    still feels ahead of where we are                  │
```

| Element | Spec |
|---------|------|
| Left bar | 3pt wide, full item height, `accent` #00F0E0 |
| Left pad | 14pt from bar to text |
| Text | 15pt Regular, `text-primary` #EEEEE9, line height 1.5 |
| Timestamp | 11pt Mono, `text-muted` #5E5D58, right-aligned |
| Vertical padding | 8pt top and bottom |
| Background | None — sits on `bg-base` |

### Photo item

```
│ [thumb]  Slide: 'The Absent Future'             14:21 │
```

| Element | Spec |
|---------|------|
| Thumbnail | 72×54pt, `radius-sm` 4pt, `bg-elevated` #282825 (placeholder until image loads) |
| Caption | 14pt Regular, `text-secondary`, 16pt left of thumbnail |
| Timestamp | 11pt Mono, `text-muted`, right-aligned, top-aligned with caption |
| Vertical padding | 8pt top and bottom |

### Audio segment indicator
A subtle presence marker — not a waveform. Shows that audio is captured for a time range.

```
│ ················· audio captured 14:20–14:45 ·········│
```

| Element | Spec |
|---------|------|
| Style | Full-width dotted line, 1px, `accent-subtle` rgba(0,240,224,0.15) |
| Label | 11pt Mono, `text-muted`, centred inline |
| Shown | At session end, retrospectively marks the audio range |
| Not shown | During live capture — audio presence is implied by the recording indicator |

### Item divider
Japanese dots between every timeline item.

| Property | Value |
|----------|-------|
| Dot size | 2px |
| Gap | 12pt |
| Colour | `rgba(238,238,233, 0.15)` |
| Vertical margin | 8pt above and below |

---

## Action Controls (floating, no bar)

No background surface. Camera icon and note pill float directly on `bg-base` — the screen is one unified surface. No top border, no elevation, no container.

| Element | Spec |
|---------|------|
| Background | None — `bg-base` #0F0F0D shows through |
| Vertical zone | 88pt from bottom of screen |
| Vertical padding | 22pt top and bottom |

### Camera button
| Property | Value |
|----------|-------|
| Touch target | 44×44pt |
| Visual | Custom vector icon — replaced original constructed icon in Figma |
| Icon | Camera glyph, `accent` colour — outline style, not filled |
| Placement | Left-aligned, 16pt from edge, vertically centred in action zone |
| On tap | Opens camera viewfinder (see Camera Viewfinder below) |
| Rationale | Both camera and note pill are primary actions — icon pairs with teal pill border without competing. No filled circle — keeps the screen quiet. |

---

## Camera Viewfinder

A fullscreen in-app viewfinder. Does not hand off to the system camera app — keeps the user in context with the session timer visible.

### Layout
```
┌─────────────────────────────────┐  ── 0
│  Session · 00:42:17         ✕  │     80pt   TOP BAR
├─────────────────────────────────┤  ── 80pt
│                                 │
│     [live camera feed]          │
│                                 │
│   ┌─────────────────────────┐   │
│   │  [slide on screen]      │   │   VIEWFINDER
│   └─────────────────────────┘   │
│     ← teal reticle locks on     │
│       rectangular shapes        │
│                                 │
│  [□] [□] [□]  3 captured        │  ── VF_BOTTOM - 80pt
├─────────────────────────────────┤
│  Swipe down to return to notes  │
│              ◉                  │     148pt  BOTTOM BAR
│              ↓                  │
└─────────────────────────────────┘  ── H
```

### Top bar
| Element | Spec |
|---------|------|
| Background | `bg-base` #0F0F0D |
| Session timer | 11pt Mono, `text-muted` — confirms audio still recording |
| Dismiss (✕) | Right-aligned, 44×44pt target, `text-secondary` |

### Viewfinder area
| Element | Spec |
|---------|------|
| Background | Live camera feed |
| Reticle | Corner brackets — `#00F0E0`, 2pt stroke, 28×28pt per corner, 100% opacity. Auto-detects rectangular shapes (slides, whiteboards, screens). |
| Orientation | Responds to device rotation — portrait and landscape both supported |
| Landscape | User rotates counter-clockwise 90° to frame a 16:9 slide; viewfinder fills the full landscape screen; shutter moves to right-side strip for thumb reach |

### Capture behaviour — multi-shot (Option A)
| State | Behaviour |
|-------|-----------|
| Viewfinder opens | Ready to shoot — reticle active |
| Shutter tapped | Photo captured — haptic confirmation — viewfinder **stays open** |
| After capture | Thumbnail appears bottom-left with teal checkmark — "N captured" counter |
| Multiple shots | Thumbnails accumulate (up to 3 shown, then "+N" overflow) |
| Return to notes | **Swipe down** — viewfinder dismisses, all photos in timeline at their timestamps |
| Alternative dismiss | Tap ✕ — same result |
| Auto-dismiss | Never — user controls when to return |

### Thumbnail confirmation strip
Appears at the bottom of the viewfinder after the first capture. Each thumbnail is 28×28pt with a teal border and checkmark overlay.

| Property | Value |
|----------|-------|
| Size | 28×28pt per thumbnail |
| Border | 1.5pt, `accent` #00F0E0 |
| Checkmark | Teal, shown after capture animation completes |
| Counter | "N captured" — 11pt Mono, `text-muted`, right of thumbnails |
| Max visible | 3 thumbnails, then "+N more" |

### Shutter button
| Property | Value |
|----------|-------|
| Size | 64pt diameter (32pt radius) |
| Outer ring | 1.5pt stroke, `accent` #00F0E0 |
| Inner fill | `accent` #00F0E0 solid — pulses briefly on capture |
| Placement (portrait) | Centred horizontally in bottom bar |
| Placement (landscape) | Centred vertically in right-side control strip, 60pt wide |

### Swipe-down affordance
| State | Treatment |
|-------|-----------|
| 0 shots taken | "Swipe down to return to notes" — muted label below shutter |
| 1+ shots taken | Label remains; chevron arrows (↓) appear below shutter, increasing opacity with each shot — gentle nudge |

### Native camera gestures
Standard camera gestures are preserved — the viewfinder behaves like the system camera in this respect.

| Gesture | Behaviour |
|---------|-----------|
| **Tap anywhere in viewfinder** | Focus and expose on tapped point — teal focus ring animates in at tap location, fades after 2s |
| **Pinch to zoom** | Zoom in/out — standard pinch gesture, no custom UI needed |
| **Zoom indicator** | System-standard zoom level indicator appears during pinch, fades when gesture ends |

The reticle auto-detection does not conflict with tap-to-focus — tapping a specific point overrides the auto-detected focus point.

### Thumbnail placement (landscape)
| Property | Value |
|----------|-------|
| Position | Left of viewfinder, in the safe area margin |
| Gap from viewfinder edge | 8pt — thumbnails do not touch the viewport |
| Alignment | Vertical stack, centred vertically |
| Counter | Below stack, centred on thumbnail column |

### Accessibility
| Requirement | Implementation |
|------------|---------------|
| Shutter | VoiceOver label: "Capture photo" |
| Dismiss | VoiceOver label: "Stop camera, return to notes" |
| Capture confirmation | VoiceOver announces: "Photo captured, N total" |
| Reticle | Decorative — not announced by VoiceOver |
| Tap-to-focus | VoiceOver: "Focus set" after tap |
| Landscape rotation | VoiceOver announces orientation change; all controls remain accessible |

### Note pill
| Property | Value |
|----------|-------|
| Placement | Right of camera icon, 12pt gap, extends to 16pt from right edge |
| Height | 40pt — reduced from 48pt in Figma |
| Background | `bg-base` #0F0F0D — matches screen, feels transparent |
| Border | 2pt, `#00F0E0` (full accent) — updated from darkened `#00A89C` at 1.5pt in Figma |
| Radius | 24pt (full pill) |
| Placeholder | "Tap to add a note..." — 14pt Regular, `text-muted` |
| On tap | Keyboard appears, placeholder replaces with active cursor, pill becomes input field |

---

## Note Input State
When the user taps the note pill, the keyboard appears and the input floats above it — no background strip, sits directly on `bg-base`.

| Property | Value |
|----------|-------|
| Input style | Floating — no background bar, text sits on `bg-base` |
| Text | 15pt Regular, `text-primary` #EEEEE9 |
| Cursor | `accent` #00F0E0 |
| Autocorrect | Standard — do not suppress |
| Return key | Preserved for paragraph breaks — does NOT commit the note |
| Commit | Circle-check icon button (right of input) — teal circle `#00F0E0` outline, gray `#9B9A94` checkmark inside |
| Cancel | Swipe down keyboard (OS standard) |
| On commit | Note drops into timeline at current timestamp, keyboard dismisses |

### Commit icon spec
| Property | Value |
|----------|-------|
| Circle | 26pt diameter, `accent` #00F0E0, 2pt stroke, no fill |
| Checkmark | `text-secondary` #9B9A94, stroke weight matches circle weight |
| Touch target | 44×44pt |
| Placement | Right-aligned in floating input zone |

The action bar shifts upward with the keyboard (standard OS keyboard avoidance).

---

## Battery / Storage Indicator
A non-alarming awareness indicator that appears only when relevant.

| Condition | What appears |
|-----------|-------------|
| Battery < 20% | Small dot in header, amber, no label — tapping opens OS battery panel |
| Storage < 500MB | Small dot in header, amber |
| Battery < 10% | Dot + "Low battery" label, persists |
| Normal | Nothing — indicator is invisible |

Never interrupts capture. Never modal. Never alarming colours (not red — amber only, and only the dot). Consistent with Principle 1: if it requires the user to think about the app, it's failing.

---

## Screen Sizes

| Size | Adjustment |
|------|-----------|
| Small (320pt wide) | Note pill text truncates gracefully; camera button stays 44pt |
| Standard (375pt) | Base spec above |
| Large (390–430pt) | Extra width absorbed by note pill — all targets stay the same |
| Dynamic type (large) | Timeline text scales; timestamps stay at fixed 11pt Mono |

---

## Accessibility

| Requirement | Implementation |
|------------|---------------|
| Touch targets | All interactive elements minimum 44×44pt |
| Recording indicator | VoiceOver announces "Recording active" on screen load; timer reads as "42 minutes 17 seconds" |
| Stop button | VoiceOver label: "Stop recording and save session" |
| Camera button | VoiceOver label: "Capture photo" |
| Note pill | VoiceOver label: "Add a note" |
| Photo items | VoiceOver reads AI-generated alt text (post-capture); placeholder: "Photo captured at [time]" |
| Timeline order | VoiceOver navigates items chronologically, oldest first |
| Keyboard avoidance | Action bar shifts with keyboard — last timeline item stays visible |
| Reduced motion | Fade-in for new items remains; no slide/transform animations |
