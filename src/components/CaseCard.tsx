import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { LAYER_LABEL, site, type CaseStudy } from '../content';
import { asset } from '../lib/asset';

// A poster tile in the horizontal work track. Compact = image + title + outcome;
// clicking it (no route, no HUD) widens the tile in place and reveals the full
// detail inline. Real image if one exists (cases.json media[0] or by convention
// public/posters/<slug>.jpg), else an on-brand placeholder poster.
export function CaseCard({ study, open, onToggle }: { study: CaseStudy; open: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [imgOk, setImgOk] = useState(true);
  const src = study.media?.[0] ?? asset(`/posters/${study.slug}.jpg`);
  // stable per-slug variation so placeholders in a layer don't look identical
  const seed = Array.from(study.slug).reduce((a, c) => a + c.charCodeAt(0), 0);
  const style = { '--card-ang': `${120 + (seed % 90)}deg` } as CSSProperties;

  // bring the tile into view when it opens (it grows + the track scrolls to it)
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [open]);

  return (
    <div ref={ref} className="worktile" data-layer={study.layer} data-open={open || undefined} style={style}>
      <button type="button" className="worktile__hit" aria-expanded={open} onClick={onToggle}>
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

      {open && (
        <div className="worktile__detail">
          <div className="worktile__cols">
            <section>
              <h4 className="worktile__h">The problem</h4>
              <p>{study.challenge}</p>
            </section>
            <section>
              <h4 className="worktile__h">What I made</h4>
              <p>{study.built}</p>
            </section>
          </div>
          {study.tech && study.tech.length > 0 && (
            <ul className="worktile__tech" aria-label="Technologies">
              {study.tech.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          {study.lesson && (
            <p className="worktile__lesson">
              <span>What I learned</span>
              {study.lesson}
            </p>
          )}
          <a
            className="btn worktile__discuss"
            href={`mailto:${site.contact.email}?subject=${encodeURIComponent(study.title)}`}
          >
            Ask me about it
          </a>
        </div>
      )}
    </div>
  );
}
