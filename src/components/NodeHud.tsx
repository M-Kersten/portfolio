import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { caseBySlug, LAYER_LABEL, site, type CaseStudy } from '../content';
import { asset } from '../lib/asset';
import { youtubeEmbed } from '../lib/youtube';
import { useFocusTrap } from '../lib/useFocusTrap';
import { sceneStore } from '../scene/store';
import { StoryLinks } from './StoryLinks';
import { Scramble } from './Scramble';

const LAYER_STEP: Record<string, number> = { city: 0, room: 1, chip: 2 };
// Centre of each layer's scroll band on the hero (fraction of scroll travel),
// matching the City <0.25 · Room 0.25–0.75 · Chip ≥0.75 split in HeroStage.
const ZONE_CENTER = [0.125, 0.5, 0.875];
const CLOSE_FADE = 280; // ms the dossier fades before the route (and the zoom-out) commits

// Inspected node: the woken 3D object sits framed inside the porthole reticle
// (FocusReticle, which irises open/closed with the camera zoom); this dossier
// holds the case content in a column to the right of the ring. Route-driven so
// deep links + the back button keep working.

// The video's poster until it's asked for, then the player. Embedding YouTube
// on open cost every visitor its whole player for a film most never start —
// the case sheet already works this way (FocusCard → FilmBox); this is the
// same gesture, played in place. Keyed per case by the caller, so moving to
// another project never carries a playing film across.
function Media({ study }: { study: CaseStudy }) {
  const embed = youtubeEmbed(study.video);
  const [playing, setPlaying] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const frameRef = useRef<HTMLIFrameElement>(null);
  // the button the keyboard was on is gone: hand focus to the player
  useEffect(() => {
    if (playing) frameRef.current?.focus();
  }, [playing]);
  if (!embed) return null; // no video — the live object framed in the ring is the visual
  return (
    <div className="node-hud__media node-hud__media--video">
      {playing ? (
        <iframe
          ref={frameRef}
          // autoplay is honest here: the visitor pressed play to get this far
          src={`${embed}&autoplay=1`}
          title={`${study.title} — video`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button type="button" className="node-hud__play" onClick={() => setPlaying(true)} aria-label={`Play the ${study.title} video`}>
          {imgOk && <img src={asset(`/posters/${study.slug}.jpg`)} alt="" onError={() => setImgOk(false)} />}
          <span aria-hidden="true">&#9654;</span>
        </button>
      )}
    </div>
  );
}

export function NodeHud() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const closeRef = useRef<HTMLButtonElement>(null);
  const hudRef = useRef<HTMLElement>(null);
  const closeTimer = useRef<number>();
  const [closing, setClosing] = useState(false);
  const [shown, setShown] = useState(false); // gates the dossier fade-in (robust to re-renders)
  useFocusTrap(hudRef); // Tab stays inside; focus returns to the hotspot on close

  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);

  const study = slug ? caseBySlug(slug) : undefined;

  // Closing drops you back onto the layer you left from — scroll to the *centre*
  // of that layer's band on the hero so the journey lands squarely on it. Closing
  // the TENTH project is the homecoming: the journey pulls up to the City overview
  // where the celebration plays out (particle burst, ghost pad).
  const runClose = () => {
    navigate('/');
    if (!study) return;
    const homecoming = sceneStore.snapshot().celebrationPending;
    const step = homecoming ? 0 : LAYER_STEP[study.layer] ?? 0;
    if (homecoming) sceneStore.celebrate();
    sceneStore.setJourneyStep(step);
    // Lift the body-scroll lock before scrolling (the unmount cleanup can land
    // after and swallow the move). Double-rAF so it runs after route + paint.
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

  // Fade the dossier out first, then commit the route so the porthole irises shut
  // (and the camera zooms out) cleanly behind it.
  const close = () => {
    if (closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(runClose, CLOSE_FADE);
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
      clearTimeout(closeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [study]);

  if (!study) return <Navigate to="/" replace />;

  const dossier = (
    <aside
      ref={hudRef}
      className="node-hud"
      data-layer={study.layer}
      data-shown={shown || undefined}
      data-closing={closing || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={`${LAYER_LABEL[study.layer]} — ${study.title} — ${study.outcome}`}
    >
      <button ref={closeRef} type="button" className="node-hud__close" onClick={close} aria-label="Close node">
        <span aria-hidden="true">✕</span>
      </button>

      <div className="node-hud__col">
        {/* keyed by slug so it re-decodes on a story-link jump */}
        <h2 className="node-hud__title">
          <Scramble key={study.slug} text={study.title} delay={120} wrap />
        </h2>
        <p className="node-hud__outcome">{study.outcome}</p>

        <Media key={study.slug} study={study} />

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
          <a className="btn node-hud__discuss" href={`mailto:${site.contact.email}?subject=${encodeURIComponent(study.title)}`}>
            Ask me about it
          </a>
          {study.links?.map((link) => (
            <a key={link.url} className="btn btn--ghost" href={link.url} target="_blank" rel="noreferrer">
              {link.label} <span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>

        {/* Walk the storyline without leaving the HUD — the camera flies along. */}
        <StoryLinks study={study} onJump={(s) => navigate(`/work/${s}`)} />
      </div>
    </aside>
  );

  // Both portal to <body>: the dossier layers above the fixed header (it lives
  // deep inside <main>, a z-index:1 stacking context that would otherwise trap
  // it there); the meta pills sit at the bottom, centred under the porthole.
  // React context (router, focus) still flows through the component tree, so
  // routing and the focus trap are unaffected.
  return createPortal(
    <>
      {/* Meta tags, pulled out of the dossier top (they crowded the header) and
          set as pills at the bottom-left, centred under the porthole ring. */}
      <div
        className="node-hud__tags"
        data-layer={study.layer}
        data-shown={shown || undefined}
        data-closing={closing || undefined}
        aria-hidden="true"
      >
        <span className="node-hud__pill node-hud__pill--layer">{LAYER_LABEL[study.layer]}</span>
        {study.sector && <span className="node-hud__pill">{study.sector}</span>}
        {study.client && <span className="node-hud__pill">{study.client}</span>}
      </div>
      {dossier}
    </>,
    document.body,
  );
}
