# Conference Capture
## Designing a knowledge capture tool — with a team of AI agents

**Type:** Product UX design — greenfield
**Role:** Executive Design Director
**Method:** AI-assisted design workflow (Designpowers)
**Status:** In progress — foundation complete, build phase next
**Total active design time so far:** ~3.5 hours across 4 sessions

---

## The Problem

Every time I attend a talk or conference, I leave with three half-finished things: a notes app full of disconnected bullet points, a camera roll of slide photographs I'll never sort through, and a voice memo I recorded but will never listen to in full.

The value of attending — the ideas, the speakers, the connections between things — evaporates within 48 hours. And getting anything useful back to my team means starting from scratch, rebuilding something I already experienced once.

This is not a personal problem. Every knowledge worker at every conference is doing the same thing: juggling three separate tools, losing context between them, and spending Sunday evening building a deck from memory.

So I set out to design the tool I actually wanted.

---

## The Approach: A Team of AI Design Agents

Rather than designing alone, I ran this project through **Designpowers** — a structured design workflow system that routes work through a team of specialised AI agents: a researcher, strategist, design lead, content writer, accessibility reviewer, and more.

My role was **executive design director**. I described the problem, made every key decision, approved or redirected each handoff, and shaped the direction at every phase. The agents did the research, the structured thinking, the documentation, and the production work.

This case study documents both the product being designed and what it actually looks and feels like to direct a team of AI agents through a full UX process.

---

## What I Wanted to Build

At a conference, everything happens at once. You're watching a speaker, photographing a slide, trying to type a thought, and the talk has already moved on. The tool I wanted would:

- **Capture everything in one mode** — notes, photos, and ambient audio rolling in the background, all timestamped into a single stream
- **Enrich it automatically** — speaker bio, referenced papers, companies and tools mentioned, all pulled in after the session
- **Surface connections over time** — not just one session, but themes across every talk you've ever attended
- **Produce a shareable output** — a deck your team can read without you rebuilding the whole thing

The audio isn't for dictation. It's ambient capture — the transcript is a reference layer you come back to, not something you produce in the moment.

---

## Phase 1: Discovery
**Time:** ~45 min | **Output:** Approved design brief (v4)

Discovery is where I pushed back on my own assumptions.

The first version of the brief was too narrow — an app for capturing notes and photos. Through a structured discovery conversation, the concept expanded significantly:

- **Audio as a passive layer**, not active input — the recording runs silently in the background while the user captures intentionally on top of it
- **Post-session as the primary value moment** — the app's job isn't just capture, it's what happens the next day: a unified timeline the user can actually work with
- **Export as the end goal** — the output isn't a personal archive, it's a shareable deck. The team debrief is the job to be done
- **AI enrichment as a separate layer** — speaker bios, referenced publications, company intelligence, acronym expansion, action item extraction — all pulled in automatically after the session

The brief went through four versions. The final version defines Conference Capture as a three-phase product: **capture → enrich → share**, with a curation layer in between where the user edits, annotates, and highlights transcript quotes for the final output.

### Key discovery decision: general audience first
I initially considered targeting specific verticals — developers at tech conferences, academics, business executives. Each has meaningfully different needs. But the core interaction model is the same for all of them: one-mode capture, AI enrichment, shareable output. The differentiation point is the output format and enrichment logic, not the capture UI. So: general audience for v1, with audience-specific output modes as a v2 unlock.

### The brief at a glance
- **Problem:** Knowledge workers lose the value of conference talks because no single tool captures notes, photos, and audio together — and nothing turns the capture into a shareable output
- **Primary persona:** Curious, cross-disciplinary knowledge worker who attends talks regularly. The person who built this is this person.
- **Success:** Capture faster than 3 apps · Review useful without cleanup · Export a shareable deck in under 2 minutes

---

## Phase 2: Taste Calibration
**Time:** ~30 min | **Output:** Approved taste profile

Before any visual design work, I calibrated the aesthetic direction. Not a mood board — a documented set of design commitments every agent would reference when making visual decisions.

### References I brought in
- **Nothing Phone 4a Pro** — visual reference only (not the platform). Monochrome discipline, grid precision, selective colour. The way the glyph interface uses light on dark as the entire aesthetic vocabulary.
- **Superdot Studio** — information design as the aesthetic. Sophistication through restraint. Content over chrome.
- **Kim Albrecht** — editorial whitespace, scholarly precision, neutral ground with vivid project imagery.
- **Mohr / Chuanqisun dot grid** — mathematical beauty, algorithmic structure, the grid underneath everything.
- **My own portfolio (andrewdesigns.info)** — scientific colour encoding, data-first, analytical clarity.

### The through-line
Every reference shares two commitments: **restraint as aesthetic** and **information as design**. The content is the visual. Colour appears rarely and hits hard when it does.

### Taste decisions made
- **Dark mode is primary** — users are in dark auditoriums. A bright white screen is disruptive to the user and everyone around them.
- **One vivid accent on a monochrome base** — after reviewing four colour families, I chose **Teal B `#00F0E0`** — electric, precise, clinical. Hits hard on near-black. Nothing decorative.
- **No background dot grid** — removed in favour of clean flat backgrounds. Where horizontal dividers are needed, Japanese dots (1px, 6px gap) replace solid rules.
- **Atkinson Hyperlegible** as the typeface — specifically engineered for disambiguation. The slashed `0` is a default letterform, not an OpenType option. After reviewing Inter, IBM Plex Sans, Space Grotesk, Lexend, and iA Writer Quattro side by side, Atkinson was the only font that solved the `I / l / 1 / 0` problem without compromise. The full family (Next for UI, Mono for timestamps) keeps everything in one type system.

### Emotional target
> Quiet precision. Like a scientific instrument — focused, intelligent, calm. The app disappears so the content speaks.

---

## Phase 3: Strategy
**Time:** ~25 min | **Output:** Design strategy document, 5 principles, competitive analysis, experience map

### Competitive landscape
The conference capture space is fragmented. Every competitor owns one phase of the experience:

| Tool | What they own | What they miss |
|------|--------------|----------------|
| Otter.ai | Best-in-class transcription | Notes and photos separate; no export-to-deck |
| Notion | Flexible, shareable | Too much friction in a dark room |
| Apple Notes | Fast camera capture | No audio, no AI, no cross-session intelligence |
| Mem / Reflect | AI connections | No conference-specific capture; no deck export |
| Gamma / Beautiful.ai | Good deck generation | No capture — you feed it content manually |

**The gap nobody owns:** the full arc from capture → enrichment → curated output. Every competitor owns one phase. Nobody owns the loop.

### Design principles
Five principles, each opinionated enough to make real decisions:

1. **The room is the source of truth** — if a feature requires the user to think about the app during a talk, it's failing
2. **Structure emerges, it isn't imposed** — zero friction at capture; AI proposes taxonomy post-session, evolves as the library grows
3. **The output earns the input** — every review and export decision asks: does this make the output better?
4. **Absence of accessibility is absence of design** — one-handed, dark room, screen reader — these are the conditions, not edge cases
5. **Intelligence should feel inevitable, not magic** — enrichment surfaces what the user would have found anyway, faster. Never chatty. Never a badge.

### Experience arc
```
CAPTURE          ENRICH           REVIEW + CURATE       SHARE
────────────     ──────────       ─────────────────     ────────────────
Timestamped      Speaker bio      Editable timeline     AI summary
timeline feed    Ref links        Post-session notes    Highlighted quotes
Notes + photos   Publications     Transcript quotes     Export to deck
Ambient audio    Companies        Search within         Cross-session
                 Action items     session               themes + search
```

---

## Phase 4: Inclusive Personas
**Time:** ~20 min | **Output:** 5 personas covering primary users, edge cases, and a stress case

Good personas reveal design weaknesses before you build. These five do that.

### Marcus, 34 — Product Strategist *(primary)*
Attends 6–8 conferences a year. Always has a bag on one shoulder and a coffee in the other hand. Note quality drops on day 2 of a multi-day event. Currently cobbles together Notion + Otter + Apple Notes. His problem: losing the thread between what he typed, what he photographed, and what the speaker actually said.

### Priya, 52 — Academic Researcher *(primary)*
Attends 10–12 conferences a year. Thinks in citations and methodology. Uses reading glasses for small text. Slower mobile typist. Skeptical of AI until it proves itself. Her problem: speaker mentions a paper in passing and she can't write fast enough to capture the full title.

### James, 28 — UX Designer *(primary, ADHD)*
Attends conferences for inspiration. Engages intensely for 10–15 minute bursts, then loses the thread. Zero tolerance for friction — will abandon an app mid-session if it gets in his way. His problem: missing the spark because the interface got in the way.

### Aiko, 41 — Deaf Product Manager *(edge case)*
Uses a BSL interpreter when provided; relies on live captions (CART or auto-captions) when not. Often the only deaf attendee at events. The ambient audio transcript isn't a nice-to-have for her — it's her primary recovery mechanism when captioning was poor. She frequently photographs the caption screen as a workaround.

### Diane, 45 — Venture Capitalist *(stress case)*
5 back-to-back sessions today. Wrist in a brace (skiing injury, dominant hand). Flew in last night, 5 hours sleep. Zero patience — if something takes more than one tap she will not use it. Her problem: apps that need two hands, require reading instructions, or lose content because she forgot to save before rushing to the next room.

### The scenario intersection that mattered most
Every one of these five personas ends up one-handed, in low light, under cognitive load. This isn't an edge case — it's the default condition at a conference. The design has to work here first.

---

## Phase 5: Design Plan
**Time:** ~15 min | **Output:** 16-task design plan across 6 phases

Before any design work began, the full scope was broken into 16 discrete tasks — each with specific files, steps, an accessibility check, and a verification criterion.

```
Foundation (2)      → Token system, Navigation model
Capture (5)         → Screen layout, Timeline items, Note input, Camera, Audio indicator
Review + Curate (5) → Review layout, Enrichment cards, Edit/annotate, Transcript + quotes, Taxonomy
Share (1)           → Export deck preview
Library (1)         → Session library + search
Motion + Content (2)→ Transitions, All copy
```

Accessibility is embedded in every task — not a final phase.

---

## Phase 6: Token System
**Time:** ~60 min | **Output:** Full design token system

The token system is the foundation everything else builds on. No components, no screens, no layouts until the tokens exist.

### Colour
- **Dark ground:** `#0F0F0D` — warm near-black. Not pure black. The warmth matters at scale.
- **Light ground:** `#F7F7F5` — warm off-white. The review screen you come back to the next day.
- **Accent:** `#00F0E0` (Teal B) — one vivid colour on an otherwise monochrome base. Appears for active states, data signals, and recording indicators. Never decorative.
- **Accent on light (text):** `#008C84` — the same hue darkened to meet AA contrast on white.
- **Elevation (dark):** Three tone steps at ~8% lightness difference. No shadows.
- **Elevation (light):** Ambient shadow at 4% opacity maximum at the highest level.

### Typography
**Atkinson Hyperlegible Next** for all UI text. **Atkinson Hyperlegible Mono** for timestamps, metadata, and transcript. One family, two cuts.

The disambiguation test that made Atkinson the clear choice:

> `I  l  1  |  O  0  Q  i  j`

Every character unambiguous. The slashed `0` is the default letterform. Critical for Priya reading references in low light, and for anyone scanning timestamps at a glance.

### Dividers
No background dot grid. When a horizontal separator is needed — timeline section breaks, list dividers — it uses a Japanese dotted line: 1px dots, 6px gap, 12–15% opacity. Never a solid rule.

### Spacing, radius, animation
- **Spacing:** 4px base, geometric progression (4, 8, 12, 16, 24, 32, 48, 64, 96px)
- **Radius:** 4px for inputs and chips, 8px for cards. Rectilinear — not bubbly.
- **Animation:** 150–200ms, linear or minimal ease. No spring physics. No bounce. The tool doesn't perform.

---

## Phase 7: Navigation Model
**Time:** ~20 min | **Output:** Full navigation map, all flows, session card design

### Structure
No persistent tab bar. Home is the library and the capture entry point combined.

```
HOME (Session List)
├── Active session card — pinned at top, always visible
├── Recent sessions — last 7 days, scrollable
└── Library → — older sessions, full search, cross-session themes

[+] New Session — always accessible from home
```

Five screens: Home, Capture, Review, Export Preview, Library. One flow into each, clean back navigation out.

### Session card design
The challenge: a title alone is a weak memory anchor. "Dr. O'Brien - Talk" means nothing three weeks later.

The solution: three information layers working together.

```
┌────────────────────────────────────────┐
│ [thumbnail]  Embodied Interfaces       │  ← AI-generated topic title
│              Jane O'Brien · WWDC · May 9│  ← Speaker · Event · Date
│ ─ · ─ · ─ · ─ · ─ · ─ · ─ · ─ · ─ · │  ← Japanese dot divider
│  📝 14   📷 6   ⚡ 3 action items      │  ← Content richness signals
│  #AI  #HCI  #Interfaces                │  ← AI-generated taxonomy tags
└────────────────────────────────────────┘
```

**Topic** is the primary title — what you actually remember about a talk, not a speaker name you've already forgotten. Speaker, event, and date are the contextual receipt underneath.

**Thumbnail fallback:** When no photo was taken, the card shows the dominant topic word large — typographic, Atkinson Bold, clearly generated rather than photo-like.

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│          │     │          │     │          │
│ EMBODIED │     │ SPATIAL  │     │ SESSION  │ ← before enrichment
│          │     │          │     │          │
└──────────┘     └──────────┘     └──────────┘
```

### Back-to-back session flow
A solved problem. End a session → home shows it in "Processing…" → `[+]` is immediately available → new session starts. Two taps between sessions. Processing happens in the background.

---

## Phase 8: Capture Screen
**Time:** ~45 min | **Output:** Screen spec + mockups (capture-screen.png, capture-camera.png)

The capture screen is the heart of the product. Everything about it serves one principle: if the user thinks about the app, it's already failed.

### Three zones, one surface
The screen is a single dark surface (#0F0F0D) with three zones: a minimal header, a scrollable timeline, and floating action controls at the bottom. No backgrounds, no bars, no elevation breaks — the whole screen reads as one unified space.

```
Header (56pt):    ● 00:42:17                    [■]
Timeline:         scrollable · items grow upward
Action controls:  [camera icon]  [ Tap to add a note... ]
```

The camera icon and note pill float directly on the dark ground — no container behind them. Both are teal-accented as equal primary actions. Both co-equal — capturing a note and capturing a photo are the same class of action.

### The timeline
Notes get a teal left bar — 3pt, full height. The accent marks the item as yours, captured intentionally. Photos appear as thumbnails with caption and timestamp. Japanese dots between every item — no solid rules anywhere.

Newest items anchor to the bottom. The timeline grows upward as the session progresses.

### A key interaction decision: multi-shot camera
When the user taps the camera icon, a fullscreen viewfinder opens. The reticle auto-detects rectangular shapes — slides, whiteboards, screens — and locks corners onto them with teal brackets.

The question was: does the viewfinder dismiss after each photo, or stay open?

At a conference, speakers move through dense decks fast. A user might photograph 4-5 slides in a row before returning to notes. Dismissing after each shot would cost 2 taps per photo. With a viewfinder that stays open, each subsequent shot is one tap.

**The solution:** Viewfinder stays open. Each captured photo adds a thumbnail confirmation at the bottom of the viewfinder with a teal checkmark and a running counter ("3 captured"). Swipe down to dismiss the viewfinder and return to the timeline. The swipe is OS-standard — no new gesture to learn.

For slides (which are 16:9 landscape), users naturally rotate the phone counter-clockwise. The viewfinder responds to rotation — in landscape, controls move to a right-side strip so the viewfinder isn't interrupted, and the shutter sits centre-right for thumb reach.

The session timer stays visible in the viewfinder top bar throughout — the user always knows audio is still rolling.

### Iteration trail
The camera button went through three versions before landing:
1. **Teal-filled circle** — too bright, too much contrast against the dark screen
2. **Teal-bordered circle** — still too heavy
3. **Icon only, teal, no container** — correct. Restrained, visible, doesn't compete with the timeline

The note pill uses a teal border (not fill) to match the camera icon's weight. Both announce themselves without shouting.

---

## Phase 9: Figma Handoff + Design Iteration
**Time:** ~30 min | **Output:** Figma file, revised mockups, synced spec

After the capture screen spec was approved, a Figma file was built directly from the design documents — all three pages populated with the iPhone 14 Pro frames (393×852pt portrait, 852×393pt landscape) using the token system: `#0F0F0D` background, `#00F0E0` teal accent, Atkinson Hyperlegible, JetBrains Mono.

**Figma file:** [Conference Capture — Screens](https://www.figma.com/design/EduXtIq05w8ZOU3nu9Na7o)

### Design refinements made in Figma

Taking the screens into Figma revealed several decisions that needed refining. Edits were made directly in Figma and synced back into the spec documents:

| Element | Original spec | Revised in Figma |
|---------|--------------|-----------------|
| Recording dot | Teal `#00F0E0` | Pink/magenta — more visually distinct from teal accent, clearer "live recording" signal |
| Camera icon | Constructed from rectangles | Replaced with custom vector — cleaner, more considered |
| Header divider | Solid 1px hairline | Dashed — lighter, less structural weight |
| Note pill height | 48pt | 40pt — tighter, better proportion against the screen |
| Note pill border | `#00A89C` 1.5pt (darkened accent) | `#00F0E0` 2pt (full accent) — more decisive, matches recording dot register |
| Slide info block | Considered stray element | Intentionally retained — gives the active capture screen context without requiring separate UI |

### The two-way workflow
This phase established a pattern for the rest of the project: design specs are generated here, pushed to Figma, edited as a designer would edit — then changes are read back from the Figma API and synced into the spec documents. The Figma file is the source of visual truth. The spec documents are the source of decision truth.

Original programmatic mockups are preserved in `screens/mockups/iterations/` as the v1 reference. The canonical PNGs are now pulled directly from the Figma file.

---

## What's Next

The capture screen is complete. Next:
- **Task 4:** Timeline item components — defining the full component set for notes, photos, and audio markers
- **Tasks 5–7:** Note input, camera capture, audio indicator interactions
- **Tasks 8–12:** The full review and curation experience
- **Task 13:** Export deck preview
- **Tasks 14–16:** Library, motion, content

This case study will continue to grow as each phase completes.

---

## Deliverables Log

| # | Deliverable | Phase | Time | Status |
|---|-------------|-------|------|--------|
| 1 | Design brief (v4) | Discovery | ~45 min | ✅ Approved |
| 2 | Taste profile | Taste | ~30 min | ✅ Approved |
| 3 | Competitive analysis | Strategy | ~25 min | ✅ Complete |
| 4 | Design principles (5) | Strategy | included | ✅ Complete |
| 5 | Experience map | Strategy | included | ✅ Complete |
| 6 | Inclusive personas (5) | Personas | ~20 min | ✅ Complete |
| 7 | Design plan (16 tasks) | Planning | ~15 min | ✅ Approved |
| 8 | Token system | Design | ~60 min | ✅ Complete |
| 9 | Navigation model | Design | ~20 min | ✅ Complete |
| 10 | Capture screen spec + mockups | Design | ~45 min | ✅ Complete |
| 11 | Figma file — all screens | Handoff | ~30 min | ✅ Complete |
| 12 | Design iteration in Figma — capture screen | Iteration | ~20 min | ✅ Synced |
| — | Timeline components | Design | — | 🔜 Next |
| — | Review experience | Design | — | 🔜 Upcoming |
| — | Export flow | Design | — | 🔜 Upcoming |

**Total active time to date: ~5.25 hours**
**Calendar time: 6 days (May 8–14, 2026)**

---

_This document is a living case study. It is updated after each design phase completes._
_Last updated: May 14, 2026 — Figma iteration synced_
