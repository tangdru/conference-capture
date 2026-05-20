# Design Strategy: Conference Capture

## Design Principles

### 1. The room is the source of truth
**The principle:** Everything about the capture experience serves one goal — getting what's happening in the room into the app without breaking the user's attention.
**What this means in practice:** If a feature requires the user to think about the app, it's failing. Capture is dark, minimal, one-tap.
**What this rules out:** Onboarding prompts during capture, mode-switching, anything requiring two hands.

### 2. Structure emerges, it isn't imposed
**The principle:** Capture has no friction and no filing. AI proposes structure after the session — taxonomy based on content, updated as the library grows.
**What this means in practice:** No tags, folders, or pre-session setup. Post-session AI suggests taxonomy (topics, themes, speaker domains). User approves, adjusts, or ignores. As the library grows, AI monitors and suggests updates: new categories, merges, splits.
**What this rules out:** Tags/folders at capture time, any mandatory categorisation, pre-session setup screens.

### 3. The output earns the input
**The principle:** The only reason to capture is to do something useful with it. Every review and export decision asks: does this make the output better?
**What this means in practice:** Curation tools are ruthlessly focused on the deck. Features that don't feed the export don't exist.
**What this rules out:** Review features that don't feed export, export friction, anything that makes sharing harder.

### 4. Absence of accessibility is absence of design
**The principle:** One-handed use, screen reader support, high contrast on dark and light, legible at small sizes in poor lighting — these are the conditions at a conference, not edge cases.
**What this means in practice:** Design for the constraint. Core flow completable via VoiceOver/TalkBack. No gesture-only interactions.
**What this rules out:** Gesture-only interactions, colour-only status indicators, small touch targets, anything requiring two hands.

### 5. Intelligence should feel inevitable, not magic
**The principle:** The AI enrichment layer surfaces things the user would have found themselves — just faster. It never feels like a trick or a chatbot.
**What this means in practice:** Enrichment cards appear where they're contextually relevant. Copy is plain and direct. No "✨ AI-generated!" badges.
**What this rules out:** Chatty AI copy, surprise suggestions, anything that feels random or off-brief.

## Competitive Position

| Competitor | Strengths | Weaknesses | Our Opportunity |
|------------|-----------|------------|-----------------|
| Otter.ai | Best-in-class transcription | Notes and photos completely separate; no export-to-deck | Own the full session, not just audio |
| Notion | Flexible, shareable | Requires structure upfront; no capture mode; too much friction in a dark room | Zero-friction capture; structure emerges after |
| Apple Notes | Fast capture, camera integration | No audio, no AI enrichment, no cross-session intelligence | The enrichment layer; cross-session themes |
| Mem / Reflect | AI connections across notes | No conference-specific capture; no deck export | Capture context + connection intelligence together |
| OneNote | Photo + notes together | Heavy, desktop-first, no export-to-deck | Mobile-first; lightweight; the output |
| Gamma / Beautiful.ai | Good deck generation | No capture — you feed it content manually | Capture → deck in one closed loop |

**The gap nobody owns:** The full arc from capture → enrichment → curated output. Every competitor owns one phase. Nobody owns the loop.

## Experience Map

### Entry — Starting a session
Open app → one button → recording starts, timeline is live. No login prompt, no naming, no mode selection. Session metadata filled later by AI.
_Emotional state: Slightly rushed, anticipating. Needs to trust the app instantly._

### Capture — During the talk
Timeline ticks. Tap to note, tap camera to photo, audio rolls silently. Screen stays dark and minimal. No mode switching. No decisions.
_Emotional state: Focused, present. The app is invisible._

### Enrich — After the talk (automatic)
App processes in background. Transcript generated, enrichment runs (speaker bio, references, acronyms, action items). Quiet notification when ready.
_Emotional state: Not thinking about it. The app works while the user doesn't._

### Review + Curate — Later
Light mode default. Scrollable timeline: live notes, photos, transcript, enrichment cards. Editable notes, addable commentary (visually distinct from live captures). Long-press transcript to highlight quotes for export. AI taxonomy suggestion appears as dismissible card.
_Emotional state: Reflective, reconstructing. Needs the timeline to feel calm._

### Share — Export to deck
Tap export → AI generates deck from engagement-weighted notes, flagged quotes, photos, enrichment highlights, summary. Preview → reorder/remove → Google Slides or PowerPoint.
_Emotional state: Confident, efficient. 2 minutes, not 20._

### Library — Cross-session intelligence
Search across sessions. Theme cards surface recurring topics. AI suggests taxonomy updates as collection grows.
_Emotional state: Curious, discovering connections they didn't consciously make._

## Success Metrics

| Metric | What it measures | Target |
|--------|-----------------|--------|
| Session start time | Friction at capture entry | < 2 seconds from open to recording |
| Capture interruptions | Focus cost during a talk | 0 required mode switches |
| Review time to export | How long curation takes | < 10 minutes for a 60-min talk |
| Enrichment accuracy | Relevance of AI-pulled context | > 80% of enrichment cards rated useful |
| Export satisfaction | Quality of generated deck | User sends without significant edits |
| Cross-session recall | Value of library over time | Users find something useful from 3+ sessions back |
| Accessibility | Task completion with assistive tech | Core flow completable via VoiceOver/TalkBack |

## Constraints and Trade-offs

- **Optimising for:** Capture speed, output quality, cross-session intelligence
- **Not optimising for (v1):** Real-time features, collaboration, vertical-specific outputs, desktop
- **Explicit trade-off:** A taxonomy that's AI-proposed rather than user-defined means some users won't trust it at first — we accept that in exchange for zero capture friction
- **Explicit trade-off:** Post-session enrichment (not real-time) means the app can't surface context *during* a talk — we accept that to keep the capture screen distraction-free
