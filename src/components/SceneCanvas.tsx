import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Poster } from './Poster';
import { sceneStore, useSceneSelector } from '../scene/store';
import { type Hotspot } from '../scene/framing';
import { useReducedMotion } from '../lib/useReducedMotion';
import { useWebGLSupport } from '../lib/useWebGLSupport';
import { resolvePlace } from '../data/places';
import { caseBySlug, type Layer } from '../content';

const CanvasScene = lazy(() => import('./CanvasScene'));

// The single persistent <Canvas> at the app root (§6). It outlives route
// changes; routing only nudges the scene store, which the in-canvas components
// react to. WebGL detection swaps in the static poster with no empty state.

const WORK_RE = /^\/work\/([^/]+)\/?$/;
// Scroll-journey step per layer: City top (0) → Room (1) → Chip bottom (2).
const JOURNEY_STEP: Record<Layer, number> = { city: 0, room: 1, chip: 2 };

export function SceneCanvas() {
  const location = useLocation();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const webgl = useWebGLSupport();

  const mode = useSceneSelector((s) => s.mode);
  const placeId = useSceneSelector((s) => s.placeId);

  const [heroInView, setHeroInView] = useState(true);
  const [transition, setTransition] = useState(0);
  const firstModeRef = useRef(true);

  // Route -> scene store. Deep links and the browser back button flow through
  // here, so mode/focus/place are derived from the URL, never from clicks alone.
  useEffect(() => {
    const slug = WORK_RE.exec(location.pathname)?.[1];
    const study = slug ? caseBySlug(slug) : undefined;

    if (slug === 'municipal-twin') {
      sceneStore.setMode('twin');
      sceneStore.setSelected(null);
    } else {
      sceneStore.setMode('maquette');
      sceneStore.setSelected(study ? study.slug : null);
      if (study) sceneStore.setJourneyStep(JOURNEY_STEP[study.layer]);
    }

    const place = resolvePlace(new URLSearchParams(location.search).get('place'));
    sceneStore.setPlace(place.id);
    sceneStore.setTwinAttribute(place.attribute);
  }, [location.pathname, location.search]);

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

  // One-shot transition veil whenever the scene mode flips.
  useEffect(() => {
    if (firstModeRef.current) {
      firstModeRef.current = false;
      return;
    }
    setTransition((n) => n + 1);
  }, [mode]);

  const onActivate = useCallback(
    (hotspot: Hotspot) => {
      // Both paths navigate; the route effect above sets mode + focus. The twin
      // hotspot carries any active ?place through into the twin route.
      navigate({ pathname: `/work/${hotspot.slug}`, search: hotspot.twin ? location.search : '' });
    },
    [navigate, location.search],
  );

  const frameloop = mode === 'twin' ? 'always' : reduced ? 'demand' : heroInView ? 'always' : 'never';

  return (
    <div className="scene-canvas">
      {webgl ? (
        <Suspense fallback={<Poster mode={mode} placeId={placeId} />}>
          <CanvasScene frameloop={frameloop} onActivate={onActivate} />
        </Suspense>
      ) : (
        <Poster mode={mode} placeId={placeId} />
      )}

      {transition > 0 && <div key={transition} className="veil veil--run" aria-hidden="true" />}
    </div>
  );
}
