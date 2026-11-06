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
    fontFamily: "Oxanium Variable, Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "calc(clamp(2.986rem, 1.875rem + 4.937vw, 6.319rem) * 0.94)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(1rem, 0.958rem + 0.185vw, 1.125rem)"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "-0.006em"
  label:
    fontFamily: "Space Mono, ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "clamp(0.8rem, 0.777rem + 0.111vw, 0.875rem)"
    fontWeight: 500
    letterSpacing: "0.08em"
  micro:
    fontFamily: "Space Mono, ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    letterSpacing: "0.12em"
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
    backgroundColor: "color-mix(in srgb, {colors.cyan} 12%, transparent)"
    textColor: "color-mix(in srgb, {colors.cyan} 72%, white)"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.9em 1.25em"
  button-primary-hover:
    backgroundColor: "{colors.cyan}"
    textColor: "{colors.accent-contrast}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.9em 1.25em"
  button-ghost-hover:
    backgroundColor: "{colors.cyan}"
    textColor: "{colors.accent-contrast}"
---

# Design System: Merijn Kersten — Portfolio

## Overview

**Creative North Star: "The Ghost Circuit"**

Every interactive object on this site starts inert — a faint monochrome wireframe on a near-black stage. Visiting it floods in its authored colour and materials, permanently, for the session: exploring the site is literally powering a circuit on, one node at a time. That mechanic is the whole aesthetic, not a decoration bolted onto it — dark, precise surfaces read as unpowered board, and the locked five-hue palette reads as current running through specific traces once you touch them.

**The museum it stands in.** The site is an exhibition, *Work in miniature*, and that lives in the objects rather than in signs: the model, the guide you pull out from the bottom edge, a label and a book for each project, the depot for the work that isn't on display, and the flight simulator at the end of the visit. The ghost circuit is how such a gallery lights its objects: kept in low light until someone walks up, then lit for good. So the count says how many you've *seen*, and what they add up to, the next launch, is said quietly under it from the first glance (see "The path to launch"), so the ride at the end is something a visitor sees coming.

**The voice.** Plain words, the way a person would say them, and as few as will do. A label that isn't needed isn't there: no "please touch", no gallery numbers or scales, no inventory numbers, no lists of counts ("three floors, ten exhibits"), no slogans. The exhibition's name, small over yours at the entrance, is the one sign the museum puts up, the way it's lettered over a gallery's door; the timeline is "Chronology", with your own line under it. Where the museum shows in the words it's in a word or two that are also the plainest ones ("On display", "In the depot"), never a sign voice. The nav, the buttons and the guide's links say plainly where they go.

The voice is **playful & kinetic**: the blinking aperture logo, the timeline's map weaving itself together from points as you travel it, the ghost→alive reveal, and the scroll-driven camera moves all treat the interface as something alive and a little mischievous, not a static gallery. Density stays editorial and confident — big display type, generous whitespace, quiet mono metadata — so the kinetic touches read as personality on top of a controlled system, never as noise. The system has explicitly moved away from a softer, rounder, "acrylic" look (a prior 14px corner radius) toward crisp, tactile, small-radius geometry; treat that softness as a confirmed anti-reference, not a fallback to drift back toward.

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

**Display Font:** Oxanium (variable, 200–800; Space Grotesk as fallback). A squared, modular grotesk whose straight-sided bowls and cut corners echo the maquette's grid and the square-dot language.
**Body Font:** Space Grotesk
**Label/Mono Font:** Space Mono (with ui-monospace, SF Mono, Menlo, Consolas fallback)

**Character:** Three voices. The **display** voice (the section titles, the hero name, the big numerals) is one set of tokens in `tokens.css` (`--font-display`, `--display-weight`, `--display-stretch`, `--display-axes`, `--display-tracking`, `--display-leading`, `--display-scale`), so a new headline face is a change in one place: a face that runs wider or narrower than Space Grotesk sets `--display-scale` to keep line lengths (Oxanium runs about 6% wider, so it's set at 0.94). Small headings (card and column titles) take `--font-heading`, which follows the display face unless that face only works large. Body copy stays Space Grotesk; Space Mono is reserved entirely for metadata, labels and UI chrome, giving it an unmistakable "instrument readout" register whenever it appears.

### The scale
Every size on the site is one of nine steps: a fluid modular scale from a 16px base on a 360px screen (ratio 1.2) to 18px on a 1440px screen (ratio 1.333, a fourth), so the display end opens up where there's room. The two smallest are fixed, because they're mono labels.

| Step | Size | Used for |
|---|---|---|
| −2 | 11px | micro labels: tags, route labels, readout meta |
| −1 | 12.8 → 14px | labels, nav, buttons, captions |
| 0 | 16 → 18px | body |
| 1 | 19 → 24px | leads, card titles |
| 2 | 23 → 32px | panel titles, the hero line, the About opening |
| 3 | 28 → 43px | the contact email, the timeline card years |
| 4 | 33 → 57px | the intro card |
| 5 | 40 → 76px | section titles on a phone |
| 6 | 48 → 101px | section titles, the hero name |

### Hierarchy
- **Display** (step 6, `--display-*` tokens, line-height 0.92): section titles and the hero name; `text-wrap: balance`. Also the big numerals: the timeline card years (step 3) and the year at the timeline's focus.
- **Title** (step 2): panel and dialog titles, the About opening paragraph (at full ink, so the bio opens on a line).
- **Lead** (step 1, ink at 74%): a section's lead, the title's standfirst, directly under it on the same left edge.
- **Body** (400, step 0, line-height 1.6, max 58–65ch measure): case-story prose and running copy; case-study text carries paragraph breaks via literal blank lines in the JSON source (`white-space: pre-line`).
- **Label** (500, step −1 or −2, letter-spacing 0.04–0.16em, uppercase): nav links, buttons, tags, timeline metadata, story kickers, section kickers — always Space Mono, always uppercase, always letter-spaced.

### Named Rules
**The Mono Meta Rule.** Anything that is metadata rather than content — labels, tags, timestamps, nav, button text, story-beat kickers — is Space Mono, uppercase, letter-spaced. Anything that is content — headings, body copy, dialog titles — is the display or text face. The two never swap roles.

**The One Scale Rule.** No size outside the nine steps. A new element picks the step whose job it shares; if none fits, the element is the thing to reconsider, not the scale. (Icon glyphs inside fixed-size buttons are drawings, not text, and are exempt; so are the printed CV sheet and the asteroids game, which are a page and a screen of their own.)

## Layout

Content sits in a `--container` of 87.5rem (`max-width`), centred, with `--space-m` inline gutters — deliberately slim so the fixed hero title stays clear of the 3D maquette and every section can breathe at full width on large screens. Section rhythm runs on a small spacing scale (`--space-2xs` 0.5rem through `--space-2xl` 7.5rem); vertical section padding is `--space-xl + --space-s`, tuned down from a taller `--space-2xl` that read as too cavernous between sections. Adjacent sections get a 1px hairline seam (`.section + .section`), except About and Contact, which read as one continuous open editorial spread with no seam boxing them off.

Every section opens the same way (`SectionHead.tsx`): a mono **kicker** with the section's name (the header nav's words, deliberately without a number), a measuring rule with a tick every step running out to a short **note** at its end (the three scales the work happens at, the career's date range, Utrecht's position), then the **title** across the full width at step 6, then the **lead** small and directly under it, on the title's left edge, read as one block with it, like a wall text under an exhibit's name. One big thing and one quiet one, off-axis, instead of a left-aligned stack at two similar sizes. Contact, the finale, sets the same parts on the centre line without the rule. Below the openings the sections keep that asymmetry: the capability columns step down the band one after another (city over room over chip, as the maquette stacks them) each led by its title alone; the timeline cards lead with the year; About opens its bio with a step-2 line at full ink, then a ruled row of numbers counted from the content (counting up as it arrives), each with its word beside it at heading size ("10 years", "18 projects", "9 companies") and the small print under it, then the paragraphs as four short chapters each led by its own first sentence as a headline (no rules over them; the headlines carry the structure, and read alone they tell the story), with the annotated portrait held in view beside them. `*words*` in that copy are highlights: a highlighter band sweeps in behind them as their block arrives.

The projects timeline is the one major departure from static document flow: a pinned, scroll-driven horizontal "wall" (a `position: sticky` region) that pans through career history as the user scrolls vertically, one to one, like a map sliding past a fixed frame; it falls back to a plain horizontally-scrollable strip under `prefers-reduced-motion` or on narrow/static contexts (`[data-static]`). Like every other section it is flat: the cards rest square-on, nothing tilts, drifts or glows. It's drawn on a canyon map (`lib/contours.ts`: a seamless contour tile with a valley pressed along the route), and the site's idea of connecting the dots is drawn into it literally: the map is woven together from its points as you travel it. Far ahead it's a sparse scatter of the site's square dots along the contours (one every 40px); as you come up to it a second trail fills in between them and then a third (one every 10px), each falling between the last's dots so the map only ever gains points; behind the focus the dots are joined into clear lines. "Now" is a focus with no marker on it, which sweeps across the screen as you scroll, from the left edge when the wall pins to the right edge as the route runs out, so the journey starts with nothing reached and ends with all of it. Behind the focus the route is lit in its employers' colours; ahead of it the route is dim. Each waypoint's square station fills in as it's reached and its card powers on from grey (the maquette's ghost → alive, at timeline scale), and the year at the focus rolls like an odometer. Reduced motion gets the finished route: everything lit and woven. Below ~760–899px, multi-column layouts (About's grid, the annotated portrait stage) collapse to a single stacked column with the portrait promoted above the bio via explicit order.

## Motion

One system for every transition and animation (`tokens.css`, mirrored for code in `src/lib/motion.ts`): three durations (`--t-fast` 0.2s for feedback, `--t-base` 0.35s for a change of state, `--t-slow` 0.6s for an arrival), one beat between siblings (`--stagger`, 80ms), and one curve for everything that responds or arrives (`--ease`, a quick start and a long settle), with `--ease-in-out` for what has to feel even at both ends. Ambient loops (the crosshair ping, the logo's blink, the portrait's scan) keep their own periods; they're rhythms, not responses.

- **Arrivals.** Content arrives when it reaches one shared point in the scroll (`REVEAL`: a quarter of it on screen, clear of the bottom edge), through `useReveal`: a section's rule draws across, its title decodes, its lead rises a few beats later; the capability columns and the About pins follow in stagger order.
- **Hover and focus.** One grammar, and keyboard focus gets the same answer as the pointer: a link in running text firms up its underline; a mono UI link (nav, footer) brightens and draws a hairline in under it; a button lifts `--lift`; a ghost button takes the accent on its edge; a card lifts and its edge takes the layer's colour; the contact email, the page's one call to action, sweeps a solid rule in.
- **The About specimen.** The annotated portrait rises gently into place as the bio arrives (eased, never more than about 160px), settling as the bio's top reaches the header; from there its column is sticky and it stays beside the text while you read. Reduced motion holds it still.
- **Opening a project.** In the maquette the label waits for the camera to arrive, then its line draws out from the object (`0.45s`) and the label unrolls from the line's end (`0.5s`), and the title decodes. Opening the book is one FLIP move (`--t-slow`): the label's head travels to the left page and its film grows into the plate, the right page swings open from the spine, and everything that wasn't on the label fades in after it. On a page the plate grows out of the card's picture instead. Walking to the next book turns a page on a laptop (the leaf lifts off the spine in 0.32s, the next spread's page lands in 0.42s) and slides it in from that side on a phone, where there's no spine (`--t-base`). Walking from one exhibit's label to the next while zoomed in is one move, not a close and an open: the label steps aside the way you're going (0.2s) as the camera glides straight to the next object, on a timed curve that leaves and arrives at rest, easing back a little mid-flight (further for a longer hop, so a jump between layers arcs over the model) with the porthole held where it is; the ring stays locked and turns a few ticks back into place (it doesn't fly off to re-acquire), and the next label comes in from the other side as the camera settles, without the open and close sounds. Reduced motion fades instead of moving.
- **The opening shot.** The camera dollies in from a wide establishing shot to the city (4.65s, eased from a standstill to a standstill), and nothing else moves the frame while it does: the model doesn't scale up under it and the pointer parallax holds level until it lands. It leaves only once the shot is ready (every model arrived, every shader compiled, while the camera holds still), and it runs on frame time, so a dropped frame pauses it rather than jumping it ahead. A returning visitor (the intro card has played once in this browser) skips the card and gets a shorter dolly (2.8s).
- **Pointing at an exhibit.** A marker's name is part of its target, along with the crosshair and a generous halo round it. Hovering washes the layer's colour across the name once, smoothly, warmed toward the ink so it doesn't shout over the model.
- **The camera.** Every move between framings (scrolling from layer to layer, pushing in to an exhibit, pulling back out) rides one critically damped spring (`CAMERA.glide`, 0.37s): it gathers speed from rest and settles without overshooting, about 95% of the way in 0.9s, and a change of mind mid-move (scrolling on) bends the path instead of snapping its speed. The lens and the porthole's slide ride the same spring, so the framing holds together on the way, and the reticle's travel onto the porthole is fitted to it, so the ring stays on the object all the way in. Closing an exhibit, the markers (crosshairs, leader lines and rings) and the hero's title and guide come back once the camera has mostly pulled out (0.4s), over the model rather than over the close-up.
- **The first-visit cue.** Until a first project is opened, the boot's last beat is an invitation: one crosshair per layer (the tower, the phone on the couch, the die) locks its brackets, puts its name on a chip, and pings on a quicker beat, while the layer's other markers hold their pulse so it's the one thing moving: no words needed. It retires for good on the first open.
- **The marker names.** A floor's names stand in one row over their crosshairs. Where two would run into each other, or one into the hero title's lines or the simulator's sign, the one further right moves up a row (or two) to wherever it clears; `useNameRows` (`maquette/hotspots.tsx`) works that out from the screen a few times a second, and only lets a raised name back down once there's clear room, so the camera's idle sway can't make it flicker. Phones show no names.
- **The layout of the maquette.** Each step of the scroll is one floor's: the floors stand far enough apart (`LAYER_Y`) that the ones above and below show only as a thin edge of the frame, and they recede properly — every material on them dims, including the ones that animate themselves, which are faded at draw time (`presence.tsx`). Each step is framed for its own floor (`CAMERA.stepAimX` / `stepZoom` / `stepRise`): only the City shifts right to clear the title, and it sits a little lower, its top in line with the title's; the Room and the Chip centre, and the Chip comes closer, so its board takes the share of the screen the others do; the scale ladder still shows on the way down. On a floor every marker floats at one height (`MARKER_Y`), straight above the thing it marks, with its name centred over the crosshair, so a floor's names read as one row (where two would meet, one steps up a row: see "The marker names" above). The exhibits are placed so that, seen from the overview, each stands in its own column across the screen: the chip's heart, die and camera; the room's desk, table, couch and shelf on a diagonal from front-left to back-right. Anything that isn't an exhibit's name keeps off that row: the flight simulator's invitation and the windmill's constellation hang in a row of their own above it, and the cables between floors carry their names in the gaps between floors, never on one (and only in the close-up of one of their exhibits: on the overview, a name on every hovered cable was one more thing to read). A cable rests grey and lights in its thread's colour only while one of its exhibits is open or the pointer rests on one (passing over doesn't), and it sends its packets along once: after the first visit to one of its ends, once the camera is back out with the whole cable in view. Not on loading the page for exhibits seen before, not later on while scrolling, and after a walk through several exhibits only the last one's: they used to go off far more often than anyone had asked for. The invitation hangs off its line to the beacon like a flag, out to the right, away from the names (which keep clear of it too). On a phone the names are gone, so it comes down to just over the tower; on a phone or any screen held upright it wraps to a narrow block; and it's always kept inside the screen.

### Named Rules
**The Token Timing Rule.** No literal durations: a transition takes `--t-fast`, `--t-base` or `--t-slow`, and a sequence counts in `--stagger` beats. Choreography that rides the camera (the reticle's acquire, the boot fade, the label's line and unroll) is the only exception, and says so where it's written.

## Elevation & Depth

This is a hybrid, but depth is driven by the 3D scene's own logic rather than a flat 2D card/page split: elevation (shadow weight + backdrop blur) tracks how close an element is meant to feel to the viewer, mirroring the maquette's own near/far layering, not simply "is this a floating panel." Page sections at rest are flat and matte — no ambient shadow, just hairline dividers — because they're the resting, unpowered plane. Anything that is meant to feel like it has come forward off that plane (the focus dialog popped over a blurred backdrop, a timeline tooltip lifted off its route, the mobile sticky company bar, the mobile nav drawer) earns shadow and blur in rough proportion to how far forward it is meant to read, echoing the same proximity-equals-presence logic that drives the 3D layers.

### Shadow Vocabulary
- **Dialog lift** (the page behind washed with `--paper`; the label is 93% `--paper` under `backdrop-filter: blur(8px)`): the exhibit's label and book, the most "forward" surfaces in the system. The book alone carries one deep shadow, as a spread lifted off the page; the depth otherwise comes from the page receding, so the label stays as flat and ruled as the page it opened from.
- **Card hover lift** (`transform: translateY(var(--lift))` + `box-shadow: 0 12px 24px -16px rgba(0,0,0,.85)` under the pointer; nothing at rest): the timeline's waypoint cards and the /projects index cards rest flat on their page, like any resting content, and earn a shadow only while lifted, as their edge takes the layer's colour. No corner brackets on cards.
- **Tooltip / callout lift** (`box-shadow: 0 18px 40px rgba(0,0,0,.5)` + `backdrop-filter: blur(8px)`): timeline tooltips, mid-depth.
- **Chrome lift** (`box-shadow: 0 20px 40px var(--shadow)` or `0 -14px 32px rgba(0,0,0,.5)`): mobile nav drawer, mobile sticky bar — UI chrome overlaying content, not content itself.

### Named Rules
**The Proximity Rule.** Shadow and blur weight tracks how far an element is meant to feel lifted toward the viewer, not whether it happens to overlay something. Resting page content stays flat. The deepest step in the system belongs to the single most "forward" surface (the exhibit's book, a spread lifted off the dimmed page); everything else is calibrated relative to that ceiling.

## Shapes

Corners are deliberately small and crisp — `--radius` (4px) for cards, dialogs, and portraits; `--radius-s` (2px) for buttons, chips, and small controls — a confirmed departure from an earlier, softer 14px "acrylic" radius. Borders are hairline (1px, occasionally 1.5–2px on scanner brackets and layer-tinted card edges) rather than heavy strokes. The system's signature recurring silhouette is the **scanner-corner bracket**: four detached L-shaped corner marks (`.scanframe`, `.wall__frame`) that frame a region like a survey/registration mark, tightening or brightening on hover to signal "this is now locked on."

## Components

### Buttons
- **Shape:** small radius (2px), 1px border, Space Mono uppercase label, `0.9em 1.25em` padding.
- **Primary:** drawn in its colour (`--btn-bg`: the accent, or a card's layer colour) — a 70% outline over a 12% wash, the label in a lightened tint of it.
- **Ghost:** a `--line-strong` hairline, `--ink` label, no fill.
- **Hover / focus:** both fill the same way — a solid fill in `--btn-bg` sweeps in from the left (the contact email's drawn-in rule, at button size), the label turns `--accent-contrast`, the button lifts `--lift` over a soft shadow in its colour, and a trailing arrow nudges the way it points. Settles back on press. (The primary used to be a flat block of solid colour at rest, the heaviest thing on any panel it sat on.)

### Chips
- **Tech tags** (cards, the focus sheet): mono uppercase, `--step--2`, a hairline `--line` frame at 2px radius, `--ink-60` label. Tag-kind variants (`data-kind="freelance"` / `"passion"`) swap to Freelance Lavender / Passion Pink for both text and border — the only places those two hues appear.
- **Filter chips** (/projects): a mono label with its count, framed by scanner brackets drawn as background. At rest the corners are a whisper; under the pointer they tighten and take the accent; picked, the tag lights up between them. "All" leads the row as the cleared state.

### Cards / Containers
- **Corner Style:** 4px radius (`--radius`).
- **Background:** matte `--paper-2` — no glass gradient, no backdrop blur. The exhibit's label is the one exception: near-opaque `--paper` over a light blur, so it can stand over the model. Cards carry their mark: "Exhibit 02" in the layer colour, or "Collection".
- **Shadow Strategy:** see Elevation & Depth — weight scales with how "forward" the card is (resting waypoint tile vs. the opened exhibit).
- **Border:** 1px, colour-mixed toward the active layer's accent so each card visibly carries its layer identity.
- **Internal Padding:** about `--space-s`–`--space-m` inside the label and the book's pages (`--space-s` on a phone), `--space-s` for waypoint-tile bodies.

### The exhibit: label and book
The site is an exhibition of my work in miniature, so a project opens the way an exhibit is read (`Exhibit.tsx`). The ten projects with an object in the model are exhibits, numbered 01–10 in the order a visitor meets them (city, room, chip); the other projects are in the depot: still in the collection, on the timeline and /projects (their cards say "In the depot", an exhibit's "On display · Gallery 1"), with a label of their own but no number.

**The label** is the glance, and it belongs to the maquette. It waits for the camera: the object is reached first, then a line runs out from it (a square mark on the object, a hairline elbow to the label) and the label unrolls from where the line meets it, standing in the column beside the porthole, as wide as that column allows. The film comes first, at the top: a silent 6–10 s loop (`src/assets/loops/<slug>.mp4`) if there is one, otherwise the project's own film playing itself, silent and without controls, behind the button, on a 14-second loop from the moment its link starts at (under reduced motion, or on a data-saving connection, the poster drifts slowly instead); "Watch the film" plays the film right there, with sound and its controls. A film can start where its link says: paste YouTube's own "start at" link (`https://youtu.be/…?t=95`) as the project's `video` and the preview and the film open on that second. Under it, in groups with air between them: where it stands, said quietly in small grey type ("02 of 10 in the model", or "In the depot") with the ✕; the title and what it achieved; who it was for (or where it was made) and the year ("For Niantic, at Wonderment · 2022": the project's `credit`, or its client where it has none), then sector and my role in mono; one sentence of curator's note (the problem's first sentence, three lines at most); the audio tour; "Read the full story", the one solid thing on the label, in the layer's colour; and the walk to the neighbouring exhibits ("← 01 ARCam · 03 DTT Projects →"). It's a panel like the site's other panels: the hairline outline and the small radius, no coloured corners. On a laptop-height screen the film gives up a little height so "Read the full story" always shows without scrolling.

**The book** is the full story, set as a printed spread. The left page is the chapter opener: a running head ("Work in miniature · Exhibit 02", or "From the depot"), the quiet "02 of 10 in the model", the title, the standfirst, the audio tour, and the film, with a line under it on what you're looking at (`src/content/films.ts`), all centred on the page. The right page is the catalogue entry: the facts first, as a museum prints them (client, role, when, sector, made with), then the story set as a book sets it (justified and hyphenated, "The problem", "The approach" and "The lesson" as plain headings, indented paragraphs, an end mark), then "See also: Exhibit 05, Popcore games", "Ask me about it", and the walk. No page numbers, and no scroll bars: a page that runs long just scrolls. Opening it from the label is one move: the label's head travels to the top of the left page and its film grows into the plate (carrying on from where it was, if it was playing), and the right page swings open from the spine. Walking on from the book turns a page: ← → lift the right (or left) page off the spine and over, and the next project's page lands where it came down. YouTube loads only when the film is pressed. A gallery shows only for a project with real stills. In the maquette, Esc (or "Back to the label") folds the book back into the label and a second Esc closes it; `/work/<slug>?entry` opens straight onto the book.

**On a page** (the timeline, /projects, search) the card that was clicked is the label already, so a project opens straight onto the book: its plate grows out of the card's picture and the right page swings open. ← → walk from older to newer ("← 2023 Nieuwe Kerk Utrecht · 2024 Alliander digital twin →"), and Esc closes.

On a phone (and a tablet held upright) the label is a sheet from the bottom, stopping short of the object in the porthole, with a grip on top, and it's handled rather than clicked: it follows the finger sideways to the next exhibit, up into the book (the sheet grows under the finger and unfolds from wherever it's let go), down to put it away. The book is one column (the opener and the plate, then the entry; a playing film stays at the top while the story scrolls) and pulls down from its top to step back. Under reduced motion nothing travels: things fade.

### In the close-up
Detail follows attention. The overview stays as calm as a floor plan; what's added for an exhibit appears only while it's open, the way you lean in over a vitrine, and leaves when you close it.

- **The exhibit notices you** (`closeup.ts`). Each exhibit does one small thing with the cursor, and only in its close-up: the ARCam park has creatures to photograph (below); the city's power runs underground, from the tower in the middle (its power station) to Alliander's transformer house and from there under the streets to every block, and each time you point at the transformer house a pulse runs through it to the next dark block, which lights up (nearest first; without a cursor they come on by themselves); the cursor is the windmill's wind (the heavy cap swings round into it, and moving the mouse is a gust on the sails), and blowing hard enough powers the tower in the middle (below); in the Virtuele Brigade you run the scenario the two in VR are in, from the editor (below); Popcore's ping-pong balls go for the bin beside the couch (below); pointing at a Lightship car gives it a boost; the Zwijsen holograms drift toward you as they rise; the Amsterdam AI die plays Snake (below); the CCTV camera looks where you point while the hologram's cubes hold their places, four more appearing for the close-up, and whichever cube is inside its vision cone lights up in the accent (point at one and it locks on), and it asks for them in order (below); and you steer the catheter in the Philips heart (below). The camera itself keeps its slow pan: the cursor moves the exhibit, never the view. A resting cursor lets go after a moment, and so does moving onto the label. The open exhibit lies over the canvas, so the canvas never hears the mouse; `closeup.ts` reads the cursor from the window instead, through the exhibit's clear backdrop. None of it happens on a touch screen or under reduced motion, and nothing depends on it.
- **Every reaction has a beat.** A reaction that just starts and stops reads as a switch. Each one here has three parts, the way an animator times a move: a wind-up, the move itself, and a payoff. The power gathers first: the transformer house presses down and the tower's light runs down to its foot. A pulse sets off slowly and speeds up, a bright head with a tail, while the house charges. It holds in the house for a beat (the house swells, flares and throws sparks), then races off under the street, slowing into the corners and flashing at each junction. At the block it ends in a ring of light at the foot, and the floors light from the ground up, white first and then settling, with a small jolt. The rest follow the same pattern: the CCTV servo turns a touch the wrong way before a long turn and swings a little past, and locking on snaps brackets round the cube, pops it and flickers the cone. A Lightship car squats, then launches stretched with a trail in its stripe's colours, its nose bobbing as it settles. A Popcore ball squashes into the cushion, flies stretched along its arc and squashes as it lands, with a ring on the cushion as it goes and one round the rim as it drops in. The windmill's cap swings past the wind and settles back, and a gust kicks the sails up, flaps their cloth and blows streaks in past them before they coast down. On a touch screen, where they can't play call-outs, the VB players do a double-take at you now and then: a glance, back to the game, then the real look with the head tipped. The ARCam viewer steadies with a small dip, then the shot kicks it, a flash pops at the lenses and the viewfinder holds the picture. A cell the snake eats pops up, brightening as it lifts, and the pop ripples out to its neighbours. The Zwijsen holograms reach toward you on a springy drift, whirling faster the closer they come. The curves are in `lib/ease.ts`, and the springy spring that overshoots (`wobble`) is beside the camera's in `lib/spring.ts`.
- **The Philips heart** (`heart.tsx`, its shape in `heartShape.ts`). Philips's XR research was for minimally invasive care, where a catheter is threaded through the vessels to the heart instead of opening the chest, and XR puts the anatomy in front of the team. So the exhibit is a heart, projected as a hologram out of a chip on the board, in the chip layer's lime and the maquette's glass. A catheter comes up out of the chip, up the aorta and over its arch, and rests at the top. Two of the heart's arteries are narrowed, each marked by a warm glow, and the artery past a narrowing stays dim; each beat sends a pulse of light down the arteries that stops there. In the close-up the catheter's tip follows the cursor along the vessels: point at the aorta or an artery and it threads there, back through the root if it has to change artery. A narrowing stops it, and pointing on at it treats it: a balloon goes up (the wind-up), then the narrowing opens with a flash, the blood rushes down the artery, the heart gives a big beat, and a stent stays behind. Each opened artery makes the heart beat stronger; with both open it flares. Let the cursor rest, or on a touch screen, and it treats them by itself; reopening a healed heart brings the next patient. Dormant it's a pale ghost of a heart; waking it starts it beating.
- **Snake on the die** (`chip.tsx` DieSnake, the game in `snake.ts`). The Amsterdam AI exhibit is an AI accelerator, and in its close-up the accelerator plays Snake: a board of twelve cells a side over the die's sixteen tiles (three to a side of each tile, so the gaps between the tiles stay), lit the way the tiles are, which dim to a dark screen under it. With no cursor on the die, or one that has rested there a moment, the chip plays itself (looking far enough ahead not to box itself in), so a visitor sees it's a game before they touch it; point at the die and the snake goes to the cell you point at and waits there, its head under the cursor, until you move on, so you can lead it about and it stops when you do. On its way it turns off a wall or its own body rather than into it, so it only crashes when it has boxed itself in. It runs five cells a second, a little faster for each food, seven and a half at most. A food eaten pops its cell and ripples out; a crash flashes, comes apart from the tail, and shows the score in the cells ("07", two digits a tile column each), then a new board sweeps on corner to corner. The close-up comes in close and steep for it. On a touch screen and under reduced motion the die keeps its waves.
- **Run the scenario** (`scenario.tsx`, the two in VR in `room.tsx` VRPlayers). The Virtuele Brigade was made multiplayer so instructors could run a scenario together, in VR, on desktop or in the editor; in its close-up you're the one in the editor, at the desk, and the two headsets above it are the two in VR. The monitor becomes the editor: the scenario from above, the two of them on it, each with the view its headset has, turning as their heads turn, and the places something can go; down the left, what goes down next and who's in the session (two in VR, you in the editor). Rest the cursor on a place and the next thing goes there: something to check, a sound to follow or somewhere to go. It's in VR the moment it's on the map, with a line from one to the other as it lands. They only see what's in front of them, so one of them has to spot it first (a sound they both hear); that one turns to the other and tells it, and they deal with it as a pair: one goes to check while the other turns its back to it and covers, or both go, one leading and the other a step behind, watching their backs. Idle, each keeps watch on its own side and now and then looks over its shoulder, so what goes behind them is a gamble. Each one dealt with lights a pip along the foot of the monitor; one they don't spot before its ring closes slips away, and the row goes dark. A full row and the two turn to each other and nod, and it starts over, with less time each round. The things are kept neutral: nothing in it claims to be how the KMar trains. It's rest-to-place rather than a click, like every exhibit's game, because a click on the backdrop closes the exhibit. On a touch screen and under reduced motion the session plays as before, and the monitor shows the app.
- **The bin** (`room.tsx` Phone). Popcore made hyper-casual games, so its ping-pong balls get one: a bin stands beside the couch, and in the close-up a ball you hover over sinks into the cushion and shoots for it, up over the arm and down through the rim. From further away it's harder: a shot can catch the rim, and off the rim's inside it rattles in, off its outside it bounces away. A miss lies on the floor a moment, then hops back onto the seat (hover it to send it back at once). The bin is clear glass, so you see it fill; six in and it's full: it rocks, falls over toward you and spills them, lies there a moment and gets back up, and the balls hop back onto the seat for another round. The close-up looks from the couch's front-left so the bin is in the shot. On a touch screen and under reduced motion the balls lie on the seat.
- **Power for the tower** (`city.tsx` Windmill and MillLine). DTT's windmill turns slowly by itself, a working mill in a light breeze. Blow on it, moving the cursor over it and keeping it moving, and the sails spin up; past a working speed they make power, and it runs along a cable under the road to the tower in the middle, beads of light running along it faster the harder they turn. The tower's light-band rises with its charge and sinks back when the sails slow; full, it flares and stays powered for the rest of the visit.
- **Anchors** (`chip.tsx` SecurityCamera). The custom AR framework put two platforms behind one API, and the camera that stands for it asks for its cubes in order: the one it wants next has its brackets beating. Point at it so the camera locks on and holds it in its cone, and it's anchored: it pops and stays lit. The others track as they always did, but only the one asked for anchors. With all five anchored they fly together into the first and merge into one bigger, brighter cube, which holds a while; then they part and it asks again, in a new order.
- **Scavenger hunt** (`critters.tsx`). ARCam dropped characters into a show floor through a viewfinder, for a photo with them. Here the park has seven creatures of its own, each made out of one of the projects, and they're hiding. In the close-up, every so often one shows itself, somewhere different each time, and you have to spot it. A pine rustles, and out from behind it comes Cameleon, with camera lenses for eyes, its camouflage coming and going (ARCam); or Moletage, a mole in a high-vis vest holding up a sparking cable, up out of a fresh molehill (Amsterdam Underground); or Driftnot, a cloud on an anchor chain, dragging its anchor (the custom AR framework's cloud anchors); or Jerboost, a jerboa with a crown on and a chequered-flag tail, hopping out, and sometimes bounding across the open to another pine (Lightship Drive). A typing bubble shows over a pine, and Chatterkeet, a parakeet always typing a reply, flies down out of it, and later off into another (the Amsterdam AI guides). The lake ripples, and up comes Orbitot, a little Saturn, to swim about (Sol.AR), or Pinboo, a map pin, drops onto its dot on the water (Wonderment's location experiments). A few seconds, and it's hidden again, sooner the more of them you've found. Point at it and the viewer swings to it and its ring opens out round it; keep on it and a second ring fills (it stays while you do), then the shutter goes: a small bubble over it says so ("Pinboo captured"), and it goes to sit with the others in the clearing at the front, part of the model from then on. They follow the material system: the one that's out is a mark, the city's accent; the ones found are the model's frosted stock, with its rim and halftone; their own colours only ever show as light and dark. With all seven sat together, the viewer takes their group photo; the print, a duotone in the accent, rises out of the viewer with the picture developing on it, and a while later they go back into hiding and it starts again. The pines are small and scattered, with the clearing at the front and another in the middle, and a creature only ever shows itself where the camera can see it, clear of the label. On a touch screen and under reduced motion the viewer keeps its sweep.

### Audio tour
The voice notes (`VoiceNote.tsx`): a short recording of me talking about the project, as one quiet line on the label and the right page: a small square key in the layer colour carrying the exhibit's number (the play mark while it plays), a short waveform, "Audio tour · in my own words" and the clip's length in mono. The waveform is a drawing (a fixed shape per project), not the clip's real one; it fills from the left as the clip plays. Only the clip's metadata loads up front. One plays at a time, and it stops when the label closes. A project without a recording shows no button: the clips are files named after the project's slug in `src/assets/voice/`. Exhibit 11's is the countdown (`next-launch`).

### Sound
Off until the visitor turns it on with the round switch beside Find (remembered); the switch only appears once there's a recording to hear. The palette is the maquette's own material: glass taps, paper, small mechanical clicks, every pitched sound in one scale. The signature is the tour itself: each project waking plays the next note, and the chord sounds when all ten are awake. Interface sounds are short and quiet, and nothing sounds on hover. Each layer has a faint ambient bed that crossfades with the scroll and steps back while you read; a voice note ducks everything else. Recordings live in `src/assets/sound/` (its README is the list).

### The path to launch
Seeing all ten exhibits opens the ride at the end of the visit, the flight simulator, and a visitor should see it coming: without a build-up, a rocket launch at ten came out of nowhere. So it's said from the start, and it builds, without an arrow or a coach mark:

- **Said once, in full, then kept in view.** The opening card ends on it: "Light all ten projects to launch the next one." (desktop, first visit). The guide's cover, at the bottom of the hero, says how many you've seen ("4 of 10 seen") and, under it, what they add up to: "Launch at ten", short enough for a phone's narrow cover, so a phone (which skips the card) and a returning visitor get it too.
- **Counted down at the end.** With two to go the note turns to the accent and counts: "Two more to launch", "One more to launch", then "Ready to launch" at ten (and "All 10 seen" above it). The count's tenth pip is a small rocket outline; with one to go it breathes, and it fills when the model is complete.
- **Built where you can see it.** Each exhibit seen adds a piece to the pad in the city (the mount, the tower, the booster, the ship…). The count and the pad step together, once a label has closed and the camera is back out, so the visitor sees the next piece rise and a faint ring run out across the apron as the number ticks. With two to go the tower's beacon starts a slow blink; with the ship on, one to go, it blinks quicker and the stack breathes vapour off its tanks (it's being fuelled), streaming out far enough to read against the sky from the overview, while the city is the floor in view. At ten the site powers on, and the invitation reads "flight simulator — fly the next launch".

The guide says the rest: "Flight simulator · opens once you've seen all 10".

The exhibition guide is a leaflet folded in half like the one you take at the door, pushed into the bottom edge of the screen: only its cover shows, with the count printed on it (the pips and "4 of 10 seen", in sentence case) and its note under it ("Launch at ten"). It's the one sign along the bottom: the count is part of the object rather than a label beside it, and nothing else sits down there. Pulling it out slides it up into the frame and the cover swings open on the fold, to the left, onto the inside; folding it shut slides it back in, and so does a press anywhere outside it (which still does whatever it was pressed for). Inside, the ten are listed by layer the way a printed leaflet lists them: no numbers, no dots, no count (that's the cover's). The visitor's own pen marks are in the margin: a tick against each exhibit they've seen, drawn a little off the print's straight lines, and one seen since the guide was last open writes itself in once the leaflet has opened. One not seen yet is named too but in dim letters, and is a way there: pressing it takes the camera to it. It has no scroll bar. Under them, the flight simulator, which "opens once you've seen all 10" and then takes you onto the pad to fly the next launch; and "8 more in the depot →" to /projects. Seen exhibits are remembered in a cookie, so a returning visitor finds the model as they left it; "start the tour over" in the guide clears it. A returning visitor (the opening has played in this browser before) is also greeted for a few seconds on the cover, under the count, in the note's place: just "Welcome back" (the count already says how far they got). Opening anything ends it, and the note comes back.

On the pad, exhibit 11's label stands beside the rocket (under it on a phone), in the same hand as the ten: "11 of 10 · still in the workshop", "Your project · The exhibit that isn't built yet · Materials to be decided · Assembled from the 10 in the model". It ties the launch to the exhibition: every exhibit in the model was launched once (a countdown, a lift-off, then the problems every project runs into); this one is still on the pad. Its audio tour is the countdown, and it has two ways on: LAUNCH (the film, then the game), or "Let's build it →" down to the workshop (the contact section). A ✕ (or Esc) goes back to the model.

A wrong address is a closed room: a label over the dimmed model, "This part of the exhibition isn't open yet", with the way back to the exhibition and to the collection. A shared project link previews as its exhibit: the poster under "Exhibit 02 · Merijn Kersten", the title and the outcome (`npm run og` draws the cards; the build writes each project a page that points at its card).

### Navigation
- Space Mono links at `--ink-60`, brightening to `--ink` on hover or focus while a 1px accent hairline draws in under them from the left (`.ui-link`). Social icon links get a `--surface-2` hover fill. At 960px and below (phones, and a tablet held upright, where the row would wrap "What I / do"), nav becomes a full-width slide-down drawer (`translateY`) with hairline row dividers, sharing the chrome-lift shadow vocabulary.

### Launch telemetry
The launch film's overlay (`LaunchHud.tsx`) borrows a launch broadcast's lower third and draws it in the site's hand: each stage's speed, altitude and propellant in mono readouts, its engines as a diagram of hollow rings that fill as each Raptor starts and empty as it shuts down, the mission clock over a milestone track that fills as the flight passes each mark. No callouts or badges: it stays quiet and lets the picture lead. Colour only for what's live: the engines' fire tint, cyan on the track. A light wash keeps it legible over the steam, and the site's header steps aside while the film runs. The numbers are a real Starship profile, rounded (`launchPlan.ts`).

### Game HUD
The asteroids game (`AsteroidsGame.tsx`) keeps all its state in one bar across the top, in three fixed parts: the stage on the left (a mono "Stage 02" over its name in the display face), the score in the middle in the display face with a small chain count (×2…×5) beside it while kills come fast, and on the right the shield (a lit hexagon, or a dashed outline and "Shield down"), the record and a square pause control. Each new stage opens with a slate: "Stage 02" over the name and a short rule drawing out under it. Everything stays quiet, with no wash and no heavy weights, so the rocks and the ship lead. The hazards' names sit on faint tags under their rocks, drawn over the 3D stone so they read. The controls show as keycaps for the first seconds; on a touch screen as one label on each half ("Hold to fly", "Tap to fire"). Ground control talks from the bottom left; nothing else lives at the bottom. At the end the HUD steps aside for the finish: a quiet panel with the score, the project's five stages on a line (cleared ones filled, a cross where it stopped, and what got through named under it) and two equal choices, "Iterate" and "Build the real one with me". Ground control says the verdict and the one funny line, and leaves it up.

### Signature Component: the Life System
Every hotspot-bound 3D object and its paired UI ships a "ghost" (desaturated wireframe) and an "alive" (fully authored colour/material) state, lerped by a shared visited/hovered store. This is the literal expression of The Ghost Circuit north star — UI chrome (tags, tooltips, card accents) inherits the same logic by only fully committing to its layer colour once that layer/case has been visited.

## Do's and Don'ts

### Do:
- **Do** keep every accent hue locked to its one job (cyan = interactive/City, coral = Room, lime = Chip, lavender = Freelance tag, pink = Passion tag) — see The One Job Rule.
- **Do** route all metadata, labels, tags, and button text through Space Mono, uppercase, letter-spaced — see The Mono Meta Rule.
- **Do** scale shadow/blur weight to how "forward" an element is meant to feel, with the focus dialog as the ceiling — see The Proximity Rule.
- **Do** keep quiet-but-informational text at or above `--ink-40`'s measured 4.5:1 contrast floor.
- **Do** honour `prefers-reduced-motion` for every animation, camera move, and scroll-driven effect already in the system.
- **Do** take every size from the nine-step scale and every timing from the motion tokens — see The One Scale Rule and The Token Timing Rule.
- **Do** change the headline face through the display tokens alone (`--font-display` and its `--display-*` settings), never per component.

### Don't:
- **Don't** soften corners back toward the discarded 14px "acrylic" radius — 2–4px crisp corners are a confirmed, deliberate rejection of that look.
- **Don't** add ambient shadow to resting, flat page sections; shadow is earned by forward/floating elements only.
- **Don't** light, tilt or float page content: no glow halos, cursor spotlights, perspective swings or velocity zooms in the 2D sections. Glow and depth belong to the 3D maquette; on the page, colour arrives as state (an edge taking its accent, a route lighting up) and things move when they arrive or under the pointer.
- **Don't** introduce a sixth accent hue or repurpose coral/lime/lavender/pink outside their single locked role.
- **Don't** let any case study depend on the 3D scene to be understood — every case must remain fully readable as plain text/media (a product-level accessibility floor, not just a visual preference).
