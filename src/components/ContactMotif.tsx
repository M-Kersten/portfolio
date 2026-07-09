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
    // Setting canvas.width in resize() wipes the bitmap. The animated path
    // repaints every frame so it never notices; the reduced-motion still is
    // drawn just once, so repaint it after any resize (incl. the observer's
    // initial fire) or it vanishes. `render` is defined below but this closure
    // only runs asynchronously, well after it's assigned.
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) render(0);
    });
    ro.observe(cv);

    let pCur = 0; // smoothed letter progress along the route
    let pTarget = 0; // scroll-driven target
    let flagK = 0; // flag raise 0→1
    let glow = 0; // slot glow right after posting
    let delivered = false;
    const trail: { x: number; y: number; a: number }[] = [];

    // Square marks — the site's dot language is squares, not circles.
    const dot = (x: number, y: number, radius: number, a: number) => {
      ctx.globalAlpha = a < 0 ? 0 : a > 1 ? 1 : a;
      const s = radius * 1.7;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    };

    // Scroll → progress: the flight only starts once a good third of the card
    // is already on screen (so it plays in view), and the letter is posted a
    // touch before the card is fully revealed — right at the end of the page.
    const onScroll = () => {
      const rect = cv.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const reveal = (vh - rect.top) / (rect.height + 1);
      pTarget = Math.max(0, Math.min(1, (reveal - 0.38) / (0.96 - 0.38)));
    };

    const render = (dt: number) => {
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);

      // --- letterbox geometry — large, sitting right down on the card's
      // bottom edge (short dotted pole, no ground line needed) ---
      const bw = Math.min(124, Math.max(86, w * 0.12));
      const bh = bw * 0.62;
      const cxB = w - bw / 2 - Math.max(28, w * 0.06);
      const poleH = Math.min(30, h * 0.08);
      const byTop = h - 8 - poleH - bh;
      const cyB = byTop + bh / 2;
      const slotY = byTop + bh * 0.3;
      const slotHalf = bw * 0.3;

      // --- flight route: spawns just past the card's left edge (clipped by
      // the card), sweeps across and drops into the slot ---
      const x0 = -30;
      const y0 = h * 0.26;
      const c1x = w * 0.36;
      const c1y = h * 0.03;
      const c2x = w * 0.95;
      const c2y = h * 0.12;
      const ex = cxB;
      const ey = slotY - 8;

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
      // the slot — a brighter row of dots (cyan while it glows)
      ctx.fillStyle = glow > 0.05 ? CYAN : INK;
      for (let x = cxB - slotHalf; x <= cxB + slotHalf; x += 4.5) dot(x, slotY, 1.35, 0.7 + glow * 0.3);
      if (glow > 0.02) {
        // a dotted ring blooming off the slot as the letter lands
        ctx.fillStyle = CYAN;
        const rr = 7 + (1 - glow) * 20;
        for (let i = 0; i < 14; i++) {
          const ang = (i / 14) * Math.PI * 2;
          dot(cxB + Math.cos(ang) * rr, slotY + Math.sin(ang) * rr * 0.7, 1.1, glow * 0.55);
        }
      }
      // the pole — a short run of dots down to the card's bottom edge
      ctx.fillStyle = INK;
      for (let y = byTop + bh + 4; y <= h - 5; y += 5) dot(cxB, y, 1.05, 0.4);
      // the flag — dots along the stem, a dot cluster at the tip; pops up
      // once the letter is posted
      const fx = cxB + bw / 2 + 2;
      const fy = byTop + bh * 0.35;
      const ang = -Math.PI / 2 + (1 - flagK) * (Math.PI * 0.6);
      const stem = bh * 0.6;
      ctx.fillStyle = flagK > 0.5 ? CYAN : INK;
      for (let i = 0; i <= 4; i++) dot(fx + Math.cos(ang) * stem * (i / 4), fy + Math.sin(ang) * stem * (i / 4), 1.15, 0.4 + flagK * 0.6);
      const tipX = fx + Math.cos(ang) * stem;
      const tipY = fy + Math.sin(ang) * stem;
      for (const [ox, oy] of [
        [2.5, -2.5],
        [6, -2.5],
        [2.5, 2],
        [6, 2],
      ] as [number, number][]) {
        dot(tipX + Math.cos(ang + Math.PI / 2) * oy + Math.cos(ang) * ox, tipY + Math.sin(ang + Math.PI / 2) * oy + Math.sin(ang) * ox, 1.3, 0.4 + flagK * 0.6);
      }

      // --- the fading cyan trail, rendered behind the letter ---
      ctx.fillStyle = CYAN;
      for (let i = trail.length - 1; i >= 0; i--) {
        const d = trail[i];
        d.a -= dt * 0.9;
        if (d.a <= 0) trail.splice(i, 1);
        else dot(d.x, d.y, 1.5, d.a);
      }
      ctx.fillStyle = INK;

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
        ctx.lineWidth = 1.3;
        ctx.strokeRect(-13, -9, 26, 18);
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(-13, -9);
        ctx.lineTo(0, 2);
        ctx.lineTo(13, -9);
        ctx.stroke();
        ctx.restore();
      }
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
