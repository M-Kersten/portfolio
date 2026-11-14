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
// glides straight down the stack, one layer centred per stop, framed per step
// (CAMERA.stepZoom / stepRise): the Chip comes closer to its smaller board.
// On a wide screen the rig then slides the image clear of the words beside the
// floor (overviewFit in framing.ts): the camera itself looks straight at it.
const JOURNEY_Y = [LAYER_Y.city, LAYER_Y.room, LAYER_Y.chip];

// The overview's aim and offset (see CAMERA in framing.ts for the why), blended
// toward the portrait framing as the screen turns tall (portraitMix). Read per
// call, so the dev tooling can tune them live.
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const stepOf = (step: number) => Math.max(0, Math.min(2, step));

/** The point the overview orbits: on the layer (a little to one side on an
 *  upright screen: portraitStepAimX), raised by the step's rise (a little more
 *  on a short phone, where the text over the floor reaches further down the
 *  screen: shortRise). `level` leaves out the room an upright screen makes for
 *  the words over the floor: the floor in the middle of the screen. */
function overviewPivot(step: number, gap: number, aspect: number, level: boolean): Vector3 {
  const mix = portraitMix(aspect);
  const s = stepOf(step);
  const rise = lerp(CAMERA.stepRise[s], level ? 0 : CAMERA.portraitStepRise[s], mix) + (level ? 0 : shortRise(aspect));
  return new Vector3(CAMERA.portraitStepAimX[s] * mix, (JOURNEY_Y[s] ?? 0) * gap + rise, 0);
}

/** The overview of journey step `step` (0 City · 1 Room · 2 Chip) for a viewport
 *  of the given aspect; the default is the desktop framing. The step's zoom
 *  scales the whole framing about the floor, the lift included, so a closer
 *  step keeps the same composition. `back` stands the camera that much further
 *  out again (overviewFit: a floor that wouldn't fit beside the words); `level`
 *  sets the floor in the middle of an upright screen rather than under the
 *  words that stand over it there (the opening passes the lower floors with
 *  no words up yet). */
export function journeyView(step: number, gap = 1, aspect = CAMERA.baseAspect, back = 1, level = false): Framing {
  const mix = portraitMix(aspect);
  const s = stepOf(step);
  const pivot = overviewPivot(s, gap, aspect, level);
  const o = CAMERA.overviewOffset;
  const po = CAMERA.portraitOffset;
  const z = lerp(CAMERA.stepZoom[s], CAMERA.portraitStepZoom[s], mix) * back;
  return {
    pos: pivot.clone().add(new Vector3(lerp(o[0], po[0], mix), lerp(o[1], po[1], mix), lerp(o[2], po[2], mix)).multiplyScalar(z)),
    target: pivot.clone().add(new Vector3(0, lerp(CAMERA.overviewLift, CAMERA.portraitLift, mix) * z, 0)),
  };
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
