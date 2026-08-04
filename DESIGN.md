---
name: Merijn Kersten — Portfolio
description: Dark, editorial, typography-led portfolio for creative-technology work, navigated through a single ghost-to-alive 3D maquette.
colors:
  paper: "#0a0d10"
  paper-2: "#11151b"
  surface-2: "#161c23"
  ink: "#eaeaea"
  ink-60: "rgba(234, 234, 234, 0.62)"
  ink-40: "rgba(234, 234, 234, 0.52)"
  ink-20: "rgba(234, 234, 234, 0.16)"
  hairline: "rgba(234, 234, 234, 0.08)"
  line: "rgba(234, 234, 234, 0.16)"
  line-strong: "rgba(234, 234, 234, 0.38)"
  cyan: "#27e8f2"
  accent-2: "#15b6c0"
  accent-contrast: "#06181b"
  coral: "#ff9068"
  lime: "#a9f75c"
  lavender: "#a89eff"
  pink: "#ff74b0"
  model-mid: "#2a3340"
  model-deep: "#1a212a"
typography:
  display:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.4rem, 1.85rem + 2.7vw, 4.8rem)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(1rem, 0.95rem + 0.24vw, 1.13rem)"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "-0.006em"
  label:
    fontFamily: "Space Mono, ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "clamp(0.78rem, 0.74rem + 0.18vw, 0.88rem)"
    fontWeight: 500
    letterSpacing: "0.08em"
rounded:
  sm: "2px"
  md: "4px"
spacing:
  2xs: "0.5rem"
  xs: "0.75rem"
  s: "1rem"
  m: "1.5rem"
  l: "2.75rem"
  xl: "4.5rem"
  2xl: "7.5rem"
components:
  button-primary:
    backgroundColor: "{colors.cyan}"
    textColor: "{colors.accent-contrast}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.85em 1.2em"
  button-primary-hover:
    backgroundColor: "{colors.cyan}"
    textColor: "{colors.accent-contrast}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.85em 1.2em"
  button-ghost-hover:
    backgroundColor: "transparent"
    textColor: "{colors.cyan}"
---

# Design System: Merijn Kersten — Portfolio

## Overview

**Creative North Star: "The Ghost Circuit"**

Every interactive object on this site starts inert — a faint monochrome wireframe on a near-black stage. Visiting it floods in its authored colour and materials, permanently, for the session: exploring the site is literally powering a circuit on, one node at a time. That mechanic is the whole aesthetic, not a decoration bolted onto it — dark, precise surfaces read as unpowered board, and the locked five-hue palette reads as current running through specific traces once you touch them.

The voice is **playful & kinetic**: the blinking aperture logo, the hover glow that chases the cursor across the timeline, the ghost→alive reveal, and the scroll-driven camera moves all treat the interface as something alive and a little mischievous, not a static gallery. Density stays editorial and confident — big display type, generous whitespace, quiet mono metadata — so the kinetic touches read as personality on top of a controlled system, never as noise. The system has explicitly moved away from a softer, rounder, "acrylic" look (a prior 14px corner radius) toward crisp, tactile, small-radius geometry; treat that softness as a confirmed anti-reference, not a fallback to drift back toward.

**Key Characteristics:**
- Near-black matte stage (`--paper`) with a fixed, five-hue accent system — every hue has exactly one job, everywhere.
- Ghost→alive interaction model: objects are monochrome until visited, then carry their real colour permanently.
- Editorial type scale (large display, quiet mono metadata) over a dark, spatial-computing surface.
- Crisp, small-radius, tactile component geometry — never soft or "acrylic."
- A fine, fixed film-grain veil over the entire page for a screenprint/instrument texture.

## Colors

The palette is deliberately small and locked: one hue per job, so the whole system reads as one instrument rather than a decorative color scheme.

### Primary
- **Circuit Cyan** (`#27e8f2`): the interactive/primary colour — links, focus rings, the "Live" state, the hero's default accent, and the City layer (GIS/location-scale work). `--accent` aliases this everywhere in code; treat cyan as the default whenever no layer context overrides it.

### Secondary
- **Signal Coral** (`#ff9068`): the Room layer only (apps/games/web-scale work). Never used as a general UI accent outside that layer's context (cards, hotspots, focus dialogs tagged `data-layer="room"`).

### Tertiary
- **Charge Lime** (`#a9f75c`): the Chip layer only (tools/data/CV-scale work). Same locked, layer-only role as Signal Coral, for `data-layer="chip"` contexts.

### Tag Accents (locked, single-purpose — not general UI colours)
- **Freelance Lavender** (`#a89eff`): flags independent/freelance work in the timeline (`worktile__tag[data-kind="freelance"]`). No other role.
- **Passion Pink** (`#ff74b0`): flags passion-project work in the timeline, and is Signal Coral's gradient partner in `--grad-orange-pink`. No other role.

### Neutral
- **Deep Circuit Black** (`#0a0d10`, `--paper`): the page and 3D-ground base — the "unpowered" resting surface.
- **Raised Acrylic Base** (`#11151b`, `--paper-2`): raised/floating surfaces (dialogs, tooltips).
- **Nested Surface** (`#161c23`, `--surface-2`): hover/nested state on interactive chrome (e.g. social icon hover).
- **Near-White Ink** (`#eaeaea`, `--ink`): primary text.
- Ink also ships at two fixed opacities with accessibility floors already tuned in: **Ink 60** (`rgba(234,234,234,.62)`) for secondary text, and **Ink 40** (`rgba(234,234,234,.52)`) for quiet metadata that still carries real content (sector lines, counts, facet labels) — 0.52 is the measured floor for 4.5:1 contrast on both `--paper` and `--paper-2`. **Ink 20** (`rgba(234,234,234,.16)`) is decorative-only and makes no contrast promise.
- **Hairline** (`rgba(234,234,234,.08)`) for faint section dividers; **Line** (`rgba(234,234,234,.16)`) for visible hairlines; **Line Strong** (`rgba(234,234,234,.38)`) for anything that must read as a pressable control's edge (WCAG 1.4.11's 3:1 boundary requirement).

### Named Rules
**The One Job Rule.** Every hue in the palette has exactly one fixed role, used identically everywhere it appears (cyan = interactive + City; coral = Room only; lime = Chip only; lavender/pink = single tag roles). Never introduce a new accent hue or repurpose an existing one for a different job — extend the system by choosing which of the five fits, not by adding a sixth.

**The Quiet Metadata Rule.** Any ink tint carrying real content (not purely decorative) must clear 4.5:1 contrast on its surface. `--ink-40` is already tuned to that floor; don't drop metadata opacity below it to "quiet it down" further — use `--ink-20` only for elements with no informational content.

**The Completion Chord Rule.** `--grad-spectrum` (all five locked hues in sequence) exists for exactly one moment: the hero's model tally reaching 10/10, where "every layer is alive" becomes literally true (`.hero__signals[data-complete] .hero__signals-pips i[data-on]`, `hero.css`). It is the sole exception to the One Job Rule, and it stays one — using it anywhere else (especially as gradient text) turns an earned milestone into decoration and voids the rule it's the exception to.

## Typography

**Display Font:** Space Grotesk (with ui-sans-serif, system-ui fallback)
**Body Font:** Space Grotesk (same family as display — one typeface, weight and scale do the differentiating work)
**Label/Mono Font:** Space Mono (with ui-monospace, SF Mono, Menlo, Consolas fallback)

**Character:** One geometric sans (Space Grotesk) carries every editorial voice from hero display down to body copy, so the system leans on weight and the fluid clamp scale for hierarchy rather than font-pairing contrast; Space Mono is reserved entirely for metadata, labels, and UI chrome, giving it an unmistakable "instrument readout" register whenever it appears.

### Hierarchy
- **Display** (700, `clamp(2.4rem, 1.85rem + 2.7vw, 4.8rem)` / step-4, line-height 0.95–1.02, letter-spacing −0.03em to −0.015em): section titles and hero name; `text-wrap: balance`.
- **Headline** (700, `clamp(1.9rem, 1.55rem + 1.7vw, 3.4rem)` / step-3): sub-section and card-lifted titles (e.g. the focus dialog title).
- **Title** (700, `clamp(1.5rem, 1.3rem + .95vw, 2.25rem)` / step-2): dialog outcomes, prominent inline emphasis.
- **Body** (400, `clamp(1rem, .95rem + .24vw, 1.13rem)` / step-0, line-height 1.6, max 58–65ch measure): case-story prose and running copy; case-study text carries paragraph breaks via literal blank lines in the JSON source (`white-space: pre-line`).
- **Label** (500, `clamp(.78rem, .74rem + .18vw, .88rem)` / step−1, letter-spacing 0.04–0.14em, uppercase): nav links, buttons, tags, timeline metadata, story kickers — always Space Mono, always uppercase, always letter-spaced.

### Named Rules
**The Mono Meta Rule.** Anything that is metadata rather than content — labels, tags, timestamps, nav, button text, story-beat kickers — is Space Mono, uppercase, letter-spaced. Anything that is content — headings, body copy, dialog titles — is Space Grotesk. The two never swap roles.

## Layout

Content sits in a `--container` of 87.5rem (`max-width`), centred, with `--space-m` inline gutters — deliberately slim so the fixed hero title stays clear of the 3D maquette and every section can breathe at full width on large screens. Section rhythm runs on a small spacing scale (`--space-2xs` 0.5rem through `--space-2xl` 7.5rem); vertical section padding is `--space-xl + --space-s`, tuned down from a taller `--space-2xl` that read as too cavernous between sections. Adjacent sections get a 1px hairline seam (`.section + .section`), except About and Contact, which read as one continuous open editorial spread with no seam boxing them off.

The projects timeline is the one major departure from static document flow: a pinned, scroll-driven horizontal "wall" (`position: sticky` region with `perspective`) that pans through career history as the user scrolls vertically, falling back to a plain horizontally-scrollable strip under `prefers-reduced-motion` or on narrow/static contexts (`[data-static]`). Below ~760–899px, multi-column layouts (About's grid, the annotated portrait stage) collapse to a single stacked column with the portrait promoted above the bio via explicit order.

## Elevation & Depth

This is a hybrid, but depth is driven by the 3D scene's own logic rather than a flat 2D card/page split: elevation (shadow weight + backdrop blur) tracks how close an element is meant to feel to the viewer, mirroring the maquette's own near/far layering, not simply "is this a floating panel." Page sections at rest are flat and matte — no ambient shadow, just hairline dividers — because they're the resting, unpowered plane. Anything that is meant to feel like it has come forward off that plane (the focus dialog popped over a blurred backdrop, a timeline tooltip lifted off its route, the mobile sticky company bar, the mobile nav drawer) earns shadow and blur in rough proportion to how far forward it is meant to read, echoing the same proximity-equals-presence logic that drives the 3D layers.

### Shadow Vocabulary
- **Dialog lift** (`box-shadow: 0 44px 96px rgba(0,0,0,.62)` + `backdrop-filter: blur(22px) saturate(1.3)`): the focus card — the deepest, most "forward" surface in the system.
- **Card hover lift** (`box-shadow: 0 30px 60px -26px rgba(0,0,0,.9), 0 0 0 1px <accent 40%>` at rest `0 18px 40px -24px rgba(0,0,0,.8)`): timeline waypoint tiles — shadow deepens and an accent ring appears on hover/focus, echoing an object "coming alive."
- **Tooltip / callout lift** (`box-shadow: 0 18px 40px rgba(0,0,0,.5)` + `backdrop-filter: blur(8px)`): timeline tooltips, mid-depth.
- **Chrome lift** (`box-shadow: 0 20px 40px var(--shadow)` or `0 -14px 32px rgba(0,0,0,.5)`): mobile nav drawer, mobile sticky bar — UI chrome overlaying content, not content itself.

### Named Rules
**The Proximity Rule.** Shadow and blur weight tracks how far an element is meant to feel lifted toward the viewer, not whether it happens to overlay something. Resting page content stays flat. The deepest shadow in the system belongs to the single most "forward" surface (the focus dialog); everything else is calibrated relative to that ceiling.

## Shapes

Corners are deliberately small and crisp — `--radius` (4px) for cards, dialogs, and portraits; `--radius-s` (2px) for buttons, chips, and small controls — a confirmed departure from an earlier, softer 14px "acrylic" radius. Borders are hairline (1px, occasionally 1.5–2px on scanner brackets and layer-tinted card edges) rather than heavy strokes. The system's signature recurring silhouette is the **scanner-corner bracket**: four detached L-shaped corner marks (`.scanframe`, `.wall__frame`, `.worktile__reticle`) that frame a region like a survey/registration mark, tightening or brightening on hover to signal "this is now locked on."

## Components

### Buttons
- **Shape:** small radius (2px), 1px border (transparent on primary, `--line` on ghost).
- **Primary:** `--btn-bg: var(--accent)` (cyan) fill, `--accent-contrast` text, Space Mono uppercase label, `0.85em 1.2em` padding; lifts 1px on hover (`translateY(-1px)`).
- **Ghost:** transparent fill, `--ink` text, `--line` border; hover shifts border and text to the accent colour, no added shadow.

### Chips (project tech tags)
- **Style:** "engraved/OLED-plate" chips — small radius (2px), solid near-black ground (`color-mix(#05070a, transparent)`), a hairline border tinted toward the active card's layer accent, an inset 1px shadow for a stamped/engraved feel, Space Mono label.
- **State:** tag-kind variants (`data-kind="freelance"` / `"passion"`) swap to Freelance Lavender / Passion Pink for both text and border — the only places those two hues appear.

### Cards / Containers
- **Corner Style:** 4px radius (`--radius`).
- **Background:** a soft diagonal glass gradient over `--paper-2`, plus the shared square-dot texture field on raised surfaces (dialogs) for continuity with the timeline's dot ground.
- **Shadow Strategy:** see Elevation & Depth — weight scales with how "forward" the card is (resting waypoint tile vs. popped-open focus dialog).
- **Border:** 1px, colour-mixed toward the active layer's accent so each card visibly carries its layer identity.
- **Internal Padding:** `--space-l` for dialogs, `--space-s` for waypoint-tile bodies.

### Navigation
- Space Mono uppercase links at `--ink-60`, brightening to `--ink` on hover, no underline. Social icon links get a `--surface-2` hover fill. Below 720px, nav becomes a full-width slide-down drawer (`translateY`) with hairline row dividers, sharing the chrome-lift shadow vocabulary.

### Signature Component: the Life System
Every hotspot-bound 3D object and its paired UI ships a "ghost" (desaturated wireframe) and an "alive" (fully authored colour/material) state, lerped by a shared visited/hovered store. This is the literal expression of The Ghost Circuit north star — UI chrome (tags, tooltips, card accents) inherits the same logic by only fully committing to its layer colour once that layer/case has been visited.

## Do's and Don'ts

### Do:
- **Do** keep every accent hue locked to its one job (cyan = interactive/City, coral = Room, lime = Chip, lavender = Freelance tag, pink = Passion tag) — see The One Job Rule.
- **Do** route all metadata, labels, tags, and button text through Space Mono, uppercase, letter-spaced — see The Mono Meta Rule.
- **Do** scale shadow/blur weight to how "forward" an element is meant to feel, with the focus dialog as the ceiling — see The Proximity Rule.
- **Do** keep quiet-but-informational text at or above `--ink-40`'s measured 4.5:1 contrast floor.
- **Do** honour `prefers-reduced-motion` for every animation, camera move, and scroll-driven effect already in the system.

### Don't:
- **Don't** soften corners back toward the discarded 14px "acrylic" radius — 2–4px crisp corners are a confirmed, deliberate rejection of that look.
- **Don't** add ambient shadow to resting, flat page sections; shadow is earned by forward/floating elements only.
- **Don't** introduce a sixth accent hue or repurpose coral/lime/lavender/pink outside their single locked role.
- **Don't** let any case study depend on the 3D scene to be understood — every case must remain fully readable as plain text/media (a product-level accessibility floor, not just a visual preference).
