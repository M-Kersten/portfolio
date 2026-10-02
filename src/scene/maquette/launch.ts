// The launch cinematic: what the rocket, its engines, the smoke and the camera
// do, as plain functions of the seconds since ignition. Nothing here touches
// the scene — city.tsx (NextProjectSite) poses the two stages and feeds the
// smoke from it every frame, and hands the camera its shot (launchShot in
// views.ts) for CameraRig to fly.
//
// The beats, cut like a launch broadcast: a camera on the ground across the
// lake as the engines spool up on the mount and the pad disappears into its own
// cloud, then the release and a slow, heavy climb out of the smoke that keeps
// on getting faster. Cut to a camera riding above the nose, looking down the
// column at the plume, the trail and the city falling away. Cut to a tracking
// camera alongside for staging: the booster's engines cut, the ship lights its
// own through the hot-staging ring and eases away, the booster drops back and
// flips over to fly home. The camera lets it go and watches the ship fly on,
// up and away, into the game.
//
// The frame is the camera's side of the pad: x across the frame (the way the
// gravity turn leans the climb), y up, z toward where the cameras watch from,
// in the pad's own units, the stack's base at the origin. city.tsx maps it
// onto the pad's axes.
import { STACK_BASE, STACK_TIP, STAGING_Y } from './rocket';

export const T = {
  /** engines lit; the hold-down clamps let go here */
  release: 1.2,
  /** cut to the camera riding on the stack */
  onboard: 4.0,
  /** cut to the tracking camera alongside */
  tracking: 6.9,
  /** the booster's engines cut */
  meco: 7.6,
  /** hot staging: the ship lights and pulls away */
  sep: 7.8,
  /** the game takes over */
  end: 12.8,
};

/** Up a stage's body: the ship's middle, and the booster's (it flips about
 *  that, not about its skirt). */
const SHIP_MID = (STAGING_Y + STACK_TIP) / 2;
export const BOOSTER_MID = (STACK_BASE + STAGING_Y) / 2;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** Height of the stack above the pad: slow off the mount, faster every second. */
function height(t: number): number {
  const u = Math.max(0, t - T.release);
  return 0.1 * u * u + 0.02 * u * u * u;
}
function speed(t: number): number {
  const u = Math.max(0, t - T.release);
  return 0.2 * u + 0.06 * u * u;
}
/** The gravity turn: the stack starts leaning over once it's clear of the tower. */
function pitch(t: number): number {
  const u = Math.max(0, t - T.release - 1.4);
  return Math.min(0.5, 0.009 * u * u);
}

// How far the lean has carried the stack sideways: the climb rate times the
// lean, summed up once at load (it has no tidy closed form).
const STEP = 1 / 240;
const drift: number[] = [0];
for (let i = 1, x = 0; i * STEP <= T.end + 1; i++) {
  const t = i * STEP;
  x += speed(t) * Math.sin(pitch(t)) * STEP;
  drift.push(x);
}
function across(t: number): number {
  const i = Math.min(drift.length - 1, Math.max(0, t / STEP));
  const i0 = Math.floor(i);
  const i1 = Math.min(drift.length - 1, i0 + 1);
  return mix(drift[i0], drift[i1], i - i0);
}

/** A stage's pose: where its body's origin would be, how far it leans over
 *  toward +x (radians), and how far it has turned about its own middle on top
 *  of that (the booster's flip). */
export interface Pose {
  x: number;
  y: number;
  z: number;
  tilt: number;
  turn: number;
}

type V3 = [number, number, number];

/** A point `h` up a pose's axis (its turn left out), nudged `r` to its right
 *  and `z` toward the camera. */
function along(p: Pose, h: number, r = 0, z = 0): V3 {
  const s = Math.sin(p.tilt);
  const c = Math.cos(p.tilt);
  return [p.x + h * s + r * c, p.y + h * c - r * s, p.z + z];
}

/** The stack on its way up, before staging. */
function climb(t: number): Pose {
  return { x: across(t), y: height(t), z: 0, tilt: pitch(t), turn: 0 };
}

const SEP = { ...climb(T.sep), v: speed(T.sep) };

/** Where the stack would be if it held its speed and heading from staging on —
 *  the frame the tracking camera rides along in. */
function coast(t: number): Pose {
  const d = SEP.v * Math.max(0, t - T.sep);
  return { x: SEP.x + d * Math.sin(SEP.tilt), y: SEP.y + d * Math.cos(SEP.tilt), z: 0, tilt: SEP.tilt, turn: 0 };
}

/** The two stages, t seconds after ignition. Together until staging. */
export function stages(t: number): { booster: Pose; ship: Pose } {
  if (t < T.sep) {
    const p = climb(t);
    return { booster: p, ship: p };
  }
  const dt = t - T.sep;
  const c = coast(t);
  const s = Math.sin(SEP.tilt);
  const co = Math.cos(SEP.tilt);
  // the ship's engines are lit: it eases off the ring, then pulls away,
  // leaning on over
  const ahead = 0.045 * dt + 0.09 * dt * dt;
  const ship: Pose = {
    x: c.x + ahead * s,
    y: c.y + ahead * co,
    z: 0,
    tilt: SEP.tilt + Math.min(0.18, 0.02 * dt * dt),
    turn: 0,
  };
  // the booster's are out: it drops back, drifts clear of the ship's exhaust
  // and turns over to fly home
  const back = 0.03 * dt + 0.07 * dt * dt;
  const booster: Pose = {
    x: c.x - back * s - 0.035 * dt * dt,
    y: c.y - back * co,
    z: -0.03 * dt * dt,
    tilt: SEP.tilt,
    turn: -Math.PI * 0.92 * smooth(0.35, 3.4, dt),
  };
  return { booster, ship };
}

/** Engines, 0 → 1: the booster's 33 spooling up on the mount, cutting at MECO;
 *  the ship's six lighting for staging. `flash` is the hot-staging bloom, and
 *  `vents` the ring's vents glowing with the ship's exhaust. */
export function engines(t: number): { booster: number; ship: number; flash: number; vents: number } {
  const booster = t < T.meco ? smooth(0.1, 0.6, t) * 0.55 + smooth(0.6, 1.1, t) * 0.45 : 1 - smooth(T.meco, T.meco + 0.22, t);
  const ship = smooth(T.sep - 0.06, T.sep + 0.3, t);
  const dt = t - T.sep;
  const flash = dt < 0 ? 0 : Math.exp(-dt * 3.2) * smooth(0, 0.06, dt);
  const vents = dt < 0 ? 0 : Math.exp(-dt * 1.2) * smooth(0, 0.08, dt);
  return { booster, ship, flash, vents };
}

/** Smoke, in puffs a second: the pad's cloud (ignition and the climb out of
 *  it) and the trail the booster leaves on the way up. */
export function smoke(t: number): { pad: number; trail: number } {
  const pad = smooth(0.1, 0.35, t) * (1 - smooth(T.release + 1.8, T.release + 4.4, t));
  const trail = smooth(T.release + 0.2, T.release + 0.6, t) * (1 - smooth(T.meco - 0.1, T.meco + 0.1, t));
  return { pad: pad * 95, trail: trail * 70 };
}

/** How hard the camera rumbles (pad units): a hum through the start-up, a push
 *  at release that eases off as the stack climbs away, and a small knock at
 *  staging. Far gentler than a shaky-cam: the frame should feel the engines,
 *  not lose the rocket. */
export function shake(t: number): number {
  const hum = smooth(0.1, 0.8, t) * 0.0016;
  const push = smooth(T.release - 0.1, T.release + 0.2, t) * (1 - smooth(T.release + 0.6, T.release + 3.6, t)) * 0.0034;
  const dt = t - T.sep;
  const knock = dt < 0 ? 0 : Math.exp(-dt * 5) * 0.0018;
  return hum * (1 - smooth(T.release + 2, T.release + 4.5, t)) + push + knock;
}

/** The camera: where it is, what it looks at, how much wider than the scene's
 *  lens it shoots (degrees) and how much of the scene's pull-back on narrow
 *  screens it takes (0–1). `cut` numbers the camera: when it changes, the
 *  picture cuts rather than flying from one to the next. */
export interface Shot {
  pos: V3;
  target: V3;
  fov: number;
  pull: number;
  cut: number;
}

function liftoff(t: number): Shot {
  // on the ground across the lake, close in and low, looking up as the stack
  // clears the tower
  const h = height(t);
  return { pos: [-0.25, 0.06 + 0.2 * h, 0.6], target: [across(t) * 0.6, 0.42 + 0.95 * h, 0], fov: 12, pull: 0.5, cut: 0 };
}
function onboard(t: number): Shot {
  // riding above the nose, off to one side, looking down the column past the
  // engines at the trail and the city falling away
  const p = climb(t);
  return { pos: along(p, STACK_TIP + 0.22, -0.34, 0.36), target: along(p, STACK_BASE - 0.5, 0.06), fov: 6, pull: 0, cut: 1 };
}
/** The tracking camera's aim: the staging line, then the pair as they part
 *  (weighted to the ship, the one still under power). */
function pair(t: number): V3 {
  if (t < T.sep) return along(climb(t), STAGING_Y);
  const st = stages(t);
  const line = along(coast(t), STAGING_Y);
  const ship = along(st.ship, SHIP_MID);
  const booster = along(st.booster, BOOSTER_MID);
  const k = smooth(0.2, 2.2, t - T.sep);
  return [mix(line[0], mix(booster[0], ship[0], 0.62), k), mix(line[1], mix(booster[1], ship[1], 0.62), k), 0];
}
function tracking(t: number): Shot {
  // alongside and a touch below, riding with the stack (the coast frame after
  // staging), drawing back as the stages part so both stay in the picture
  const c = t < T.sep ? climb(t) : coast(t);
  const aim = pair(t);
  const back = 1.2 + 0.8 * smooth(T.sep + 0.3, T.sep + 2.6, t);
  const s = Math.sin(c.tilt);
  const co = Math.cos(c.tilt);
  const pos: V3 = [aim[0] + 0.24 * co - 0.12 * s, aim[1] - 0.24 * s - 0.12 * co, back];
  return { pos, target: aim, fov: 6, pull: 0.5, cut: 2 };
}
const HOLD = T.sep + 2.4;
function onward(t: number): Shot {
  // the camera stops chasing: it coasts on from where it was, drifting after
  // the ship only a little, and watches it fly away up into the sky, closing
  // the lens to keep it
  const held = tracking(HOLD).pos;
  const a = coast(HOLD);
  const b = coast(t);
  const s = stages(t).ship;
  const h = stages(HOLD).ship;
  const follow = 0.4;
  const pos: V3 = [
    held[0] + b.x - a.x + (s.x - b.x - (h.x - a.x)) * follow,
    held[1] + b.y - a.y + (s.y - b.y - (h.y - a.y)) * follow,
    held[2],
  ];
  return { pos, target: along(s, SHIP_MID), fov: -13, pull: 0.5, cut: 2 };
}

function blend(a: Shot, b: Shot, k: number): Shot {
  return {
    pos: [mix(a.pos[0], b.pos[0], k), mix(a.pos[1], b.pos[1], k), mix(a.pos[2], b.pos[2], k)],
    target: [mix(a.target[0], b.target[0], k), mix(a.target[1], b.target[1], k), mix(a.target[2], b.target[2], k)],
    fov: mix(a.fov, b.fov, k),
    pull: mix(a.pull, b.pull, k),
    cut: b.cut,
  };
}

export function shot(t: number): Shot {
  if (t < T.onboard) return liftoff(t);
  if (t < T.tracking) return onboard(t);
  if (t < HOLD - 0.2) return tracking(t);
  if (t < HOLD + 0.8) return blend(tracking(t), onward(t), smooth(HOLD - 0.2, HOLD + 0.8, t));
  return onward(t);
}
