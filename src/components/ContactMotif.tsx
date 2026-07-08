import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../lib/useReducedMotion';

// The contact card's backdrop story: a letter waits just outside the card's
// left edge and rides a dotted route toward the letterbox standing at the very
// bottom of the card — driven by YOUR scroll, not a timer. Reaching the end of
// the page posts it: the letter slips into the slot and the cyan flag pops up;
// scrolling back rewinds the story. Drawn in the site's dot language — the
// letterbox itself is a denser patch of the same dot field the card sits on.
// Reduced motion gets the delivered still; the loop pauses off-screen.

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

    let pCur = 0; // smoothed letter progress along the route
    let pTarget = 0; // scroll-driven target
    let flagK = 0; // flag raise 0→1
    let glow = 0; // slot glow right after posting
    let delivered = false;
    const trail: { x: number; y: number; a: number }[] = [];

    const dot = (x: number, y: number, radius: number, a: number) => {
      ctx.globalAlpha = a < 0 ? 0 : a > 1 ? 1 : a;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    // Scroll → progress: 0 as the card's top touches the viewport bottom, 1 a
    // touch before the card is fully revealed, so the letter is posted right
    // as the visitor reaches the end of the page.
    const onScroll = () => {
      const rect = cv.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      pTarget = Math.max(0, Math.min(1, (vh - rect.top) / (rect.height * 0.94 + 1)));
    };

    const render = (dt: number) => {
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);

      // --- letterbox geometry — standing on the card's bottom edge, right side ---
      const bw = Math.min(88, Math.max(60, w * 0.09));
      const bh = bw * 0.62;
      const cxB = w - bw / 2 - Math.max(28, w * 0.06);
      const groundY = h - 14;
      const poleH = Math.min(44, h * 0.12);
      const byTop = groundY - poleH - bh;
      const cyB = byTop + bh / 2;
      const slotY = byTop + bh * 0.3;
      const slotHalf = bw * 0.3;

      // --- flight route: spawns just past the card's left edge (clipped by
      // the card), sweeps across and drops into the slot ---
      const x0 = -26;
      const y0 = h * 0.2;
      const c1x = w * 0.36;
      const c1y = h * 0.02;
      const c2x = w * 0.95;
      const c2y = h * 0.08;
      const ex = cxB;
      const ey = slotY - 5;

      // story state from scroll
      pCur += (pTarget - pCur) * Math.min(1, dt * 5);
      if (reduced) pCur = pTarget; // no easing — direct manipulation only
      const wasDelivered = delivered;
      delivered = pCur > 0.985;
      if (delivered && !wasDelivered) glow = 1;
      flagK += ((delivered ? 1 : 0) - flagK) * Math.min(1, dt * 6);
      glow = Math.max(0, glow - dt * 1.4);

      // --- the dotted route (a faint map line, always there) ---
      ctx.fillStyle = INK;
      for (let i = 0; i <= 44; i++) {
        const p = i / 44;
        dot(bez(p, x0, c1x, c2x, ex), bez(p, y0, c1y, c2y, ey), 1, 0.11);
      }

      // --- the letterbox — a denser patch of the page's own dot field ---
      const r = 7; // corner radius of the box silhouette
      ctx.fillStyle = INK;
      for (let x = cxB - bw / 2 + 2; x <= cxB + bw / 2 - 1; x += 5.5) {
        for (let y = byTop + 2; y <= byTop + bh - 1; y += 5.5) {
          // signed distance to the rounded-rect edge
          const dx = Math.abs(x - cxB) - (bw / 2 - r);
          const dy = Math.abs(y - cyB) - (bh / 2 - r);
          const sd = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
          if (sd > 0) continue;
          if (Math.abs(y - slotY) < 5 && Math.abs(x - cxB) < slotHalf + 4) continue; // clear the slot
          dot(x, y, 1.05, sd > -4 ? 0.5 : 0.16); // bright rim, dim body
        }
      }
      // the slot — the one solid detail on the box (cyan while it glows)
      ctx.globalAlpha = 0.65 + glow * 0.35;
      ctx.strokeStyle = glow > 0.05 ? CYAN : INK;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cxB - slotHalf, slotY);
      ctx.lineTo(cxB + slotHalf, slotY);
      ctx.stroke();
      if (glow > 0.02) {
        ctx.globalAlpha = glow * 0.55;
        ctx.strokeStyle = CYAN;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cxB, slotY, 6 + (1 - glow) * 18, 0, Math.PI * 2);
        ctx.stroke();
      }
      // pole + ground, in the site's dotted-hairline style
      ctx.setLineDash([1.5, 4.5]);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(cxB, byTop + bh);
      ctx.lineTo(cxB, groundY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cxB - bw, groundY);
      ctx.lineTo(cxB + bw, groundY);
      ctx.stroke();
      ctx.setLineDash([]);
      // the flag — pops up once the letter is posted
      const fx = cxB + bw / 2 + 1;
      const fy = byTop + bh * 0.35;
      const ang = -Math.PI / 2 + (1 - flagK) * (Math.PI * 0.6);
      const tipX = fx + Math.cos(ang) * bh * 0.6;
      const tipY = fy + Math.sin(ang) * bh * 0.6;
      ctx.globalAlpha = 0.45 + flagK * 0.55;
      ctx.strokeStyle = flagK > 0.5 ? CYAN : INK;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.globalAlpha = 0.35 + flagK * 0.65;
      ctx.fillStyle = flagK > 0.5 ? CYAN : INK;
      ctx.fillRect(tipX - 3, tipY - 3, 7, 6);

      // --- the letter riding the route ---
      if (pCur < 0.992) {
        const lx = bez(pCur, x0, c1x, c2x, ex);
        const ly = bez(pCur, y0, c1y, c2y, ey);
        const lx2 = bez(Math.min(1, pCur + 0.02), x0, c1x, c2x, ex);
        const ly2 = bez(Math.min(1, pCur + 0.02), y0, c1y, c2y, ey);
        const rot = Math.atan2(ly2 - ly, lx2 - lx);
        if (!reduced) trail.push({ x: lx, y: ly, a: 0.5 });
        const s = pCur > 0.9 ? Math.max(0.2, 1 - (pCur - 0.9) / 0.1) : 1; // slips into the slot
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(rot);
        ctx.scale(s, s);
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(-9, -6, 18, 12);
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(-9, -6);
        ctx.lineTo(0, 1);
        ctx.lineTo(9, -6);
        ctx.stroke();
        ctx.restore();
      }
      // fading cyan trail behind it
      ctx.fillStyle = CYAN;
      for (let i = trail.length - 1; i >= 0; i--) {
        const d = trail[i];
        d.a -= dt * 0.9;
        if (d.a <= 0) trail.splice(i, 1);
        else dot(d.x, d.y, 1.3, d.a);
      }
      ctx.fillStyle = INK;
    };

    let raf = 0;
    let running = false;
    let last = performance.now();
    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      render(dt);
      if (running) raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const io = new IntersectionObserver((es) => (es[0].isIntersecting ? start() : stop()), { threshold: 0.05 });

    if (reduced) {
      // the delivered still: letter posted, flag up — no motion at all
      pCur = 1;
      pTarget = 1;
      flagK = 1;
      delivered = true;
      render(0);
    } else {
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      onScroll();
      io.observe(cv);
    }

    return () => {
      io.disconnect();
      ro.disconnect();
      stop();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [reduced]);

  return (
    <div className="contact__motif" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
}
