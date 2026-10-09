// The launch cinematic's choreography: where the two stages are, what the
// camera shoots, how hard it rumbles and how much smoke the pad makes, as
// plain functions of the film's clock (launchPlan.ts: liftoff at 0, the
// terminal count before it). Nothing here touches the scene — launchSite.tsx
// poses the stages and feeds the smoke from it every frame, and hands the
// camera its shot (launchShot in views.ts) for CameraRig to fly.
//
// Cut like a launch broadcast: a long lens on the pad through the terminal
// count (the ship's arm swings back); a camera down by the mount for the
// deluge and the Raptor startup, ring by ring; the apron, wide, for the steam
// and the release; looking straight up the stack as it climbs slowly past the
// chopsticks. Clear of the tower, the film turns
// into a time-lapse: a camera on the stack looking down the column through
// Max-Q; alongside for MECO and hot staging; then the ship flying on while the
// booster turns back. Last, the tower again: the booster falls out of the sky,
// lights its landing burn and the chopsticks close round it.
//
// The frame is the camera's side of the pad: x across the frame (the way the
// gravity turn leans the climb), y up, z toward where the cameras watch from,
// in the pad's own units, the stack's base at the origin. launchSite.tsx maps
// it onto the pad's axes.
import { STACK_BASE, STACK_TIP, STAGING_Y } from './rocket';
import { COUNT, T, smooth } from '../launchPlan';

export { T };

/** Up a stage's body: the ship's middle, and the booster's (it flips about
 *  that, not about its skirt). */
export const SHIP_MID = (STAGING_Y + STACK_TIP) / 2;
export const BOOSTER_MID = (STACK_BASE + STAGING_Y) / 2;

/** Where the chopsticks hold the booster: how far its group sits above the
 *  mount when caught, and the arms' height then (the grid fins rest on them). */
export const CATCH_Y = 0.17;
export const CATCH_ARMS = CATCH_Y + 0.468 - 0.006;
/** The arms' parked height through the launch, high on the tower. */
export const PARK_ARMS = 0.73;
/** Where the tower stands in this frame (launchSite.tsx places it). */
export const TOWER_X = 0.173;
export const TOWER_Z = -0.052;

const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/* ---------- the climb ---------- */

/** Height of the stack above the mount. Real time to the tower: about half a g
 *  of climb, so the stack clears the tower top a little after six seconds,
 *  heavy and slow. After that the film is a time-lapse and it climbs faster
 *  every second. */
function height(t: number): number {
  const u = Math.max(0, t - T.release);
  if (u <= T.clear) return 0.02 * u * u;
  const w = u - T.clear;
  return 0.02 * T.clear * T.clear + 0.04 * T.clear * w + 0.14 * w * w + 0.03 * w * w * w;
}
function speed(t: number): number {
  const u = Math.max(0, t - T.release);
  if (u <= T.clear) return 0.04 * u;
  const w = u - T.clear;
  return 0.04 * T.clear + 0.28 * w + 0.09 * w * w;
}
/** The gravity turn: the stack starts leaning over once it's clear of the tower. */
function pitch(t: number): number {
  const u = Math.max(0, t - T.clear + 0.6);
  return Math.min(0.5, 0.013 * u * u);
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

/** The booster coming home: falling tail-first out of the sky over the water,
 *  sliding in over the tower as it brakes on its landing burn, and coming to a
 *  stop with its grid fins on the chopsticks — a small dip as the arms take
 *  the weight, and still. */
function homecoming(t: number): Pose {
  const v0 = 0.78; // units/s when the burn lights
  const brake = T.catch - T.landing;
  let y: number;
  if (t < T.landing) y = CATCH_Y + (v0 * brake) / 2 + v0 * (T.landing - t);
  else if (t < T.catch) {
    const r = T.catch - t;
    y = CATCH_Y + (v0 * r * r) / (2 * brake);
  } else {
    const s = t - T.catch;
    y = CATCH_Y - 0.008 * Math.exp(-s * 3.2) * Math.sin(s * 10);
  }
  // the divert: in from the far side, leaning into it, lined up over the
  // mount for the last second
  const k = 1 - smooth(T.ret, T.catch - 0.7, t);
  return { x: -0.2 * k * k, y, z: -0.06 * k * k, tilt: 0.09 * k * k * (k > 0 ? 1 : 0), turn: 0 };
}

/** The two stages, t seconds after liftoff (negative through the count: on the
 *  mount). Together until staging; after the cut back to the tower the
 *  booster is on its way home and the ship far out of the picture. */
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
  const ahead = 0.06 * dt + 0.1 * dt * dt;
  const ship: Pose = {
    x: c.x + ahead * s,
    y: c.y + ahead * co,
    z: 0,
    tilt: SEP.tilt + Math.min(0.18, 0.02 * dt * dt),
    turn: 0,
  };
  if (t >= T.ret) return { booster: homecoming(t), ship };
  // the booster's are out: it drops back, drifts clear of the ship's exhaust
  // and turns over to fly home; its boostback burn takes the speed off fast
  const bb = Math.max(0, t - T.boostback);
  const back = 0.03 * dt + 0.07 * dt * dt + 0.22 * bb * bb;
  const booster: Pose = {
    x: c.x - back * s - 0.035 * dt * dt,
    y: c.y - back * co,
    z: -0.03 * dt * dt,
    tilt: SEP.tilt,
    turn: -Math.PI * 0.92 * smooth(0.3, T.boostback - T.sep, dt),
  };
  return { booster, ship };
}

/** The booster's flame pointing: how far the plumes lengthen and spread as
 *  the air thins (1 on the ground), from the stack's altitude in pad units. */
export function plumeAir(t: number): { wide: number; long: number; flare: number } {
  if (t >= T.ret) return { wide: 1, long: 1, flare: 1 };
  const alt = height(Math.min(t, T.sep));
  const thin = smooth(1.5, 9, alt);
  return { wide: 1 + Math.min(1.4, alt * 0.12), long: 1 + Math.min(2.2, alt * 0.22), flare: 1 + 2.4 * thin };
}

/** The hot-staging moments: the flash between the stages as the ship lights,
 *  and the ring's vents pouring its exhaust out sideways. */
export function staging(t: number): { flash: number; jets: number; vents: number } {
  const dt = t - T.hotstage;
  if (dt < 0 || t >= T.ret) return { flash: 0, jets: 0, vents: 0 };
  const flash = Math.exp(-dt * 3.2) * smooth(0, 0.06, dt);
  const jets = smooth(0, 0.08, dt) * (1 - smooth(T.sep - T.hotstage - 0.05, T.sep - T.hotstage + 0.35, dt));
  const vents = Math.exp(-dt * 1.1) * smooth(0, 0.08, dt);
  return { flash, jets, vents };
}

/** The ship's quick-disconnect arm, 0 (on the ship) → 1 (swung back). */
export function qdArm(t: number): number {
  return smooth(T.qd, T.qd + 1.4, t);
}
/** The booster's quick-disconnect hood at the mount, 0 → 1 (retracted at
 *  liftoff). */
export function bqd(t: number): number {
  return smooth(T.release - 0.15, T.release + 0.5, t);
}
/** The chopsticks: their height up the tower and how far open (radians each
 *  side). Parked high and open for the launch; for the catch, down at the
 *  grid fins' height and wide, closing round the booster as it comes in. */
export function chopsticks(t: number): { y: number; open: number } {
  if (t < T.ret) return { y: PARK_ARMS, open: 0.62 };
  const close = smooth(T.close, T.catch - 0.04, t);
  return { y: CATCH_ARMS, open: mix(0.78, 0.03, close) };
}

/** Smoke, in puffs a second: the deluge's spray, the steam the engines make
 *  of it (the cloud the stack climbs out of), the trail up the sky, the RCS
 *  thrusters turning the booster, the landing burn on the mount, and the
 *  caught booster venting. */
export function smoke(t: number): { spray: number; steam: number; trail: number; rcs: number; landing: number; vent: number } {
  const spray = smooth(T.deluge, T.deluge + 0.4, t) * (1 - smooth(T.release + 1.5, T.release + 4, t));
  const steam = smooth(T.startup, T.outer + 0.3, t) * (1 - smooth(T.release + 3.5, T.release + 6.5, t));
  const trail = smooth(T.release + 2.2, T.release + 3.2, t) * (1 - smooth(T.meco - 0.1, T.meco + 0.1, t));
  const rcs = t > T.sep + 0.3 && t < T.boostback ? 1 : 0;
  const landing = smooth(T.landing + 1.3, T.landing + 1.8, t) * (1 - smooth(T.catch, T.catch + 0.3, t));
  const vent = t > T.catch + 0.2 ? 1 : 0;
  return { spray: spray * 70, steam: steam * 150, trail: trail * 70, rcs: rcs * 26, landing: landing * 90, vent: vent * 18 };
}

/** How hard the camera rumbles (pad units): a hum as the engines start, the
 *  ground shaking under the ground camera at the release and easing off as
 *  the stack climbs away, a knock at staging, and the tower camera feeling
 *  the landing burn and the catch. The frame should feel the engines, not
 *  lose the rocket. */
export function shake(t: number): number {
  const hum = smooth(T.startup, T.outer + 0.4, t) * (1 - smooth(T.release + 1, T.release + 3, t)) * 0.0016;
  const push = smooth(T.release - 0.3, T.release + 0.2, t) * (1 - smooth(T.release + 1.5, T.release + 6, t)) * 0.0034;
  const dt = t - T.hotstage;
  const knock = dt < 0 || t > T.ret ? 0 : Math.exp(-dt * 5) * 0.0018;
  const land = smooth(T.landing, T.landing + 0.4, t) * (1 - smooth(T.catch - 0.2, T.catch + 0.1, t)) * 0.0012;
  const ct = t - T.catch;
  const jolt = ct < 0 ? 0 : Math.exp(-ct * 6) * 0.0022;
  return hum + push + knock + land + jolt;
}

/* ---------- the cameras ---------- */

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

function count(t: number): Shot {
  // a long lens from high across the site, over the trees: the stack and the
  // tower together, the ship's arm swinging back, pushing in slowly
  const k = smooth(T.start, ENGINE_CAM, t);
  return { pos: [mix(-0.34, -0.26, k), mix(0.8, 0.72, k), mix(1.8, 1.6, k)], target: [0.07, mix(0.42, 0.38, k), -0.02], fov: mix(-15, -13, k), pull: 0.5, cut: 0 };
}
/** When the count cuts to the mount, and from the mount to the apron. */
const ENGINE_CAM = -4.8;
const APRON_CAM = -0.9;
function mountCam(t: number): Shot {
  // low by the mount, close on the skirt: the deluge coming on, then the
  // Raptors lighting under it — the centre three, the ten, the twenty
  const k = smooth(ENGINE_CAM, APRON_CAM, t);
  return { pos: [mix(-0.13, -0.11, k), 0.05, mix(0.24, 0.21, k)], target: [0.01, 0.1, 0], fov: 8, pull: 0.3, cut: 8 };
}
function ignition(t: number): Shot {
  // down on the apron, wide and low, for the startup and the release: the
  // stack towering, the tower lit by the engines, the steam rolling out
  const h = height(t);
  return { pos: [-0.22, 0.08, 0.44], target: [0.02, 0.24 + 0.6 * h, 0], fov: 22, pull: 0.3, cut: 1 };
}
function liftoff(t: number): Shot {
  // the same corner of the apron, looking straight up the stack as it climbs
  // past the chopsticks and clears the tower
  const h = height(t);
  return { pos: [-0.06, 0.04, 0.4], target: [0.02, 0.36 + 0.95 * h, 0], fov: 16, pull: 0.3, cut: 2 };
}
function onboard(t: number): Shot {
  // riding above the nose, off to one side, looking down the column past the
  // engines at the trail and the ground falling away
  const p = climb(t);
  return { pos: along(p, STACK_TIP + 0.22, -0.34, 0.36), target: along(p, STACK_BASE - 0.5, 0.06), fov: 6, pull: 0, cut: 3 };
}
/** The tracking camera's aim: the staging line, then the pair as they part
 *  (weighted to the ship at first, then to the booster as it turns back and
 *  lights its boostback). */
function pair(t: number): V3 {
  if (t < T.sep) return along(climb(t), STAGING_Y);
  const st = stages(t);
  const line = along(coast(t), STAGING_Y);
  const ship = along(st.ship, SHIP_MID);
  const booster = along(st.booster, BOOSTER_MID);
  const k = smooth(0.2, 2.2, t - T.sep);
  const w = mix(0.62, 0.42, smooth(T.boostback - 0.6, T.boostback + 0.8, t));
  return [mix(line[0], mix(booster[0], ship[0], w), k), mix(line[1], mix(booster[1], ship[1], w), k), 0];
}
function tracking(t: number): Shot {
  // alongside and a touch below, riding with the stack (the coast frame after
  // staging), drawing back as the stages part so both stay in the picture
  const c = t < T.sep ? climb(t) : coast(t);
  const aim = pair(t);
  const back = 1.2 + 1.0 * smooth(T.sep + 0.3, T.sep + 2.6, t);
  const s = Math.sin(c.tilt);
  const co = Math.cos(c.tilt);
  const pos: V3 = [aim[0] + 0.24 * co - 0.12 * s, aim[1] - 0.24 * s - 0.12 * co, back];
  return { pos, target: aim, fov: 6, pull: 0.5, cut: 4 };
}
function onward(t: number): Shot {
  // the camera stops chasing: it coasts on from where it was, drifting after
  // the ship only a little, and watches it fly away up into the sky, closing
  // the lens to keep it
  const held = tracking(T.onward).pos;
  const a = coast(T.onward);
  const b = coast(t);
  const s = stages(t).ship;
  const h = stages(T.onward).ship;
  const follow = 0.4;
  const pos: V3 = [
    held[0] + b.x - a.x + (s.x - b.x - (h.x - a.x)) * follow,
    held[1] + b.y - a.y + (s.y - b.y - (h.y - a.y)) * follow,
    held[2],
  ];
  return { pos, target: along(s, SHIP_MID), fov: -13, pull: 0.5, cut: 5 };
}
function homeWide(t: number): Shot {
  // the long lens again, from high across the site: the tower waiting with its
  // arms open, the booster falling into the frame and the lens following it
  // down onto the tower
  const b = homecoming(t);
  const k = smooth(T.ret, T.closeUp, t);
  const aim = mix(b.y + BOOSTER_MID * 0.6, CATCH_ARMS - 0.1, smooth(T.landing, T.closeUp, t));
  return { pos: [mix(-0.3, -0.24, k), 0.66, mix(1.8, 1.6, k)], target: [0.05, Math.max(aim, 0.4), -0.03], fov: -12, pull: 0.5, cut: 6 };
}
function catchUp(t: number): Shot {
  // low by the mount, looking up into the landing burn and the arms closing
  // round it, pushing in slowly
  const k = smooth(T.closeUp, T.end, t);
  return { pos: [mix(-0.16, -0.13, k), mix(0.22, 0.24, k), mix(0.56, 0.5, k)], target: [0.04, CATCH_ARMS - 0.14, -0.03], fov: 14, pull: 0.4, cut: 7 };
}

export function shot(t: number): Shot {
  if (t < ENGINE_CAM) return count(t);
  if (t < APRON_CAM) return mountCam(t);
  if (t < 2.2) return ignition(t);
  if (t < T.clear) return liftoff(t);
  if (t < T.tracking) return onboard(t);
  if (t < T.onward) return tracking(t);
  if (t < T.ret) return onward(t);
  if (t < T.closeUp) return homeWide(t);
  return catchUp(t);
}

/** Seconds since the film began (the count's first frame). */
export const sinceStart = (t: number) => t + COUNT;
