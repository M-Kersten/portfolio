// Topographic contours for the timeline's backdrop — the survey sheet the route
// is drawn on. A value-noise height field, periodic along x so the tile repeats
// without a seam, with a valley pressed along the middle so the contour lines
// gather and run alongside the route the way they follow a river road on a map.
// Cut into iso-lines by marching squares, joined into polylines, thinned, and
// written out as one SVG tile: the minor lines, and every fourth one stronger,
// as index contours are on a real sheet.
//
// Pure and deterministic (seeded): the same viewport always draws the same
// terrain, and nothing here touches the DOM, so it can be built once per size.

export interface ContourTile {
  width: number;
  height: number;
  /** path data for the minor contours */
  minor: string;
  /** path data for the index contours (every fourth level) */
  major: string;
}

/** Integer hash → [0, 1). */
function hash(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise at (u, v): u in tile units, periodic over `fx` cells;
 *  v in tile units over `fy` cells (not periodic — the tile never repeats in y). */
function noise(u: number, v: number, fx: number, fy: number, seed: number): number {
  const x = u * fx;
  const y = v * fy;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const wrap = (i: number) => ((i % fx) + fx) % fx;
  const a = hash(wrap(x0), y0, seed);
  const b = hash(wrap(x0 + 1), y0, seed);
  const c = hash(wrap(x0), y0 + 1, seed);
  const d = hash(wrap(x0 + 1), y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** The terrain: four octaves of noise over a valley along the middle. */
function heightAt(u: number, v: number, aspect: number, seed: number): number {
  let h = 0;
  let amp = 0.5;
  let f = 3;
  for (let o = 0; o < 4; o++) {
    h += amp * noise(u, v, f, f / aspect, seed + o * 101);
    amp *= 0.5;
    f *= 2;
  }
  // the valley floor runs along v = 0.5, where the route is drawn
  const d = (v - 0.5) / 0.2;
  const valley = 1 - Math.exp(-d * d);
  return h * 0.85 + valley * 0.55;
}

type Pt = [number, number];

/** Ramer–Douglas–Peucker: drop points that sit within `eps` of the line. */
function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    const [ax, ay] = pts[i0];
    const [bx, by] = pts[i1];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let worst = -1;
    let at = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const dist = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (dist > worst) {
        worst = dist;
        at = i;
      }
    }
    if (worst > eps) {
      keep[at] = 1;
      stack.push([i0, at], [at, i1]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Join loose segments into polylines by matching endpoints. */
function join(segs: [Pt, Pt][]): Pt[][] {
  const key = (p: Pt) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
  const ends = new Map<string, number[]>();
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

/** Build a contour tile `width` × `height` px (repeats seamlessly along x). */
export function contourTile(width: number, height: number, { cell = 9, levels = 15, seed = 7 } = {}): ContourTile {
  const nx = Math.round(width / cell);
  const ny = Math.ceil(height / cell);
  const sx = width / nx; // exact column pitch, so column nx lands on the seam
  const aspect = width / height;
  const grid = new Float32Array((nx + 1) * (ny + 1));
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      // column nx samples u = 1, which the periodic noise maps back onto u = 0
      const h = heightAt(i / nx, Math.min(1, (j * cell) / height), aspect, seed);
      grid[j * (nx + 1) + i] = h;
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  const at = (i: number, j: number) => grid[j * (nx + 1) + i];
  const minor: string[] = [];
  const major: string[] = [];
  const step = (hi - lo) / (levels + 1);
  for (let l = 1; l <= levels; l++) {
    const t = lo + l * step;
    const segs: [Pt, Pt][] = [];
    // where the iso-line crosses a cell edge, linearly between its corners
    const lerp = (i0: number, j0: number, i1: number, j1: number): Pt => {
      const a = at(i0, j0);
      const b = at(i1, j1);
      const f = (t - a) / (b - a || 1e-9);
      return [(i0 + (i1 - i0) * f) * sx, Math.min(height, (j0 + (j1 - j0) * f) * cell)];
    };
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const c0 = at(i, j) > t ? 1 : 0; // top-left
        const c1 = at(i + 1, j) > t ? 1 : 0; // top-right
        const c2 = at(i + 1, j + 1) > t ? 1 : 0; // bottom-right
        const c3 = at(i, j + 1) > t ? 1 : 0; // bottom-left
        const idx = c0 | (c1 << 1) | (c2 << 2) | (c3 << 3);
        if (idx === 0 || idx === 15) continue;
        const top = () => lerp(i, j, i + 1, j);
        const right = () => lerp(i + 1, j, i + 1, j + 1);
        const bottom = () => lerp(i, j + 1, i + 1, j + 1);
        const left = () => lerp(i, j, i, j + 1);
        switch (idx) {
          case 1: case 14: segs.push([left(), top()]); break;
          case 2: case 13: segs.push([top(), right()]); break;
          case 3: case 12: segs.push([left(), right()]); break;
          case 4: case 11: segs.push([right(), bottom()]); break;
          case 6: case 9: segs.push([top(), bottom()]); break;
          case 7: case 8: segs.push([left(), bottom()]); break;
          case 5: case 10: {
            // a saddle: the cell's mean decides which pair of corners connect
            // (above it, the high corners join through the middle and the
            // lines cut off the low ones; below it, the reverse)
            const mid = (at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1)) / 4 > t;
            if ((idx === 5) === mid) {
              segs.push([top(), right()], [left(), bottom()]);
            } else {
              segs.push([left(), top()], [right(), bottom()]);
            }
            break;
          }
        }
      }
    const d = join(segs)
      .map((line) => simplify(line, 0.45))
      .filter((line) => line.length > 1)
      .map((line) => 'M' + line.map((p) => `${r1(p[0])} ${r1(p[1])}`).join('L'))
      .join('');
    (l % 4 === 0 ? major : minor).push(d);
  }
  return { width, height, minor: minor.join(''), major: major.join('') };
}

/** The tile as a CSS url() — strokes in `color`, the index lines stronger;
 *  `weight` scales the stroke (the hover glow draws a little heavier). */
export function contourCss(tile: ContourTile, color: string, minorOpacity: number, majorOpacity: number, weight = 1): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${tile.width}' height='${tile.height}' viewBox='0 0 ${tile.width} ${tile.height}'>` +
    `<g fill='none' stroke='${color}' stroke-linejoin='round' stroke-linecap='round'>` +
    `<path d='${tile.minor}' stroke-opacity='${minorOpacity}' stroke-width='${weight}'/>` +
    `<path d='${tile.major}' stroke-opacity='${majorOpacity}' stroke-width='${1.2 * weight}'/>` +
    `</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
