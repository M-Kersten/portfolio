import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { capabilities, site, type Capability, type Layer } from '../content';
import { useReducedMotion } from '../lib/useReducedMotion';
import { ScaleMotif } from './ScaleMotif';
import { CapBandMotif } from './CapBandMotif';

const COLOR: Record<Layer, string> = { city: '#27e8f2', room: '#ff9068', chip: '#a9f75c' };
// The scale each layer works at — the ladder from world down to machine.
const SCALE: Record<Layer, { name: string; unit: string }> = {
  city: { name: 'World scale', unit: '≈ km' },
  room: { name: 'Human scale', unit: '≈ m' },
  chip: { name: 'Machine scale', unit: '≈ mm' },
};

// The written content, shared by the desktop band columns and the mobile cards.
function CapText({ c }: { c: Capability }) {
  return (
    <>
      <span className="capc__scale">
        <b>{SCALE[c.layer].name}</b>
        <i>{SCALE[c.layer].unit}</i>
      </span>
      <span className="capc__index">{c.index}</span>
      <h3 className="capc__title">{c.title}</h3>
      <p className="capc__text">{c.body}</p>
      <ul className="capc__tags">
        {c.tags.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>
  );
}

// The three scales as one full-width band, sheared into slanted regions by
// diagonal seams (§3 — mirrors the hero's three layers). One canvas paints all
// three live motifs behind the copy; hovering a region focuses it and dims the
// rest. Narrow screens fall back to three stacked cards.
export function Capabilities() {
  const { capabilitiesIntro } = site;
  const reduced = useReducedMotion();
  const [active, setActive] = useState<Layer | null>(null);
  const [shown, setShown] = useState(false);
  const secRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced) {
      setShown(true);
      return;
    }
    const el = secRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es[0].isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  const enter = (l: Layer) => setActive(l);
  const leave = (l: Layer) => setActive((a) => (a === l ? null : a));

  return (
    <section id="capabilities" className="section capabilities">
      <div className="container" ref={secRef}>
        <p className="capabilities__eyebrow">{capabilitiesIntro.eyebrow}</p>
        <h2 className="section__title">{capabilitiesIntro.title}</h2>
        <p className="section__lead">{capabilitiesIntro.lead}</p>

        {/* Desktop — one slanted band. */}
        <div className="cap-band" data-shown={shown || undefined} data-active={active || undefined}>
          <CapBandMotif active={active} />
          <div className="cap-band__content">
            {capabilities.map((c, i) => (
              <article
                key={c.layer}
                className="capc"
                data-layer={c.layer}
                data-on={active === c.layer || undefined}
                style={{ '--i': i } as CSSProperties}
                onMouseEnter={() => enter(c.layer)}
                onMouseLeave={() => leave(c.layer)}
              >
                <CapText c={c} />
              </article>
            ))}
          </div>
          <span className="cap-band__frame" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>

        {/* Mobile — three stacked cards. */}
        <div className="cap-ladder" data-shown={shown || undefined} data-active={active || undefined}>
          {capabilities.map((c, i) => (
            <article
              key={c.layer}
              className="cap"
              data-layer={c.layer}
              data-on={active === c.layer || undefined}
              style={{ '--i': i } as CSSProperties}
              onMouseEnter={() => enter(c.layer)}
              onMouseLeave={() => leave(c.layer)}
            >
              <div className="cap__motif">
                <ScaleMotif layer={c.layer} color={COLOR[c.layer]} active={active === c.layer} />
                <span className="cap__reticle" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <div className="cap__body">
                <CapText c={c} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
