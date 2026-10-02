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

export const LAYER_Y: Record<LayerId, number> = { city: 1.32, room: 0, chip: -1.32 };
// Sized so the scale ladder reads — City largest, Chip smallest.
export const LAYER_SCALE: Record<LayerId, number> = { city: 1.15, room: 1.0, chip: 0.82 };

export interface Hotspot {
  slug: string;
  layer: LayerId;
  /** Floating marker (dot) position, LOCAL to the layer group. */
  position: [number, number, number];
  /** Point ON the object the leader line points down to (local). */
  anchor?: [number, number, number];
  /** Per-hotspot close-up framing. Any field left out falls back to the global
   *  CAMERA defaults — so you only override what a given object needs. Tune it
   *  live with the dev panel (open a node in `npm run dev`) and paste the
   *  `view: { … }` it copies right here. */
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

// Each hotspot is a dot floating clear of the diorama with a leader line down to
// the object it belongs to (anchor). Positions are local to the layer group
// (placed at LAYER_Y and scaled).
export const HOTSPOTS: Hotspot[] = [
  // Chip — the die sits centre; parts fan outwards
  { slug: 'amsterdam-ai', layer: 'chip', position: [0.03, 0.49, 0], anchor: [0, 0.16, 0], view: { offset: [0.35, 1.75, 1.85], aimDown: 0.62, fovZoom: 14 } }, // the die
  // The two chip hotspots sit on the board's back corner slots (chip.tsx CORNER),
  // so their anchors track those slots — move a slot and the crosshair follows.
  { slug: 'custom-ar-framework', layer: 'chip', position: [0.7, 0.54, -0.75], anchor: [0.75, 0, -0.75], view: { offset: [2.2, 0.8, 1.8], aimDown: 0.3, fovZoom: -2.5 } }, // the CV camera (back-right slot)
  { slug: 'philips-medical-xr', layer: 'chip', position: [-0.77, 0.63, -0.75], anchor: [-0.75, 0.24, -0.75], view: { offset: [0.5, 0.55, 1.25], aimDown: 0.25, fovZoom: 19.5 } }, // ECG / Vision Pro module (back-left slot)
  // Room — spread into a corner diorama
  { slug: 'virtuele-brigade', layer: 'room', position: [-1.83, 0.95, 0.14], anchor: [-1.8, 0.65, 0.14], view: { offset: [2.05, 0.2, 0.3], aimDown: 0.45, fovZoom: 0.5 } }, // the monitor
  { slug: 'popcore-games', layer: 'room', position: [0.25, 0.62, -0.14], anchor: [0.23, 0.22, -0.14], view: { offset: [0.6, 0.55, 0.95], aimDown: 0.05, fovZoom: 19.5 } }, // phone on the couch
  { slug: 'lightship-drive', layer: 'room', position: [-0.03, 0.52, 0.52], anchor: [0, 0.2, 0.52], view: { offset: [0.95, 0.5, 0.75], aimDown: 0.25, fovZoom: 30 } }, // the AR race table
  { slug: 'zwijsen-ar-books', layer: 'room', position: [1.2, 1.15, -0.28], anchor: [1.02, 0.4, -1.13], view: { offset: [-0.1, 0.9, 1.35], aimDown: 0.35, fovZoom: 16, mobileZoom: 1.45 } }, // the orange book on the shelf
  // City — GIS / location work
  { slug: 'arcam', layer: 'city', position: [1.15, 0.66, -0.32], anchor: [1.25, 0.0, -0.22], view: { offset: [1.45, 1.15, 2.1], aimDown: 0.3, fovZoom: 17 } }, // the park
  { slug: 'alliander-hololens', layer: 'city', position: [.05, 1.15, 0], anchor: [0, 0.77, 0], view: { offset: [0.75, -0.1, 3.3], aimDown: 1.15, fovZoom: 26 } }, // the skyscraper (skyline peak)
  { slug: 'dtt-amsterdam', layer: 'city', position: [-0.55, 1.15, 0.4], anchor: [-1.2, 0.58, -0.06], view: { offset: [-2, -0.2, 3.5], aimDown: 0.6, fovZoom: 19 } }, // the windmill
];

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
  // Where on the layer the overview looks, [x, y] off its centre. A little LEFT
  // pushes the maquette right on screen, clear of the hero title beside it; a
  // little ABOVE drops the layer in focus to the middle of the frame, so the
  // layers below fall away toward the bottom edge instead of filling it.
  overviewAim: [-0.34, 0.34] as [number, number],

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
  portraitAim: [0.1, 0.3] as [number, number],
  portraitFrom: 1.0, // width:height where the portrait framing starts to blend in…
  portraitTo: 0.62, // …and where it has fully taken over

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
  fovLerp: 2.2,
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
