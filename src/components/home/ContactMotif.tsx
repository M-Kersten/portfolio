import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../lib/media';

/* The contact section's backdrop: exhibit 11's pedestal, and ripples through the
   page's own dots.

   The launch pad's label says exhibit 11 is "your project, still in the
   workshop", and its "Let's build it" lands here. So here is where it will
   stand: a pedestal with nothing on it yet, the space over it held by scanner
   corners. It builds itself out of dots as it scrolls into view, and the
   corners close in and lock.

   Ripples run through the section's dot field, lighting the very dots the page
   is printed with (GRID): one from the pedestal as it locks, one from the email,
   a button or a line in the visitors' book when it's pointed at or focused,
   small ones from the book as a line is written in it. A ripple that reaches
   the pedestal makes its corners answer.

   Over the pedestal a handful of dots float about, each on its own slow wander.
   Give them a suggestion (`line`: the one being written, or an earlier one
   that's being looked at) and they gather into a shape, and which shape is
   down to the words: the text is hashed into a seed, the seed picks a family
   (a ball squared off, a ring, a spring, a pyramid, a frame, a planet, a
   tower, a star, a knot, a sheet) and its proportions (FORMS). So every
   suggestion has a shape of its own, the same one each time, and a letter
   more or less is another seed and another shape: it changes as it's typed.
   Take the suggestion away and the dots let go and drift again. Sending one
   flashes the shape and sends a last ripple out.

   Everything here is drawn behind the content and takes no pointer. Reduced
   motion gets the finished pedestal, no ripples, dots that stand still and a
   shape that doesn't turn. */

const INK = '#cfd6da';
const CYAN = '#27e8f2';
const GRID = 30; // the dot field (tokens.css --dots-ink): a 2px square in the middle of every 30px tile
const RIPPLE = { speed: 560, band: 30, life: 1.9, most: 8 };
/* The dots over the pedestal: how many, how much of the held space a shape
   takes (`fill`), and how far out they wander when they're not one (`roam`,
   in the same measure: 1 is the edge of a shape). */
const CLOUD = { points: 160, fill: 0.8, roam: 1.25 };

type P3 = [number, number, number];
const TAU = Math.PI * 2;
const frac = (x: number) => x - Math.floor(x);
// two numbers per dot that never line up: a dot's place on a surface (the R2 sequence)
const U = (i: number) => frac(0.5 + i * 0.7548776662466927);
const V = (i: number) => frac(0.5 + i * 0.5698402909980532);
/** A dot's direction on a ball, evenly spread. */
function ball(i: number, n: number): P3 {
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(1 - y * y);
  const a = i * Math.PI * (3 - Math.sqrt(5));
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}
/** A seed's own run of numbers, 0..1 (mulberry32). */
function dice(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A shape leaned over (about the x axis, then the z): the flat ones are shown
 *  off, not edge-on. */
function leaned(place: (i: number) => P3, ax: number, az: number) {
  const ca = Math.cos(ax);
  const sa = Math.sin(ax);
  const cz = Math.cos(az);
  const sz = Math.sin(az);
  return (i: number): P3 => {
    const [x, y, z] = place(i);
    const y1 = y * ca - z * sa;
    const z1 = y * sa + z * ca;
    return [x * cz - y1 * sz, x * sz + y1 * cz, z1];
  };
}

/** The families of shape. Each takes the seed's dice for its proportions and
 *  says where dot `i` of `n` stands; sizes don't matter (the shape is fitted to
 *  the space afterwards). */
const FORMS: ((d: () => number, n: number) => (i: number) => P3)[] = [
  // a ball, squared off towards a block, with a swell running round it
  (d, n) => {
    const e = [2, 2.6, 4, 8][Math.floor(d() * 4)];
    const k1 = 2 + Math.floor(d() * 3);
    const k2 = 1 + Math.floor(d() * 3);
    const amp = 0.08 + d() * 0.3;
    const tall = 0.7 + d() * 0.6;
    const ph = d() * TAU;
    return (i) => {
      const [x, y, z] = ball(i, n);
      const r = (1 / Math.pow(Math.abs(x) ** e + Math.abs(y) ** e + Math.abs(z) ** e, 1 / e)) * (1 + amp * Math.sin(k1 * Math.atan2(z, x) + ph) * Math.sin(k2 * Math.acos(y) + ph));
      return [x * r, y * r * tall, z * r];
    };
  },
  // a ring
  (d) => {
    const r = 0.2 + d() * 0.28;
    const flat = 0.5 + d() * 0.5;
    return leaned(
      (i) => {
        const u = U(i) * TAU;
        const v = V(i) * TAU;
        return [(1 + r * Math.cos(v)) * Math.cos(u), r * Math.sin(v) * flat, (1 + r * Math.cos(v)) * Math.sin(u)];
      },
      0.7 + d() * 0.6,
      d() * 0.5,
    );
  },
  // a spring, of one strand or two
  (d, n) => {
    const turns = 2 + Math.floor(d() * 3);
    const strands = 1 + Math.floor(d() * 2);
    const wide = 0.4 + d() * 0.3;
    const taper = d() * 0.6;
    return (i) => {
      const t = Math.floor(i / strands) / (n / strands);
      const a = t * turns * TAU + (i % strands) * Math.PI;
      const r = wide * (1 - taper * t);
      return [Math.cos(a) * r, (t - 0.5) * 1.9, Math.sin(a) * r];
    };
  },
  // a cone, or a pyramid of three, four or five sides
  (d) => {
    const sides = [0, 3, 4, 5][Math.floor(d() * 4)];
    const tall = 1.2 + d() * 0.8;
    return (i) => {
      const a = U(i) * TAU;
      const up = 1 - Math.sqrt(V(i)); // more of them towards the base
      const face = sides ? Math.cos(Math.PI / sides) / Math.cos((a % (TAU / sides)) - Math.PI / sides) : 1;
      const r = (1 - up) * face;
      return [Math.cos(a) * r, (up - 0.4) * tall, Math.sin(a) * r];
    };
  },
  // a frame: the twelve edges of a box
  (d) => {
    const w = 0.6 + d() * 0.4;
    const h = 0.6 + d() * 0.4;
    const l = 0.6 + d() * 0.4;
    return (i) => {
      const edge = i % 12;
      const t = U(i) * 2 - 1;
      const a = edge & 1 ? 1 : -1;
      const b = edge & 2 ? 1 : -1;
      return edge < 4 ? [t * w, a * h, b * l] : edge < 8 ? [a * w, t * h, b * l] : [a * w, b * h, t * l];
    };
  },
  // a planet with a ring round it
  (d, n) => {
    const body = 0.5 + d() * 0.15;
    const inner = 0.85 + d() * 0.1;
    const share = Math.floor(n * 0.58);
    return leaned(
      (i) => {
        if (i < share) {
          const [x, y, z] = ball(i, share);
          return [x * body, y * body, z * body];
        }
        const a = U(i) * TAU;
        const r = inner + V(i) * 0.3;
        return [Math.cos(a) * r, 0, Math.sin(a) * r];
      },
      0.35 + d() * 0.4,
      0.2 + d() * 0.4,
    );
  },
  // a tower: rings stacked, each with its own width
  (d) => {
    const floors = 4 + Math.floor(d() * 4);
    const widths = Array.from({ length: floors }, () => 0.3 + d() * 0.5);
    const sides = [0, 4, 6][Math.floor(d() * 3)];
    return (i) => {
      const f = i % floors;
      const a = U(i) * TAU;
      const face = sides ? Math.cos(Math.PI / sides) / Math.cos((a % (TAU / sides)) - Math.PI / sides) : 1;
      return [Math.cos(a) * widths[f] * face, (f / (floors - 1) - 0.5) * 1.9, Math.sin(a) * widths[f] * face];
    };
  },
  // a star: spikes out of a small core
  (d, n) => {
    const spikes = 5 + Math.floor(d() * 6);
    const core = 0.2 + d() * 0.12;
    const long = 0.7 + d() * 0.4;
    return (i) => {
      const [x, y, z] = ball(i % spikes, spikes); // the spike's way out
      const t = U(i); // how far along it
      const o = ball(i, n); // a little off its line, less towards the tip
      const out = core + long * t;
      const w = core * (1 - t);
      return [x * out + o[0] * w, y * out + o[1] * w, z * out + o[2] * w];
    };
  },
  // a knot
  (d, n) => {
    const p = 2 + Math.floor(d() * 2);
    const q = p + 1;
    const thick = 0.06 + d() * 0.1;
    return leaned(
      (i) => {
        const t = (i / n) * TAU;
        const r = 1 + 0.45 * Math.cos(q * t);
        const o = ball(i, n);
        return [r * Math.cos(p * t) + o[0] * thick, 0.45 * Math.sin(q * t) + o[1] * thick, r * Math.sin(p * t) + o[2] * thick];
      },
      0.8 + d() * 0.5,
      d() * 0.4,
    );
  },
  // a sheet with a wave in it
  (d) => {
    const k1 = 1 + Math.floor(d() * 3);
    const k2 = 1 + Math.floor(d() * 3);
    const deep = 0.2 + d() * 0.3;
    const ph = d() * TAU;
    return leaned(
      (i) => {
        const x = U(i) * 2 - 1;
        const z = V(i) * 2 - 1;
        return [x, deep * Math.sin(k1 * x * Math.PI + ph) * Math.cos(k2 * z * Math.PI), z];
      },
      0.5 + d() * 0.5,
      d() * 0.4,
    );
  },
];

interface Ripple {
  x: number;
  y: number;
  born: number;
  color: string;
  power: number;
  own: boolean; // set off by the pedestal itself: it doesn't answer its own
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
    // where the pedestal is drawn, and its label. Looked up again if the page
    // swaps them for others (the stage is a button in one of the book's layouts)
    let stage = host.querySelector<HTMLElement>('.contact__stage');
    let label = host.querySelector<HTMLElement>('.contact__label');
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
    const onWrite = (e: Event) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement) || !input.matches('.contact__book-line')) return;
      const now = performance.now();
      if (now - wrote < 140) return;
      wrote = now;
      const b = box(input);
      ctx.font = getComputedStyle(input).font;
      ripple(b.x + Math.min(b.w, ctx.measureText(input.value).width), b.y + b.h * 0.6, CYAN, 0.45);
    };
    host.addEventListener('input', onWrite); // on the section: the line to write on isn't always there yet

    // ---- the dots over the pedestal ------------------------------------------
    // Each has a wander of its own, for when it isn't part of a shape: three
    // slow swings at its own speeds, out to its own distance.
    const N = CLOUD.points;
    const wander = Array.from({ length: N }, (_, i) => ({
      far: (0.35 + 0.65 * Math.cbrt(U(i + 7))) * CLOUD.roam,
      fx: 0.17 + V(i + 3) * 0.26,
      fy: 0.13 + U(i + 11) * 0.22,
      fz: 0.15 + V(i + 19) * 0.24,
      px: U(i) * TAU,
      py: V(i) * TAU,
      pz: U(i + 31) * TAU,
    }));
    const roam = (i: number, time: number): P3 => {
      const m = wander[i];
      const [x, y, z] = ball(i, N);
      // round its own spot on the ball, drawn in and out
      const r = m.far * (0.62 + 0.38 * Math.sin(time * m.fy + m.py));
      return [x * r + 0.3 * Math.sin(time * m.fx + m.px), y * r * 0.85 + 0.26 * Math.sin(time * m.fz + m.pz), z * r + 0.3 * Math.cos(time * m.fx * 0.8 + m.pz)];
    };
    const at: P3[] = Array.from({ length: N }, (_, i) => roam(i, 0));
    let shaped = '';
    let goal: P3[] | null = null; // the shape they're asked for, or none: they wander
    /** The words' own shape: seeded by them, so the same words are the same shape. */
    const shape = (text: string): P3[] => {
      const seed = hash(text);
      const d = dice(seed);
      const place = FORMS[seed % FORMS.length](d, N);
      const pts = Array.from({ length: N }, (_, i) => place(i));
      // whatever it is, it's centred, and fits the space held for it
      const mid = [0, 1, 2].map((k) => (Math.min(...pts.map((q) => q[k])) + Math.max(...pts.map((q) => q[k]))) / 2);
      for (const q of pts) for (let k = 0; k < 3; k++) q[k] -= mid[k];
      const far = Math.max(...pts.map((q) => Math.hypot(q[0], q[1], q[2])), 1e-6);
      for (const q of pts) for (let k = 0; k < 3; k++) q[k] /= far;
      return pts;
    };

    // ---- the story's state --------------------------------------------------
    let build = 0; // the pedestal, drawn in by the scroll
    let goalBuild = 0;
    let locked = false;
    let ping = 0; // the corners answering a ripple
    let flash = 0; // the cloud, as its line is sent
    let cloud = 0; // 0 the dots wander, 1 they're a shape
    let turn = 0; // how far round the shape has turned
    let wasSent = posted.current;
    let t = 0;

    const onScroll = () => {
      if (!stage) return;
      const r = stage.getBoundingClientRect();
      goalBuild = Math.max(0, Math.min(1, ((window.innerHeight || 1) - r.top) / (r.height + 40)));
    };

    const render = (dt: number) => {
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      const now = performance.now();
      t += dt;

      if (!stage?.isConnected) stage = host.querySelector<HTMLElement>('.contact__stage');
      if (!label?.isConnected) label = host.querySelector<HTMLElement>('.contact__label');
      if (!stage) return;
      // the pedestal's place: the right of the stage, standing on its bottom edge
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

      // ---- the pedestal: a denser patch of the same dots, built from the floor up ----
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

      // ---- over it: the dots, wandering, or gathered into the words' shape ----
      const text = words.current.trim().toLowerCase();
      if (text !== shaped) {
        shaped = text;
        goal = text ? shape(text) : null;
      }
      if (posted.current !== wasSent) {
        wasSent = posted.current;
        flash = 1;
        ripple(cx, cy, CYAN, 1, true);
        ping = 1;
      }
      cloud += ((goal ? 1 : 0) - cloud) * (reduced ? 1 : Math.min(1, dt * 5));
      // a shape turns; the wandering dots barely do
      turn += dt * (reduced ? 0 : 0.1 + 0.42 * cloud);
      const yaw = reduced ? 0.6 : turn;
      const cyw = Math.cos(yaw);
      const syw = Math.sin(yaw);
      const tilt = 0.38;
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);
      // into a shape briskly, back out to wandering in their own time
      const ease = reduced ? 1 : Math.min(1, dt * (goal ? 4.5 : 1.6));
      const R = half * CLOUD.fill * lid;
      for (let i = 0; i < N; i++) {
        const p = at[i];
        const g = goal ? goal[i] : roam(i, reduced ? 0 : t);
        p[0] += (g[0] - p[0]) * ease;
        p[1] += (g[1] - p[1]) * ease;
        p[2] += (g[2] - p[2]) * ease;
        const x = p[0] * cyw + p[2] * syw;
        const z = -p[0] * syw + p[2] * cyw;
        const y = p[1] * ct - z * st;
        const near = Math.max(0, Math.min(1, (z * ct + p[1] * st + 1.3) / 2.6)); // 0 at the back, 1 at the front
        // dimmer and smaller adrift, firmer as a shape
        const a = (0.22 + 0.5 * near) * (1 - cloud) + (0.3 + 0.7 * near) * cloud;
        dot(cx + x * R, cy - y * R, 1.3 + near * (1.0 + 0.4 * cloud) + flash * 1.2, a * lid, flash > 0.5 ? '#ffffff' : CYAN);
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
      host.removeEventListener('input', onWrite);
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
