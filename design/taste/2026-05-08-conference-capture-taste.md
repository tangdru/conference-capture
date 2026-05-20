# Taste Profile: Conference Capture

## Existing Design System
No existing design system — building taste from scratch.

## Emotional Target
Quiet precision. Like a scientific instrument — focused, intelligent, calm. The app disappears so the content speaks. Using it mid-talk should feel like the tool got out of your way.

## Modes
- **Dark (primary)** — near-black ground (#0F0F0D), off-white text, clean flat background. Default. Built for auditoriums.
- **Light (secondary)** — off-white ground (#F7F7F5), near-black text, clean flat background. For review at your desk.
- Default: Dark. User-toggled. Ambient light auto-switch deferred to v2.

## Aesthetic Principles

**1. Negative space is structure, not absence**
Whitespace carries layout weight. It separates, groups, and communicates hierarchy without lines or borders. If a divider exists, it's a hairline at low opacity — not a wall.
_Test: Remove it. Does the design collapse? If not, the space was doing the work._

**2. One color earns its place**
The base palette is near-monochrome. Color appears once, purposefully — it means something when it does. Accent color is never decorative.
_Test: What does this color tell the user? If the answer is "nothing," remove it._

**3. The grid is always underneath**
Dot matrix, baseline grid, mathematical order — structure lives beneath the surface. Not always visible, always felt.
_Test: Can you feel the grid even when you can't see it?_

**4. Data is the design**
The timeline, transcript, and visualisations are the visuals. No chrome, no decoration competing with content. The interface recedes. The information advances.
_Test: Is the UI competing with the content? If so, strip it._

**5. Editorial restraint**
Every element earns its place. If it can be removed without losing meaning, remove it.
_Test: What breaks if I remove this? If nothing breaks, cut it._

## Quality Level
**Flagship.** Every pixel intentional. Micro-interactions precise, not playful. Typography refined to near-invisibility. The dot grid texture is subtle enough that most users never consciously notice it — but its absence would feel wrong.

## References

| Reference | What to borrow | What to avoid |
|-----------|---------------|---------------|
| Nothing Phone 4a Pro (visual only) | Dot matrix texture, monochrome discipline, selective color, grid precision | Any OS-specific patterns or Nothing-specific UI language — borrow the aesthetic, not the platform |
| Superdot Studio | Information hierarchy through arrangement not ornamentation, sophistication through restraint | Over-systematising — keep it human |
| Kim Albrecht | Editorial whitespace, neutral ground + vivid project imagery, scholarly clarity | Purely archival feel — this needs to be fast and active |
| Mohr / Chuanqisun dot grid | Mathematical beauty, grid-as-texture, incompleteness as valid state | Abstraction that obscures function |
| andrewdesigns.info | Scientific color encoding, data-first, analytical clarity | Research-only tone — this has to work at a conference in 2 seconds |

## Anti-References

| Anti-reference | What makes it wrong |
|----------------|---------------------|
| Notion | Blocky, text-heavy, too much structural overhead for fast capture |
| Evernote | Cluttered, chrome-heavy, color used decorationally |
| Google Keep | Casual and playful — wrong register entirely |

## Craft Standards
- **Shadows:** None on dark. One-layer ambient at 4% on light. Elevation through tone steps, not depth.
- **Borders:** Hairline (0.5–1px) at 10–15% opacity, or none. Space separates things, not lines.
- **Radius:** 4px for inputs and small elements, 8px for cards. Rectilinear — not bubbly.
- **Color:** Monochrome base. One vivid accent — contrast-tested on both dark and light grounds. Appears for status, action, and data encoding only.
- **Typography:** Clean geometric sans for UI. Monospace for timestamps, metadata, and transcript. Precise tracking.
- **Dot grid:** None — backgrounds are clean and flat. When horizontal dividers are needed, use Japanese dotted lines (1px dots, 6px gap) at low opacity. Never solid rules.
- **Animation:** 150–200ms, linear or minimal ease. No spring physics. No bounce. The tool doesn't perform.
- **Whitespace:** Generous. The timeline breathes. Entries don't crowd each other.
- **Dark elevation system:** Three steps — background / surface / elevated — ~8% lightness difference each. No shadows.

## Personality
A research scientist with impeccable taste. Precise without being cold. Never tries. Confident enough to leave things out. Speaks in complete sentences, never exclamation marks. Dresses in three colours, all intentional.
