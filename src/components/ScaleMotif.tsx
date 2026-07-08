import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../lib/useReducedMotion';

export type MotifLayer = 'city' | 'room' | 'chip';

// A small generative "window" into each scale, drawn from the site's signature
// dots: a city street map with live traffic, a room of floating objects, and a
// chip with current running through it. One tiny 2D-canvas loop per panel,
// paused off-screen and frozen for reduced motion.

type Ctx = CanvasRenderingContext2D;

function dot(ctx: Ctx, x: number, y: number, r: number, a: number) {
  ctx.globalAlpha = a < 0 ? 0 : a > 1 ? 1 : a;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
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
  // traffic — bright blips travelling the routes
  for (let i = 0; i < 6; i++) {
    const p = (t * (0.07 + (i % 3) * 0.023) + i * 0.37) % 1;
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

// Room — floating "objects you can pick up": distinct dotted forms (two
// counter-rotating rings around a beating core) spread across the whole
// region, bobbing out of phase.
const ROOM_OBJ: [number, number, number][] = [
  // x fraction, y fraction, outer radius (px, scaled down on short canvases)
  [0.14, 0.3, 24],
  [0.33, 0.68, 32],
  [0.52, 0.26, 20],
  [0.7, 0.6, 28],
  [0.87, 0.36, 22],
];
export function drawRoom(ctx: Ctx, w: number, h: number, t: number, base: number) {
  const sc = Math.max(0.55, Math.min(1, h / 300));
  ROOM_OBJ.forEach(([fx, fy, r0], ci) => {
    const r = r0 * sc;
    const bob = Math.sin(t * 1.05 + ci * 1.9) * 8 * sc;
    const cx = fx * w;
    const cy = fy * h + bob;
    // outer ring
    const n1 = Math.max(10, Math.round(r * 0.62));
    for (let i = 0; i < n1; i++) {
      const ang = (i / n1) * Math.PI * 2 + t * 0.35 * (ci % 2 ? 1 : -1);
      const tw = 0.5 + 0.5 * Math.sin(t * 2.4 + i * 1.7 + ci);
      dot(ctx, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.72, 1.3, base * (0.3 + 0.4 * tw));
    }
    // inner ring, counter-rotating
    const r2 = r * 0.55;
    const n2 = Math.max(7, Math.round(r2 * 0.62));
    for (let i = 0; i < n2; i++) {
      const ang = (i / n2) * Math.PI * 2 - t * 0.55 * (ci % 2 ? 1 : -1);
      dot(ctx, cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2 * 0.72, 1.2, base * 0.5);
    }
    // core
    const p = 0.5 + 0.5 * Math.sin(t * 1.8 + ci);
    dot(ctx, cx, cy, 1.8 + p * 0.6, base * (0.6 + 0.3 * p));
  });
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
