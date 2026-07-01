import { useMemo, useRef, type RefObject } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, type DirectionalLight, type Fog, type HemisphereLight } from 'three';
import type { BloomEffect } from 'postprocessing';
import { useReducedMotion } from '../lib/useReducedMotion';
import { useSceneSelector } from './store';
import { caseBySlug } from '../content';
import { type Hotspot } from './framing';
import { CameraRig } from './CameraRig';
import { Maquette } from './Maquette';

// The layer accents — the whole stage washes toward the picked node's colour.
const LAYER_ACCENT: Record<string, string> = { city: '#27e8f2', room: '#ff9068', chip: '#a9f75c' };
const BG_HEX = '#0a0d10';
const RIM_HEX = '#27e8f2'; // dir2's resting rim colour (city cyan)

// When a node is selected the stage doesn't just dim — it takes on that layer's
// colour: fog, background and the rim light all wash toward the accent and the
// bloom swells, so the whole scene glows around the pick. The fill lights still
// drop so the emissive object stays the brightest thing.
function SelectDim({ hemi, dir1, dir2, bloom }: {
  hemi: RefObject<HemisphereLight | null>;
  dir1: RefObject<DirectionalLight | null>;
  dir2: RefObject<DirectionalLight | null>;
  bloom: RefObject<BloomEffect | null>;
}) {
  const selected = useSceneSelector((s) => s.selectedSlug);
  const reduced = useReducedMotion();
  const scene = useThree((s) => s.scene);
  const d = useRef(0);
  const accentHex = (selected && LAYER_ACCENT[caseBySlug(selected)?.layer ?? '']) || RIM_HEX;
  const accent = useMemo(() => new Color(accentHex), [accentHex]);
  const bg = useMemo(() => new Color(BG_HEX), []);
  const rim = useMemo(() => new Color(RIM_HEX), []);
  useFrame(() => {
    const target = selected ? 1 : 0;
    d.current += (target - d.current) * (reduced ? 1 : 0.07);
    const k = d.current;
    if (hemi.current) hemi.current.intensity = 0.35 * (1 - 0.72 * k);
    if (dir1.current) dir1.current.intensity = 1.1 * (1 - 0.66 * k);
    if (dir2.current) {
      dir2.current.intensity = 0.5 + 0.4 * k; // the accent rim grows on select
      dir2.current.color.copy(rim).lerp(accent, k);
    }
    const fog = scene.fog as Fog | null;
    if (fog) {
      fog.far = 14 - 4.5 * k;
      fog.color.copy(bg).lerp(accent, k * 0.45);
    }
    if (scene.background instanceof Color) scene.background.copy(bg).lerp(accent, k * 0.22);
    if (bloom.current) {
      bloom.current.intensity = 0.4 + k * 0.75;
      (bloom.current.luminanceMaterial as unknown as { threshold: number }).threshold = 0.78 - k * 0.34;
    }
  });
  return null;
}

// In-canvas scene root. Dark stage with a cyan rim light; the procedural
// Lightformer environment means no external HDR fetch (nothing for a corporate
// firewall to block — §12).

export function Stage({ onActivate }: { onActivate: (h: Hotspot) => void }) {
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

      <Environment resolution={256} frames={1}>
        <Lightformer intensity={1.0} position={[5, 6, 4]} scale={9} color="#cfe0ff" />
        <Lightformer intensity={0.7} position={[-6, 3, -4]} scale={9} color="#27e8f2" />
        <Lightformer intensity={0.45} position={[3, 2, -6]} scale={8} color="#a89eff" />
        <Lightformer intensity={0.3} position={[0, -5, 0]} scale={12} color="#0a0d10" />
      </Environment>

      <CameraRig />

      <Maquette onActivate={onActivate} />

      {/* A restrained glow — only the brightest accents lift, no neon halo. */}
      <EffectComposer enableNormalPass={false} multisampling={4}>
        {/* ref cast: @react-three/postprocessing types the ref as the class, not the instance */}
        <Bloom ref={bloom as never} mipmapBlur luminanceThreshold={0.78} luminanceSmoothing={0.3} intensity={0.4} radius={0.6} />
      </EffectComposer>
    </>
  );
}
