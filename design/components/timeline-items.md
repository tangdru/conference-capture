# Timeline Item Components
_Produced by: design-lead | Task 4 of 16_

---

## Overview

Two item types compose the timeline. All share the same horizontal rhythm — left-edge treatment, content, right-aligned timestamp — but each has distinct visual identity. They must be immediately distinguishable without relying on colour alone.

Audio recording runs continuously for the entire session — there are no segments to mark. The recording dot in the header communicates active recording; session duration on the session card communicates total audio captured. No audio indicator is needed in the timeline.

```
┌──────────────────────────────────────────────┐
│ ▌  Note text content                  14:28  │  Note item
├──────────────────────────────────────────────┤
│ · · · · · · · · · · · · · · · · · ·         │  Japanese dot divider
├──────────────────────────────────────────────┤
│ [thumb]  Photo caption                14:31  │  Photo item
└──────────────────────────────────────────────┘
```

---

## 1. Note Item

### Live capture (captured in the room)

| Property | Value |
|----------|-------|
| Left bar | 3pt wide × full item height, `accent` #00F0E0, solid |
| Left pad | 12pt from bar to text |
| Text | 14pt Regular, `text-primary` #EEEEE9, line height 1.5 |
| Timestamp | 11pt Mono, `text-muted` #5E5D58, right-aligned, top-aligned with first line |
| Vertical padding | 8pt top and bottom |
| Background | None — sits directly on `bg-base` |
| Max text width | Screen width − left bar − left pad − timestamp − right pad |

### Post-session addition (added during review)

Visually distinct from live captures — the user added this annotation after the session. Must be readable without colour.

| Property | Value |
|----------|-------|
| Left bar | 3pt wide × full item height, `accent` #00F0E0 at **40% opacity** — dashed pattern (4pt on, 4pt off) |
| Text | 14pt Regular, `text-secondary` #9B9A94 — one step dimmer than live |
| Timestamp | 11pt Mono, `text-muted` #5E5D58, same as live |
| Vertical padding | 8pt top and bottom |
| Label | "Added later" — 10pt Mono, `text-muted`, inline after timestamp |

**Two signals for the distinction (colour-independent):**
1. Dashed left bar (structural — works without colour)
2. Dimmer text weight (secondary vs. primary)

---

## 2. Photo Item

### Thumbnail
| Property | Value |
|----------|-------|
| Radius | 4pt |
| Background (loading) | `bg-elevated` #282825 |
| Left alignment | 20pt from screen edge (matches PAD) |

### Caption + timestamp
| Property | Value |
|----------|-------|
| Caption | 14pt Regular, `text-secondary` #9B9A94 — 12pt gap from thumbnail right edge |
| Timestamp | 11pt Mono, `text-muted`, right-aligned |
| Vertical alignment | Caption and timestamp top-aligned with thumbnail top |

### Tap to expand
Tap anywhere on the photo item → full-screen image viewer, pinch to zoom, swipe down to dismiss.

### Post-session photo caption edit
Same dashed left indicator treatment is not used for photos — there's no left bar on photo items. Post-session edits to a photo caption are indicated by italic text style on the caption.

### Accessibility
- AI-generated alt text attached to every photo on enrichment completion
- Placeholder alt text during capture: "Photo captured at [time]"
- Thumbnail is not the only tap target — full row is tappable

---

## 3. Timestamp Component

Used consistently across all three item types.

| Property | Value |
|----------|-------|
| Font | Atkinson Hyperlegible Mono, 11pt, Regular |
| Colour | `text-muted` #5E5D58 |
| Alignment | Right-aligned to screen edge minus 20pt PAD |
| Vertical | Top-aligned with first line of content in the same item |
| Format | HH:MM — no seconds during capture; HH:MM:SS available in review on tap |

---

## 4. Japanese Dot Divider

Separates every item in the timeline. Already defined in tokens but restated here for component context.

| Property | Value |
|----------|-------|
| Dot size | 2pt |
| Gap | 12pt |
| Colour | `text-primary` #EEEEE9 at 15% opacity |
| Vertical margin | 8pt above and below |
| Full width | Left PAD to right PAD (20pt inset each side) |

---

## 5. Live vs. Post-Session Distinction — Summary

| Signal | Live capture | Post-session addition |
|--------|-------------|----------------------|
| Left bar (notes) | Solid teal | Dashed teal at 40% opacity |
| Text colour | `text-primary` | `text-secondary` |
| Photo caption | Regular | Italic |
| Timestamp suffix | None | "Added later" (11pt Mono, muted) |
| Colour-independent? | ✅ | ✅ — dashed vs. solid + weight difference |

---

## Accessibility

| Requirement | Implementation |
|------------|---------------|
| Note items | VoiceOver reads: "[text content], captured at [time]" |
| Post-session notes | VoiceOver reads: "[text content], added later at [time]" |
| Photo items | VoiceOver reads: "[alt text], photo captured at [time]" |
| Audio (session) | No timeline indicator — audio runs continuously for the full session. Recording state communicated via header dot; total duration via session card. |
| Timeline order | VoiceOver navigates chronologically — oldest first |
| Touch targets | Full row height is the tap target — not just text or thumbnail |
| Timestamp readability | 11pt Mono at `text-muted` passes AA against `bg-base` in both modes |
| Live/post distinction | Two independent signals — does not rely on colour alone |
