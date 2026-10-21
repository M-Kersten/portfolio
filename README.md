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
(one renderer) · react-router · Oxanium (headlines) / Space Grotesk / Space Mono via `@fontsource`.
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
- `/work/:slug` — deep link to a project: the camera flies to its object and
  its label opens beside it; `/work/:slug?entry` opens straight onto the book
  (the full entry). The build writes each one a page of its own, so a shared
  link previews with the project's card (`public/og/<slug>.jpg`)
- `/projects` — the collection: every project, the ten exhibits and the rest
- anything else — a closed room: "This part of the exhibition isn't open yet"
- `/cv` — the CV as a web page; `npm run cv` prints it to `public/cv.pdf`
- add `?nogl` to any URL to preview the **no-WebGL static fallback**
- OS reduced-motion is respected everywhere (states snap, no glitches)

## Where to change what

The things you're most likely to want to change, and the file they live in.

| To change… | Edit |
| --- | --- |
| A project's words, dates, client, links, tech | `src/content/cases.json` (or the CMS) |
| The hero lines, section titles and leads, career, about, contact | `src/content/site.json` (or the CMS) |
| The line under a project's film in the book | `src/content/films.ts` |
| Where a long film starts | the project's `video` link in `cases.json`, with `?t=95` on it (YouTube's "start at" link) |
| A project's film loop or voice note | drop `<slug>.mp4` in `src/assets/loops/`, `<slug>.mp3` in `src/assets/voice/` |
| A sound effect or ambient bed | `src/assets/sound/` (its README lists every name) |
| A poster or share card | `public/posters/<slug>.jpg`, then `npm run og` |
| The CV | `src/content/cv.json` / `cv.nl.json`, then `npm run cv` |
| Which projects are exhibits, and where their marker sits | `HOTSPOTS` in `src/scene/framing.ts` |
| An exhibit's camera close-up | its `view` in `HOTSPOTS` (or the dev tools' Camera tab) |
| An object's place in the model | the `usePlacement(...)` call in `src/scene/maquette/city.tsx` or `room.tsx` (or the dev tools' Objects tab) |
| The 3D stage's lighting, fog, palette, post-processing | `LOOK` in `src/scene/look.ts` (or the dev tools' Look tab) |
| The timeline's spacing | `WALL` in `src/components/timeline/layout.ts` (or the dev tools' Timeline tab) |
| Colours, type, spacing, motion for the whole site | `src/ui/tokens.css` |
| A section's styling | `src/ui/<section>.css`, named after what you see on the page |

**Wording that isn't in the CMS** sits next to the markup it belongs to:

| Where on the site | File |
| --- | --- |
| The welcome back line and the first-visit hint | `components/hero/HeroStage.tsx` |
| The exhibition guide, and the "n/10 lit" counter on its cover | `components/hero/ExhibitionGuide.tsx` |
| The label beside an exhibit ("Read the full story", "Watch the film") | `components/exhibit/Label.tsx` |
| The book ("The problem", "See also", "Ask me about it") | `components/exhibit/Book.tsx` |
| The collection's title and line | `components/pages/ProjectsPage.tsx` |
| The launch pad's panel (exhibit 11) | `components/launch/LaunchOverlay.tsx` |
| The "not open yet" page | `components/shell/NotFound.tsx` |
| The timeline's "scroll through time", "now →", "The collection" | `components/timeline/Timeline.tsx` |

**Dev tools**: in `npm run dev` a small "⚙ tune" chip sits in the bottom-left
corner. It opens one panel with four tabs (Look, Timeline, Camera, Objects)
that scrub the values in the table above live, then copy them back out as
source to paste over the originals. None of it is in the production build.

## How it's wired

```
src/
  main.tsx, app/App.tsx  entry, router, and the layout every page shares
  content/             everything written: the JSON the CMS edits (cases, site,
                       capabilities, cv) and types.ts documenting every field;
                       index.ts (typed access, dates, roles, layer colours),
                       exhibits.ts (the numbering, the walk, see also),
                       films.ts (the line under each film), media.ts (finds
                       the film loops and voice notes)
  components/
    shell/             what every page has: Header (+ Logo, SocialLinks,
                       Search, SoundToggle), Footer, SectionHead, Scramble
                       (the text decode), BootVeil, ScrollToHash, NotFound
    hero/              the maquette's page: SceneCanvas (the lazy 3D boundary
                       and its no-WebGL poster), HeroStage (the title, the
                       layer captions, the counter), ExhibitionGuide,
                       IntroCard, FocusReticle (the porthole), SoundScape
    home/              the home page's sections: HomeLayout (their order),
                       Capabilities, About, Contact, and their canvas motifs
    timeline/          the projects timeline: Timeline.tsx (the component),
                       layout.ts (where everything sits on the route), CaseCard
    exhibit/           a project, opened: Exhibit.tsx (label and book
                       together), Label.tsx, Book.tsx, parts.tsx, NodeHud (the
                       /work/:slug route), VoiceNote, Gallery
    launch/            the launch easter egg: LaunchOverlay (the pad's panel),
                       LaunchHud (the film's telemetry), AsteroidsGame (+
                       GameRocket, GameComms)
    pages/             /projects (ProjectsPage, ProjectsIndex) and /cv
  scene/
    Stage.tsx          lighting, fog, post-processing, scene root
    look.ts            the numbers behind the stage's look (LOOK)
    CameraRig.tsx      the opening dolly, the scroll journey, the fly-to
    framing.ts         layer stack, hotspots, camera tuning (plain data, no
                       three.js: the page reads it on first paint)
    views.ts           the camera framings built from it, as three.js vectors
    store.ts           the tiny store the page and the 3D share (selected,
                       visited, the cue, the launch stage, returning visitor)
    launchPlan.ts      the launch's flight plan: timeline, engines, telemetry
    maquette/          the three-layer 3D world, one file per concern:
      index.tsx        composition root: stacks the layers, culls the far one
      city.tsx         City rig: skyline, windmill, park + ARCam, the tower
      room.tsx         Room rig: desk/monitor, couch + phone, AR table, bookcase
      chip.tsx         Chip rig: board, accelerator, camera, monitor, traces
      kit.ts           loads the Blender models (public/models)
      hotspots.tsx     the floating crosshair markers
      signals.tsx      cross-layer relation cables (edit RELATIONS here)
      life.tsx         the ghost → alive life system (LifeGroup)
      presence.tsx     active-layer focus: neighbour layers rest dimmed
      materials.tsx    holographic glass + rim shader, the shared materials
      lit.tsx          the hover light and its shadows
      backdrop.tsx     dot floors, point fields, depth veil, blob shadows
      shared.tsx       palette, math helpers, useActive, fog-aware Line
      shapes.ts        the procedural geometry helpers
      launchSite.tsx   the pad: stacked piece by piece as projects wake, then
                       the launch film (stages, fire, smoke, cameras)
      launchComplex.tsx  its tower (lattice, chopsticks, ship arm) and mount
      launch.ts        the film's choreography: poses, shots, smoke, shake
      engineFire.tsx   plumes, a flame per engine, hot-staging jets
      smoke.tsx        the steam, spray and smoke puffs
      rocket.tsx       the Starship stack (Blender, scripts/models)
  lib/                 small shared helpers: media.ts (phone, reduced motion,
                       touch), page.ts (tab title, scroll lock, Escape, stored
                       settings), sound.ts (the sound engine), youtube.ts,
                       motion.ts (the motion numbers for code), useReveal,
                       useFocusTrap, useSheetDrag (the label's touch handling),
                       contours.ts (the timeline's canyon map)
  dev/                 the dev tools (dev only) and the tuning store they share
                       with the values above
  ui/                  tokens.css (design tokens) + one stylesheet per part of
                       the page (global.css imports them in order)
public/
  posters/<slug>.jpg   timeline/card artwork per project
  og/<slug>.jpg        each project's share card (npm run og)
  textures/            optional real screenshots (room-screen / room-phone /
                       zwijsen-book): objects fall back to procedural looks
  models/              the Blender models (built from scripts/models) and the
                       park's binoculars
  logos/               employer marks for the timeline tooltips
  profile/1..5.png     the About portrait frames
```

**The life system** (`life.tsx`): each hotspot object's materials are
snapshotted and lerped between a grey wireframe ghost and their authored
state. Self-animating materials opt out via `userData.lifeSkip` and blend
their own ghost→alive keyed on the same store state. Colour policy lives in
`src/ui/tokens.css`: cyan = interactive + City, coral = Room, lime = Chip
(and `LAYER_HEX` in `src/content/index.ts` for canvas and 3D).

## Editing guide

**Copy & content** — everything written lives in `src/content/`:

- `site.json` — name, hero lines, section intros, career timeline (dates are
  `YYYY-MM`), about facts, contact links.
- `cases.json` — one entry per project. `year` accepts `"2024"` (centres on
  the year) or `"2024-09"` (pins the month on the timeline). `follows` names
  the earlier case this one builds on — it renders under "See also" in the
  book, both ways. Drop a matching poster in `public/posters/<slug>.jpg`, then
  run `npm run og` to redraw the share cards (it uses your installed Chrome,
  or `CHROME_PATH`) and commit them.
- **The exhibits** — the ten projects with an object in the maquette
  (`HOTSPOTS` in `src/scene/framing.ts`) are numbered 01–10, city then room
  then chip; every other project is "in the collection". Exhibit 11 is the
  next launch on the pad.
- **Film loops** — a silent 6–10 s clip per project in
  `src/assets/loops/<slug>.mp4` plays at the top of its label (the README
  there has the format). Without one, the project's own YouTube film plays
  itself there, silent, on a short loop; "Watch the film" plays it with sound.
  **Start time:** for a long film, paste YouTube's "start at" link as the
  project's `video` (`https://youtu.be/mjzZSOB-jAM?t=95`) and both the preview
  and the film begin on that second.
- **What the film shows** — the line under each project's film in the book
  lives in `src/content/films.ts` (not cases.json: the CMS drops keys it
  doesn't know). The current lines are drafts from each film's YouTube title
  and poster; rewrite them in your own words.
- **Voice notes** — record a short clip about a project and save it as
  `src/assets/voice/<slug>.mp3` (or `.m4a`, `.ogg`, `.webm`), named after
  the case's `slug`. Its audio tour then appears on that project's label
  and in its book; projects without a clip show none. `next-launch.mp3` is
  exhibit 11's (the countdown). Mono at 64–96 kbps is plenty for a voice.
- **Sound** — effects and ambient are recordings in `src/assets/sound/`, one
  file per event; its README lists every name (wake notes, popups, the
  launch, the game, the ambient beds). A name with no file is silent, so add
  them one at a time. The engine is `src/lib/sound.ts`; sound is off until a
  visitor turns it on in the header.
- `capabilities.json` — the three band columns.
- `cv.json` — the CV-only extras (tagline, profile paragraph, photo,
  location, phone, links, stack, education, certificates, languages,
  interests). The work history itself — including each company's black
  logo, pulled from `career[].logo` — comes from `site.json`, so the CV
  always matches the site. After editing, run **`npm run cv`**: it rebuilds
  and prints the full-bleed `/cv` to `public/cv.pdf` using your installed
  Chrome (`CHROME_PATH=` overrides), flowing to as many A4 pages as the
  content needs (entries never split across a page break). The "CV (PDF)"
  button in Contact serves the committed PDF.
- `types.ts` documents every field.

**Adding a project to the 3D scene**: add the case to `cases.json`, then add a
hotspot for it in `src/scene/framing.ts` (`HOTSPOTS` — positions are local to
the layer), and give it an object in that layer's rig
(`scene/maquette/city|room|chip.tsx`). Wrap the object in
`<LifeGroup slug="...">` so it ghosts until visited. Link related projects in
`scene/maquette/signals.tsx` (`RELATIONS`).

**Moving things in 3D**: run `npm run dev` and open the dev tools (the "⚙ tune"
chip, bottom left). Objects drags the movable objects about, Camera tunes the
close-up of whichever exhibit is open; both copy the values to paste back
into the source. An object anchored to a hotspot also needs that hotspot's
`anchor` in `framing.ts` moved to match.

**The Blender models** (the chip layer's parts, and the city's tower, its six
blocks and the windmill) are built from scripts: `scripts/models/README.md`
covers rebuilding everything in `public/models` except the binoculars, and the
rules the parts follow. The parts are looked up by name in `kit.ts`. The blocks are modelled at
the sizes CityRig's seeded plan gives them, so changing that plan means
rebuilding `blocks.glb`.

**Look & feel**: start at `src/ui/tokens.css` (colours, the nine-step type
scale, the display-voice tokens, the motion tokens, spacing, container width —
the whole grid derives from `--container`). A new headline face is a change to
`--font-display` and its `--display-*` settings there, and nowhere else.
Section styling lives in the `src/ui/*.css` file named after the section;
`DESIGN.md` has the rules they follow.

**Camera & layout of the 3D stack**: `src/scene/framing.ts` — layer heights,
scales, the scroll journey's bands, and the three camera framings (home,
journey, node close-up).

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
