import { useState, type CSSProperties } from 'react';
import { type CaseStudy } from '../content';
import { asset } from '../lib/asset';
import { noteCaseOrigin } from '../lib/caseOrigin';

// A waypoint on the timeline map: a compact card pinned above or below the
// route, with a small thumbnail, the year as a milestone and a company tag.
// `style` carries its absolute placement (left = its year, top/bottom = its
// side) and lands on the slot round the card; the timeline marks the slot lit
// (data-lit) once the focus has reached it, which powers the card on.
// Clicking it lifts the project into the focus view.
export function CaseCard({
  study,
  onOpen,
  style,
  slotRef,
}: {
  study: CaseStudy;
  onOpen: () => void;
  style?: CSSProperties;
  slotRef?: (el: HTMLDivElement | null) => void;
}) {
  const [imgOk, setImgOk] = useState(true);
  const src = asset(`/posters/${study.slug}.jpg`);
  // The tag reads as the company by default; independent work overrides it with
  // a "Freelance" / "Passion" label (and then the client moves into the meta
  // line so it stays visible).
  const kindLabel = study.kind === 'freelance' ? 'Freelance' : study.kind === 'passion' ? 'Passion' : null;
  const tagText = kindLabel ?? study.tag ?? study.client;
  const metaText = kindLabel ? `${study.client} · ${study.sector}` : study.sector;
  // `year` may carry a month for timeline placement ("2024-09"); the stamp only
  // ever shows the year itself.
  const yearLabel = study.year?.slice(0, 4);

  return (
    <div className="worktile-slot" style={style} ref={slotRef}>
      <button
        type="button"
        className="worktile"
        data-layer={study.layer}
        onClick={(e) => {
          // the case sheet grows out of this card's picture
          noteCaseOrigin(study.slug, e.currentTarget.querySelector('.worktile__media'));
          onOpen();
        }}
        // No aria-label: the card's own text (year, company, title, sector) is
        // its name. A shorter label left out words the card shows, and speech
        // input users say what they see.
      >
        <div className="worktile__media">
          <div className="worktile__ph" aria-hidden="true" />
          {imgOk && (
            <img className="worktile__img" src={src} alt="" loading="lazy" decoding="async" onError={() => setImgOk(false)} />
          )}
          <div className="worktile__scrim" aria-hidden="true" />
        </div>
        <div className="worktile__body">
          <div className="worktile__stamp">
            <span className="worktile__yr">{yearLabel}</span>
            <span className="worktile__tag" data-kind={study.kind}>{tagText}</span>
          </div>
          <h3 className="worktile__title">{study.title}</h3>
          <span className="worktile__meta">{metaText}</span>
        </div>
        {/* AR-style tracking overlay — corner brackets that "lock on" on hover. */}
        <span className="worktile__reticle" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
      </button>
    </div>
  );
}
