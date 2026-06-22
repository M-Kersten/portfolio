import { Vector3 } from 'three';
import type { Place } from '../data/places';

// Maquette geometry and all camera framings live here as pure data/math so the
// CameraRig stays declarative and the hotspots can be authored next to the
// layers they sit on (§4).

export interface MaquetteLayer {
  id: 'chip' | 'room' | 'city';
  /** vertical position of the platform in the stack */
  y: number;
  title: string;
}

// A scale ladder, bottom → top (small → large): the chip, the room, the city.
// Index order matters: layerIndex 0 = chip, 1 = room, 2 = city.
export const MAQUETTE_LAYERS: MaquetteLayer[] = [
  { id: 'chip', y: -1.32, title: 'Chip · tools, CV & data' },
  { id: 'room', y: 0, title: 'Room · games, apps & web' },
  { id: 'city', y: 1.32, title: 'City · GIS & location' },
];

export interface Hotspot {
  slug: string;
  layerIndex: number;
  position: [number, number, number];
  /** The twin hotspot flies into the district instead of opening a modal (§4). */
  twin?: boolean;
}

export const HOTSPOTS: Hotspot[] = [
  // Chip (bottom) — tools, CV & data
  { slug: 'amsterdam-ai', layerIndex: 0, position: [1.35, -1.22, 0.7] },
  { slug: 'custom-ar-framework', layerIndex: 0, position: [-1.4, -1.22, -0.55] },
  // Room (middle) — games, apps & websites
  { slug: 'virtuele-brigade', layerIndex: 1, position: [1.5, 0.1, -0.7] },
  { slug: 'popcore-games', layerIndex: 1, position: [-1.5, 0.1, 0.7] },
  // City (top) — GIS & location; the twin hotspot flies into the live district
  { slug: 'niantic-explorer', layerIndex: 2, position: [-1.4, 1.42, -0.6] },
  { slug: 'municipal-twin', layerIndex: 2, position: [0.9, 1.42, 0.55], twin: true },
];

export interface Framing {
  pos: Vector3;
  target: Vector3;
}

/** Establishing three-quarter view. Pulled in close and centred so the
 *  hexagonal maquette reads as a large centerpiece; aimed slightly above the
 *  model centre so the top-aligned hero title stays clear of it. */
export const MAQUETTE_HOME: Framing = {
  pos: new Vector3(3.7, 2.2, 4.8),
  target: new Vector3(0, 0.5, 0),
};

/** Eased focus toward one layer when its hotspot is clicked. */
export function maquetteFocus(layerIndex: number): Framing {
  const y = MAQUETTE_LAYERS[layerIndex]?.y ?? 0;
  return {
    pos: new Vector3(2.7, y + 1.3, 4.0),
    target: new Vector3(0, y, 0),
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
