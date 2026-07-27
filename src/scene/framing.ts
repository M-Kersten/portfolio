import { Vector3 } from 'three';

// Maquette geometry and all camera framings live here as pure data/math so the
// CameraRig stays declarative and the hotspots can be authored next to the
// layers they sit on (§4).

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
  /** Extra downward aim in portrait, on top of aimDown (lifts it above the sheet). */
  mobileLift?: number;
}

// Each hotspot is a dot floating clear of the diorama with a leader line down to
// the object it belongs to (anchor). Positions are local to the layer group
// (placed at LAYER_Y and scaled).
export const HOTSPOTS: Hotspot[] = [
  // Chip — the die sits centre; parts fan outwards
  { slug: 'amsterdam-ai', layer: 'chip', position: [0.03, 0.49, 0], anchor: [0, 0.16, 0], view: { offset: [0.35, 1.75, 1.85], aimDown: 0.62, fovZoom: 14, mobileLift: 1.5 } }, // the die
  // The two chip hotspots sit on the board's back corner slots (chip.tsx CORNER),
  // so their anchors track those slots — move a slot and the crosshair follows.
  { slug: 'custom-ar-framework', layer: 'chip', position: [0.7, 0.54, -0.75], anchor: [0.75, 0, -0.75], view: { offset: [2.2, 0.8, 1.8], aimDown: 0.3, fovZoom: -2.5, mobileLift: 1.5 } }, // the CV camera (back-right slot)
  { slug: 'philips-medical-xr', layer: 'chip', position: [-0.77, 0.63, -0.75], anchor: [-0.75, 0.24, -0.75], view: { offset: [0.5, 0.55, 1.25], aimDown: 0.25, fovZoom: 19.5, mobileLift: 1.5 } }, // ECG / Vision Pro module (back-left slot)
  // Room — spread into a corner diorama
  { slug: 'virtuele-brigade', layer: 'room', position: [-1.83, 0.95, 0.14], anchor: [-1.8, 0.65, 0.14], view: { offset: [2.05, 0.2, 0.3], aimDown: 0.45, fovZoom: 0.5, mobileLift: 1.5 } }, // the monitor
  { slug: 'popcore-games', layer: 'room', position: [0.25, 0.62, -0.14], anchor: [0.23, 0.22, -0.14], view: { offset: [0.6, 0.55, 0.95], aimDown: 0.05, fovZoom: 19.5, mobileLift: 1.5 } }, // phone on the couch
  { slug: 'lightship-drive', layer: 'room', position: [-0.03, 0.52, 0.52], anchor: [0, 0.2, 0.52], view: { offset: [0.95, 0.5, 0.75], aimDown: 0.25, fovZoom: 30, mobileLift: 1.5 } }, // the AR race table
  { slug: 'zwijsen-ar-books', layer: 'room', position: [1.2, 1.15, -0.28], anchor: [1.02, 0.4, -1.13], view: { offset: [0.05, 0.2, 1.35], aimDown: 0.05, fovZoom: 16, mobileLift: 1.5 } }, // the orange book on the shelf
  // City — GIS / location work
  { slug: 'arcam', layer: 'city', position: [1.15, 0.66, -0.32], anchor: [1.25, 0.0, -0.22], view: { offset: [1.45, 1.15, 2.1], aimDown: 0.3, fovZoom: 17, mobileLift: 1.7 } }, // the park
  { slug: 'alliander-hololens', layer: 'city', position: [.05, 1.15, 0], anchor: [0, 0.77, 0], view: { offset: [0.75, -0.1, 3.3], aimDown: 1.15, fovZoom: 26, mobileLift: 1.5 } }, // the skyscraper (skyline peak)
  { slug: 'dtt-amsterdam', layer: 'city', position: [-0.55, 1.15, 0.4], anchor: [-1.2, 0.58, -0.06], view: { offset: [-2, -0.2, 3.5], aimDown: 0.6, fovZoom: 19, mobileLift: 1.5 } }, // the windmill
];

export interface Framing {
  pos: Vector3;
  target: Vector3;
}

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

  // Close-up framing when a project node is opened. Shorter = tighter on the node.
  nodeOffset: [1.55, 1.15, 2.55] as Vec3,
  // How far below the node the camera aims, in world units. RAISE this to push
  // the selected object higher up the frame, clear above the HUD drawer.
  nodeAimDown: 0.62,

  // The lens — vertical field of view, in degrees.
  baseFov: 42, // on a wide desktop
  fovMax: 62, // widen up to this as the screen gets narrow/tall (more depth)
  fovRamp: 0.5, // how eagerly it widens as the screen narrows (higher = sooner)

  // Mobile fit. `baseAspect` is the width:height the numbers above are tuned for
  // (treated as "desktop" at/above it). As the screen narrows the camera also
  // eases back by up to `maxFit`× — RAISE maxFit to zoom OUT more on a phone.
  baseAspect: 1.6,
  maxFit: 1.8,

  // Layer spacing on tall screens. `gapMax` is how much further apart the three
  // layers spread on a phone; `gapRamp` is how fast they spread as it narrows.
  gapMax: 1.5,
  gapRamp: 0.28,
  // Extra downward aim for an open node in portrait, on top of nodeAimDown.
  // It needs to be larger than you'd expect: the phone camera sits further back
  // (fitScale), so a given aim shifts the object less on screen. RAISE to push
  // the node higher above the mobile sheet.
  mobileNodeLift: 1.5,

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

// The launch easter egg's camera (see CameraRig's launch branch). The rig aims
// at the rocket's live world position (store.launchTrack); these set how it
// stands off from it on the pad and while chasing the ascent.
export const LAUNCH = {
  padOffset: [1.15, 0.55, 1.9] as Vec3, // three-quarter view of the pad
  padAim: 0.1, // aim this far below the rocket's centre (frames it high)
  ascendOffset: [1.5, -0.4, 2.4] as Vec3, // slightly below → looking UP at the climb
  fovZoom: 10, // the lens widens a touch for the pad/ascent drama
};

/** Modest pull-back for narrow/tall viewports (paired with fitFov). 1 on desktop. */
export function fitScale(aspect: number): number {
  return Math.min(Math.max(CAMERA.baseAspect / aspect, 1), CAMERA.maxFit);
}

/** Vertical FOV for the viewport aspect: the authored FOV on desktop, widening
 *  toward CAMERA.fovMax as the frame narrows so the maquette's width fits with
 *  the camera kept close (a bigger subject + more depth than retreating). */
export function fitFov(aspect: number): number {
  const f = CAMERA.baseFov * Math.pow(CAMERA.baseAspect / aspect, CAMERA.fovRamp);
  return Math.min(Math.max(f, CAMERA.baseFov), CAMERA.fovMax);
}

/** Vertical spacing multiplier between the three layers. 1 on desktop, growing
 *  toward CAMERA.gapMax as the screen turns tall/narrow so the tiers read as
 *  distinct. Applied identically to the layer groups, the camera targets and the
 *  hotspot anchors so they all stay aligned. */
export function layerGap(aspect: number): number {
  return Math.min(Math.max(1 + (CAMERA.baseAspect / aspect - 1) * CAMERA.gapRamp, 1), CAMERA.gapMax);
}

/** World position of the object the hotspot points to (its anchor). `gap` spreads
 *  the layers vertically on tall screens (see layerGap) — scales only the layer's
 *  Y offset, not the local anchor within the layer. */
export function anchorWorld(h: Hotspot, gap = 1): Vector3 {
  const a = h.anchor ?? h.position;
  const s = LAYER_SCALE[h.layer];
  return new Vector3(a[0] * s, LAYER_Y[h.layer] * gap + a[1] * s, a[2] * s);
}

/** Establishing three-quarter view used as the camera's initial pose. */
// Open framed on the City layer (top) rather than the whole stack.
export const MAQUETTE_HOME: Framing = {
  pos: new Vector3(3.1, 2.6, 4.2),
  target: new Vector3(0, 1.32, 0),
};

// Scroll journey: step 0 = City (top), 1 = Room, 2 = Chip (bottom). The camera
// glides straight down the stack, one layer centred per snap stop. A constant
// frame means the per-layer scale difference actually reads on screen.
const JOURNEY_Y = [1.32, 0, -1.32];

// The overview aims a little LEFT of the maquette's centre, which pushes the
// maquette itself right on screen — clear of the hero title, whose left column
// was sitting on top of the windmill's hotspot. Overview only: node close-ups
// aim at their own anchor and are unaffected.
const OVERVIEW_AIM_X = -0.34;

export function journeyView(step: number, gap = 1): Framing {
  const y = (JOURNEY_Y[Math.max(0, Math.min(2, step))] ?? 0) * gap;
  const target = new Vector3(OVERVIEW_AIM_X, y, 0);
  return { pos: target.clone().add(new Vector3(...CAMERA.overviewOffset)), target };
}

/** Where the cinematic load intro starts: the camera is pulled well back and
 *  dropped low, so the dolly-in RISES up into the City overview (journeyView 0)
 *  and the nearest front objects — the park's trees and the front skyline —
 *  sweep past the lower frame on the way in. Aims a touch below the City so the
 *  skyline sits high as it settles. */
export function introView(gap = 1): Framing {
  const home = journeyView(0, gap);
  const dir = home.pos.clone().sub(home.target); // the overview offset (right, up, back)
  const pos = home.target
    .clone()
    .add(dir.multiplyScalar(1.95)) // ~2x further out — a wide establishing shot…
    .add(new Vector3(0.4, -1.35, 0.5)); // …dropped low + a hair right, to rise past the park
  return { pos, target: home.target.clone().add(new Vector3(0, -0.25, 0)) };
}

/** The effective close-up framing for a hotspot: its own `view` overrides,
 *  falling back to the global CAMERA defaults for anything it doesn't set. */
export function hotspotView(h: Hotspot): Required<HotspotView> {
  const v = h.view;
  return {
    offset: v?.offset ?? CAMERA.nodeOffset,
    aimDown: v?.aimDown ?? CAMERA.nodeAimDown,
    fovZoom: v?.fovZoom ?? CAMERA.fovZoom,
    mobileLift: v?.mobileLift ?? CAMERA.mobileNodeLift,
  };
}

/** Closer look at a selected node. Pulled back a touch and aimed below the
 *  object so it sits high in the upper area, clear of the bottom dossier HUD.
 *  `view` is resolved per hotspot (hotspotView) but can be passed in — the dev
 *  tuner feeds it the live-dragged values. */
export function nodeView(hotspot: Hotspot, gap = 1, view: Required<HotspotView> = hotspotView(hotspot)): Framing {
  const obj = anchorWorld(hotspot, gap);
  return {
    pos: obj.clone().add(new Vector3(...view.offset)),
    target: obj.clone().add(new Vector3(0, -view.aimDown, 0)),
  };
}

