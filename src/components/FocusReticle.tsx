import { useRef } from 'react';
import { useSceneSelector } from '../scene/store';
import { caseBySlug } from '../content';

// The porthole reticle: a large instrument ring you look *through* at the woken
// 3D object. Persistent (not route-driven) so it can iris OPEN as the camera
// zooms into a node and iris CLOSED as it zooms back out — both driven by the
// selection in the scene store, kept in sync with the camera by matching CSS
// timing. Purely decorative chrome; the dossier (NodeHud) carries the content.

const MAJ = Array.from({ length: 12 }, (_, i) => i * 30);
const MIN = Array.from({ length: 60 }, (_, i) => i * 6).filter((a) => a % 30 !== 0);
const pt = (a: number, r: number) => [50 + Math.cos((a * Math.PI) / 180) * r, 50 + Math.sin((a * Math.PI) / 180) * r];

export function FocusReticle() {
  const slug = useSceneSelector((s) => s.selectedSlug);
  const study = slug ? caseBySlug(slug) : undefined;
  const open = !!study;
  // Hold the last layer through the close so the accent doesn't flip to the
  // default mid-animation as the selection clears.
  const layer = useRef(study?.layer ?? 'city');
  if (study) layer.current = study.layer;

  return (
    <div className="focus-reticle" data-open={open || undefined} data-layer={layer.current} aria-hidden="true">
      <div className="focus-reticle__mask" />
      <svg className="focus-reticle__svg" viewBox="0 0 100 100">
        <circle className="fr-glow" cx="50" cy="50" r="48" />
        <circle className="fr-ring" cx="50" cy="50" r="48" />
        <circle className="fr-ring2" cx="50" cy="50" r="44.5" />
        <g className="fr-ticks">
          {MAJ.map((a) => {
            const [x1, y1] = pt(a, 48);
            const [x2, y2] = pt(a, 45);
            return <line key={a} className="fr-tick" x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
        </g>
        <g className="fr-ticks-min">
          {MIN.map((a) => {
            const [x1, y1] = pt(a, 48);
            const [x2, y2] = pt(a, 46.7);
            return <line key={a} className="fr-tickmin" x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
        </g>
        <g className="fr-cross">
          <line x1="50" y1="43" x2="50" y2="46.5" />
          <line x1="50" y1="53.5" x2="50" y2="57" />
          <line x1="43" y1="50" x2="46.5" y2="50" />
          <line x1="53.5" y1="50" x2="57" y2="50" />
        </g>
      </svg>
    </div>
  );
}
