import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sceneStore, useSceneSelector } from '../scene/store';
import { useReducedMotion } from '../lib/useReducedMotion';
import { recordLaunch, useLaunchCount } from '../lib/launches';

// The game pulls in a second R3F canvas (the 3D rocket ship), so it's lazily
// loaded — it can't reach the entry chunk and only fetches once someone has
// actually flown. The three.js chunk is already in memory by then (the home
// scene uses it), so it appears instantly.
const AsteroidsGame = lazy(() => import('./AsteroidsGame').then((m) => ({ default: m.AsteroidsGame })));

// The DOM half of the launch easter egg (the rocket itself lives in the city
// scene — see maquette/city.tsx NextProjectSite). Stage-driven off the scene
// store: 'pad' shows the mission panel + LAUNCH, 'countdown' runs T-minus,
// 'ascend' is the scene's show (we just hold a telemetry line), 'game' mounts
// the asteroids overlay. Esc aborts back to the overview at any point.

export function LaunchOverlay() {
  const launch = useSceneSelector((s) => s.launch);
  const reduced = useReducedMotion();
  const flights = useLaunchCount();
  const [count, setCount] = useState(3);

  // Esc aborts (except mid-game — the game owns its own exit confirm)
  useEffect(() => {
    if (launch === 'idle' || launch === 'game') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') sceneStore.setLaunch('idle');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [launch]);

  // The count: T-3 → T-2 → T-1 → ascend. The scene takes it from there.
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (launch !== 'countdown') return;
    setCount(3);
    let n = 3;
    timer.current = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        if (timer.current) clearInterval(timer.current);
        recordLaunch(); // ignition — one tick on the global odometer
        sceneStore.setLaunch('ascend');
      } else {
        setCount(n);
      }
    }, reduced ? 400 : 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [launch, reduced]);

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
            <button type="button" className="btn launch__go" onClick={() => sceneStore.setLaunch('countdown')}>
              LAUNCH
            </button>
            <button type="button" className="launch__abort" onClick={() => sceneStore.setLaunch('idle')}>
              cancel <kbd>Esc</kbd>
            </button>
          </div>
        </div>
      )}
      {launch === 'countdown' && (
        <div className="launch__count" key={count} aria-live="assertive">
          T−{count}
        </div>
      )}
      {launch === 'ascend' && <div className="launch__telemetry">stage 1 nominal · throttle 100% · next stop: orbit</div>}
    </div>,
    document.body,
  );
}
