import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../lib/media';

/* The contact section's backdrop: exhibit 11's plinth, and ripples through the
   page's own dots.

   The launch pad's label says exhibit 11 is "your project, still in the
   workshop", and its "Let's build it" lands here. So here is where it will
   stand: a plinth with nothing on it yet, the space over it held by scanner
   corners. It builds itself out of dots as it scrolls into view, and the
   corners close in and lock.

   Ripples run through the section's dot field, lighting the very dots the page
   is printed with (GRID): one from the plinth as it locks, one from the email,
   a button or a line in the visitors' book when it's pointed at or focused,
   small ones from the book as a line is written in it. A ripple that reaches
   the plinth makes its corners answer.

   And a line from the visitors' book is what's put on the plinth (`line`: the
   one being written, or one that's pointed at): a small cloud of points
   gathers between the corners and keeps changing shape with the words (the
   materials are still to be decided). Signing flashes the cloud and sends a
   last ripple out.

   Everything here is drawn behind the content and takes no pointer. Reduced
   motion gets the finished plinth, no ripples, and a cloud that doesn't turn. */

const INK = '#cfd6da';
const CYAN = '#27e8f2';
const GRID = 30; // the dot field (tokens.css --dots-ink): a 2px square in the middle of every 30px tile
const RIPPLE = { speed: 560, band: 30, life: 1.9, most: 8 };
const CLOUD = { points: 150, fill: 0.8 }; // the cloud on the plinth: how many points, and how much of the held space it takes

interface Ripple {
  x: number;
  y: number;
  born: number;
  color: string;
  power: number;
  own: boolean; // set off by the plinth itself: it doesn't answer its own
}

// FNV-1a: the words, as a number to shape the cloud with
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function ContactMotif({ line, sent }: { line: string; sent: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const words = useRef(line);
  words.current = line;
  const posted = useRef(sent);
  posted.current = sent;
  const still = useRef<(() => void) | null>(null);

  // under reduced motion nothing runs by itself: redraw when the line changes
  useEffect(() => still.current?.(), [line, sent]);

  useEffect(() => {
    const cv = ref.current;
    const host = cv?.closest<HTMLElement>('section');
    const ctx = cv?.getContext('2d');
    if (!cv || !host || !ctx) return;
    const stage = host.querySelector<HTMLElement>('.contact__stage');
    const label = host.querySelector<HTMLElement>('.contact__label');
    const input = host.querySelector<HTMLInputElement>('.contact__book-line');
    if (!stage) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    const resize = () => {
      const r = host.getBoundingClientRect();
      w = r.width;
      h = r.height;
      if (!w || !h) return;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    /** An element's box, in the canvas's own coordinates. */
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      const o = host.getBoundingClientRect();
      return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
    };

    // Square marks: the site's dot language is squares, not circles.
    const dot = (x: number, y: number, s: number, a: number, c = INK) => {
      if (a <= 0.004) return;
      ctx.globalAlpha = a > 1 ? 1 : a;
      ctx.fillStyle = c;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    };
    const stroke = (x0: number, y0: number, x1: number, y1: number, a: number, lw = 1.5) => {
      ctx.globalAlpha = a > 1 ? 1 : a;
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    };

    // ---- ripples -----------------------------------------------------------
    const ripples: Ripple[] = [];
    const ripple = (x: number, y: number, color: string, power: number, own = false) => {
      if (reduced) return;
      ripples.push({ x, y, born: performance.now(), color, power, own });
      if (ripples.length > RIPPLE.most) ripples.shift();
    };
    const from = (el: Element, color: string, power: number) => {
      const b = box(el);
      ripple(b.x + b.w / 2, b.y + b.h / 2, color, power);
    };
    // the email, a line in the book and the buttons: pointed at with a mouse, or
    // reached with the keyboard. Listened for on the section, since the book's
    // lines arrive later.
    const KINDS: [string, string, number][] = [
      ['.contact__email', CYAN, 1],
      ['.contact__entry', CYAN, 0.5],
      ['.btn', INK, 0.6],
    ];
    const kind = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      for (const [sel, color, power] of KINDS) {
        const el = target.closest(sel);
        if (el && host.contains(el)) return { el, color, power };
      }
      return null;
    };
    let over: Element | null = null;
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const k = kind(e.target);
      if (k && k.el !== over) from(k.el, k.color, k.power);
      over = k?.el ?? null;
    };
    const onFocusIn = (e: FocusEvent) => {
      const k = kind(e.target);
      if (k && k.el.matches(':focus-visible')) from(k.el, k.color, k.power);
    };
    host.addEventListener('pointerover', onOver);
    host.addEventListener('focusin', onFocusIn);
    // writing in the book: a small one from where the pen is
    let wrote = 0;
    const onWrite = () => {
      if (!input) return;
      const now = performance.now();
      if (now - wrote < 140) return;
      wrote = now;
      const b = box(input);
      ctx.font = getComputedStyle(input).font;
      ripple(b.x + Math.min(b.w, ctx.measureText(input.value).width), b.y + b.h * 0.6, CYAN, 0.45);
    };
    input?.addEventListener('input', onWrite);

    // ---- the cloud on the plinth -------------------------------------------
    // points spread evenly over a ball, pushed in and out by the words
    const dirs: [number, number, number][] = [];
    for (let i = 0; i < CLOUD.points; i++) {
      const y = 1 - (2 * (i + 0.5)) / CLOUD.points;
      const r = Math.sqrt(1 - y * y);
      const a = i * Math.PI * (3 - Math.sqrt(5));
      dirs.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    const at = dirs.map((d) => [d[0], d[1], d[2]] as [number, number, number]);
    const seen = new Float32Array(CLOUD.points);
    let shaped = '';
    let goal = at.map((p) => [...p] as [number, number, number]);
    const shape = (text: string) => {
      const k = hash(text);
      const pick = (shift: number, n: number) => (k >>> shift) % n;
      const e = [2, 2.6, 4, 8][pick(0, 4)]; // 2 is a ball; higher squares it off
      const k1 = 2 + pick(3, 3);
      const k2 = 1 + pick(6, 3);
      const amp = 0.1 + pick(9, 5) * 0.07;
      const tall = 0.72 + pick(12, 6) * 0.11;
      const p1 = pick(15, 16) * 0.39;
      goal = dirs.map(([x, y, z]) => {
        const r = 1 / Math.pow(Math.abs(x) ** e + Math.abs(y) ** e + Math.abs(z) ** e, 1 / e);
        const bump = 1 + amp * Math.sin(k1 * Math.atan2(z, x) + p1) * Math.sin(k2 * Math.acos(y) + p1);
        return [x * r * bump, y * r * bump * tall, z * r * bump];
      });
      // whatever shape it is, it fits the space held for it
      const far = Math.max(...goal.map((g) => Math.hypot(g[0], g[1], g[2])));
      for (const g of goal) {
        g[0] /= far;
        g[1] /= far;
        g[2] /= far;
      }
    };

    // ---- the story's state --------------------------------------------------
    let build = 0; // the plinth, drawn in by the scroll
    let goalBuild = 0;
    let locked = false;
    let ping = 0; // the corners answering a ripple
    let flash = 0; // the cloud, as its line is sent
    let cloud = 0; // 0 nothing on the plinth, 1 the cloud
    let wasSent = posted.current;
    let t = 0;

    const onScroll = () => {
      const r = stage.getBoundingClientRect();
      goalBuild = Math.max(0, Math.min(1, ((window.innerHeight || 1) - r.top) / (r.height + 40)));
    };

    const render = (dt: number) => {
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      const now = performance.now();
      t += dt;

      // the plinth's place: the right of the stage, standing on its bottom edge
      const s = box(stage);
      const pw = Math.min(132, s.w * 0.56);
      const ph = pw * 0.5;
      const dx = pw * 0.27; // the top face, going back
      const dy = pw * 0.21;
      const x1 = s.x + s.w - 6 - dx; // the front face's right edge
      const x0 = x1 - pw;
      const base = s.y + s.h - 6;
      const top = base - ph;
      const half = pw * 0.46; // the held space over it
      const cx = (x0 + x1) / 2 + dx / 2;
      const cy = top - dy - 12 - half;

      build += (goalBuild - build) * Math.min(1, dt * 5);
      if (reduced) build = 1;
      const e = 1 - (1 - build) ** 3;
      if (build > 0.97 && !locked) {
        locked = true;
        ripple(cx, cy, CYAN, 0.9, true);
        ping = 1;
      } else if (build < 0.5) locked = false;

      // ---- ripples, on the page's own dots ----
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        const age = (now - rp.born) / 1000;
        if (age > RIPPLE.life) {
          ripples.splice(i, 1);
          continue;
        }
        const left = 1 - age / RIPPLE.life;
        const strength = rp.power * Math.min(1, age / 0.08) * left * Math.sqrt(left);
        const R = age * RIPPLE.speed;
        if (!rp.own && Math.abs(Math.hypot(cx - rp.x, cy - rp.y) - R) < RIPPLE.band) ping = Math.max(ping, strength);
        // only the tiles the ring can reach
        const reach = R + RIPPLE.band * 2.2;
        const i0 = Math.max(0, Math.floor((rp.x - reach) / GRID));
        const i1 = Math.min(Math.ceil(w / GRID), Math.ceil((rp.x + reach) / GRID));
        const j0 = Math.max(0, Math.floor((rp.y - reach) / GRID));
        const j1 = Math.min(Math.ceil(h / GRID), Math.ceil((rp.y + reach) / GRID));
        for (let gi = i0; gi < i1; gi++) {
          for (let gj = j0; gj < j1; gj++) {
            const gx = gi * GRID + GRID / 2;
            const gy = gj * GRID + GRID / 2;
            const d = (Math.hypot(gx - rp.x, gy - rp.y) - R) / RIPPLE.band;
            if (d > 2.2 || d < -2.2) continue;
            const k = Math.exp(-d * d) * strength;
            dot(gx, gy, 2 + k * 2.4, k * 0.85, rp.color);
          }
        }
      }

      // ---- the plinth: a denser patch of the same dots, built from the floor up ----
      const rows = Math.round(ph / 6);
      for (let j = 0; j <= rows; j++) {
        const y = base - (ph * j) / rows;
        const up = Math.max(0, Math.min(1, e * (rows + 3) - j)); // each row arrives after the one under it
        if (up <= 0) continue;
        const edge = j === 0 || j === rows;
        for (let x = x0; x <= x1 + 0.5; x += pw / Math.round(pw / 6)) {
          const side = x - x0 < 1 || x1 - x < 1;
          dot(x, y, 1.9, (edge || side ? 0.55 : 0.14) * up);
        }
        // the side face, going back
        for (let i = 1; i <= 4; i++) dot(x1 + (dx * i) / 4, y - (dy * i) / 4, 1.8, (edge || i === 4 ? 0.38 : 0.1) * up);
      }
      const lid = Math.max(0, Math.min(1, e * 4 - 3)); // the top goes on last
      if (lid > 0) {
        for (let i = 1; i <= 4; i++) {
          const y = top - (dy * i) / 4;
          const off = (dx * i) / 4;
          for (let x = x0; x <= x1 + 0.5; x += pw / Math.round(pw / 6)) dot(x + off, y, 1.8, (i === 4 || x - x0 < 1 ? 0.45 : 0.2) * lid);
        }
      }

      // ---- the space over it, held by four corners that close in and lock ----
      ping = Math.max(0, ping - dt * 1.6);
      flash = Math.max(0, flash - dt * 1.4);
      const out = (1 - lid) * 14 + ping * 3;
      const bl = half * 0.34;
      const ba = (0.25 + 0.6 * lid + ping * 0.4) * Math.min(1, e * 2);
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        const bx = cx + sx * (half + out);
        const by = cy + sy * (half + out);
        stroke(bx, by, bx - sx * bl, by, ba);
        stroke(bx, by, bx, by - sy * bl, ba);
      }

      // ---- what stands on it: the words, as a cloud of points ----
      const text = words.current.trim();
      if (text !== shaped) {
        shaped = text;
        if (text) shape(text.toLowerCase());
      }
      if (posted.current !== wasSent) {
        wasSent = posted.current;
        flash = 1;
        ripple(cx, cy, CYAN, 1, true);
        ping = 1;
      }
      const count = text ? Math.min(CLOUD.points, 14 + text.length * 4) : 0;
      cloud += ((text ? 1 : 0) - cloud) * (reduced ? 1 : Math.min(1, dt * 6));
      const yaw = reduced ? 0.6 : t * 0.5;
      const cyw = Math.cos(yaw);
      const syw = Math.sin(yaw);
      const tilt = 0.38;
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);
      const ease = reduced ? 1 : Math.min(1, dt * 4);
      const R = half * CLOUD.fill * lid;
      for (let i = 0; i < CLOUD.points; i++) {
        const p = at[i];
        const g = goal[i];
        p[0] += (g[0] - p[0]) * ease;
        p[1] += (g[1] - p[1]) * ease;
        p[2] += (g[2] - p[2]) * ease;
        seen[i] += ((i < count ? 1 : 0) - seen[i]) * (reduced ? 1 : Math.min(1, dt * 8));
        if (seen[i] < 0.02) continue;
        const x = p[0] * cyw + p[2] * syw;
        const z = -p[0] * syw + p[2] * cyw;
        const y = p[1] * ct - z * st;
        const near = (z * ct + p[1] * st + 1.3) / 2.6; // 0 at the back, 1 at the front
        dot(cx + x * R, cy - y * R, 1.5 + near * 1.3 + flash * 1.2, (0.3 + 0.7 * near) * seen[i], flash > 0.5 ? '#ffffff' : CYAN);
      }
      // nothing on it yet: the crosshair the maquette marks a place with, and a dotted ring
      const empty = (1 - cloud) * lid;
      if (empty > 0.02) {
        ctx.globalAlpha = 0.9 * empty;
        ctx.strokeStyle = CYAN;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 3.4, 0, Math.PI * 2);
        ctx.stroke();
        for (const [ux, uy] of [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ]) {
          ctx.beginPath();
          ctx.moveTo(cx + ux * 4.5, cy + uy * 4.5);
          ctx.lineTo(cx + ux * 9, cy + uy * 9);
          ctx.stroke();
        }
        const rr = half * 0.52 + ping * 5;
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2 + (reduced ? 0 : t * 0.12);
          dot(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.6, (0.22 + ping * 0.5) * empty, CYAN);
        }
      }

      // ---- its label's leader: from the label up to the held space ----
      if (label && lid > 0 && label.offsetParent) {
        const l = box(label);
        ctx.globalAlpha = 0.5 * lid;
        ctx.strokeStyle = CYAN;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(l.x + l.w + 6, l.y + 5);
        ctx.lineTo(cx - half - 6, cy + half - 8);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
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
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    resize();
    // Setting canvas.width wipes the bitmap. The animated path repaints every
    // frame; the reduced-motion still is drawn once, so repaint it after a resize.
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) render(0);
    });
    ro.observe(host);
    const io = new IntersectionObserver((es) => (es[0].isIntersecting ? start() : stop()), { threshold: 0.02 });

    if (reduced) {
      still.current = () => render(0);
      render(0);
    } else {
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      onScroll();
      io.observe(host);
    }

    return () => {
      still.current = null;
      io.disconnect();
      ro.disconnect();
      stop();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      input?.removeEventListener('input', onWrite);
      host.removeEventListener('pointerover', onOver);
      host.removeEventListener('focusin', onFocusIn);
    };
  }, [reduced]);

  return (
    <div className="contact__motif" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
}
