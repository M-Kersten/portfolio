import { Suspense, lazy, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { sceneStore, useSceneSelector } from '../scene/store';
import { useLaunchCount } from '../lib/launches';
import { useReducedMotion } from '../lib/useReducedMotion';
import { armSound, setSoundWanted, soundWanted } from '../lib/launchSound';
import { LaunchHud } from './LaunchHud';

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

export function LaunchOverlay() {
  const launch = useSceneSelector((s) => s.launch);
  const flights = useLaunchCount();
  const reduced = useReducedMotion();
  const [sound, setSound] = useState(soundWanted);

  // Esc aborts (except mid-game — the game owns its own exit confirm)
  useEffect(() => {
    if (launch === 'idle' || launch === 'game') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') sceneStore.setLaunch('idle');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [launch]);

  // the site's header steps aside while the film runs (launch.css)
  useEffect(() => {
    if (launch !== 'countdown' && launch !== 'ascend') return;
    document.body.dataset.film = '';
    return () => {
      delete document.body.dataset.film;
    };
  }, [launch]);

  // freeze the page scroll while any launch stage is active
  useEffect(() => {
    if (launch === 'idle') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [launch]);

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
        <button
          type="button"
          className="launch__abort launch__sound"
          aria-pressed={sound}
          onClick={() => {
            setSoundWanted(!sound);
            setSound(!sound);
          }}
        >
          sound {sound ? 'on' : 'off'}
        </button>
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

  return createPortal(
    <div className="launch" role="dialog" aria-label="Launch control">
      {launch === 'pad' && (
        <div className="launch__panel">
          <span className="launch__mission">MK-01 · THE NEXT LAUNCH{flights != null && ` · FLIGHT ${flights + 1}`}</span>
          <p className="launch__lede">You just toured ten projects that shipped, here's the one we haven’t built yet.</p>
          <p className="launch__brief">Let's launch this one together and blast through all the problems that come in a project</p>
          {flights != null && (
            <span className="launch__tally">
              <b>{String(flights).padStart(4, '0')}</b> launches performed by visitors before you
            </span>
          )}
          <div className="launch__row">
            <button
              type="button"
              className="btn launch__go"
              onClick={() => {
                // the press is the gesture that lets the launch make a sound
                if (!reduced) armSound();
                sceneStore.setLaunch('countdown');
              }}
            >
              LAUNCH
            </button>
            <button type="button" className="launch__abort" onClick={() => sceneStore.setLaunch('idle')}>
              cancel <kbd>Esc</kbd>
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
