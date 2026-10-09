# Transcript/Notes/Photos Enrichment Scope

_Defined 2026-10-09, user override. Scopes what Claude surfaces from the combination of transcript, notes, and photos — feeds Tasks 9 (Enrichment Cards), 11 (Transcript + Quotes), 12 (Taxonomy), and 13 (Export Preview). Nothing in this list is implemented yet — transcript capture itself exists; everything below is enrichment built on top of it._

## 1. Content extraction & correction
- **Fill in blanks in notes** — complete/correct quick jottings against what was actually said
- **Read the photos too** — OCR/vision on slide photos, cross-checked against the transcript for that moment; also covers the existing AI-alt-text requirement (Task 4)
- **Recommended quotes** — AI-suggested candidates feeding the manual quote-highlighting flow (Task 11)

## 2. Reference & citation surfacing
- **Pull out references** — papers, books, named sources the speaker cites (Task 9 reference card)
- **URLs → live links**
- **Named entities** — companies, products, competitors, tools mentioned (distinct from citable references)
- **Stat/number callouts** — figures worth pulling as deck-ready callouts

## 3. People
- **Speaker bio card** — name/role/org/links, resolved from self-intro + any title-slide photo (Task 9)
- **Speaker attribution across the transcript** — human labels a few anchor entries from memory, Claude propagates names to the rest via text reasoning only. No audio retention needed: the user was in the room and knows who said what; fidelity depends on labeling soon after the session, not on a recording.

## 4. Structure & synthesis
- **Acronym/jargon expansion chip** (Task 9)
- **Action items/commitments** — the speaker's own, extracted with source context (Task 9)
- **Section/chapter detection** — infer the talk's own shape (intro → problem → demo → Q&A → close)
- **Speaker-signaled emphasis** — literal cues ("the key thing is," "most importantly"), not an AI judgment call
- **In-context definitions** — terms the speaker explicitly defines themselves (vs. the acronym chip, for terms left unexplained)
- **Session summary/TL;DR** — synthesis across transcript + notes + photos (feeds Task 13's AI summary slide)

## 5. Threads worth following
- **Open questions/unresolved threads** the speaker poses or admits uncertainty on
- **Comparisons/contrasts drawn** ("unlike X, we do Y")
- **Calls-to-action for the audience** — what *you're* told to do (follow, sign up, check out a repo), distinct from the speaker's own action items

## 6. Cross-session context
- **Thematic connections to past sessions** — ties into the already-planned taxonomy/cross-session theme card (Tasks 12 & 14)

## 7. Navigation (not new content)
- **Note-to-transcript linking** — ties a vague note to its nearest transcript timestamp for later context

## 8. Deliberately excluded
- **Sentiment/audience-reaction analysis** — a judgment call dressed as fact, cuts against the "never chatty, never surprising" design principle
