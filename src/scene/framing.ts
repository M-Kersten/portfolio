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

// Viewport-aspect fit. The maquette is wide and short, so on a narrow/tall
// screen (a phone in portrait) its width spills past the fixed-lens camera and
// the hotspots fall off the sides. Rather than a hard media-query "zoom out",
// the CameraRig adapts continuously to aspect: it WIDENS THE LENS (fitFov) and
// eases the camera back only a little (fitScale). Widening the lens fits the
// width while keeping the camera close, so the maquette stays large and gains
// depth — a much nicer phone view than retreating far enough to shrink it.
const BASE_ASPECT = 1.6; // the framing offsets + base FOV are authored for this
const MAX_FIT = 1.8; // a gentle pull-back — the wider lens does most of the work
const BASE_FOV = 42; // the authored desktop vertical FOV
const FOV_MAX = 62; // widen toward this as the frame narrows (more width, more depth)
const GAP_MAX = 1.5; // on a tall phone, spread the layers this much further apart

/** Modest pull-back for narrow/tall viewports (paired with fitFov). 1 on desktop. */
export function fitScale(aspect: number): number {
  return Math.min(Math.max(BASE_ASPECT / aspect, 1), MAX_FIT);
}

/** Vertical FOV for the viewport aspect: the authored 42° on desktop, widening
 *  toward 62° as the frame narrows so the maquette's width fits with the camera
 *  kept close (a bigger subject + more perspective than retreating would give). */
export function fitFov(aspect: number): number {
  return Math.min(Math.max(BASE_FOV * Math.sqrt(BASE_ASPECT / aspect), BASE_FOV), FOV_MAX);
}

/** Vertical spacing multiplier between the three layers. 1 on desktop, growing
 *  toward GAP_MAX as the screen turns tall/narrow so the tiers read as distinct
 *  (a phone has vertical room to spare). Applied identically to the layer groups,
 *  the camera targets and the hotspot anchors so they all stay aligned. */
export function layerGap(aspect: number): number {
  return Math.min(Math.max(1 + (BASE_ASPECT / aspect - 1) * 0.28, 1), GAP_MAX);
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
// Tighter than before so each layer fills more of the frame; the fog hazes the
// layers behind it, so one layer reads as the subject at a time.
const JOURNEY_OFFSET = new Vector3(2.8, 1.15, 3.8);

export function journeyView(step: number, gap = 1): Framing {
  const y = (JOURNEY_Y[Math.max(0, Math.min(2, step))] ?? 0) * gap;
  const target = new Vector3(0, y, 0);
  return { pos: target.clone().add(JOURNEY_OFFSET), target };
}

const NODE_OFFSET = new Vector3(1.55, 1.15, 2.55);

/** Closer look at a selected node. Pulled back a touch and aimed below the
 *  object so it sits high in the upper area, clear of the bottom dossier HUD. */
export function nodeView(hotspot: Hotspot, gap = 1): Framing {
  const obj = anchorWorld(hotspot, gap);
  return {
    pos: obj.clone().add(NODE_OFFSET),
    target: obj.clone().add(new Vector3(0, -0.38, 0)),
  };
}

