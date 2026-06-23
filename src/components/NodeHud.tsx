import { useEffect, useRef } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { caseBySlug, LAYER_LABEL, site } from '../content';

// Game-style HUD for an inspected node. Info flanks the 3D on the left (identity)
// and right (detail + actions) so the node stays visible in the centre. Non-
// blocking and route-driven so deep links + the back button keep working.
export function NodeHud() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const closeRef = useRef<HTMLButtonElement>(null);

  const study = slug ? caseBySlug(slug) : undefined;
  const close = () => navigate('/');

  useEffect(() => {
    if (!study) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // pause the journey while inspecting
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [study]);

  if (slug === 'municipal-twin') return <Navigate to="/work/municipal-twin" replace />;
  if (!study) return <Navigate to="/" replace />;

  return (
    <aside className="node-hud" role="dialog" aria-label={study.title}>
      <div className="node-hud__panel node-hud__panel--left">
        <span className="node-hud__bracket" aria-hidden="true" />
        <div className="node-hud__meta">
          <span className="node-hud__layer">{LAYER_LABEL[study.layer]}</span>
          <span>{study.sector}</span>
          {study.live && <span className="case-card__live">Live</span>}
        </div>
        <h2 className="node-hud__title">{study.title}</h2>
        <p className="node-hud__outcome">{study.outcome}</p>
        <p className="node-hud__client">{study.client}</p>
      </div>

      <div className="node-hud__panel node-hud__panel--right">
        <button ref={closeRef} type="button" className="node-hud__close" onClick={close} aria-label="Close node">
          <span aria-hidden="true">✕</span>
        </button>
        <p className="node-hud__built">{study.built}</p>
        {study.tech && study.tech.length > 0 && (
          <ul className="node-hud__tech" aria-label="Technologies">
            {study.tech.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        {study.lesson && (
          <p className="node-hud__lesson">
            <span>Key lesson</span>
            {study.lesson}
          </p>
        )}
        <a
          className="btn node-hud__discuss"
          href={`mailto:${site.contact.email}?subject=${encodeURIComponent(study.title)}`}
        >
          Discuss this
        </a>
      </div>
    </aside>
  );
}
