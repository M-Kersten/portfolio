import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../lib/useReducedMotion';

// The contact card's little story: an empty mailbox waits on the right, and
// every few seconds a letter launches from the left, rides the dotted flight
// path, and drops into the slot — the flag pops up, then settles back down,
// ready for the next message. Hovering the scene launches a letter right away,
// and the cursor's height bends the flight path. Same 2D-dot language as the
// capability motifs: one small canvas loop, paused off-screen, and a single
// still frame (letter mid-flight, flag up) for reduced motion.

const INK = '#cfd6da';
const CYAN = '#27e8f2';

// cubic bezier point
function bez(p: number, a: number, b: number, c: number, d: number): number {
  const q = 1 - p;
  return q * q * q * a + 3 * q * q * p * b + 3 * q * p * p * c + p * p * p * d;
}

export function ContactMotif() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const hover = useRef(false);
  const aimY = useRef(0.35); // pointer height (0 top … 1 bottom) bends the arc

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

    // --- story state (plain refs, mutated in the loop) ---
    let flight: number | null = null; // progress 0→1, or null between letters
    let nextAt = 1.4; // first letter shortly after the section appears
    let flagK = 0; // flag raise 0→1
    let flagUpAt = -10; // when the last letter landed
    let glow = 0; // slot glow after a landing
    const trail: { x: number; y: number; a: number }[] = [];

    const dot = (c: CanvasRenderingContext2D, x: number, y: number, radius: number, a: number) => {
      c.globalAlpha = a < 0 ? 0 : a > 1 ? 1 : a;
      c.beginPath();
      c.arc(x, y, radius, 0, Math.PI * 2);
      c.fill();
    };

    const render = (t: number, dt: number) => {
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      const groundY = h * 0.84;
      // mailbox geometry (right side)
      const bw = Math.min(110, w * 0.16);
      const bh = bw * 0.52;
      const bx = w * 0.8 - bw / 2; // box left
      const by = groundY - bh - h * 0.22; // box top (floats on its post)
      const slotX = bx + bw * 0.18;
      const slotY = by; // letters enter through the top, near the front

      // flight path: launch pad (left) → the slot
      const x0 = w * 0.06;
      const y0 = h * 0.5;
      const lift = h * (0.05 + (aimY.current - 0.5) * 0.5); // cursor bends the arc
      const cx1 = w * 0.3;
      const cy1 = Math.max(h * 0.04, lift);
      const cx2 = w * 0.6;
      const cy2 = Math.max(h * 0.02, lift * 0.7);

      // --- story timing ---
      if (flight === null && (t >= nextAt || (hover.current && t - flagUpAt > 1.2))) flight = 0;
      if (flight !== null) {
        flight += dt / 2.6;
        if (flight >= 1) {
          flight = null;
          flagUpAt = t;
          glow = 1;
          nextAt = t + 4.8;
        }
      }
      flagK += ((t - flagUpAt < 2.6 ? 1 : 0) - flagK) * Math.min(1, dt * 7);
      glow = Math.max(0, glow - dt * 1.6);

      // --- the dotted flight route (always there, like a map route) ---
      ctx.fillStyle = INK;
      for (let i = 0; i <= 34; i++) {
        const p = i / 34;
        dot(ctx, bez(p, x0, cx1, cx2, slotX), bez(p, y0, cy1, cy2, slotY - 6), 1, 0.13);
      }
      // launch pad ring
      dot(ctx, x0, y0, 2, 0.3);
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x0, y0, 6, 0, Math.PI * 2);
      ctx.stroke();

      // --- ground + post + mailbox, dotted-hairline style ---
      ctx.setLineDash([1.5, 4.5]);
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); // ground line under the mailbox
      ctx.moveTo(bx - bw * 0.5, groundY);
      ctx.lineTo(bx + bw * 1.5, groundY);
      ctx.stroke();
      ctx.beginPath(); // post
      ctx.moveTo(bx + bw / 2, groundY);
      ctx.lineTo(bx + bw / 2, by + bh);
      ctx.stroke();
      ctx.globalAlpha = 0.75;
      ctx.beginPath(); // the box — arched top, side view
      const r = bh * 0.45;
      ctx.moveTo(bx, by + bh);
      ctx.lineTo(bx, by + r);
      ctx.arc(bx + r, by + r, r, Math.PI, Math.PI * 1.5);
      ctx.lineTo(bx + bw - r, by);
      ctx.arc(bx + bw - r, by + r, r, Math.PI * 1.5, 0);
      ctx.lineTo(bx + bw, by + bh);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      // the slot (solid, cyan when glowing)
      ctx.globalAlpha = 0.5 + glow * 0.5;
      ctx.strokeStyle = glow > 0.05 ? CYAN : INK;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(slotX - 7, slotY + 3);
      ctx.lineTo(slotX + 7, slotY + 3);
      ctx.stroke();
      // landing glow — a ring blooming out of the slot
      if (glow > 0.02) {
        ctx.globalAlpha = glow * 0.55;
        ctx.strokeStyle = CYAN;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(slotX, slotY, 5 + (1 - glow) * 16, 0, Math.PI * 2);
        ctx.stroke();
      }
      // the flag — pops up when a letter lands
      const fx = bx + bw - 4;
      const fy = by + bh * 0.35;
      const ang = -Math.PI / 2 + (1 - flagK) * (Math.PI * 0.55); // up ← folded
      ctx.globalAlpha = 0.5 + flagK * 0.5;
      ctx.strokeStyle = flagK > 0.5 ? CYAN : INK;
      ctx.lineWidth = 1.4;
      const tipX = fx + Math.cos(ang) * bh * 0.62;
      const tipY = fy + Math.sin(ang) * bh * 0.62;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.globalAlpha = 0.35 + flagK * 0.65;
      ctx.fillStyle = flagK > 0.5 ? CYAN : INK;
      ctx.fillRect(tipX - 3, tipY - 3, 7, 6);

      // --- the letter in flight ---
      if (flight !== null) {
        const p = flight;
        const lx = bez(p, x0, cx1, cx2, slotX);
        const ly = bez(p, y0, cy1, cy2, slotY - 6);
        const lx2 = bez(Math.min(1, p + 0.02), x0, cx1, cx2, slotX);
        const ly2 = bez(Math.min(1, p + 0.02), y0, cy1, cy2, slotY - 6);
        const rot = Math.atan2(ly2 - ly, lx2 - lx);
        trail.push({ x: lx, y: ly, a: 0.55 });
        // envelope — shrinks as it slips into the slot
        const s = p > 0.88 ? Math.max(0.15, 1 - (p - 0.88) / 0.12) : 1;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(rot);
        ctx.scale(s, s);
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(-9, -6, 18, 12);
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); // the fold
        ctx.moveTo(-9, -6);
        ctx.lineTo(0, 1);
        ctx.lineTo(9, -6);
        ctx.stroke();
        ctx.restore();
      }
      // fading cyan trail behind the letter
      ctx.fillStyle = CYAN;
      for (let i = trail.length - 1; i >= 0; i--) {
        const d = trail[i];
        d.a -= dt * 0.9;
        if (d.a <= 0) trail.splice(i, 1);
        else dot(ctx, d.x, d.y, 1.3, d.a);
      }
      ctx.fillStyle = INK;
    };

    let raf = 0;
    let running = false;
    let last = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = 0;
      const t = (now - t0) / 1000;
      const dt = Math.min(1 / 30, t - last);
      last = t;
      render(t, dt);
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
    const io = new IntersectionObserver((es) => (es[0].isIntersecting ? start() : stop()), { threshold: 0.1 });
    io.observe(cv);

    if (reduced) {
      // one still frame that tells the story: a letter mid-route, flag raised
      flight = 0.55;
      flagK = 1;
      flagUpAt = 0;
      render(0.5, 0);
    }

    const onMove = (e: PointerEvent) => {
      const rect = cv.getBoundingClientRect();
      aimY.current = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    };
    const onEnter = () => (hover.current = true);
    const onLeave = () => (hover.current = false);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerenter', onEnter);
    cv.addEventListener('pointerleave', onLeave);

    return () => {
      io.disconnect();
      ro.disconnect();
      stop();
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerenter', onEnter);
      cv.removeEventListener('pointerleave', onLeave);
    };
  }, [reduced]);

  return (
    <div className="contact__motif" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
}
