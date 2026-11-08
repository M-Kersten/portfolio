// The Zwijsen book's pages: a little picture book of four spreads, drawn on a
// canvas in the model's stock (a deep ink on the pale cut of the drawing's
// blue), the way the shelf's books and the found creatures are. Mouse goes out
// for the day, and on every spread Mouse is hiding: not in the print, only in
// its AR layer, which the book's close-up shows through a lens round the
// cursor (room.tsx, OpenBook). Each spread is drawn twice: the print, and the
// AR layer over it (the coral of the room: Mouse, and a few things that come
// alive).
//
// A spread is SPREAD_W × SPREAD_H, the two pages side by side, each a picture
// book's page, a little taller than it's wide (room.tsx, BOOK_*): the left
// page is the canvas's left half, the right page its right half, and the fold
// runs down the middle (keep anything that matters out of it).

export const SPREAD_W = 1440;
export const SPREAD_H = 954;
const PAGE = SPREAD_W / 2;
const GUTTER = 36; // px either side of the fold that the binding shades
const MARGIN = 60;

// the paper is the model's pale cut, not white: the book sits in the room's
// light rather than shining out of it
const PAPER = '#b9cde3';
const INK = 'rgb(24, 38, 55)';
const tint = (a: number) => `rgba(24, 38, 55, ${a})`;
const paperTint = (a: number) => `rgba(185, 205, 227, ${a})`;
const CORAL = '#ff9068';
const CORAL_PALE = '#ffc5ab';
const FONT = '"Space Grotesk", ui-sans-serif, system-ui, sans-serif';
const MONO = '"Space Mono", ui-monospace, monospace';

type G = CanvasRenderingContext2D;
type P = [number, number];

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
interface Spread {
  /** the page's line, and where it's set (and in what: the night is dark) */
  text: string;
  textAt: { x: number; y: number; w: number };
  light?: boolean;
  ask: string;
  hide: Hide;
  print(g: G): void;
  ar(g: G, h: Hide): void;
}

/* ---------- the pen ---------- */

function pen(g: G, w = 5, c = INK) {
  g.lineWidth = w;
  g.strokeStyle = c;
  g.lineCap = 'round';
  g.lineJoin = 'round';
}
function shape(g: G, pts: P[], close = true) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (close) g.closePath();
}
function fillStroke(g: G, fill: string | null, w = 5) {
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  pen(g, w);
  g.stroke();
}
/** Fills the current path with the paper and then a tint of ink over it: a
 *  shade of the stock, solid, so it hides what's behind it. */
function fillShade(g: G, a: number, w = 5) {
  g.fillStyle = PAPER;
  g.fill();
  if (a > 0) {
    g.fillStyle = tint(a);
    g.fill();
  }
  if (w > 0) {
    pen(g, w);
    g.stroke();
  }
}
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
/** A point along a cubic curve (the hills' lines), at `t` 0…1. */
function bez(p0: P, p1: P, p2: P, p3: P, t: number): P {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

/* ---------- what the pages are drawn from ---------- */

/** A pine, the park's kind: three tiers stepping out, on a short trunk. */
function pine(g: G, x: number, base: number, h: number, w: number, shade = 0.16) {
  g.beginPath();
  g.rect(x - w * 0.05, base - h * 0.14, w * 0.1, h * 0.14);
  fillShade(g, shade + 0.08, 4);
  for (let i = 0; i < 3; i++) {
    const top = base - h + i * h * 0.24;
    const bot = base - h * 0.5 + i * h * 0.17;
    const half = (w / 2) * (0.62 + 0.19 * i);
    shape(g, [
      [x, top],
      [x + half, bot],
      [x - half, bot],
    ]);
    fillShade(g, shade);
  }
}
/** A round tree: a trunk and a crown of overlapping puffs. */
function roundTree(g: G, x: number, base: number, h: number, w: number) {
  shape(g, [
    [x - w * 0.07, base],
    [x - w * 0.04, base - h * 0.45],
    [x + w * 0.04, base - h * 0.45],
    [x + w * 0.07, base],
  ]);
  fillShade(g, 0.22);
  const puffs: [number, number, number][] = [
    [0, -0.72, 0.3],
    [-0.26, -0.58, 0.24],
    [0.26, -0.58, 0.24],
    [-0.14, -0.86, 0.22],
    [0.16, -0.84, 0.22],
  ];
  for (const [dx, dy, r] of puffs) {
    circle(g, x + dx * w, base + dy * h, r * w);
    fillShade(g, 0.12, 0);
  }
  pen(g, 5);
  for (const [dx, dy, r] of puffs) {
    circle(g, x + dx * w, base + dy * h, r * w);
    g.stroke();
  }
}
/** A mushroom with a spotted cap. */
function mushroom(g: G, x: number, base: number, s: number) {
  shape(g, [
    [x - s * 0.18, base],
    [x - s * 0.13, base - s * 0.5],
    [x + s * 0.13, base - s * 0.5],
    [x + s * 0.18, base],
  ]);
  fillStroke(g, PAPER, 4);
  capPath(g, x, base, s);
  fillShade(g, 0.3, 4);
  g.fillStyle = PAPER;
  for (const [dx, dy, r] of [
    [-0.2, -0.66, 0.07],
    [0.12, -0.78, 0.06],
    [0.3, -0.6, 0.05],
  ])
    circle(g, x + dx * s, base + dy * s, r * s), g.fill();
}
function capPath(g: G, x: number, base: number, s: number) {
  g.beginPath();
  g.moveTo(x - s * 0.5, base - s * 0.48);
  g.quadraticCurveTo(x, base - s * 1.25, x + s * 0.5, base - s * 0.48);
  g.closePath();
}
/** Little footprints, in pairs, along a run of points: Mouse went this way. */
function prints(g: G, pts: P[], every = 34, c = tint(0.55)) {
  g.fillStyle = c;
  let left = true;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    for (let d = 0; d < len; d += every) {
      const f = d / len;
      const side = left ? 1 : -1;
      left = !left;
      const px = x0 + (x1 - x0) * f + nx * 7 * side;
      const py = y0 + (y1 - y0) * f + ny * 7 * side;
      ellipse(g, px, py, 4.5, 3.2, Math.atan2(y1 - y0, x1 - x0));
      g.fill();
    }
  }
}
/** A canal house's windows: two to a floor, as [x, y, w, h]. */
function windowsOf(x: number, base: number, w: number, h: number): [number, number, number, number][] {
  const top = base - h;
  const floors = Math.max(2, Math.round(h / 120));
  const fh = (h - 90) / floors;
  const out: [number, number, number, number][] = [];
  for (let f = 0; f < floors; f++) for (const k of [0.18, 0.58]) out.push([x + w * k, top + 24 + f * fh, w * 0.24, fh * 0.55]);
  return out;
}
/** A canal house: a body, a gable (`kind`), its windows, a door. */
function house(g: G, x: number, base: number, w: number, h: number, kind: 'step' | 'neck' | 'point', shade: number) {
  const top = base - h;
  const roof: P[] =
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
  shape(g, [[x, base], ...roof, [x + w, base]]);
  fillShade(g, shade);
  for (const [wx, wy, ww, wh] of windowsOf(x, base, w, h)) {
    g.fillStyle = PAPER;
    g.fillRect(wx, wy, ww, wh);
    pen(g, 4);
    g.strokeRect(wx, wy, ww, wh);
    g.beginPath();
    g.moveTo(wx + ww / 2, wy);
    g.lineTo(wx + ww / 2, wy + wh);
    g.stroke();
  }
  const dw = w * 0.26;
  g.beginPath();
  g.moveTo(x + w / 2 - dw / 2, base);
  g.lineTo(x + w / 2 - dw / 2, base - 64);
  g.arc(x + w / 2, base - 64, dw / 2, Math.PI, 0);
  g.lineTo(x + w / 2 + dw / 2, base);
  g.closePath();
  fillStroke(g, tint(0.5), 4);
}
/** A row of waves, from x0 to x1 at height y. */
function waves(g: G, x0: number, x1: number, y: number, len = 64, amp = 10, w = 4) {
  pen(g, w);
  g.beginPath();
  g.moveTo(x0, y);
  for (let x = x0; x < x1; x += len) {
    g.quadraticCurveTo(x + len / 4, y - amp, x + len / 2, y);
    g.quadraticCurveTo(x + (len * 3) / 4, y + amp, x + len, y);
  }
  g.stroke();
}
/** A cloud, `sc` its size, its flat foot on y. */
function cloud(g: G, x: number, y: number, sc: number) {
  g.beginPath();
  g.moveTo(x - 90 * sc, y);
  g.quadraticCurveTo(x - 80 * sc, y - 50 * sc, x - 30 * sc, y - 40 * sc);
  g.quadraticCurveTo(x, y - 90 * sc, x + 50 * sc, y - 50 * sc);
  g.quadraticCurveTo(x + 100 * sc, y - 50 * sc, x + 90 * sc, y);
  g.closePath();
  fillStroke(g, PAPER, 4);
}
/** A gull: two arcs. */
function gull(g: G, x: number, y: number, s: number) {
  pen(g, 4);
  g.beginPath();
  g.moveTo(x - s, y);
  g.quadraticCurveTo(x - s / 2, y - s * 0.6, x, y);
  g.quadraticCurveTo(x + s / 2, y - s * 0.6, x + s, y);
  g.stroke();
}
/** A star: four points. */
function star(g: G, x: number, y: number, s: number, fill: string) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const r = i % 2 ? s * 0.32 : s;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
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
function tail(g: G, pts: P[]) {
  glow(g, 16);
  pen(g, 6, CORAL);
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i + 1 < pts.length; i += 2) g.quadraticCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
  g.stroke();
  noGlow(g);
}

/** The page's words: the line (in lines of even length), then the question
 *  under it. */
function words(g: G, sp: Spread) {
  const { x, y, w } = sp.textAt;
  g.fillStyle = sp.light ? PAPER : INK;
  g.font = `500 44px ${FONT}`;
  g.textBaseline = 'top';
  const wrap = (width: number) => {
    const lines: string[] = [];
    let line = '';
    for (const word of sp.text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (g.measureText(next).width > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
    return lines;
  };
  // as many lines as the box needs, but as even as they'll go
  const n = wrap(w).length;
  let lo = 0;
  let hi = w;
  while (hi - lo > 2) {
    const mid = (lo + hi) / 2;
    if (wrap(mid).length > n) lo = mid;
    else hi = mid;
  }
  const lines = wrap(hi);
  lines.forEach((l, i) => g.fillText(l, x, y + i * 56));
  g.fillStyle = sp.light ? paperTint(0.72) : tint(0.62);
  g.font = `400 30px ${FONT}`;
  g.fillText(sp.ask, x, y + lines.length * 56 + 12);
}
function folios(g: G, n: number) {
  g.fillStyle = tint(0.5);
  g.font = `400 22px ${MONO}`;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.fillText(String(n * 2 + 1), MARGIN, SPREAD_H - 30);
  g.textAlign = 'right';
  g.fillText(String(n * 2 + 2), SPREAD_W - MARGIN, SPREAD_H - 30);
  g.textAlign = 'left';
}

/* ---------- the four spreads ---------- */

const ASK = 'Can you find Mouse?';
/** The words' box, top left of the left page, and top left of the right. */
const LEFT_TEXT = { x: MARGIN + 6, y: 58, w: PAGE - MARGIN * 2 - GUTTER };
const RIGHT_TEXT = { x: PAGE + GUTTER + 34, y: 58, w: PAGE - MARGIN * 2 - GUTTER };

// the woods: the hill's line, and the mushrooms by the path (the AR caps glow over them)
const HILL: [P, P, P, P] = [
  [0, 735],
  [380, 668],
  [960, 772],
  [SPREAD_W, 700],
];
const SHROOMS: [number, number, number][] = [
  [1340, 912, 48],
  [620, 938, 40],
  [176, 840, 44],
];
// the town: the houses along the canal, and which of their windows are lit in AR
const QUAY = 770;
const TOWN: [number, number, number, number, 'step' | 'neck' | 'point', number][] = [
  [36, QUAY, 128, 400, 'step', 0.16],
  [164, QUAY, 118, 460, 'neck', 0.24],
  [282, QUAY, 128, 380, 'point', 0.12],
  [410, QUAY, 122, 430, 'step', 0.2],
  [532, QUAY, 128, 370, 'neck', 0.1],
  [776, QUAY, 128, 450, 'point', 0.18],
  [904, QUAY, 122, 400, 'step', 0.1],
  [1026, QUAY, 132, 470, 'neck', 0.22],
  [1158, QUAY, 122, 390, 'point', 0.14],
  [1280, QUAY, 128, 440, 'step', 0.18],
];
const LIT = [1, 4, 8, 11, 15, 21, 24, 29, 33, 38, 42, 47, 53, 58, 62, 67];
// home: the ground's line, and the stars
const GROUND: [P, P, P, P] = [
  [0, 480],
  [380, 410],
  [920, 520],
  [SPREAD_W, 450],
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
const SKY = 0.58; // the night's shade over the paper

export const SPREADS: Spread[] = [
  // 1. the woods: footprints up the path to a hollow log
  {
    text: 'Mouse went for a walk in the woods.',
    textAt: LEFT_TEXT,
    ask: ASK,
    hide: { x: 1000, y: 790, r: 50, s: 76 },
    print(g) {
      // the sun, a cloud and two birds
      pen(g, 5);
      circle(g, 1250, 140, 52);
      g.stroke();
      cloud(g, 990, 300, 1);
      gull(g, 1080, 160, 26);
      gull(g, 1140, 198, 18);
      // the trees, back to front, standing behind the hill
      pine(g, 100, 750, 380, 160, 0.12);
      pine(g, 290, 740, 470, 200, 0.18);
      roundTree(g, 530, 760, 440, 270);
      pine(g, 860, 735, 400, 170, 0.14);
      pine(g, 1172, 716, 300, 120, 0.1);
      pine(g, 1350, 712, 440, 170, 0.16);
      // the hill in front of their feet
      g.beginPath();
      g.moveTo(...HILL[0]);
      g.bezierCurveTo(...HILL[1], ...HILL[2], ...HILL[3]);
      g.lineTo(SPREAD_W, SPREAD_H);
      g.lineTo(0, SPREAD_H);
      g.closePath();
      fillShade(g, 0.08);
      // the path, winding up from the bottom to the log
      pen(g, 4, tint(0.7));
      g.beginPath();
      g.moveTo(120, SPREAD_H);
      g.bezierCurveTo(330, 850, 640, 880, 945, 808);
      g.stroke();
      g.beginPath();
      g.moveTo(300, SPREAD_H);
      g.bezierCurveTo(480, 900, 760, 920, 975, 848);
      g.stroke();
      prints(g, [
        [215, 938],
        [380, 884],
        [560, 866],
        [760, 850],
        [930, 826],
      ]);
      // the hollow log, its open end toward the path
      g.beginPath();
      g.moveTo(1000, 752);
      g.lineTo(1250, 746);
      g.quadraticCurveTo(1286, 797, 1250, 848);
      g.lineTo(1000, 850);
      g.closePath();
      fillShade(g, 0.22);
      pen(g, 3, tint(0.6));
      for (const y of [778, 816]) {
        g.beginPath();
        g.moveTo(1060, y);
        g.lineTo(1220, y - 3);
        g.stroke();
      }
      ellipse(g, 1000, 801, 38, 49);
      fillStroke(g, PAPER, 5);
      ellipse(g, 1000, 801, 26, 36);
      g.fillStyle = INK;
      g.fill();
      for (const [x, b, sz] of SHROOMS) mushroom(g, x, b, sz);
    },
    ar(g, h) {
      // fireflies, and the mushrooms' caps glowing
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
      ]) {
        circle(g, x, y, r);
        g.fill();
      }
      g.globalAlpha = 0.75;
      for (const [x, b, sz] of SHROOMS) {
        capPath(g, x, b, sz);
        g.fill();
      }
      g.globalAlpha = 1;
      // the sun's rays
      pen(g, 5, CORAL);
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
    text: 'Then Mouse went into town.',
    textAt: LEFT_TEXT,
    ask: ASK,
    hide: { x: 421, y: 602, r: 50, s: 72 },
    print(g) {
      for (const [x, b, w, h, kind, shade] of TOWN) house(g, x, b, w, h, kind, shade);
      // the quay and the water
      g.fillStyle = tint(0.1);
      g.fillRect(0, QUAY + 42, SPREAD_W, SPREAD_H - QUAY - 42);
      pen(g, 5);
      for (const y of [QUAY, QUAY + 42]) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(SPREAD_W, y);
        g.stroke();
      }
      for (const [y, off] of [
        [862, 0],
        [902, 30],
        [940, 10],
      ])
        waves(g, -off, SPREAD_W, y, 80, 8, 3.5);
      // a footbridge over it, on the right page
      g.beginPath();
      g.moveTo(960, QUAY + 42);
      g.quadraticCurveTo(1130, 690, 1300, QUAY + 42);
      g.lineTo(1300, QUAY + 72);
      g.quadraticCurveTo(1130, 740, 960, QUAY + 72);
      g.closePath();
      fillShade(g, 0.2);
      // the bicycle against a house, its basket in front
      const bx = 330;
      const by = QUAY - 8;
      pen(g, 5);
      for (const wx of [bx - 70, bx + 70]) {
        circle(g, wx, by - 46, 46);
        g.fillStyle = PAPER;
        g.fill();
        g.stroke();
        circle(g, wx, by - 46, 5);
        g.fillStyle = INK;
        g.fill();
      }
      const frame: P[][] = [
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
      ];
      for (const f of frame) {
        shape(g, f, false);
        g.stroke();
      }
      g.fillStyle = INK;
      g.fillRect(bx - 58, by - 136, 36, 9);
      // the basket, woven
      shape(g, [
        [bx + 56, by - 128],
        [bx + 126, by - 128],
        [bx + 116, by - 78],
        [bx + 64, by - 78],
      ]);
      fillShade(g, 0.32);
      pen(g, 2.5, tint(0.7));
      for (let i = 1; i < 4; i++) {
        g.beginPath();
        g.moveTo(bx + 56 + i * 17.5, by - 128);
        g.lineTo(bx + 62 + i * 13, by - 78);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(bx + 60, by - 103);
      g.lineTo(bx + 121, by - 103);
      g.stroke();
      // footprints along the quay, from the right, to the bicycle
      prints(g, [
        [664, QUAY + 21],
        [540, QUAY + 21],
        [470, QUAY + 19],
      ]);
    },
    ar(g, h) {
      // the windows lit, and bunting across the street
      const wins = TOWN.flatMap(([x, b, w, ht]) => windowsOf(x, b, w, ht));
      glow(g, 14);
      g.fillStyle = CORAL;
      g.globalAlpha = 0.85;
      for (const i of LIT) {
        const r = wins[i];
        if (r) g.fillRect(r[0] + 3, r[1] + 3, r[2] - 6, r[3] - 6);
      }
      g.globalAlpha = 1;
      pen(g, 3, CORAL);
      g.beginPath();
      g.moveTo(0, 270);
      g.quadraticCurveTo(SPREAD_W / 2, 430, SPREAD_W, 270);
      g.stroke();
      for (let i = 1; i < 20; i++) {
        const t = i / 20;
        const x = t * SPREAD_W;
        if (Math.abs(x - PAGE) < GUTTER) continue; // not in the fold
        const y = (1 - t) * (1 - t) * 270 + 2 * (1 - t) * t * 430 + t * t * 270;
        shape(g, [
          [x - 16, y - 2],
          [x + 16, y - 2],
          [x, y + 32],
        ]);
        g.fillStyle = i % 2 ? CORAL : CORAL_PALE;
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
    text: 'Mouse went out to sea.',
    textAt: RIGHT_TEXT,
    ask: ASK,
    hide: { x: 1080, y: 608, r: 50, s: 72 },
    print(g) {
      // the clouds and the gulls
      cloud(g, 1010, 360, 1);
      cloud(g, 1280, 430, 0.7);
      gull(g, 860, 420, 22);
      gull(g, 912, 460, 16);
      gull(g, 120, 300, 20);
      gull(g, 172, 332, 14);
      // the sea, from the horizon down
      g.fillStyle = tint(0.1);
      g.fillRect(0, 520, SPREAD_W, SPREAD_H - 520);
      pen(g, 5);
      g.beginPath();
      g.moveTo(0, 520);
      g.lineTo(SPREAD_W, 520);
      g.stroke();
      for (let r = 0; r < 8; r++) waves(g, -(r * 23) % 80, SPREAD_W, 575 + r * 54, 90, 9, 3.5);
      // the lighthouse on the left page, on its rock
      g.beginPath();
      g.moveTo(120, 830);
      g.quadraticCurveTo(190, 700, 330, 718);
      g.quadraticCurveTo(470, 700, 540, 840);
      g.closePath();
      fillShade(g, 0.34);
      const lx = 330;
      shape(g, [
        [lx - 66, 728],
        [lx - 42, 230],
        [lx + 42, 230],
        [lx + 66, 728],
      ]);
      fillStroke(g, PAPER, 5);
      for (const [y0, y1] of [
        [300, 380],
        [460, 540],
        [620, 700],
      ]) {
        const w0 = 42 + ((y0 - 230) / 498) * 24;
        const w1 = 42 + ((y1 - 230) / 498) * 24;
        shape(g, [
          [lx - w0, y0],
          [lx + w0, y0],
          [lx + w1, y1],
          [lx - w1, y1],
        ]);
        fillShade(g, 0.5, 4);
      }
      // the gallery, the lamp room and the cap
      g.beginPath();
      g.rect(lx - 62, 214, 124, 16);
      fillShade(g, 0.3);
      g.beginPath();
      g.rect(lx - 38, 140, 76, 74);
      fillStroke(g, PAPER, 5);
      shape(g, [
        [lx - 52, 140],
        [lx, 86],
        [lx + 52, 140],
      ]);
      fillShade(g, 0.5);
      g.fillStyle = tint(0.6);
      g.fillRect(lx - 17, 668, 34, 56);
      // the rowing boat on the waves, its oars out, nobody in it
      pen(g, 5);
      g.beginPath();
      g.moveTo(1025, 654);
      g.lineTo(947, 732);
      g.moveTo(1135, 654);
      g.lineTo(1219, 726);
      g.stroke();
      g.beginPath();
      g.moveTo(985, 640);
      g.lineTo(1175, 640);
      g.quadraticCurveTo(1155, 700, 1095, 705);
      g.lineTo(1035, 705);
      g.quadraticCurveTo(995, 695, 985, 640);
      g.closePath();
      fillShade(g, 0.3);
    },
    ar(g, h) {
      // the lamp alight and its beam out over the sea, and fish under it
      glow(g, 22);
      g.fillStyle = CORAL;
      g.fillRect(294, 144, 72, 66);
      g.globalAlpha = 0.3;
      shape(g, [
        [370, 158],
        [SPREAD_W, 262],
        [SPREAD_W, 470],
        [370, 200],
      ]);
      g.fill();
      g.globalAlpha = 1;
      for (const [x, y, sz, d] of [
        [560, 770, 34, 1],
        [1300, 860, 28, -1],
        [420, 905, 24, 1],
        [860, 890, 30, -1],
      ]) {
        ellipse(g, x, y, sz, sz * 0.45);
        g.fill();
        shape(g, [
          [x - d * sz * 0.9, y],
          [x - d * sz * 1.5, y - sz * 0.45],
          [x - d * sz * 1.5, y + sz * 0.45],
        ]);
        g.fill();
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
    text: 'And then Mouse went home to bed.',
    textAt: LEFT_TEXT,
    light: true,
    ask: ASK,
    hide: { x: 1196, y: 819, r: 48, s: 58 },
    print(g) {
      // the night over the hill: the sky, the moon, the stars
      g.beginPath();
      g.rect(0, 0, SPREAD_W, 540);
      fillShade(g, SKY, 0);
      // the moon: a disc, its shadow cut out of it (inside the disc only, so
      // the cut leaves no edge on the sky)
      g.save();
      circle(g, 1250, 130, 64);
      g.fillStyle = PAPER;
      g.fill();
      g.clip();
      circle(g, 1278, 112, 56);
      fillShade(g, SKY, 0);
      g.restore();
      for (const [x, y, sz] of STARS) star(g, x, y, sz, PAPER);
      // the ground under the hill, its line, grass along it
      g.beginPath();
      g.moveTo(...GROUND[0]);
      g.bezierCurveTo(...GROUND[1], ...GROUND[2], ...GROUND[3]);
      g.lineTo(SPREAD_W, SPREAD_H);
      g.lineTo(0, SPREAD_H);
      g.closePath();
      fillShade(g, 0.3);
      pen(g, 3.5);
      for (const t of [0.05, 0.3, 0.47, 0.66, 0.93]) {
        const [x, y] = bez(...GROUND, t);
        g.beginPath();
        g.moveTo(x - 14, y + 4);
        g.lineTo(x - 6, y - 18);
        g.moveTo(x, y + 4);
        g.lineTo(x + 2, y - 24);
        g.moveTo(x + 12, y + 4);
        g.lineTo(x + 16, y - 16);
        g.stroke();
      }
      // stones in the soil
      for (const [x, y, rx, ry] of [
        [120, 640, 30, 18],
        [460, 880, 24, 15],
        [300, 920, 34, 20],
        [1410, 560, 26, 16],
        [200, 790, 18, 12],
        [640, 570, 22, 13],
      ]) {
        ellipse(g, x, y, rx, ry);
        fillShade(g, 0.4, 4);
      }
      // the round door in the hill, and the tunnel from it down to the room
      const [dx, dy] = bez(...GROUND, 0.16);
      g.beginPath();
      g.moveTo(dx - 40, dy + 8);
      g.lineTo(dx - 40, dy - 32);
      g.arc(dx, dy - 32, 40, Math.PI, 0);
      g.lineTo(dx + 40, dy + 8);
      g.closePath();
      fillShade(g, 0.55);
      g.lineCap = 'round';
      g.lineWidth = 70;
      g.beginPath();
      g.moveTo(dx, dy + 44);
      g.bezierCurveTo(dx + 10, 650, 560, 700, 880, 800);
      g.strokeStyle = PAPER;
      g.stroke();
      g.strokeStyle = tint(0.08);
      g.stroke();
      prints(g, [
        [dx + 4, dy + 62],
        [250, 610],
        [390, 690],
        [560, 742],
        [720, 774],
        [860, 800],
      ]);
      // the room: a round-topped hollow, cut away
      g.beginPath();
      g.moveTo(856, 920);
      g.lineTo(856, 720);
      g.bezierCurveTo(856, 560, 1350, 560, 1350, 720);
      g.lineTo(1350, 920);
      g.closePath();
      fillStroke(g, PAPER, 5);
      pen(g, 5);
      g.beginPath();
      g.moveTo(856, 878);
      g.lineTo(1350, 878);
      g.stroke();
      // a lamp hanging from the roof
      pen(g, 4);
      g.beginPath();
      g.moveTo(1050, 602);
      g.lineTo(1050, 650);
      g.stroke();
      shape(g, [
        [1026, 680],
        [1074, 680],
        [1062, 650],
        [1038, 650],
      ]);
      fillShade(g, 0.25, 4);
      // a shelf of books on the wall, and a framed cheese
      g.fillStyle = INK;
      g.fillRect(890, 790, 120, 8);
      for (let i = 0; i < 6; i++) {
        g.fillStyle = tint(0.3 + (i % 3) * 0.15);
        g.fillRect(896 + i * 19, 790 - 38 - (i % 2) * 8, 14, 38 + (i % 2) * 8);
      }
      pen(g, 4);
      g.strokeRect(905, 680, 70, 56);
      shape(g, [
        [917, 724],
        [963, 724],
        [963, 702],
      ]);
      fillShade(g, 0.25, 3);
      // the bed: a headboard, a pillow, and the blanket over something small
      g.beginPath();
      g.rect(1150, 795, 14, 83);
      fillShade(g, 0.35, 4);
      g.fillStyle = PAPER;
      g.fillRect(1164, 845, 160, 18);
      g.strokeRect(1164, 845, 160, 18);
      ellipse(g, 1198, 835, 30, 15);
      fillStroke(g, PAPER, 4);
      g.beginPath();
      g.moveTo(1226, 847);
      g.bezierCurveTo(1234, 805, 1310, 805, 1318, 847);
      g.closePath();
      fillShade(g, 0.25, 4);
      g.fillStyle = tint(0.25);
      g.fillRect(1226, 847, 92, 16);
      // a rug
      ellipse(g, 1010, 886, 70, 9);
      fillShade(g, 0.3, 3.5);
    },
    ar(g, h) {
      // the stars twinkling, the lamp's light, the door aglow
      glow(g, 18);
      for (const [x, y, sz] of STARS) star(g, x, y, sz * 1.4, CORAL);
      g.fillStyle = CORAL;
      g.globalAlpha = 0.3;
      shape(g, [
        [1028, 680],
        [1072, 680],
        [1140, 873],
        [960, 873],
      ]);
      g.fill();
      g.globalAlpha = 0.85;
      const [dx, dy] = bez(...GROUND, 0.16);
      g.beginPath();
      g.moveTo(dx - 32, dy + 8);
      g.lineTo(dx - 32, dy - 30);
      g.arc(dx, dy - 30, 32, Math.PI, 0);
      g.lineTo(dx + 32, dy + 8);
      g.closePath();
      g.fill();
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

/** Draws spread `i`: its print (paper, the picture, the words and the page
 *  numbers) or its AR layer (on clear, for the lens). */
export function drawSpread(g: G, i: number, layer: 'print' | 'ar') {
  const sp = SPREADS[i];
  g.save();
  g.clearRect(0, 0, SPREAD_W, SPREAD_H);
  if (layer === 'print') {
    g.fillStyle = PAPER;
    g.fillRect(0, 0, SPREAD_W, SPREAD_H);
    sp.print(g);
    words(g, sp);
    folios(g, i);
    // the fold's shade down the middle, where the pages curve into it
    const fold = g.createLinearGradient(PAGE - GUTTER, 0, PAGE + GUTTER, 0);
    fold.addColorStop(0, tint(0));
    fold.addColorStop(0.42, tint(0.12));
    fold.addColorStop(0.5, tint(0.2));
    fold.addColorStop(0.58, tint(0.12));
    fold.addColorStop(1, tint(0));
    g.fillStyle = fold;
    g.fillRect(PAGE - GUTTER, 0, GUTTER * 2, SPREAD_H);
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
  return { u: h.x / SPREAD_W, v: 1 - h.y / SPREAD_H, r: h.r / SPREAD_H, s: h.s / SPREAD_H };
}

/** Mouse's face on its own, for the moment Mouse is found and pops out of the
 *  page: the face MOUSE_ICON of the canvas wide, a touch below the middle. */
export const MOUSE_ICON = 0.58;
export function mouseIcon(size = 256): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) mouse(g, size / 2, size * 0.52, size * MOUSE_ICON, { paws: true });
  return c;
}

/** The cover's print, on clear (the board's coral shows through): the title,
 *  and Mouse looking out of a round window ringed in coral, the lens of the
 *  pages inside. `w` × `h` is the board inside its rounded corners. */
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
  // the window: paper, a hill, Mouse, and the coral ring round it
  const cx = w / 2;
  const cy = h * 0.64;
  const r = w * 0.3;
  g.save();
  circle(g, cx, cy, r);
  g.fillStyle = PAPER;
  g.fill();
  g.clip();
  g.beginPath();
  g.moveTo(cx - r, cy + r * 0.5);
  g.quadraticCurveTo(cx, cy + r * 0.2, cx + r, cy + r * 0.45);
  g.lineTo(cx + r, cy + r);
  g.lineTo(cx - r, cy + r);
  g.closePath();
  fillShade(g, 0.12);
  mouse(g, cx, cy + r * 0.12, r * 0.95, { paws: true });
  g.restore();
  circle(g, cx, cy, r);
  pen(g, 6);
  g.stroke();
  circle(g, cx, cy, r + 13);
  pen(g, 12, CORAL_PALE);
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
  const g = c.getContext('2d');
  if (g) {
    const m = size / 2;
    glow(g, size * 0.16);
    star(g, m, m, size * 0.34, CORAL);
    noGlow(g);
    star(g, m, m, size * 0.15, CORAL_PALE);
  }
  return c;
}
