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

// A short horizontal row of past employers; hovering (or focusing / tapping) a
// name swaps the detail panel below to that company's role, dates, location and
// a short blurb. No modal — an inline preview, like a segmented control.
function CompanyStrip({ companies }: { companies: Company[] }) {
  const [active, setActive] = useState(0);
  const c = companies[active];
  return (
    <div className="about__companies">
      <p className="about__companies-label">Where I’ve worked</p>
      <ul className="about__companies-row">
        {companies.map((co, i) => (
          <li key={co.name}>
            <button
              type="button"
              className="about__company"
              data-active={i === active || undefined}
              aria-pressed={i === active}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
            >
              {co.name}
            </button>
          </li>
        ))}
      </ul>
      <div className="about__company-detail" aria-live="polite">
        <div className="cdetail__head">
          <h3 className="cdetail__name">{c.name}</h3>
          <span className="cdetail__period">{c.period}</span>
        </div>
        <p className="cdetail__meta">
          <span className="cdetail__role">{c.role}</span>
          {c.location && (
            <>
              <span className="cdetail__sep" aria-hidden="true">·</span>
              <span className="cdetail__loc">{c.location}</span>
            </>
          )}
        </p>
        <p className="cdetail__blurb">{c.blurb}</p>
      </div>
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
            <p className="section__eyebrow">{a.eyebrow}</p>
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
