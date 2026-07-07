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
  app/App.tsx          router + layout
  components/
    SceneCanvas.tsx    the hero canvas: lazy three/R3F boundary, WebGL fallback
    HeroStage.tsx      hero copy over the scene
    Capabilities.tsx   the three scales as one full-bleed slanted band
    Work.tsx           the projects map: a pinned, scroll-driven timeline
    CaseCard.tsx       a waypoint card on the timeline
    NodeHud.tsx        the /work/:slug dossier drawer
    About / Contact / Header / Footer / Poster / ScanFrame / SectionTitle
  scene/
    Maquette.tsx       the three-layer world: objects, life system, hotspots
    CameraRig.tsx      journey scroll + node fly-to
    Stage.tsx          lighting, fog, bloom, scene root
    framing.ts         layers, hotspots, camera framings (pure data/math)
    store.ts           tiny cross-reconciler store (selected/hovered/visited)
    devTweak.tsx       dev-only position scrubbers (tree-shaken from prod)
  content/             cases.json · capabilities.json · site.json (+ types)
  lib/                 asset base-path, reduced-motion, WebGL support, youtube
  ui/                  tokens.css (design tokens, locked colour system)
                       + global.css
public/textures/       optional real screenshots (room-screen / room-phone /
                       zwijsen-book .jpg) — objects fall back to procedural
                       looks when absent
```

**The life system** (`LifeGroup` in `Maquette.tsx`): each hotspot object's
materials are snapshotted and lerped between a grey wireframe ghost and their
authored state. Self-animating materials opt out via `userData.lifeSkip` and
blend their own ghost→alive keyed on the same store state. Colour policy lives
in `src/ui/tokens.css`: cyan = interactive + City, coral = Room, lime = Chip.

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
