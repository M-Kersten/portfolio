import { useState, type CSSProperties } from 'react';
import { type CaseStudy } from '../content';
import { asset } from '../lib/asset';

// A waypoint on the timeline map: a compact card pinned above or below the
// route, with a small thumbnail, the year as a milestone and a company tag.
// `style` carries its absolute placement (left = its year, top/bottom = its
// side). Clicking it lifts the project into the focus view.
export function CaseCard({
  study,
  onOpen,
  style,
}: {
  study: CaseStudy;
  onOpen: () => void;
  style?: CSSProperties;
}) {
  const [imgOk, setImgOk] = useState(true);
  const src = asset(`/posters/${study.slug}.jpg`);
  const seed = Array.from(study.slug).reduce((a, c) => a + c.charCodeAt(0), 0);
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
    <button
      type="button"
      className="worktile"
      data-layer={study.layer}
      style={{ ...style, '--card-ang': `${120 + (seed % 90)}deg` } as CSSProperties}
      onClick={onOpen}
      aria-label={`${study.title}, ${yearLabel} — open`}
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
  );
}
