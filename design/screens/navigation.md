# Navigation Model: Conference Capture

_Produced by: design-lead | Task 2 of 16_

---

## Structure

Option 3 — Session card home. No persistent tab bar. The home screen is the library and the capture entry point combined.

```
┌─────────────────────────────────────────────┐
│                                             │
│   HOME (Session List)                       │
│   ├── Active session card (pinned, dark)    │
│   ├── Recent sessions (last 7 days)         │
│   └── Library → (older sessions)           │
│                                             │
│   [+] New Session                           │
│                                             │
└──────────────┬──────────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
  ┌─────────┐      ┌─────────┐
  │ CAPTURE │      │ REVIEW  │
  │ SCREEN  │      │ SCREEN  │
  └────┬────┘      └────┬────┘
       │                │
       │                ▼
       │          ┌─────────┐
       │          │ EXPORT  │
       │          │ PREVIEW │
       │          └─────────┘
       │
       ▼
  ┌─────────┐
  │ LIBRARY │  (full-screen — older sessions,
  └─────────┘   search, cross-session themes)
```

---

## Screens

### Home
The default landing screen. Shows:
- **Active session card** — pinned at top; dark ground, teal accent, recording indicator. Always visible if a session is live.
- **Recent session cards** — last 7 days, scrollable
- **Library entry** — collapses sessions older than 7 days behind a single "Library →" card
- **[+] button** — starts a new session; accessible from home at all times

When no session is active, the pinned card slot is empty and [+] is the hero action.

### Capture Screen
Entered via:
- Tapping [+] from Home → new session starts immediately
- Tapping the active session card → returns to live capture

Exited via:
- Stop button → session saved → returns to Home (active card updates to "Processing")
- Back gesture → session continues recording in background; home shows active card

### Review Screen
Entered via:
- Tapping any past session card from Home or Library
- Tapping the active session card after session has ended and enrichment is complete

Exited via:
- Back → returns to Home or Library (wherever the user came from)

### Export Preview
Entered via:
- Export button within Review screen

Exited via:
- Back → returns to Review
- Export complete → returns to Review (session card updates to show "Exported")

### Library
Full-screen destination for sessions older than 7 days. Also accessible via search.

Entered via:
- "Library →" card on Home
- Search icon (app-wide search lands here)

Exited via:
- Back → returns to Home

---

## Key Flows

### Starting a session
```
Open app → Home → [+] → Capture screen (recording starts)
Total taps: 1
```

### Back-to-back sessions
```
Capture screen → Stop → Home (session saves)
→ [+] → New capture screen (next session starts)
Total taps between sessions: 2
```

### Reviewing a past session
```
Home → tap session card → Review screen
Total taps: 1
```

### Exporting a deck
```
Review screen → Export → Export preview → Export → done
Total taps: 3
```

### Finding an old session
```
Home → Library → scroll or search → tap session card → Review
Total taps: 2 + search
```

---

## Session Card

### With photo
```
┌────────────────────────────────────────┐
│ [photo  ]  Embodied Interfaces         │
│ [thumb  ]  Jane O'Brien · WWDC · May 9 │
│ ─ · ─ · ─ · ─ · ─ · ─ · ─ · ─ · ─ · │
│  📝 14   📷 6   ⚡ 3 action items      │
│  #AI  #HCI  #Interfaces                │
└────────────────────────────────────────┘
```

### Without photo (thumbnail fallback)
```
┌────────────────────────────────────────┐
│ [EMBODIED]  Embodied Interfaces        │
│ [        ]  Jane O'Brien · WWDC · May 9│
│ ─ · ─ · ─ · ─ · ─ · ─ · ─ · ─ · ─ · │
│  📝 14   📷 0   ⚡ 3 action items      │
│  #AI  #HCI  #Interfaces                │
└────────────────────────────────────────┘
```
Fallback thumbnail: dominant topic word, large, Atkinson bold, dark ground (#0F0F0D), teal accent tint. Clearly typographic — not photo-like.

### Session name states
| State | Title | Subtitle |
|-------|-------|----------|
| Capturing (live) | `Session` | `14:32 · May 9` |
| Processing (enrichment running) | `Processing…` | `May 9 · 42 min` |
| Complete — speaker known | `Embodied Interfaces` | `Jane O'Brien · WWDC · May 9` |
| Complete — no speaker | `Spatial Computing` | `WWDC · May 9` |
| Complete — no event | `AI Safety` | `Jane O'Brien · May 9` |
| User-edited | `[User's title]` | `[Retained metadata]` |

---

## Active Session Card (Home, pinned)
```
┌────────────────────────────────────────┐
│ ● REC  00:42:17          [■ Stop]      │
│                                        │
│ Session · 14:32                        │
│ Tap to return to capture               │
└────────────────────────────────────────┘
```
Dark ground. Teal recording dot. Monospace timer. Accessible stop control.
Tapping anywhere on the card returns to the capture screen.

---

## Back-to-Back Session Handling
When a session ends (Stop tapped):
1. Session saves immediately — no data loss
2. Home screen shows the just-ended session card in "Processing…" state
3. [+] is immediately available — no delay before starting the next session
4. The processing happens in the background while the next session records
5. Both sessions are independent — stopping one never affects another

---

## Accessibility
- All navigation targets minimum 44×44pt
- Active session card announces recording state via VoiceOver ("Recording active, 42 minutes")
- Session cards read: title, subtitle, note count, photo count, action item count, tags
- Back navigation is always available — no dead ends
- [+] button has label "Start new session" for screen readers
- Library is fully navigable without theme cards (they are supplementary)
