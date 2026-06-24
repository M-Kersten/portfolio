import { Suspense, lazy, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSceneSelector, sceneStore } from '../scene/store';
import { resolvePlace } from '../data/places';
import { caseBySlug } from '../content';
import { CaseDialog } from './CaseDialog';

// The twin route. A live MapLibre map of the district sits full-screen behind
// this DOM chrome (legend, attribution, controls). All real focusable DOM (§11).

const TwinMap = lazy(() => import('./TwinMap'));

export function TwinPage() {
  const navigate = useNavigate();
  const placeId = useSceneSelector((s) => s.placeId);
  const [showCase, setShowCase] = useState(false);

  const place = resolvePlace(placeId);
  const study = caseBySlug('municipal-twin');

  return (
    <>
      <Suspense
        fallback={
          <div className="twin-map twin-map--fallback">
            <p>Loading map…</p>
          </div>
        }
      >
        <TwinMap />
      </Suspense>

      <div className="twin-overlay">
        <div className="twin-back">
          <button type="button" className="twin-controls__btn" onClick={() => sceneStore.resetTwinView()}>
            Reset view
          </button>
          {study && (
            <button type="button" className="twin-controls__btn" onClick={() => setShowCase(true)}>
              Read the case
            </button>
          )}
          <button type="button" className="twin-controls__btn" onClick={() => navigate('/')}>
            ← Back
          </button>
        </div>

        <div className="twin-legend">
          <div className="twin-legend__title">Building height</div>
          <div className="twin-legend__ramp">
            <span
              className="twin-legend__bar"
              style={{ background: 'linear-gradient(90deg, #163139, #1d818a, #27e8f2)' }}
            />
          </div>
          <div className="twin-legend__scale">
            <span>low</span>
            <span>tall</span>
          </div>
        </div>

        <div className="twin-caption">
          <div className="twin-caption__place">{place.label} — live map</div>
          <p className="twin-caption__attr">
            Live OpenStreetMap data via OpenFreeMap, buildings extruded by height. © OpenStreetMap contributors.
          </p>
          {place.dedication && <p className="twin-caption__dedication">{place.dedication}</p>}
        </div>
      </div>

      {showCase && study && <CaseDialog study={study} onClose={() => setShowCase(false)} />}
    </>
  );
}
