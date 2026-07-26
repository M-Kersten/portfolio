import { useMemo, useRef, type RefObject } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, type DirectionalLight, type Fog, type HemisphereLight } from 'three';
import type { BloomEffect } from 'postprocessing';
import { useReducedMotion } from '../lib/useReducedMotion';
import { useSceneSelector, bootAt, MAQUETTE_BOOT } from './store';
import { fitScale, type Hotspot } from './framing';
import { CameraRig } from './CameraRig';
import { Maquette } from './maquette';
import { GRADE, MaquetteGrade } from './MaquetteGrade';

// The layer accents — each layer has its own "air", and the whole stage washes
// further toward it when a node in it is picked.
const LAYER_ACCENT: Record<string, string> = { city: '#27e8f2', room: '#ff9068', chip: '#a9f75c' };
const LAYER_BY_STEP = ['city', 'room', 'chip'];
const BG_HEX = '#0a0d10';
const RIM_HEX = '#27e8f2'; // city cyan — the fallback / starting air

// Two coupled washes give the maquette its atmosphere:
//   1. Air (by scroll): the fog, background and rim light ease toward the ACTIVE
//      layer's accent, so descending City→Room→Chip cross-fades the atmosphere
//      cyan → coral → lime. Kept a whisper at rest — the layers should *feel*
//      different, not look tinted.
//   2. Pick (on select): the same colour deepens and the fill lights drop, so
//      the emissive object stays the brightest thing and the scene glows around
//      the pick.
function SelectDim({ hemi, dir1, dir2, bloom }: {
  hemi: RefObject<HemisphereLight | null>;
  dir1: RefObject<DirectionalLight | null>;
  dir2: RefObject<DirectionalLight | null>;
  bloom: RefObject<BloomEffect | null>;
}) {
  const selected = useSceneSelector((s) => s.selectedSlug);
  const journeyStep = useSceneSelector((s) => s.journeyStep);
  const celebrateAt = useSceneSelector((s) => s.celebrateAt);
  const reduced = useReducedMotion();
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const d = useRef(0);
  const bg = useMemo(() => new Color(BG_HEX), []);
  const tmp = useMemo(() => new Color(), []);
  // The resting air colour — eased toward the active layer's accent, so it also
  // holds through a fade-out (journeyStep tracks the layer you left from) with
  // no snap back to cyan.
  const air = useMemo(() => new Color(RIM_HEX), []);
  useFrame(() => {
    const target = selected ? 1 : 0;
    d.current += (target - d.current) * (reduced ? 1 : 0.07);
    const k = d.current;
    // ease the air toward the active layer's accent (a cross-fade of atmosphere
    // as you scroll between layers, not a snap)
    tmp.set(LAYER_ACCENT[LAYER_BY_STEP[journeyStep] ?? 'city'] ?? RIM_HEX);
    if (reduced) air.copy(tmp);
    else air.lerp(tmp, 0.045);

    if (hemi.current) hemi.current.intensity = 0.35 * (1 - 0.72 * k);
    if (dir1.current) dir1.current.intensity = 1.1 * (1 - 0.66 * k);
    if (dir2.current) {
      dir2.current.intensity = 0.5 + 0.4 * k; // the accent rim grows on select
      dir2.current.color.copy(air); // the rim light itself carries the layer air
    }
    const fog = scene.fog as Fog | null;
    if (fog) {
      // The camera eases back on narrow screens (CameraRig/fitScale), so scale
      // the fog band with it — otherwise the pulled-back subject hazes out.
      const fit = fitScale(size.width / size.height);
      fog.near = 4.5 * fit;
      fog.far = (14 - 4.5 * k) * fit;
      // the haze carries the layer's colour — it only tints where there's depth
      // (behind/around the objects), never the empty black sky, so each layer
      // gets its own air without washing the frame. Deepens on select.
      fog.color.copy(bg).lerp(air, 0.19 + 0.26 * k);
    }
    // background frame: near-black at rest, tinting only as a node is picked (the
    // scene glowing around the pick) — never a resting colour wash
    if (scene.background instanceof Color) scene.background.copy(bg).lerp(air, 0.13 * k);
    if (bloom.current) {
      // One power surge at the homecoming (the 10th node's HUD closing),
      // decaying back over ~3s while the celebration plays out in view.
      const surge =
        celebrateAt !== null && !reduced
          ? Math.exp(-(performance.now() - celebrateAt) / 1100) * 0.9
          : 0;
      // Establishing ignition: a softer surge as the maquette powers on — its beat
      // in the load sequence, timed off the shared boot clock so it fires just
      // after the hero name + subhead have resolved (never before its beat, so the
      // guard on `since`). Decays over ~2s. Skipped under reduced motion.
      const since = performance.now() - bootAt - MAQUETTE_BOOT;
      const ignite = reduced || since < 0 ? 0 : Math.exp(-since / 900) * 0.7;
      bloom.current.intensity = 0.4 + k * 0.75 + surge + ignite;
      (bloom.current.luminanceMaterial as unknown as { threshold: number }).threshold = 0.78 - k * 0.34;
    }
  });
  return null;
}

// In-canvas scene root. Dark stage with a cyan rim light; the procedural
// Lightformer environment means no external HDR fetch (nothing for a corporate
// firewall to block — §12).

export function Stage({ onActivate }: { onActivate: (h: Hotspot) => void }) {
  // The grade is free (it merges into the existing pass); only the animated grain
  // is motion, so that's the one thing reduced-motion turns off.
  const reducedStage = useReducedMotion();
  const hemi = useRef<HemisphereLight>(null);
  const dir1 = useRef<DirectionalLight>(null);
  const dir2 = useRef<DirectionalLight>(null);
  const bloom = useRef<BloomEffect>(null);

  return (
    <>
      <color attach="background" args={['#0a0d10']} />
      {/* Subtle depth haze so the layers behind the active one recede. */}
      <fog attach="fog" args={['#0a0d10', 4.5, 14]} />
      <hemisphereLight ref={hemi} intensity={0.35} color="#aebfd6" groundColor="#0a0d10" />
      <directionalLight ref={dir1} position={[6, 11, 4]} intensity={1.1} color="#eaf2ff" />
      <directionalLight ref={dir2} position={[-7, 4, -6]} intensity={0.5} color="#27e8f2" />
      <SelectDim hemi={hemi} dir1={dir1} dir2={dir2} bloom={bloom} />

      {/* Reflections come almost entirely from this procedural environment; kept
          gentle so glossy surfaces catch a soft sheen rather than a hot mirror
          blob. */}
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={0.55} position={[5, 6, 4]} scale={9} color="#cfe0ff" />
        <Lightformer intensity={0.4} position={[-6, 3, -4]} scale={9} color="#27e8f2" />
        <Lightformer intensity={0.28} position={[3, 2, -6]} scale={8} color="#a89eff" />
        <Lightformer intensity={0.3} position={[0, -5, 0]} scale={12} color="#0a0d10" />
      </Environment>

      <CameraRig />

      <Maquette onActivate={onActivate} />

      {/* A restrained glow — only the brightest accents lift, no neon halo — and
          then the maquette's grade: a filmic shoulder, a teal/amber split, fine
          grain and the vignette. MaquetteGrade replaces the old BrightnessContrast
          + Vignette rather than stacking on them, and merges into the same pass. */}
      <EffectComposer enableNormalPass={false} multisampling={2}>
        {/* ref cast: @react-three/postprocessing types the ref as the class, not the instance */}
        <Bloom ref={bloom as never} mipmapBlur luminanceThreshold={0.78} luminanceSmoothing={0.3} intensity={0.4} radius={0.6} />
        <MaquetteGrade grain={reducedStage ? 0 : GRADE.grain} />
      </EffectComposer>
    </>
  );
}
