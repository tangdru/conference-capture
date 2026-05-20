# Design Brief: Conference Capture — v4

## Problem Statement
Knowledge workers who regularly attend talks and conferences juggle three separate tools — notes app, camera, voice memo — losing context between everything they capture. Getting insights back to their team means recreating work from scratch. This app captures everything in one seamless session, enriches it with AI-pulled context, and lets the user curate and export a shareable output — so the value of attending a talk doesn't evaporate within 48 hours.

## Users
**Primary persona:** Curious, cross-disciplinary knowledge workers who attend talks and conferences regularly. They think in connections between ideas. They currently lose most of what they captured because no tool helps them do anything with it. The person who built this is this person.

Ability spectrum:
- One-handed use throughout (bag on shoulder, drink in hand)
- High cognitive load during capture — friction must be near-zero
- Dark auditoriums and bright exhibition halls — dark mode is primary, light mode for review
- Screen reader support for review, curation, and export phases
- Fast typists and slow typists — ambient audio capture covers both

## Design Direction
**Timeline stream with AI enrichment and active curation.** Everything captured lands in a live timestamped feed during the session. After the session, an AI enrichment layer adds context from outside the room. The user then reviews and curates — editing notes, adding commentary, highlighting transcript quotes — before exporting a shareable deck.

## Core Experience Arc
```
CAPTURE         ENRICH          REVIEW + CURATE               SHARE
────────────    ──────────      ─────────────────────         ────────────────
Timestamped     Speaker bio     Editable timeline             AI summary
timeline feed   Ref links       Add post-session commentary   Highlighted quotes
Notes + photos  Publications    Highlight transcript quotes   Export to deck
Ambient audio   Companies       Search within session         Cross-session
                Action items    Visual distinction:           themes + search
                                live vs. post-session
```

## Phase Detail

### Capture
- Single unified mode — tap to photo, type to note, audio rolls in background
- Everything timestamped as it lands
- Near-zero friction — the screen is dark, minimal, out of the way

### Enrich (post-session, automatic)
- Speaker intelligence — bio, LinkedIn, recent work, publications, co-authors
- Reference enrichment — websites, papers, books, tools, companies, GitHub repos mentioned
- Content enrichment — acronym expansion, concept definitions, claim sourcing
- Engagement signals — note velocity and photo frequency weight the AI summary
- Action extraction — follow-ups and commitments surfaced from notes

### Review + Curate
- Timeline is fully editable — notes can be corrected, expanded, annotated
- New commentary can be added anchored to any point in the timeline
- Live captures and post-session additions are visually distinct — preserves the record of what you noticed in the room
- Transcript is interactive — select and highlight quotes to flag for export
- Highlighted quotes are first-class content in the final output, not raw fragments
- Search within session

### Share
- AI-generated session summary weighted by engagement signals and curated highlights
- Export to Google Slides / PowerPoint — built from notes, photos, curated quotes, and flagged enrichment
- Cross-session search to surface themes across talks attended

## Constraints
- Mobile-first throughout — capture, review, curation, and export all on phone
- OS agnostic — standard mobile patterns across iOS and Android; no platform-native chrome
- Desktop is a future nice-to-have, not v1
- Audio is ambient (not dictation) — transcript is post-session
- Export targets: Google Slides, PowerPoint
- Enrichment is post-session, not real-time
- General audience first — no vertical-specific output modes in v1

## Existing Design System
None — greenfield.

## Taste Direction
**Emotional target:** Quiet precision. The app disappears so the content speaks.

**Modes:** Dark (primary, for capture) / Light (secondary, for review)

**Aesthetic principles:**
1. Negative space is structure
2. One color earns its place
3. The grid is always underneath
4. Data is the design
5. Editorial restraint

**Quality level:** Flagship.

**Craft standards:** Near-black ground, off-white text, 1px dot grid at 8% opacity, one vivid accent, geometric sans + monospace for metadata, 150–200ms animation, rectilinear radius (4px/8px), no shadows on dark.

**Personality:** A research scientist with impeccable taste. Precise without being cold.

**Full taste document:** products/noteapp/taste/2026-05-08-conference-capture-taste.md

## Success Criteria
- Capture is faster than switching between three apps
- Review the next day is useful without a cleanup step
- Enrichment surfaces context the user wouldn't have found themselves
- Curation takes less than 10 minutes to produce a shareable output
- Export produces a shareable deck in under 2 minutes
- Cross-session search finds connections the user didn't consciously notice

## Out of Scope (v1)
- Real-time transcription during capture
- Desktop-primary experience
- Multi-user / collaborative sessions
- Vertical-specific output modes
- Live enrichment during capture
- Ambient light auto-switching
- Collaborative annotation on shared sessions
