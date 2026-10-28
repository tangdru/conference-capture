# Conference Capture

This is the Conference Capture product — a mobile-first app for capturing notes, photos, and audio at conferences, with AI enrichment and one-tap deck export.

## Keeping sessions in sync

More than one Claude session works on this repo at once (e.g. a cloud session for web/Supabase work and a local Mac session for the iOS build). Git is the only thing that keeps them in agreement, so:

- **Always run `git pull origin main` before starting any chunk of work** — every time, not just at session start. If on a feature branch, merge or rebase `origin/main` into it.
- When a change is done, commit and push it promptly so the other session doesn't build on a stale copy.
- Files both tracks touch (e.g. `Capacitor.isNativePlatform()` branches in `src/hooks/useAmbientTranscription.ts`) are where conflicts happen — pull immediately before editing them.

## Designpowers

This project uses the Designpowers design workflow system, vendored in this repo at `.designpowers/` (from https://github.com/Owl-Listener/designpowers) so it loads in any session — local, cloud, or mobile.

## Mandatory: Welcome Sequence First

**Before doing anything else in a new session**, you MUST run the welcome sequence defined in `.designpowers/skills/using-designpowers/SKILL.md`. This is non-negotiable.

1. Invoke the `using-designpowers` skill using the Skill tool **before** responding to any user message
2. The skill will show the bird welcome screen and handle onboarding
3. Do NOT skip the welcome, do NOT jump straight into design work, do NOT answer questions before the welcome runs

The welcome sequence checks for a returning user (taste profile at `~/.designpowers/taste-profile.md`) and shows the appropriate welcome screen with the bird. This must happen before any design work begins.

**Specifically: do NOT invoke design-discovery, design-strategy, design-memory, design-state, design-taste, or any other Designpowers skill until the welcome sequence has completed.**

## Skills

All design skills live in `.designpowers/skills/`. The entry point is `.designpowers/skills/using-designpowers/SKILL.md` which orchestrates the entire workflow. Never bypass it.

## Agents

Design agents live in `.designpowers/agents/`. They are invoked by the workflow — do not call them directly without going through the skill orchestration.

## Project Structure

```
design/          Design documentation — briefs, strategy, personas, tokens, screens, components
src/             App source code (React + TypeScript + Vite)
public/          Static assets
```

## Prototype

A working prototype (React + TypeScript + Vite, client-only) lives in `src/` and
deploys to GitHub Pages via `.github/workflows/deploy.yml` on push to `main`. It
implements the design tasks completed so far (tokens, navigation, capture
screen, timeline items, camera capture, audio recording states) — see
`design/design-state.md` for what's built vs. still being designed.

## Design State

Current design state: `design/design-state.md`
Active plan: `design/plans/2026-05-08-conference-capture-plan.md`
Figma file: https://www.figma.com/design/EduXtIq05w8ZOU3nu9Na7o/Conference-Capture-%E2%80%94-Screens
