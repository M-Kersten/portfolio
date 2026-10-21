import { Suspense, lazy, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { sceneStore, useSceneSelector } from '../../scene/store';
import { EXHIBIT_COUNT, NEXT_LAUNCH_NO } from '../../content/exhibits';
import { useLaunchCount } from '../../lib/launches';
import { useEscape, useScrollLock } from '../../lib/page';
import { LaunchHud } from './LaunchHud';
import { VoiceNote } from '../exhibit/VoiceNote';

// The game pulls in a second R3F canvas (the 3D rocket ship), so it's lazily
// loaded — it can't reach the entry chunk and only fetches once someone has
// actually flown. The three.js chunk is already in memory by then (the home
// scene uses it), so it appears instantly.
const AsteroidsGame = lazy(() => import('./AsteroidsGame').then((m) => ({ default: m.AsteroidsGame })));

// The DOM half of the launch easter egg (the rocket, the tower and the film
// live in the city scene — see maquette/launchSite.tsx). Stage-driven off the
// scene store: 'pad' shows the mission panel + LAUNCH; 'countdown' (the
// terminal count) and 'ascend' (from liftoff) are the scene's film, with the
// telemetry over it (LaunchHud) and a way past it; 'game' mounts the asteroids
// overlay. The scene runs the clock and moves the stages on (and counts the
// launch at liftoff). Esc aborts back to the overview at any point.
//
// On the pad, the panel is exhibit 11's label, in the same hand as the ten
// before it (Exhibit.tsx): the visitor's own project, not built yet. Its audio
// guide is my countdown (src/assets/voice/next-launch.*, when it's recorded),
// and it has two ways on: fly it now, or come and build it (the contact desk).

export function LaunchOverlay() {
  const launch = useSceneSelector((s) => s.launch);
  const flights = useLaunchCount();

  // Esc aborts (except mid-game — the game owns its own exit confirm)
  useEscape(() => sceneStore.setLaunch('idle'), launch !== 'idle' && launch !== 'game');

  // the site's header steps aside while the film runs (launch.css)
  useEffect(() => {
    if (launch !== 'countdown' && launch !== 'ascend') return;
    document.body.dataset.film = '';
    return () => {
      delete document.body.dataset.film;
    };
  }, [launch]);

  // freeze the page scroll while any launch stage is active
  useScrollLock(launch !== 'idle');

  // Portal to <body>: the home page's <main> is its own stacking context below
  // the fixed header, so anything rendered inside it — whatever its z-index —
  // paints under the header. Mission control outranks navigation.
  if (launch === 'idle') return null;
  // The film is the scene's show: the telemetry over it and a way past it
  // (Esc and the scroll lock above still hold)
  if (launch === 'countdown' || launch === 'ascend')
    return createPortal(
      <div className="launch launch--flight">
        <LaunchHud />
        <button type="button" className="launch__abort launch__skip" onClick={() => sceneStore.setLaunch('game')}>
          skip to the game ›
        </button>
      </div>,
      document.body,
    );
  if (launch === 'game')
    return createPortal(
      <Suspense fallback={<div className="ast" />}>
        <AsteroidsGame onExit={() => sceneStore.setLaunch('idle')} />
      </Suspense>,
      document.body,
    );

  // "Let's build it": off the pad and down to the contact desk
  const toDesk = () => {
    sceneStore.setLaunch('idle');
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('contact')?.scrollIntoView({ block: 'start' })));
  };

  return createPortal(
    <div className="launch" role="dialog" aria-label={`Exhibit ${NEXT_LAUNCH_NO}: the next launch`}>
      {launch === 'pad' && (
        <article className="launch__panel">
          <div className="xl__top">
            <span className="xl__no">
              <b>{NEXT_LAUNCH_NO}</b> of {EXHIBIT_COUNT} · still in the workshop
            </span>
            <button type="button" className="xl__close" onClick={() => sceneStore.setLaunch('idle')} aria-label="Back to the model">
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <h2 className="xl__title">Your project</h2>
          <p className="xl__outcome">The exhibit that isn’t built yet</p>
          <p className="xl__meta">Materials to be decided</p>
          <p className="xl__materials">
            Assembled from the {EXHIBIT_COUNT} in the model
            {flights != null && (
              <>
                {' · '}
                <span className="launch__tally">
                  flight <b>{String(flights + 1).padStart(4, '0')}</b>
                </span>
              </>
            )}
          </p>
          <p className="launch__story">
            Every exhibit in this model was launched once: a careful countdown, a clean lift-off, then the problems every project runs into. I follow
            spaceflight closely and watch every launch I have time for, so that’s how I build. This one is still on the pad. Fly it to see how it
            would go, or let’s build it and give it a place in the collection.
          </p>
          <VoiceNote slug="next-launch" title="The next launch" no={String(NEXT_LAUNCH_NO)} label="Audio tour · the countdown" />
          <div className="launch__row">
            <button type="button" className="btn launch__go" onClick={() => sceneStore.setLaunch('countdown')}>
              LAUNCH
            </button>
            <button type="button" className="btn btn--ghost launch__build" onClick={toDesk}>
              Let’s build it <span aria-hidden="true">→</span>
            </button>
          </div>
        </article>
      )}
    </div>,
    document.body,
  );
}
