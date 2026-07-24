import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSceneSelector } from '../scene/store';
import { caseBySlug } from '../content';

// The porthole reticle: a large, clean instrument ring you look *through* at the
// woken 3D object. Persistent (not route-driven) so it can iris OPEN as the camera
// zooms into a node and iris CLOSED as it zooms back out — both driven by the
// selection in the scene store, kept in sync with the camera by matching CSS
// timing. Purely decorative chrome; the dossier (NodeHud) carries the content.
// Portaled to <body> (like the dossier) so it layers above the fixed header
// instead of being trapped under it inside <main>'s stacking context.

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
        <circle className="fr-ring2" cx="50" cy="50" r="46" />
      </svg>
    </div>,
    document.body,
  );
}
