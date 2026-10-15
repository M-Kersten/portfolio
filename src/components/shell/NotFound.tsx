import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { cases } from '../../content';
import { EXHIBIT_COUNT } from '../../content/exhibits';
import { useFocusTrap } from '../../lib/useFocusTrap';

// A wrong address, in the exhibition's own words: a label on a closed room,
// with the maquette still standing behind it. Any path the site doesn't know
// lands here (Pages' 404.html bounces it to the app first), and so does a
// /work/<slug> for a project that doesn't exist.
export function NotFound() {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  useFocusTrap(ref);
  useEffect(() => {
    const prev = document.title;
    document.title = 'Not open yet — Merijn Kersten';
    return () => {
      document.title = prev;
    };
  }, []);
  useEffect(() => {
    back.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate('/', { replace: true });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate]);

  return createPortal(
    <div ref={ref} className="exhibit closed" data-place="page">
      <div className="exhibit__dim" aria-hidden="true" />
      <article className="xl closed__label" role="dialog" aria-modal="true" aria-labelledby="closed-title">
        <div className="xl__body">
          <span className="xl__no">Closed for now</span>
          <h1 id="closed-title" className="xl__title">
            This part of the exhibition isn’t open yet
          </h1>
          <p className="xl__note">
            The address leads to a room that hasn’t been built. The {EXHIBIT_COUNT} exhibits in the model are open, and so is the rest of the
            collection: {cases.length} projects in all.
          </p>
          <div className="closed__ways">
            <button ref={back} type="button" className="btn" onClick={() => navigate('/', { replace: true })}>
              Back to the exhibition
            </button>
            <Link className="btn btn--ghost" to="/projects" replace>
              See the collection
            </Link>
          </div>
        </div>
      </article>
    </div>,
    document.body,
  );
}
