import { useState, type CSSProperties } from 'react';
import { LAYER_LABEL, type CaseStudy } from '../content';
import { asset } from '../lib/asset';

// A poster tile on the wall. `style` carries its absolute placement + tilt.
// Clicking it lifts the project off the wall into the focus view (no HUD).
export function CaseCard({ study, onOpen, style }: { study: CaseStudy; onOpen: () => void; style?: CSSProperties }) {
  const [imgOk, setImgOk] = useState(true);
  const src = study.media?.[0] ?? asset(`/posters/${study.slug}.jpg`);
  const seed = Array.from(study.slug).reduce((a, c) => a + c.charCodeAt(0), 0);

  return (
    <button
      type="button"
      className="worktile"
      data-layer={study.layer}
      style={{ ...style, '--card-ang': `${120 + (seed % 90)}deg` } as CSSProperties}
      onClick={onOpen}
      aria-label={`${study.title} — open`}
    >
      <div className="worktile__media">
        <div className="worktile__ph" aria-hidden="true" />
        {imgOk && (
          <img className="worktile__img" src={src} alt="" loading="lazy" decoding="async" onError={() => setImgOk(false)} />
        )}
        <div className="worktile__scrim" aria-hidden="true" />
        <div className="worktile__badges">
          <span className="worktile__layer">{LAYER_LABEL[study.layer]}</span>
          {study.live && <span className="worktile__live">Live</span>}
        </div>
      </div>
      <div className="worktile__body">
        <span className="worktile__meta">
          {study.client} · {study.sector}
        </span>
        <h3 className="worktile__title">{study.title}</h3>
        <span className="worktile__outcome">
          <span>Outcome</span>
          {study.outcome}
        </span>
      </div>
    </button>
  );
}
