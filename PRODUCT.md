# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primarily peers and industry people — other developers, XR/creative-technology practitioners, and industry contacts exploring the work out of interest, not a narrow hiring or sales funnel. Recruiters, employers, and potential clients still land here, but the site isn't tuned specifically to convert them.

## Product Purpose

A portfolio site that is itself a portfolio piece: it demonstrates spatial/creative-technology craft through its own construction (one React Three Fiber canvas as both navigation and artifact), while showcasing real case studies across VR, AR, games, and digital-twin/GIS work. Success is being remembered and having the craft register — not a specific click-through action.

## Positioning

The 3D navigation is the mechanism, not decoration: a single canvas holds a three-layer maquette (City / Room / Chip — GIS-scale, app-scale, and hardware-scale work). Every interactive object starts as a faint monochrome ghost; visiting it floods in its colour and materials permanently for the session — exploring the site literally colours the world in. A conventional case-study grid could not make the same claim; the medium enacts the same spatial/interactive craft the case studies describe in words.

## Operating Context

- Runs in-browser across screen sizes; corporate viewers may have WebGL blocked, so the `?nogl` static fallback is a first-class path, not a degraded one.
- OS `prefers-reduced-motion` is respected everywhere (states snap, no glitches).
- Content is authored as committed JSON in `src/content/` (`site.json`, `cases.json`, `capabilities.json`, `cv.json`); non-technical edits happen there, not in components.
- The CV is generated as a printed PDF from the `/cv` route via Chrome (`npm run cv`) and served from Contact.
- One codebase deploys to both GitHub Pages and Vercel (`VITE_BASE`-driven).

## Capabilities and Constraints

- One WebGL context for the entire site (single `<Canvas>`, `Maquette` + `CameraRig` switch scenes by camera move, not engine handoff).
- Every case study must be fully readable as text/media with zero 3D — this is an accessibility floor, not optional.
- `src/content/cases.json` is the authoritative, already-cleared source for what can be shown or claimed about client work (including the defence/Marechaussee case) — confirmed with the user as needing no further redaction.
- `docs/SPEC.md` is the original build contract and is historical: the baked-district "digital twin" scene it describes was retired in favour of the projects timeline. Treat it as history, not current direction (see README's "History" section).

## Evidence on Hand

- Real, named case studies in `cases.json` (Marechaussee VR training multiplayer, Alliander HoloLens siting + digital twin, and others) — each with client, sector, problem/approach/outcome, tech, a stated lesson, and often video/article links.
- A dated career timeline (2016–present) in `site.json` with employers, roles, locations, logos, and blurbs, including current freelance placements via Rebels.
- Real About copy, bio, and personal facts (location, studies, interests) in `site.json`.
- Real employer logos (`public/logos/`) and profile portrait frames (`public/profile/`).
- Nothing here is fabricated or placeholder — do not invent testimonials, metrics, pricing, or client claims beyond what's committed.

## Product Principles

- The medium is the message — the ghost-to-alive exploration mechanic must keep demonstrating the same craft the case studies claim, never reduce to decoration.
- Optimise for memorability and demonstrated craft, not a conversion funnel; this is not a lead-gen page wearing a portfolio's clothes.
- Every case study stands fully on its own as plain text/media — 3D is enhancement, never the only path to the content.
- Real work only: no invented clients, outcomes, or claims beyond the committed content data.
- Corporate, reduced-motion, and no-WebGL contexts are first-class experiences, not fallbacks to apologise for.

## Accessibility & Inclusion

`prefers-reduced-motion` honoured everywhere; every case study readable as text/media without 3D; static no-WebGL fallback at `?nogl`. No additional formal standard (e.g. a specific WCAG level) has been set beyond these established behaviours.
