import { useState, type CSSProperties } from 'react';
import { capabilities, site, type Capability, type Layer } from '../content';
import { MOTION } from '../lib/motion';
import { useReveal } from '../lib/useReveal';
import { ScaleMotif } from './ScaleMotif';
import { CapBandMotif } from './CapBandMotif';
import { ScanFrame } from './ScanFrame';
import { Scramble } from './Scramble';
import { SectionHead } from './SectionHead';

const COLOR: Record<Layer, string> = { city: '#27e8f2', room: '#ff9068', chip: '#a9f75c' };

// The written content, shared by the desktop band columns and the mobile
// cards. The title decodes in (scrambled → clear) when it scrolls into view.
function CapText({ c, delay = 0 }: { c: Capability; delay?: number }) {
  return (
    <>
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
  const [active, setActive] = useState<Layer | null>(null);
  // the band and the stacked cards each arrive when they themselves come into
  // view, not when the heading above does (which left them playing off screen)
  const [bandRef, bandShown] = useReveal<HTMLDivElement>();
  const [ladderRef, ladderShown] = useReveal<HTMLDivElement>();

  const enter = (l: Layer) => setActive(l);
  const leave = (l: Layer) => setActive((a) => (a === l ? null : a));

  return (
    <section id="capabilities" className="section capabilities">
      <ScanFrame variant="section" />
      <div className="container">
        {/* the note is the three scales the work happens at, as a model
            maker would mark them: the city small, the chip blown up */}
        <SectionHead id="capabilities" title={capabilitiesIntro.title} lead={capabilitiesIntro.lead} note="1:5000 · 1:20 · 20:1" />
      </div>

      {/* Desktop — one full-bleed slanted band, edge to edge. */}
      <div className="cap-band" ref={bandRef} data-shown={bandShown || undefined} data-active={active || undefined}>
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
                <CapText c={c} delay={i * 2 * MOTION.stagger} />
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Mobile — the desktop band's look, stacked: the copy sits over each
          scale's own animated motif, full-bleed, one scale per row. */}
      <div className="cap-ladder" ref={ladderRef} data-shown={ladderShown || undefined} data-active={active || undefined}>
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
              <CapText c={c} delay={i * 2 * MOTION.stagger} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
