# Design Plan: Conference Capture

> **For agentic workers:** REQUIRED: Use designpowers:designpowers-critique to review completed work against this plan.

**Goal:** Design the full Conference Capture experience — from zero-friction session start through AI-enriched review, transcript curation, and deck export.

**Design Direction:** products/noteapp/briefs/2026-05-08-conference-capture.md · products/noteapp/strategy/2026-05-08-conference-capture-strategy.md · products/noteapp/taste/2026-05-08-conference-capture-taste.md

**Personas:** products/noteapp/personas/2026-05-10-conference-capture-personas.md — Marcus, Priya, James, Aiko, Diane.

---

## Phase 1: Foundation

---

## Task 1: Design Token System

**Files:** `products/noteapp/tokens/tokens.md`

- [ ] Define dark mode palette: background (#0F0F0D range), surface, elevated surface, off-white text, mid text, muted text
- [ ] Define light mode palette: off-white ground (#F7F7F5 range), surface, elevated, near-black text
- [ ] Select and specify the single vivid accent color — contrast-tested on both dark and light grounds (min AA on all text uses)
- [ ] Define spacing scale (4px base, geometric progression)
- [ ] Define type scale: geometric sans for UI (sizes, weights, tracking), monospace for timestamps and metadata
- [ ] Define radius vocabulary: 4px (inputs, chips), 8px (cards), 0px (full-bleed surfaces)
- [ ] Specify dot grid: 1px dot, 6–8% opacity, grid interval
- [ ] Define elevation system for dark: 3 tone steps (~8% lightness diff), no shadows
- [ ] Define elevation for light: ambient shadow at 4% opacity max

**Accessibility check:** Accent color must pass AA contrast on both grounds. Text tokens must meet AA at all defined sizes. Do not rely on colour alone for any state.

**Verification:** Every token has a dark and light value. Accent passes contrast audit on both. Type scale covers all UI use cases without gaps.

---

## Task 2: Navigation Model

**Files:** `products/noteapp/screens/navigation.md`

- [ ] Define the top-level navigation structure: Capture entry, Library, active session indicator
- [ ] Specify how users move from Library into a session (review mode)
- [ ] Specify the transition from capture → review (same session, different mode)
- [ ] Define how back-to-back sessions are handled: ending one session and starting the next, or running two in sequence
- [ ] Specify tab bar or equivalent: what lives there, what does not

**Accessibility check:** Navigation targets minimum 44×44pt. Active state is not colour-only. Screen reader announces current location on every transition.

**Verification:** Every screen in the product is reachable from the navigation model. No dead ends. No orphaned screens.

---

## Phase 2: Capture

---

## Task 3: Capture Screen — Layout and Entry

**Files:** `products/noteapp/screens/capture.md`

- [ ] Design the capture screen: dark ground, timeline feed, input affordances
- [ ] Design the session start state: single primary action, no setup required
- [ ] Specify the persistent audio recording indicator — subtle, accessible, never alarming
- [ ] Specify the timeline empty state (just started — nothing captured yet)
- [ ] Design the battery/storage awareness indicator: when and how it appears, never interrupts
- [ ] Specify screen layout at various phone sizes (small to large)

**Accessibility check:** Start action minimum 44×44pt, reachable one-handed (bottom half of screen). VoiceOver announces "recording started" on tap. Audio indicator has text label, not icon only.

**Verification:** A user can open the app and start a session in under 2 seconds. The screen is usable one-handed. No text smaller than 13pt.

---

## Task 4: Timeline Item Components

**Files:** `products/noteapp/components/timeline-items.md`

- [ ] Design the **note item**: text content, timestamp, live vs. post-session visual distinction (weight, opacity, or marker)
- [ ] Design the **photo item**: image thumbnail in timeline, timestamp, tap-to-expand behaviour
- [ ] Design the **audio segment indicator**: a visual marker on the timeline showing audio is captured for this period — not a waveform, a presence indicator
- [ ] Define the timestamp component: monospace, muted, consistent placement
- [ ] Define the visual language distinguishing live captures from post-session additions: must be immediately readable, not reliant on colour alone

**Accessibility check:** Photos have AI-generated alt text. Live vs. post-session distinction works without colour. Timestamps readable at muted opacity. All items reachable via screen reader in chronological order.

**Verification:** Three item types are visually distinct but speak the same design language. Live/post-session distinction is unambiguous.

---

## Task 5: Note Input Interaction

**Files:** `products/noteapp/interactions/note-input.md`

- [ ] Design the note input trigger: how the keyboard appears without a visible input field cluttering the timeline
- [ ] Specify autocorrect behaviour during capture: suppressed or standard?
- [ ] Design the note commit behaviour: how a note is added to the timeline (tap away, return key, etc.)
- [ ] Specify input field appearance on dark ground
- [ ] Design for one-handed keyboard reach

**Accessibility check:** Input is reachable via VoiceOver. Keyboard appearance does not obscure the last timeline item. Error states (failed to save) are communicated via text, not colour only.

**Verification:** A note can be added and committed with one hand without looking away from the stage.

---

## Task 6: Camera Capture

**Files:** `products/noteapp/interactions/camera-capture.md`

- [ ] Design the camera trigger: placement, size, one-tap behaviour
- [ ] Specify capture confirmation: haptic feedback, timeline update (photo drops in instantly)
- [ ] Design the "capturing" state: no shutter sound required, visual confirmation only
- [ ] Specify fast-capture priority: accept slightly lower quality for speed

**Accessibility check:** Camera button 44×44pt minimum. Haptic + visual confirmation (not audio-only). VoiceOver announces "photo added" after capture.

**Verification:** A photo can be captured with one tap, confirmed without sound, and appears in the timeline within 1 second.

---

## Task 7: Audio Recording Indicator

**Files:** `products/noteapp/components/audio-indicator.md`

- [ ] Design the persistent recording state indicator: minimal, dark-native, non-intrusive
- [ ] Design the paused/stopped recording state
- [ ] Specify the recording control: how to pause, stop, restart
- [ ] Design the enrichment-in-progress state (post-session processing)

**Accessibility check:** Recording state announced by VoiceOver. Pause/stop control is labelled and 44×44pt minimum.

**Verification:** User always knows whether audio is recording. Control is accessible without leaving the capture flow.

---

## Phase 3: Review + Curate

---

## Task 8: Review Screen Layout

**Files:** `products/noteapp/screens/review.md`

- [ ] Design the review screen: light mode, timeline layers (notes, photos, transcript, enrichment)
- [ ] Specify how the three content layers are visually separated without hard dividers
- [ ] Design the session header: AI-generated title, date, duration, speaker name
- [ ] Specify the scroll behaviour: continuous timeline, anchored header
- [ ] Design the search entry point within a session

**Accessibility check:** Light mode contrast AA minimum throughout. Timeline is screen-reader navigable in chronological order. Session header reads completely in VoiceOver before timeline items.

**Verification:** All captured content is visible and readable in the review layout. No content is hidden behind interaction.

---

## Task 9: Enrichment Card Components

**Files:** `products/noteapp/components/enrichment-cards.md`

- [ ] Design the **speaker bio card**: name, role, org, photo, links (LinkedIn, recent work)
- [ ] Design the **reference card**: URL/paper/book — title, source, one-line description, link
- [ ] Design the **acronym expansion chip**: inline, unobtrusive, tap to expand
- [ ] Design the **action item card**: extracted commitment, checkbox, source context
- [ ] Define card placement logic: how enrichment cards appear relative to the relevant timeline moment
- [ ] Design the enrichment loading/pending state (when still processing)

**Accessibility check:** Cards are navigable via screen reader. Links are labelled descriptively (not "click here"). Images have alt text. Cards do not interrupt timeline reading order.

**Verification:** Five card types are visually consistent and distinguishable. Each is dismissible. Placement feels contextually correct, not random.

---

## Task 10: Curation — Edit and Annotate

**Files:** `products/noteapp/interactions/curation.md`

- [ ] Design the note edit interaction: tap to edit, inline editing, commit/cancel
- [ ] Design the post-session commentary entry: how new notes anchor to a timeline point
- [ ] Specify the visual distinction between live captures and post-session additions at every item type (note, photo caption, annotation)
- [ ] Design the long-press context menu: available actions per item type

**Accessibility check:** Edit and annotate actions available via both gesture and accessible action menu. No gesture-only paths. Edit state announced by VoiceOver.

**Verification:** A user can edit a live note and add a new annotation without confusion about which is which.

---

## Task 11: Transcript View and Quote Highlighting

**Files:** `products/noteapp/screens/transcript.md` · `products/noteapp/interactions/quote-highlight.md`

- [ ] Design the transcript view within the review timeline: how it appears alongside notes and photos
- [ ] Design text selection and highlight interaction: long-press to select, confirm to flag
- [ ] Design the highlighted quote state: visually flagged in timeline, included in export queue
- [ ] Design the quote export queue: how flagged quotes are collected and visible pre-export
- [ ] Specify how transcript timestamps align with timeline items

**Accessibility check:** Transcript text meets AA contrast and is readable at system large text sizes. Text selection accessible via VoiceOver text selection mode. Highlighted state is not colour-only.

**Verification:** A user can select a quote, confirm it for export, and see it in the export queue. The state is reversible.

---

## Task 12: AI Taxonomy Suggestion

**Files:** `products/noteapp/components/taxonomy-card.md`

- [ ] Design the dismissible taxonomy suggestion card: proposed tags, confirm/edit/skip actions
- [ ] Design the tag component: applied, suggested, editable states
- [ ] Design the "taxonomy update" prompt that appears as library grows: new category suggestions, merge suggestions, split suggestions
- [ ] Specify the placement: top of review screen, non-blocking

**Accessibility check:** Card is dismissible via accessible action. Tags are labelled. Confirm/skip actions are clearly distinct and 44×44pt.

**Verification:** Taxonomy suggestion is visible without blocking the timeline. User can confirm, adjust, or skip in one tap.

---

## Phase 4: Share

---

## Task 13: Export Deck Preview

**Files:** `products/noteapp/screens/export-preview.md`

- [ ] Design the deck preview screen: slide thumbnails, reorder, remove
- [ ] Specify what AI selects by default: engagement-weighted notes, flagged quotes, photos, enrichment highlights, AI summary slide
- [ ] Design the slide ordering interaction
- [ ] Design the remove-slide interaction with undo
- [ ] Design the AI summary slide template
- [ ] Specify the export action: Google Slides vs PowerPoint choice

**Accessibility check:** Slide thumbnails have text descriptions. Reorder is accessible (not drag-only). Remove has undo. Export confirmation is clearly labelled.

**Verification:** A user can preview, adjust, and export a deck in under 2 minutes. The undo path for slide removal is obvious.

---

## Phase 5: Library

---

## Task 14: Session Library

**Files:** `products/noteapp/screens/library.md`

- [ ] Design the session list: card per session, title, date, speaker, duration, taxonomy tags
- [ ] Design the empty library state (no sessions yet)
- [ ] Design the search entry: cross-session, full text
- [ ] Design search results: grouped by session, highlighted matches
- [ ] Design the cross-session theme card: recurring topic, number of sessions, tap to explore

**Accessibility check:** Session cards are fully readable by screen reader. Search is accessible. Theme cards are supplementary — the library is navigable without them.

**Verification:** A user can find a specific session in under 3 taps. Search returns results across sessions. Theme cards add value without blocking access.

---

## Phase 6: Motion and Content

---

## Task 15: Motion and Transitions

**Files:** `products/noteapp/interactions/motion.md`

- [ ] Define screen transition vocabulary: capture → review, library → session, review → export
- [ ] Specify micro-interaction timings: 150–200ms, linear or minimal ease
- [ ] Design the timeline item entry animation: how new items appear during capture
- [ ] Specify all reduced-motion fallbacks: opacity fades replace all transforms
- [ ] Define haptic vocabulary: capture confirmation, session start, export complete

**Accessibility check:** All animations have reduced-motion alternatives. No animation conveys information not available through static means.

**Verification:** Full motion spec documented with reduced-motion equivalents for every animation.

---

## Task 16: Content and Copy

**Files:** `products/noteapp/content/copy.md`

- [ ] Write all UI labels: navigation, actions, states
- [ ] Write all empty states: first launch, empty timeline, empty library, no search results
- [ ] Write all AI copy: enrichment card headers, taxonomy suggestions, summary labels — plain, direct, no "✨ AI" badges
- [ ] Write all error states: failed to save, enrichment unavailable, export failed
- [ ] Write onboarding: first-launch, first session start, first enrichment notification
- [ ] Apply reading level check: Grade 8 or below for all instructional copy

**Accessibility check:** No instruction relies on directional language alone ("tap the icon above"). All error messages state what happened and what to do. Empty states are informative, not just decorative.

**Verification:** All strings written. No placeholder copy. AI copy passes the "inevitable not magic" principle.

---

## Task Order Summary

```
Token System → Navigation Model
     ↓
Capture Screen → Timeline Items → Note Input → Camera → Audio Indicator
     ↓
Review Layout → Enrichment Cards → Curation → Transcript + Quotes → Taxonomy
     ↓
Export Preview
     ↓
Session Library
     ↓
Motion · Content
     ↓
Critique · Accessibility Review · Heuristic Evaluation
     ↓
Fix Round → Synthetic User Testing → Verification
```
