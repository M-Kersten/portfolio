// The Virtuele Brigade's terminal as the monitor draws it (terminal.ts is the
// story, scenario.tsx puts it on the screen): the four rooms from above,
// drawn once onto the plan, and each frame the view of one of them with the
// two officers and their vision cones, the suspect, the hiding places and
// what you can point at drawn over it.
import { BOX, DOOR_RING, FRAME, FOUND, ROOMS, STORIES, doorPoint, onPlan, originOf, place, type Chase, type Pt, type Rect, type Target, type Thing } from './terminal';
import { bump, easeOut, easeOutBack } from '../../lib/ease';

/** The editor's own colours: the dark of the screen, the rooms' floors and
 *  walls, what's in them, and the suspect's (pale, so it stands apart from the
 *  two in the accent). */
export const INK = {
  bg: '#0d151c',
  floor: '#122330',
  tile: '#163040',
  wall: '#46677b',
  thing: '#1a3242',
  line: '#5a7d91',
  hi: '#244257',
  pale: '#d3e4f6',
  hood: '#7f9ab3',
};
/** The room's accent, in its three strengths. */
export interface Accent {
  accent: string;
  pale: string;
  deep: string;
}
const MONO = '"Space Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
/** Canvas px per plan unit: a room's view is 960 px across, about what the
 *  monitor comes to on a sharp screen in the close-up (mipmapped below that). */
export const SCALE = 0.75;
/** A colour given as #rrggbb, at `a`. */
function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
const pale = (a: number) => rgba(INK.pale, a);
type G = CanvasRenderingContext2D & { letterSpacing?: string };
/** A canvas that stays on the CPU: drawn once (or every frame, small), and
 *  never lost the way a GPU-backed one can be under the scene. */
export function cpuCanvas(w: number, h: number): [HTMLCanvasElement, G] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true }) as G];
}

/* ---------- what's in the rooms ---------- */

function box(g: G, x: number, y: number, w: number, h: number, r = 8, hi = false) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fillStyle = hi ? INK.hi : INK.thing;
  g.fill();
  g.strokeStyle = INK.line;
  g.lineWidth = 2.5;
  g.stroke();
}
function strokes(g: G, w: number, color: string, f: () => void) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.beginPath();
  f();
  g.stroke();
}
/** One thing, drawn in its box. */
function thing(g: G, t: Thing, a: Accent) {
  const { x, y, w, h } = t;
  const n = t.n ?? 1;
  switch (t.kind) {
    case 'booth': // a passport booth: its counter, the chair behind it
      box(g, x, y, w, h, 10);
      strokes(g, 2, INK.line, () => {
        g.moveTo(x + 14, y + h - 30);
        g.lineTo(x + w - 14, y + h - 30);
      });
      strokes(g, 2, INK.line, () => g.arc(x + w / 2, y + 32, 13, 0, Math.PI * 2));
      break;
    case 'queue': // the barriers: n + 1 lines of posts and tape
      for (let r = 0; r <= n; r++) {
        const ly = y + (h * r) / n;
        strokes(g, 3, 'rgba(90, 125, 145, 0.8)', () => {
          g.moveTo(x, ly);
          g.lineTo(x + w, ly);
        });
        g.fillStyle = INK.line;
        for (let k = 0; k <= 4; k++) {
          g.beginPath();
          g.arc(x + (w * k) / 4, ly, 6, 0, Math.PI * 2);
          g.fill();
        }
      }
      break;
    case 'bench':
      box(g, x, y, w, h, 8);
      strokes(g, 1.5, INK.line, () => {
        for (let k = x + 20; k < x + w - 10; k += 20) {
          g.moveTo(k, y + 6);
          g.lineTo(k, y + h - 6);
        }
      });
      break;
    case 'line': // wait behind the line
      g.save();
      g.setLineDash([16, 12]);
      strokes(g, 4, rgba(a.pale, 0.35), () => {
        g.moveTo(x, y);
        g.lineTo(x, y + h);
      });
      g.restore();
      break;
    case 'arrow': // the way on, on the floor
      g.fillStyle = pale(0.14);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + w, y + h / 2);
      g.lineTo(x, y + h);
      g.closePath();
      g.fill();
      break;
    case 'plant': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      g.fillStyle = INK.thing;
      g.beginPath();
      g.arc(cx, cy, w / 2, 0, Math.PI * 2);
      g.fill();
      strokes(g, 2.5, INK.line, () => g.arc(cx, cy, w / 2, 0, Math.PI * 2));
      for (let i = 0; i < 7; i++) {
        const k = i * 0.9;
        strokes(g, 3, 'rgba(120, 160, 180, 0.8)', () => {
          g.moveTo(cx, cy);
          g.quadraticCurveTo(cx + Math.cos(k + 0.4) * 22, cy + Math.sin(k + 0.4) * 22, cx + Math.cos(k) * 40, cy + Math.sin(k) * 40);
        });
      }
      break;
    }
    case 'carousel': {
      // the belt round, the floor in its middle, its slats, the bags on it
      g.beginPath();
      g.roundRect(x, y, w, h, h / 2);
      g.fillStyle = INK.thing;
      g.fill();
      g.strokeStyle = INK.line;
      g.lineWidth = 3;
      g.stroke();
      g.beginPath();
      g.roundRect(x + 26, y + 26, w - 52, h - 52, (h - 52) / 2);
      g.fillStyle = INK.floor;
      g.fill();
      g.stroke();
      strokes(g, 1.5, 'rgba(90, 125, 145, 0.5)', () => {
        for (let k = x + h / 2; k < x + w - h / 2; k += 24) {
          g.moveTo(k, y);
          g.lineTo(k, y + 26);
          g.moveTo(k, y + h - 26);
          g.lineTo(k, y + h);
        }
      });
      for (const [bx, by, bw, bh, r] of [
        [0.23, 0.09, 40, 26, 0.1],
        [0.46, 0.09, 34, 24, -0.2],
        [0.77, 0.91, 40, 26, 0.3],
        [0.52, 0.91, 30, 22, 0],
      ]) {
        g.save();
        g.translate(x + w * bx, y + h * by);
        g.rotate(r);
        box(g, -bw / 2, -bh / 2, bw, bh, 4, true);
        g.restore();
      }
      break;
    }
    case 'trolleys': // nested, in a row
      for (let i = 0; i < n; i++) {
        const tx = x + (i * (w - 50)) / Math.max(1, n - 1);
        strokes(g, 2.5, INK.line, () => g.roundRect(tx, y, 50, h, 4));
        strokes(g, 2.5, INK.line, () => {
          g.moveTo(tx + 6, y + 18);
          g.lineTo(tx + 44, y + 18);
        });
      }
      break;
    case 'pillar':
      box(g, x, y, w, h, 4, true);
      strokes(g, 1.5, 'rgba(90, 125, 145, 0.6)', () => {
        g.moveTo(x, y);
        g.lineTo(x + w, y + h);
        g.moveTo(x + w, y);
        g.lineTo(x, y + h);
      });
      break;
    case 'suitcases': // a heap, left where they came off
      for (const [dx, dy, sw, sh, r] of [
        [0.35, 0.45, 70, 46, 0.1],
        [0.66, 0.73, 60, 40, -0.2],
        [0.27, 0.86, 54, 36, 0.35],
        [0.75, 0.22, 46, 32, -0.4],
      ]) {
        g.save();
        g.translate(x + w * dx, y + h * dy);
        g.rotate(r);
        box(g, -sw / 2, -sh / 2, sw, sh, 5, true);
        strokes(g, 2, INK.line, () => {
          g.moveTo(-sw / 6, -sh / 2);
          g.lineTo(sw / 6, -sh / 2);
        });
        g.restore();
      }
      break;
    case 'lockers':
      for (let i = 0; i < n; i++) {
        const lx = x + i * 46;
        box(g, lx, y, 44, h, 3);
        strokes(g, 2, INK.line, () => {
          g.moveTo(lx + 34, y + 20);
          g.lineTo(lx + 34, y + 36);
        });
      }
      break;
    case 'crates': // a big one and a small one beside it
      for (const [cx, cy, s] of [
        [x, y, 80],
        [x + w - 64, y + h - 64, 64],
      ]) {
        box(g, cx, cy, s, s, 3, true);
        strokes(g, 2, INK.line, () => {
          g.moveTo(cx, cy);
          g.lineTo(cx + s, cy + s);
          g.moveTo(cx + s, cy);
          g.lineTo(cx, cy + s);
        });
      }
      break;
    case 'cart': // a trolley of linen: its tub, the handle at the back
      box(g, x + 20, y, w - 20, h, 6);
      strokes(g, 2.5, INK.line, () => g.arc(x + 20 + (w - 20) * 0.7, y + h / 2, 18, 0, Math.PI * 2));
      strokes(g, 2.5, INK.line, () => {
        g.moveTo(x, y + 10);
        g.lineTo(x + 20, y + 10);
        g.moveTo(x, y + h - 10);
        g.lineTo(x + 20, y + h - 10);
        g.moveTo(x, y + 10);
        g.lineTo(x, y + h - 10);
      });
      break;
    case 'container':
      box(g, x, y, w, h, 6, true);
      strokes(g, 2, INK.line, () => {
        const along = w >= h;
        for (let k = 16; k < (along ? w : h) - 8; k += 16) {
          if (along) {
            g.moveTo(x + k, y + 8);
            g.lineTo(x + k, y + h - 8);
          } else {
            g.moveTo(x + 8, y + k);
            g.lineTo(x + w - 8, y + k);
          }
        }
      });
      break;
    case 'tug': // the baggage tug: its body, the cab at the front, four wheels
      box(g, x, y, w, h, 14);
      box(g, x + w - 40, y + 8, 32, h - 16, 8, true);
      g.fillStyle = INK.line;
      for (const [dx, dy] of [
        [14, -6],
        [w - 30, -6],
        [14, h - 4],
        [w - 30, h - 4],
      ])
        g.fillRect(x + dx, y + dy, 18, 10);
      break;
    case 'bin': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      box(g, x, y, w, h, w / 2);
      strokes(g, 2, INK.line, () => g.arc(cx, cy, w / 2 - 9, 0, Math.PI * 2));
      break;
    }
  }
}

const T = 12; // a wall's thickness
/** A room's floor, its walls with the doors left open in them, the doors'
 *  swings, and its name in the corner (room-local). */
function room(g: G, r: number, a: Accent) {
  const rm = ROOMS[r];
  const [W, H] = [BOX[2], BOX[3]];
  g.fillStyle = INK.floor;
  g.fillRect(0, 0, W, H);
  strokes(g, 1.5, INK.tile, () => {
    for (let x = 60; x < W; x += 60) {
      g.moveTo(x, 0);
      g.lineTo(x, H);
    }
    for (let y = 60; y < H; y += 60) {
      g.moveTo(0, y);
      g.lineTo(W, y);
    }
  });
  for (const t of rm.things) thing(g, t, a);
  g.fillStyle = INK.wall;
  for (const side of ['t', 'b', 'l', 'r'] as const) {
    const long = side === 'l' || side === 'r' ? H : W;
    const gaps = rm.doors
      .filter((d) => d.side === side)
      .map((d) => [d.at - d.w / 2, d.at + d.w / 2])
      .sort((p, q) => p[0] - q[0]);
    let s = 0;
    for (const [lo, hi] of [...gaps, [long, long]]) {
      if (lo > s) {
        if (side === 't') g.fillRect(s - T / 2, -T / 2, lo - s + T, T);
        if (side === 'b') g.fillRect(s - T / 2, H - T / 2, lo - s + T, T);
        if (side === 'l') g.fillRect(-T / 2, s - T / 2, T, lo - s + T);
        if (side === 'r') g.fillRect(W - T / 2, s - T / 2, T, lo - s + T);
      }
      s = hi;
    }
  }
  // the doors, swung open into the room
  for (const d of rm.doors) {
    const k = d.w * 0.9;
    strokes(g, 2, pale(0.18), () => {
      if (d.side === 'r') {
        g.moveTo(W, d.at - d.w / 2);
        g.lineTo(W - k, d.at - d.w / 2);
        g.arc(W, d.at - d.w / 2, k, Math.PI, Math.PI / 2, true);
      } else if (d.side === 'l') {
        g.moveTo(0, d.at + d.w / 2);
        g.lineTo(k, d.at + d.w / 2);
        g.arc(0, d.at + d.w / 2, k, 0, -Math.PI / 2, true);
      } else if (d.side === 't') {
        g.moveTo(d.at - d.w / 2, 0);
        g.lineTo(d.at - d.w / 2, k);
        g.arc(d.at - d.w / 2, 0, k, Math.PI / 2, 0, true);
      } else {
        g.moveTo(d.at + d.w / 2, H);
        g.lineTo(d.at + d.w / 2, H - k);
        g.arc(d.at + d.w / 2, H, k, -Math.PI / 2, Math.PI, true);
      }
    });
  }
  g.font = `700 26px ${MONO}`;
  g.letterSpacing = '2px';
  g.fillStyle = pale(0.6);
  g.textAlign = 'left';
  g.fillText(rm.name, 22, 38);
  g.letterSpacing = '0px';
}

/** The whole terminal, drawn onto the plan once: the four rooms, and the
 *  short passages between their doors, the way round. */
export function drawPlan(c: HTMLCanvasElement, a: Accent) {
  const g = c.getContext('2d', { willReadFrequently: true }) as G;
  g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  g.fillStyle = INK.bg;
  g.fillRect(0, 0, PLAN.w, PLAN.h);
  ROOMS.forEach((rm, r) => {
    // the passage on: the floor across the gap, walled either side
    const nx = (r + 1) % ROOMS.length;
    const d0 = rm.doors[rm.exit];
    const p0 = onPlan(r, doorPoint(d0));
    const p1 = onPlan(nx, doorPoint(ROOMS[nx].doors[ROOMS[nx].entry]));
    const across = d0.side === 'l' || d0.side === 'r';
    const [x0, x1] = [Math.min(p0[0], p1[0]), Math.max(p0[0], p1[0])];
    const [y0, y1] = [Math.min(p0[1], p1[1]), Math.max(p0[1], p1[1])];
    g.fillStyle = INK.floor;
    if (across) g.fillRect(x0, y0 - d0.w / 2, x1 - x0, d0.w);
    else g.fillRect(x0 - d0.w / 2, y0, d0.w, y1 - y0);
    g.fillStyle = INK.wall;
    if (across) for (const s of [-1, 1]) g.fillRect(x0, y0 + (s * d0.w) / 2 - T / 2, x1 - x0, T);
    else for (const s of [-1, 1]) g.fillRect(x0 + (s * d0.w) / 2 - T / 2, y0, T, y1 - y0);
  });
  ROOMS.forEach((_, r) => {
    const o = originOf(r);
    g.save();
    g.translate(o[0], o[1]);
    room(g, r, a);
    g.restore();
  });
}
/** The plan's size, in its units: the four rooms' frames, in their square
 *  (its canvas is SCALE of that). */
export const PLAN = { w: FRAME.w * 2, h: FRAME.h * 2 };

/* ---------- people, from above ---------- */

/** Where someone's looking: a cone of light on the floor. */
function cone(g: G, x: number, y: number, a: number, color: string, k: number, len = 190, half = 0.55) {
  if (k <= 0.01) return;
  const gr = g.createRadialGradient(x, y, 10, x, y, len);
  gr.addColorStop(0, rgba(color, 0.32 * k));
  gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(x, y);
  g.arc(x, y, len, a - half, a + half);
  g.closePath();
  g.fill();
}
/** One of the two: shoulders, a head, and a cap's peak the way they face
 *  (`sway`: their shoulders turning with each step). */
function officer(g: G, x: number, y: number, a: number, sway: number, c: Accent) {
  g.save();
  g.translate(x, y);
  g.rotate(a + sway);
  g.scale(1.5, 1.5);
  g.fillStyle = c.accent;
  g.beginPath();
  g.ellipse(0, 0, 13, 22, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = c.deep;
  g.beginPath();
  g.arc(2, 0, 10, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = c.pale;
  g.beginPath();
  g.ellipse(9, 0, 4, 9, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
/** The suspect, hooded: running (`run`, with a blur of where they were),
 *  crouched (`crouch` 0 → 1) or standing. */
function suspect(g: G, x: number, y: number, a: number, run: boolean, crouch: number, alpha: number) {
  if (alpha <= 0.01) return;
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  g.rotate(a);
  g.scale(1.5 * (1 - 0.18 * crouch), 1.5 * (1 - 0.18 * crouch));
  if (run) {
    g.fillStyle = pale(0.18);
    for (let k = 1; k <= 3; k++) {
      g.beginPath();
      g.ellipse(-k * 20, 0, 12, 18 - k * 2, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.fillStyle = INK.pale;
  g.beginPath();
  g.ellipse(0, 0, 13, 22, 0, 0, Math.PI * 2);
  g.fill();
  if (run) {
    g.beginPath();
    g.ellipse(4, -22, 9, 5, 0.5, 0, Math.PI * 2);
    g.ellipse(-6, 22, 9, 5, 0.5, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = INK.hood;
  g.beginPath();
  g.arc(1, 0, 10, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** A footprint the suspect left: where, which way, which foot, and when. */
export interface Print {
  x: number;
  y: number;
  a: number;
  side: number;
  at: number;
}
export const PRINT_FADE = 5; // s a footprint takes to fade

/* ---------- what you point at ---------- */

/** The ring that fills while the cursor rests on something, round it. */
function dwell(g: G, x: number, y: number, fill: number, r: number, c: Accent) {
  strokes(g, 3, rgba(c.pale, 0.55), () => g.arc(x, y, r, 0, Math.PI * 2));
  if (fill > 0)
    strokes(g, 6, c.accent, () => g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, fill)));
  g.fillStyle = c.accent;
  g.beginPath();
  g.arc(x, y, 4, 0, Math.PI * 2);
  g.fill();
}
/** A ring beating out from something: point here. */
function beat(g: G, x: number, y: number, clock: number, r: number, c: Accent, k: number) {
  const b = (clock * 1.1) % 1;
  strokes(g, 3, rgba(c.pale, k * (0.25 + 0.6 * (1 - b))), () => g.arc(x, y, r * (0.7 + 0.7 * b), 0, Math.PI * 2));
  g.fillStyle = rgba(c.accent, k);
  g.beginPath();
  g.arc(x, y, 4, 0, Math.PI * 2);
  g.fill();
}
/** A hiding place: dashed round it, the dashes walking while it waits to
 *  be searched; lifted while the cursor's on it or it's being searched;
 *  faint, with a mark, once it's been searched and found empty. */
function spot(g: G, r: Rect, state: 'idle' | 'on' | 'empty', clock: number, k: number, c: Accent) {
  if (k <= 0.01) return;
  g.save();
  g.globalAlpha = k;
  if (state !== 'on') g.setLineDash([8, 8]);
  g.lineDashOffset = state === 'idle' ? -clock * 14 : 0;
  strokes(g, state === 'on' ? 3 : 2, state === 'on' ? c.pale : state === 'empty' ? pale(0.22) : pale(0.42), () => g.roundRect(r[0], r[1], r[2], r[3], 12));
  g.setLineDash([]);
  if (state === 'empty') {
    // looked in: nothing there
    const [x, y] = [r[0] + r[2] - 4, r[1] + 4];
    g.fillStyle = INK.floor;
    g.beginPath();
    g.arc(x, y, 12, 0, Math.PI * 2);
    g.fill();
    strokes(g, 3, pale(0.4), () => g.arc(x, y, 12, 0, Math.PI * 2));
    strokes(g, 3, pale(0.4), () => {
      g.moveTo(x - 6, y);
      g.lineTo(x + 6, y);
    });
  }
  g.restore();
}
/** Found: lines bursting out round them, and a "!" over them (`k` 0 → 1). */
function burst(g: G, x: number, y: number, k: number, c: Accent) {
  const o = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
  if (o <= 0) return;
  const e = easeOut(Math.min(1, k * 2.2));
  g.save();
  g.globalAlpha = o;
  g.lineCap = 'round';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    strokes(g, 4, c.accent, () => {
      g.moveTo(x + Math.cos(a) * (30 + 14 * e), y + Math.sin(a) * (30 + 14 * e));
      g.lineTo(x + Math.cos(a) * (38 + 26 * e), y + Math.sin(a) * (38 + 26 * e));
    });
  }
  const s = easeOutBack(Math.min(1, k * 2.5));
  g.translate(x, y - 66);
  g.scale(s, s);
  g.fillStyle = c.accent;
  g.font = `700 54px ${MONO}`;
  g.textAlign = 'center';
  g.fillText('!', 0, 18);
  g.restore();
}
/** Something stirring where the suspect hides (`k` 0 → 1 over the stir):
 *  their hood peeks out and ducks back, with a shiver either side. */
function stir(g: G, x: number, y: number, k: number) {
  const o = bump(k);
  if (o <= 0.01) return;
  const j = Math.sin(k * 40) * 2;
  g.fillStyle = INK.hood;
  g.beginPath();
  g.arc(x + j, y, 13 * o, 0, Math.PI * 2);
  g.fill();
  strokes(g, 2.5, pale(0.8 * o), () => g.arc(x + j, y, 13 * o, 0, Math.PI * 2));
  for (const s of [-1, 1])
    for (const r of [24, 34]) {
      strokes(g, 3, pale(o * (r === 24 ? 0.6 : 0.35)), () => g.arc(x + j, y, r, s < 0 ? Math.PI - 0.45 : -0.45, s < 0 ? Math.PI + 0.45 : 0.45));
    }
}
const TELL = 4.2; // s from one stir to the next
const STIR = 0.6; // s a stir lasts

/** Everything a frame of the view needs beyond the story itself. */
export interface Frame {
  /** the view's top left corner on the plan */
  cam: Pt;
  clock: number;
  /** each of the two: which way they face, and their step */
  face: [number, number];
  sway: [number, number];
  /** the suspect: which way they face, how much of them shows */
  suspectFace: number;
  suspectAlpha: number;
  prints: Print[];
  /** what the cursor's resting on, and how far round its ring is */
  over: Target | null;
  fill: number;
  /** the way round, shown while you point at the far side */
  preview: Pt[] | null;
  /** the hiding places' outlines, faded in */
  spots: number;
}

const _p: Pt = [0, 0];
/** One frame of the view: the plan under the camera, and the story over it. */
export function paint(g: G, plan: HTMLCanvasElement, c: Chase, f: Frame, a: Accent) {
  const [cw, ch] = [g.canvas.width, g.canvas.height];
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.fillStyle = INK.bg;
  g.fillRect(0, 0, cw, ch);
  // the plan under the camera, px for px (whole px, so its lines stay crisp)
  const ix = Math.round(f.cam[0] * SCALE);
  const iy = Math.round(f.cam[1] * SCALE);
  const sx = Math.max(0, ix);
  const sy = Math.max(0, iy);
  const sw = Math.min(plan.width, ix + cw) - sx;
  const sh = Math.min(plan.height, iy + ch) - sy;
  if (sw > 0 && sh > 0) g.drawImage(plan, sx, sy, sw, sh, sx - ix, sy - iy, sw, sh);
  // and the story over it, in the plan's units
  g.setTransform(SCALE, 0, 0, SCALE, -ix, -iy);

  const r = c.room;
  const rm = ROOMS[r];
  // the hiding places, while there's searching to do
  if (rm.spots.length && f.spots > 0.01) {
    rm.spots.forEach((s, i) => {
      const b = onPlan(r, [s.box[0], s.box[1]]);
      const box: Rect = [b[0], b[1], s.box[2], s.box[3]];
      const on = (f.over?.kind === 'spot' && f.over.i === i) || (c.phase === 'look' && c.spot === i);
      const state = on ? 'on' : c.searched[i] ? 'empty' : 'idle';
      spot(g, box, state, f.clock, f.spots * (c.phase === 'look' && !on && state === 'idle' ? 0.6 : 1), a);
    });
    // and how many have been looked in, top right
    const o = originOf(r);
    g.font = `700 24px ${MONO}`;
    g.letterSpacing = '2px';
    g.fillStyle = pale(0.6 * f.spots);
    g.textAlign = 'right';
    g.fillText(`SEARCHED ${c.searched.filter(Boolean).length} OF ${rm.spots.length}`, o[0] + BOX[2] - 22, o[1] + 38);
    g.textAlign = 'left';
    g.letterSpacing = '0px';
  }
  // the suspect's footprints, fading
  for (const p of f.prints) {
    const age = (f.clock - p.at) / PRINT_FADE;
    if (age >= 1) continue;
    g.fillStyle = rgba(a.accent, 0.55 * (1 - age));
    g.beginPath();
    g.ellipse(p.x - Math.sin(p.a) * 8 * p.side, p.y + Math.cos(p.a) * 8 * p.side, 6, 3.5, p.a, 0, Math.PI * 2);
    g.fill();
  }
  // where the two are looking
  const pos = c.team.map((w) => place(w, [0, 0]));
  pos.forEach((p, i) => cone(g, p[0], p[1], f.face[i], a.accent, 1));
  // the suspect
  if (c.suspect.shown || c.phase === 'caught') {
    place(c.suspect, _p);
    const run = c.phase === 'bolt' && c.suspect.s > 0;
    const crouch = c.phase === 'corner' || c.phase === 'round' || c.phase === 'close' ? 1 : c.phase === 'found' ? 1 - easeOutBack(Math.min(1, c.t / 0.35)) : 0;
    suspect(g, _p[0], _p[1], f.suspectFace, run, crouch, f.suspectAlpha);
  }
  // the two
  pos.forEach((p, i) => officer(g, p[0], p[1], f.face[i], f.sway[i], a));
  // something stirring where the suspect is, now and then, while they're searched for
  if ((c.phase === 'search' || (c.phase === 'look' && c.spot !== c.hide)) && !c.searched[c.hide]) {
    const k = (f.clock % TELL) / STIR;
    if (k < 1) {
      const h = onPlan(r, rm.spots[c.hide].hide);
      stir(g, h[0], h[1], k);
    }
  }
  // what to point at, and the ring filling while the cursor rests on it
  if (c.phase === 'door') {
    const p = onPlan(r, doorPoint(rm.doors[rm.exit], DOOR_RING));
    if (f.over) dwell(g, p[0], p[1], f.fill, 44, a);
    else beat(g, p[0], p[1], f.clock, 44, a, 1);
  } else if (c.phase === 'search' && f.over?.kind === 'spot') {
    const b = rm.spots[f.over.i].box;
    const p = onPlan(r, [b[0] + b[2] / 2, b[1] + b[3] / 2]);
    dwell(g, p[0], p[1], f.fill, 30, a);
  } else if (c.phase === 'corner') {
    const p = onPlan(r, STORIES[c.story].corner.far);
    if (f.over && f.preview) {
      // the way round, dashed
      g.save();
      g.setLineDash([10, 9]);
      strokes(g, 3, rgba(a.pale, 0.5), () => {
        g.moveTo(f.preview![0][0], f.preview![0][1]);
        for (const q of f.preview!.slice(1)) g.lineTo(q[0], q[1]);
      });
      g.restore();
    }
    if (f.over) dwell(g, p[0], p[1], f.fill, 36, a);
    else beat(g, p[0], p[1], f.clock, 36, a, 1);
  }
  // found: the burst over them
  if (c.phase === 'found') {
    place(c.suspect, _p);
    burst(g, _p[0], _p[1], c.t / FOUND, a);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}
