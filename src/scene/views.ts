import { Vector3 } from 'three';
import { CAMERA, LAYER_SCALE, LAYER_Y, hotspotView, portraitMix, type Hotspot, type HotspotView } from './framing';

// The camera's framings of the maquette as three.js vectors, built from the
// plain layout and tuning in framing.ts. Kept apart from it so that file stays
// free of three.js — the page shell imports it on first paint, and three.js
// loads after that paint (see vite.config.ts).

export interface Framing {
  pos: Vector3;
  target: Vector3;
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

// The overview's aim and offset (CAMERA.overviewAim / overviewOffset — see
// framing.ts for why it looks a little left of and above the layer), blended
// toward the portrait framing as the screen turns tall (portraitMix). Both are
// read per call, so the dev tooling can tune them live.
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The point the overview orbits: on the layer, offset sideways by the aim. */
function overviewPivot(step: number, gap: number, mix: number): Vector3 {
  const y = (JOURNEY_Y[Math.max(0, Math.min(2, step))] ?? 0) * gap;
  return new Vector3(lerp(CAMERA.overviewAim[0], CAMERA.portraitAim[0], mix), y, 0);
}

/** The overview of journey step `step` (0 City · 1 Room · 2 Chip) for a viewport
 *  of the given aspect; the default is the desktop framing. */
export function journeyView(step: number, gap = 1, aspect = CAMERA.baseAspect): Framing {
  const mix = portraitMix(aspect);
  const pivot = overviewPivot(step, gap, mix);
  const o = CAMERA.overviewOffset;
  const po = CAMERA.portraitOffset;
  return {
    pos: pivot.clone().add(new Vector3(lerp(o[0], po[0], mix), lerp(o[1], po[1], mix), lerp(o[2], po[2], mix))),
    target: pivot.clone().add(new Vector3(0, lerp(CAMERA.overviewAim[1], CAMERA.portraitAim[1], mix), 0)),
  };
}

/** Where the cinematic load intro starts: the camera is pulled well back and
 *  dropped low, so the dolly-in RISES up into the City overview (journeyView 0)
 *  and the nearest front objects — the park's trees and the front skyline —
 *  sweep past the lower frame on the way in. Aims a touch below the City so the
 *  skyline sits high as it settles. */
export function introView(gap = 1): Framing {
  const home = journeyView(0, gap);
  // Off the PIVOT, not off the aim point — the aim sits above the layer
  // (overviewAim), and measuring the dolly direction from there would tilt the
  // establishing shot as a side effect of a framing change. (Desktop framing:
  // the intro never plays on a phone.)
  const dir = new Vector3(...CAMERA.overviewOffset);
  const pos = overviewPivot(0, gap, 0)
    .clone()
    .add(dir.multiplyScalar(1.95)) // ~2x further out — a wide establishing shot…
    .add(new Vector3(0.4, -1.35, 0.5)); // …dropped low + a hair right, to rise past the park
  return { pos, target: home.target.clone().add(new Vector3(0, -0.25, 0)) };
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

/** Where the rocket is RIGHT NOW, in world space — written by the rocket every
 *  frame, read by the CameraRig to aim at the pad and chase the ascent (framed
 *  by LAUNCH). Plain mutable vector (per-frame data, deliberately not reactive
 *  state). */
export const launchTrack = new Vector3(0, 0, 0);
