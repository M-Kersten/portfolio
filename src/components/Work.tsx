import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cases, caseBySlug, site, LAYER_LABEL, LAYER_ORDER, type CaseStudy } from '../content';
import { asset } from '../lib/asset';
import { useReducedMotion } from '../lib/useReducedMotion';
import { CaseCard } from './CaseCard';

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

const CARD_W = 240;

interface Slot {
  left: number;
  topPct: number;
  rot: number;
}

// Lay the cards out top-left → bottom-right along a jittered diagonal, all kept
// within the viewport band so nothing needs vertical scrolling.
function buildWall(n: number): { width: number; slots: Slot[] } {
  const rnd = mulberry32(9137);
  const slots: Slot[] = [];
  let x = 48;
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const topPct = Math.min(56, Math.max(5, 8 + t * 46 + (rnd() * 2 - 1) * 7));
    slots.push({ left: x, topPct, rot: (rnd() * 2 - 1) * 3.4 });
    x += CARD_W + 56 + rnd() * 130; // advance with a little jitter
  }
  return { width: x + 40, slots };
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
        data-layer={study.layer}
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
          <div className="worktile__badges">
            <span className="worktile__layer">{LAYER_LABEL[study.layer]}</span>
            {study.live && <span className="worktile__live">Live</span>}
          </div>
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
  const ordered = useMemo(() => LAYER_ORDER.flatMap((l) => cases.filter((c) => c.layer === l)), []);
  const wall = useMemo(() => buildWall(ordered.length), [ordered.length]);
  const [open, setOpen] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);

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
      const maxOffset = Math.max(0, wall.width - window.innerWidth);
      plane.style.transform = `translate3d(${-(p * maxOffset)}px, 0, 0)`;
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
          <div className="wall__plane" ref={planeRef} style={{ width: `${wall.width}px` }}>
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
