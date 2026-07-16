import { useEffect, useRef, type CSSProperties } from 'react';
import { LAYER_LABEL, type CaseStudy } from '../content';
import { asset } from '../lib/asset';
import { useReducedMotion } from '../lib/useReducedMotion';
import { Scramble } from './Scramble';

// The "signal constellation": every project as a thumbnail node over the
// square-dot field, with faint threads between projects that share a layer — an
// extension of the hero's "connecting dots". The cursor drives two composed
// effects on top of a calm idle drift:
//   • a fisheye "lens" — posters near the pointer swell (dock-style magnify),
//     pop forward and part to make room, brightest right under the cursor;
//   • a parallax "look-around" — the whole field pans + tilts with the pointer,
//     nearer posters (highlights) moving more than far ones (archive), and each
//     poster shifting a little inside its own frame.
// JS only ever writes transforms; the per-node hover glow stays owned by CSS.
// Everything cursor-driven is skipped under reduced-motion, leaving the calm
// static layout. Clicking a node opens the same case card the timeline uses.

const LAYER_COLOR: Record<string, string> = { city: 'var(--cyan)', room: 'var(--coral)', chip: 'var(--lime)' };

// Motion constants — tuned in the mockup; px / deg.
const LENS_SCALE = 0.6; // extra scale at the lens centre
const LENS_POP = 70; // z pop toward the viewer under the lens
const LENS_LIFT = 8; // upward nudge under the lens
const LENS_PART = 26; // neighbours easing aside (0 at the focus and far away)
const PLANE_PAN = 40; // whole-field pan
const PLANE_TILT = 4; // whole-field tilt
const NODE_PAR = 34; // per-node parallax offset (× depth)
const NODE_TILT = 8; // per-node tilt (× depth-independent)
const IMG_PAR = 14; // poster shift inside its frame (× depth)

// small deterministic RNG so the layout is stable across renders
function mulberry(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Pt {
  bx: number;
  by: number;
  x: number;
  y: number;
  ph: number;
  sp: number;
  am: number;
  jx: number;
  jy: number;
  depth: number;
  el: HTMLButtonElement | null;
  img: HTMLImageElement | null;
}
interface Ln {
  a: number;
  b: number;
  el: SVGLineElement;
}

export function ProjectsCloud({ items, onOpen }: { items: CaseStudy[]; onOpen: (slug: string) => void }) {
  const reduced = useReducedMotion();
  const fieldRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const field = fieldRef.current;
    const plane = planeRef.current;
    const svg = svgRef.current;
    if (!field || !plane || !svg) return;
    const svgNS = 'http://www.w3.org/2000/svg';
    const rnd = mulberry(1301);
    // Per-node constants, drawn once so a resize never reshuffles them. Depth
    // sorts highlights near (bigger, moves more) and archive projects far.
    const meta = items.map((it) => ({
      ph: rnd() * 6.28,
      sp: 0.16 + rnd() * 0.28,
      am: 5 + rnd() * 8,
      jx: rnd(),
      jy: rnd(),
      depth: it.archive ? 0.28 + rnd() * 0.3 : 0.55 + rnd() * 0.45,
    }));
    let pts: Pt[] = [];
    let lines: Ln[] = [];
    let raf = 0;
    let W = 0;
    let H = 0;
    let R = 260; // lens radius, from field size
    // eased pointer: p = current, t = target (normalised 0..1), s = strength 0..1
    let px = 0.5;
    let py = 0.5;
    let tx = 0.5;
    let ty = 0.5;
    let s = 0;
    let aim = 0;

    const apply = (now: number) => {
      const t = now / 1000;
      px += (tx - px) * 0.12;
      py += (ty - py) * 0.12;
      s += (aim - s) * 0.07;
      if (aim === 0) {
        // ease the pointer home so the field settles centred when you leave
        tx += (0.5 - tx) * 0.05;
        ty += (0.5 - ty) * 0.05;
      }
      const mx = px * W;
      const my = py * H;
      const ox = px - 0.5;
      const oy = py - 0.5;

      // parallax: pan + tilt the whole plane toward the pointer
      plane.style.transform = reduced
        ? ''
        : `translate3d(${(-ox * PLANE_PAN * s).toFixed(2)}px,${(-oy * PLANE_PAN * 0.62 * s).toFixed(2)}px,0) rotateY(${(ox * PLANE_TILT * s).toFixed(2)}deg) rotateX(${(-oy * PLANE_TILT * 0.8 * s).toFixed(2)}deg)`;

      for (const p of pts) {
        let sx = 0;
        let sy = 0;
        let sc = 1;
        let tz = 0;
        let rx = 0;
        let ry = 0;
        let lit = 0;
        let imx = 0;
        let imy = 0;
        if (!reduced) {
          // calm idle drift, always on
          sx += Math.sin(t * p.sp + p.ph) * p.am;
          sy += Math.cos(t * p.sp * 0.8 + p.ph) * p.am * 0.7;
          // lens: Gaussian falloff from the pointer
          const dx = p.bx - mx;
          const dy = p.by - my;
          const dist = Math.hypot(dx, dy) || 1;
          const f = Math.exp(-((dist / R) ** 2)) * s;
          sc += LENS_SCALE * f;
          tz += LENS_POP * f;
          sy -= LENS_LIFT * f;
          // part neighbours aside — peaks mid-radius, zero at the focus and far
          const part = (dist / R) * f * LENS_PART;
          sx += (dx / dist) * part;
          sy += (dy / dist) * part;
          lit = f;
          // parallax: near nodes move / tilt more; a permanent hair of depth-scale
          sx += -ox * NODE_PAR * p.depth * s;
          sy += -oy * NODE_PAR * 0.72 * p.depth * s;
          sc += (p.depth - 0.7) * 0.1;
          tz += (p.depth - 0.7) * 55;
          ry += ox * NODE_TILT * s;
          rx += -oy * NODE_TILT * 0.8 * s;
          imx = ox * IMG_PAR * p.depth * s;
          imy = oy * IMG_PAR * 0.75 * p.depth * s;
        }
        p.x = p.bx + sx;
        p.y = p.by + sy;
        if (p.el) {
          p.el.style.transform = `translate(-50%,-50%) translate3d(${p.x.toFixed(2)}px,${p.y.toFixed(2)}px,${tz.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
          p.el.style.zIndex = String(2 + Math.round(lit * 30));
        }
        // poster parallaxes inside its frame (1.06 gives it room to shift)
        if (p.img) p.img.style.transform = reduced ? '' : `translate(${imx.toFixed(2)}px,${imy.toFixed(2)}px) scale(1.06)`;
      }
      for (const l of lines) {
        l.el.setAttribute('x1', pts[l.a].x.toFixed(1));
        l.el.setAttribute('y1', pts[l.a].y.toFixed(1));
        l.el.setAttribute('x2', pts[l.b].x.toFixed(1));
        l.el.setAttribute('y2', pts[l.b].y.toFixed(1));
      }
    };

    const layout = () => {
      W = field.clientWidth;
      H = field.clientHeight;
      if (!W || !H) return;
      R = Math.max(200, Math.min(340, Math.min(W, H) * 0.5));
      const n = items.length;
      const cols = Math.max(2, Math.min(6, Math.round(W / 240)));
      const rows = Math.ceil(n / cols);
      pts = items.map((_, i) => {
        const m = meta[i];
        const cx = ((i % cols) + 0.5) / cols;
        const cy = (Math.floor(i / cols) + 0.6) / rows;
        const x = (0.06 + (cx * 0.88 + (m.jx - 0.5) * (0.72 / cols))) * W;
        const y = (0.08 + (cy * 0.84 + (m.jy - 0.5) * (0.55 / rows))) * H;
        const el = nodeRefs.current[i];
        return { bx: x, by: y, x, y, ph: m.ph, sp: m.sp, am: m.am, jx: m.jx, jy: m.jy, depth: m.depth, el, img: el ? el.querySelector('img') : null };
      });
      // faint threads: each node to its nearest same-layer neighbour(s)
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      lines = [];
      pts.forEach((a, i) => {
        const near = pts
          .map((b, j) => ({ j, d: (a.bx - b.bx) ** 2 + (a.by - b.by) ** 2 }))
          .filter((o) => o.j !== i && items[o.j].layer === items[i].layer)
          .sort((u, v) => u.d - v.d)
          .slice(0, items[i].archive ? 1 : 2);
        near.forEach((o) => {
          if (o.j < i) return; // dedupe undirected pairs
          const ln = document.createElementNS(svgNS, 'line');
          ln.setAttribute('stroke', LAYER_COLOR[items[i].layer]);
          svg.appendChild(ln);
          lines.push({ a: i, b: o.j, el: ln });
        });
      });
      apply(performance.now());
    };

    // hover/focus lights a node's own threads
    const cleaners: (() => void)[] = [];
    nodeRefs.current.forEach((el, i) => {
      if (!el) return;
      const on = () => lines.forEach((l) => (l.a === i || l.b === i) && l.el.classList.add('lit'));
      const off = () => lines.forEach((l) => (l.a === i || l.b === i) && l.el.classList.remove('lit'));
      el.addEventListener('mouseenter', on);
      el.addEventListener('mouseleave', off);
      el.addEventListener('focus', on);
      el.addEventListener('blur', off);
      cleaners.push(() => {
        el.removeEventListener('mouseenter', on);
        el.removeEventListener('mouseleave', off);
        el.removeEventListener('focus', on);
        el.removeEventListener('blur', off);
      });
    });

    // the cursor drives the lens + parallax (skipped entirely under reduced-motion)
    const onMove = (e: PointerEvent) => {
      const r = field.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width;
      ty = (e.clientY - r.top) / r.height;
      aim = 1;
    };
    const onLeave = () => {
      aim = 0;
    };
    if (!reduced) {
      field.addEventListener('pointermove', onMove);
      field.addEventListener('pointerleave', onLeave);
    }

    layout();
    if (!reduced) {
      const frame = (now: number) => {
        apply(now);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }
    const ro = new ResizeObserver(() => layout());
    ro.observe(field);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      cleaners.forEach((c) => c());
      field.removeEventListener('pointermove', onMove);
      field.removeEventListener('pointerleave', onLeave);
    };
  }, [items, reduced]);

  return (
    <div className="pc-field" ref={fieldRef}>
      <div className="pc-plane" ref={planeRef}>
        <svg className="pc-links" ref={svgRef} aria-hidden="true" />
        {items.map((it, i) => (
          <button
            key={it.slug}
            type="button"
            className="pc-node"
            data-layer={it.layer}
            data-big={it.archive ? undefined : ''}
            ref={(el) => {
              nodeRefs.current[i] = el;
            }}
            style={{ '--c': LAYER_COLOR[it.layer] } as CSSProperties}
            onClick={() => onOpen(it.slug)}
            aria-label={`${it.title} — ${LAYER_LABEL[it.layer]}`}
          >
            <span className="pc-thumb">
              <img
                src={asset(`/posters/${it.slug}.jpg`)}
                alt=""
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.parentElement?.setAttribute('data-empty', '');
                  e.currentTarget.remove();
                }}
              />
            </span>
            <span className="pc-label" aria-hidden="true">
              <Scramble text={it.title} delay={i * 45} wrap />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
