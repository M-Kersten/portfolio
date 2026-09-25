// Geometry for the code-built models — the shapes a primitive can't give you:
// boxes with rounded edges that can be crowned, bulged, tapered and bent, so a
// cushion is a cushion and not a rounded brick; turned (lathed) profiles; tubes
// for piping, rails and handles; folded leaves; and a merge, so each tone of an
// object is one mesh — one material, one draw call, one lit body.
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Euler,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix4,
  Quaternion,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useEffect, useMemo, type DependencyList } from 'react';

type V3 = [number, number, number];

/** Build geometry once per deps and dispose it when it goes. */
export function useGeometry<T extends BufferGeometry | Record<string, BufferGeometry>>(build: () => T, deps: DependencyList = []): T {
  const g = useMemo(build, deps);
  useEffect(
    () => () => {
      if (g instanceof BufferGeometry) g.dispose();
      else for (const k of Object.keys(g)) (g as Record<string, BufferGeometry>)[k].dispose();
    },
    [g],
  );
  return g;
}

/** How a soft box is shaped after its edges are rounded. Distances in world
 *  units; every deformation falls off to nothing at the box's edges, so parts
 *  still meet their neighbours where they were placed. */
export type Soft = {
  /** subdivisions across each rounded edge band (smoothness of the round) */
  band?: number;
  /** subdivisions across the flat of each face — raise it for a shaped face */
  mid?: number;
  /** the top pushed up in the middle (a cushion); negative dishes it */
  crown?: number;
  /** the front (+z) face pushed out in the middle (a pillow, a seat front) */
  bulge?: number;
  /** the back (-z) face pushed out in the middle */
  bulgeBack?: number;
  /** width and depth at the top relative to the bottom (1 = straight) */
  taper?: number;
  /** curved in plan: the ends pulled back (-z) by this much (a chair back) */
  bend?: number;
  /** the top slid forward (+z) by this much relative to the bottom */
  lean?: number;
};

/** Coordinates along one axis: `band` steps across each rounded end, `mid`
 *  across the flat between them. */
function axis(len: number, r: number, band: number, mid: number) {
  const h = len / 2;
  const out: number[] = [];
  for (let i = 0; i < band; i++) out.push(-h + (r * i) / band);
  for (let i = 0; i < mid; i++) out.push(-h + r + ((len - 2 * r) * i) / mid);
  for (let i = 0; i <= band; i++) out.push(h - r + (r * i) / band);
  return out;
}

/** The shaping half of softBox, for a point already on the rounded box's
 *  surface — so piping, seams and anything else traced on a soft box can
 *  follow its crown and bulge exactly. */
function shapeXYZ(x: number, y: number, z: number, w: number, h: number, d: number, o: Soft): V3 {
  const u = x / (w / 2);
  const v = y / (h / 2);
  const s = z / (d / 2);
  const fu = 1 - u * u;
  if (o.crown) y += o.crown * fu * (1 - s * s) * Math.max(0, v);
  if (o.bulge) z += o.bulge * fu * (1 - v * v) * Math.max(0, s);
  if (o.bulgeBack) z -= o.bulgeBack * fu * (1 - v * v) * Math.max(0, -s);
  if (o.taper !== undefined && o.taper !== 1) {
    const f = 1 + ((o.taper - 1) * (v + 1)) / 2;
    x *= f;
    z *= f;
  }
  if (o.lean) z += (o.lean * (v + 1)) / 2;
  if (o.bend) z -= o.bend * u * u;
  return [x, y, z];
}

/** The seam where a soft box's face meets its rounded edge band, as a closed
 *  loop of points: 'top' runs round the top face (a cushion's welt), 'front'
 *  round the +z face. Shaped like the box, so it sits on the surface. */
export function softSeam(w: number, h: number, d: number, r: number, o: Soft, face: 'top' | 'front', perCorner = 5): V3[] {
  r = Math.max(1e-4, Math.min(r, w / 2, h / 2, d / 2));
  const k = 0.29 * r; // the band's midpoint, in from the face
  const raw =
    face === 'top'
      ? roundedRectPath(w - 2 * k, d - 2 * k, r - k, h / 2 - k, perCorner)
      : roundedRectPath(w - 2 * k, h - 2 * k, r - k, 0, perCorner).map(([x, , zz]) => [x, zz, d / 2 - k] as V3);
  return raw.map(([x, y, z]) => shapeXYZ(x, y, z, w, h, d, o));
}

/** A box with every edge rounded to `r`, evenly subdivided so it can be shaped
 *  (see Soft), with smooth normals. Centred on the origin. */
export function softBox(w: number, h: number, d: number, r: number, o: Soft = {}): BufferGeometry {
  r = Math.max(1e-4, Math.min(r, w / 2, h / 2, d / 2));
  const band = o.band ?? 3;
  const mid = o.mid ?? 2;
  const ax = [axis(w, r, band, mid), axis(h, r, band, mid), axis(d, r, band, mid)];
  const n = 2 * band + mid;
  const box = new BoxGeometry(1, 1, 1, n, n, n);
  box.deleteAttribute('uv');
  box.deleteAttribute('normal');
  const pos = box.attributes.position as Float32BufferAttribute;
  const inner = [w / 2 - r, h / 2 - r, d / 2 - r];
  const p = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    // the unit box's grid index on each axis → that axis's coordinate list
    for (let k = 0; k < 3; k++) p[k] = ax[k][Math.round((pos.getComponent(i, k) + 0.5) * n)];
    // round: pull the point onto the sphere of radius r around the inner box
    const cx = Math.max(-inner[0], Math.min(inner[0], p[0]));
    const cy = Math.max(-inner[1], Math.min(inner[1], p[1]));
    const cz = Math.max(-inner[2], Math.min(inner[2], p[2]));
    const nx = p[0] - cx;
    const ny = p[1] - cy;
    const nz = p[2] - cz;
    const l = Math.hypot(nx, ny, nz) || 1;
    const [x, y, z] = shapeXYZ(cx + (nx / l) * r, cy + (ny / l) * r, cz + (nz / l) * r, w, h, d, o);
    pos.setXYZ(i, x, y, z);
  }
  const out = mergeVertices(box, 1e-6);
  out.computeVertexNormals();
  box.dispose();
  return out;
}

/** A turned profile: [radius, height] pairs from the bottom centre round to
 *  the top centre. Repeat a point to put a crisp edge there. */
export function lathe(profile: [number, number][], segments = 32): BufferGeometry {
  const g = new LatheGeometry(
    profile.map(([r, y]) => new Vector2(Math.max(r, 1e-5), y)),
    segments,
  );
  g.deleteAttribute('uv');
  return g;
}

/** A round tube along a path (piping, a rail, a handle). */
export function tube(points: V3[], radius: number, radial = 6, segments = 0, closed = false): BufferGeometry {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)), closed, 'centripetal');
  const g = new TubeGeometry(curve, segments || Math.max(8, points.length * 6), radius, radial, closed);
  g.deleteAttribute('uv');
  return g;
}

/** Points round a rounded rectangle in the XZ plane (for piping on a cushion
 *  top or a table edge), `perCorner` per quarter round. */
export function roundedRectPath(w: number, d: number, r: number, y = 0, perCorner = 4): V3[] {
  const pts: V3[] = [];
  const cx = w / 2 - r;
  const cz = d / 2 - r;
  const corners: [number, number, number][] = [
    [cx, cz, 0],
    [-cx, cz, Math.PI / 2],
    [-cx, -cz, Math.PI],
    [cx, -cz, (3 * Math.PI) / 2],
  ];
  for (const [x, z, a0] of corners) {
    for (let i = 0; i <= perCorner; i++) {
      const a = a0 + (i / perCorner) * (Math.PI / 2);
      pts.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r]);
    }
  }
  return pts;
}

/** A leaf: a strap along a curve that widens from the stalk, then narrows to a
 *  point, folded along its midrib, with a hair of thickness so it has a top
 *  and an underside (the glass is single-sided). `side` is the direction
 *  across the leaf. */
export function leaf(path: V3[], width: number, side: V3, o: { fold?: number; thick?: number; seg?: number; widest?: number } = {}) {
  const fold = o.fold ?? 0.35;
  const thick = o.thick ?? 0.0025;
  const seg = o.seg ?? 16;
  const widest = o.widest ?? 0.4;
  const curve = new CatmullRomCurve3(path.map((p) => new Vector3(...p)));
  const S = new Vector3(...side).normalize();
  const pos: number[] = [];
  const P = new Vector3();
  const T = new Vector3();
  const N = new Vector3();
  const rows: Vector3[][] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, P);
    curve.getTangentAt(t, T);
    N.crossVectors(S, T).normalize(); // the leaf's face normal
    const Si = new Vector3().crossVectors(T, N).normalize(); // re-orthogonalised across
    // width: grows from the stalk to the widest point, then a long taper to the tip
    const wv = t < widest ? Math.sin((t / widest) * (Math.PI / 2)) : Math.cos(((t - widest) / (1 - widest)) * (Math.PI / 2));
    const hw = (width / 2) * Math.max(wv, 0.04);
    const mid = P.clone().addScaledVector(N, hw * fold); // the midrib stands proud
    rows.push([
      P.clone().addScaledVector(Si, -hw),
      mid,
      P.clone().addScaledVector(Si, hw),
      N.clone(),
    ]);
  }
  const push = (a: Vector3, b: Vector3, c: Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (const face of [1, -1]) {
    for (let i = 0; i < seg; i++) {
      const A = rows[i];
      const B = rows[i + 1];
      const off = (row: Vector3[], k: number) => row[k].clone().addScaledVector(row[3], (face * thick) / 2);
      for (let k = 0; k < 2; k++) {
        const a = off(A, k);
        const b = off(A, k + 1);
        const c = off(B, k);
        const d = off(B, k + 1);
        // wound so each surface faces away from the other
        if (face > 0) {
          push(a, b, c);
          push(b, d, c);
        } else {
          push(a, c, b);
          push(b, c, d);
        }
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  const merged = mergeVertices(g, 1e-6);
  merged.computeVertexNormals();
  g.dispose();
  return merged;
}

/** A plain box, for small parts too far away to need a rounded edge. */
export function block(w: number, h: number, d: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  g.deleteAttribute('uv');
  return g;
}

/** Flat-shaded: every face its own normal, so a lathed octagon reads as eight
 *  panels (a smock mill, a faceted pine) instead of a smooth round. */
export function faceted(g: BufferGeometry): BufferGeometry {
  const f = g.index ? g.toNonIndexed() : g;
  f.deleteAttribute('normal');
  f.computeVertexNormals();
  if (f !== g) g.dispose();
  return f;
}

/** Move a geometry into place (mutates and returns it). */
export function place(g: BufferGeometry, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 | number = 1): BufferGeometry {
  const sc = typeof s === 'number' ? new Vector3(s, s, s) : new Vector3(...s);
  return g.applyMatrix4(new Matrix4().compose(new Vector3(...p), new Quaternion().setFromEuler(new Euler(...r)), sc));
}

/** A leg hung from its top: built pointing down from the origin, so a splay
 *  rotates it about the joint rather than about its middle. `len` is the
 *  part's height as built (centred on its origin). */
export function hang(g: BufferGeometry, len: number, at: V3, splay: V3 = [0, 0, 0]): BufferGeometry {
  return place(place(g, [0, -len / 2, 0]), at, splay);
}

/** One geometry from many: every part keeps its own normals, and nothing but
 *  position and normal survives (these models are untextured). */
export function merge(parts: BufferGeometry[]): BufferGeometry {
  const flat = parts.map((g) => {
    const f = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(f.attributes)) if (k !== 'position' && k !== 'normal') f.deleteAttribute(k);
    if (!f.attributes.normal) f.computeVertexNormals();
    if (f !== g) g.dispose();
    return f;
  });
  const out = mergeGeometries(flat, false);
  for (const f of flat) f.dispose();
  if (!out) throw new Error('merge: parts do not share attributes');
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/** Triangle count, for the notes. */
export function tris(g: BufferGeometry) {
  return (g.index ? g.index.count : g.attributes.position.count) / 3;
}
