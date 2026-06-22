# Merijn Kersten — portfolio

A calm, editorial, typography-led portfolio for enterprise VR / AR / digital-twin
work. The 3D does double duty: it is the navigation **and** a portfolio piece.

Everything runs on a **single React Three Fiber canvas** with **two scenes**:

1. **The hero maquette** — an abstract, art-directed model of three stacked
   layers (VR training · AR guidance · digital twins). Slow auto-orbit,
   keyboard-accessible hotspots.
2. **The twin** — a real Dutch district baked from open **3DBAG** building data
   into an ordinary `.glb` and loaded like any other asset. No live tiles, no
   second WebGL engine. The camera *flies* from the maquette into the city.

Built to the spec in [`docs/SPEC.md`](docs/SPEC.md), which is the contract for
this build.

## Stack

React + Vite + TypeScript · React Three Fiber + drei (one renderer) ·
react-router. No deck.gl, loaders.gl, MapLibre or Cesium. All assets self-hosted
— nothing for a corporate firewall to block.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build to dist/
npm run preview    # serve the build locally
```

Useful URLs while developing:

- `/` — home (hero, capabilities, work, about, contact)
- `/work/:slug` — a case study, as a modal over the home scroll position
- `/work/municipal-twin` — flies the camera into the district twin
- `/work/municipal-twin?place=arnhem` — the **tailored twin**, framed on another
  registered place (§5.8)
- add `?nogl` to any URL to preview the **no-WebGL static fallback**

## How it's wired

```
src/
  app/App.tsx          router + layout; the persistent <SceneCanvas/>
  components/
    SceneCanvas.tsx    the one canvas; route→scene sync, WebGL fallback, veil
    CanvasScene.tsx    lazy boundary for the whole three/R3F stack
    Hero / Capabilities / Work / CaseCard / CaseDialog / CaseModal
    About / Contact / Footer / Header / TwinPage / Poster
  scene/
    Maquette.tsx       abstract three-layer hero + <Html> hotspots
    District.tsx       baked .glb loader + honest procedural placeholder
    CameraRig.tsx      shared camera: auto-orbit, eased focus, twin descent
    Stage.tsx          in-canvas scene root (lighting, scene switch)
    store.ts           tiny cross-reconciler store (no React-context bridging)
    framing.ts         maquette layers, hotspots, all camera framings
    district.gen.ts    deterministic synthetic district (placeholder only)
  content/             cases.json, capabilities.json, site.json (+ types)
  data/places.ts       tailored-twin registry (allowlist), attribute metadata
  lib/                 reduced-motion, WebGL, in-view, asset-exists hooks
  ui/                  tokens.css (design tokens) + global.css
public/models|textures|posters/   self-hosted assets
scripts/bake-district.md          the bake recipe
```

**One canvas, two scenes.** The single `<Canvas>` persists across routes. The
maquette and the district are never mounted at once — `CameraRig` animates the
camera between them, so the bridge is a camera move, not an engine handoff.

**The twin today.** No baked model ships yet, so the twin renders an honest
**procedural placeholder** (clearly captioned as such) which already
demonstrates the camera transition, attribute colouring (Year / Height / Roof
area), the per-building readout, the legend and the attribution. Drop a real
`public/models/weesp.glb` in (see the recipe) and it loads that instead with zero
code change.

## Phasing (where this build is)

- **Phase 1 — hero refit: done.** Three-layer maquette, hotspots, auto-orbit,
  eased camera focus, reduced-motion, no-WebGL poster, capabilities band and
  case grid from JSON. This is shippable on its own.
- **Phase 2 — bake spike: ready, needs the bake.** District loader, ground +
  grid and orbit controls are in. Run `scripts/bake-district.md` once for the
  home district to replace the placeholder with real 3DBAG geometry.
- **Phase 3 — twin integration: done against the placeholder.** Camera
  transition, attribute colouring, hover/click readout, legend, caption,
  attribution, place registry and `?place=` selection all ship. Baked-in colour
  vs. the live toggle on a real model is the remaining choice (§5.5).
- **Phase 4 — polish:** real case metrics, logo permissions, optional aerial
  drape, final accent/type, perf + a11y passes.

## Make the twin real

See [`scripts/bake-district.md`](scripts/bake-district.md). Short version: in
Blender, import the 3DBAG tile, crop to your district, centre it at the origin,
export `public/models/<id>.glb`. Add a registry entry in `src/data/places.ts`.

## Deploy

Fully static — works on both targets.

- **GitHub Pages:** `.github/workflows/deploy.yml` builds with
  `VITE_BASE=/portfolio/` and publishes on push to `claude/loving-maxwell-qmf72n`
  (the current deploy branch — change the `branches:` filter if you adopt
  `main`). One-time setup: enable Pages (Settings ▸ Pages ▸ Source: **GitHub
  Actions**). The SPA deep-link redirect lives in `public/404.html` (its
  hard-coded `/portfolio/` must match the base).
- **Vercel:** zero-config (Vite preset); `vercel.json` adds the SPA rewrite.
  Serves at root, so no `VITE_BASE` needed.

The base path is environment-driven (`VITE_BASE`, default `/`); asset and route
helpers read `import.meta.env.BASE_URL`, so one codebase serves both.

## Still needs Merijn (the open decisions, §15)

Defaults from the spec are in place; swap as you confirm:

- **Case studies** — `src/content/cases.json` holds 6 **sample** cases (flagged
  `"draft": true`, anonymised, with placeholder metrics). Replace with real
  engagements + one hard number each. Clear client names/logos; defence stays
  anonymised.
- **Accent / type** — teal `#0F8A8A` and Space Grotesk + Inter (the recommended
  defaults) in `src/ui/tokens.css`.
- **Home district** — `weesp` is the default in `src/data/places.ts`.
- **Tailored targets** — `arnhem` is seeded as an example (with a dedication
  line). Bake the ones you actually want.
- **Twin colouring** — defaults to construction year (`bouwjaar`).
- **Ground** — plain paper plane + grid; optional aerial drape is wired via
  `Place.aerial`.

## Data & licensing

Building data © **3DBAG** (TU Delft 3D geoinformation & Kadaster), open data,
credited in the twin scene and the footer. Aerial imagery © **PDOK** where a
drape is used. No API keys anywhere in this stack.
