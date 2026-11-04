// The Philips heart's shape, for heart.tsx: the heart itself, roughed out of a
// few soft lobes the way a sculptor blocks one in, and the vessels its catheter
// runs through. Pure geometry, in the heart's own frame: its middle at the
// origin, +y up, +z its front and +x the patient's left, so that, facing it,
// the apex points down and to your right. The aorta leaves its top, arches
// over to the back and comes down behind it to the projector's lens, LENS_DROP
// below the middle.
import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Quaternion, TubeGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { V3 } from './shared';

/** How far the projector's lens is below the heart's middle (heart.tsx hangs
 *  the heart this far over the chip's lens, build_chip.py: projector). */
export const LENS_DROP = 0.194;
export const R_AORTA = 0.016;
export const R_CORONARY = 0.0036;
export const R_CATHETER = 0.0024;

/* ---------- the heart ---------- */

// Each lobe an ellipsoid: its middle, its radii (across, along its long axis,
// deep) and the way that long axis points, apex to base.
type Lobe = { at: V3; r: V3; up: V3 };
const LOBES: Lobe[] = [
  { at: [0.03, -0.035, 0.0], r: [0.06, 0.118, 0.06], up: [-0.42, 0.82, -0.38] }, // the left ventricle, down to the apex
  { at: [-0.024, -0.01, 0.036], r: [0.058, 0.09, 0.044], up: [-0.3, 0.88, -0.3] }, // the right ventricle, over its front
  { at: [-0.07, 0.055, -0.005], r: [0.045, 0.05, 0.044], up: [0, 1, 0] }, // the right atrium
  { at: [0.02, 0.062, -0.052], r: [0.056, 0.036, 0.04], up: [0.15, 1, 0] }, // the left atrium, behind
];
const BLEND = 0.022; // how softly the lobes run into each other (a groove between the ventricles)
/** The ventricles narrow toward the apex, so it comes to a rounded point
 *  rather than an egg's end: how much, and over how far down the long axis. */
const TAPER = { by: 0.42, over: 0.14 };
/** The apex's way from the middle: the body's mesh has a pole here, so the
 *  tip comes to a clean point. */
const APEX = new Vector3(0.45, -0.8, 0.4).normalize();

const lobes = LOBES.map((l) => ({
  c: new Vector3(...l.at),
  r: new Vector3(...l.r),
  toLocal: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...l.up).normalize()).invert(),
}));
const _q = new Vector3();
// the distance to an ellipsoid, near enough (Quilez's bound), and a soft union
function lobeDist(l: (typeof lobes)[number], p: Vector3) {
  _q.copy(p).sub(l.c).applyQuaternion(l.toLocal);
  const k0 = Math.hypot(_q.x / l.r.x, _q.y / l.r.y, _q.z / l.r.z);
  const k1 = Math.hypot(_q.x / (l.r.x * l.r.x), _q.y / (l.r.y * l.r.y), _q.z / (l.r.z * l.r.z));
  return k1 < 1e-9 ? -Math.min(l.r.x, l.r.y, l.r.z) : (k0 * (k0 - 1)) / k1;
}
function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}
function heartDist(p: Vector3) {
  let d = lobeDist(lobes[0], p);
  for (let i = 1; i < lobes.length; i++) d = smin(d, lobeDist(lobes[i], p), BLEND);
  return d;
}
const _p = new Vector3();
/** How far the surface is from the middle along `dir` (a unit vector): the
 *  outermost crossing, closed in on from outside, so a fold the middle can't
 *  see is simply spanned. */
export function surfaceAt(dir: Vector3): number {
  let r = 0.3;
  while (r > 0 && heartDist(_p.copy(dir).multiplyScalar(r)) > 0) r -= 0.004;
  let lo = r;
  let hi = r + 0.004;
  for (let i = 0; i < 16; i++) {
    const m = (lo + hi) / 2;
    if (heartDist(_p.copy(dir).multiplyScalar(m)) > 0) hi = m;
    else lo = m;
  }
  return (lo + hi) / 2;
}

/** A point of the lobes' surface moved onto the heart's: drawn in toward the
 *  long axis the nearer it is to the apex (see TAPER). Everything that sits on
 *  the heart (the body, the arteries) goes through this, so it stays on it. */
const _ax = new Vector3();
function taper(p: Vector3): Vector3 {
  const a = p.dot(APEX);
  if (a <= 0) return p;
  const t = Math.min(1, a / TAPER.over);
  const k = 1 - TAPER.by * t * t * (3 - 2 * t);
  _ax.copy(APEX).multiplyScalar(a);
  return p.sub(_ax).multiplyScalar(k).add(_ax);
}
/** The point on the heart in the way `dir` (unit) from its middle, `lift`
 *  further out. */
export function onHeart(dir: Vector3, lift = 0, out = new Vector3()): Vector3 {
  return taper(out.copy(dir).multiplyScalar(surfaceAt(dir) + lift));
}

/** The heart's body: a sphere whose poles are its long axis (the apex at the
 *  bottom one), every vertex pushed out along its own direction to the
 *  surface. 32 × 22: about 1,350 triangles. */
export function heartBody(): BufferGeometry {
  const NU = 32;
  const NV = 22;
  const turn = new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), APEX);
  const pos: number[] = [];
  const d = new Vector3();
  const p = new Vector3();
  const push = () => {
    onHeart(d.applyQuaternion(turn), 0, p);
    pos.push(p.x, p.y, p.z);
  };
  d.set(0, 1, 0);
  push();
  for (let j = 1; j < NV; j++) {
    const phi = (j / NV) * Math.PI;
    for (let i = 0; i < NU; i++) {
      const th = (i / NU) * Math.PI * 2;
      d.set(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
      push();
    }
  }
  d.set(0, -1, 0);
  push();
  const at = (j: number, i: number) => 1 + (j - 1) * NU + (i % NU);
  const idx: number[] = [];
  for (let i = 0; i < NU; i++) idx.push(0, at(1, i + 1), at(1, i));
  for (let j = 1; j < NV - 1; j++)
    for (let i = 0; i < NU; i++) {
      idx.push(at(j, i), at(j, i + 1), at(j + 1, i));
      idx.push(at(j, i + 1), at(j + 1, i + 1), at(j + 1, i));
    }
  const last = pos.length / 3 - 1;
  for (let i = 0; i < NU; i++) idx.push(last, at(NV - 1, i), at(NV - 1, i + 1));
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------- the vessels ---------- */

/** A path sampled evenly by length: its points and how far along each one is. */
export type Path = { pts: Vector3[]; at: number[]; len: number };
function evenPath(pts: Vector3[], n: number): Path {
  const sp = new CatmullRomCurve3(pts, false, 'centripetal').getSpacedPoints(n);
  const at = [0];
  for (let i = 1; i < sp.length; i++) at.push(at[i - 1] + sp[i].distanceTo(sp[i - 1]));
  return { pts: sp, at, len: at[at.length - 1] };
}
function seg(p: Path, s: number) {
  const x = Math.max(0, Math.min(p.len, s));
  let lo = 0;
  let hi = p.at.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (p.at[m] <= x) lo = m;
    else hi = m;
  }
  const span = p.at[hi] - p.at[lo];
  return { i: lo, f: span > 0 ? (x - p.at[lo]) / span : 0 };
}
/** The point `s` along a path. */
export function pointAt(p: Path, s: number, out: Vector3): Vector3 {
  const { i, f } = seg(p, s);
  return out.copy(p.pts[i]).lerp(p.pts[i + 1] ?? p.pts[i], f);
}
/** The way a path runs at `s`. */
export function tangentAt(p: Path, s: number, out: Vector3): Vector3 {
  const { i } = seg(p, s);
  const j = Math.min(i + 1, p.pts.length - 1);
  return out.subVectors(p.pts[j], p.pts[j === i ? i - 1 : i]).normalize();
}
/** A tube down a path. Its uv.x runs 0 → 1 by length (TubeGeometry samples its
 *  curve by length), which the flow and the catheter's reach both read. */
export function pathTube(p: Path, r: number, segments: number, radial: number): TubeGeometry {
  return new TubeGeometry(new CatmullRomCurve3(p.pts, false, 'centripetal'), segments, r, radial, false);
}

const v = (a: V3) => new Vector3(...a);
const ROOT_DIR = new Vector3(-0.22, 1, 0.16).normalize(); // where the aorta leaves the heart, on its top
/** The aortic root, on the heart's top: where the aorta starts, the coronary
 *  arteries branch off, and the catheter chooses between them. */
export function rootPoint(): Vector3 {
  return onHeart(ROOT_DIR);
}
// the aorta, from the lens: up behind the heart, over the arch to the front,
// and down onto the root
const TRUNK: V3[] = [
  [0, -LENS_DROP, 0],
  [0.012, -0.17, -0.03],
  [0.045, -0.12, -0.075],
  [0.07, -0.04, -0.09],
  [0.076, 0.06, -0.085],
  [0.062, 0.15, -0.06],
  [0.03, 0.2, -0.026],
  [-0.01, 0.2, 0.0],
  [-0.032, 0.162, 0.014],
];
/** The catheter's way in: out of the lens and up the aorta to its root. */
export function trunkPath(): Path {
  const root = rootPoint();
  return evenPath([...TRUNK.map(v), root.clone().add(new Vector3(0, 0.024, 0)), root], 96);
}
/** The two arteries a narrowing waits in: the left anterior descending, down
 *  the front between the ventricles to the apex, and the right coronary, round
 *  the right side. Each from the root along these ways out from the middle,
 *  pressed onto the surface; `block` is how far along its narrowing sits. */
export const BRANCHES: { dirs: V3[]; block: number }[] = [
  { dirs: [[0.3, 0.7, 0.62], [0.32, 0.3, 0.9], [0.36, -0.12, 0.92], [0.45, -0.52, 0.72], [0.47, -0.8, 0.38]], block: 0.45 },
  { dirs: [[-0.32, 0.66, 0.68], [-0.66, 0.36, 0.66], [-0.86, -0.04, 0.5], [-0.76, -0.44, 0.34], [-0.5, -0.76, 0.18]], block: 0.52 },
];
export function branchPath(b: (typeof BRANCHES)[number]): Path {
  const way = new CatmullRomCurve3([ROOT_DIR.clone(), ...b.dirs.map((d) => v(d).normalize())], false, 'centripetal');
  const pts: Vector3[] = [];
  const n = 64;
  for (let i = 0; i <= n; i++) {
    pts.push(onHeart(way.getPoint(i / n).normalize(), R_CORONARY * 0.5));
  }
  return evenPath(pts, 72);
}
/** The aorta's glass: the trunk from just over the lens (the catheter enters
 *  its open end) to the root. */
export function aortaTube(trunk: Path): TubeGeometry {
  const from = 0.03;
  const pts: Vector3[] = [];
  for (let i = 0; i <= 64; i++) pts.push(pointAt(trunk, from + ((trunk.len - from) * i) / 64, new Vector3()));
  return pathTube(evenPath(pts, 64), R_AORTA, 64, 8);
}
/** The vessels that only make it a heart: the pulmonary trunk out of the right
 *  ventricle's top, the vena cava into the right atrium, and the three arteries
 *  off the top of the arch. One merged glass, no catheter goes in them. */
export function otherVessels(trunk: Path): BufferGeometry {
  const inside = (d: V3, k: number) => {
    const u = v(d).normalize();
    return taper(u.multiplyScalar(surfaceAt(u) * k));
  };
  const tubes = [
    // (kept short, up and away to the left, so it never hides the root)
    pathTube(evenPath([inside([0.38, 0.62, 0.68], 0.84), v([0.07, 0.11, 0.048]), v([0.09, 0.132, 0.026])], 10), 0.012, 10, 8),
    pathTube(evenPath([inside([-0.75, 0.66, -0.05], 0.8), v([-0.072, 0.13, -0.012]), v([-0.07, 0.185, -0.016])], 12), 0.011, 10, 8),
  ];
  // the arch's top, where its three branches leave
  let top = 0;
  for (let i = 1; i < trunk.pts.length; i++) if (trunk.pts[i].y > trunk.pts[top].y) top = i;
  for (const k of [-9, -1, 7]) {
    const p = trunk.pts[Math.max(0, Math.min(trunk.pts.length - 1, top + k))];
    tubes.push(pathTube(evenPath([p.clone().add(new Vector3(0, -0.008, 0)), p.clone().add(new Vector3(0.002, 0.018, 0)), p.clone().add(new Vector3(0.004, 0.036, -0.002))], 6), 0.0055, 6, 6));
  }
  const g = mergeGeometries(tubes);
  for (const t of tubes) t.dispose();
  return g;
}
