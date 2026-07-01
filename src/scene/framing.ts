import { Vector3 } from 'three';

// Maquette geometry and all camera framings live here as pure data/math so the
// CameraRig stays declarative and the hotspots can be authored next to the
// layers they sit on (§4).

export type LayerId = 'chip' | 'room' | 'city';

export interface MaquetteLayer {
  id: LayerId;
  /** vertical position of the platform in the stack */
  y: number;
  title: string;
}

// A scale ladder, bottom → top (small → large): the chip, the room, the city.
export const MAQUETTE_LAYERS: MaquetteLayer[] = [
  { id: 'chip', y: -1.32, title: 'Chip · tools, CV & data' },
  { id: 'room', y: 0, title: 'Room · games, apps & web' },
  { id: 'city', y: 1.32, title: 'City · GIS & location' },
];

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
  { slug: 'amsterdam-ai', layer: 'chip', position: [0, 0.46, 0], anchor: [0, 0.16, 0] }, // the die
  { slug: 'custom-ar-framework', layer: 'chip', position: [0.92, 0.5, 0.62], anchor: [0.92, 0.2, 0.62] }, // a component
  { slug: 'philips-medical-xr', layer: 'chip', position: [0.95, 0.54, -0.72], anchor: [0.95, 0.24, -0.72] }, // ECG / Vision Pro module
  // Room — spread into a corner diorama
  { slug: 'virtuele-brigade', layer: 'room', position: [-1.08, 1.08, 0.14], anchor: [-1.08, 0.78, 0.14] }, // the monitor
  { slug: 'popcore-games', layer: 'room', position: [0.12, 0.54, -0.26], anchor: [0.12, 0.24, -0.26] }, // phone on the couch
  { slug: 'lightship-drive', layer: 'room', position: [0, 0.62, 0.52], anchor: [0, 0.28, 0.52] }, // the AR race table
  { slug: 'zwijsen-ar-books', layer: 'room', position: [1.02, 0.95, -0.78], anchor: [1.02, 0.52, -0.78] }, // the orange book on the shelf
  // City — GIS / location work
  { slug: 'niantic-explorer', layer: 'city', position: [1.05, 0.46, -0.72], anchor: [1.05, 0.06, -0.72] }, // the park
  { slug: 'alliander-hololens', layer: 'city', position: [0, 1.4, 0], anchor: [0, 0.85, 0] }, // the skyscraper (skyline peak)
  { slug: 'dtt-amsterdam', layer: 'city', position: [-1.2, 1.3, 0.5], anchor: [-1.2, 0.7, 0.5] }, // the windmill
];

export interface Framing {
  pos: Vector3;
  target: Vector3;
}

/** World position of a hotspot dot, accounting for its layer's offset + scale. */
export function hotspotWorld(h: Hotspot): Vector3 {
  const s = LAYER_SCALE[h.layer];
  return new Vector3(h.position[0] * s, LAYER_Y[h.layer] + h.position[1] * s, h.position[2] * s);
}

/** World position of the object the hotspot points to (its anchor). */
export function anchorWorld(h: Hotspot): Vector3 {
  const a = h.anchor ?? h.position;
  const s = LAYER_SCALE[h.layer];
  return new Vector3(a[0] * s, LAYER_Y[h.layer] + a[1] * s, a[2] * s);
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

export function journeyView(step: number): Framing {
  const y = JOURNEY_Y[Math.max(0, Math.min(2, step))] ?? 0;
  const target = new Vector3(0, y, 0);
  return { pos: target.clone().add(JOURNEY_OFFSET), target };
}

const NODE_OFFSET = new Vector3(1.55, 1.15, 2.55);

/** Closer look at a selected node. Pulled back a touch and aimed below the
 *  object so it sits high in the upper area, clear of the bottom dossier HUD. */
export function nodeView(hotspot: Hotspot): Framing {
  const obj = anchorWorld(hotspot);
  return {
    pos: obj.clone().add(NODE_OFFSET),
    target: obj.clone().add(new Vector3(0, -0.38, 0)),
  };
}

