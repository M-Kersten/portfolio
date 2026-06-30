import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useReducedMotion } from '../lib/useReducedMotion';
import { useSceneSelector } from './store';
import { HOTSPOTS, journeyView, nodeView } from './framing';

// The camera is driven by the scroll journey (which layer is centred) and by the
// selected node (zoom in).

export function CameraRig() {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const reduced = useReducedMotion();

  const journeyStep = useSceneSelector((s) => s.journeyStep);
  const selectedSlug = useSceneSelector((s) => s.selectedSlug);

  const sway = useRef(0);
  const target = useRef(new Vector3().copy(journeyView(0).target));
  const desiredPos = useRef(new Vector3());
  const desiredTarget = useRef(new Vector3());

  // State changes need at least one frame in demand mode.
  useEffect(() => invalidate(), [journeyStep, selectedSlug, invalidate]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    const hotspot = selectedSlug ? HOTSPOTS.find((h) => h.slug === selectedSlug) : undefined;
    const base = hotspot ? nodeView(hotspot) : journeyView(journeyStep);
    desiredTarget.current.copy(base.target);

    if (!hotspot && !reduced) {
      // gentle idle sway around the centred layer
      sway.current += dt * 0.25;
      const off = base.pos.clone().sub(base.target);
      const a = Math.sin(sway.current) * 0.07;
      desiredPos.current.set(
        base.target.x + off.x * Math.cos(a) - off.z * Math.sin(a),
        base.pos.y,
        base.target.z + off.x * Math.sin(a) + off.z * Math.cos(a),
      );
    } else {
      desiredPos.current.copy(base.pos);
    }

    if (reduced) {
      camera.position.copy(desiredPos.current);
      target.current.copy(desiredTarget.current);
    } else {
      const k = 1 - Math.exp(-3.4 * dt);
      camera.position.lerp(desiredPos.current, k);
      target.current.lerp(desiredTarget.current, k);
    }
    camera.lookAt(target.current);
  });

  return null;
}
