import { Vector3 } from 'three';
import { CAMERA, LAYER_SCALE, LAYER_Y, hotspotView, portraitMix, shortRise, type Hotspot, type HotspotView } from './framing';

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
  const a = h.anchor;
  const s = LAYER_SCALE[h.layer];
  return new Vector3(a[0] * s, LAYER_Y[h.layer] * gap + a[1] * s, a[2] * s);
}

/** Establishing three-quarter view used as the camera's initial pose. */
// Open framed on the City layer (top) rather than the whole stack.
export const MAQUETTE_HOME: Framing = {
  pos: new Vector3(3.1, LAYER_Y.city + 1.28, 4.2),
  target: new Vector3(0, LAYER_Y.city, 0),
};

// Scroll journey: step 0 = City (top), 1 = Room, 2 = Chip (bottom). The camera
// glides straight down the stack, one layer centred per snap stop, framed per
// step (CAMERA.stepAimX / stepZoom): the City clears the title, the Chip comes
// closer to its smaller board.
const JOURNEY_Y = [LAYER_Y.city, LAYER_Y.room, LAYER_Y.chip];

// The overview's aim and offset (see CAMERA in framing.ts for the why), blended
// toward the portrait framing as the screen turns tall (portraitMix). Read per
// call, so the dev tooling can tune them live.
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const stepOf = (step: number) => Math.max(0, Math.min(2, step));

/** The point the overview orbits: on the layer, offset sideways by the step's
 *  aim and raised by its rise (the City's a little more on a short phone,
 *  under the hero title: shortRise). */
function overviewPivot(step: number, gap: number, aspect: number): Vector3 {
  const mix = portraitMix(aspect);
  const s = stepOf(step);
  const rise = lerp(CAMERA.stepRise[s], CAMERA.portraitStepRise[s], mix) + (s === 0 ? shortRise(aspect) : 0);
  return new Vector3(lerp(CAMERA.stepAimX[s], CAMERA.portraitStepAimX[s], mix), (JOURNEY_Y[s] ?? 0) * gap + rise, 0);
}

/** The overview of journey step `step` (0 City · 1 Room · 2 Chip) for a viewport
 *  of the given aspect; the default is the desktop framing. The step's zoom
 *  scales the whole framing about the floor, the lift included, so a closer
 *  step keeps the same composition. */
export function journeyView(step: number, gap = 1, aspect = CAMERA.baseAspect): Framing {
  const mix = portraitMix(aspect);
  const s = stepOf(step);
  const pivot = overviewPivot(s, gap, aspect);
  const o = CAMERA.overviewOffset;
  const po = CAMERA.portraitOffset;
  const z = lerp(CAMERA.stepZoom[s], CAMERA.portraitStepZoom[s], mix);
  return {
    pos: pivot.clone().add(new Vector3(lerp(o[0], po[0], mix), lerp(o[1], po[1], mix), lerp(o[2], po[2], mix)).multiplyScalar(z)),
    target: pivot.clone().add(new Vector3(0, lerp(CAMERA.overviewLift, CAMERA.portraitLift, mix) * z, 0)),
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
  // (overviewLift), and measuring the dolly direction from there would tilt the
  // establishing shot as a side effect of a framing change. (Desktop framing:
  // the intro never plays on a phone.)
  const dir = new Vector3(...CAMERA.overviewOffset);
  const pos = overviewPivot(0, gap, CAMERA.baseAspect)
    .clone()
    .add(dir.multiplyScalar(1.95)) // ~2x further out — a wide establishing shot…
    .add(new Vector3(0.4, -1.35, 0.5)); // …dropped low + a hair right, to rise past the park
  return { pos, target: home.target.clone().add(new Vector3(0, -0.25, 0)) };
}

/** Closer look at a selected node, framed in the porthole. `view` is resolved
 *  per hotspot (hotspotView) but can be passed in: the camera passes the dev
 *  tools' live values (dev/tuning.ts viewFor). */
export function nodeView(hotspot: Hotspot, gap = 1, view: Required<HotspotView> = hotspotView(hotspot)): Framing {
  const obj = anchorWorld(hotspot, gap);
  return {
    pos: obj.clone().add(new Vector3(...view.offset)),
    target: obj.clone().add(new Vector3(0, -view.aimDown, 0)),
  };
}

/** Where the rocket is RIGHT NOW, in world space — written by the rocket every
 *  frame, read by the CameraRig to aim at the pad (framed by LAUNCH). Plain
 *  mutable vector (per-frame data, deliberately not reactive state). */
export const launchTrack = new Vector3(0, 0, 0);

/** The launch cinematic's camera, in world space — written by the rocket every
 *  frame of the flight (maquette/launch.ts choreographs it), flown by the
 *  CameraRig while `active`: where the camera is, what it looks at, how much
 *  wider than the scene's lens it shoots (degrees), how much of the narrow-
 *  screen pull-back it takes (0–1), which camera it is (a change is a cut),
 *  how hard it rumbles (world units), when the film began (performance.now())
 *  and how far into it we are. */
export const launchShot = {
  active: false,
  pos: new Vector3(),
  target: new Vector3(),
  fov: 0,
  pull: 1,
  cut: 0,
  shake: 0,
  startedAt: 0,
  /** seconds since the film began (the count's first frame): the rig eases
   *  into the first shot over this, so it runs on the film's own clock */
  since: 0,
};
