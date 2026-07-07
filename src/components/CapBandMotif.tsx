import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../lib/useReducedMotion';
import { drawCity, drawRoom, drawChip } from './ScaleMotif';
import type { Layer } from '../content';

const COLOR: Record<Layer, string> = { city: '#27e8f2', room: '#ff9068', chip: '#a9f75c' };

// One canvas for the whole capabilities band: it draws the three motifs into
// three slanted regions (city / room / chip) sheared apart by two diagonal
// seams, brightening whichever the pointer is over. One rAF loop, paused
// off-screen and frozen for reduced motion.
export function CapBandMotif({ active }: { active: Layer | null }) {
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

    const poly = (pts: [number, number][]) => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
    };

    const render = (time: number) => {
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      const sh = Math.min(56, w * 0.05); // how far the seams lean
      const xt1 = w / 3 + sh / 2;
      const xb1 = w / 3 - sh / 2;
      const xt2 = (2 * w) / 3 + sh / 2;
      const xb2 = (2 * w) / 3 - sh / 2;
      const A = activeRef.current;
      // Kept faint so the band reads as a quiet living texture (like the site's
      // static dot-fields) rather than a bright billboard; hovering a region
      // still lifts it clear of the other two.
      const baseOf = (l: Layer) => (A === l ? 0.62 : A ? 0.22 : 0.4);
      const speedOf = (l: Layer) => (A === l ? 1.8 : 1);

      const region = (pts: [number, number][], tx: number, rw: number, layer: Layer, fn: typeof drawCity) => {
        ctx.save();
        poly(pts);
        ctx.clip();
        ctx.translate(tx, 0);
        ctx.fillStyle = COLOR[layer];
        fn(ctx, rw, h, time * speedOf(layer), baseOf(layer));
        ctx.restore();
      };
      region([[0, 0], [xt1, 0], [xb1, h], [0, h]], 0, xt1, 'city', drawCity);
      region([[xt1, 0], [xt2, 0], [xb2, h], [xb1, h]], xb1, xt2 - xb1, 'room', drawRoom);
      region([[xt2, 0], [w, 0], [w, h], [xb2, h]], xb2, w - xb2, 'chip', drawChip);

      // the two diagonal seams — a soft under-glow plus a crisp hairline
      ctx.globalAlpha = 1;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(234, 234, 234, 0.06)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(xt1, 0); ctx.lineTo(xb1, h);
      ctx.moveTo(xt2, 0); ctx.lineTo(xb2, h);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(234, 234, 234, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xt1, 0); ctx.lineTo(xb1, h);
      ctx.moveTo(xt2, 0); ctx.lineTo(xb2, h);
      ctx.stroke();
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
    const io = new IntersectionObserver((es) => (es[0].isIntersecting ? start() : stop()), { threshold: 0.02 });
    io.observe(cv);

    if (reduced) render(0.6);

    return () => {
      io.disconnect();
      ro.disconnect();
      stop();
    };
  }, [reduced]);

  return <canvas ref={ref} className="cap-band__canvas" aria-hidden="true" />;
}
