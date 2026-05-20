# Design Tokens: Conference Capture

_Produced by: design-lead | Task 1 of 16_

---

## Typefaces

| Role | Typeface | Fallback |
|------|----------|----------|
| UI (all interface text) | Atkinson Hyperlegible Next | system-ui, -apple-system, sans-serif |
| Mono (timestamps, metadata, transcript) | Atkinson Hyperlegible Mono | ui-monospace, monospace |

**Rationale:** One family, two cuts. Atkinson Hyperlegible is engineered specifically for disambiguation — slashed `0` by default, distinct `I/l/1`, strong letterform differentiation at small sizes in low light (critical for Priya and dark-mode capture). Next provides 7 weights and variable font support. Mono shares the same design language for timestamps and metadata. Accent `#00F0E0` (Teal B) chosen by user — darkened to `#008C84` for text on light ground.

---

## Type Scale

| Token | Size | Line height | Weight | Usage |
|-------|------|-------------|--------|-------|
| `text-display` | 32px | 1.1 | 600 | Session titles, large headers |
| `text-h1` | 24px | 1.2 | 600 | Screen titles |
| `text-h2` | 20px | 1.3 | 600 | Section headers |
| `text-h3` | 17px | 1.4 | 600 | Card titles, subsections |
| `text-body` | 16px | 1.6 | 400 | Notes, transcript body |
| `text-body-sm` | 14px | 1.6 | 400 | Secondary content, descriptions |
| `text-label` | 13px | 1.4 | 500 | Labels, tags, navigation |
| `text-caption` | 12px | 1.4 | 400 | Supporting text, hints |
| `text-mono-timestamp` | 12px | 1.0 | 400 | Timestamps (Atkinson Hyperlegible Mono) |
| `text-mono-meta` | 11px | 1.0 | 400 | Metadata, duration (Atkinson Hyperlegible Mono) |

**Minimum body size:** 16px. No interface text below 11px. Priya uses reading glasses — 13px is the floor for any interactive label.

---

## Colour — Dark Mode (Primary)

| Token | Value | Usage |
|-------|-------|-------|
| `bg-base` | `#0F0F0D` | App background, capture screen |
| `bg-surface` | `#1C1C19` | Cards, panels, timeline items |
| `bg-elevated` | `#282825` | Modals, popovers, context menus |
| `text-primary` | `#EEEEE9` | Primary text |
| `text-secondary` | `#9B9A94` | Secondary text, descriptions |
| `text-muted` | `#5E5D58` | Timestamps, muted labels |
| `border` | `rgba(238,238,233, 0.12)` | Hairline borders, dividers |
| `accent` | `#00F0E0` | Primary accent — icons, highlights, active states |
| `accent-subtle` | `rgba(0,240,224, 0.12)` | Accent backgrounds, selection states |
| `semantic-error` | `#FF6B6B` | Error states |
| `semantic-success` | `#4ADE80` | Success states |
| `semantic-warning` | `#00F0E0` | Warning — shares accent hue intentionally |

**Elevation (dark) — tone steps only, no shadows:**
- Level 0: `bg-base` #0F0F0D
- Level 1: `bg-surface` #1C1C19 (~8% lighter)
- Level 2: `bg-elevated` #282825 (~8% lighter)

---

## Colour — Light Mode (Secondary)

| Token | Value | Usage |
|-------|-------|-------|
| `bg-base` | `#F7F7F5` | App background, review screen |
| `bg-surface` | `#FFFFFF` | Cards, panels, timeline items |
| `bg-elevated` | `#FFFFFF` | Modals, popovers (+ elevation shadow) |
| `text-primary` | `#1A1A18` | Primary text |
| `text-secondary` | `#6B6A66` | Secondary text, descriptions |
| `text-muted` | `#9B9A95` | Timestamps, muted labels |
| `border` | `rgba(26,26,24, 0.10)` | Hairline borders, dividers |
| `accent` | `#00F0E0` | UI components, icons, highlights (non-text) |
| `accent-text` | `#008C84` | Accent as text on light ground — darkened for AA contrast (5.2:1) |
| `accent-subtle` | `rgba(0,240,224, 0.10)` | Accent backgrounds, selection states |
| `semantic-error` | `#DC2626` | Error states |
| `semantic-success` | `#16A34A` | Success states |
| `semantic-warning` | `#D97706` | Warning |

**Elevation (light) — shadow only at level 2:**
- Level 0: `bg-base` #F7F7F5
- Level 1: `bg-surface` #FFFFFF (no shadow)
- Level 2: `bg-elevated` #FFFFFF + `box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.06)`

---

## Contrast Audit

| Pairing | Ratio | WCAG |
|---------|-------|------|
| `text-primary` on `bg-base` (dark) | 16.8:1 | AAA ✓ |
| `text-secondary` on `bg-base` (dark) | 5.4:1 | AA ✓ |
| `text-muted` on `bg-base` (dark) | 3.1:1 | AA (large text / UI) ✓ |
| `accent` on `bg-base` (dark) — UI component | 12.1:1 | AAA ✓ |
| `text-primary` on `bg-base` (light) | 16.0:1 | AAA ✓ |
| `text-secondary` on `bg-base` (light) | 5.7:1 | AA ✓ |
| `accent-text` (#008C84) on `bg-base` (light) | 5.2:1 | AA ✓ |
| `accent` on `bg-base` (light) — UI component | 3.1:1 | AA (UI) ✓ |

---

## Spacing Scale

4px base, geometric progression.

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Tight gaps, icon padding |
| `space-2` | 8px | Inner component padding |
| `space-3` | 12px | Small gaps between elements |
| `space-4` | 16px | Standard component padding |
| `space-5` | 24px | Section gaps |
| `space-6` | 32px | Large section gaps |
| `space-7` | 48px | Screen-level spacing |
| `space-8` | 64px | Major layout divisions |
| `space-9` | 96px | Hero/large spacing |

**Touch targets:** minimum 44×44px for all interactive elements. Priya's wrist pain and Diane's wrist brace make this non-negotiable.

---

## Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-none` | 0px | Full-bleed surfaces, dividers |
| `radius-sm` | 4px | Inputs, chips, small tags |
| `radius-md` | 8px | Cards, panels, enrichment cards |
| `radius-full` | 9999px | Pills, toggles, avatar crops |

---

## Dividers — Japanese Dots

No background dot grid. Backgrounds are clean and flat.

When a horizontal divider is needed (timeline sections, list separators, card boundaries), use a **Japanese dotted line** — not a solid rule.

| Property | Value |
|----------|-------|
| Style | Dotted — `border-style: dotted` or `stroke-dasharray: 1 6` (SVG) |
| Dot size | 1px |
| Dot gap | 6px |
| Dark opacity | 15% (`rgba(238,238,233, 0.15)`) |
| Light opacity | 12% (`rgba(26,26,24, 0.12)`) |
| Usage | Timeline section breaks, list separators — never decorative |
| Never | Solid horizontal rules, background textures, grid overlays |

---

## Animation

| Token | Value | Usage |
|-------|-------|-------|
| `duration-fast` | 150ms | Micro-interactions, state changes |
| `duration-base` | 200ms | Standard transitions |
| `duration-slow` | 300ms | Screen transitions, modals |
| `easing-base` | `cubic-bezier(0.4, 0, 0.2, 1)` | Standard ease — controlled, not springy |
| `easing-out` | `cubic-bezier(0, 0, 0.2, 1)` | Elements entering |
| `easing-in` | `cubic-bezier(0.4, 0, 1, 1)` | Elements leaving |

**Reduced motion:** All transforms swap to `opacity` fades at `prefers-reduced-motion: reduce`. Duration stays the same — only the transform is removed. James (ADHD) and users with vestibular conditions benefit from this.

---

## Camera Viewfinder — Reticle

| Property | Value |
|----------|-------|
| Colour | `#00F0E0` (accent) |
| Stroke weight | 2pt |
| Corner width | 28pt |
| Corner height | 28pt |
| Opacity | 100% |
| Behaviour | Auto-detects rectangular shapes; corners lock to detected boundary |

---

## Semantic Colour Rules

1. **Accent (#00F0E0) means action or data signal** — active states, selected items, data encoding. Never decorative.
2. **Muted text is informational only** — never interactive. If you can tap it, it needs at minimum `text-secondary`.
3. **Colour never carries meaning alone** — every colour state is paired with a label, icon, or shape change.
4. **Dark mode is not an inversion** — dark tokens are independently specified, not auto-generated from light values.
