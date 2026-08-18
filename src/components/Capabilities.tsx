import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { capabilities, site, type Capability, type Layer } from '../content';
import { useReducedMotion } from '../lib/useReducedMotion';
import { ScaleMotif } from './ScaleMotif';
import { CapBandMotif } from './CapBandMotif';
import { ScanFrame } from './ScanFrame';
import { Scramble } from './Scramble';
import { SectionTitle } from './SectionTitle';

const COLOR: Record<Layer, string> = { city: '#27e8f2', room: '#ff9068', chip: '#a9f75c' };

// The written content, shared by the desktop band columns and the mobile
// cards. The title decodes in (scrambled → clear) when it scrolls into view.
function CapText({ c, delay = 0 }: { c: Capability; delay?: number }) {
  return (
    <>
      <span className="capc__index">{c.index}</span>
      <h3 className="capc__title">
        {/* Wrapping, not clipping. These titles are authored in the CMS and run
            to a full sentence ("City: maps & the real world"), so at any width
            or font size where one doesn't fit its column the no-wrap default
            painted it straight through the clip-path and lopped off the end. */}
        <Scramble text={c.title} delay={delay} wrap />
      </h3>
      <p className="capc__text">{c.body}</p>
      <ul className="capc__tags">
        {c.tags.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>
  );
}

// The three scales as one full-bleed band (§3 — mirrors the hero's three
// layers), sheared into slanted regions by two diagonal seams. One canvas paints
// all three live motifs behind the copy; hovering a region focuses it and dims
// the rest. Narrow screens fall back to three stacked cards.
export function Capabilities() {
  const { capabilitiesIntro } = site;
  const reduced = useReducedMotion();
  const [active, setActive] = useState<Layer | null>(null);
  const [shown, setShown] = useState(false);
  const headRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced) {
      setShown(true);
      return;
    }
    const el = headRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es[0].isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  const enter = (l: Layer) => setActive(l);
  const leave = (l: Layer) => setActive((a) => (a === l ? null : a));

  return (
    <section id="capabilities" className="section capabilities">
      <ScanFrame variant="section" />
      <div className="container" ref={headRef}>
        <SectionTitle>{capabilitiesIntro.title}</SectionTitle>
        <p className="section__lead">{capabilitiesIntro.lead}</p>
      </div>

      {/* Desktop — one full-bleed slanted band, edge to edge. */}
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
              <div className="capc__inner">
                <CapText c={c} delay={i * 140} />
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Mobile — the desktop band's look, stacked: the copy sits over each
          scale's own animated motif, full-bleed, one scale per row. */}
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
            </div>
            <div className="cap__body">
              <CapText c={c} delay={i * 140} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
