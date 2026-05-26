# Audio Recording Indicator
_Produced by: design-lead | Task 7 of 16_

---

## Session state model

A session has four states. The recording indicator communicates which state the session is in at every moment.

```
START
  ↓
RECORDING ──── tap Stop ────→ SUSPENDED ──── tap Resume ──→ RECORDING
                                   │
                               tap End session
                                   ↓
                               ENRICHING
                                   ↓
                               COMPLETE
```

**RECORDING** — audio is actively capturing. Timer is running.
**SUSPENDED** — audio is stopped. Session is open and resumable. No enrichment yet.
**ENRICHING** — session explicitly ended. Transcript and enrichment processing in background.
**COMPLETE** — enrichment done. Session card fully populated.

---

## Recording indicator — capture screen (header)

The indicator lives in the header throughout the capture session. Pink dot left, timer centre-left, controls right.

### State: RECORDING

| Element | Spec |
|---------|------|
| Dot | 14×14pt, `#FF2D78` (pink/magenta), filled circle |
| Dot animation | Pulse — opacity 100% → 50% → 100%, 2s loop, ease-in-out |
| Timer | Elapsed time HH:MM:SS, 13pt Mono, `text-muted` #5E5D58, counts up |
| Stop button | Square icon ■, 36×36pt container, `bg-elevated` #282825, `radius-sm` 6pt, icon `text-secondary` |
| Stop action | Suspends recording → navigates to home, session card shows SUSPENDED state |

### State: SUSPENDED (capture screen re-entered)

When a user taps a suspended session card from home, they re-enter the capture screen in suspended state.

| Element | Spec |
|---------|------|
| Dot | 14×14pt, `#FF2D78`, **40% opacity** — muted, not pulsing |
| Timer | Shows total recorded time so far (not counting suspended time), static |
| Resume button | Replaces stop button — circle ● icon, same container, `accent` #00F0E0 icon |
| Resume action | Resumes audio recording, dot returns to full opacity + pulse, timer resumes |
| End session button | Appears alongside resume — "End" label, 11pt, `text-muted`, tap to close session permanently |

```
Header — SUSPENDED state:
◌ 00:42:17    [●]  [End]
↑ muted dot   ↑    ↑
              resume  close
```

### State transitions

| From | Action | To | Visual change |
|------|--------|----|---------------|
| RECORDING | Tap stop ■ | SUSPENDED | Dot fades to 40%, pulse stops, timer freezes, stop → resume |
| SUSPENDED | Tap resume ● | RECORDING | Dot brightens to 100%, pulse restarts, timer resumes |
| SUSPENDED | Tap End | ENRICHING | Navigates to home, session card shows enrichment state |
| RECORDING | Tap End (via suspend first) | — | Must suspend first, then End — no direct RECORDING → END |

---

## Session card — home screen states

The session card on the home screen reflects the session state.

### RECORDING (active)

```
┌────────────────────────────────────────┐
│ ● REC  00:42:17              [■ Stop]  │  dark ground, pink dot, teal accent
│                                        │
│ Session · 14:32                        │
│ Tap to return to capture               │
└────────────────────────────────────────┘
```

### SUSPENDED

```
┌────────────────────────────────────────┐
│ ◌  00:42:17 recorded    [● Resume]     │  muted dot, resume in teal
│                                        │
│ Session · 14:32  ·  Paused             │
│ Tap to add more, or end the session    │
└────────────────────────────────────────┘
```

### ENRICHING

```
┌────────────────────────────────────────┐
│ [thumbnail/fallback]  Processing...    │
│                       May 22 · 42 min  │
│ ─ · ─ · ─ · ─ · ─ · ─ · ─ · ─ · ─ · │
│ Preparing your notes                   │
└────────────────────────────────────────┘
```

- "Processing..." in `text-secondary`, animated ellipsis (···)
- Duration shown immediately — timer data is available
- Tap disabled while enriching

### COMPLETE

Standard session card — topic title, subtitle, thumbnail, content signals, tags.

---

## End session flow

End session is a deliberate action — it kicks off enrichment and makes the session non-resumable.

| Step | What happens |
|------|-------------|
| 1 | User taps "End" from SUSPENDED state |
| 2 | Confirmation: "End this session? You won't be able to add more captures." — two options: **End session** (accent) and **Keep open** |
| 3 | User confirms → session closes, enrichment begins in background |
| 4 | Navigates to home, session card shows ENRICHING state |
| 5 | Enrichment completes → session card updates to COMPLETE |

**Rationale for confirmation step:** Ending is the one irreversible action in the capture flow. A single tap guard prevents accidental session closure mid-conference.

---

## Accessibility

| Requirement | Implementation |
|------------|---------------|
| Recording dot | VoiceOver: "Recording active, [time] elapsed" on screen load |
| Suspended dot | VoiceOver: "Recording paused, [time] recorded" |
| Stop button | VoiceOver label: "Stop recording" |
| Resume button | VoiceOver label: "Resume recording" |
| End button | VoiceOver label: "End session" |
| Pulse animation | Does not convey information alone — state is also communicated via opacity difference and button change |
| Reduced motion | Pulse animation disabled; dot remains solid at full or 40% opacity depending on state |
| Touch targets | All controls minimum 44×44pt |
