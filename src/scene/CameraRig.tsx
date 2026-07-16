import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type PerspectiveCamera } from 'three';
import { useReducedMotion } from '../lib/useReducedMotion';
import { launchTrack, useSceneSelector } from './store';
import { HOTSPOTS, journeyView, nodeView, hotspotView, fitScale, fitFov, layerGap, CAMERA, LAUNCH } from './framing';
import { tweakedView } from './nodeTweak';

// The camera is driven by the scroll journey (which layer is centred) and by the
// selected node (zoom in).

export function CameraRig() {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const reduced = useReducedMotion();

  const journeyStep = useSceneSelector((s) => s.journeyStep);
  const selectedSlug = useSceneSelector((s) => s.selectedSlug);
  const launch = useSceneSelector((s) => s.launch);

  const sway = useRef(0);
  const nodeAge = useRef(0); // seconds since the current node was selected
  const prevSel = useRef<string | null>(null);
  const target = useRef(new Vector3().copy(journeyView(0).target));
  const desiredPos = useRef(new Vector3());
  const desiredTarget = useRef(new Vector3());

  // State changes (and resizes) need at least one frame in demand mode; the FOV
  // itself is driven per-frame in useFrame so it can ease when zooming in/out.
  useEffect(() => {
    invalidate();
  }, [journeyStep, selectedSlug, launch, size, camera, invalidate]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const DEG = Math.PI / 180;

    const aspect = size.width / size.height;
    const gap = layerGap(aspect); // layers spread apart on tall screens

    // ---- Launch mode: the camera belongs to the rocket -------------------
    // On the pad it frames the vehicle three-quarter; during the ascent it
    // chases the live position (launchTrack, written by the rocket each frame)
    // from slightly below, looking up at the climb. Overrides journey + node.
    if (launch !== 'idle') {
      const ascending = launch === 'ascend' || launch === 'game';
      const offRaw = ascending ? LAUNCH.ascendOffset : LAUNCH.padOffset;
      desiredTarget.current.set(launchTrack.x, launchTrack.y - (ascending ? 0 : LAUNCH.padAim), launchTrack.z);
      desiredPos.current.set(
        launchTrack.x + offRaw[0] * fitScale(aspect),
        launchTrack.y + offRaw[1],
        launchTrack.z + offRaw[2] * fitScale(aspect),
      );
      const cam = camera as PerspectiveCamera;
      const wantFov = fitFov(aspect) + LAUNCH.fovZoom;
      if (cam.isPerspectiveCamera) {
        const nextFov = reduced ? wantFov : cam.fov + (wantFov - cam.fov) * (1 - Math.exp(-CAMERA.fovLerp * dt));
        if (Math.abs(nextFov - cam.fov) > 0.002) {
          cam.fov = nextFov;
          cam.updateProjectionMatrix();
        }
      }
      if (reduced) {
        camera.position.copy(desiredPos.current);
        target.current.copy(desiredTarget.current);
      } else {
        // the chase lags a little harder than the normal glide — the rocket
        // visibly pulls ahead, then the camera catches up
        const k = 1 - Math.exp(-(ascending ? 2.6 : 3.4) * dt);
        camera.position.lerp(desiredPos.current, k);
        target.current.lerp(desiredTarget.current, k);
      }
      camera.lookAt(target.current);
      return;
    }

    const hotspot = selectedSlug ? HOTSPOTS.find((h) => h.slug === selectedSlug) : undefined;
    // The close-up framing for this node: its own `view` overrides falling back
    // to the CAMERA defaults, and in dev the live-dragged values from the tuner.
    const view = hotspot ? (import.meta.env.DEV ? tweakedView(hotspot) : hotspotView(hotspot)) : undefined;

    // Restart the pan (and its ease-in) whenever the selection changes, so it
    // begins centred on the freshly-framed node and drifts out from there.
    if (selectedSlug !== prevSel.current) {
      prevSel.current = selectedSlug;
      nodeAge.current = 0;
      sway.current = 0;
    }
    if (hotspot) nodeAge.current += dt;

    const base = hotspot ? nodeView(hotspot, gap, view!) : journeyView(journeyStep, gap);
    desiredTarget.current.copy(base.target);

    // On a phone the node HUD is a bottom sheet, so lift a selected node into the
    // visible upper area by aiming lower. Portrait only — no effect on desktop.
    if (hotspot && aspect < 1) desiredTarget.current.y -= view!.mobileLift * (1 - aspect);

    // Ease the camera back on narrow/tall viewports so the whole active layer
    // stays in frame (see fitScale). The offset keeps its direction — the same
    // three-quarter angle — just longer, so the maquette reads smaller but whole.
    const baseFov = fitFov(aspect);
    const wantFov = baseFov + (hotspot ? view!.fovZoom : 0);
    const off = base.pos.clone().sub(base.target).multiplyScalar(fitScale(aspect));
    // Zooming into a node widens the lens (wantFov); pull the camera in by the
    // matching amount so the node keeps its framing — the wider FOV then only
    // warps perspective, it doesn't throw the subject around the frame.
    if (hotspot) off.multiplyScalar(Math.tan((baseFov / 2) * DEG) / Math.tan((wantFov / 2) * DEG));

    if (!reduced) {
      // Once a node has settled (nodeOrbitDelay), a slow pan eases in over
      // nodeOrbitRamp and drifts the camera around it; the overview keeps a
      // smaller, always-on idle sway.
      let ease = 1;
      if (hotspot) {
        const e = Math.min(Math.max((nodeAge.current - CAMERA.nodeOrbitDelay) / CAMERA.nodeOrbitRamp, 0), 1);
        ease = e * e * (3 - 2 * e); // smoothstep
      }
      const amp = (hotspot ? CAMERA.nodeOrbitAmp : CAMERA.idleSwayAmp) * ease;
      const speed = hotspot ? CAMERA.nodeOrbitSpeed : CAMERA.idleSwaySpeed;
      sway.current += dt * speed;
      const a = Math.sin(sway.current) * amp;
      const bob = hotspot ? Math.cos(sway.current) * CAMERA.nodeOrbitBob * ease : 0;
      desiredPos.current.set(
        base.target.x + off.x * Math.cos(a) - off.z * Math.sin(a),
        base.target.y + off.y + bob,
        base.target.z + off.x * Math.sin(a) + off.z * Math.cos(a),
      );
    } else {
      desiredPos.current.copy(base.target).add(off);
    }

    // The lens breathes with the zoom: ease the FOV toward wantFov so zooming in
    // visibly widens it and zooming out settles it back.
    const cam = camera as PerspectiveCamera;
    if (cam.isPerspectiveCamera) {
      const nextFov = reduced ? wantFov : cam.fov + (wantFov - cam.fov) * (1 - Math.exp(-CAMERA.fovLerp * dt));
      if (Math.abs(nextFov - cam.fov) > 0.002) {
        cam.fov = nextFov;
        cam.updateProjectionMatrix();
      }
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
