import { useEffect, useRef } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { caseBySlug, LAYER_LABEL, site, type CaseStudy } from '../content';
import { asset } from '../lib/asset';
import { youtubeEmbed } from '../lib/youtube';
import { sceneStore } from '../scene/store';

const LAYER_STEP: Record<string, number> = { city: 0, room: 1, chip: 2 };
// Centre of each layer's scroll band on the hero (fraction of scroll travel),
// matching the City <0.25 · Room 0.25–0.75 · Chip ≥0.75 split in HeroStage.
const ZONE_CENTER = [0.125, 0.5, 0.875];

// Bottom dossier drawer for an inspected node: a photo/video on the left and the
// full detail on the right, while the 3D node stays visible above (the camera
// lifts it clear). Route-driven so deep links + the back button keep working.

function Media({ study }: { study: CaseStudy }) {
  const embed = youtubeEmbed(study.video);
  if (embed) {
    return (
      <div className="node-hud__media node-hud__media--video">
        <iframe
          src={embed}
          title={`${study.title} — video`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
        />
      </div>
    );
  }
  const src = study.media?.[0];
  if (!src) {
    return (
      <div className="node-hud__media node-hud__media--empty" aria-hidden="true">
        <span className="node-hud__play">▶</span>
        <span className="node-hud__mediahint">photo / video</span>
      </div>
    );
  }
  const url = asset(src);
  if (/\.(mp4|webm|mov)$/i.test(src)) {
    return <video className="node-hud__media" src={url} autoPlay muted loop playsInline />;
  }
  return <img className="node-hud__media" src={url} alt={study.title} />;
}

export function NodeHud() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const closeRef = useRef<HTMLButtonElement>(null);

  const study = slug ? caseBySlug(slug) : undefined;
  // Closing drops you back onto the layer you left from. Scroll to the *centre*
  // of that layer's band on the hero so the journey lands squarely on it — the
  // old per-panel scrollIntoView aimed at a panel top, which on the current
  // (shorter) hero overshot past the travel and dumped you a layer down (Room →
  // Chip) or into the content below (Chip → capabilities).
  const close = () => {
    navigate('/');
    if (!study) return;
    const step = LAYER_STEP[study.layer] ?? 0;
    sceneStore.setJourneyStep(step);
    requestAnimationFrame(() => {
      const hero = document.getElementById('hero');
      if (!hero) return;
      const travel = Math.max(hero.offsetHeight - window.innerHeight, 0);
      window.scrollTo({ top: hero.offsetTop + (ZONE_CENTER[step] ?? 0.125) * travel });
    });
  };

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

  if (!study) return <Navigate to="/" replace />;

  return (
    <aside className="node-hud" data-layer={study.layer} role="dialog" aria-label={study.title}>
      <button ref={closeRef} type="button" className="node-hud__close" onClick={close} aria-label="Close node">
        <span aria-hidden="true">✕</span>
      </button>

      <Media study={study} />

      <div className="node-hud__detail">
        <div className="node-hud__meta">
          <span className="node-hud__layer">{LAYER_LABEL[study.layer]}</span>
          <span>{study.sector}</span>
          <span>{study.client}</span>
          {study.live && <span className="case-card__live">Live</span>}
          {study.draft && <span className="modal__draft">Sample</span>}
        </div>

        <h2 className="node-hud__title">{study.title}</h2>
        <p className="node-hud__outcome">{study.outcome}</p>

        <div className="node-hud__cols">
          <section>
            <h3 className="node-hud__h">The problem</h3>
            <p>{study.challenge}</p>
          </section>
          <section>
            <h3 className="node-hud__h">What I made</h3>
            <p>{study.built}</p>
          </section>
        </div>

        {study.tech && study.tech.length > 0 && (
          <ul className="node-hud__tech" aria-label="Technologies">
            {study.tech.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}

        {study.lesson && (
          <p className="node-hud__lesson">
            <span>What I learned</span>
            {study.lesson}
          </p>
        )}

        <div className="node-hud__actions">
          <a
            className="btn node-hud__discuss"
            href={`mailto:${site.contact.email}?subject=${encodeURIComponent(study.title)}`}
          >
            Ask me about it
          </a>
          {study.article && (
            <a className="btn btn--ghost" href={study.article} target="_blank" rel="noreferrer">
              Read more <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </div>
    </aside>
  );
}
