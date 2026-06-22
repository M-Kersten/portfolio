import { Vector3 } from 'three';
import type { Place } from '../data/places';

// Maquette geometry and all camera framings live here as pure data/math so the
// CameraRig stays declarative and the hotspots can be authored next to the
// layers they sit on (§4).

export interface MaquetteLayer {
  id: 'vr' | 'ar' | 'twin';
  /** vertical position of the slab in the stack */
  y: number;
  title: string;
}

export const MAQUETTE_LAYERS: MaquetteLayer[] = [
  { id: 'vr', y: -1.32, title: 'VR training' },
  { id: 'ar', y: 0, title: 'AR overlays' },
  { id: 'twin', y: 1.32, title: 'Digital twin / data' },
];

export interface Hotspot {
  slug: string;
  layerIndex: number;
  position: [number, number, number];
  /** The twin hotspot flies into the district instead of opening a modal (§4). */
  twin?: boolean;
}

export const HOTSPOTS: Hotspot[] = [
  { slug: 'defence-procedure-trainer', layerIndex: 0, position: [1.5, -1.32, 0.7] },
  { slug: 'clinical-device-training', layerIndex: 0, position: [-1.45, -1.32, -0.55] },
  { slug: 'underground-utilities', layerIndex: 1, position: [1.6, 0, -0.8] },
  { slug: 'onsite-guidance', layerIndex: 1, position: [-1.5, 0, 0.7] },
  { slug: 'municipal-twin', layerIndex: 2, position: [1.3, 1.32, 0.6], twin: true },
  { slug: 'grid-simulation', layerIndex: 2, position: [-1.5, 1.32, -0.7] },
];

export interface Framing {
  pos: Vector3;
  target: Vector3;
}

/** Establishing three-quarter view of the maquette, slightly right-of-centre
 *  to leave room for the hero copy on the left. */
export const MAQUETTE_HOME: Framing = {
  pos: new Vector3(5.6, 3.4, 6.6),
  target: new Vector3(0.55, 0, 0),
};

/** Eased focus toward one layer when its hotspot is clicked. */
export function maquetteFocus(layerIndex: number): Framing {
  const y = MAQUETTE_LAYERS[layerIndex]?.y ?? 0;
  return {
    pos: new Vector3(3.1, y + 1.7, 4.7),
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
