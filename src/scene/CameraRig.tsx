import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useReducedMotion } from '../lib/useReducedMotion';
import { resolvePlace } from '../data/places';
import { useSceneSelector, sceneStore } from './store';
import {
  MAQUETTE_HOME,
  maquetteFocus,
  twinEstablishing,
  twinIntro,
} from './framing';

// The bridge between the two scenes is a camera move, not an engine handoff
// (§1, §6). In maquette mode this rig owns the camera: slow auto-orbit, eased
// focus on a hotspot. In twin mode it flies the descent into the district, then
// yields to OrbitControls once settled.

export function CameraRig() {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const reduced = useReducedMotion();

  const mode = useSceneSelector((s) => s.mode);
  const focusLayer = useSceneSelector((s) => s.focusLayer);
  const placeId = useSceneSelector((s) => s.placeId);
  const twinSettled = useSceneSelector((s) => s.twinSettled);
  const resetNonce = useSceneSelector((s) => s.resetNonce);

  const place = resolvePlace(placeId);

  const orbit = useRef(0);
  const target = useRef(new Vector3().copy(MAQUETTE_HOME.target));
  const desiredPos = useRef(new Vector3());
  const desiredTarget = useRef(new Vector3());
  const prevMode = useRef(mode);

  // Entering the twin: start the descent from a pulled-back pose (or, under
  // reduced motion, cut straight to the framed establishing shot).
  useEffect(() => {
    if (mode === 'twin' && prevMode.current !== 'twin') {
      const est = twinEstablishing(place.view);
      if (reduced) {
        camera.position.copy(est.pos);
        target.current.copy(est.target);
        camera.lookAt(target.current);
        sceneStore.markTwinSettled();
      } else {
        const intro = twinIntro(place.view);
        camera.position.copy(intro.pos);
        target.current.copy(intro.target);
        camera.lookAt(target.current);
      }
    }
    prevMode.current = mode;
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, placeId, reduced]);

  // Reset view / focus changes need at least one frame in demand mode.
  useEffect(() => invalidate(), [resetNonce, focusLayer, invalidate]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    if (mode === 'maquette') {
      const base = focusLayer != null ? maquetteFocus(focusLayer) : MAQUETTE_HOME;
      desiredTarget.current.copy(base.target);
      if (focusLayer == null && !reduced) {
        orbit.current += dt * 0.12;
        const off = base.pos.clone().sub(base.target);
        const a = orbit.current;
        desiredPos.current.set(
          base.target.x + off.x * Math.cos(a) - off.z * Math.sin(a),
          base.pos.y,
          base.target.z + off.x * Math.sin(a) + off.z * Math.cos(a),
        );
      } else {
        desiredPos.current.copy(base.pos);
      }
    } else {
      if (twinSettled) return; // OrbitControls owns the camera now
      const est = twinEstablishing(place.view);
      desiredPos.current.copy(est.pos);
      desiredTarget.current.copy(est.target);
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

    if (mode === 'twin' && !twinSettled && camera.position.distanceTo(desiredPos.current) < 1.5) {
      sceneStore.markTwinSettled();
    }
  });

  return null;
}
