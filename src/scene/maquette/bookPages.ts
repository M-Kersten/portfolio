// The Zwijsen book's pages: a little picture book of four spreads, drawn on a
// canvas in the model's stock (a deep ink on the drawing's white-blue), the way
// the shelf's books and the found creatures are. Mouse goes out for the day,
// and on every spread Mouse is hiding: not in the print, only in its AR layer,
// which the book's close-up shows through a lens round the cursor (room.tsx,
// OpenBook). Each spread is drawn twice: the print, and the AR layer over it
// (the coral of the room: Mouse, and a few things that come alive).
//
// A spread is SPREAD_W × SPREAD_H, the two pages side by side: the left page
// is the canvas's left half, the right page its right half, with the gutter
// between them down the middle (keep anything that matters out of it).

export const SPREAD_W = 1024;
export const SPREAD_H = 1260;
const PAGE = SPREAD_W / 2;
const GUTTER = 30; // px either side of the fold that the binding takes
const MARGIN = 44;

const PAPER = '#d3e4f6';
const INK = 'rgb(26, 41, 58)';
const tint = (a: number) => `rgba(26, 41, 58, ${a})`;
const CORAL = '#ff9068';
const CORAL_PALE = '#ffc5ab';
const FONT = '"Space Grotesk", ui-sans-serif, system-ui, sans-serif';
const MONO = '"Space Mono", ui-monospace, monospace';

type G = CanvasRenderingContext2D;

/** Where Mouse hides on a spread, in spread pixels (x across, y down), and how
 *  close the lens has to come to count as found. */
export interface Hide {
  x: number;
  y: number;
  r: number;
}
interface Spread {
  /** the page's line, and where it's set */
  text: string;
  textAt: { x: number; y: number; w: number };
  ask: string;
  hide: Hide;
  print(g: G): void;
  ar(g: G): void;
}

/* ---------- the pen ---------- */

function pen(g: G, w = 5, c = INK) {
  g.lineWidth = w;
  g.strokeStyle = c;
  g.lineCap = 'round';
  g.lineJoin = 'round';
}
function shape(g: G, pts: [number, number][], close = true) {
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

/* ---------- what the pages are drawn from ---------- */

/** A pine, the park's kind: three tiers stepping out, on a short trunk. */
function pine(g: G, x: number, base: number, h: number, w: number, shade = 0.16) {
  g.fillStyle = tint(shade + 0.08);
  g.fillRect(x - w * 0.05, base - h * 0.14, w * 0.1, h * 0.14);
  pen(g, 4);
  g.strokeRect(x - w * 0.05, base - h * 0.14, w * 0.1, h * 0.14);
  for (let i = 0; i < 3; i++) {
    const top = base - h + i * h * 0.24;
    const bot = base - h * 0.5 + i * h * 0.17;
    const half = (w / 2) * (0.62 + 0.19 * i);
    shape(g, [
      [x, top],
      [x + half, bot],
      [x - half, bot],
    ]);
    fillStroke(g, tint(shade), 5);
  }
}
/** A round tree: a trunk and a crown of overlapping puffs. */
function roundTree(g: G, x: number, base: number, h: number, w: number) {
  g.fillStyle = tint(0.22);
  shape(g, [
    [x - w * 0.07, base],
    [x - w * 0.04, base - h * 0.45],
    [x + w * 0.04, base - h * 0.45],
    [x + w * 0.07, base],
  ]);
  fillStroke(g, tint(0.22), 5);
  const puffs: [number, number, number][] = [
    [0, -0.72, 0.3],
    [-0.26, -0.58, 0.24],
    [0.26, -0.58, 0.24],
    [-0.14, -0.86, 0.22],
    [0.16, -0.84, 0.22],
  ];
  g.fillStyle = tint(0.12);
  for (const [dx, dy, r] of puffs) {
    circle(g, x + dx * w, base + dy * h, r * w);
    g.fill();
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
  g.beginPath();
  g.moveTo(x - s * 0.5, base - s * 0.48);
  g.quadraticCurveTo(x, base - s * 1.25, x + s * 0.5, base - s * 0.48);
  g.closePath();
  fillStroke(g, tint(0.3), 4);
  g.fillStyle = PAPER;
  for (const [dx, dy, r] of [
    [-0.2, -0.66, 0.07],
    [0.12, -0.78, 0.06],
    [0.3, -0.6, 0.05],
  ])
    circle(g, x + dx * s, base + dy * s, r * s), g.fill();
}
/** Little footprints, in pairs, along a run of points: Mouse went this way. */
function prints(g: G, pts: [number, number][], every = 34) {
  g.fillStyle = tint(0.55);
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
  const roof: [number, number][] =
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
  fillStroke(g, tint(shade), 5);
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
  g.lineTo(x + w / 2 - dw / 2, base - 70);
  g.arc(x + w / 2, base - 70, dw / 2, Math.PI, 0);
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
function tail(g: G, pts: [number, number][]) {
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
  g.fillStyle = INK;
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
  g.fillStyle = tint(0.62);
  g.font = `400 32px ${FONT}`;
  g.fillText(sp.ask, x, y + lines.length * 56 + 14);
}
function folios(g: G, n: number) {
  g.fillStyle = tint(0.5);
  g.font = `400 24px ${MONO}`;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.fillText(String(n * 2 + 1), MARGIN, SPREAD_H - 34);
  g.textAlign = 'right';
  g.fillText(String(n * 2 + 2), SPREAD_W - MARGIN, SPREAD_H - 34);
  g.textAlign = 'left';
}

/* ---------- the four spreads ---------- */

const ASK = 'Can you find Mouse?';

// the woods: the hill's line, the mushrooms by the path (the AR caps glow over them)
const HILL = (g: G) => {
  g.beginPath();
  g.moveTo(0, 1090);
  g.bezierCurveTo(260, 1030, 640, 1110, SPREAD_W, 1050);
};
const SHROOMS: [number, number, number][] = [
  [940, 1150, 50],
  [530, 1215, 42],
  [250, 1125, 46],
];
// the town: the houses along the canal, and which of their windows are lit in AR
const TOWN: [number, number, number, number, 'step' | 'neck' | 'point', number][] = [
  [40, 960, 150, 520, 'step', 0.16],
  [190, 960, 140, 600, 'neck', 0.24],
  [330, 960, 150, 470, 'point', 0.12],
  [560, 960, 150, 560, 'neck', 0.18],
  [710, 960, 140, 500, 'step', 0.1],
  [850, 960, 140, 610, 'point', 0.22],
];
const LIT = [1, 4, 9, 12, 15, 20, 23, 26, 31, 34];
// home: the stars
const STARS: [number, number, number][] = [
  [640, 110, 14],
  [740, 300, 10],
  [960, 380, 12],
  [560, 400, 9],
  [420, 330, 11],
  [250, 420, 9],
  [90, 360, 12],
  [690, 520, 8],
  [960, 560, 9],
];

export const SPREADS: Spread[] = [
  // 1. the woods: footprints up the path to a hollow log
  {
    text: 'Mouse went for a walk in the woods.',
    textAt: { x: MARGIN + 10, y: 70, w: PAGE - MARGIN * 2 - GUTTER },
    ask: ASK,
    hide: { x: 650, y: 1090, r: 46 },
    print(g) {
      // the sun, a cloud and a bird
      pen(g, 5);
      circle(g, 880, 150, 52);
      g.stroke();
      g.beginPath();
      g.moveTo(560, 420);
      g.quadraticCurveTo(570, 370, 620, 380);
      g.quadraticCurveTo(650, 330, 700, 370);
      g.quadraticCurveTo(750, 360, 750, 420);
      g.closePath();
      g.fillStyle = PAPER;
      g.fill();
      g.stroke();
      gull(g, 700, 250, 26);
      gull(g, 760, 290, 18);
      // the trees, back to front, standing behind the hill
      pine(g, 120, 1080, 440, 190, 0.12);
      pine(g, 330, 1070, 560, 220, 0.18);
      roundTree(g, 680, 1100, 470, 300);
      pine(g, 940, 1070, 500, 180, 0.14);
      // the hill in front of their feet
      HILL(g);
      g.lineTo(SPREAD_W, SPREAD_H);
      g.lineTo(0, SPREAD_H);
      g.closePath();
      g.fillStyle = PAPER;
      g.fill();
      g.fillStyle = tint(0.08);
      g.fill();
      HILL(g);
      pen(g, 5);
      g.stroke();
      // the path, winding up from the bottom to the log
      pen(g, 4, tint(0.7));
      g.beginPath();
      g.moveTo(90, SPREAD_H);
      g.bezierCurveTo(260, 1160, 420, 1170, 590, 1105);
      g.stroke();
      g.beginPath();
      g.moveTo(200, SPREAD_H);
      g.bezierCurveTo(340, 1200, 500, 1210, 630, 1145);
      g.stroke();
      prints(g, [
        [160, 1245],
        [300, 1190],
        [450, 1172],
        [560, 1135],
        [612, 1112],
      ]);
      // the hollow log, its open end toward the path
      g.beginPath();
      g.moveTo(650, 1046);
      g.lineTo(880, 1040);
      g.quadraticCurveTo(912, 1085, 880, 1130);
      g.lineTo(650, 1134);
      g.closePath();
      fillStroke(g, tint(0.22), 5);
      pen(g, 3, tint(0.6));
      for (const y of [1072, 1100]) {
        g.beginPath();
        g.moveTo(710, y);
        g.lineTo(850, y - 3);
        g.stroke();
      }
      ellipse(g, 650, 1090, 36, 46);
      fillStroke(g, PAPER, 5);
      ellipse(g, 650, 1090, 25, 34);
      g.fillStyle = INK;
      g.fill();
      for (const [x, b, sz] of SHROOMS) mushroom(g, x, b, sz);
    },
    ar(g) {
      // fireflies, and the mushrooms' caps glowing
      glow(g, 16);
      g.fillStyle = CORAL;
      for (const [x, y, r] of [
        [210, 640, 7],
        [470, 560, 6],
        [560, 860, 8],
        [820, 700, 7],
        [380, 900, 6],
        [960, 880, 6],
        [690, 520, 5],
        [130, 900, 6],
      ]) {
        circle(g, x, y, r);
        g.fill();
      }
      g.globalAlpha = 0.75;
      for (const [x, b, sz] of SHROOMS) {
        g.beginPath();
        g.moveTo(x - sz * 0.5, b - sz * 0.48);
        g.quadraticCurveTo(x, b - sz * 1.25, x + sz * 0.5, b - sz * 0.48);
        g.closePath();
        g.fill();
      }
      g.globalAlpha = 1;
      // the sun's rays
      pen(g, 5, CORAL);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        g.beginPath();
        g.moveTo(880 + Math.cos(a) * 68, 150 + Math.sin(a) * 68);
        g.lineTo(880 + Math.cos(a) * 96, 150 + Math.sin(a) * 96);
        g.stroke();
      }
      noGlow(g);
      // Mouse, looking out of the log, the tail out of its far end
      tail(g, [
        [888, 1100],
        [925, 1082],
        [940, 1110],
        [955, 1138],
        [985, 1124],
      ]);
      mouse(g, 650, 1078, 74, { paws: true });
    },
  },
  // 2. the town: the canal, its houses, and a bicycle with a basket
  {
    text: 'Then Mouse went into town.',
    textAt: { x: MARGIN + 10, y: 70, w: PAGE - MARGIN * 2 - GUTTER },
    ask: ASK,
    hide: { x: 851, y: 800, r: 46 },
    print(g) {
      for (const [x, b, w, h, kind, shade] of TOWN) house(g, x, b, w, h, kind, shade);
      // the quay and the water
      pen(g, 5);
      g.beginPath();
      g.moveTo(0, 960);
      g.lineTo(SPREAD_W, 960);
      g.stroke();
      g.fillStyle = tint(0.1);
      g.fillRect(0, 1010, SPREAD_W, SPREAD_H - 1010);
      pen(g, 5);
      g.beginPath();
      g.moveTo(0, 1010);
      g.lineTo(SPREAD_W, 1010);
      g.stroke();
      for (const [y, off] of [
        [1080, 0],
        [1150, 30],
        [1215, 10],
      ])
        waves(g, -off, SPREAD_W, y, 80, 8, 3.5);
      // a footbridge on the left page
      g.beginPath();
      g.moveTo(40, 1010);
      g.quadraticCurveTo(210, 880, 380, 1010);
      g.lineTo(380, 1040);
      g.quadraticCurveTo(210, 930, 40, 1040);
      g.closePath();
      fillStroke(g, tint(0.2), 5);
      // the bicycle against a house, its basket in front
      const bx = 760;
      const by = 952;
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
      const frame: [number, number][][] = [
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
      fillStroke(g, tint(0.32), 5);
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
      // footprints along the quay to the bicycle
      prints(g, [
        [430, 985],
        [600, 985],
        [690, 978],
      ]);
    },
    ar(g) {
      // the windows lit, and bunting across the street
      const wins = TOWN.flatMap(([x, b, w, h]) => windowsOf(x, b, w, h));
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
      g.moveTo(0, 300);
      g.quadraticCurveTo(SPREAD_W / 2, 400, SPREAD_W, 300);
      g.stroke();
      for (let i = 1; i < 14; i++) {
        const t = i / 14;
        const x = t * SPREAD_W;
        const y = (1 - t) * (1 - t) * 300 + 2 * (1 - t) * t * 400 + t * t * 300;
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
        [884, 850],
        [905, 872],
        [895, 896],
        [885, 920],
        [902, 940],
      ]);
      mouse(g, 851, 792, 72, { paws: true });
    },
  },
  // 3. the sea: a lighthouse on its rock, and a rowing boat out on the waves
  {
    text: 'Mouse went out to sea.',
    textAt: { x: PAGE + GUTTER + 10, y: 70, w: PAGE - MARGIN - GUTTER - 20 },
    ask: ASK,
    hide: { x: 745, y: 846, r: 46 },
    print(g) {
      // the clouds and the gulls
      pen(g, 4);
      for (const [x, y, sc] of [
        [690, 400, 1],
        [880, 490, 0.7],
      ]) {
        g.beginPath();
        g.moveTo(x - 90 * sc, y);
        g.quadraticCurveTo(x - 80 * sc, y - 50 * sc, x - 30 * sc, y - 40 * sc);
        g.quadraticCurveTo(x, y - 90 * sc, x + 50 * sc, y - 50 * sc);
        g.quadraticCurveTo(x + 100 * sc, y - 50 * sc, x + 90 * sc, y);
        g.closePath();
        g.fillStyle = PAPER;
        g.fill();
        g.stroke();
      }
      gull(g, 560, 580, 22);
      gull(g, 620, 630, 16);
      // the sea, from the horizon down
      g.fillStyle = tint(0.1);
      g.fillRect(0, 720, SPREAD_W, SPREAD_H - 720);
      pen(g, 5);
      g.beginPath();
      g.moveTo(0, 720);
      g.lineTo(SPREAD_W, 720);
      g.stroke();
      for (let r = 0; r < 7; r++) waves(g, -(r * 23) % 80, SPREAD_W, 790 + r * 64, 90, 9, 3.5);
      // the lighthouse on the left page, on its rock
      g.beginPath();
      g.moveTo(60, 1040);
      g.quadraticCurveTo(120, 900, 250, 920);
      g.quadraticCurveTo(380, 900, 440, 1050);
      g.closePath();
      fillStroke(g, tint(0.34), 5);
      const lx = 250;
      shape(g, [
        [lx - 70, 930],
        [lx - 44, 380],
        [lx + 44, 380],
        [lx + 70, 930],
      ]);
      fillStroke(g, PAPER, 5);
      for (const [y0, y1] of [
        [470, 560],
        [660, 750],
        [850, 930],
      ]) {
        const w0 = 44 + ((y0 - 380) / 550) * 26;
        const w1 = 44 + ((y1 - 380) / 550) * 26;
        shape(g, [
          [lx - w0, y0],
          [lx + w0, y0],
          [lx + w1, y1],
          [lx - w1, y1],
        ]);
        fillStroke(g, tint(0.5), 4);
      }
      // the gallery, the lamp room and the cap
      g.fillStyle = tint(0.3);
      g.fillRect(lx - 66, 362, 132, 18);
      pen(g, 5);
      g.strokeRect(lx - 66, 362, 132, 18);
      g.fillStyle = PAPER;
      g.fillRect(lx - 40, 280, 80, 82);
      g.strokeRect(lx - 40, 280, 80, 82);
      shape(g, [
        [lx - 54, 280],
        [lx, 220],
        [lx + 54, 280],
      ]);
      fillStroke(g, tint(0.5), 5);
      g.fillStyle = tint(0.6);
      g.fillRect(lx - 18, 860, 36, 60);
      // the rowing boat on the waves, its oars out, nobody in it
      pen(g, 5);
      g.beginPath();
      g.moveTo(690, 884);
      g.lineTo(612, 962);
      g.moveTo(800, 884);
      g.lineTo(884, 956);
      g.stroke();
      g.beginPath();
      g.moveTo(650, 870);
      g.lineTo(840, 870);
      g.quadraticCurveTo(820, 930, 760, 935);
      g.lineTo(700, 935);
      g.quadraticCurveTo(660, 925, 650, 870);
      g.closePath();
      fillStroke(g, tint(0.3), 5);
    },
    ar(g) {
      // the lamp alight and its beam out over the sea, and fish under it
      glow(g, 22);
      g.fillStyle = CORAL;
      g.fillRect(212, 284, 76, 74);
      g.globalAlpha = 0.3;
      shape(g, [
        [290, 300],
        [SPREAD_W, 190],
        [SPREAD_W, 420],
        [290, 342],
      ]);
      g.fill();
      g.globalAlpha = 1;
      for (const [x, y, sz, d] of [
        [470, 1010, 34, 1],
        [900, 1100, 28, -1],
        [380, 1190, 24, 1],
        [620, 1160, 30, -1],
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
        [834, 890],
        [866, 878],
        [874, 904],
        [882, 930],
        [906, 920],
      ]);
      mouse(g, 745, 838, 72, { paws: true });
    },
  },
  // 4. home: down a tunnel from the round door, under the hill, to bed
  {
    text: 'And then Mouse went home to bed.',
    textAt: { x: MARGIN + 10, y: 70, w: PAGE - MARGIN * 2 - GUTTER },
    ask: ASK,
    hide: { x: 838, y: 1062, r: 46 },
    print(g) {
      // the night over the hill: the sky, the moon, the stars
      g.fillStyle = tint(0.16);
      g.fillRect(0, 0, SPREAD_W, 760);
      g.fillStyle = PAPER;
      circle(g, 860, 170, 70);
      g.fill();
      g.fillStyle = tint(0.16);
      circle(g, 890, 150, 62);
      g.fill();
      g.fillStyle = PAPER;
      for (const [x, y, sz] of STARS) star(g, x, y, sz, PAPER);
      // the ground under the hill, its line, grass along it
      const groundLine = () => {
        g.beginPath();
        g.moveTo(0, 730);
        g.bezierCurveTo(260, 640, 640, 780, SPREAD_W, 700);
      };
      groundLine();
      g.lineTo(SPREAD_W, SPREAD_H);
      g.lineTo(0, SPREAD_H);
      g.closePath();
      g.fillStyle = PAPER;
      g.fill();
      g.fillStyle = tint(0.3);
      g.fill();
      groundLine();
      pen(g, 5);
      g.stroke();
      pen(g, 3.5);
      for (const [x, y] of [
        [60, 712],
        [420, 690],
        [620, 726],
        [940, 704],
      ]) {
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
        [110, 960, 30, 18],
        [460, 1180, 24, 15],
        [300, 1220, 34, 20],
        [990, 860, 26, 16],
        [200, 1100, 18, 12],
      ]) {
        ellipse(g, x, y, rx, ry);
        fillStroke(g, tint(0.4), 4);
      }
      // the round door in the hill, and the tunnel from it down to the room
      g.beginPath();
      g.moveTo(150, 700);
      g.lineTo(150, 660);
      g.arc(190, 660, 40, Math.PI, 0);
      g.lineTo(230, 700);
      g.closePath();
      fillStroke(g, tint(0.55), 5);
      g.lineCap = 'round';
      g.strokeStyle = PAPER;
      g.lineWidth = 74;
      g.beginPath();
      g.moveTo(190, 740);
      g.bezierCurveTo(200, 900, 420, 960, 560, 1040);
      g.stroke();
      g.strokeStyle = tint(0.08);
      g.stroke();
      prints(g, [
        [196, 760],
        [230, 880],
        [330, 960],
        [450, 1000],
        [540, 1040],
      ]);
      // the room: a round-topped hollow, cut away
      g.beginPath();
      g.moveTo(540, 1170);
      g.lineTo(540, 960);
      g.bezierCurveTo(540, 800, 970, 800, 970, 960);
      g.lineTo(970, 1170);
      g.closePath();
      fillStroke(g, PAPER, 5);
      pen(g, 5);
      g.beginPath();
      g.moveTo(540, 1125);
      g.lineTo(970, 1125);
      g.stroke();
      // a lamp hanging from the roof
      pen(g, 4);
      g.beginPath();
      g.moveTo(700, 850);
      g.lineTo(700, 900);
      g.stroke();
      shape(g, [
        [676, 930],
        [724, 930],
        [712, 900],
        [688, 900],
      ]);
      fillStroke(g, tint(0.25), 4);
      // a shelf of books on the wall, and a framed cheese
      g.fillStyle = INK;
      g.fillRect(570, 1010, 120, 8);
      for (let i = 0; i < 6; i++) {
        g.fillStyle = tint(0.3 + (i % 3) * 0.15);
        g.fillRect(576 + i * 19, 1010 - 38 - (i % 2) * 8, 14, 38 + (i % 2) * 8);
      }
      pen(g, 4);
      g.strokeRect(586, 900, 70, 56);
      shape(g, [
        [598, 944],
        [644, 944],
        [644, 922],
      ]);
      fillStroke(g, tint(0.25), 3);
      // the bed: a headboard, a pillow, and the blanket over something small
      g.fillStyle = tint(0.35);
      g.fillRect(790, 1040, 14, 85);
      pen(g, 4);
      g.strokeRect(790, 1040, 14, 85);
      g.fillStyle = PAPER;
      g.fillRect(804, 1090, 150, 18);
      g.strokeRect(804, 1090, 150, 18);
      ellipse(g, 838, 1080, 30, 15);
      fillStroke(g, PAPER, 4);
      g.beginPath();
      g.moveTo(864, 1092);
      g.bezierCurveTo(872, 1050, 940, 1050, 948, 1092);
      g.closePath();
      fillStroke(g, tint(0.25), 4);
      g.fillStyle = tint(0.25);
      g.fillRect(864, 1092, 84, 16);
      // a rug
      ellipse(g, 660, 1132, 70, 9);
      fillStroke(g, tint(0.3), 3.5);
    },
    ar(g) {
      // the stars twinkling, the lamp's light, the door aglow
      glow(g, 18);
      for (const [x, y, sz] of STARS) star(g, x, y, sz * 1.4, CORAL);
      g.fillStyle = CORAL;
      g.globalAlpha = 0.3;
      shape(g, [
        [678, 930],
        [722, 930],
        [790, 1120],
        [610, 1120],
      ]);
      g.fill();
      g.globalAlpha = 0.85;
      g.beginPath();
      g.moveTo(158, 700);
      g.lineTo(158, 662);
      g.arc(190, 662, 32, Math.PI, 0);
      g.lineTo(222, 700);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
      // and the z's over the bed
      g.font = `600 36px ${FONT}`;
      g.fillText('z', 872, 1012);
      g.font = `600 26px ${FONT}`;
      g.fillText('z', 900, 982);
      noGlow(g);
      // Mouse, asleep on the pillow, the tail out from under the blanket
      tail(g, [
        [950, 1100],
        [966, 1084],
        [972, 1108],
        [978, 1132],
        [960, 1140],
      ]);
      mouse(g, 836, 1064, 58, { asleep: true, tilt: -0.25 });
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
    // the fold's shade down the middle
    const fold = g.createLinearGradient(PAGE - GUTTER, 0, PAGE + GUTTER, 0);
    fold.addColorStop(0, 'rgba(26, 41, 58, 0)');
    fold.addColorStop(0.5, 'rgba(26, 41, 58, 0.1)');
    fold.addColorStop(1, 'rgba(26, 41, 58, 0)');
    g.fillStyle = fold;
    g.fillRect(PAGE - GUTTER, 0, GUTTER * 2, SPREAD_H);
  } else {
    sp.ar(g);
  }
  g.restore();
}

/** Where Mouse hides on spread `i`, in the page texture's terms: u across the
 *  spread (0 at the left page's outer edge, 1 at the right's), v up it (0 at
 *  the bottom), and the radius in v. */
export function hideUv(i: number): { u: number; v: number; r: number } {
  const h = SPREADS[i].hide;
  return { u: h.x / SPREAD_W, v: 1 - h.y / SPREAD_H, r: h.r / SPREAD_H };
}

/** Mouse's face on its own, for the moment Mouse is found and lifts off the
 *  page. */
export function mouseIcon(size = 256): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) mouse(g, size / 2, size * 0.52, size * 0.58, { paws: true });
  return c;
}
