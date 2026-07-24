import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSceneSelector } from '../scene/store';
import { caseBySlug } from '../content';

// The porthole reticle: a large instrument ring you look *through* at the woken
// 3D object. On focus it fades in and — as the camera zooms in — grows and rotates
// into a lock, like a camera viewfinder acquiring the target. The short ticks
// around the rim are what make that rotation legible. Persistent (not route-driven)
// so it can lock ON as the camera zooms in and unlock on the way out, both driven
// by the selection in the scene store and kept in sync with the camera by matching
// CSS timing. Portaled to <body> so it draws over the scene but *behind* the fixed
// header (the dossier, also portaled, is the one plane that sits above the header).

// Short ticks every 15° around the rim; their sweep reveals the lock-on rotation.
const TICKS = Array.from({ length: 24 }, (_, i) => i * 15);
const pt = (a: number, r: number) => [50 + Math.cos((a * Math.PI) / 180) * r, 50 + Math.sin((a * Math.PI) / 180) * r];

export function FocusReticle() {
  const slug = useSceneSelector((s) => s.selectedSlug);
  const study = slug ? caseBySlug(slug) : undefined;
  const open = !!study;
  // Hold the last layer through the close so the accent doesn't flip to the
  // default mid-animation as the selection clears.
  const layer = useRef(study?.layer ?? 'city');
  if (study) layer.current = study.layer;

  return createPortal(
    <div className="focus-reticle" data-open={open || undefined} data-layer={layer.current} aria-hidden="true">
      <div className="focus-reticle__mask" />
      <svg className="focus-reticle__svg" viewBox="0 0 100 100">
        <circle className="fr-glow" cx="50" cy="50" r="48" />
        <circle className="fr-ring" cx="50" cy="50" r="48" />
        <g className="fr-ticks">
          {TICKS.map((a) => {
            const [x1, y1] = pt(a, 48);
            const [x2, y2] = pt(a, 46);
            return <line key={a} className="fr-tick" x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
        </g>
      </svg>
    </div>,
    document.body,
  );
}
