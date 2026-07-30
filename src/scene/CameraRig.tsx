import { useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type PerspectiveCamera } from 'three';
import { useReducedMotion } from '../lib/useReducedMotion';
import { launchTrack, sceneStore, useSceneSelector } from './store';
import { HOTSPOTS, anchorWorld, journeyView, introView, nodeView, hotspotView, fitScale, fitFov, layerGap, CAMERA, LAUNCH } from './framing';
import { tweakedView } from './nodeTweak';
import { isMobileViewport } from '../lib/isMobile';

// The camera is driven by the scroll journey (which layer is centred) and by the
// selected node (zoom in).

// The cinematic load intro: how long the dolly-in from the wide establishing
// shot to the City overview takes (seconds).
//
// Measured from the dolly's own first rendered frame (see introStart below), so
// it always plays in full — a slow cold load delays the move rather than eating
// it. It used to run off the shared boot clock, which kept it in step with the
// DOM beats (BootVeil's fade up out of black, then IntroCard) but meant load time
// was spent from the dolly's budget: past ~a third of INTRO_DUR the camera
// visibly snapped into the middle of the shot. The trade is deliberate — a
// smooth, complete move matters more than frame-exact sync with the veil, which
// has usually finished fading by the time the canvas first paints anyway.
// The smoothstep below has zero derivative at both ends, so the dolly eases up
// from a standstill and settles to one.
const INTRO_DUR = 4.65;

// Porthole focus: on desktop the woken object is framed inside the reticle ring,
// which sits left of centre so the dossier clears on the right. LIFT raises the
// AIM to the object (centring it vertically); OFFSET pans the projection left via
// setViewOffset (moving the object across the frame without changing the camera,
// so the framing angle is preserved). Both animate in with the zoom.
const PORTHOLE_LIFT = 1.0;
const PORTHOLE_OFFSET = 0.2;
// Seconds the camera holds still after a selection while the reticle materialises
// over the object and locks onto it. Mirrors the hold in the fr-acquire keyframes
// (node-hud.css) — the two are one movement and have to agree.
const ACQUIRE_HOLD = 0.4;
// Seconds from selection to the push-in visually settling — the acquire hold
// above, plus how long the glide's exponential ease (k=3.4/s, below) takes to
// close ~95% of the distance: -ln(0.05)/3.4 ≈ 0.88s. Gates store.zoomSettled,
// which useActive ANDs into `selected` — so an object's wake animations start
// on arrival instead of partway through the swoop in.
const ZOOM_SETTLE = ACQUIRE_HOLD + 0.9;

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
  const prevLaunch = useRef(launch);
  const shake = useRef(0); // launch camera-shake impulse, 1 → 0
  const shakeOff = useRef(new Vector3()); // last frame's positional jitter
  const shakeRight = useRef(new Vector3());
  const shakeUp = useRef(new Vector3());
  const target = useRef(new Vector3().copy(journeyView(0).target));
  const desiredPos = useRef(new Vector3());
  const desiredTarget = useRef(new Vector3());
  const focusAmt = useRef(0); // 0 overview → 1 zoomed on a node (drives the porthole view-offset)
  // Reduced motion and phones skip the dolly — straight to the City overview.
  const introDone = useRef(reduced || isMobileViewport());
  const introStart = useRef(0); // wall clock at the dolly's first frame (0 = not yet)
  const skipIntro = useRef(false); // any scroll / tap / key cancels the intro

  // Park the camera at the dolly's START before anything is painted. The Canvas
  // creates it at MAQUETTE_HOME — the settled overview, i.e. the dolly's
  // DESTINATION — so without this the first frame shows the end of the shot, then
  // the intro's first useFrame teleports out to the wide establishing shot and
  // travels back in. That reads exactly as the camera jumping to a spot and then
  // correcting itself. Layout effect, so it lands before the first painted frame.
  useLayoutEffect(() => {
    // Only when the dolly is actually going to play: a deep link or a restored
    // scroll position hands the camera to the node/journey logic instead, and that
    // should ease from the overview, not from a wide shot it never intended to use.
    if (introDone.current || selectedSlug || journeyStep !== 0) return;
    if (!size.width || !size.height) return; // an unmeasured canvas would make the aspect NaN
    const s = introView(layerGap(size.width / size.height));
    camera.position.copy(s.pos);
    target.current.copy(s.target);
    camera.lookAt(target.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // State changes (and resizes) need at least one frame in demand mode; the FOV
  // itself is driven per-frame in useFrame so it can ease when zooming in/out.
  useEffect(() => {
    invalidate();
  }, [journeyStep, selectedSlug, launch, size, camera, invalidate]);

  // The load intro yields to the visitor: the first scroll / tap / key press
  // cancels the dolly and hands control straight back to the scroll journey.
  useEffect(() => {
    const cancel = () => {
      skipIntro.current = true;
    };
    const opts: AddEventListenerOptions = { passive: true, once: true };
    window.addEventListener('wheel', cancel, opts);
    window.addEventListener('touchstart', cancel, opts);
    window.addEventListener('pointerdown', cancel, opts);
    window.addEventListener('keydown', cancel, { once: true });
    return () => {
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchstart', cancel);
      window.removeEventListener('pointerdown', cancel);
      window.removeEventListener('keydown', cancel);
    };
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const DEG = Math.PI / 180;

    // Undo last frame's camera-shake jitter before any easing math runs — the
    // shake is a per-frame display offset (added after lookAt below), never
    // part of the camera's actual path, so it can't accumulate or steer.
    camera.position.sub(shakeOff.current);
    shakeOff.current.set(0, 0, 0);

    // ---- Porthole focus offset: pan the projection left so the woken node sits
    // in the reticle (dossier clear on the right). setViewOffset moves the image
    // without moving the camera; the per-frame FOV updates below preserve it.
    // Desktop only; eases in and out with the zoom.
    // …and it waits out the acquire hold too. This pan slides the WHOLE image
    // sideways, so if it ran while the reticle was still locking on, the object
    // would crawl out from under a ring that hasn't moved yet. `justSwitched`
    // covers the first frame, where nodeAge is still the outgoing node's.
    const justSwitched = selectedSlug !== prevSel.current;
    const holdFocus = !!selectedSlug && !reduced && (justSwitched || nodeAge.current < ACQUIRE_HOLD);
    const wantFocus = !!selectedSlug && launch === 'idle' && size.width >= size.height && !holdFocus;
    focusAmt.current += ((wantFocus ? 1 : 0) - focusAmt.current) * (reduced ? 1 : 1 - Math.exp(-6 * dt));
    const pcam = camera as PerspectiveCamera;
    if (pcam.isPerspectiveCamera) {
      if (focusAmt.current > 0.001) {
        pcam.setViewOffset(size.width, size.height, PORTHOLE_OFFSET * size.width * focusAmt.current, 0, size.width, size.height);
      } else if (pcam.view?.enabled) {
        pcam.clearViewOffset();
      }
    }

    const aspect = size.width / size.height;

    // ---- Load intro: a slow dolly-in from a wide establishing shot into the
    // City overview. Cancelled the moment the visitor scrolls/taps, on a deep
    // link (a node is already selected), during a launch, or once it completes —
    // then the normal journey logic below takes over from wherever the camera is.
    if (!introDone.current) {
      // Measured from the dolly's OWN first frame, not the shared boot clock.
      // On the boot clock, everything between module eval and the canvas's first
      // frame (bundle parse, three/R3F init, shader compile) was already spending
      // the dolly's 4.65s — so on a cold load the first frame it painted was
      // already a third of the way along, which meant the camera snapped from the
      // parked establishing shot to the middle of the move and only then eased.
      // That jump *was* the weird movement. Anchoring here means p is always 0 on
      // the first frame, so the dolly departs from the establishing shot smoothly
      // however long the load took (and it makes the useLayoutEffect parking above
      // self-healing rather than load-order-dependent).
      if (introStart.current === 0) introStart.current = performance.now();
      const p = (performance.now() - introStart.current) / (INTRO_DUR * 1000);
      if (skipIntro.current || selectedSlug || journeyStep !== 0 || launch !== 'idle' || p >= 1) {
        introDone.current = true;
      } else {
        const g = layerGap(aspect);
        const s = introView(g);
        const e = journeyView(0, g);
        // Land exactly where the scroll-journey logic below rests, which is NOT
        // journeyView's raw pos: that logic pushes the camera back by fitScale on
        // a narrow viewport. Ending at the raw pos meant the dolly eased to a
        // stop and *then* the handoff lerp kept creeping outward to the real
        // resting spot — a second, unasked-for move right as it settled. (`e` is
        // a throwaway from journeyView, so reshaping its pos in place is free.)
        e.pos.sub(e.target).multiplyScalar(fitScale(aspect)).add(e.target);
        const t = p * p * (3 - 2 * p); // smoothstep: eases up from a standstill
        camera.position.copy(s.pos).lerp(e.pos, t);
        target.current.copy(s.target).lerp(e.target, t);
        camera.lookAt(target.current);
        const cam0 = camera as PerspectiveCamera;
        const wantFov0 = fitFov(aspect);
        if (cam0.isPerspectiveCamera && Math.abs(cam0.fov - wantFov0) > 0.01) {
          cam0.fov = wantFov0;
          cam0.updateProjectionMatrix();
        }
        invalidate();
        return;
      }
    }

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
      let amp = 0;
      if (reduced) {
        camera.position.copy(desiredPos.current);
        target.current.copy(desiredTarget.current);
      } else {
        // the chase lags a little harder than the normal glide — the rocket
        // visibly pulls ahead, then the camera catches up
        const k = 1 - Math.exp(-(ascending ? 2.6 : 3.4) * dt);
        camera.position.lerp(desiredPos.current, k);
        target.current.lerp(desiredTarget.current, k);
        if (launch !== prevLaunch.current) {
          if (launch === 'ascend') shake.current = 1; // the ignition kick
          prevLaunch.current = launch;
        }
        shake.current = Math.max(0, shake.current - dt * 0.55);
        // hold-down rumble through the count; a big kick at lift-off settling
        // into the ascent's sustained rattle
        amp = launch === 'countdown' ? 0.014 : launch === 'ascend' ? 0.035 + 0.15 * shake.current : 0;
      }
      camera.lookAt(target.current);
      // ---- camera shake: position only ----
      // Applied AFTER lookAt, across the view plane (camera-local right/up),
      // so the whole frame translates. Jittering before lookAt re-aimed the
      // camera at the pinned target every frame, which read as the rotation
      // wobbling instead of the camera rattling.
      if (amp > 0) {
        shakeRight.current.set(1, 0, 0).applyQuaternion(camera.quaternion);
        shakeUp.current.set(0, 1, 0).applyQuaternion(camera.quaternion);
        shakeOff.current
          .addScaledVector(shakeRight.current, (Math.random() - 0.5) * amp)
          .addScaledVector(shakeUp.current, (Math.random() - 0.5) * amp);
        camera.position.add(shakeOff.current);
      }
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
      // A fresh push-in starts unsettled; reduced motion (no glide to wait out)
      // and the overview (no hotspot at all) have nothing to arrive at, so they
      // count as settled from this same frame.
      sceneStore.setZoomSettled(reduced || !hotspot);
      // Capture where the object sits on screen RIGHT NOW (camera still wide) so
      // the porthole reticle can appear ON it and fly to the ring centre as the
      // camera zooms in. Off-screen / reduced-motion → no fly-in (opens centred).
      if (hotspot) {
        const ndc = anchorWorld(hotspot, gap).project(camera);
        const onScreen = !reduced && ndc.z < 1 && Math.abs(ndc.x) < 1.4 && Math.abs(ndc.y) < 1.4;
        sceneStore.setReticleStart({
          slug: hotspot.slug,
          pos: onScreen ? { x: (ndc.x * 0.5 + 0.5) * 100, y: (-ndc.y * 0.5 + 0.5) * 100 } : null,
        });
      } else {
        sceneStore.setReticleStart(null);
      }
    }
    if (hotspot) {
      nodeAge.current += dt;
      if (nodeAge.current >= ZOOM_SETTLE) sceneStore.setZoomSettled(true);
    }

    // ---- The acquire hold. The camera's glide is exponential (see the lerp at the
    // bottom: ~86% of the way in 0.6s), so if it starts the instant you select, it
    // has effectively arrived before the reticle has even begun to travel — the
    // ring then lands about a second late, which is exactly what read as wrong.
    // So hold the previous framing while the reticle finds and locks the target,
    // then release: the push-in and the ring's travel start on the same beat and
    // ease the same way. Must match ACQUIRE_HOLD in the fr-acquire keyframes.
    const acquiring = !!hotspot && !reduced && nodeAge.current < ACQUIRE_HOLD;
    const framed = hotspot && !acquiring ? hotspot : undefined;

    const base = framed ? nodeView(framed, gap, view!) : journeyView(journeyStep, gap);
    desiredTarget.current.copy(base.target);

    // On a phone the focus view is a porthole up top with a content sheet below,
    // so lift the selected node up into the ring by aiming lower. Portrait only —
    // no effect on desktop. The 1.5 boost seats it in the (higher, larger) ring.
    if (framed && aspect < 1) desiredTarget.current.y -= view!.mobileLift * (1 - aspect) * 1.5;

    // Ease the camera back on narrow/tall viewports so the whole active layer
    // stays in frame (see fitScale). The offset keeps its direction — the same
    // three-quarter angle — just longer, so the maquette reads smaller but whole.
    const baseFov = fitFov(aspect);
    const wantFov = baseFov + (framed ? view!.fovZoom : 0);
    const off = base.pos.clone().sub(base.target).multiplyScalar(fitScale(aspect));
    // Zooming into a node widens the lens (wantFov); pull the camera in by the
    // matching amount so the node keeps its framing — the wider FOV then only
    // warps perspective, it doesn't throw the subject around the frame.
    if (framed) off.multiplyScalar(Math.tan((baseFov / 2) * DEG) / Math.tan((wantFov / 2) * DEG));

    // Porthole focus (desktop): raise the AIM to the object so it sits centred
    // (vertically) in the reticle; the horizontal slide is done with the camera
    // view-offset up top. The camera position is untouched, so the angle holds.
    if (framed && aspect >= 1) desiredTarget.current.y += view!.aimDown * PORTHOLE_LIFT;

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
