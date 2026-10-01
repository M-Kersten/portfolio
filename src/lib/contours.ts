// The terrain behind the timeline, drawn by connecting the dots.
//
// The timeline stands on the same square-dot grid as every other page. Under
// it there's a landscape (a few octaves of value noise, gently lowered along
// the middle where the route runs), and its contour lines are traced across
// the grid as a dot-to-dot: each contour snapped onto the grid's own dots and
// drawn as one smooth line through them. So the lines never wander between
// the dots, they join them, and where the network hasn't been drawn yet
// you're left with exactly the plain grid the rest of the site uses.
//
// The network comes in strips from left to right, so the timeline can draw it
// in as you travel: the past connected, the future still loose dots (Work.tsx).
// Pure and deterministic (seeded): the same size always draws the same land.

/** Integer hash → [0, 1). */
function hash(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise at (x, y) in lattice cells. */
function noise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

interface Land {
  seed: number;
  /** px across the largest features */
  scale: number;
  /** how far the land dips along the middle (0 = not at all) */
  valley: number;
}

/** The land at (x, y) px in a `height`-tall sheet. */
function heightAt(x: number, y: number, height: number, { seed, scale, valley }: Land): number {
  let h = 0;
  let amp = 0.5;
  let f = 1 / scale;
  for (let o = 0; o < 4; o++) {
    h += amp * noise(x * f, y * f, seed + o * 101);
    amp *= 0.5;
    f *= 2;
  }
  const d = (y / height - 0.5) / 0.2;
  return h * 0.85 + (1 - Math.exp(-d * d)) * valley;
}

type Pt = [number, number];

/** Join loose segments into polylines by matching endpoints. */
function join(segs: [Pt, Pt][]): Pt[][] {
  const key = (p: Pt) => Math.round(p[0] * 100) * 1e7 + Math.round(p[1] * 100);
  const ends = new Map<number, number[]>();
  segs.forEach(([a, b], i) => {
    for (const k of [key(a), key(b)]) {
      const l = ends.get(k);
      if (l) l.push(i);
      else ends.set(k, [i]);
    }
  });
  const used = new Uint8Array(segs.length);
  const lines: Pt[][] = [];
  const other = (i: number, p: Pt): Pt => (key(segs[i][0]) === key(p) ? segs[i][1] : segs[i][0]);
  const next = (p: Pt): number => (ends.get(key(p)) ?? []).find((j) => !used[j]) ?? -1;
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line: Pt[] = [segs[i][0], segs[i][1]];
    // grow forward from the tail, then backward from the head
    for (let j = next(line[line.length - 1]); j >= 0; j = next(line[line.length - 1])) {
      used[j] = 1;
      line.push(other(j, line[line.length - 1]));
    }
    for (let j = next(line[0]); j >= 0; j = next(line[0])) {
      used[j] = 1;
      line.unshift(other(j, line[0]));
    }
    lines.push(line);
  }
  return lines;
}

interface HeightGrid {
  /** heights at every `cell` px, (nx + 1) × (ny + 1) of them, row by row */
  h: Float32Array;
  nx: number;
  ny: number;
  cell: number;
  lo: number;
  hi: number;
}

/** Sample the land every `cell` px. */
function heightGrid(width: number, height: number, cell: number, land: Land): HeightGrid {
  const nx = Math.ceil(width / cell);
  const ny = Math.ceil(height / cell);
  const h = new Float32Array((nx + 1) * (ny + 1));
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      const v = heightAt(i * cell, j * cell, height, land);
      h[j * (nx + 1) + i] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  return { h, nx, ny, cell, lo, hi };
}

// Marching squares: for each of the 16 ways a cell's corners can sit above or
// below the line, the cell edges it crosses, in pairs (0 top, 1 right,
// 2 bottom, 3 left). The two saddles (5 and 10) are settled per cell.
const CASES: number[][] = [[], [3, 0], [0, 1], [3, 1], [1, 2], [], [0, 2], [3, 2], [3, 2], [0, 2], [], [1, 2], [3, 1], [0, 1], [3, 0], []];

/** The contour line at height `t`, as polylines in px. */
function contourAt({ h, nx, ny, cell }: HeightGrid, t: number): Pt[][] {
  const row = nx + 1;
  const segs: [Pt, Pt][] = [];
  // where the line crosses edge e of cell (i, j), linearly between its corners
  const cross = (e: number, i: number, j: number): Pt => {
    const [i0, j0, i1, j1] =
      e === 0 ? [i, j, i + 1, j] : e === 1 ? [i + 1, j, i + 1, j + 1] : e === 2 ? [i, j + 1, i + 1, j + 1] : [i, j, i, j + 1];
    const a = h[j0 * row + i0];
    const f = (t - a) / (h[j1 * row + i1] - a || 1e-9);
    return [(i0 + (i1 - i0) * f) * cell, (j0 + (j1 - j0) * f) * cell];
  };
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const tl = h[j * row + i];
      const tr = h[j * row + i + 1];
      const br = h[(j + 1) * row + i + 1];
      const bl = h[(j + 1) * row + i];
      const idx = (tl > t ? 1 : 0) | (tr > t ? 2 : 0) | (br > t ? 4 : 0) | (bl > t ? 8 : 0);
      if (idx === 5 || idx === 10) {
        // a saddle: the cell's mean decides which corners join through it
        const mid = (tl + tr + br + bl) / 4 > t;
        if ((idx === 5) === mid) segs.push([cross(0, i, j), cross(1, i, j)], [cross(3, i, j), cross(2, i, j)]);
        else segs.push([cross(3, i, j), cross(0, i, j)], [cross(1, i, j), cross(2, i, j)]);
        continue;
      }
      const c = CASES[idx];
      if (c.length) segs.push([cross(c[0], i, j), cross(c[1], i, j)]);
    }
  return join(segs);
}

/** Douglas–Peucker: drop the points that sit within `eps` of the line between
 *  their neighbours, keeping the ones that carry the shape. */
function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let far = -1;
    let farD = eps;
    for (let k = a + 1; k < b; k++) {
      const [qx, qy] = pts[k];
      const d = len ? Math.abs(dx * (ay - qy) - dy * (ax - qx)) / len : Math.hypot(qx - ax, qy - ay);
      if (d > farD) {
        farD = d;
        far = k;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

export interface DotNet {
  width: number;
  height: number;
  /** The network in vertical strips, left to right. `lines` holds one subpath
   *  per stretch of contour between two dots, each starting from its left
   *  dot, and `reach` is the longest of them in px, so a dash that long draws
   *  every stretch in from its start. `dots` are the dots the strip connects
   *  first, a size up from the grid's own. */
  chunks: { x0: number; lines: string; dots: string; reach: number }[];
}

/** A stretch of contour between two grid dots, (i1, j1) the left one: its
 *  path from there, and an upper bound on its length. */
interface Stretch {
  i1: number;
  j1: number;
  i2: number;
  j2: number;
  d: string;
  len: number;
}

/** Bezier handles for the stretch p1 → p2 of a centripetal Catmull–Rom curve
 *  (p0 and p3 its neighbours): smooth through every dot, and unlike the
 *  uniform kind it never loops or overshoots where the dots bunch up. */
function handles(p0: Pt, p1: Pt, p2: Pt, p3: Pt): [Pt, Pt] {
  const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const d3 = Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
  const a1 = Math.sqrt(d1);
  const a2 = Math.sqrt(d2);
  const a3 = Math.sqrt(d3);
  const third = (a: Pt, b: Pt): Pt => [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3];
  const c1: Pt =
    d1 < 1e-6
      ? third(p1, p2)
      : [0, 1].map((k) => (d1 * p2[k] - d2 * p0[k] + (2 * d1 + 3 * a1 * a2 + d2) * p1[k]) / (3 * a1 * (a1 + a2))) as Pt;
  const c2: Pt =
    d3 < 1e-6
      ? third(p2, p1)
      : [0, 1].map((k) => (d3 * p1[k] - d2 * p3[k] + (2 * d3 + 3 * a3 * a2 + d2) * p2[k]) / (3 * a3 * (a3 + a2))) as Pt;
  return [c1, c2];
}

export interface DotNetOptions {
  /** the grid: px between dots, and px from the top-left to the first one */
  pitch?: number;
  origin?: number;
  /** contour lines, top to bottom of the land's range */
  levels?: number;
  seed?: number;
  scale?: number;
  valley?: number;
  /** px per strip */
  chunk?: number;
  /** px between samples along a contour, and how far (px) a dot may sit off
   *  the line before it's kept as a bend */
  step?: number;
  eps?: number;
  /** contours shorter than this (px) are left out */
  minLen?: number;
}

/** The land's contours drawn across a dot grid of `pitch`, whose first dot
 *  sits `origin` px in from the top-left (the site's grid: 30 and 15). Each
 *  contour is resampled every `step` px and its samples snapped to the
 *  nearest dot; the dots that carry its shape are kept, and a smooth line is
 *  drawn through them, dot to dot.
 *
 *  A generator, one contour level per step, so a page can spread the work
 *  over a few frames instead of stalling one (see dotNetwork for all at once). */
export function* dotNetworkSteps(
  width: number,
  height: number,
  { pitch = 30, origin = 15, levels = 16, seed = 7, scale = 530, valley = 0.15, chunk = 90, step = 60, eps = 10, minLen = 200 }: DotNetOptions = {},
): Generator<void, DotNet> {
  const maxI = Math.floor((width - origin) / pitch);
  const maxJ = Math.floor((height - origin) / pitch);
  const snap = (v: number, max: number) => Math.max(0, Math.min(max, Math.round((v - origin) / pitch)));
  const px = (i: number) => origin + i * pitch;
  const py = (j: number) => origin + j * pitch;
  const grid = heightGrid(width, height, 15, { seed, scale, valley });
  yield;
  // Each stretch between two dots once, whichever contour drew it first, as
  // its two dots (left one first) and the curve on from the left one.
  const stretches = new Map<number, Stretch>();
  for (let l = 1; l <= levels; l++) {
    for (const line of contourAt(grid, grid.lo + ((grid.hi - grid.lo) * l) / (levels + 1))) {
      // arc length along the contour, to resample it evenly
      const acc = [0];
      for (let k = 1; k < line.length; k++) acc.push(acc[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]));
      const total = acc[acc.length - 1];
      // a contour this short is a pebble, and snaps to a lone triangle
      if (total < minLen) continue;
      const n = Math.max(1, Math.round(total / step));
      const dots: Pt[] = [];
      for (let s = 0, k = 0; s <= n; s++) {
        const at = (total * s) / n;
        while (k < line.length - 2 && acc[k + 1] < at) k++;
        const f = (at - acc[k]) / (acc[k + 1] - acc[k] || 1);
        const d: Pt = [
          snap(line[k][0] + (line[k + 1][0] - line[k][0]) * f, maxI),
          snap(line[k][1] + (line[k + 1][1] - line[k][1]) * f, maxJ),
        ];
        const last = dots[dots.length - 1];
        if (last && last[0] === d[0] && last[1] === d[1]) continue;
        // snapping can step back onto the dot before last: a spike, not a bend
        const prev = dots[dots.length - 2];
        if (prev && prev[0] === d[0] && prev[1] === d[1]) {
          dots.pop();
          continue;
        }
        dots.push(d);
      }
      if (dots.length < 2) continue;
      const P = simplify(dots.map(([i, j]) => [px(i), py(j)] as Pt), eps);
      // a loop's ends meet, so its first and last stretches bend into each other
      const closed = P.length > 3 && P[0][0] === P[P.length - 1][0] && P[0][1] === P[P.length - 1][1];
      const at = (k: number): Pt =>
        closed ? P[(k + P.length - 1) % (P.length - 1)] : P[Math.max(0, Math.min(P.length - 1, k))];
      for (let k = 0; k < P.length - 1; k++) {
        // drawn from its left dot (or its top one, if it's upright)
        const flip = P[k + 1][0] < P[k][0] || (P[k + 1][0] === P[k][0] && P[k + 1][1] < P[k][1]);
        const [a, b] = flip ? [P[k + 1], P[k]] : [P[k], P[k + 1]];
        const i1 = snap(a[0], maxI);
        const j1 = snap(a[1], maxJ);
        const i2 = snap(b[0], maxI);
        const j2 = snap(b[1], maxJ);
        const key = ((i1 * 1000 + j1) * 1000 + i2) * 1000 + j2;
        if (stretches.has(key)) continue;
        const [c1, c2] = handles(at(k - 1), P[k], P[k + 1], at(k + 2));
        const [h1, h2] = flip ? [c2, c1] : [c1, c2];
        const f = (v: number) => Math.round(v * 10) / 10;
        stretches.set(key, {
          i1,
          j1,
          i2,
          j2,
          d: `M${a[0]} ${a[1]}C${f(h1[0])} ${f(h1[1])} ${f(h2[0])} ${f(h2[1])} ${b[0]} ${b[1]}`,
          // the handles' polygon is never shorter than the curve
          len: Math.hypot(h1[0] - a[0], h1[1] - a[1]) + Math.hypot(h2[0] - h1[0], h2[1] - h1[1]) + Math.hypot(b[0] - h2[0], b[1] - h2[1]),
        });
      }
    }
    yield;
  }

  // into strips by each stretch's middle, left to right
  const strips = new Map<number, Stretch[]>();
  for (const st of stretches.values()) {
    const c = Math.floor((px(st.i1) + px(st.i2)) / 2 / chunk);
    const list = strips.get(c);
    if (list) list.push(st);
    else strips.set(c, [st]);
  }
  const seen = new Set<number>();
  const chunks = [...strips.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([c, list]) => {
      list.sort((a, b) => a.i1 + a.i2 - (b.i1 + b.i2));
      let reach = 0;
      let lines = '';
      let dots = '';
      const dot = (i: number, j: number) => {
        const k = i * 10000 + j;
        if (seen.has(k)) return;
        seen.add(k);
        dots += `M${px(i) - 1.5} ${py(j) - 1.5}h3v3h-3z`;
      };
      for (const st of list) {
        reach = Math.max(reach, st.len);
        lines += st.d;
        dot(st.i1, st.j1);
        dot(st.i2, st.j2);
      }
      return { x0: c * chunk, lines, dots, reach: Math.ceil(reach) };
    });
  return { width, height, chunks };
}

/** dotNetworkSteps, run to the end in one go. */
export function dotNetwork(width: number, height: number, options?: DotNetOptions): DotNet {
  const steps = dotNetworkSteps(width, height, options);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}
