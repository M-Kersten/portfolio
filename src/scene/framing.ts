import { Vector3 } from 'three';
import type { Place } from '../data/places';

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
  /** Position LOCAL to the layer group (which is positioned at LAYER_Y and scaled). */
  position: [number, number, number];
  /** The twin hotspot flies into the district instead of opening a modal (§4). */
  twin?: boolean;
}

export const HOTSPOTS: Hotspot[] = [
  // Chip (bottom) — tools, CV & data
  { slug: 'amsterdam-ai', layer: 'chip', position: [1.35, 0.1, 0.7] },
  { slug: 'custom-ar-framework', layer: 'chip', position: [-1.4, 0.1, -0.55] },
  // Room (middle) — games, apps & websites
  { slug: 'virtuele-brigade', layer: 'room', position: [1.5, 0.1, -0.7] },
  { slug: 'popcore-games', layer: 'room', position: [-1.5, 0.1, 0.7] },
  // City (top) — GIS & location; the twin hotspot flies into the live district
  { slug: 'niantic-explorer', layer: 'city', position: [-1.4, 0.12, -0.6] },
  { slug: 'municipal-twin', layer: 'city', position: [0.9, 0.12, 0.55], twin: true },
];

export interface Framing {
  pos: Vector3;
  target: Vector3;
}

/** World position of a hotspot, accounting for its layer's offset + scale. */
export function hotspotWorld(h: Hotspot): Vector3 {
  const s = LAYER_SCALE[h.layer];
  return new Vector3(h.position[0] * s, LAYER_Y[h.layer] + h.position[1] * s, h.position[2] * s);
}

/** Establishing three-quarter view used as the camera's initial pose. */
export const MAQUETTE_HOME: Framing = {
  pos: new Vector3(3.7, 2.2, 4.8),
  target: new Vector3(0, 0.5, 0),
};

// Scroll journey: step 0 = City (top), 1 = Room, 2 = Chip (bottom). The camera
// glides straight down the stack, one layer centred per snap stop. A constant
// frame means the per-layer scale difference actually reads on screen.
const JOURNEY_Y = [1.32, 0, -1.32];
const JOURNEY_OFFSET = new Vector3(3.1, 0.95, 4.3);

export function journeyView(step: number): Framing {
  const y = JOURNEY_Y[Math.max(0, Math.min(2, step))] ?? 0;
  const target = new Vector3(0, y, 0);
  return { pos: target.clone().add(JOURNEY_OFFSET), target };
}

const NODE_OFFSET = new Vector3(1.6, 0.7, 2.4);

/** Closer look at a selected node. Aims a little below the node so it frames in
 *  the upper area, clear of the bottom dossier HUD. */
export function nodeView(hotspot: Hotspot): Framing {
  const world = hotspotWorld(hotspot);
  return {
    pos: world.clone().add(NODE_OFFSET),
    target: world.clone().add(new Vector3(0, -0.65, 0)),
  };
}

const DEG = Math.PI / 180;

/** District establishing shot from the place's {distance, pitch, bearing}. */
export function twinEstablishing(view: Place['view']): Framing {
  const pr = view.pitch * DEG;
  const br = view.bearing * DEG;
  const r = view.distance;
  return {
    pos: new Vector3(
      r * Math.cos(pr) * Math.sin(br),
      r * Math.sin(pr),
      r * Math.cos(pr) * Math.cos(br),
    ),
    target: new Vector3(0, r * 0.05, 0),
  };
}

/** Pulled-back, higher "approach" pose the descent into the city starts from. */
export function twinIntro(view: Place['view']): Framing {
  const e = twinEstablishing(view);
  return {
    pos: new Vector3(e.pos.x * 1.45, e.pos.y * 1.7 + 60, e.pos.z * 1.45),
    target: e.target.clone(),
  };
}
