// The canyon map behind the timeline: topographic contours on a survey sheet,
// the route running along the canyon floor. A value-noise height field,
// periodic along x so the tile repeats without a seam, with a valley pressed
// along the middle so the contour lines gather and run alongside the route the
// way they follow a river road on a map. Cut into iso-lines by marching
// squares, joined into polylines, thinned, and written out as one SVG tile:
// the minor lines, and every fourth one stronger, as index contours are on a
// real sheet.
//
// The same tile is drawn in several inks (contourCss): as lines, and as trails
// of the site's square dots along the very same lines, from a sparse scatter to
// a dot every few pixels. The timeline shows the scatter far ahead of you, the
// trail filling in as you come up to it and the lines behind (Work.tsx), so
// travelling it is what weaves the map together from its points.
//
// Pure and deterministic (seeded): the same size always draws the same
// terrain, and nothing here touches the DOM.

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

// Marching squares: for each of the 16 ways a cell's corners can sit above or
// below the line, the cell edges it crosses, in pairs (0 top, 1 right,
// 2 bottom, 3 left). The two saddles (5 and 10) are settled per cell.
const CASES: number[][] = [[], [3, 0], [0, 1], [3, 1], [1, 2], [], [0, 2], [3, 2], [3, 2], [0, 2], [], [1, 2], [3, 1], [0, 1], [3, 0], []];

/** Build a contour tile `width` × `height` px (repeats seamlessly along x),
 *  one contour level per step, so a page can spread the work over a few
 *  frames instead of stalling one (contourTile runs it all at once). */
export function* contourTileSteps(
  width: number,
  height: number,
  { cell = 8, levels = 18, seed = 7 } = {},
): Generator<void, ContourTile> {
  const nx = Math.round(width / cell);
  const ny = Math.ceil(height / cell);
  const sx = width / nx; // exact column pitch, so column nx lands on the seam
  const aspect = width / height;
  const row = nx + 1;
  const grid = new Float32Array(row * (ny + 1));
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      // column nx samples u = 1, which the periodic noise maps back onto u = 0
      const h = heightAt(i / nx, Math.min(1, (j * cell) / height), aspect, seed);
      grid[j * row + i] = h;
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  yield;
  const minor: string[] = [];
  const major: string[] = [];
  const step = (hi - lo) / (levels + 1);
  for (let l = 1; l <= levels; l++) {
    const t = lo + l * step;
    const segs: [Pt, Pt][] = [];
    // where the iso-line crosses edge e of cell (i, j), linearly between its corners
    const cross = (e: number, i: number, j: number): Pt => {
      const [i0, j0, i1, j1] =
        e === 0 ? [i, j, i + 1, j] : e === 1 ? [i + 1, j, i + 1, j + 1] : e === 2 ? [i, j + 1, i + 1, j + 1] : [i, j, i, j + 1];
      const a = grid[j0 * row + i0];
      const f = (t - a) / (grid[j1 * row + i1] - a || 1e-9);
      return [(i0 + (i1 - i0) * f) * sx, Math.min(height, (j0 + (j1 - j0) * f) * cell)];
    };
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const tl = grid[j * row + i];
        const tr = grid[j * row + i + 1];
        const br = grid[(j + 1) * row + i + 1];
        const bl = grid[(j + 1) * row + i];
        const idx = (tl > t ? 1 : 0) | (tr > t ? 2 : 0) | (br > t ? 4 : 0) | (bl > t ? 8 : 0);
        if (idx === 5 || idx === 10) {
          // a saddle: the cell's mean decides which pair of corners connect
          // (above it, the high corners join through the middle and the lines
          // cut off the low ones; below it, the reverse)
          const mid = (tl + tr + br + bl) / 4 > t;
          if ((idx === 5) === mid) segs.push([cross(0, i, j), cross(1, i, j)], [cross(3, i, j), cross(2, i, j)]);
          else segs.push([cross(3, i, j), cross(0, i, j)], [cross(1, i, j), cross(2, i, j)]);
          continue;
        }
        const c = CASES[idx];
        if (c.length) segs.push([cross(c[0], i, j), cross(c[1], i, j)]);
      }
    const d = join(segs)
      .map((line) => simplify(line, 0.45))
      .filter((line) => line.length > 1)
      .map((line) => 'M' + line.map((p) => `${r1(p[0])} ${r1(p[1])}`).join('L'))
      .join('');
    (l % 4 === 0 ? major : minor).push(d);
    yield;
  }
  return { width, height, minor: minor.join(''), major: major.join('') };
}

/** contourTileSteps, run to the end in one go. */
export function contourTile(width: number, height: number, options?: { cell?: number; levels?: number; seed?: number }): ContourTile {
  const steps = contourTileSteps(width, height, options);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

export interface ContourInk {
  color: string;
  /** stroke opacity of the minor and the index contours */
  minor: number;
  major: number;
  /** stroke width (the index lines are drawn a fifth heavier) */
  weight?: number;
  /** draw the lines as a trail of square dots, `size` px every `pitch` px,
   *  the first `phase` px along each line. Trails whose pitches divide one
   *  another and whose phases interleave never land a dot on the same spot:
   *  every 40 px, then every 40 from 20, then every 20 from 10 add up to a
   *  dot every 10. */
  dots?: { size: number; pitch: number; phase?: number };
}

/** The tile as a CSS url(), in the given ink. */
export function contourCss(tile: ContourTile, { color, minor, major, weight = 1, dots }: ContourInk): string {
  // Square dots: dashes as long as the stroke is wide, with butt ends. The
  // dash pattern starts over at every line, so a phase places the first dot
  // the same way on all of them.
  const stroke = (w: number) =>
    dots
      ? `stroke-width='${dots.size * w}' stroke-dasharray='${dots.size * w} ${dots.pitch - dots.size * w}' stroke-dashoffset='${(dots.pitch - (dots.phase ?? 0)) % dots.pitch}'`
      : `stroke-width='${weight * w}'`;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${tile.width}' height='${tile.height}' viewBox='0 0 ${tile.width} ${tile.height}'>` +
    `<g fill='none' stroke='${color}' stroke-linejoin='round' stroke-linecap='${dots ? 'butt' : 'round'}'>` +
    `<path d='${tile.minor}' stroke-opacity='${minor}' ${stroke(1)}/>` +
    `<path d='${tile.major}' stroke-opacity='${major}' ${stroke(1.2)}/>` +
    `</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
