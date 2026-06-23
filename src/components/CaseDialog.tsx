import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { LAYER_LABEL, site, type CaseStudy } from '../content';

// Presentational dialog used both by the /work/:slug route (CaseModal) and the
// twin overlay's "read the case" button. Every case is fully readable as text,
// no 3D required (§11).
export function CaseDialog({ study, onClose }: { study: CaseStudy; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="modal"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal__panel" role="dialog" aria-modal="true" aria-labelledby="case-title">
        <button ref={closeRef} type="button" className="modal__close" aria-label="Close case study" onClick={onClose}>
          <span aria-hidden="true">✕</span>
        </button>

        <div className="modal__eyebrow">
          <span className="modal__layer">{LAYER_LABEL[study.layer]}</span>
          <span>{study.client}</span>
          <span>{study.sector}</span>
          {study.live && <span className="case-card__live">Live twin</span>}
          {study.draft && <span className="modal__draft">Sample · pending sign-off</span>}
        </div>

        <h2 id="case-title" className="modal__title">
          {study.title}
        </h2>
        <div className="modal__outcome">{study.outcome}</div>

        <div className="modal__grid">
          <section>
            <h3 className="modal__h">The problem</h3>
            <p>{study.challenge}</p>
          </section>
          <section>
            <h3 className="modal__h">What I made</h3>
            <p>{study.built}</p>
          </section>
        </div>

        {study.tech && study.tech.length > 0 && (
          <ul className="modal__tech" aria-label="Technologies">
            {study.tech.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}

        {study.lesson && (
          <div className="modal__lesson">
            <h3 className="modal__h">What I learned</h3>
            <p>{study.lesson}</p>
          </div>
        )}

        <div className="modal__cta">
          {study.live && (
            <Link className="btn" to="/work/municipal-twin" onClick={onClose}>
              Open the live twin →
            </Link>
          )}
          <a
            className="btn btn--ghost"
            href={`mailto:${site.contact.email}?subject=${encodeURIComponent(study.title)}`}
          >
            Ask me about it
          </a>
        </div>
      </div>
    </div>
  );
}
