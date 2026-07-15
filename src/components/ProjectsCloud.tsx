import { useEffect, useRef, type CSSProperties } from 'react';
import { LAYER_LABEL, type CaseStudy } from '../content';
import { asset } from '../lib/asset';
import { useReducedMotion } from '../lib/useReducedMotion';
import { Scramble } from './Scramble';

// The "signal constellation": every project as a drifting thumbnail node over the
// square-dot field, with faint threads between projects that share a layer — an
// extension of the hero's "connecting dots". Clicking a node opens the same case
// card the timeline uses (via onOpen). Motion is hand-rolled and skipped under
// reduced-motion. Highlights read bigger/brighter than archive projects.

const LAYER_COLOR: Record<string, string> = { city: 'var(--cyan)', room: 'var(--coral)', chip: 'var(--lime)' };

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
  el: HTMLButtonElement | null;
}
interface Ln {
  a: number;
  b: number;
  el: SVGLineElement;
}

export function ProjectsCloud({ items, onOpen }: { items: CaseStudy[]; onOpen: (slug: string) => void }) {
  const reduced = useReducedMotion();
  const fieldRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const field = fieldRef.current;
    const svg = svgRef.current;
    if (!field || !svg) return;
    const svgNS = 'http://www.w3.org/2000/svg';
    const rnd = mulberry(1301);
    let pts: Pt[] = [];
    let lines: Ln[] = [];
    let raf = 0;

    const apply = (now: number) => {
      const t = now / 1000;
      for (const p of pts) {
        if (reduced) {
          p.x = p.bx;
          p.y = p.by;
        } else {
          p.x = p.bx + Math.sin(t * p.sp + p.ph) * p.am;
          p.y = p.by + Math.cos(t * p.sp * 0.8 + p.ph) * p.am * 0.7;
        }
        if (p.el) p.el.style.transform = `translate(-50%,-50%) translate(${p.x}px,${p.y}px)`;
      }
      for (const l of lines) {
        l.el.setAttribute('x1', String(pts[l.a].x));
        l.el.setAttribute('y1', String(pts[l.a].y));
        l.el.setAttribute('x2', String(pts[l.b].x));
        l.el.setAttribute('y2', String(pts[l.b].y));
      }
    };

    const layout = () => {
      const W = field.clientWidth;
      const H = field.clientHeight;
      if (!W || !H) return;
      const n = items.length;
      const cols = Math.max(2, Math.min(6, Math.round(W / 240)));
      const rows = Math.ceil(n / cols);
      pts = items.map((_, i) => {
        const cx = ((i % cols) + 0.5) / cols;
        const cy = (Math.floor(i / cols) + 0.6) / rows;
        const x = (0.06 + (cx * 0.88 + (rnd() - 0.5) * (0.72 / cols))) * W;
        const y = (0.08 + (cy * 0.84 + (rnd() - 0.5) * (0.55 / rows))) * H;
        return { bx: x, by: y, x, y, ph: rnd() * 6.28, sp: 0.16 + rnd() * 0.28, am: 5 + rnd() * 8, el: nodeRefs.current[i] };
      });
      // faint threads: each node to its nearest same-layer neighbour(s)
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      lines = [];
      pts.forEach((a, i) => {
        const near = pts
          .map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }))
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
    };
  }, [items, reduced]);

  return (
    <div className="pc-field" ref={fieldRef}>
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
  );
}
