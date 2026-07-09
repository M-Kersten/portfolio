import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../lib/useReducedMotion';

export type MotifLayer = 'city' | 'room' | 'chip';

// A small generative "window" into each scale, drawn from the site's signature
// dots: a city street map with live traffic, a room-scale interface being
// worked by a cursor, and a chip with current running through it. One tiny
// 2D-canvas loop per panel, paused off-screen and frozen for reduced motion.

type Ctx = CanvasRenderingContext2D;

// Every mark in the site's dot language is a little square, not a circle.
function dot(ctx: Ctx, x: number, y: number, r: number, a: number) {
  ctx.globalAlpha = a < 0 ? 0 : a > 1 ? 1 : a;
  const s = r * 1.7; // side sized to read like the old circle of radius r
  ctx.fillRect(x - s / 2, y - s / 2, s, s);
}

// City — a dotted street map: an irregular grid of streets with sparse blocks
// between them, a diagonal avenue cutting through, traffic blips travelling
// the routes and intersections pulsing like map markers.
const CITY_V = [0.1, 0.3, 0.52, 0.74, 0.92]; // vertical streets (x fractions)
const CITY_H = [0.16, 0.4, 0.64, 0.86]; // horizontal streets (y fractions)
// the avenue runs corner to corner: y at a given x fraction
const avenueY = (p: number, h: number) => h * 0.88 + p * (h * 0.12 - h * 0.88);
export function drawCity(ctx: Ctx, w: number, h: number, t: number, base: number) {
  // blocks — sparse, dim dots filling the space between the streets
  for (let x = 7; x < w; x += 13) {
    for (let y = 7; y < h; y += 13) {
      if (CITY_V.some((f) => Math.abs(x - f * w) < 7) || CITY_H.some((f) => Math.abs(y - f * h) < 7)) continue;
      if (Math.abs(y - avenueY(x / w, h)) < 9) continue;
      dot(ctx, x, y, 1, base * 0.16);
    }
  }
  // streets — brighter dotted lines
  for (const f of CITY_V) for (let y = 4; y < h; y += 6.5) dot(ctx, f * w, y, 1.1, base * 0.4);
  for (const f of CITY_H) for (let x = 4; x < w; x += 6.5) dot(ctx, x, f * h, 1.1, base * 0.4);
  // the diagonal avenue
  const steps = Math.max(12, Math.floor(Math.hypot(w, h * 0.76) / 6.5));
  for (let i = 0; i <= steps; i++) {
    const p = i / steps;
    dot(ctx, p * w, avenueY(p, h), 1.1, base * 0.4);
  }
  // traffic — bright blips travelling the routes, each easing smoothly between
  // faster and slower. The apparent speed is sp·(1 + 0.5·wobble) with wobble a
  // sum of two slow, incommensurate sines (per-blip phase → looks random, not
  // synchronised); position is the exact integral of that speed, so it never
  // stutters or reverses — just surges and eases.
  for (let i = 0; i < 6; i++) {
    const sp = 0.11 + (i % 3) * 0.026; // base speed — a touch quicker than before
    const a = 0.33 + (i % 3) * 0.07; // slow wobble
    const b = 0.58 + (i % 4) * 0.05; // a second, faster wobble
    const phase = sp * (t - 0.5 * ((0.6 / a) * Math.cos(a * t + i * 1.7) + (0.4 / b) * Math.cos(b * t + i * 2.3))) + i * 0.37;
    const p = ((phase % 1) + 1) % 1;
    let x: number;
    let y: number;
    if (i % 3 === 0) {
      x = CITY_V[(i * 2) % CITY_V.length] * w;
      y = p * h;
    } else if (i % 3 === 1) {
      x = p * w;
      y = CITY_H[i % CITY_H.length] * h;
    } else {
      x = p * w;
      y = avenueY(p, h);
    }
    dot(ctx, x, y, 1.7, base);
  }
  // some intersections pulse like map markers
  CITY_V.forEach((fx, i) =>
    CITY_H.forEach((fy, j) => {
      if ((i + j) % 2) return; // only alternate corners — keeps the map calm
      const p = 0.5 + 0.5 * Math.sin(t * 1.7 + i * 1.9 + j * 1.1);
      dot(ctx, fx * w, fy * h, 1.8, base * (0.35 + 0.45 * p));
    }),
  );
}

// Room — a little interface coming together, all in dots: a button, a toggle,
// a slider, a progress bar and a checkbox, with a cursor drifting from control
// to control and working them.
function roundRectDots(ctx: Ctx, cx: number, cy: number, ww: number, hh: number, r: number, step: number, a: number) {
  const hw = ww / 2;
  const hv = hh / 2;
  const edges: [number, number, number, number][] = [
    [-hw + r, -hv, hw - r, -hv],
    [hw, -hv + r, hw, hv - r],
    [hw - r, hv, -hw + r, hv],
    [-hw, hv - r, -hw, -hv + r],
  ];
  for (const [x0, y0, x1, y1] of edges) {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 0; i <= n; i++) dot(ctx, cx + x0 + ((x1 - x0) * i) / n, cy + y0 + ((y1 - y0) * i) / n, 1.15, a);
  }
  const corners: [number, number, number][] = [
    [hw - r, -hv + r, -Math.PI / 2],
    [hw - r, hv - r, 0],
    [-hw + r, hv - r, Math.PI / 2],
    [-hw + r, -hv + r, Math.PI],
  ];
  for (const [ax, ay, a0] of corners)
    for (let i = 1; i < 3; i++) {
      const ang = a0 + (Math.PI / 2) * (i / 3);
      dot(ctx, cx + ax + Math.cos(ang) * r, cy + ay + Math.sin(ang) * r, 1.15, a);
    }
}

export function drawRoom(ctx: Ctx, w: number, h: number, t: number, base: number) {
  const sc = Math.max(0.55, Math.min(1, h / 300));
  // the cursor visits button → toggle → checkbox on a loop
  const cycle = 2.4;
  const stops = 3;
  const target = Math.floor(t / cycle) % stops;
  const pp = (t / cycle) % 1;
  const clicking = pp > 0.45 && pp < 0.75;

  // — button (pressed while the cursor clicks it)
  const bx = 0.3 * w;
  const by = 0.28 * h;
  const bwd = 96 * sc;
  const press = target === 0 && clicking ? 1 : 0;
  roundRectDots(ctx, bx, by + press * 2, bwd, 34 * sc, 9 * sc, 6, base * (0.3 + press * 0.45));
  for (let x = -bwd * 0.28; x <= bwd * 0.28; x += 5.5) dot(ctx, bx + x, by + press * 2, 1.1, base * (0.48 + press * 0.4));

  // — toggle (flips as the cursor works it)
  const tx = 0.71 * w;
  const ty = 0.26 * h;
  const tw = 52 * sc;
  const th = 22 * sc;
  const tOn = Math.floor((t + cycle) / (cycle * stops)) % 2 === 0;
  roundRectDots(ctx, tx, ty, tw, th, th / 2, 5, base * 0.3);
  dot(ctx, tx + (tOn ? 1 : -1) * (tw / 2 - th / 2), ty, 3 * sc + 1, base * 0.85);

  // — slider, sweeping by itself
  const sx = 0.47 * w;
  const sy = 0.55 * h;
  const sw2 = 140 * sc;
  for (let x = -sw2 / 2; x <= sw2 / 2; x += 6) dot(ctx, sx + x, sy, 1, base * 0.24);
  const kx = -sw2 / 2 + (0.5 + 0.5 * Math.sin(t * 0.7)) * sw2;
  for (let x = -sw2 / 2; x <= kx; x += 6) dot(ctx, sx + x, sy, 1.15, base * 0.5);
  dot(ctx, sx + kx, sy, 3.4 * sc, base * 0.9);

  // — progress bar, filling then starting over
  const px = 0.26 * w;
  const py = 0.72 * h;
  const pw2 = 120 * sc;
  roundRectDots(ctx, px, py, pw2, 14 * sc, 7 * sc, 5.5, base * 0.26);
  const pv = (t * 0.18) % 1;
  for (let x = 0; x <= pv * (pw2 - 12 * sc); x += 5) dot(ctx, px - pw2 / 2 + 6 * sc + x, py, 1.3, base * 0.7);

  // — checkbox (ticked and unticked as the cursor returns)
  const cx2 = 0.77 * w;
  const cy2 = 0.66 * h;
  roundRectDots(ctx, cx2, cy2, 22 * sc, 22 * sc, 4 * sc, 4.5, base * 0.32);
  if (Math.floor((t + cycle * 2) / (cycle * stops)) % 2 === 0) {
    const tick: [number, number][] = [
      [-5, 0],
      [-2, 3.5],
      [1, 0.5],
      [4, -3.5],
      [6, -6],
    ];
    for (const [dx, dy] of tick) dot(ctx, cx2 + dx * sc, cy2 + dy * sc, 1.3, base * 0.85);
  }

  // — the cursor: eases to its next control, bobbing slightly, and clicks
  const spots: [number, number][] = [
    [bx + bwd * 0.18, by + 4],
    [tx + tw * 0.1, ty + 3],
    [cx2 + 3, cy2 + 3],
  ];
  const from = spots[(target + stops - 1) % stops];
  const to = spots[target];
  const q = Math.min(1, pp / 0.4);
  const e = q * q * (3 - 2 * q);
  const cxp = from[0] + (to[0] - from[0]) * e;
  const cyp = from[1] + (to[1] - from[1]) * e + Math.sin(t * 3.1) * 2;
  const arrow: [number, number][] = [
    [0, 0],
    [1.8, 2.6],
    [3.6, 5.2],
    [5.4, 7.8],
    [4.6, 8.6],
    [7.4, 8.2],
    [2.2, 9.4],
  ];
  for (const [ax, ay] of arrow) dot(ctx, cxp + ax * sc * 1.15, cyp + ay * sc * 1.15, 1.25, base * 0.9);
  // click ripple blooming off the control
  if (clicking) {
    const k = (pp - 0.45) / 0.3;
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      dot(ctx, to[0] + Math.cos(ang) * (4 + k * 14 * sc), to[1] + Math.sin(ang) * (4 + k * 14 * sc), 1, base * 0.7 * (1 - k));
    }
  }
}

// Chip — a dim die grid with bright current pulses running along lanes and a
// core that beats.
export function drawChip(ctx: Ctx, w: number, h: number, t: number, base: number) {
  const g = 14;
  const cols = Math.floor(w / g);
  const rows = Math.max(1, Math.floor(h / g));
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) dot(ctx, c * g, r * g, 1.1, base * 0.26);
  for (let l = 0; l < 3; l++) {
    const row = 1 + ((l * 3 + 2) % rows);
    const head = (t * 85 + l * 60) % (w + 80);
    for (let c = 1; c <= cols; c++) {
      const x = c * g;
      const d = Math.abs(x - head);
      if (d < 46) dot(ctx, x, row * g, 1.55, base * (0.35 + (1 - d / 46) * 0.95));
    }
  }
  const p = 0.5 + 0.5 * Math.sin(t * 2.4);
  dot(ctx, w / 2, h / 2, 2.1 + p, base * (0.55 + 0.4 * p));
}

export function ScaleMotif({ layer, color, active }: { layer: MotifLayer; color: string; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    const resize = () => {
      const rect = cv.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      if (!w || !h) return;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);

    const render = (time: number) => {
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      const speed = activeRef.current ? 1.8 : 1;
      const base = activeRef.current ? 0.95 : 0.6;
      const tt = time * speed;
      if (layer === 'city') drawCity(ctx, w, h, tt, base);
      else if (layer === 'room') drawRoom(ctx, w, h, tt, base);
      else drawChip(ctx, w, h, tt, base);
      ctx.globalAlpha = 1;
    };

    let raf = 0;
    let running = false;
    const t0 = performance.now();
    const frame = (t: number) => {
      raf = 0;
      render((t - t0) / 1000);
      if (running) raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (!running && !reduced) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    };
    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const io = new IntersectionObserver((es) => (es[0].isIntersecting ? start() : stop()), { threshold: 0.05 });
    io.observe(cv);

    if (reduced) render(0.6); // a single, still frame

    return () => {
      io.disconnect();
      ro.disconnect();
      stop();
    };
  }, [layer, color, reduced]);

  return <canvas ref={ref} className="cap__canvas" aria-hidden="true" />;
}
