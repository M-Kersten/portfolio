import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { caseBySlug } from '../../content';
import { sceneStore } from '../../scene/store';
import { BEAT_STEP } from '../../scene/framing';
import { beatAt, beatOfLayer, beatTop } from '../hero/journey';
import { useScrollLock } from '../../lib/page';
import { Exhibit } from './Exhibit';
import { NotFound } from '../shell/NotFound';

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

  // Closing drops you back onto the floor the exhibit stands on. Opened from
  // that floor (the usual way), the page is where it was and stays there. After
  // a walk to an exhibit on another floor it isn't, and it scrolls to the middle
  // of that floor's own beat, so the journey lands squarely on it. Closing the
  // TENTH project is the homecoming: the journey pulls up to the top of the
  // page, the City under the title, where the celebration plays out (particle
  // burst, ghost pad).
  const runClose = () => {
    // Back to the model the way you came: opened from the home page, closing
    // steps back to it (so the browser's Back doesn't reopen the label);
    // arrived on a link, it replaces this entry with the home page.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0 && openedInApp.current) navigate(-1);
    else navigate('/', { replace: true });
    if (!study) return;
    const homecoming = sceneStore.snapshot().celebrationPending;
    if (homecoming) sceneStore.celebrate();
    const hero = document.getElementById('hero');
    const here = hero ? beatAt(hero) : 0;
    const home = beatOfLayer(study.layer);
    // (the entrance is the City's too: an exhibit opened from under the title
    // closes back to it)
    const beat = homecoming ? 0 : BEAT_STEP[here] === BEAT_STEP[home] ? here : home;
    sceneStore.setJourneyBeat(beat);
    if (beat === here && !homecoming) return;
    // Lift the body-scroll lock before scrolling (the unmount cleanup can land
    // after and swallow the move). Double-rAF so it runs after route + paint.
    document.body.style.overflow = '';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const hero = document.getElementById('hero');
        if (hero) window.scrollTo({ top: beatTop(hero, beat, homecoming ? 0 : 0.5) });
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

  // the journey holds still while an exhibit is open
  useScrollLock(Boolean(study));
  useEffect(() => () => clearTimeout(closeTimer.current), []);

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
