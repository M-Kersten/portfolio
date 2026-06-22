# Merijn Kersten — Portfolio Website Build Spec

> Status: build-ready spec. Stack: React + Vite + TypeScript, React Three Fiber +
> drei (one Three.js renderer). Deploy target: GitHub Pages or Vercel. Both work
> now that everything is static.

This document is the contract for the build. It fixes the architecture, the data
model, the 3D approach, and the phasing.

Two decisions shape everything below, both leaning toward simplicity:

1. **One renderer, not two.** The whole site runs on a single React Three Fiber
   canvas. No deck.gl, no MapLibre. We are not streaming. That removes a second
   WebGL engine, a basemap library, and a whole class of bugs.
2. **Bake the GIS, do not stream it.** The "digital twin" is real Dutch building
   data, prepared once, offline, into an ordinary 3D model file and then loaded
   like any other asset. No live tile traffic, no geospatial math at runtime.

## 1. What this site is

A calm, editorial, typography-led portfolio for enterprise VR/AR/digital-twin
work. The 3D does double duty: it is the navigation, and it is itself a
portfolio piece. There are two 3D scenes inside the same canvas:

1. **The hero maquette.** An abstract, art-directed model of three stacked layers
   representing the three service pillars. Slow auto-orbit, hover hotspots.
2. **The twin.** A real 3D model of a Dutch district, built from open 3DBAG
   building data, baked into a normal glTF asset and loaded into the same scene.

Because both scenes share one renderer, the bridge between them is a camera
move, not a handoff between engines.

## 2. Goals and non-goals

**Goals:** establish seniority within the first viewport; make the three pillars
legible; prove spatial and systems craft through the hero and one real district
model; surface 4–6 case studies, each with one hard outcome metric; run well on a
mid-range laptop and degrade gracefully with no WebGL and on reduced-motion.

**Non-goals:** no scroll-jacking spectacle; no live globe or second 3D engine; no
login or CMS backend at v1 (content is data-driven JSON committed to the repo);
no client data that is not already public or cleared (Defensie anonymised by
default).

## 3. Information architecture

Single long page with anchored sections, plus deep-linkable case study routes.

```
/                     Home (#hero #capabilities #work #about #contact)
/work/:slug           Case study detail (modal over home, or standalone route)
/work/municipal-twin  The district case study (camera flies into the baked model)
```

Case studies open as a route-driven modal over the home scroll position, also
reachable as standalone URLs. The municipal-twin route triggers the camera move
into the district and lazy-loads the district model on first need.

## 4. The hero (abstract maquette)

Near-white stage, one slowly orbiting maquette of three slightly separated
horizontal layers in muted slate-blue, hairline contours, soft AO, one warm
accent. Layers bottom→top: VR training (immersive room plane) · AR overlays
(translucent annotation plane) · Digital twin / data (network plane). The
municipal-twin hotspot flies into the district.

Hotspots are DOM elements via drei `<Html>`, keyboard-accessible, not pickable
geometry. Idle auto-orbit; eased camera focus on click; everything honours
`prefers-reduced-motion`. Fallback: a high-res static poster if WebGL is
unavailable. The "grid simulation" element stays abstract and lives only here.

## 5. The twin: real building data, baked once

**5.1 Source — 3DBAG.** Open dataset of ~10M Dutch buildings reconstructed in 3D
from BAG + AHN LiDAR (TU Delft 3D geoinformation & Kadaster). Used as a download,
not a live service. LoD2.2, OBJ or CityJSON.

**5.2 Bake pipeline (once per district).** Download the tile → crop & centre in
Blender at the origin → tidy materials → export `.glb` to
`public/models/<id>.glb` → optimise only if needed. See
[`../scripts/bake-district.md`](../scripts/bake-district.md).

**5.3 Rendering.** Plain R3F: `useGLTF` the baked model, `<OrbitControls>` with
distance bounds, soft ambient lighting. No tile loader, no projection.

**5.4 Ground.** Paper-coloured plane + faint grid (architectural model on a clean
desk). Optional: drape one static PDOK aerial image as a texture.

**5.5 Genuine GIS, not decoration.** Colour buildings by a real 3DBAG attribute
(`bouwjaar`, height, roof area) with a legend and a caption naming the attribute
and release. Baked-in colours (zero runtime logic) first; optional runtime toggle
with separate named objects + sidecar JSON second. Per-building readout via
native R3F pointer events.

**5.6 Attribution (hard requirement).** Render a persistent, legible 3DBAG credit
in the twin scene; add PDOK if an aerial drape is used. Non-removable UI.

**5.7 Why not streaming/deck.gl.** Baking gives a smaller bundle, no external tile
domains, no server dependency, one engine. (`3DTilesRendererJS` is the future
path if streaming is ever wanted, still inside three.js. Not for v1.)

**5.8 Tailored twin (headline feature).** A place registry in `src/data/places.ts`;
the active place is chosen by `?place=<id>`, **allowlist-only** (never carries
coordinates), defaulting to the home district. Bake a target's district, add a
registry entry, share `…/work/municipal-twin?place=<id>`, with an optional quiet
`dedication` line. Recognisable, public, non-sensitive locations only.

## 6. Architecture

One `<Canvas>` at the app root persists across routes. `Maquette` and `District`
are switched by a camera move (`CameraRig`); only ever one WebGL context. The
district `.glb` lazy-loads on first navigation to the twin. Dependencies kept
small: three, @react-three/fiber, @react-three/drei, a router.

## 7. Content data model

All copy/case data is committed JSON. Every case carries exactly one `layer`
(twin | ar | vr) and one `outcome` metric. `live: true` on at most one case
(the twin). Client logos/names only where cleared; defence anonymised.

## 8. Visual system

```
--paper #F7F6F2  --ink #1B2A2E  --model-mid #6B8CA3  --model-deep #46627A
--hairline #C9D3D6  --accent #0F8A8A (deep teal, recommended)  --shadow rgba(27,42,46,.08)
```

One accent only. Headings: Space Grotesk / General Sans. Body: Inter. Matte
materials, soft key + ambient (`<Environment>`), thin lines, soft contact shadow.

## 9. Motion and interaction

Hero: slow auto-orbit, eased focus on click. Hotspots: small pulsing dots,
keyboard focusable. Into the twin: one eased camera move while the district loads
behind the poster, then dissolve. Twin: damped orbit/pan within limits, attribute
toggle, reset view. Reduced-motion: orbits stop, the camera move becomes an
instant cut with a fade, pulses become static rings.

## 10. Performance budget

Home route initial JS under ~250 KB gzipped excluding three; the district model
is not on the home route. Cap DPR at 2. Instanced/merged geometry, baked lighting.
One bounded district. Pause rendering when scrolled out of view.

## 11. Accessibility

Hotspots and twin controls are real focusable DOM with labels and visible focus.
Every case study is fully readable as text and media without any 3D.
`prefers-reduced-motion` honoured. Static posters carry alt text; the attribute
ramp passes contrast and never encodes meaning by colour alone without a label.

## 12. Privacy, licensing, deploy

Self-hosted static assets; no external tile domains; no API keys. Client
logos/names only where cleared; defence anonymised. `?place=` allowlist-only.
Deploy on GitHub Pages or Vercel. The 30-second-path text (name, three pillars,
one metric, contact) is real HTML, not locked behind the canvas.

## 13. Risks

Content & permissions are the long pole (start now). Never shipping (Phase 1 is
shippable with no twin). The abstract maquette is the real design risk (make the
poster genuinely good). The bake step is unfamiliar but mostly Blender. Corporate
viewers may have WebGL blocked — the static fallback is first-class. Picking
performance with many separate buildings (merge/instance non-interactive).
Attribution and the social edge of the tailored twin.

## 14. Phasing

1. **Hero refit** — three-layer maquette, hotspots, orbit, focus, reduced-motion,
   poster; capabilities + case grid from JSON. Shippable with no twin.
2. **Bake spike** — bake one district, load its `.glb`, orbit it.
3. **Twin integration** — camera transition, attribute colouring, readout,
   legend, caption, attribution, place registry + `?place=`.
4. **Polish** — copy, real metrics, logo permissions, type/accent, perf, a11y,
   optional aerial drape.

## 15. Open decisions (inputs from Merijn)

The 4–6 case studies + one metric each · logo/naming permissions (Defensie
especially) · accent (teal vs amber) and type (free vs paid) · home district ·
tailored targets + dedications · twin colouring for v1 · plain ground vs aerial
drape · any existing 3D assets to reuse.
