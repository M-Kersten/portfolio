import { useEffect, useRef, useState } from 'react';
import { site } from '../content';
import type { Company } from '../content';
import { asset } from '../lib/asset';
import { useReducedMotion } from '../lib/useReducedMotion';

const PORTRAITS = 5;

// A portrait that scrubs through five photos as it rises up the screen, landing
// on the last one the moment it reaches the vertical middle of the viewport.
function AboutPortrait() {
  const reduced = useReducedMotion();
  const boxRef = useRef<HTMLElement>(null);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    if (reduced) {
      setFrame(PORTRAITS - 1); // no scrubbing — just show the final shot
      return;
    }
    // Polled on a rAF loop rather than scroll events (which fire unreliably for
    // isolated jumps) — one cheap rect read per frame; setFrame bails if stable.
    // Cycling starts once the portrait's centre has risen past START (a bit up
    // from the bottom edge) and finishes at the middle, so the flip-through is
    // quick and obvious rather than a slow drift.
    const START = 0.82;
    const END = 0.5;
    let raf = 0;
    const loop = () => {
      const r = box.getBoundingClientRect();
      const cy = r.top + r.height / 2;
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (START * vh - cy) / ((START - END) * vh)));
      setFrame(Math.min(PORTRAITS - 1, Math.floor(p * PORTRAITS)));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <figure className="about__portrait" ref={boxRef} role="img" aria-label={`Portrait of ${site.hero.name}`}>
      <div className="about__portrait-ph" aria-hidden="true" />
      {Array.from({ length: PORTRAITS }, (_, i) => (
        <div
          key={i}
          className="about__portrait-frame"
          aria-hidden="true"
          style={{ backgroundImage: `url(${asset(`/profile/${i + 1}.png`)})`, opacity: i === frame ? 1 : 0 }}
        />
      ))}
      <span className="about__portrait-idx" aria-hidden="true">
        {String(frame + 1).padStart(2, '0')} / {String(PORTRAITS).padStart(2, '0')}
      </span>
    </figure>
  );
}

// A compact popup describing one past role — timeframe, title and a short blurb.
// Mirrors the case-study FocusCard: backdrop + Esc + ✕ close, body-scroll lock.
function CompanyDialog({ company, onClose }: { company: Company; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="cdialog" onClick={onClose}>
      <div
        className="cdialog__card"
        role="dialog"
        aria-modal="true"
        aria-label={`${company.name} — experience`}
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} type="button" className="cdialog__close" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">✕</span>
        </button>
        <p className="cdialog__meta">
          <span className="cdialog__period">{company.period}</span>
          <span className="cdialog__sep" aria-hidden="true">·</span>
          <span className="cdialog__role">{company.role}</span>
        </p>
        <h3 className="cdialog__name">{company.name}</h3>
        <p className="cdialog__blurb">{company.blurb}</p>
        {company.url && (
          <a className="btn btn--ghost cdialog__link" href={company.url} target="_blank" rel="noreferrer">
            Visit <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>
    </div>
  );
}

// A short horizontal row of past employers; clicking a name opens its popup.
function CompanyStrip({ companies }: { companies: Company[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const close = () => {
    setOpen(null);
    triggerRef.current?.focus(); // hand focus back to the name that opened it
  };
  return (
    <div className="about__companies">
      <p className="about__companies-label">Where I’ve worked</p>
      <ul className="about__companies-row">
        {companies.map((c, i) => (
          <li key={c.name}>
            <button
              type="button"
              className="about__company"
              aria-haspopup="dialog"
              onClick={(e) => {
                triggerRef.current = e.currentTarget;
                setOpen(i);
              }}
            >
              {c.name}
            </button>
          </li>
        ))}
      </ul>
      {open != null && <CompanyDialog company={companies[open]} onClose={close} />}
    </div>
  );
}

export function About() {
  const a = site.about;
  return (
    <section id="about" className="section">
      <div className="container">
        <div className="about__grid">
          <div>
            <h2 className="section__title">{a.title}</h2>
            <p className="about__lead">{a.lead}</p>
            {a.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="about__side">
            <AboutPortrait />
            <dl className="about__list">
              {a.facts.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        {a.companies && a.companies.length > 0 && <CompanyStrip companies={a.companies} />}
      </div>
    </section>
  );
}
