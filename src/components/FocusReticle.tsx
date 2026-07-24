import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useSceneSelector } from '../scene/store';
import { caseBySlug } from '../content';

// The porthole reticle: a large instrument ring you look *through* at the woken
// 3D object. It reads as a camera acquiring a target — on focus it snaps small
// ONTO the object where it currently sits on screen, then, as the camera zooms in
// and brings the object to the ring's home, it flies to the porthole centre while
// growing and rotating level into a lock. The start point is projected by the
// CameraRig (which has the camera) and handed over via the scene store; if the
// target is off-screen or motion is reduced there's no fly-in and it opens centred.
// The short ticks around the rim make the lock-on rotation legible. Portaled to
// <body> so it draws over the scene but *behind* the fixed header.

// Short ticks every 15° around the rim; their sweep reveals the lock-on rotation.
const TICKS = Array.from({ length: 24 }, (_, i) => i * 15);
const pt = (a: number, r: number) => [50 + Math.cos((a * Math.PI) / 180) * r, 50 + Math.sin((a * Math.PI) / 180) * r];

export function FocusReticle() {
  const slug = useSceneSelector((s) => s.selectedSlug);
  const start = useSceneSelector((s) => s.reticleStart);
  const study = slug ? caseBySlug(slug) : undefined;
  const open = !!study;
  // Hold the last layer through the close so the accent doesn't flip to the
  // default mid-animation as the selection clears.
  const layer = useRef(study?.layer ?? 'city');
  if (study) layer.current = study.layer;

  // The projection for THIS selection (written a frame after the slug lands, so
  // gating the reticle's appearance on it lets it open cleanly ON the target).
  const acquired = open && start && start.slug === slug ? start : null;
  const from = acquired?.pos ?? null;

  // Snap onto the target for one frame (data-acquiring, transition suppressed),
  // then release so the ring flies to the porthole centre. No start point → it
  // simply opens centred.
  const [acquiring, setAcquiring] = useState(false);
  useEffect(() => {
    if (!from) {
      setAcquiring(false);
      return;
    }
    setAcquiring(true);
    const r = requestAnimationFrame(() => setAcquiring(false));
    return () => cancelAnimationFrame(r);
  }, [from?.x, from?.y]);

  const styleVars = from ? ({ '--sx': `${from.x}%`, '--sy': `${from.y}%` } as CSSProperties) : undefined;

  return createPortal(
    <div
      className="focus-reticle"
      data-open={!!acquired || undefined}
      data-acquiring={acquiring || undefined}
      data-layer={layer.current}
      style={styleVars}
      aria-hidden="true"
    >
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
