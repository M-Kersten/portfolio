import { useEffect, useRef } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { caseBySlug, LAYER_LABEL, site, type CaseStudy } from '../content';
import { asset } from '../lib/asset';
import { youtubeEmbed } from '../lib/youtube';
import { useFocusTrap } from '../lib/useFocusTrap';
import { sceneStore } from '../scene/store';
import { StoryLinks } from './StoryLinks';

const LAYER_STEP: Record<string, number> = { city: 0, room: 1, chip: 2 };
// Centre of each layer's scroll band on the hero (fraction of scroll travel),
// matching the City <0.25 · Room 0.25–0.75 · Chip ≥0.75 split in HeroStage.
const ZONE_CENTER = [0.125, 0.5, 0.875];

// Bottom dossier drawer for an inspected node: the title + subtitle band on top,
// then the media and the full detail below, while the 3D node stays visible above
// (the camera lifts it clear). Route-driven so deep links + the back button keep
// working.

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
  const hudRef = useRef<HTMLElement>(null);
  useFocusTrap(hudRef); // Tab stays inside; focus returns to the hotspot on close

  const study = slug ? caseBySlug(slug) : undefined;
  // Closing drops you back onto the layer you left from. Scroll to the *centre*
  // of that layer's band on the hero so the journey lands squarely on it — the
  // old per-panel scrollIntoView aimed at a panel top, which on the current
  // (shorter) hero overshot past the travel and dumped you a layer down (Room →
  // Chip) or into the content below (Chip → capabilities).
  //
  // Except once: closing the TENTH signal's HUD is the homecoming — the journey
  // pulls up to the City overview instead, where the celebration plays out
  // (particle burst, bloom surge, and the ghost "next project" site rising).
  const close = () => {
    navigate('/');
    if (!study) return;
    const homecoming = sceneStore.snapshot().celebrationPending;
    const step = homecoming ? 0 : LAYER_STEP[study.layer] ?? 0;
    if (homecoming) sceneStore.celebrate();
    sceneStore.setJourneyStep(step);
    // Lift the HUD's body-scroll lock before scrolling — the unmount cleanup
    // that normally restores it can land after the scroll call, which silently
    // swallowed the move whenever the target differed from where we already
    // were. Double-rAF so the scroll runs after the route commit + paint.
    document.body.style.overflow = '';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const hero = document.getElementById('hero');
        if (!hero) return;
        const travel = Math.max(hero.offsetHeight - window.innerHeight, 0);
        window.scrollTo({ top: hero.offsetTop + (ZONE_CENTER[step] ?? 0.125) * travel });
      }),
    );
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
    <aside ref={hudRef} className="node-hud" data-layer={study.layer} role="dialog" aria-modal="true" aria-label={study.title}>
      <button ref={closeRef} type="button" className="node-hud__close" onClick={close} aria-label="Close node">
        <span aria-hidden="true">✕</span>
      </button>

      <header className="node-hud__head">
        <div className="node-hud__meta">
          <span className="node-hud__layer">{LAYER_LABEL[study.layer]}</span>
          <span>{study.sector}</span>
          <span>{study.client}</span>
          {study.live && <span className="case-card__live">Live</span>}
          {study.draft && <span className="modal__draft">Sample</span>}
        </div>
        <h2 className="node-hud__title">{study.title}</h2>
        <p className="node-hud__outcome">{study.outcome}</p>
      </header>

      <Media study={study} />

      <div className="node-hud__detail">
        {/* The story — the three beats visitors come for. */}
        <div className="story node-hud__story">
          <section>
            <h3 className="story__h">The problem</h3>
            <p>{study.problem}</p>
          </section>
          <section>
            <h3 className="story__h">The approach</h3>
            <p>{study.approach}</p>
          </section>
          {study.lesson && (
            <section>
              <h3 className="story__h">The lesson</h3>
              <p>{study.lesson}</p>
            </section>
          )}
        </div>

        {study.tech && study.tech.length > 0 && (
          <ul className="node-hud__tech" aria-label="Technologies">
            {study.tech.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
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

        {/* Walk the storyline without leaving the HUD — the camera flies along. */}
        <StoryLinks study={study} onJump={(s) => navigate(`/work/${s}`)} />
      </div>
    </aside>
  );
}
