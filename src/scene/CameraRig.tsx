import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type PerspectiveCamera } from 'three';
import { useReducedMotion } from '../lib/useReducedMotion';
import { useSceneSelector } from './store';
import { HOTSPOTS, journeyView, nodeView, fitScale, fitFov, layerGap } from './framing';

// The camera is driven by the scroll journey (which layer is centred) and by the
// selected node (zoom in).

export function CameraRig() {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const reduced = useReducedMotion();

  const journeyStep = useSceneSelector((s) => s.journeyStep);
  const selectedSlug = useSceneSelector((s) => s.selectedSlug);

  const sway = useRef(0);
  const target = useRef(new Vector3().copy(journeyView(0).target));
  const desiredPos = useRef(new Vector3());
  const desiredTarget = useRef(new Vector3());

  // State changes need at least one frame in demand mode. A resize also changes
  // the fit + FOV, so re-project the lens and re-render on resize too.
  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    const fov = fitFov(size.width / size.height);
    if (cam.isPerspectiveCamera && cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    invalidate();
  }, [journeyStep, selectedSlug, size, camera, invalidate]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    const aspect = size.width / size.height;
    const gap = layerGap(aspect); // layers spread apart on tall screens
    const hotspot = selectedSlug ? HOTSPOTS.find((h) => h.slug === selectedSlug) : undefined;
    const base = hotspot ? nodeView(hotspot, gap) : journeyView(journeyStep, gap);
    desiredTarget.current.copy(base.target);

    // On a phone the node HUD is a bottom sheet, so lift a selected node into the
    // visible upper area by aiming lower. Portrait only — no effect on desktop.
    if (hotspot && aspect < 1) desiredTarget.current.y -= 0.7 * (1 - aspect);

    // Ease the camera back on narrow/tall viewports so the whole active layer
    // stays in frame (see fitScale). The offset keeps its direction — the same
    // three-quarter angle — just longer, so the maquette reads smaller but whole.
    const off = base.pos.clone().sub(base.target).multiplyScalar(fitScale(size.width / size.height));

    if (!hotspot && !reduced) {
      // gentle idle sway around the centred layer
      sway.current += dt * 0.25;
      const a = Math.sin(sway.current) * 0.07;
      desiredPos.current.set(
        base.target.x + off.x * Math.cos(a) - off.z * Math.sin(a),
        base.target.y + off.y,
        base.target.z + off.x * Math.sin(a) + off.z * Math.cos(a),
      );
    } else {
      desiredPos.current.copy(base.target).add(off);
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
