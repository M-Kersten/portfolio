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

Every section opens the same way (`SectionHead.tsx`): a mono **kicker** with the section's name (the header nav's words, deliberately without a number), a measuring rule with a tick every step running out to a short **note** at its end (the three scales the work happens at, the career's date range, Utrecht's position), then the **title** across the full width at step 6, then the **lead** small and directly under it, on the title's left edge, read as one block with it, like a wall text under an exhibit's name. One big thing and one quiet one, off-axis, instead of a left-aligned stack at two similar sizes. Contact, the finale, sets the same parts on the centre line without the rule. Below the openings the sections keep that asymmetry: the capability columns step down the band one after another (city over room over chip, as the maquette stacks them) each led by its title alone; the timeline cards lead with the year; About opens its bio with a step-2 line at full ink, then a ruled row of numbers counted from the content (counting up as it arrives), then the paragraphs as four short chapters each led by its own first sentence as a headline (no rules over them; the headlines carry the structure, and read alone they tell the story), with the annotated portrait held in view beside them. `*words*` in that copy are highlights: a highlighter band sweeps in behind them as their block arrives.

The projects timeline is the one major departure from static document flow: a pinned, scroll-driven horizontal "wall" (a `position: sticky` region) that pans through career history as the user scrolls vertically, one to one, like a map sliding past a fixed frame; it falls back to a plain horizontally-scrollable strip under `prefers-reduced-motion` or on narrow/static contexts (`[data-static]`). Like every other section it is flat: the cards rest square-on, nothing tilts, drifts or glows. It's drawn on a canyon map (`lib/contours.ts`: a seamless contour tile with a valley pressed along the route), and the site's idea of connecting the dots is drawn into it literally: the map is woven together from its points as you travel it. Far ahead it's a sparse scatter of the site's square dots along the contours (one every 40px); as you come up to it a second trail fills in between them and then a third (one every 10px), each falling between the last's dots so the map only ever gains points; behind the focus the dots are joined into clear lines. "Now" is a focus with no marker on it, which sweeps across the screen as you scroll, from the left edge when the wall pins to the right edge as the route runs out, so the journey starts with nothing reached and ends with all of it. Behind the focus the route is lit in its employers' colours; ahead of it the route is dim. Each waypoint's square station fills in as it's reached and its card powers on from grey (the maquette's ghost → alive, at timeline scale), and the year at the focus rolls like an odometer. Reduced motion gets the finished route: everything lit and woven. Below ~760–899px, multi-column layouts (About's grid, the annotated portrait stage) collapse to a single stacked column with the portrait promoted above the bio via explicit order.

## Motion

One system for every transition and animation (`tokens.css`, mirrored for code in `src/lib/motion.ts`): three durations (`--t-fast` 0.2s for feedback, `--t-base` 0.35s for a change of state, `--t-slow` 0.6s for an arrival), one beat between siblings (`--stagger`, 80ms), and one curve for everything that responds or arrives (`--ease`, a quick start and a long settle), with `--ease-in-out` for what has to feel even at both ends. Ambient loops (the crosshair ping, the logo's blink, the portrait's scan) keep their own periods; they're rhythms, not responses.

- **Arrivals.** Content arrives when it reaches one shared point in the scroll (`REVEAL`: a quarter of it on screen, clear of the bottom edge), through `useReveal`: a section's rule draws across, its title decodes, its lead rises a few beats later; the capability columns and the About pins follow in stagger order.
- **Hover and focus.** One grammar, and keyboard focus gets the same answer as the pointer: a link in running text firms up its underline; a mono UI link (nav, footer) brightens and draws a hairline in under it; a button lifts `--lift`; a ghost button takes the accent on its edge; a card lifts and its edge takes the layer's colour; the contact email, the page's one call to action, sweeps a solid rule in.
- **The About specimen.** The annotated portrait rises gently into place as the bio arrives (eased, never more than about 160px), settling as the bio's top reaches the header; from there its column is sticky and it stays beside the text while you read. Reduced motion holds it still.
- **Opening a project.** In the maquette the label waits for the camera to arrive, then its line draws out from the object (`0.45s`) and the label unrolls from the line's end (`0.5s`), and the title decodes. Opening the book is one FLIP move (`--t-slow`): the label's head travels to the left page and its film grows into the plate, the right page swings open from the spine, and everything that wasn't on the label fades in after it. On a page the plate grows out of the card's picture instead. Walking to the next book slides it in from that side (`--t-base`). Reduced motion fades instead of moving.
- **The opening shot.** The camera dollies in from a wide establishing shot to the city (4.65s, eased from a standstill to a standstill), and nothing else moves the frame while it does: the model doesn't scale up under it and the pointer parallax holds level until it lands. It leaves only once the shot is ready (every model arrived, every shader compiled, while the camera holds still), and it runs on frame time, so a dropped frame pauses it rather than jumping it ahead. A returning visitor (the intro card has played once in this browser) skips the card and gets a shorter dolly (2.8s).
- **The first-visit cue.** Until a first project is opened, the boot's last beat is an invitation: one crosshair per layer (the tower, the phone on the couch, the die) locks its brackets, puts its name on a chip, pings on a quicker beat and decodes a "click to light it" tag ("tap" on touch), while the layer's other markers hold their pulse so it's the one thing moving. It retires for good on the first open.

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
The site is an exhibition of my work in miniature, so a project opens the way an exhibit is read (`Exhibit.tsx`). The ten projects with an object in the model are exhibits, numbered 01–10 in the order a visitor meets them (city, room, chip); the other projects are "in the collection".

**The label** is the glance, and it belongs to the maquette. It waits for the camera: the object is reached first, then a line runs out from it (a square mark on the object, a hairline elbow to the label) and the label unrolls from where the line meets it, standing in the column beside the porthole, as wide as that column allows. The film comes first, at the top: a silent 6–10 s loop (`src/assets/loops/<slug>.mp4`), or, until there is one, the poster drifting slowly; "Watch the film" plays the film right there, with sound. Under it, in groups with air between them: where it stands, said quietly in small grey type ("02 of 10 in the model", or "In the collection") with the ✕; the title and what it achieved; client and year, then sector and my role in mono; one sentence of curator's note (the problem's first sentence, three lines at most); the audio guide; "Read the full story", the one solid thing on the label, in the layer's colour, with its reading time; and the walk to the neighbouring exhibits ("← 01 ARCam · 03 DTT Projects →"). It's a panel like the site's other panels: the hairline outline and the small radius, no coloured corners. On a laptop-height screen the film gives up a little height so "Read the full story" always shows without scrolling.

**The book** is the full story, set as a printed spread. The left page is the chapter opener: a running head ("Work in miniature · Exhibit 02"), the quiet "02 of 10 in the model", the title, the standfirst, the audio guide, and the film, with a line under it on what you're looking at (`src/content/films.ts`), all centred on the page. The right page is the catalogue entry: the facts first, as a museum prints them (client, role, when, sector, made with), then the story set as a book sets it (justified and hyphenated, "The problem", "The approach" and "The lesson" as plain headings, indented paragraphs, an end mark), then "See also: Exhibit 05, Popcore games", "Ask me about it", and the walk. No page numbers, and no scroll bars: a page that runs long just scrolls. Opening it from the label is one move: the label's head travels to the top of the left page and its film grows into the plate (carrying on from where it was, if it was playing), and the right page swings open from the spine. YouTube loads only when the film is pressed. A gallery shows only for a project with real stills. In the maquette, Esc (or "Back to the label") folds the book back into the label and a second Esc closes it; `/work/<slug>?entry` opens straight onto the book.

**On a page** (the timeline, /projects, search) the card that was clicked is the label already, so a project opens straight onto the book: its plate grows out of the card's picture and the right page swings open. ← → walk from older to newer ("← 2023 Nieuwe Kerk Utrecht · 2024 Alliander digital twin →"), and Esc closes.

On a phone (and a tablet held upright) the label is a sheet from the bottom, stopping short of the object in the porthole, with a grip on top, and it's handled rather than clicked: it follows the finger sideways to the next exhibit, up into the book (the sheet grows under the finger and unfolds from wherever it's let go), down to put it away. The book is one column (the opener and the plate, then the entry; a playing film stays at the top while the story scrolls) and pulls down from its top to step back. Under reduced motion nothing travels: things fade.

### Audio guide
The voice notes (`VoiceNote.tsx`): a short recording of me talking about the project, as one quiet line on the label and the right page: a small square key in the layer colour carrying the exhibit's number (the play mark while it plays), a short waveform, "Audio guide · in my own words" and the clip's length in mono. The waveform is a drawing (a fixed shape per project), not the clip's real one; it fills from the left as the clip plays. Only the clip's metadata loads up front. One plays at a time, and it stops when the label closes. A project without a recording shows no button: the clips are files named after the project's slug in `src/assets/voice/`. Exhibit 11's is the countdown (`next-launch`).

### Sound
Off until the visitor turns it on with the round switch beside Find (remembered); the switch only appears once there's a recording to hear. The palette is the maquette's own material: glass taps, paper, small mechanical clicks, every pitched sound in one scale. The signature is the tour itself: each project waking plays the next note, and the chord sounds when all ten are awake. Interface sounds are short and quiet, and nothing sounds on hover. Each layer has a faint ambient bed that crossfades with the scroll and steps back while you read; a voice note ducks everything else. Recordings live in `src/assets/sound/` (its README is the list).

### The path to launch
Lighting all ten exhibits assembles the next launch, and the site says so without a single arrow or coach mark. The opening card ends on it ("Light all ten projects to launch the next one"), and so does the first-visit cue. The tally at the bottom of the hero names the goal ("3/10 lit · stacking the next launch"), counts down the last two ("2 to go"), and says "ready to launch" at ten; its tenth pip is a small rocket outline that fills when the model is complete. The tally and the rocket on the pad step together, once a label has closed and the camera is back out, so the visitor sees the next piece rise and a faint ring run out across the apron as the number ticks; at eight the tower's beacon starts a slow blink.

The tally opens the exhibition guide: the ten by layer, numbered; a dark one keeps its name redacted but is a way there ("fly there →" takes the camera to it). Under them, row 11, "The next launch", which "lights at 10" and then takes you onto the pad; and "7 more in the collection →" to /projects. Lit exhibits are remembered in a cookie, so a returning visitor finds the model as they left it; "start the tour over" in the guide clears it.

On the pad, exhibit 11's label stands beside the rocket (under it on a phone), in the same hand as the ten: "11 of 10 · still in the workshop", "Your project · The exhibit that isn't built yet · Materials to be decided · Assembled from the 10 in the model". It ties the launch to the exhibition: every exhibit in the model was launched once (a countdown, a lift-off, then the problems every project runs into); this one is still on the pad. Its audio guide is the countdown, and it has two ways on: LAUNCH (the film, then the game), or "Let's build it →" down to the contact section. A ✕ (or Esc) goes back to the model.

A wrong address is a closed room: a label over the dimmed model, "This part of the exhibition isn't open yet", with the way back to the exhibition and to the collection. A shared project link previews as its exhibit: the poster under "Exhibit 02 · Merijn Kersten", the title and the outcome (`npm run og` draws the cards; the build writes each project a page that points at its card).

### Navigation
- Space Mono links at `--ink-60`, brightening to `--ink` on hover or focus while a 1px accent hairline draws in under them from the left (`.ui-link`). Social icon links get a `--surface-2` hover fill. Below 720px, nav becomes a full-width slide-down drawer (`translateY`) with hairline row dividers, sharing the chrome-lift shadow vocabulary.

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
