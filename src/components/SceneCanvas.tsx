import { Component, Suspense, lazy, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Poster } from './Poster';
import { sceneStore, useSceneSelector } from '../scene/store';
import { type Hotspot } from '../scene/framing';
import { useReducedMotion } from '../lib/useReducedMotion';
import { useWebGLSupport } from '../lib/useWebGLSupport';
import { caseBySlug, type Layer } from '../content';

const CanvasScene = lazy(() => import('./CanvasScene'));

// The single persistent <Canvas> at the app root (§6). It outlives route
// changes; routing only nudges the scene store, which the in-canvas components
// react to. WebGL detection swaps in the static poster with no empty state.

const WORK_RE = /^\/work\/([^/]+)\/?$/;
// Scroll-journey step per layer: City top (0) → Room (1) → Chip bottom (2).
const JOURNEY_STEP: Record<Layer, number> = { city: 0, room: 1, chip: 2 };

/** Anything the WebGL stack throws — no context for the renderer, a chunk that
 *  won't load, an error inside the scene, the effect composer choking on a lost
 *  context — lands on the poster. Uncaught, a render error unmounts the whole
 *  app and leaves a blank page. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('The 3D scene hit an error; showing the static poster.', error);
  }
  render() {
    return this.state.failed ? <Poster /> : this.props.children;
  }
}

export function SceneCanvas() {
  const location = useLocation();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const webgl = useWebGLSupport();

  const [heroInView, setHeroInView] = useState(true);

  // Route -> scene store. Deep links and the browser back button flow through
  // here, so focus is derived from the URL, never from clicks alone.
  useEffect(() => {
    const slug = WORK_RE.exec(location.pathname)?.[1];
    const study = slug ? caseBySlug(slug) : undefined;
    if (slug) sceneStore.markVisited(slug); // opening a node marks it "alive"
    sceneStore.setSelected(study ? study.slug : null);
    if (study) sceneStore.setJourneyStep(JOURNEY_STEP[study.layer]);
  }, [location.pathname]);

  // Pause rendering when the hero scrolls out of view (§10). #hero only exists
  // on the home route, so re-query on navigation.
  useEffect(() => {
    const el = document.getElementById('hero');
    if (!el) {
      setHeroInView(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setHeroInView(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [location.pathname]);

  const onActivate = useCallback(
    (hotspot: Hotspot) => {
      navigate(`/work/${hotspot.slug}`); // the route effect above sets the focus
    },
    [navigate],
  );

  // While the asteroids overlay is up it fully covers the scene — freeze the
  // 3D frameloop so the game gets the whole frame budget to itself.
  const gameUp = useSceneSelector((s) => s.launch) === 'game';
  const frameloop = gameUp ? 'never' : reduced ? 'demand' : heroInView ? 'always' : 'never';

  // The GPU took the context away and didn't give it back (see CanvasScene):
  // there's nothing left to draw with, so the poster takes over.
  const [lost, setLost] = useState(false);
  const onLost = useCallback(() => setLost(true), []);

  return (
    <div className="scene-canvas">
      {webgl && !lost ? (
        <SceneBoundary>
          <Suspense fallback={<Poster />}>
            <CanvasScene frameloop={frameloop} onActivate={onActivate} onLost={onLost} />
          </Suspense>
        </SceneBoundary>
      ) : (
        <Poster />
      )}
    </div>
  );
}
