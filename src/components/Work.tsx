import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cases, caseBySlug, site, type CaseStudy } from '../content';
import { asset } from '../lib/asset';
import { useReducedMotion } from '../lib/useReducedMotion';
import { CaseCard, accentFor } from './CaseCard';

// Seeded RNG so the "randomly placed" wall is stable between renders.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CARD_W = 320;
// The wall plane is taller than the viewport, so scrolling pans it down as well
// as across — you ride diagonally past the pictures rather than straight sideways
// (2× viewport tall ⇒ a full viewport of descent over the scroll).
const PLANE_VH = 2;

interface Slot {
  left: number;
  topPct: number;
  rot: number;
}

interface Wall {
  width: number;
  slots: Slot[];
  string: string; // SVG path (viewBox 0 0 width 1000) — the wire the cards pin to
  links: string; // faint threads between cards that share a technology
}

// Lay the cards out top-left → bottom-right across the whole (tall + wide) plane,
// widely jittered so it reads like a hand-hung wall of paintings. Then thread a
// wire that pins to each card's top edge, plus faint "shared-tech" threads that
// wire together the projects built with the same tools.
function buildWall(items: CaseStudy[]): Wall {
  const n = items.length;
  const rnd = mulberry32(9137);
  const slots: Slot[] = [];
  let x = 56;
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    // Descend across the full plane height (kept clear of the very bottom so the
    // last cards land fully in view at the end of the scroll).
    const topPct = Math.min(74, Math.max(4, 6 + t * 60 + (rnd() * 2 - 1) * 9));
    slots.push({ left: x, topPct, rot: (rnd() * 2 - 1) * 4.6 });
    x += CARD_W + 80 + rnd() * 150; // advance with a little jitter, wider gaps
  }
  const width = x + 48;

  // Pin points sit right on each card's top-centre; y is per-mille of the plane
  // height (topPct * 10) so the SVG can share a width × 1000 viewBox.
  const pin = slots.map((s) => ({ x: s.left + CARD_W / 2, y: s.topPct * 10 }));
  let string = '';
  pin.forEach((p, i) => {
    if (i === 0) {
      string += `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      return;
    }
    const prev = pin[i - 1];
    const midX = (prev.x + p.x) / 2;
    const sag = Math.min(60, Math.max(18, (p.x - prev.x) * 0.05)); // wider gap → deeper sag
    const midY = (prev.y + p.y) / 2 + sag;
    string += ` Q ${midX.toFixed(1)} ${midY.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  });

  // "Everything connects": thread the projects that share a technology. Take the
  // few most-shared tools and run a faint straight line through their cards so
  // the wall reads as a graph, not just a row.
  const byTech = new Map<string, number[]>();
  items.forEach((c, i) => {
    (c.tech ?? []).forEach((tech) => {
      const arr = byTech.get(tech);
      if (arr) arr.push(i);
      else byTech.set(tech, [i]);
    });
  });
  const clusters = [...byTech.values()]
    .filter((idx) => idx.length >= 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
  let links = '';
  clusters.forEach((idx) => {
    idx.forEach((ci, k) => {
      const p = pin[ci];
      links += (k === 0 ? 'M' : ' L') + ` ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    });
  });

  return { width, slots, string, links };
}

// A project lifted off the wall: scaled-up card with the full detail, over a dim
// backdrop. Not the old bottom HUD — a focused card. Esc / ✕ / backdrop closes.
function FocusCard({ study, onClose }: { study: CaseStudy; onClose: () => void }) {
  const [imgOk, setImgOk] = useState(true);
  const src = study.media?.[0] ?? asset(`/posters/${study.slug}.jpg`);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // freeze the wall while focused
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="focus" onClick={onClose}>
      <div
        className="focus__card"
        style={{ '--card-accent': accentFor(study.slug) } as CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-label={study.title}
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} type="button" className="focus__close" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">✕</span>
        </button>
        <div className="focus__media worktile__media">
          <div className="worktile__ph" aria-hidden="true" />
          {imgOk && <img className="worktile__img" src={src} alt="" onError={() => setImgOk(false)} />}
          <div className="worktile__scrim" aria-hidden="true" />
          {study.live && (
            <div className="worktile__badges">
              <span className="worktile__live">Live</span>
            </div>
          )}
        </div>
        <div className="focus__body">
          <span className="worktile__meta">
            {study.client} · {study.sector}
          </span>
          <h3 className="focus__title">{study.title}</h3>
          <p className="focus__outcome">{study.outcome}</p>
          <div className="worktile__cols">
            <section>
              <h4 className="worktile__h">The problem</h4>
              <p>{study.challenge}</p>
            </section>
            <section>
              <h4 className="worktile__h">What I made</h4>
              <p>{study.built}</p>
            </section>
          </div>
          {study.tech && study.tech.length > 0 && (
            <ul className="worktile__tech" aria-label="Technologies">
              {study.tech.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          {study.lesson && (
            <p className="worktile__lesson">
              <span>What I learned</span>
              {study.lesson}
            </p>
          )}
          <a
            className="btn worktile__discuss"
            href={`mailto:${site.contact.email}?subject=${encodeURIComponent(study.title)}`}
          >
            Ask me about it
          </a>
        </div>
      </div>
    </div>
  );
}

// The projects wall: cards scattered top-left → bottom-right; while the section
// is pinned, page scroll pans the wall horizontally — like riding an escalator
// down a wall of pictures. Clicking a card opens the focus view.
export function Work() {
  const { workIntro } = site;
  const reduced = useReducedMotion();
  // Random scatter (stable per build) — no longer grouped by layer.
  const ordered = useMemo(() => {
    const arr = [...cases];
    const rnd = mulberry32(4242);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, []);
  const wall = useMemo(() => buildWall(ordered), [ordered]);
  const [open, setOpen] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const farRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = scrollRef.current;
      const plane = planeRef.current;
      if (!el || !plane) return;
      const scrollable = el.offsetHeight - window.innerHeight;
      const p = scrollable > 0 ? Math.min(1, Math.max(0, -el.getBoundingClientRect().top / scrollable)) : 0;
      const maxX = Math.max(0, wall.width - window.innerWidth);
      const maxY = Math.max(0, plane.offsetHeight - window.innerHeight);
      plane.style.transform = `translate3d(${-(p * maxX)}px, ${-(p * maxY)}px, 0)`;
      // Parallax: the dot field drifts slower, so the cards read as the near
      // layer floating in front of a receding space.
      if (farRef.current) farRef.current.style.transform = `translate3d(${-(p * maxX * 0.72)}px, ${-(p * maxY * 0.72)}px, 0)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced, wall.width]);

  const openStudy = open ? caseBySlug(open) : undefined;

  return (
    <section id="work" className="section wall" data-reduced={reduced || undefined}>
      <div className="container">
        <p className="section__eyebrow">{workIntro.eyebrow}</p>
        {workIntro.title && <h2 className="section__title">{workIntro.title}</h2>}
        <p className="section__lead">{workIntro.lead}</p>
      </div>

      <div
        className="wall__scroll"
        ref={scrollRef}
        style={reduced ? undefined : { height: `calc(100svh + ${wall.width}px - 100vw)` }}
      >
        <div className="wall__pin">
          <div
            className="wall__far"
            ref={farRef}
            aria-hidden="true"
            style={{ width: `${wall.width}px`, height: `${PLANE_VH * 100}svh` }}
          />
          <div
            className="wall__plane"
            ref={planeRef}
            style={{ width: `${wall.width}px`, height: `${PLANE_VH * 100}svh` }}
          >
            <svg
              className="wall__string"
              viewBox={`0 0 ${wall.width} 1000`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path className="wall__link" d={wall.links} vectorEffect="non-scaling-stroke" />
              <path className="wall__wire" d={wall.string} vectorEffect="non-scaling-stroke" />
            </svg>
            {ordered.map((study, i) => (
              <span
                key={`knot-${study.slug}`}
                className="wall__knot"
                aria-hidden="true"
                style={
                  {
                    left: `${wall.slots[i].left + CARD_W / 2}px`,
                    top: `${wall.slots[i].topPct}%`,
                    '--knot': accentFor(study.slug),
                  } as CSSProperties
                }
              />
            ))}
            {ordered.map((study, i) => (
              <CaseCard
                key={study.slug}
                study={study}
                onOpen={() => setOpen(study.slug)}
                style={
                  {
                    left: `${wall.slots[i].left}px`,
                    top: `${wall.slots[i].topPct}%`,
                    '--rot': `${wall.slots[i].rot}deg`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
          <span className="wall__cue" aria-hidden="true">scroll to explore →</span>
        </div>
      </div>

      {openStudy && <FocusCard study={openStudy} onClose={() => setOpen(null)} />}
    </section>
  );
}
