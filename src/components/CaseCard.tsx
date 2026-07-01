import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { LAYER_LABEL, type CaseStudy } from '../content';
import { asset } from '../lib/asset';

// A poster tile: a real project image if one exists (cases.json `media[0]`, or by
// convention public/posters/<slug>.jpg), otherwise an on-brand placeholder poster
// (per-layer accent gradient + dot field + aperture ring). Drop a JPG in and it
// takes over automatically. `feature` tiles span wider for an editorial rhythm.
export function CaseCard({ study, feature }: { study: CaseStudy; feature?: boolean }) {
  const navigate = useNavigate();
  const [imgOk, setImgOk] = useState(true);
  const src = study.media?.[0] ?? asset(`/posters/${study.slug}.jpg`);
  // stable per-slug variation so placeholders in a layer don't look identical
  const seed = Array.from(study.slug).reduce((a, c) => a + c.charCodeAt(0), 0);
  const style = { '--card-ang': `${120 + (seed % 90)}deg` } as CSSProperties;

  return (
    <button
      type="button"
      className="worktile"
      data-layer={study.layer}
      data-feature={feature || undefined}
      style={style}
      onClick={() => navigate(`/work/${study.slug}`)}
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
