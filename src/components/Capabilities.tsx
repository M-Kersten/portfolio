import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { capabilities, site, type Layer } from '../content';
import { useReducedMotion } from '../lib/useReducedMotion';
import { ScaleMotif } from './ScaleMotif';

const COLOR: Record<Layer, string> = { city: '#27e8f2', room: '#ff9068', chip: '#a9f75c' };
// The scale each layer works at — the ladder from world down to machine.
const SCALE: Record<Layer, { name: string; unit: string }> = {
  city: { name: 'World scale', unit: '≈ km' },
  room: { name: 'Human scale', unit: '≈ m' },
  chip: { name: 'Machine scale', unit: '≈ mm' },
};

// The three-scale band mirrors the hero's three layers (§3): rebuilt as an
// interactive "scale ladder" — each panel a live window into its scale, with
// hover-to-focus (siblings dim) and a scroll-reveal.
export function Capabilities() {
  const { capabilitiesIntro } = site;
  const reduced = useReducedMotion();
  const [active, setActive] = useState<Layer | null>(null);
  const [shown, setShown] = useState(false);
  const ladderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced) {
      setShown(true);
      return;
    }
    const el = ladderRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es[0].isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  return (
    <section id="capabilities" className="section capabilities">
      <div className="container">
        <p className="capabilities__eyebrow">{capabilitiesIntro.eyebrow}</p>
        <h2 className="section__title">{capabilitiesIntro.title}</h2>
        <p className="section__lead">{capabilitiesIntro.lead}</p>

        <div className="cap-ladder" ref={ladderRef} data-shown={shown || undefined} data-active={active || undefined}>
          {capabilities.map((c, i) => (
            <article
              key={c.layer}
              className="cap"
              data-layer={c.layer}
              data-on={active === c.layer || undefined}
              style={{ '--i': i } as CSSProperties}
              onMouseEnter={() => setActive(c.layer)}
              onMouseLeave={() => setActive((a) => (a === c.layer ? null : a))}
            >
              <div className="cap__motif">
                <ScaleMotif layer={c.layer} color={COLOR[c.layer]} active={active === c.layer} />
                <span className="cap__scale">
                  <b>{SCALE[c.layer].name}</b>
                  <i>{SCALE[c.layer].unit}</i>
                </span>
                <span className="cap__reticle" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <div className="cap__body">
                <span className="cap__index">{c.index}</span>
                <h3 className="cap__title">{c.title}</h3>
                <p className="cap__text">{c.body}</p>
                <ul className="cap__tags">
                  {c.tags.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
