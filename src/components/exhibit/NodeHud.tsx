import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { caseBySlug } from '../../content';
import { sceneStore } from '../../scene/store';
import { Exhibit } from './Exhibit';
import { NotFound } from '../shell/NotFound';

const LAYER_STEP: Record<string, number> = { city: 0, room: 1, chip: 2 };
// Centre of each layer's scroll band on the hero (fraction of scroll travel),
// matching the City <0.25 · Room 0.25–0.75 · Chip ≥0.75 split in HeroStage.
const ZONE_CENTER = [0.125, 0.5, 0.875];
const CLOSE_FADE = 200; // ms the label fades before the route (and the zoom-out) commits

// An exhibit opened in the maquette: the woken 3D object sits framed in the
// porthole (FocusReticle, which irises open and shut with the camera zoom),
// and its label stands beside it (Exhibit). Route-driven, so deep links and the
// back button keep working: /work/<slug> opens the label, and
// /work/<slug>?entry opens it straight onto the book. Walking to the next
// exhibit is a route change too, so the camera flies to it.

export function NodeHud() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const closeTimer = useRef<number>();
  // whether this label was opened from inside the site (the guide, a marker),
  // rather than arriving on a /work link
  const openedInApp = useRef((window.history.state as { idx?: number } | null)?.idx ? true : false);
  const [closing, setClosing] = useState(false);
  const study = slug ? caseBySlug(slug) : undefined;

  // Closing drops you back onto the layer you left from — scroll to the *centre*
  // of that layer's band on the hero so the journey lands squarely on it. Closing
  // the TENTH project is the homecoming: the journey pulls up to the City overview
  // where the celebration plays out (particle burst, ghost pad).
  const runClose = () => {
    // Back to the model the way you came: opened from the home page, closing
    // steps back to it (so the browser's Back doesn't reopen the label);
    // arrived on a link, it replaces this entry with the home page.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0 && openedInApp.current) navigate(-1);
    else navigate('/', { replace: true });
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

  // Fade the label out first, then commit the route so the porthole irises shut
  // (and the camera zooms out) cleanly behind it.
  const close = () => {
    if (closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(runClose, CLOSE_FADE);
  };

  useEffect(() => {
    if (!study) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // pause the journey while inspecting
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(closeTimer.current);
    };
  }, [study]);

  // no such project: that room isn't open
  if (!study) return <NotFound />;

  return (
    <Exhibit
      key={study.slug}
      study={study}
      place="maquette"
      closing={closing}
      startInBook={params.has('entry')}
      onBookChange={(open) => setParams(open ? { entry: '' } : {}, { replace: true })}
      onClose={close}
      // a walk replaces the entry: Back leaves the exhibition rather than
      // stepping back through every exhibit you walked past
      onWalk={(s, book) => navigate(`/work/${s}${book ? '?entry=' : ''}`, { replace: true })}
    />
  );
}
