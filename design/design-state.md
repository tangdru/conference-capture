# Design State: Conference Capture

_Last updated: 2026-05-22 by design-lead_

## Brief
- **Problem:** Knowledge workers lose the value of conference talks because no single tool captures notes, photos, and audio together — and nothing turns the capture into a shareable output
- **Primary persona:** Curious cross-disciplinary knowledge worker who attends talks regularly; thinks in connections; the person who built this is this person
- **Success metric:** Capture faster than 3 apps; review useful without cleanup; export a shareable deck in under 2 minutes
- **Brief document:** design/briefs/2026-05-08-conference-capture.md

## Personas
**Document:** design/personas/2026-05-10-conference-capture-personas.md
- **Marcus** — 34, product strategist; situational one-handed use, high cognitive load
- **Priya** — 52, academic researcher; presbyopia, wrist pain, slower mobile typist, Android
- **James** — 28, UX designer; ADHD, burst capture, zero tolerance for friction
- **Aiko** — 41, deaf PM; visual-only capture, relies on post-session transcript
- **Diane** — 45, VC; stress case — temp motor impairment, fatigue, back-to-back sessions

## Design Principles
1. **The room is the source of truth** — capture never breaks the user's attention; if a feature requires thinking about the app, it's failing
2. **Structure emerges, it isn't imposed** — no filing at capture time; AI proposes taxonomy post-session, evolves as library grows
3. **The output earns the input** — every review/export decision asks: does this make the output better?
4. **Absence of accessibility is absence of design** — one-handed, dark room, screen reader — these are the conditions, not edge cases
5. **Intelligence should feel inevitable, not magic** — enrichment surfaces what the user would have found anyway, faster; never chatty, never surprising

## Taste Profile
- **Emotional target:** Quiet precision
- **Quality level:** Flagship
- **Modes:** Dark (primary) / Light (secondary)
- **Key references:** Nothing Phone 4a Pro (visual only), Superdot Studio, Kim Albrecht, Mohr/Chuanqisun dot grid, andrewdesigns.info
- **Aesthetic principles:** Negative space is structure · One color earns its place · The grid is always underneath · Data is the design · Editorial restraint
- **Taste document:** design/taste/2026-05-08-conference-capture-taste.md

## Decisions Log

| Date | Agent | Decision | Rationale |
|------|-------|----------|-----------|
| 2026-05-08 | design-discovery | Timeline stream as core interaction model | Most honest to how conferences work — chronological, chaotic, time-bound |
| 2026-05-08 | design-discovery | Audio is ambient capture, not dictation | User intent: record the speaker, not themselves; transcript is a post-session reference layer |
| 2026-05-08 | design-discovery | Review phase is editable, not read-only | Users need to correct, expand, and annotate after the session |
| 2026-05-08 | design-discovery | Transcript quote highlighting for export | Curated quotes are first-class export content, not raw fragments |
| 2026-05-08 | design-discovery | AI enrichment is post-session, not real-time | Avoids capture friction; enrichment happens while the user is in transit |
| 2026-05-08 | design-discovery | Export targets: Google Slides, PowerPoint | User goal is to share insights with team without building a presentation from scratch |
| 2026-05-08 | design-discovery | Mobile-first, OS agnostic | Capture happens on phone; OS agnostic — standard patterns across iOS and Android |
| 2026-05-08 | design-discovery | General audience for v1 | Start broad, refine to specific verticals later |
| 2026-05-08 | design-taste | Dark mode is primary | Users are in dark auditoriums; bright white screen is disruptive |
| 2026-05-08 | design-taste | Nothing Phone is visual reference only | OS agnostic product — borrow the aesthetic (dot grid, monochrome), not the platform |
| 2026-05-08 | design-taste | Flagship quality level | User has refined aesthetic sensibility; this is not a prototype |
| 2026-05-08 | design-taste | One vivid accent on monochrome base | Judicial use of color — color means something when it appears |
| 2026-05-25 | user override | Camera: native API (AVFoundation/CameraX), reticle = fixed framing guide only, no auto-detection in v1 | Simpler, more reliable; detection deferred to v2 |
| 2026-05-19 | user override | Note input: float style (no background), Return key = paragraph break, commit = circle-check icon | Teal circle + gray #9B9A94 checkmark inside |
| 2026-05-17 | user override (Figma) | Viewfinder reticle corners locked: #00F0E0, 2pt stroke, 28×28pt, 100% opacity | User spec confirmed |
| 2026-05-14 | user override (Figma) | Recording dot colour → pink/magenta (changed from teal #00F0E0) | User edit in Figma |
| 2026-05-14 | user override (Figma) | Camera icon → replaced with custom vector | User edit in Figma |
| 2026-05-14 | user override (Figma) | Header divider → dashed (was solid 1px hairline) | User edit in Figma |
| 2026-05-14 | user override (Figma) | Note pill → 40pt height, 2pt `#00F0E0` border (was 48pt, 1.5pt `#00A89C`) | User edit in Figma |
| 2026-05-14 | user override (Figma) | Slide info block present at top of active capture screen (intentional) | User edit in Figma |
| 2026-05-14 | user override (Figma) | `+` element added below header divider | User edit in Figma |
| 2026-05-11 | user override | Typeface: Atkinson Hyperlegible Next (UI) + Atkinson Hyperlegible Mono (timestamps) | Slashed 0 by default, best disambiguation of all candidates reviewed |
| 2026-05-11 | design-lead | Session card: topic as primary title, speaker · event · date as subtitle | Topic is the memory anchor; metadata is contextual receipt |
| 2026-05-11 | design-lead | Thumbnail fallback: dominant topic word large on dark ground (Option B) | Not photo-like — typographic, clearly generated; cycles out when enrichment completes |
| 2026-05-11 | design-lead | Navigation model: Option 3 — session card home with active session pinned | Solves back-to-back sessions; recent sessions collapse behind Library entry after 7 days |
| 2026-05-10 | user override | No background dot grid — backgrounds are clean and flat | User direction: dot grid removed |
| 2026-05-10 | user override | Japanese dotted lines for horizontal dividers | When a divider is needed: 1px dots, 6px gap, low opacity — never solid rules |
| 2026-05-08 | design-strategy | No tagging at capture time — AI proposes taxonomy post-session | Zero friction start; structure emerges from content, not user overhead |
| 2026-05-08 | design-strategy | AI monitors growing library and suggests taxonomy updates | Taxonomy gets smarter as collection grows — new categories, merges, splits |

## Open Questions

- [x] ~~What is the vivid accent color?~~ → **#00F0E0 Teal B** — approved by user
- [ ] How are live vs. post-session timeline entries visually distinguished? — design-lead
- [ ] What does the export deck template look like? — design-lead + design-strategist
- [ ] Onboarding flow for first-time users — design-strategist
- [ ] How does the app handle multiple talks in one day (same conference, back-to-back sessions)? — design-strategist
- [ ] How does the AI taxonomy suggestion surface to the user post-session? — design-lead

## Artefact Index

| Artefact | Path | Status |
|----------|------|--------|
| Brief v4 | design/briefs/2026-05-08-conference-capture.md | Approved |
| Taste profile | design/taste/2026-05-08-conference-capture-taste.md | Approved |
| Personas | design/personas/2026-05-10-conference-capture-personas.md | Complete |
| Strategy | design/strategy/2026-05-08-conference-capture-strategy.md | Approved |
| Design plan | design/plans/2026-05-08-conference-capture-plan.md | Approved |
| Tokens | design/tokens/tokens.md | Complete — Task 1 ✅ |
| Timeline items | design/components/timeline-items.md | Complete — Task 4 ✅ |
| Navigation model | design/screens/navigation.md | Complete — Task 2 ✅ |
| Capture screen | design/screens/capture.md | Complete — Task 3 ✅ |
| Capture screen mockups | design/screens/mockups/ | Complete — Task 3 ✅ (v1 programmatic, v2 from Figma) |
| Camera capture interaction | design/interactions/camera-capture.md | Complete — Task 6 ✅ |

## Design Debt Register

_Items: 0 | Critical: 0 | Oldest: —_

| ID | Date | Source | Severity | What | Who is affected | Suggested fix | Status | Notes |
|----|------|--------|----------|------|----------------|---------------|--------|-------|

## Handoff Chain

### 2026-05-08 — design-strategy → writing-design-plans
> "Five principles locked, competitive map done, experience arc approved. The differentiator is clear: nobody owns the full capture → enrichment → output loop. Key constraints for the plan: zero-friction capture (one tap, no setup), AI taxonomy post-session, editable timeline in review, transcript quote selection, deck export. Accessibility runs through everything — one-handed, dark room, screen reader. The open questions still to resolve: accent color, live vs. post-session visual distinction, export deck template, and back-to-back session handling. Time to break this into buildable pieces."

### 2026-05-08 — design-discovery → design-strategy
> "Brief approved and taste locked. The core product is a timeline stream — capture (notes + photos + ambient audio), enrich (AI post-session), review+curate (editable timeline, transcript quote selection), share (deck export). The user IS the primary persona: a cross-disciplinary knowledge worker who thinks in connections and loses the value of talks because no tool helps them do anything with what they captured. Taste is flagship, dark-first, dot-grid, one vivid accent on monochrome. The big open questions for you: design principles, competitive positioning, the onboarding flow, and how the app handles back-to-back sessions. The export deck template is a joint question for both of us."
