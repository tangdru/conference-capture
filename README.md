# Conference Capture

A mobile-first app for capturing notes, photos, and audio at conferences — with AI enrichment and one-tap deck export.

## Structure

```
design/       Design documentation — briefs, strategy, personas, tokens, screens
src/          App source code (React + TypeScript + Vite)
public/       Static assets
```

## Design Status

6 of 16 design tasks complete. See `design/design-state.md` for current status and decisions log.

## Prototype

The prototype implements everything designed so far: home (session list), capture
screen (timeline, note input, camera viewfinder), and the recording/suspend/end
session lifecycle. Review, enrichment, and export aren't designed yet, so those
screens are stubbed. Sessions and captured photos are stored in the browser via
`localStorage` — there is no backend.

```
npm install
npm run dev       # local dev server
npm run build     # production build to dist/
npm run preview   # serve the production build locally
```

Camera and microphone capture require HTTPS (or localhost) and browser permission.

## Deploying to GitHub Pages

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the app and
publishes `dist/` to GitHub Pages. One-time setup: in the repo's **Settings →
Pages**, set **Source** to **GitHub Actions**.

## Stack

React + TypeScript + Vite, no backend. Chosen for a fast static build that
deploys cleanly to GitHub Pages while the product's real backend/AI needs are
still being designed.
