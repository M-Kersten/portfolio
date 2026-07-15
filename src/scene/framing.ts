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
}

// Each hotspot is a dot floating clear of the diorama with a leader line down to
// the object it belongs to (anchor). Positions are local to the layer group
// (placed at LAYER_Y and scaled).
export const HOTSPOTS: Hotspot[] = [
  // Chip — the die sits centre; parts fan outwards
  { slug: 'amsterdam-ai', layer: 'chip', position: [0.03, 0.49, 0], anchor: [0, 0.16, 0] }, // the die
  { slug: 'custom-ar-framework', layer: 'chip', position: [0.9, 0.54, -0.72], anchor: [0.95, 0, -0.72] }, // AR lens (moved to the back-right)
  { slug: 'philips-medical-xr', layer: 'chip', position: [-0.97, 0.63, -0.74], anchor: [-0.95, 0.24, -0.74] }, // ECG / Vision Pro module (moved to the left to balance)
  // Room — spread into a corner diorama
  { slug: 'virtuele-brigade', layer: 'room', position: [-1.83, 0.95, 0.14], anchor: [-1.8, 0.65, 0.14] }, // the monitor
  { slug: 'popcore-games', layer: 'room', position: [0.25, 0.62, -0.14], anchor: [0.23, 0.22, -0.14] }, // phone on the couch
  { slug: 'lightship-drive', layer: 'room', position: [-0.03, 0.52, 0.52], anchor: [0, 0.2, 0.52] }, // the AR race table
  { slug: 'zwijsen-ar-books', layer: 'room', position: [1.2, 1.1, -0.28], anchor: [1.02, 0.52, -0.78] }, // the orange book on the shelf
  // City — GIS / location work
  { slug: 'arcam', layer: 'city', position: [1.15, 0.66, -0.32], anchor: [1.25, 0.0, -0.22] }, // the park
  { slug: 'alliander-hololens', layer: 'city', position: [.05, 1.2, 0], anchor: [0, 0.85, 0] }, // the skyscraper (skyline peak)
  { slug: 'dtt-amsterdam', layer: 'city', position: [-1.15, 1.15, 0.4], anchor: [-1.31, 0.63, 0.36] }, // the windmill
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

export function journeyView(step: number, gap = 1): Framing {
  const y = (JOURNEY_Y[Math.max(0, Math.min(2, step))] ?? 0) * gap;
  const target = new Vector3(0, y, 0);
  return { pos: target.clone().add(new Vector3(...CAMERA.overviewOffset)), target };
}

/** Closer look at a selected node. Pulled back a touch and aimed below the
 *  object so it sits high in the upper area, clear of the bottom dossier HUD. */
export function nodeView(hotspot: Hotspot, gap = 1): Framing {
  const obj = anchorWorld(hotspot, gap);
  return {
    pos: obj.clone().add(new Vector3(...CAMERA.nodeOffset)),
    target: obj.clone().add(new Vector3(0, -CAMERA.nodeAimDown, 0)),
  };
}

