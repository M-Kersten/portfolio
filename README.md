# Merijn Kersten — portfolio

A dark, editorial, typography-led portfolio for creative-technology work
(VR / AR / spatial computing). The 3D does double duty: it is the navigation
**and** a portfolio piece.

The hero is a single React Three Fiber canvas holding a **three-layer
maquette** — City (GIS / location), Room (games / apps / web), Chip (tools /
CV / data) — one layer per scale of work. Every interactive object starts as a
faint monochrome **ghost**; clicking it floods its materials and layer colour
back in, and it stays alive for the session. Exploring literally colours the
world in.

## Stack

React 18 + Vite + TypeScript (strict) · React Three Fiber + drei + bloom
(one renderer) · react-router · Space Grotesk / Space Mono via `@fontsource`.
All assets self-hosted; no API keys, no external tiles.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build to dist/
npm run preview    # serve the build locally
```

Useful while developing:

- `/` — home (hero maquette, capabilities, projects timeline, about, contact)
- `/work/:slug` — deep link to a project: the camera flies to its object and a
  dossier HUD opens
- add `?nogl` to any URL to preview the **no-WebGL static fallback**
- OS reduced-motion is respected everywhere (states snap, no glitches)

## How it's wired

```
src/
  app/App.tsx          router + layout (dev-only tweak panels mount here)
  components/
    SceneCanvas.tsx    the hero canvas: lazy three/R3F boundary, WebGL fallback
    HeroStage.tsx      hero copy + the scroll panels that drive the layer journey
    Capabilities.tsx   the three scales as one full-bleed slanted band
    Work.tsx           the projects map: a pinned, scroll-driven timeline
    CaseCard.tsx       a waypoint card on the timeline
    NodeHud.tsx        the /work/:slug dossier drawer
    About / Contact / Header / Footer / Poster / ScanFrame / SectionTitle
  scene/
    maquette/          the three-layer 3D world, one file per concern:
      index.tsx        composition root — stacks the layers, culls the far one
      city.tsx         City rig: skyline, windmill, park + ARCam, skyscraper
      room.tsx         Room rig: desk/monitor, couch + phone, AR table, bookcase
      chip.tsx         Chip rig: PCB, die, lens, traces, LEDs
      hotspots.tsx     the floating crosshair markers
      signals.tsx      cross-layer relation cables (edit RELATIONS here)
      life.tsx         the ghost→alive life system (LifeGroup, EmissiveHover)
      materials.tsx    holographic glass + rim shader, accents, SoftBox
      backdrop.tsx     dot floors, point fields, depth veil
      shared.tsx       palette, math helpers, useActive, fog-aware Line
    CameraRig.tsx      journey scroll + node fly-to
    Stage.tsx          lighting, fog, bloom, scene root
    framing.ts         layer stack + hotspot positions + camera framings (data)
    store.ts           tiny cross-reconciler store (selected/hovered/visited)
    devTweak.tsx       dev-only 3D position scrubbers (tree-shaken from prod)
  content/             cases.json · capabilities.json · site.json (+ types)
  lib/                 asset base-path, reduced-motion, WebGL support, youtube
  ui/                  tokens.css (design tokens) + one stylesheet per page
                       section (global.css just imports them in order)
public/
  posters/<slug>.jpg   timeline/card artwork per project
  textures/            optional real screenshots (room-screen / room-phone /
                       zwijsen-book) — objects fall back to procedural looks
  logos/               employer marks for the timeline tooltips
  profile/1..5.png     the About portrait frames
```

**The life system** (`life.tsx`): each hotspot object's materials are
snapshotted and lerped between a grey wireframe ghost and their authored
state. Self-animating materials opt out via `userData.lifeSkip` and blend
their own ghost→alive keyed on the same store state. Colour policy lives in
`src/ui/tokens.css`: cyan = interactive + City, coral = Room, lime = Chip.

## Editing guide

**Copy & content** — everything written lives in `src/content/`:

- `site.json` — name, hero lines, section intros, career timeline (dates are
  `YYYY-MM`), about facts, contact links.
- `cases.json` — one entry per project. `year` accepts `"2024"` (centres on
  the year) or `"2024-09"` (pins the month on the timeline). Drop a matching
  poster in `public/posters/<slug>.jpg`.
- `capabilities.json` — the three band columns.
- `types.ts` documents every field.

**Adding a project to the 3D scene**: add the case to `cases.json`, then add a
hotspot for it in `src/scene/framing.ts` (`HOTSPOTS` — positions are local to
the layer), and give it an object in that layer's rig
(`scene/maquette/city|room|chip.tsx`). Wrap the object in
`<LifeGroup slug="...">` so it ghosts until visited. Link related projects in
`scene/maquette/signals.tsx` (`RELATIONS`).

**Moving things in 3D**: run `npm run dev` — two tweak panels appear. The
top-left **wall layout** panel scrubs the timeline's spacing; the **scene**
panel (from `useTweak` calls in the rigs) scrubs object positions live. Both
print the values to copy back into code, and both are stripped from
production builds.

**Look & feel**: start at `src/ui/tokens.css` (colours, type scale, spacing,
container width — the whole grid derives from `--container`). Section styling
lives in the `src/ui/*.css` file named after the section.

**Camera & layout of the 3D stack**: `src/scene/framing.ts` — layer heights,
scales, and the three camera framings (home, journey, node close-up).

## Deploy

Fully static — works on both targets.

- **GitHub Pages:** `.github/workflows/deploy.yml` builds with
  `VITE_BASE=/portfolio/` and publishes on push to the deploy branch (see the
  `branches:` filter). One-time setup: Settings ▸ Pages ▸ Source: **GitHub
  Actions**. SPA deep-link redirects live in `public/404.html` (its hard-coded
  `/portfolio/` must match the base).
- **Vercel:** zero-config (Vite preset); `vercel.json` adds the SPA rewrite.
  Serves at root, so no `VITE_BASE` needed.

The base path is environment-driven (`VITE_BASE`, default `/`); asset and route
helpers read `import.meta.env.BASE_URL`, so one codebase serves both.

## History

The original build contract is kept at [`docs/SPEC.md`](docs/SPEC.md) — code
comments reference its section numbers. The site has since evolved past parts
of it (the baked-district "digital twin" scene was retired in favour of the
projects timeline).
