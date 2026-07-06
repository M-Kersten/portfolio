import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../lib/useReducedMotion';

export type MotifLayer = 'city' | 'room' | 'chip';

// A small generative "window" into each scale, drawn from the site's signature
// dots: a city seen from above (a grid with a render-sweep and pulsing blocks),
// a room of floating things, and a chip with current running through it. One
// tiny 2D-canvas loop per panel, paused off-screen and frozen for reduced motion.

type Ctx = CanvasRenderingContext2D;

function dot(ctx: Ctx, x: number, y: number, r: number, a: number) {
  ctx.globalAlpha = a < 0 ? 0 : a > 1 ? 1 : a;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// City — a top-down grid; some cells are "buildings" that breathe, and a
// render-sweep runs across lighting the dots it passes.
function drawCity(ctx: Ctx, w: number, h: number, t: number, base: number) {
  const g = 15;
  const scan = ((t * 55) % (w + 140)) - 70;
  for (let y = g; y < h; y += g) {
    for (let x = g; x < w; x += g) {
      const bx = Math.floor(x / (g * 3));
      const by = Math.floor(y / (g * 3));
      const building = (bx * 7 + by * 13) % 5 === 0;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.8 + bx * 1.3 + by);
      let a = base * 0.3;
      if (building) a = base * (0.5 + 0.4 * pulse);
      const d = Math.abs(x - scan);
      if (d < 42) a += (1 - d / 42) * base * 0.75;
      dot(ctx, x, y, a > 0.85 ? 1.7 : 1.2, a);
    }
  }
}

// Room — a few soft clusters of dots that bob and rotate, like objects you can
// pick up.
function drawRoom(ctx: Ctx, w: number, h: number, t: number, base: number) {
  const clusters: [number, number, number][] = [
    [0.2, 0.5, 5],
    [0.42, 0.4, 5],
    [0.62, 0.58, 4],
    [0.82, 0.46, 6],
  ];
  clusters.forEach((c, ci) => {
    const bob = Math.sin(t * 1.15 + ci * 1.9) * 9;
    const cx = c[0] * w;
    const cy = c[1] * h + bob;
    const n = c[2];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + t * 0.45 * (ci % 2 ? 1 : -1);
      const rr = 9 + i * 3.2;
      const x = cx + Math.cos(ang) * rr;
      const y = cy + Math.sin(ang) * rr * 0.72;
      const tw = 0.5 + 0.5 * Math.sin(t * 2.8 + i * 1.3 + ci);
      dot(ctx, x, y, 1.4, base * (0.35 + 0.5 * tw));
    }
    dot(ctx, cx, cy, 1.9, base * 0.85);
  });
}

// Chip — a dim die grid with bright current pulses running along lanes and a
// core that beats.
function drawChip(ctx: Ctx, w: number, h: number, t: number, base: number) {
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
