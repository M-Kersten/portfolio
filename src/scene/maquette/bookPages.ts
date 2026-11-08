// The Zwijsen book's pages: a little picture book of four spreads, made the
// way the model is, from one stock: every shape is a piece of the model's
// blue paper, cut out and stacked, each a lighter or darker cut than the one
// it lies on and throwing a soft shadow on it. Mouse goes out for the day,
// and on every spread Mouse is hiding: not in the print, only in its AR
// layer, which the book's close-up shows through a lens round the cursor
// (room.tsx, OpenBook). Each spread is drawn twice: the print, and the AR
// layer over it (the coral of the room: Mouse, and a few things that come
// alive). There's more to find than Mouse: a hedgehog, a snail, an owl in a
// tree, a cat on a sill.
//
// A spread is SPREAD_W × SPREAD_H, the two pages side by side, each a picture
// book's page, a little taller than it's wide (room.tsx, BOOK_*): the left
// page is the canvas's left half, the right page its right half, and the fold
// runs down the middle (keep anything that matters out of it). A spread is a
// list of pieces (`Piece`), back to front; `cutPaper` lays them down.

export const SPREAD_W = 1440;
export const SPREAD_H = 954;
const W = SPREAD_W;
const H = SPREAD_H;
const PAGE = W / 2;
const GUTTER = 36; // px either side of the fold that the binding shades
const MARGIN = 60;

// the stock: the sky's own cut, the darkest, and the near-white of a cloud;
// every other piece is a cut between the first two (`cut`)
const SKY = '#c4d5e7';
const DARK = '#24405e';
const LIGHT = '#e6eef7';
const NIGHT = '#2b4767';
const PALE_PIECE = '#d8e4f1'; // a window, a spot on a cap: a paler piece laid on
const PAPER = '#b9cde3'; // the cover's window
const INK = 'rgb(24, 38, 55)';
const CORAL = '#ff9068';
const CORAL_PALE = '#ffc5ab';
const FONT = '"Space Grotesk", ui-sans-serif, system-ui, sans-serif';
const MONO = '"Space Mono", ui-monospace, monospace';

type G = CanvasRenderingContext2D;
type P2 = [number, number];

/** Where Mouse hides on a spread, in spread pixels (x across, y down): the
 *  middle of Mouse's face, how close the lens has to come to count as found,
 *  and the face's width (the AR layer draws Mouse from it, and the Mouse that
 *  pops out of the page when found starts at its size). */
export interface Hide {
  x: number;
  y: number;
  r: number;
  s: number;
}
/** A piece of the picture: its outline, how far back it lies (0 the sky … 4
 *  the very front: the further forward, the deeper its shadow), and how dark
 *  a cut of the stock it is (0 the sky's own … 1 the darkest), unless it's
 *  cut from something else (`color`). On it, maybe: a lighter piece on its
 *  sunny side (`lit`), paler pieces laid on it (`pale`: windows, spots),
 *  thin strips (`lines`: a stem, a wave's crest, a bicycle's frame), holes
 *  cut right through it to the dark (`holes`: a door, a hollow, an eye), and
 *  footprints (`dots`). */
interface Piece {
  path: Path2D;
  layer: number;
  tone: number;
  color?: string;
  lit?: Path2D;
  pale?: Path2D[];
  lines?: { p: Path2D; w: number; pale?: boolean }[];
  holes?: Path2D[];
  dots?: Path2D;
  flat?: boolean;
}
interface Spread {
  /** the page's words, line by line, and where they're set (and in what:
   *  the night's words are pale) */
  text: string[];
  textAt: P2;
  light?: boolean;
  ask: string;
  hide: Hide;
  /** the sky behind everything, and where the sun is, if it's out */
  sky: string;
  sun?: P2;
  pieces(): Piece[];
  ar(g: G, h: Hide): void;
}

/* ---------- cutting shapes ---------- */

const P = () => new Path2D();
const circleP = (x: number, y: number, r: number) => {
  const p = P();
  p.arc(x, y, r, 0, Math.PI * 2);
  return p;
};
const ellipseP = (x: number, y: number, rx: number, ry: number, rot = 0) => {
  const p = P();
  p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  return p;
};
const rectP = (x: number, y: number, w: number, h: number) => {
  const p = P();
  p.rect(x, y, w, h);
  return p;
};
const polyP = (pts: P2[], close = true) => {
  const p = P();
  p.moveTo(pts[0][0], pts[0][1]);
  for (const q of pts.slice(1)) p.lineTo(q[0], q[1]);
  if (close) p.closePath();
  return p;
};
const piece = (path: Path2D, layer: number, tone: number, o: Partial<Piece> = {}): Piece => ({ path, layer, tone, ...o });
/** A ring: a disc with a smaller one cut out of its middle. */
const ringP = (x: number, y: number, r: number, r2: number) => {
  const p = P();
  p.arc(x, y, r, 0, Math.PI * 2, false);
  p.moveTo(x + r2, y);
  p.arc(x, y, r2, 0, Math.PI * 2, true);
  return p;
};
/** A point along a cubic curve (the hills' lines), at `t` 0…1. */
function bez(p0: P2, p1: P2, p2: P2, p3: P2, t: number): P2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}
/** Everything below a cubic curve across the spread: a hill, the sea. */
function below(curve: [P2, P2, P2, P2]) {
  const p = P();
  p.moveTo(...curve[0]);
  p.bezierCurveTo(...curve[1], ...curve[2], ...curve[3]);
  p.lineTo(W, H);
  p.lineTo(0, H);
  p.closePath();
  return p;
}
/** A seeded wobble, so each tree's cut is its own but the same every time. */
const rnd = (k: number) => {
  const x = Math.sin(k * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const cloudP = (x: number, y: number, sc: number) => {
  const p = P();
  p.moveTo(x - 90 * sc, y);
  p.quadraticCurveTo(x - 80 * sc, y - 50 * sc, x - 30 * sc, y - 40 * sc);
  p.quadraticCurveTo(x, y - 90 * sc, x + 50 * sc, y - 50 * sc);
  p.quadraticCurveTo(x + 100 * sc, y - 50 * sc, x + 90 * sc, y);
  p.closePath();
  return p;
};
const gullP = (x: number, y: number, s: number) => {
  const p = P();
  p.moveTo(x - s, y);
  p.quadraticCurveTo(x - s / 2, y - s * 0.6, x, y);
  p.quadraticCurveTo(x + s / 2, y - s * 0.6, x + s, y);
  return p;
};
const tuft = (x: number, y: number, s = 1) => {
  const p = P();
  p.moveTo(x - 14 * s, y + 4);
  p.lineTo(x - 6 * s, y - 18 * s);
  p.moveTo(x, y + 4);
  p.lineTo(x + 2 * s, y - 24 * s);
  p.moveTo(x + 12 * s, y + 4);
  p.lineTo(x + 16 * s, y - 16 * s);
  return p;
};
/** A star: four points. */
function starP(x: number, y: number, s: number) {
  const p = P();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const r = i % 2 ? s * 0.32 : s;
    if (i === 0) p.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else p.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  p.closePath();
  return p;
}
/** A thick band along a run of points, as a piece of its own (a tunnel, a
 *  path): `w` wide. */
function band(pts: P2[], w: number) {
  const l: P2[] = [];
  const r: P2[] = [];
  pts.forEach((q, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (-(b[1] - a[1]) / len) * (w / 2);
    const ny = ((b[0] - a[0]) / len) * (w / 2);
    l.push([q[0] + nx, q[1] + ny]);
    r.push([q[0] - nx, q[1] - ny]);
  });
  return polyP([...l, ...r.reverse()]);
}
const sample = (curve: [P2, P2, P2, P2], n = 24) => Array.from({ length: n + 1 }, (_, i) => bez(...curve, i / n));

/* ---------- what the pages are cut from ---------- */

/** A fir, cut in tiers: each a wide, shallow piece drooping in scallops at
 *  its foot, the one above laid over it, its sunny half a lighter piece. */
function fir(out: Piece[], x: number, base: number, h: number, w: number, tone: number, layer = 2, seed = 1, tiers = 4) {
  out.push(
    piece(
      polyP([
        [x - w * 0.045, base],
        [x - w * 0.03, base - h * 0.2],
        [x + w * 0.03, base - h * 0.2],
        [x + w * 0.045, base],
      ]),
      layer,
      tone + 0.14,
    ),
  );
  for (let k = 0; k < tiers; k++) {
    const f = tiers === 1 ? 0 : k / (tiers - 1);
    const by = base - h * (0.13 + 0.5 * f);
    const ty = by - h * (0.4 - 0.06 * f);
    const hw = (w / 2) * (1 - 0.62 * f) * (0.94 + rnd(seed * 9 + k) * 0.12);
    const cx = x + (rnd(seed * 3 + k) - 0.5) * w * 0.05;
    const p = P();
    p.moveTo(cx, ty);
    p.quadraticCurveTo(cx - hw * 0.3, ty + (by - ty) * 0.62, cx - hw, by - (by - ty) * 0.06);
    const n = Math.max(3, Math.round(hw / 22));
    const droop = (by - ty) * 0.16;
    for (let i = 0; i < n; i++) {
      const x0 = cx - hw + (2 * hw * i) / n;
      const x1 = cx - hw + (2 * hw * (i + 1)) / n;
      p.quadraticCurveTo((x0 + x1) / 2, by + droop * (0.7 + rnd(seed + k * 7 + i) * 0.6), x1, i === n - 1 ? by - (by - ty) * 0.06 : by);
    }
    p.quadraticCurveTo(cx + hw * 0.3, ty + (by - ty) * 0.62, cx, ty);
    p.closePath();
    out.push(piece(p, layer, tone - f * 0.06, { lit: rectP(cx - hw - 4, ty - 4, hw * 0.9 + 4, by - ty + droop * 2 + 8) }));
  }
}
/** A leafy clump: a blob with a scalloped edge. */
function clump(x: number, y: number, rx: number, ry: number, seed: number) {
  const p = P();
  const n = 11;
  const at = (i: number): P2 => {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.1 * Math.sin(a * 3 + seed) + 0.06 * Math.sin(a * 5 + seed * 2);
    return [x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k];
  };
  let [px, py] = at(0);
  p.moveTo(px, py);
  for (let i = 1; i <= n; i++) {
    const [qx, qy] = at(i);
    const mx = (px + qx) / 2;
    const my = (py + qy) / 2;
    const l = Math.hypot(mx - x, my - y) || 1;
    p.quadraticCurveTo(mx + ((mx - x) / l) * rx * 0.16, my + ((my - y) / l) * ry * 0.16, qx, qy);
    [px, py] = [qx, qy];
  }
  p.closePath();
  return p;
}
/** A broadleaf: a forked trunk and a crown of leafy clumps, the back ones a
 *  darker cut, the front lighter, each with a lighter piece on its sunny side. */
function broadleaf(out: Piece[], x: number, base: number, h: number, w: number, seed = 2) {
  out.push(
    piece(
      polyP([
        [x - w * 0.07, base],
        [x - w * 0.05, base - h * 0.38],
        [x - w * 0.2, base - h * 0.6],
        [x - w * 0.16, base - h * 0.62],
        [x - w * 0.02, base - h * 0.46],
        [x + w * 0.03, base - h * 0.5],
        [x + w * 0.18, base - h * 0.66],
        [x + w * 0.21, base - h * 0.63],
        [x + w * 0.06, base - h * 0.42],
        [x + w * 0.07, base],
      ]),
      2,
      0.3,
    ),
  );
  const cy = base - h * 0.7;
  const clumps: [number, number, number, number, number][] = [
    [0.3, -0.02, 0.28, 0.22, 0.3],
    [-0.3, 0.0, 0.27, 0.22, 0.28],
    [0.04, -0.2, 0.3, 0.22, 0.26],
    [-0.12, -0.06, 0.3, 0.24, 0.2],
    [0.2, 0.08, 0.27, 0.2, 0.18],
    [-0.24, 0.13, 0.22, 0.17, 0.16],
    [0.02, 0.15, 0.26, 0.18, 0.12],
  ];
  clumps.forEach(([dx, dy, rx, ry, tone], i) => {
    const cx = x + dx * w;
    const cyy = cy + dy * h;
    out.push(piece(clump(cx, cyy, rx * w, ry * h, seed + i), 2, tone, { lit: clump(cx - rx * w * 0.28, cyy - ry * h * 0.3, rx * w * 0.6, ry * h * 0.55, seed + 20 + i) }));
  });
}
function bush(out: Piece[], x: number, base: number, s: number, tone = 0.2, seed = 4) {
  out.push(piece(clump(x, base - s * 0.45, s * 1.15, s * 0.6, seed), 3, tone + 0.14));
  out.push(piece(clump(x + s * 0.2, base - s * 0.3, s * 0.8, s * 0.42, seed + 3), 3, tone + 0.06, { lit: clump(x, base - s * 0.45, s * 0.5, s * 0.25, seed + 6) }));
}
function mushroom(out: Piece[], x: number, base: number, s: number) {
  out.push(
    piece(
      polyP([
        [x - s * 0.18, base],
        [x - s * 0.13, base - s * 0.5],
        [x + s * 0.13, base - s * 0.5],
        [x + s * 0.18, base],
      ]),
      4,
      0,
      { color: LIGHT },
    ),
  );
  const spots = P();
  for (const [dx, dy, r] of [
    [-0.2, -0.66, 0.07],
    [0.12, -0.78, 0.06],
    [0.3, -0.6, 0.05],
  ]) {
    spots.moveTo(x + dx * s + r * s, base + dy * s);
    spots.arc(x + dx * s, base + dy * s, r * s, 0, Math.PI * 2);
  }
  out.push(piece(capP(x, base, s), 4, 0.42, { pale: [spots] }));
}
function capP(x: number, base: number, s: number) {
  const p = P();
  p.moveTo(x - s * 0.5, base - s * 0.48);
  p.quadraticCurveTo(x, base - s * 1.25, x + s * 0.5, base - s * 0.48);
  p.closePath();
  return p;
}
function flower(out: Piece[], x: number, y: number, s = 1) {
  const petals = P();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    petals.moveTo(x + Math.cos(a) * 10 * s + 8 * s, y + Math.sin(a) * 10 * s);
    petals.arc(x + Math.cos(a) * 10 * s, y + Math.sin(a) * 10 * s, 8 * s, 0, Math.PI * 2);
  }
  const stem = P();
  stem.moveTo(x, y + 10 * s);
  stem.quadraticCurveTo(x - 4 * s, y + 26 * s, x + 2 * s, y + 40 * s);
  out.push(piece(petals, 4, 0, { color: LIGHT, lines: [{ p: stem, w: 3.5 }], pale: [circleP(x, y, 5 * s)] }));
}
/** Something to find that isn't Mouse: a hedgehog by the path, all spikes. */
function hedgehog(out: Piece[], x: number, y: number, s: number) {
  const p = P();
  p.moveTo(x - 60 * s, y);
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    const r = (i % 2 ? 44 : 56) * s;
    p.lineTo(x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 0.8);
  }
  p.lineTo(x + 80 * s, y - 6 * s);
  p.lineTo(x + 48 * s, y);
  p.closePath();
  const face = P();
  face.moveTo(x + 40 * s, y);
  face.quadraticCurveTo(x + 52 * s, y - 30 * s, x + 80 * s, y - 6 * s);
  face.lineTo(x + 48 * s, y);
  face.closePath();
  out.push(piece(p, 4, 0.5, { pale: [face], holes: [circleP(x + 58 * s, y - 14 * s, 4 * s), circleP(x + 80 * s, y - 6 * s, 4 * s)] }));
}
function snail(out: Piece[], x: number, y: number, s: number) {
  const body = P();
  body.moveTo(x - 40 * s, y);
  body.quadraticCurveTo(x, y - 10 * s, x + 46 * s, y - 2 * s);
  body.quadraticCurveTo(x + 50 * s, y - 22 * s, x + 40 * s, y - 28 * s);
  body.lineTo(x + 30 * s, y - 8 * s);
  body.closePath();
  out.push(piece(body, 4, 0.1, { color: LIGHT }));
  const spiral = P();
  for (let a = 0; a < Math.PI * 4; a += 0.2) {
    const r = 20 * s * (1 - a / (Math.PI * 4.4));
    const px = x - 6 * s + Math.cos(a) * r;
    const py = y - 24 * s + Math.sin(a) * r;
    if (a === 0) spiral.moveTo(px, py);
    else spiral.lineTo(px, py);
  }
  out.push(piece(circleP(x - 6 * s, y - 24 * s, 24 * s), 4, 0.36, { lines: [{ p: spiral, w: 3, pale: true }] }));
}
/** A crescent moon: a disc with the shadow's disc cut out of it. */
function crescentP(x: number, y: number, r: number, ox: number, oy: number, r2: number) {
  const d = Math.hypot(ox, oy);
  const a = (r * r - r2 * r2 + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(0, r * r - a * a));
  const ux = ox / d;
  const uy = oy / d;
  const mx = x + ux * a;
  const my = y + uy * a;
  const p1: P2 = [mx - uy * hh, my + ux * hh];
  const p2: P2 = [mx + uy * hh, my - ux * hh];
  const ang = (cx: number, cy: number, q: P2) => Math.atan2(q[1] - cy, q[0] - cx);
  const p = P();
  p.arc(x, y, r, ang(x, y, p1), ang(x, y, p2), false);
  p.arc(x + ox, y + oy, r2, ang(x + ox, y + oy, p2), ang(x + ox, y + oy, p1), true);
  p.closePath();
  return p;
}

/* ---------- the four spreads ---------- */

const ASK = 'Can you find Mouse?';
const LEFT_TEXT: P2 = [MARGIN + 6, 58];
const RIGHT_TEXT: P2 = [PAGE + GUTTER + 34, 58];

// the woods: the far hill, the near one, and the mushrooms by the path (the
// AR caps glow over them)
const FAR: [P2, P2, P2, P2] = [
  [0, 640],
  [420, 560],
  [900, 640],
  [W, 575],
];
const HILL: [P2, P2, P2, P2] = [
  [0, 735],
  [380, 668],
  [960, 772],
  [W, 700],
];
const SHROOMS: [number, number, number][] = [
  [1340, 912, 48],
  [620, 938, 40],
  [176, 840, 44],
];
const OWL: P2 = [526, 640]; // the hole in the broadleaf's trunk
// the town: the houses along the canal, and which of their windows are lit in AR
const QUAY = 770;
const TOWN: [number, number, number, 'step' | 'neck' | 'point', number][] = [
  [36, 128, 400, 'step', 0.16],
  [164, 118, 460, 'neck', 0.26],
  [282, 128, 380, 'point', 0.12],
  [410, 122, 430, 'step', 0.2],
  [532, 128, 370, 'neck', 0.1],
  [776, 128, 450, 'point', 0.18],
  [904, 122, 400, 'step', 0.1],
  [1026, 132, 470, 'neck', 0.22],
  [1158, 122, 390, 'point', 0.14],
  [1280, 128, 440, 'step', 0.18],
];
const LIT = [1, 4, 8, 11, 15, 21, 24, 29, 33, 38, 42, 47, 53, 58, 62, 67];
const CAT: P2 = [1090, 455]; // on a sill in town
const LAMPS = [700, W - 40]; // the street lamps
// the sea: the bands of it, from the horizon in
const SEA = [520, 650, 760, 860];
// home: the ground's line, and the stars
const GROUND: [P2, P2, P2, P2] = [
  [0, 480],
  [380, 410],
  [920, 520],
  [W, 450],
];
const STARS: [number, number, number][] = [
  [620, 82, 14],
  [820, 210, 10],
  [1060, 118, 12],
  [1120, 330, 9],
  [570, 300, 11],
  [330, 330, 9],
  [120, 300, 12],
  [1390, 300, 10],
  [720, 396, 8],
  [940, 380, 9],
  [1410, 62, 8],
];

function windowsOf(x: number, base: number, w: number, h: number): [number, number, number, number][] {
  const top = base - h;
  const floors = Math.max(2, Math.round(h / 120));
  const fh = (h - 90) / floors;
  const out: [number, number, number, number][] = [];
  for (let f = 0; f < floors; f++) for (const k of [0.18, 0.58]) out.push([x + w * k, top + 24 + f * fh, w * 0.24, fh * 0.55]);
  return out;
}
function gableP(x: number, base: number, w: number, h: number, kind: 'step' | 'neck' | 'point') {
  const top = base - h;
  const roof: P2[] =
    kind === 'point'
      ? [
          [x, top],
          [x + w / 2, top - w * 0.42],
          [x + w, top],
        ]
      : kind === 'neck'
        ? [
            [x, top],
            [x + w * 0.18, top - w * 0.14],
            [x + w * 0.3, top - w * 0.14],
            [x + w * 0.3, top - w * 0.42],
            [x + w * 0.7, top - w * 0.42],
            [x + w * 0.7, top - w * 0.14],
            [x + w * 0.82, top - w * 0.14],
            [x + w, top],
          ]
        : [
            [x, top],
            [x, top - w * 0.14],
            [x + w * 0.16, top - w * 0.14],
            [x + w * 0.16, top - w * 0.28],
            [x + w * 0.32, top - w * 0.28],
            [x + w * 0.32, top - w * 0.42],
            [x + w * 0.68, top - w * 0.42],
            [x + w * 0.68, top - w * 0.28],
            [x + w * 0.84, top - w * 0.28],
            [x + w * 0.84, top - w * 0.14],
            [x + w, top - w * 0.14],
            [x + w, top],
          ];
  return polyP([[x, base], ...roof, [x + w, base]]);
}

export const SPREADS: Spread[] = [
  // 1. the woods: footprints up the path to a hollow log
  {
    text: ['Mouse went for a', 'walk in the woods.'],
    textAt: LEFT_TEXT,
    ask: ASK,
    hide: { x: 1000, y: 790, r: 50, s: 76 },
    sky: SKY,
    sun: [1250, 140],
    pieces() {
      const out: Piece[] = [];
      out.push(piece(circleP(1250, 140, 52), 0, 0, { color: LIGHT }));
      out.push(piece(cloudP(990, 300, 1), 0, 0, { color: LIGHT }));
      out.push(piece(cloudP(1205, 380, 0.62), 0, 0, { color: LIGHT }));
      out.push(piece(P(), 0, 0, { lines: [{ p: gullP(1080, 160, 26), w: 4 }, { p: gullP(1140, 198, 18), w: 4 }] }));
      // the far hill and its firs
      out.push(piece(below(FAR), 1, 0.06));
      for (const [t, h, sd] of [
        [0.4, 120, 3],
        [0.45, 96, 5],
        [0.49, 136, 7],
        [0.69, 112, 11],
        [0.73, 146, 13],
        [0.78, 100, 17],
      ]) {
        const [x, y] = bez(...FAR, t);
        fir(out, x, y + 8, h, h * 0.55, 0.08, 1, sd, 3);
      }
      // the wood
      fir(out, 100, 752, 400, 190, 0.14, 2, 21);
      fir(out, 292, 742, 500, 230, 0.2, 2, 23, 5);
      broadleaf(out, 535, 762, 470, 290, 2);
      out.push(piece(ellipseP(OWL[0], OWL[1], 12, 17), 2, 1, { color: DARK, flat: true }));
      fir(out, 862, 737, 420, 196, 0.16, 2, 29);
      fir(out, 1172, 718, 300, 140, 0.12, 2, 31, 3);
      fir(out, 1352, 714, 460, 200, 0.18, 2, 37, 5);
      // the near hill, its grass, the bushes on it, the path up it
      const grass = P();
      for (const t of [0.04, 0.12, 0.2, 0.33, 0.45, 0.58, 0.83, 0.94]) {
        const [x, y] = bez(...HILL, t);
        grass.addPath(tuft(x, y, 1));
      }
      out.push(piece(below(HILL), 3, 0.1, { lines: [{ p: grass, w: 3.5 }] }));
      bush(out, 420, 750, 46, 0.2, 41);
      bush(out, 1030, 744, 40, 0.16, 43);
      bush(out, 1268, 738, 36, 0.22, 47);
      const path = P();
      path.moveTo(120, H);
      path.bezierCurveTo(330, 850, 640, 880, 945, 808);
      path.lineTo(975, 848);
      path.bezierCurveTo(760, 920, 480, 900, 300, H);
      path.closePath();
      const prints = P();
      for (const [x, y, a] of [
        [200, 935, -0.5],
        [222, 920, -0.5],
        [300, 898, -0.35],
        [325, 888, -0.35],
        [420, 872, -0.2],
        [446, 868, -0.2],
        [545, 862, -0.12],
        [572, 858, -0.12],
        [670, 852, -0.12],
        [696, 847, -0.12],
        [790, 840, -0.2],
        [816, 834, -0.2],
        [890, 826, -0.25],
        [915, 820, -0.25],
      ])
        prints.addPath(ellipseP(x, y + ((x / 26) % 2 ? 6 : -6), 5, 3.5, a));
      out.push(piece(path, 3, -0.05, { dots: prints }));
      // the hollow log, its open end toward the path; a snail on it
      const log = P();
      log.moveTo(1000, 752);
      log.lineTo(1250, 746);
      log.quadraticCurveTo(1286, 797, 1250, 848);
      log.lineTo(1000, 850);
      log.closePath();
      const rings = P();
      for (const y of [778, 816]) {
        rings.moveTo(1060, y);
        rings.lineTo(1220, y - 3);
      }
      out.push(piece(log, 4, 0.24, { lines: [{ p: rings, w: 3 }] }));
      out.push(piece(ellipseP(1000, 801, 38, 49), 4, 0, { color: LIGHT, holes: [ellipseP(1000, 801, 26, 36)] }));
      snail(out, 1160, 746, 0.75);
      // the mushrooms, the flowers, and a hedgehog by the path
      for (const [x, b, s] of SHROOMS) mushroom(out, x, b, s);
      for (const [x, y, s] of [
        [1120, 880, 1],
        [1170, 905, 0.8],
        [700, 780, 0.9],
        [80, 860, 1],
        [1395, 790, 0.8],
      ])
        flower(out, x, y, s);
      hedgehog(out, 420, 930, 0.7);
      return out;
    },
    ar(g, h) {
      // fireflies, the mushrooms' caps glowing, the sun's rays, the owl's eyes
      // in the hole, a butterfly over the flowers
      glow(g, 16);
      g.fillStyle = CORAL;
      for (const [x, y, r] of [
        [230, 470, 7],
        [480, 420, 6],
        [640, 640, 8],
        [900, 560, 7],
        [1100, 470, 6],
        [790, 700, 6],
        [1400, 620, 6],
        [380, 640, 6],
        [1180, 640, 5],
        [700, 520, 5],
      ]) {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 0.75;
      for (const [x, b, s] of SHROOMS) g.fill(capP(x, b, s));
      g.globalAlpha = 1;
      for (const dx of [-5, 5]) {
        g.beginPath();
        g.arc(OWL[0] + dx, OWL[1] - 4, 4.5, 0, Math.PI * 2);
        g.fill();
      }
      butterfly(g, 1150, 840, 1);
      g.lineWidth = 5;
      g.strokeStyle = CORAL;
      g.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        g.beginPath();
        g.moveTo(1250 + Math.cos(a) * 68, 140 + Math.sin(a) * 68);
        g.lineTo(1250 + Math.cos(a) * 96, 140 + Math.sin(a) * 96);
        g.stroke();
      }
      noGlow(g);
      // Mouse, looking out of the log, the tail out of its far end
      tail(g, [
        [1262, 808],
        [1300, 790],
        [1314, 818],
        [1328, 846],
        [1360, 832],
      ]);
      mouse(g, h.x, h.y, h.s, { paws: true });
    },
  },
  // 2. the town: the canal, its houses, and a bicycle with a basket
  {
    text: ['Then Mouse', 'went into town.'],
    textAt: LEFT_TEXT,
    ask: ASK,
    hide: { x: 421, y: 602, r: 50, s: 72 },
    sky: SKY,
    sun: [1250, 150],
    pieces() {
      const out: Piece[] = [];
      out.push(piece(cloudP(1250, 150, 0.8), 0, 0, { color: LIGHT }));
      out.push(piece(P(), 0, 0, { lines: [{ p: gullP(980, 120, 22), w: 4 }, { p: gullP(1030, 150, 15), w: 4 }] }));
      // a row of roofs far behind
      const back = P();
      back.moveTo(0, 470);
      for (let x = 0; x <= W; x += 60) back.lineTo(x, 470 - ((x / 60) % 3) * 28 - (x % 120 ? 22 : 0));
      back.lineTo(W, QUAY);
      back.lineTo(0, QUAY);
      back.closePath();
      out.push(piece(back, 1, 0.08));
      // the houses: their windows paler pieces, their doors cut through
      for (const [x, w, h, kind, tone] of TOWN) {
        const panes = P();
        const bars = P();
        for (const [wx, wy, ww, wh] of windowsOf(x, QUAY, w, h)) {
          panes.rect(wx, wy, ww, wh);
          bars.moveTo(wx + ww / 2, wy);
          bars.lineTo(wx + ww / 2, wy + wh);
        }
        const dw = w * 0.26;
        const door = P();
        door.moveTo(x + w / 2 - dw / 2, QUAY);
        door.lineTo(x + w / 2 - dw / 2, QUAY - 64);
        door.arc(x + w / 2, QUAY - 64, dw / 2, Math.PI, 0);
        door.lineTo(x + w / 2 + dw / 2, QUAY);
        door.closePath();
        out.push(piece(gableP(x, QUAY, w, h, kind), 2, tone, { pale: [panes], lines: [{ p: bars, w: 3 }], holes: [door], lit: rectP(x, QUAY - h - w * 0.5, w * 0.12, h + w * 0.5) }));
      }
      // a cat on a sill, watching the street: it isn't Mouse either
      const [cx, cy] = CAT;
      const cat = P();
      cat.moveTo(cx - 22, cy);
      cat.quadraticCurveTo(cx - 24, cy - 30, cx - 10, cy - 34);
      cat.lineTo(cx - 12, cy - 50);
      cat.lineTo(cx - 2, cy - 38);
      cat.lineTo(cx + 8, cy - 38);
      cat.lineTo(cx + 16, cy - 50);
      cat.lineTo(cx + 16, cy - 32);
      cat.quadraticCurveTo(cx + 26, cy - 20, cx + 22, cy);
      cat.closePath();
      const catTail = P();
      catTail.moveTo(cx + 20, cy - 4);
      catTail.quadraticCurveTo(cx + 40, cy + 6, cx + 34, cy + 30);
      out.push(piece(cat, 3, 0.8, { lines: [{ p: catTail, w: 5 }] }));
      // the street lamps
      for (const x of LAMPS) {
        const post = P();
        post.moveTo(x, QUAY);
        post.lineTo(x, QUAY - 190);
        post.quadraticCurveTo(x, QUAY - 206, x - 16, QUAY - 206);
        out.push(piece(P(), 3, 0, { lines: [{ p: post, w: 5 }] }));
        out.push(
          piece(
            polyP([
              [x - 30, QUAY - 212],
              [x - 6, QUAY - 212],
              [x - 12, QUAY - 196],
              [x - 24, QUAY - 196],
            ]),
            3,
            0.4,
          ),
        );
      }
      // the quay, and the canal with its ripples
      out.push(piece(rectP(0, QUAY, W, 42), 3, 0.02, { color: LIGHT }));
      const ripples = P();
      for (const [y, off] of [
        [862, 0],
        [902, 30],
        [940, 10],
      ]) {
        ripples.moveTo(-off, y);
        for (let x = -off; x < W; x += 80) {
          ripples.quadraticCurveTo(x + 20, y - 8, x + 40, y);
          ripples.quadraticCurveTo(x + 60, y + 8, x + 80, y);
        }
      }
      out.push(piece(rectP(0, QUAY + 42, W, H - QUAY - 42), 3, 0.3, { lines: [{ p: ripples, w: 3.5, pale: true }] }));
      // a footbridge over it, and a boat on it
      const bridge = P();
      bridge.moveTo(960, QUAY + 42);
      bridge.quadraticCurveTo(1130, 690, 1300, QUAY + 42);
      bridge.lineTo(1300, QUAY + 72);
      bridge.quadraticCurveTo(1130, 740, 960, QUAY + 72);
      bridge.closePath();
      out.push(piece(bridge, 4, 0.06, { color: LIGHT }));
      const boat = P();
      boat.moveTo(560, 870);
      boat.lineTo(760, 870);
      boat.quadraticCurveTo(740, 915, 690, 918);
      boat.lineTo(620, 918);
      boat.quadraticCurveTo(575, 912, 560, 870);
      boat.closePath();
      out.push(piece(boat, 4, 0.42));
      // the bicycle against a house, its basket in front
      const bx = 330;
      const by = QUAY - 8;
      for (const wx of [bx - 70, bx + 70]) out.push(piece(ringP(wx, by - 46, 46, 38), 4, 0, { color: LIGHT, holes: [circleP(wx, by - 46, 6)] }));
      const frame = P();
      for (const f of [
        [
          [bx - 70, by - 46],
          [bx - 10, by - 46],
          [bx + 40, by - 110],
          [bx - 30, by - 110],
          [bx - 70, by - 46],
        ],
        [
          [bx - 10, by - 46],
          [bx - 40, by - 128],
        ],
        [
          [bx + 70, by - 46],
          [bx + 52, by - 140],
          [bx + 30, by - 150],
        ],
      ] as P2[][]) {
        frame.moveTo(...f[0]);
        for (const q of f.slice(1)) frame.lineTo(...q);
      }
      out.push(piece(P(), 4, 0, { lines: [{ p: frame, w: 6 }] }));
      const weave = P();
      for (let i = 1; i < 4; i++) {
        weave.moveTo(bx + 56 + i * 17.5, by - 128);
        weave.lineTo(bx + 62 + i * 13, by - 78);
      }
      weave.moveTo(bx + 60, by - 103);
      weave.lineTo(bx + 121, by - 103);
      out.push(
        piece(
          polyP([
            [bx + 56, by - 128],
            [bx + 126, by - 128],
            [bx + 116, by - 78],
            [bx + 64, by - 78],
          ]),
          4,
          0.34,
          { lines: [{ p: weave, w: 2.5, pale: true }] },
        ),
      );
      // footprints along the quay, from the right, to the bicycle
      const prints = P();
      for (let x = 470; x < 664; x += 26) prints.addPath(ellipseP(x, QUAY + 21 + ((x / 26) % 2 ? 5 : -5), 5, 3.5));
      out.push(piece(P(), 4, 0, { dots: prints }));
      return out;
    },
    ar(g, h) {
      // the windows lit, bunting across the street, the street lamps on, the
      // cat's eyes
      const wins = TOWN.flatMap(([x, w, ht]) => windowsOf(x, QUAY, w, ht));
      glow(g, 14);
      g.fillStyle = CORAL;
      g.globalAlpha = 0.85;
      for (const i of LIT) {
        const r = wins[i];
        if (r) g.fillRect(r[0] + 3, r[1] + 3, r[2] - 6, r[3] - 6);
      }
      g.globalAlpha = 1;
      g.lineWidth = 3;
      g.strokeStyle = CORAL;
      g.beginPath();
      g.moveTo(0, 270);
      g.quadraticCurveTo(W / 2, 430, W, 270);
      g.stroke();
      for (let i = 1; i < 20; i++) {
        const t = i / 20;
        const x = t * W;
        if (Math.abs(x - PAGE) < GUTTER) continue; // not in the fold
        const y = (1 - t) * (1 - t) * 270 + 2 * (1 - t) * t * 430 + t * t * 270;
        g.fillStyle = i % 2 ? CORAL : CORAL_PALE;
        g.fill(
          polyP([
            [x - 16, y - 2],
            [x + 16, y - 2],
            [x, y + 32],
          ]),
        );
      }
      g.fillStyle = CORAL;
      for (const x of LAMPS) {
        g.globalAlpha = 0.32;
        g.fill(
          polyP([
            [x - 24, QUAY - 196],
            [x - 6, QUAY - 196],
            [x + 30, QUAY - 20],
            [x - 70, QUAY - 20],
          ]),
        );
        g.globalAlpha = 1;
      }
      for (const dx of [-6, 8]) {
        g.beginPath();
        g.arc(CAT[0] + dx, CAT[1] - 28, 3.5, 0, Math.PI * 2);
        g.fill();
      }
      noGlow(g);
      // Mouse, up in the bicycle's basket, the tail hanging over its side
      tail(g, [
        [454, 660],
        [475, 682],
        [465, 706],
        [455, 730],
        [472, 750],
      ]);
      mouse(g, h.x, h.y, h.s, { paws: true });
    },
  },
  // 3. the sea: a lighthouse on its rock, and a rowing boat out on the waves
  {
    text: ['Mouse went out to sea.'],
    textAt: RIGHT_TEXT,
    ask: ASK,
    hide: { x: 1080, y: 608, r: 50, s: 72 },
    sky: SKY,
    sun: [300, 140],
    pieces() {
      const out: Piece[] = [];
      out.push(piece(cloudP(1010, 360, 1), 0, 0, { color: LIGHT }));
      out.push(piece(cloudP(1280, 430, 0.7), 0, 0, { color: LIGHT }));
      out.push(
        piece(P(), 0, 0, {
          lines: [
            { p: gullP(860, 420, 22), w: 4 },
            { p: gullP(912, 460, 16), w: 4 },
            { p: gullP(120, 300, 20), w: 4 },
            { p: gullP(172, 332, 14), w: 4 },
          ],
        }),
      );
      // the sea in bands, from the horizon in, each a darker cut laid over the
      // one behind, its top edge a run of waves
      const wave = (y: number, amp: number, len: number, off: number) => {
        const p = P();
        p.moveTo(-off, y);
        for (let x = -off; x < W + len; x += len) {
          p.quadraticCurveTo(x + len / 4, y - amp, x + len / 2, y);
          p.quadraticCurveTo(x + (len * 3) / 4, y + amp, x + len, y);
        }
        p.lineTo(W + len, H);
        p.lineTo(-off, H);
        p.closePath();
        return p;
      };
      const crest = (y: number, x0: number, x1: number) => {
        const p = P();
        p.moveTo(x0, y);
        p.quadraticCurveTo((x0 + x1) / 2, y - 10, x1, y);
        return p;
      };
      out.push(piece(rectP(0, SEA[0], W, H - SEA[0]), 1, 0.12));
      // the first band of waves, behind the rock; the boat rides on it
      out.push(piece(wave(SEA[1], 9, 90, 20), 3, 0.18, { lines: [{ p: crest(SEA[1] + 30, 640, 720), w: 3, pale: true }, { p: crest(SEA[1] + 46, 1250, 1340), w: 3, pale: true }] }));
      // the lighthouse on its rock, out at sea on the left page
      const lx = 330;
      out.push(
        piece(
          (() => {
            const p = P();
            p.moveTo(120, 830);
            p.quadraticCurveTo(190, 700, 330, 718);
            p.quadraticCurveTo(470, 700, 540, 840);
            p.closePath();
            return p;
          })(),
          3,
          0.5,
          { lit: rectP(100, 690, 160, 160) },
        ),
      );
      out.push(
        piece(
          polyP([
            [lx - 66, 728],
            [lx - 42, 230],
            [lx + 42, 230],
            [lx + 66, 728],
          ]),
          3,
          0,
          { color: LIGHT, lit: rectP(lx - 70, 220, 40, 520) },
        ),
      );
      for (const [y0, y1] of [
        [300, 380],
        [460, 540],
        [620, 700],
      ]) {
        const w0 = 42 + ((y0 - 230) / 498) * 24;
        const w1 = 42 + ((y1 - 230) / 498) * 24;
        out.push(
          piece(
            polyP([
              [lx - w0, y0],
              [lx + w0, y0],
              [lx + w1, y1],
              [lx - w1, y1],
            ]),
            3,
            0.5,
            { flat: true },
          ),
        );
      }
      out.push(piece(rectP(lx - 62, 214, 124, 16), 3, 0.5));
      out.push(piece(rectP(lx - 38, 140, 76, 74), 3, 0, { color: LIGHT, holes: [rectP(lx - 26, 152, 52, 46)] }));
      out.push(
        piece(
          polyP([
            [lx - 52, 140],
            [lx, 86],
            [lx + 52, 140],
          ]),
          3,
          0.55,
        ),
      );
      out.push(piece(P(), 3, 0, { holes: [rectP(lx - 17, 668, 34, 56)] }));
      // the rowing boat on the waves, its oars out, nobody in it
      const oars = P();
      oars.moveTo(1025, 654);
      oars.lineTo(947, 732);
      oars.moveTo(1135, 654);
      oars.lineTo(1219, 726);
      out.push(piece(P(), 4, 0, { lines: [{ p: oars, w: 6 }] }));
      const hull = P();
      hull.moveTo(985, 640);
      hull.lineTo(1175, 640);
      hull.quadraticCurveTo(1155, 700, 1095, 705);
      hull.lineTo(1035, 705);
      hull.quadraticCurveTo(995, 695, 985, 640);
      hull.closePath();
      out.push(piece(hull, 4, 0.42, { pale: [rectP(990, 640, 182, 8)] }));
      // the nearer bands, in front of the rock's foot and the boat
      out.push(piece(wave(SEA[2], 10, 110, 50), 3, 0.28, { lines: [{ p: crest(SEA[2] + 36, 420, 520), w: 3, pale: true }, { p: crest(SEA[2] + 28, 1180, 1290), w: 3, pale: true }] }));
      out.push(piece(wave(SEA[3], 11, 130, 10), 4, 0.24, { lines: [{ p: crest(SEA[3] + 40, 120, 230), w: 3, pale: true }, { p: crest(SEA[3] + 50, 880, 990), w: 3, pale: true }] }));
      return out;
    },
    ar(g, h) {
      // the lamp alight and its beam out over the sea, and fish under it
      glow(g, 22);
      g.fillStyle = CORAL;
      g.fillRect(294, 144, 72, 66);
      g.globalAlpha = 0.3;
      g.fill(
        polyP([
          [370, 158],
          [W, 262],
          [W, 470],
          [370, 200],
        ]),
      );
      g.globalAlpha = 1;
      for (const [x, y, sz, d] of [
        [560, 770, 34, 1],
        [1300, 880, 28, -1],
        [420, 905, 24, 1],
        [860, 900, 30, -1],
      ]) {
        g.fill(ellipseP(x, y, sz, sz * 0.45));
        g.fill(
          polyP([
            [x - d * sz * 0.9, y],
            [x - d * sz * 1.5, y - sz * 0.45],
            [x - d * sz * 1.5, y + sz * 0.45],
          ]),
        );
      }
      noGlow(g);
      // Mouse, rowing, the tail over the stern
      tail(g, [
        [1169, 660],
        [1201, 648],
        [1209, 674],
        [1217, 700],
        [1241, 690],
      ]);
      mouse(g, h.x, h.y, h.s, { paws: true });
    },
  },
  // 4. home: down a tunnel from the round door, under the hill, to bed
  {
    text: ['And then Mouse', 'went home to bed.'],
    textAt: LEFT_TEXT,
    light: true,
    ask: ASK,
    hide: { x: 1196, y: 819, r: 48, s: 58 },
    sky: NIGHT,
    pieces() {
      const out: Piece[] = [];
      // the moon and the stars, cut from pale paper
      out.push(piece(crescentP(1250, 130, 64, 28, -18, 56), 0, 0, { color: LIGHT }));
      for (const [x, y, sz] of STARS) out.push(piece(starP(x, y, sz), 0, 0, { color: LIGHT }));
      // the ground: the hill's line and the soil under it, its grass, stones
      const grass = P();
      for (const t of [0.05, 0.3, 0.47, 0.66, 0.93]) {
        const [x, y] = bez(...GROUND, t);
        grass.addPath(tuft(x, y, 1));
      }
      out.push(piece(below(GROUND), 3, 0, { color: '#5b7795', lines: [{ p: grass, w: 3.5, pale: true }] }));
      for (const [x, y, rx, ry] of [
        [120, 640, 30, 18],
        [460, 880, 24, 15],
        [300, 920, 34, 20],
        [1410, 560, 26, 16],
        [200, 790, 18, 12],
        [640, 570, 22, 13],
      ])
        out.push(piece(ellipseP(x, y, rx, ry), 4, 0, { color: '#3f5a79' }));
      // the round door in the hill, and the tunnel from it down to the room
      const [dx, dy] = bez(...GROUND, 0.16);
      const door = P();
      door.moveTo(dx - 40, dy + 8);
      door.lineTo(dx - 40, dy - 32);
      door.arc(dx, dy - 32, 40, Math.PI, 0);
      door.lineTo(dx + 40, dy + 8);
      door.closePath();
      out.push(piece(door, 3, 0, { color: DARK }));
      const tunnelLine: [P2, P2, P2, P2] = [
        [dx, dy + 44],
        [dx + 10, 650],
        [560, 700],
        [880, 800],
      ];
      out.push(piece(band(sample(tunnelLine), 70), 3, 0, { color: '#7d97b3', flat: true }));
      const prints = P();
      for (let i = 1; i < 18; i++) {
        const [x, y] = bez(...tunnelLine, i / 18);
        prints.addPath(ellipseP(x + (i % 2 ? 7 : -7), y, 5, 3.5));
      }
      out.push(piece(P(), 3, 0, { dots: prints }));
      // the room: a round-topped hollow, lit, cut away
      const room = P();
      room.moveTo(856, 920);
      room.lineTo(856, 720);
      room.bezierCurveTo(856, 560, 1350, 560, 1350, 720);
      room.lineTo(1350, 920);
      room.closePath();
      out.push(piece(room, 3, 0, { color: SKY }));
      out.push(piece(rectP(856, 874, 494, 46), 4, 0, { color: '#93abc4', flat: true }));
      // a lamp hanging from the roof
      const cord = P();
      cord.moveTo(1050, 602);
      cord.lineTo(1050, 650);
      out.push(piece(P(), 4, 0, { lines: [{ p: cord, w: 4 }] }));
      out.push(
        piece(
          polyP([
            [1026, 680],
            [1074, 680],
            [1062, 650],
            [1038, 650],
          ]),
          4,
          0.5,
        ),
      );
      // a shelf of books on the wall, and a framed cheese
      out.push(piece(rectP(890, 790, 120, 8), 4, 0.8));
      for (let i = 0; i < 6; i++) out.push(piece(rectP(896 + i * 19, 790 - 38 - (i % 2) * 8, 14, 38 + (i % 2) * 8), 4, 0.3 + (i % 3) * 0.16));
      out.push(
        piece(rectP(905, 680, 70, 56), 4, 0.5, {
          pale: [
            polyP([
              [917, 724],
              [963, 724],
              [963, 702],
            ]),
          ],
        }),
      );
      // the bed: a headboard, the mattress, a pillow, the blanket over something small
      out.push(piece(rectP(1150, 795, 14, 83), 4, 0.5));
      out.push(piece(rectP(1164, 845, 160, 18), 4, 0, { color: LIGHT }));
      out.push(piece(ellipseP(1198, 835, 30, 15), 4, 0, { color: LIGHT }));
      const blanket = P();
      blanket.moveTo(1226, 863);
      blanket.lineTo(1226, 847);
      blanket.bezierCurveTo(1234, 805, 1310, 805, 1318, 847);
      blanket.lineTo(1318, 863);
      blanket.closePath();
      out.push(piece(blanket, 4, 0.36));
      out.push(piece(ellipseP(1010, 886, 70, 9), 4, 0.32, { flat: true }));
      return out;
    },
    ar(g, h) {
      // the stars twinkling, the lamp's light, the door aglow
      glow(g, 18);
      g.fillStyle = CORAL;
      for (const [x, y, sz] of STARS) g.fill(starP(x, y, sz * 1.4));
      g.globalAlpha = 0.3;
      g.fill(
        polyP([
          [1028, 680],
          [1072, 680],
          [1140, 873],
          [960, 873],
        ]),
      );
      g.globalAlpha = 0.85;
      const [dx, dy] = bez(...GROUND, 0.16);
      const door = P();
      door.moveTo(dx - 32, dy + 8);
      door.lineTo(dx - 32, dy - 30);
      door.arc(dx, dy - 30, 32, Math.PI, 0);
      door.lineTo(dx + 32, dy + 8);
      door.closePath();
      g.fill(door);
      g.globalAlpha = 1;
      // and the z's over the bed
      g.font = `600 36px ${FONT}`;
      g.fillText('z', 1232, 767);
      g.font = `600 26px ${FONT}`;
      g.fillText('z', 1260, 737);
      noGlow(g);
      // Mouse, asleep on the pillow, the tail out from under the blanket
      tail(g, [
        [1310, 855],
        [1326, 839],
        [1332, 863],
        [1338, 887],
        [1320, 895],
      ]);
      mouse(g, h.x, h.y, h.s, { asleep: true, tilt: -0.25 });
    },
  },
];

/* ---------- laying the pieces down ---------- */

const mix = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a);
  const B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
};
/** A piece's cut of the stock: further forward pieces are darker cuts, and a
 *  piece's own tone shifts it from there. */
const LAYER_CUT = [0, 0.16, 0.5, 0.26, 0.56];
const cut = (o: Piece) => o.color ?? mix(SKY, DARK, Math.min(1, Math.max(0, LAYER_CUT[o.layer] + (o.tone - 0.15) * 1.1)));
/** A piece's shadow on the one under it: deeper the further forward it lies. */
function shadow(g: G, depth: number) {
  g.shadowColor = 'rgba(12, 24, 40, 0.38)';
  g.shadowBlur = 6 + depth * 4;
  g.shadowOffsetX = 2 + depth;
  g.shadowOffsetY = 3 + depth * 1.5;
}
function noShadow(g: G) {
  g.shadowColor = 'transparent';
  g.shadowBlur = 0;
  g.shadowOffsetX = 0;
  g.shadowOffsetY = 0;
}
/** The paper's tooth: a fine speckle, made once and laid over every page. */
let tooth: HTMLCanvasElement | null = null;
function grain(g: G) {
  if (!tooth) {
    tooth = document.createElement('canvas');
    tooth.width = tooth.height = 256;
    const t = tooth.getContext('2d', { willReadFrequently: true });
    if (t) {
      let s = 11;
      const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 1400; i++) {
        t.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.09 * r()})` : `rgba(10,20,35,${0.09 * r()})`;
        t.fillRect(r() * 256, r() * 256, 1.6, 1.6);
      }
    }
  }
  const pat = g.createPattern(tooth, 'repeat');
  if (!pat) return;
  g.fillStyle = pat;
  g.fillRect(0, 0, W, H);
}
function cutPaper(g: G, sp: Spread) {
  g.fillStyle = sp.sky;
  g.fillRect(0, 0, W, H);
  if (sp.sun) {
    const light = g.createRadialGradient(sp.sun[0], sp.sun[1], 20, sp.sun[0], sp.sun[1], 900);
    light.addColorStop(0, 'rgba(255,255,255,0.22)');
    light.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = light;
    g.fillRect(0, 0, W, H);
  }
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const o of sp.pieces()) {
    if (!o.flat) shadow(g, o.layer);
    g.fillStyle = cut(o);
    g.fill(o.path);
    noShadow(g);
    if (o.lit) {
      g.save();
      g.clip(o.path);
      g.fillStyle = 'rgba(255, 255, 255, 0.16)';
      g.fill(o.lit);
      g.restore();
    }
    for (const p of o.pale ?? []) {
      shadow(g, 0.5);
      g.fillStyle = PALE_PIECE;
      g.fill(p);
      noShadow(g);
    }
    // thin strips of paper: a stem, a frame, a crest
    for (const l of o.lines ?? []) {
      shadow(g, 0.4);
      g.strokeStyle = l.pale ? PALE_PIECE : mix(SKY, DARK, o.layer === 0 ? 0.7 : 0.66);
      g.lineWidth = l.w * 0.9;
      g.stroke(l.p);
      noShadow(g);
    }
    // holes cut through to the dark, their edges throwing a shadow in
    for (const p of o.holes ?? []) {
      g.save();
      g.clip(p);
      g.fillStyle = DARK;
      g.fill(p);
      g.shadowColor = 'rgba(0,0,0,0.55)';
      g.shadowBlur = 10;
      g.shadowOffsetY = 4;
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 8;
      g.stroke(p);
      g.restore();
    }
    if (o.dots) {
      g.fillStyle = mix(SKY, DARK, 0.75);
      g.fill(o.dots);
    }
  }
  grain(g);
}

/* ---------- Mouse, and the AR's pen ---------- */

function circle(g: G, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
}
function ellipse(g: G, x: number, y: number, rx: number, ry: number, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}
/** A soft glow under what's drawn next (the AR layer's things give off light). */
function glow(g: G, blur = 18, c = CORAL) {
  g.shadowColor = c;
  g.shadowBlur = blur;
}
function noGlow(g: G) {
  g.shadowBlur = 0;
  g.shadowColor = 'transparent';
}
function butterfly(g: G, x: number, y: number, s: number) {
  for (const sx of [-1, 1]) {
    g.fill(ellipseP(x + sx * 12 * s, y - 6 * s, 12 * s, 9 * s, sx * 0.5));
    g.fill(ellipseP(x + sx * 9 * s, y + 8 * s, 8 * s, 6 * s, -sx * 0.4));
  }
}
/** Mouse, in AR: a coral face with big round ears, pale inside, looking out
 *  (or asleep), and two paws holding on to the edge in front. `s` is the
 *  head's width. */
function mouse(g: G, x: number, y: number, s: number, o: { asleep?: boolean; paws?: boolean; tilt?: number } = {}) {
  const LINE = '#7a2f17';
  g.save();
  g.translate(x, y);
  g.rotate(o.tilt ?? 0);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  glow(g, 26);
  // the ears, then the head over their roots
  g.fillStyle = CORAL;
  g.strokeStyle = LINE;
  g.lineWidth = 4;
  for (const sx of [-1, 1]) {
    circle(g, sx * s * 0.4, -s * 0.36, s * 0.3);
    g.fill();
    g.stroke();
  }
  noGlow(g);
  g.fillStyle = CORAL_PALE;
  for (const sx of [-1, 1]) {
    circle(g, sx * s * 0.42, -s * 0.38, s * 0.17);
    g.fill();
  }
  glow(g, 26);
  g.fillStyle = CORAL;
  ellipse(g, 0, 0, s * 0.5, s * 0.42);
  g.fill();
  g.stroke();
  noGlow(g);
  // a pale muzzle, the eyes, the nose
  g.fillStyle = CORAL_PALE;
  ellipse(g, 0, s * 0.17, s * 0.22, s * 0.15);
  g.fill();
  g.fillStyle = LINE;
  g.strokeStyle = LINE;
  if (o.asleep) {
    g.lineWidth = 4;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.arc(sx * s * 0.18, -s * 0.04, s * 0.08, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
    }
  } else {
    for (const sx of [-1, 1]) {
      circle(g, sx * s * 0.18, -s * 0.05, s * 0.075);
      g.fill();
    }
    g.fillStyle = '#ffffff';
    for (const sx of [-1, 1]) {
      circle(g, sx * s * 0.18 + s * 0.025, -s * 0.075, s * 0.025);
      g.fill();
    }
    g.fillStyle = LINE;
  }
  ellipse(g, 0, s * 0.1, s * 0.07, s * 0.05);
  g.fill();
  // whiskers, three a side
  g.lineWidth = 2.5;
  for (const sx of [-1, 1]) {
    for (const dy of [-0.06, 0.02, 0.1]) {
      g.beginPath();
      g.moveTo(sx * s * 0.2, s * (0.14 + dy * 0.3));
      g.lineTo(sx * s * 0.66, s * (0.1 + dy));
      g.stroke();
    }
  }
  if (o.paws) {
    g.fillStyle = CORAL_PALE;
    g.lineWidth = 3.5;
    for (const sx of [-1, 1]) {
      ellipse(g, sx * s * 0.24, s * 0.44, s * 0.13, s * 0.09);
      g.fill();
      g.stroke();
    }
  }
  g.restore();
}
/** Mouse's tail, giving the game away from wherever the rest is hidden. */
function tail(g: G, pts: P2[]) {
  glow(g, 16);
  g.lineWidth = 6;
  g.strokeStyle = CORAL;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i + 1 < pts.length; i += 2) g.quadraticCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
  g.stroke();
  noGlow(g);
}

/* ---------- the words, and the rest of the page ---------- */

function words(g: G, sp: Spread) {
  const [x, y] = sp.textAt;
  g.textBaseline = 'top';
  g.fillStyle = sp.light ? LIGHT : DARK;
  g.font = `500 44px ${FONT}`;
  sp.text.forEach((l, i) => g.fillText(l, x, y + i * 56));
  g.fillStyle = sp.light ? 'rgba(230, 238, 247, 0.72)' : 'rgba(36, 64, 94, 0.72)';
  g.font = `400 30px ${FONT}`;
  g.fillText(sp.ask, x, y + sp.text.length * 56 + 12);
}
function folios(g: G, n: number, light?: boolean) {
  g.fillStyle = light ? 'rgba(230, 238, 247, 0.6)' : 'rgba(36, 64, 94, 0.55)';
  g.font = `400 22px ${MONO}`;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.fillText(String(n * 2 + 1), MARGIN, H - 30);
  g.textAlign = 'right';
  g.fillText(String(n * 2 + 2), W - MARGIN, H - 30);
  g.textAlign = 'left';
}

/** Draws spread `i`: its print (the pieces, the words and the page numbers)
 *  or its AR layer (on clear, for the lens). */
export function drawSpread(g: G, i: number, layer: 'print' | 'ar') {
  const sp = SPREADS[i];
  g.save();
  g.clearRect(0, 0, W, H);
  if (layer === 'print') {
    cutPaper(g, sp);
    words(g, sp);
    folios(g, i, sp.light);
    // the fold's shade down the middle, where the pages curve into it
    const fold = g.createLinearGradient(PAGE - GUTTER, 0, PAGE + GUTTER, 0);
    fold.addColorStop(0, 'rgba(12, 24, 40, 0)');
    fold.addColorStop(0.42, 'rgba(12, 24, 40, 0.14)');
    fold.addColorStop(0.5, 'rgba(12, 24, 40, 0.24)');
    fold.addColorStop(0.58, 'rgba(12, 24, 40, 0.14)');
    fold.addColorStop(1, 'rgba(12, 24, 40, 0)');
    g.fillStyle = fold;
    g.fillRect(PAGE - GUTTER, 0, GUTTER * 2, H);
  } else {
    sp.ar(g, sp.hide);
  }
  g.restore();
}

/** Where Mouse hides on spread `i`, in the page texture's terms: u across the
 *  spread (0 at the left page's outer edge, 1 at the right's), v up it (0 at
 *  the bottom), the radius the lens has to come within, and Mouse's face's
 *  width, both in v. */
export function hideUv(i: number): { u: number; v: number; r: number; s: number } {
  const h = SPREADS[i].hide;
  return { u: h.x / W, v: 1 - h.y / H, r: h.r / H, s: h.s / H };
}

/** Mouse's face on its own, for the moment Mouse is found and pops out of the
 *  page: the face MOUSE_ICON of the canvas wide, a touch below the middle. */
export const MOUSE_ICON = 0.58;
export function mouseIcon(size = 256): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (g) mouse(g, size / 2, size * 0.52, size * MOUSE_ICON, { paws: true });
  return c;
}

/** The cover's print, on clear (the board's coral shows through): the title,
 *  and Mouse looking out of a round window ringed in coral, the lens of the
 *  pages inside. COVER_W × COVER_H is the board inside its rounded corners. */
export const COVER_W = 600;
export const COVER_H = 850;
export function drawCover(g: G) {
  const w = COVER_W;
  const h = COVER_H;
  g.save();
  g.clearRect(0, 0, w, h);
  g.fillStyle = CORAL_PALE;
  g.textBaseline = 'top';
  g.font = `600 92px ${FONT}`;
  g.fillText("Mouse's", 52, 56);
  g.fillText('day out', 52, 154);
  // the window: paper, a hill cut and laid in it, Mouse, the ring round it
  const cx = w / 2;
  const cy = h * 0.64;
  const r = w * 0.3;
  g.save();
  circle(g, cx, cy, r);
  g.fillStyle = PAPER;
  g.fill();
  g.clip();
  const hill = P();
  hill.moveTo(cx - r, cy + r * 0.5);
  hill.quadraticCurveTo(cx, cy + r * 0.2, cx + r, cy + r * 0.45);
  hill.lineTo(cx + r, cy + r);
  hill.lineTo(cx - r, cy + r);
  hill.closePath();
  shadow(g, 1);
  g.fillStyle = mix(SKY, DARK, 0.3);
  g.fill(hill);
  noShadow(g);
  mouse(g, cx, cy + r * 0.12, r * 0.95, { paws: true });
  g.restore();
  circle(g, cx, cy, r);
  g.lineWidth = 6;
  g.strokeStyle = INK;
  g.stroke();
  circle(g, cx, cy, r + 13);
  g.lineWidth = 12;
  g.strokeStyle = CORAL_PALE;
  g.stroke();
  g.fillStyle = CORAL_PALE;
  g.globalAlpha = 0.85;
  g.font = `400 34px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText(ASK, cx, h - 34);
  g.restore();
}

/** A sparkle, for the burst when Mouse is found: a four-pointed star with a
 *  pale heart, glowing. */
export function sparkleIcon(size = 64): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (g) {
    const m = size / 2;
    glow(g, size * 0.16);
    g.fillStyle = CORAL;
    g.fill(starP(m, m, size * 0.34));
    noGlow(g);
    g.fillStyle = CORAL_PALE;
    g.fill(starP(m, m, size * 0.15));
  }
  return c;
}
