import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSceneSelector, sceneStore } from '../scene/store';
import { resolvePlace, ATTRIBUTE_META, type TwinAttribute } from '../data/places';
import { site, caseBySlug } from '../content';
import { CaseDialog } from './CaseDialog';

// DOM overlay for the twin route. The 3D itself is the persistent canvas (now in
// twin mode); this is the legend, attribute toggle, attribution and controls.
// All real focusable DOM (§11), positioned over the canvas.

const ATTRS: TwinAttribute[] = ['bouwjaar', 'height', 'roof_area'];

export function TwinPage() {
  const navigate = useNavigate();
  const placeId = useSceneSelector((s) => s.placeId);
  const attribute = useSceneSelector((s) => s.twinAttribute);
  const placeholder = useSceneSelector((s) => s.twinPlaceholder);
  const [showCase, setShowCase] = useState(false);

  const place = resolvePlace(placeId);
  const meta = ATTRIBUTE_META[attribute];
  const study = caseBySlug('municipal-twin');

  return (
    <div className="twin-overlay">
      <div className="twin-controls" role="group" aria-label="Colour buildings by attribute">
        {ATTRS.map((a) => (
          <button
            key={a}
            type="button"
            className="twin-controls__btn"
            aria-pressed={attribute === a}
            onClick={() => sceneStore.setTwinAttribute(a)}
          >
            {ATTRIBUTE_META[a].label}
          </button>
        ))}
      </div>

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
        <div className="twin-legend__title">{meta.label}</div>
        <div className="twin-legend__ramp">
          <span className="twin-legend__bar" style={{ background: 'linear-gradient(90deg, #a9bcc6, #0f8a8a)' }} />
        </div>
        <div className="twin-legend__scale">
          <span>{meta.lowLabel}</span>
          <span>{meta.highLabel}</span>
        </div>
      </div>

      <div className="twin-caption">
        <div className="twin-caption__place">{place.label} — digital twin</div>
        <p className="twin-caption__attr">
          {placeholder
            ? `Placeholder geometry — drop a baked ${site.twinSource.dataset} model in for real data (scripts/bake-district.md).`
            : `© ${site.twinSource.dataset}, ${site.twinSource.release}. Coloured by ${meta.label.toLowerCase()}.`}
        </p>
        {place.dedication && <p className="twin-caption__dedication">{place.dedication}</p>}
      </div>

      {showCase && study && <CaseDialog study={study} onClose={() => setShowCase(false)} />}
    </div>
  );
}
