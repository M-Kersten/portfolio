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

- `/` — home (hero maquette, capabilities, projects timeline, about, contact);
  a shared link previews with the hero itself (`public/og.jpg`, rendered by
  `npm run og`)
- `/work/:slug` — deep link to a project: the camera flies to its object and
  its label opens beside it; `/work/:slug?entry` opens straight onto the book
  (the full entry). The build writes each one a page of its own, so a shared
  link previews with the project's card (`public/og/<slug>.jpg`)
- `/projects` — the collection: every project, the ten on display in the
  model and the rest from the depot
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
| A poster or share card | `public/posters/<slug>.jpg`, then `npm run og` (or `npm run og -- projects`) |
| The site's own share card (the hero, rendered) | change the hero or the model, then `npm run og -- site`; what's left out of it and how lit the model is: `LEAVE_OUT` and `SEEN` in `scripts/gen-og.mjs` |
| The CV | `src/content/cv.json` / `cv.nl.json`, then `npm run cv` |
| The counters (the flights visitors have flown, the number on each visitor's ticket, the visitors who saw all ten), and keeping their free Supabase project from pausing | `docs/counters.md` (setup, SQL, what to do if they've gone dark); the client is `src/lib/counters.ts`, `launches.ts` and `visit.ts`; the daily keep-awake is `.github/workflows/keep-counter-awake.yml` |
| Which projects are exhibits, and what each one's marker points at | `HOTSPOTS` in `src/scene/framing.ts` (its `anchor`; the marker floats straight above it at its floor's `MARKER_Y`) |
| An exhibit's camera close-up | its `view` in `HOTSPOTS` (or the dev tools' Camera tab) |
| An object's place in the model | the `usePlacement(...)` call in `src/scene/maquette/city.tsx` or `room.tsx` (or the dev tools' Objects tab) |
| What an exhibit does with the cursor in its close-up | the constants next to its object (e.g. `CAM_TRACK_*`, `CAM_CUBES` and `TILE_*` in `chip.tsx`, `BOOST*` and `DOUBLE_TAKE` in `room.tsx`, `WIND_*`, `GUST*` and `SHOT` in `city.tsx`) |
| The camera's anchors: how long a cube is held to anchor it, the merge | `ANCHOR_HOLD` and `MERGE_*` in `src/scene/maquette/chip.tsx` |
| Popcore's bin: where it stands, how true a shot flies, the fall and what it sets off (the slow-motion beat, the confetti); the couch's shape the balls keep to | `BIN`, `BIN_TIP`, `SHOT_*`, `FLOOR_BACK`, `HIT_STOP` and `CONFETTI`; `CUSHION`, `ARM`, `BACK` and `FRAME_BACK` in `src/scene/maquette/room.tsx` |
| The windmill's power for the tower: how fast the sails turn, how hard to blow, how fast it fills | `SPIN_REST`, `GUST*` and `POWER_*` in `src/scene/maquette/city.tsx` (the cable and its route on the road: `MillLine`) |
| The Big Dipper beside the windmill: where it hangs, its size, and the beats of its reveal (the stars one by one, the line drawn through them) | `DIPPER_AT`, `DIPPER_SCALE`, `DIPPER_TRACE` and `STARS` in `src/scene/maquette/city.tsx` |
| ARCam's scavenger hunt: the creatures and their names, where each hides and how it comes out, the pines, the clearing where the found ones sit, how long one's out, the lock, the "captured" bubble, the group photo | `CREATURES`, `STYLE`, `MOVES`, `PEEK`, `PERCH`, `SWIM`, `PINES`, `SEATS`, `TELL`, `UP`, `GAP`, `LOCK`, `SAID` and `FINALE` in `src/scene/maquette/critters.tsx`; how they look: `creatureMat()` there (the bubble's look: `.critter-said` in `src/ui/hotspots.css`; their models and props: `scripts/models/build_creatures.py`; a pine's rustle: `ParkTree` in `city.tsx`) |
| The die's game of Snake: speed, when the chip takes over, the crash and the score | `SNAKE_*` in `src/scene/maquette/chip.tsx`; the rules (board size, steering, the chip's player) in `snake.ts` |
| The Virtuele Brigade's chase, room by room: the four rooms (their doors, what's in them, the hiding places and where the two stand), the stories (who runs, from where, and where they're cornered), how fast the team walks and the suspect runs, how long the view takes to pan; how long the cursor rests to send them on; the second player's log-in and how see-through it stays | `ROOMS`, `STORIES`, `WALK`, `RUN`, `PAN` and `LOOK` in `src/scene/maquette/terminal.ts`; `INK` and `SCALE` in `terminalArt.ts`; `DROP` in `scenario.tsx`; `LOGIN` and `REMOTE` in `room.tsx` |
| Crown tag on the Lightship Drive table: how the cars handle (top speeds, turning, how much they slide, the jump), the rival's chase and getaway and how it tires, the spin-out and getaway after the crown changes hands; the spectator screen and the bubble; the close-up's camera | `YOU`, `CHASE`, `FLEE`, `TIRE`, `TURN`, `TURN_YOU`, `GRIP`, `GRIP_YOU`, `STUN`, `BURST` and `LEAD` in `src/scene/maquette/raceTag.ts`; `TAG_WORLD`, `TAG_STEP`, `REJOIN`, `SCREEN` and `drawBoard` in `room.tsx`; the `lightship-drive` view in `src/scene/framing.ts`; playing it at 1× (`GAME_AT_1X`) in `src/components/hero/CanvasScene.tsx` |
| The Zwijsen book: its size and its pages', where it stands on the shelf, where and how it's held up open (and how close on a phone), and its cover | `BOOK_*`, `PAGE_*`, `BOOK_REST`, `BOOK_OPEN`, `BOOK_HOLD` and `BOOK_NEAR` in `src/scene/maquette/room.tsx` (OpenBook), with `ZW_*` in `scripts/models/build_books.py` to match; the cover is `drawCover` in `src/scene/maquette/bookPages.ts` |
| The Zwijsen book's seek-and-find: its spreads (each a list of cut-paper pieces), their words, the paper's cuts and where Mouse hides; the opening, the lens, how long to rest on Mouse, Mouse popping out, the page turning, the clap at the end, the lens finding Mouse by itself on a touch screen | `SPREADS`, `SKY`/`DARK` and `LAYER_CUT` in `src/scene/maquette/bookPages.ts`; `OPEN`, `LENS`, `FOUND`, `TURN`, `SHUT` and `AUTO` in `room.tsx` (OpenBook) |
| The room's floor lamp: where it and the plant stand, and how it switches on (its flicker, its fade, the cone of light and where it lands). It lights with whichever exhibit stands nearest it | `Room.Floor lamp` and `Room.Plant` in `RoomRig`, and `LAMP` in `src/scene/maquette/room.tsx` (FloorLamp) |
| The mouse that lives behind the Zwijsen book: its run of the room (where it stops, for how long, where it rears up) and how it runs (its dash, how hard it sets off and stops, how often it freezes) | the route (`mouse`) in `RoomRig` and `MOUSE` in `src/scene/maquette/room.tsx` (RoomMouse) |
| The rocket game on a touch screen and a small one: the stick (its travel, when it turns the vehicle and when it burns), the aim assist; how the field scales to the screen | `TOUCH` and `K`/`SPD`/`small` (in `fit`) in `src/components/launch/AsteroidsGame.tsx`; the drawn stick and button: `.ast__pad` in `src/ui/launch.css` |
| How a close-up reaction moves: its wind-up, overshoot and settle | the curves in `src/lib/ease.ts` and the springs in `src/lib/spring.ts` (`spring` arrives without passing, `wobble` swings past and back) |
| The Philips heart: its shape and where its vessels run | `LOBES`, `TRUNK` and `BRANCHES` (with each narrowing's place) in `src/scene/maquette/heartShape.ts` |
| How the heart beats, and how the catheter steers and treats a narrowing | `BEAT`, `FLOW`, `CATH` and `TREAT` in `src/scene/maquette/heart.tsx` |
| The city's underground power: where its cables run, how a pulse travels, when a block lights | `gridPlan`, `PowerGrid`, the pulse's beats `P_*` and `COMET`, and `TRAFO_GLOW` in `src/scene/maquette/city.tsx` |
| The 3D stage's lighting, fog, palette, post-processing | `LOOK` in `src/scene/look.ts` (or the dev tools' Look tab) |
| The timeline's spacing | `WALL` in `src/components/timeline/layout.ts` (or the dev tools' Timeline tab) |
| Colours, type, spacing, motion for the whole site | `src/ui/tokens.css` |
| A section's styling | `src/ui/<section>.css`, named after what you see on the page |

**Wording that isn't in the CMS** sits next to the markup it belongs to:

| Where on the site | File |
| --- | --- |
| The welcome back line | `components/hero/HeroStage.tsx` |
| The exhibition guide, and the "4 of 10 seen" count on the face of its ticket with its note ("Launch at ten", "Two more to launch"), held back until the second exhibit is seen | `components/hero/ExhibitionGuide.tsx` (`tally`, `ahead`, `HINT_AT`) |
| How the pad gets ready as the count climbs (which piece arrives when, the beacon, the vapour) | `BUILD` and the frame loop in `src/scene/maquette/launchSite.tsx` |
| The exhibition's name, "On display" / "In the depot" | `content/exhibits.ts` |
| The label beside an exhibit ("Read the full story", "Watch the film") | `components/exhibit/Label.tsx` |
| The book ("The problem", "See also", "Ask me about it") | `components/exhibit/Book.tsx` |
| The collection's title and line (its counts come from the content) | `components/pages/ProjectsPage.tsx` |
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
                       and its no-WebGL poster), HeroStage (the title
                       wall, the guide's ticket), ExhibitionGuide,
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
    warm.ts            compiling shaders ahead of their first draw (for the
                       composer's buffer, which is what the scene draws into)
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
      chip.tsx         Chip rig: board, accelerator, camera, heart projector, traces
      heart.tsx        the Philips heart: the hologram, its beat, the catheter
      heartShape.ts    the heart's shape and the paths of its vessels
      snake.ts         Snake as the AI die plays it: the board, steering by
                       the cursor, the chip's own player, the score's figures
                       (drawn by DieSnake in chip.tsx)
      scenario.tsx     the Virtuele Brigade's chase, run from the editor:
                       the monitor's view of the terminal, what the cursor
                       rests on, and what it tells the two in VR (room.tsx
                       VRPlayers)
      raceTag.ts       crown tag on the Lightship Drive table: the cars
                       driving free on the mat, the kickers, the rival's
                       mind, the crown changing hands (drawn by room.tsx
                       CoffeeTableAR)
      terminal.ts      the chase through the terminal, room by room (the
                       rooms, their doors and hiding places, the stories, the
                       way round what's in the way), apart from how it's drawn
      terminalArt.ts   the terminal drawn on a canvas: the rooms from above,
                       and each frame the two, the suspect and what to point at
      bookPages.ts     the Zwijsen book's four spreads (Mouse's day out),
                       drawn on a canvas: each one's print and its AR layer,
                       and where Mouse hides (the seek-and-find is OpenBook
                       in room.tsx)
      critters.tsx     ARCam's scavenger hunt: the park's pines, the
                       creatures hiding behind them and coming out, the lock
                       on one, the "captured" bubble, the group photo and its
                       print (the viewer that takes them is in city.tsx)
      kit.ts           loads the Blender models (public/models)
      hotspots.tsx     the floating crosshair markers
      signals.tsx      cross-layer relation cables (edit RELATIONS here)
      life.tsx         the ghost → alive life system (LifeGroup)
      presence.tsx     active-layer focus: neighbour layers rest dimmed (self-
                       animating materials too, faded at draw time)
      materials.tsx    holographic glass + rim shader, the shared materials
      lit.tsx          the hover light and its shadows
      closeup.ts       the close-up's cursor, read from the window (the open
                       exhibit covers the canvas), and its helpers; each
                       exhibit's reaction lives with its object (the
                       camera's in chip.tsx, …)
      backdrop.tsx     dot floors, point fields, depth veil, blob shadows
      shared.tsx       palette, math helpers, useActive, fog-aware Line
      shapes.ts        the procedural geometry helpers
      launchSite.tsx   the pad: stacked piece by piece as projects wake, then
                       the launch film (stages, fire, smoke, cameras); its
                       shaders compile while the page is idle (usePrewarm)
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
                       contours.ts (the timeline's canyon map), spring.ts
                       (the camera's spring, and wobble, which overshoots),
                       ease.ts (easing curves for the close-ups' beats)
  dev/                 the dev tools (dev only) and the tuning store they share
                       with the values above
  ui/                  tokens.css (design tokens) + one stylesheet per part of
                       the page (global.css imports them in order)
public/
  posters/<slug>.jpg   timeline/card artwork per project
  og.jpg               the site's share card: the hero, rendered (npm run og)
  og/<slug>.jpg        each project's share card (npm run og)
  textures/            optional real screenshots (room-screen / room-phone):
                       objects fall back to procedural looks
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

**Every browser** — there's no autoprefixer, so the stylesheets carry what
Safari and older browsers need themselves. When you add CSS:

- `backdrop-filter`, `user-select` and `backface-visibility` get a
  `-webkit-` twin on the line above (Safari before 18 needs it).
- An `svh` size gets a `vh` line above it, for browsers without `svh`.
- A gutter that lines up with `.container` is worked out from
  `var(--page-w)`, not `100vw`: `100vw` counts a Windows or Linux scroll bar
  as page, which puts the line half a bar off (`--page-w` takes it off; see
  `trackScrollbar` in `src/lib/page.ts`).
- A hover that moves something sits in `@media (hover: hover)`, or a tap on a
  phone leaves it moved.
- Check the narrowest phone (320px) for sideways scroll.

## Editing guide

**Copy & content** — everything written lives in `src/content/`:

- `site.json` — name, hero lines, section intros, career timeline (dates are
  `YYYY-MM`), about facts, contact links.
- `cases.json` — one entry per project. `year` accepts `"2024"` (centres on
  the year) or `"2024-09"` (pins the month on the timeline). `follows` names
  the earlier case this one builds on — it renders under "See also" in the
  book, both ways. Drop a matching poster in `public/posters/<slug>.jpg`, then
  run `npm run og -- projects` to redraw the share cards (it uses your
  installed Chrome, or `CHROME_PATH`) and commit them.
- **The exhibits** — the ten projects with an object in the maquette
  (`HOTSPOTS` in `src/scene/framing.ts`) are numbered 01–10, city then room
  then chip; every other project is in the depot. Exhibit 11 is the next
  launch on the pad. A project's `credit` says who it was for, or where it
  was made ("For Niantic, at Wonderment"), on its label next to the year;
  without one the label shows its client.
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
hotspot for it in `src/scene/framing.ts` (`HOTSPOTS` — its `anchor` is the
point on the object, local to the layer; the marker stands straight above it on
the floor's marker line, `MARKER_Y`), and give it an object in that layer's rig
(`scene/maquette/city|room|chip.tsx`). Seen from the overview, each exhibit on a
floor wants a column of its own across the screen, or the names on the marker
line run into each other. Wrap the object in
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

**Camera & layout of the 3D stack**: `src/scene/framing.ts` — layer heights
(`LAYER_Y`), scales, each floor's marker height (`MARKER_Y`), the scroll
journey's bands, and the three camera framings (home, journey, node close-up).
Each journey step has its own aim, distance and height (`CAMERA.stepAimX` /
`stepZoom` / `stepRise`, and the `portraitStep…` set for phones).

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
