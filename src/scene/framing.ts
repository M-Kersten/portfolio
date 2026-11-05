// Maquette geometry and the camera's tuning live here as pure data/math so the
// CameraRig stays declarative and the hotspots can be authored next to the
// layers they sit on (§4).
//
// No three.js in this file: the page shell (the hero, the scene store) reads
// the hotspots on first paint, and anything this imports is on the path to that
// paint. The framings built from it as three.js vectors live in views.ts, with
// the rest of the WebGL stack. (scripts/check-content.mjs and the CMS read the
// hotspot slugs straight out of this file, so HOTSPOTS stays here.)

export type LayerId = 'chip' | 'room' | 'city';

// A scale ladder, bottom → top (small → large): the chip, the room, the city.
export const MAQUETTE_LAYERS: LayerId[] = ['chip', 'room', 'city'];

/** How high each floor stands. Far enough apart that at each step of the
 *  journey the floors above and below show only as a thin edge of the frame:
 *  enough to say there's more up or down, never enough to compete with the
 *  floor you're on. (At 1.32 apart they each took about a third of it.) */
export const LAYER_Y: Record<LayerId, number> = { city: 2.0, room: 0, chip: -2.0 };
// Sized so the scale ladder reads on the way down: City largest, Chip smallest.
// At rest each step is framed to the same share of the screen (CAMERA.stepZoom),
// so the chip doesn't sit small in an empty frame.
export const LAYER_SCALE: Record<LayerId, number> = { city: 1.15, room: 1.0, chip: 0.82 };

/** The one height every marker on a floor floats at (layer-local), clear of the
 *  tallest thing on it, so a floor's markers read as one line with their names
 *  in a row. Each stands straight above its anchor (see HOTSPOTS). */
export const MARKER_Y: Record<LayerId, number> = { city: 1.15, room: 1.15, chip: 0.66 };

/** The scroll journey down the hero: City at the top (step 0), Room in the
 *  middle (1), Chip at the bottom (2). */
export const LAYER_STEP: Record<LayerId, number> = { city: 0, room: 1, chip: 2 };
/** Which step a point in the hero's scroll travel (0 → 1) is on. City and Chip
 *  rest at the very top and bottom, easy to land on; Room is the one you stop
 *  in the middle to hold, so it gets the widest band: the middle half. */
export const stepAt = (p: number) => (p >= 0.75 ? 2 : p >= 0.25 ? 1 : 0);
/** The middle of each step's band, where closing an exhibit lands you. */
export const STEP_CENTRE = [0.125, 0.5, 0.875];

export interface Hotspot {
  slug: string;
  layer: LayerId;
  /** The point ON the object (local to the layer group) its close-up frames
   *  and its cables run to. The marker stands straight above it. */
  anchor: [number, number, number];
  /** How high the object's top is under the marker (layer-local): the leader
   *  drops to it and its ring sits on it, so the line lands on the object
   *  rather than ending in the air beside it or inside it. Measured by casting
   *  straight down from the marker into the layer. */
  foot: number;
  /** The marker itself: straight above the anchor, at its floor's marker
   *  height (MARKER_Y). Worked out from the anchor, never written by hand. */
  position: [number, number, number];
  /** Per-hotspot close-up framing. Any field left out falls back to the global
   *  CAMERA defaults — so you only override what a given object needs. Tune it
   *  live in the dev tools' Camera tab (open an exhibit in `npm run dev`) and
   *  paste the `view: { … }` it copies right here. */
  view?: HotspotView;
}

/** Per-hotspot overrides for the node close-up (see hotspotView + CameraRig). */
export interface HotspotView {
  /** Camera offset from the object, world units [right, up, back]. Smaller =
   *  tighter/closer; this sets both the zoom distance and the three-quarter angle. */
  offset?: [number, number, number];
  /** How far below the object the camera aims — raise it to push the object
   *  higher up the frame (clear of the HUD). */
  aimDown?: number;
  /** Degrees the lens widens on this close-up (the perspective push). */
  fovZoom?: number;
  /** Portrait only: scales the close-up's distance (1 = as computed, above 1
   *  backs off). For the odd object whose desktop framing comes out too tight
   *  through a phone's narrow frame — a tall shelf, say. */
  mobileZoom?: number;
}

// Each hotspot marks one object: a crosshair on its floor's marker line, with a
// leader dropping straight down onto the object's top (foot). Anchors are
// local to the layer group (placed at LAYER_Y and scaled). The exhibits on a
// floor are laid out so that, seen from the overview, they stand in their own
// columns across the screen — that's what keeps the names on the line apart,
// mostly: where two names still meet (a column is narrower than the longer
// names, on a tablet most of all), one of them moves up a row (useNameRows in
// maquette/hotspots.tsx).
const SPOTS: Omit<Hotspot, 'position'>[] = [
  // Chip — the die in the middle, the heart and the camera on opposite corner
  // slots (chip.tsx CORNER): three even columns. Move a slot and its anchor
  // here has to follow.
  { slug: 'amsterdam-ai', layer: 'chip', anchor: [0, 0.16, 0], foot: 0.125, view: { offset: [0.35, 1.75, 1.85], aimDown: 0.62, fovZoom: 14 } }, // the die
  { slug: 'custom-ar-framework', layer: 'chip', anchor: [0.75, 0, -0.75], foot: 0.33, view: { offset: [2.2, 0.8, 1.8], aimDown: 0.3, fovZoom: -2.5 } }, // the CV camera (back-right slot)
  { slug: 'philips-medical-xr', layer: 'chip', anchor: [-0.75, 0.16, 0.75], foot: 0.47, view: { offset: [0.36, 0.4, 0.9], aimDown: 0.2, fovZoom: 19.5 } }, // the heart projector (front-left slot); the anchor sits in the beam under the heart, clear of where the catheter works
  // Room — four exhibits on a diagonal from the front-left to the back-right,
  // so from the overview each has its own column: desk, table, couch, shelf
  // (room.tsx RoomRig)
  { slug: 'virtuele-brigade', layer: 'room', anchor: [-1.42, 0.65, 0.26], foot: 0.79, view: { offset: [1.87, 0.2, 0.18], aimDown: 0.45, fovZoom: 0.5 } }, // the monitor's screen (room.tsx Desk, in the desk group)
  { slug: 'popcore-games', layer: 'room', anchor: [0.23, 0.22, -0.34], foot: 0.21, view: { offset: [0.6, 0.55, 0.95], aimDown: 0.05, fovZoom: 19.5 } }, // phone on the couch
  { slug: 'lightship-drive', layer: 'room', anchor: [0, 0.2, 0.68], foot: 0.19, view: { offset: [0.95, 0.5, 0.75], aimDown: 0.25, fovZoom: 30 } }, // the AR race table
  { slug: 'zwijsen-ar-books', layer: 'room', anchor: [0.92, 0.4, -1.07], foot: 0.95, view: { offset: [-0.1, 0.9, 1.35], aimDown: 0.35, fovZoom: 16, mobileZoom: 1.45 } }, // the orange book on the shelf; the marker stands on the bookcase's top
  // City — GIS / location work
  { slug: 'arcam', layer: 'city', anchor: [1.2, 0.3, 0.11], foot: 0.36, view: { offset: [1.51, 0.8, 1.72], aimDown: 0.3, fovZoom: 17 } }, // the park's AR viewer (city.tsx Park → Binoculars)
  { slug: 'alliander-hololens', layer: 'city', anchor: [0, 0.77, 0], foot: 1.03, view: { offset: [0.75, -0.1, 3.3], aimDown: 1.15, fovZoom: 26 } }, // the skyscraper (skyline peak)
  { slug: 'dtt-amsterdam', layer: 'city', anchor: [-1.2, 0.58, -0.06], foot: 0.75, view: { offset: [-2, -0.2, 3.5], aimDown: 0.6, fovZoom: 19 } }, // the windmill
];
export const HOTSPOTS: Hotspot[] = SPOTS.map((h) => ({ ...h, position: [h.anchor[0], MARKER_Y[h.layer], h.anchor[2]] }));

type Vec3 = [number, number, number];

// ============================================================================
// CAMERA TUNING — the knobs for how the maquette is framed. Edit these freely,
// then `npm run dev` (live) or `npm run build`. Everything about the zoom, the
// lens and the layer spacing lives in this one object so the feel is easy to
// dial in.
//
// How the phone view stays framed: instead of a hard media-query "zoom out",
// the rig adapts continuously to the viewport's aspect — it widens the lens
// (fitFov) and eases the camera back a little (fitScale), so the maquette stays
// large and gains depth rather than shrinking.
// ============================================================================
export const CAMERA = {
  // Overview framing — the scroll journey down the stack. The camera sits at
  // `centred-layer + overviewOffset`, read as [right, up, back] in world units.
  // Scale all three UP together to dolly out (smaller maquette), DOWN to zoom in.
  overviewOffset: [2.8, 1.15, 3.8] as Vec3,
  // How far ABOVE the layer the overview looks: drops the floor in focus to the
  // middle of the frame, so the one below falls away toward the bottom edge.
  overviewLift: 0.34,
  // Per journey step (City, Room, Chip): how far to the side of the floor the
  // overview looks, and how far out it stands (× overviewOffset). Only the City
  // has the hero title beside it: looking a little LEFT pushes it right on
  // screen, clear of the title. The Room and the Chip centre. The Chip's board
  // is the smallest floor, so its step comes closer, to the share of the screen
  // the others take — the ladder still reads on the way down.
  stepAimX: [-0.34, 0, 0] as [number, number, number],
  stepZoom: [1, 1, 0.72] as [number, number, number],
  // …and how far the whole framing rises (camera and aim together, so the angle
  // holds), which sets the floor lower in the frame. The City's rises: its top
  // lines up with the hero title's, and the room under it sinks to an edge
  // behind the caption and the guide (the room's tall furniture otherwise
  // reaches up into the frame from below).
  stepRise: [0.28, 0, 0] as [number, number, number],

  // ---- Portrait (phones) ----
  // On a phone the title sits ABOVE the model rather than beside it, and the
  // frame is tall and narrow, so the overview gets a framing of its own. Every
  // layer is laid out wider than it is deep — the city runs windmill → tower →
  // park along x — so seen from the desktop's angle it is a long band that only
  // fits across a phone by shrinking until it's a strip in the middle of the
  // screen. So the camera comes round (60° off the front, against the desktop's
  // 36°) and up (34°, against 14°): the long axis turns into the screen, where
  // a tall frame has room for it, and the plate opens out instead of lying flat.
  // That fits the layer at a closer distance (maxFit) with every crosshair on
  // screen. Aimed at the middle (nothing to clear on the left) and a little
  // above the layer, so it sits under the title. Blended in between the two
  // aspects below (portraitMix), so a tablet or a narrow window lands in
  // between rather than on a breakpoint.
  portraitOffset: [3.3, 2.57, 1.91] as Vec3, // 60° round, 34° up, 4.6 out
  portraitLift: 0.3,
  // per step, as stepAimX / stepZoom: each floor fitted to the screen's width,
  // nothing cut off at the edges
  portraitStepAimX: [0.1, 0.1, 0.1] as [number, number, number],
  portraitStepZoom: [1.1, 1.1, 1] as [number, number, number],
  portraitStepRise: [0, 0, 0] as [number, number, number],
  portraitFrom: 1.0, // width:height where the portrait framing starts to blend in…
  portraitTo: 0.62, // …and where it has fully taken over
  // Every phone held upright gets the same framing (the lens and the distance
  // stop changing below portraitTo), so the City's top marker sits at the same
  // share of the screen's height on each, but the hero title above it is the
  // same height in pixels: on a shorter screen — most phones once a browser's
  // bars have taken their share — it reaches further down. So on the City step
  // the framing rises by up to this much more (as portraitStepRise), from none
  // on a tall phone (portraitShortFrom) to all of it on a short one
  // (portraitShortTo), and gone again by the time the screen is a tablet's.
  portraitShortRise: 0.4,
  portraitShortFrom: 0.47,
  portraitShortTo: 0.6,

  // Close-up framing when a project node is opened. Shorter = tighter on the node.
  nodeOffset: [1.55, 1.15, 2.55] as Vec3,
  // How far below the node the camera aims, in world units. RAISE this to push
  // the selected object higher up the frame, clear above the HUD drawer.
  nodeAimDown: 0.62,

  // The lens — vertical field of view, in degrees.
  baseFov: 42, // on a wide desktop
  fovMax: 62, // widen up to this as the screen gets narrow/tall (more depth)
  portraitFovMax: 56, // …and on a portrait screen, where the turned framing needs less
  fovRamp: 0.5, // how eagerly it widens as the screen narrows (higher = sooner)

  // Mobile fit. `baseAspect` is the width:height the numbers above are tuned for
  // (treated as "desktop" at/above it). As the screen narrows the camera also
  // eases back by up to `maxFit`× — RAISE maxFit to zoom OUT more on a phone.
  baseAspect: 1.6,
  maxFit: 1.8,
  portraitMaxFit: 1.4, // the portrait framing fits closer (see portraitOffset)
  // How much of that pull-back a node close-up takes (0 none … 1 all of it).
  // The overview has to fit a whole layer across a narrow screen; a close-up
  // only has to fit one object in the porthole, and taking the full pull-back
  // made every object on a phone a third of its desktop size.
  nodeFit: 0.25,

  // Layer spacing on tall screens. `gapMax` is how much further apart the three
  // layers spread on a phone; `gapRamp` is how fast they spread as it narrows.
  gapMax: 1.5,
  gapRamp: 0.28,

  // ---- Cinematic motion (driven per-frame in CameraRig) ----
  // Zooming into a node WIDENS the lens (see fovZoom) as the camera dollies in —
  // an exaggerated-perspective push. Then, once it has arrived, a slow "pan"
  // eases in and drifts the camera around the object. All of this is tweakable
  // and all of it is skipped under prefers-reduced-motion.
  nodeOrbitAmp: 0.12, // how far the pan swings around the node (radians, ~7°)
  nodeOrbitSpeed: 0.3, // pan speed (~21s per full left→right→left cycle)
  nodeOrbitBob: 0.03, // slight vertical drift paired with the pan (world units)
  nodeOrbitDelay: 0.7, // seconds to wait after selecting before the pan begins
  nodeOrbitRamp: 1.6, // seconds over which the pan eases up to full amplitude
  idleSwayAmp: 0.07, // the overview idle sway (unchanged feel)
  idleSwaySpeed: 0.25,
  // The lens breathes with the zoom: on a node close-up the FOV eases WIDER by
  // this many degrees (paired with the dolly-in — an exaggerated-perspective
  // push). The camera pulls in to match so the node keeps its framing whatever
  // you set here. `fovLerp` = how fast it settles.
  fovZoom: 8,
  fovLerp: 2.2, // (the launch's lens; the maquette's rides `glide`)
  // How the camera travels between framings (the scroll journey's layers, a
  // node's close-up and back): a critically damped spring, so it leaves from
  // rest, never overshoots, and carries its speed through a change of mind
  // (scrolling on mid-move). The seconds it's tuned by: ~95% of the way in 2.4×
  // this. The lens and the porthole's slide ride the same spring, so the
  // framing and the ring stay together on the way in.
  glide: 0.37,
};

// The launch easter egg's camera on the pad (see CameraRig's launch branch).
// The rig aims at the rocket's world position (launchTrack, in views.ts) and
// stands off from it by this much; from ignition on, the flight's own shots
// take over (maquette/launch.ts).
export const LAUNCH = {
  padOffset: [1.15, 0.55, 1.9] as Vec3, // three-quarter view of the pad
  padAim: 0.1, // aim this far below the rocket's centre (frames it high)
  fovZoom: 10, // the lens widens a touch for the pad/countdown drama
};

/** How far into the portrait framing a viewport is: 0 at portraitFrom and
 *  wider, 1 at portraitTo and narrower, eased in between. */
export function portraitMix(aspect: number): number {
  const t = Math.min(Math.max((CAMERA.portraitFrom - aspect) / (CAMERA.portraitFrom - CAMERA.portraitTo), 0), 1);
  return t * t * (3 - 2 * t);
}

const mixed = (a: number, b: number, aspect: number) => a + (b - a) * portraitMix(aspect);

/** How much further the City's overview rises on a short phone screen (see
 *  CAMERA.portraitShortRise): up from portraitShortFrom to portraitShortTo,
 *  held to portraitTo, then gone by 0.68, before a tablet's aspect. */
export function shortRise(aspect: number): number {
  const ramp = (a: number, b: number) => Math.min(Math.max((aspect - a) / (b - a), 0), 1);
  return CAMERA.portraitShortRise * ramp(CAMERA.portraitShortFrom, CAMERA.portraitShortTo) * ramp(0.68, CAMERA.portraitTo);
}

/** Modest pull-back for narrow/tall viewports (paired with fitFov). 1 on desktop. */
export function fitScale(aspect: number): number {
  return Math.min(Math.max(CAMERA.baseAspect / aspect, 1), mixed(CAMERA.maxFit, CAMERA.portraitMaxFit, aspect));
}

/** Vertical FOV for the viewport aspect: the authored FOV on desktop, widening
 *  toward CAMERA.fovMax as the frame narrows so the maquette's width fits with
 *  the camera kept close (a bigger subject + more depth than retreating). */
export function fitFov(aspect: number): number {
  const f = CAMERA.baseFov * Math.pow(CAMERA.baseAspect / aspect, CAMERA.fovRamp);
  return Math.min(Math.max(f, CAMERA.baseFov), mixed(CAMERA.fovMax, CAMERA.portraitFovMax, aspect));
}

/** Vertical spacing multiplier between the three layers. 1 on desktop, growing
 *  toward CAMERA.gapMax as the screen turns tall/narrow so the tiers read as
 *  distinct. Applied identically to the layer groups, the camera targets and the
 *  hotspot anchors so they all stay aligned. */
export function layerGap(aspect: number): number {
  return Math.min(Math.max(1 + (CAMERA.baseAspect / aspect - 1) * CAMERA.gapRamp, 1), CAMERA.gapMax);
}

/** The effective close-up framing for a hotspot: its own `view` overrides,
 *  falling back to the global CAMERA defaults for anything it doesn't set. */
export function hotspotView(h: Hotspot): Required<HotspotView> {
  const v = h.view;
  return {
    offset: v?.offset ?? CAMERA.nodeOffset,
    aimDown: v?.aimDown ?? CAMERA.nodeAimDown,
    fovZoom: v?.fovZoom ?? CAMERA.fovZoom,
    mobileZoom: v?.mobileZoom ?? 1,
  };
}
