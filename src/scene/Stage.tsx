import { useRef, type RefObject } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useFrame, useThree } from '@react-three/fiber';
import type { DirectionalLight, Fog, HemisphereLight } from 'three';
import { useReducedMotion } from '../lib/useReducedMotion';
import { useSceneSelector } from './store';
import { type Hotspot } from './framing';
import { CameraRig } from './CameraRig';
import { Maquette } from './Maquette';

// When a node is selected, dim the stage lights + deepen the fog so the picked
// object (which is emissive + brightened) stands alone in a soft spotlight.
function SelectDim({ hemi, dir1, dir2 }: {
  hemi: RefObject<HemisphereLight | null>;
  dir1: RefObject<DirectionalLight | null>;
  dir2: RefObject<DirectionalLight | null>;
}) {
  const selected = useSceneSelector((s) => s.selectedSlug);
  const reduced = useReducedMotion();
  const scene = useThree((s) => s.scene);
  const d = useRef(0);
  useFrame(() => {
    const target = selected ? 1 : 0;
    d.current += (target - d.current) * (reduced ? 1 : 0.07);
    const k = d.current;
    if (hemi.current) hemi.current.intensity = 0.35 * (1 - 0.72 * k);
    if (dir1.current) dir1.current.intensity = 1.1 * (1 - 0.66 * k);
    if (dir2.current) dir2.current.intensity = 0.5 * (1 - 0.55 * k);
    const fog = scene.fog as Fog | null;
    if (fog) fog.far = 14 - 4.5 * k;
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

  return (
    <>
      <color attach="background" args={['#0a0d10']} />
      {/* Subtle depth haze so the layers behind the active one recede. */}
      <fog attach="fog" args={['#0a0d10', 4.5, 14]} />
      <hemisphereLight ref={hemi} intensity={0.35} color="#aebfd6" groundColor="#0a0d10" />
      <directionalLight ref={dir1} position={[6, 11, 4]} intensity={1.1} color="#eaf2ff" />
      <directionalLight ref={dir2} position={[-7, 4, -6]} intensity={0.5} color="#27e8f2" />
      <SelectDim hemi={hemi} dir1={dir1} dir2={dir2} />

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
        <Bloom mipmapBlur luminanceThreshold={0.78} luminanceSmoothing={0.3} intensity={0.4} radius={0.6} />
      </EffectComposer>
    </>
  );
}
