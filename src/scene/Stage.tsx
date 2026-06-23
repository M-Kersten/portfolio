import { Suspense } from 'react';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useReducedMotion } from '../lib/useReducedMotion';
import { useSceneSelector } from './store';
import { resolvePlace } from '../data/places';
import { twinEstablishing, type Hotspot } from './framing';
import { CameraRig } from './CameraRig';
import { Maquette } from './Maquette';
import { District } from './District';

// In-canvas scene root. One renderer, two scenes (§6): the maquette and the
// twin are never mounted at once — the camera move bridges them. Dark stage with
// a cyan rim light; the procedural Lightformer environment means no external HDR
// fetch (nothing for a corporate firewall to block — §12).

export function Stage({ onActivate }: { onActivate: (h: Hotspot) => void }) {
  const reduced = useReducedMotion();
  const mode = useSceneSelector((s) => s.mode);
  const placeId = useSceneSelector((s) => s.placeId);
  const twinSettled = useSceneSelector((s) => s.twinSettled);
  const place = resolvePlace(placeId);
  const est = twinEstablishing(place.view);

  return (
    <>
      <color attach="background" args={['#0a0d10']} />
      <hemisphereLight intensity={0.35} color="#aebfd6" groundColor="#0a0d10" />
      <directionalLight position={[6, 11, 4]} intensity={1.1} color="#eaf2ff" />
      <directionalLight position={[-7, 4, -6]} intensity={0.5} color="#27e8f2" />

      <Environment resolution={256} frames={1}>
        <Lightformer intensity={1.0} position={[5, 6, 4]} scale={9} color="#cfe0ff" />
        <Lightformer intensity={0.7} position={[-6, 3, -4]} scale={9} color="#27e8f2" />
        <Lightformer intensity={0.45} position={[3, 2, -6]} scale={8} color="#a89eff" />
        <Lightformer intensity={0.3} position={[0, -5, 0]} scale={12} color="#0a0d10" />
      </Environment>

      <CameraRig />

      {mode === 'maquette' ? (
        <Maquette onActivate={onActivate} />
      ) : (
        <Suspense fallback={null}>
          <District />
          {twinSettled && (
            <OrbitControls
              makeDefault
              enableDamping={!reduced}
              dampingFactor={0.08}
              target={[est.target.x, est.target.y, est.target.z]}
              minDistance={20}
              maxDistance={420}
              maxPolarAngle={Math.PI * 0.49}
            />
          )}
        </Suspense>
      )}

      {/* Holographic glow — the glowing wireframe terrain, contours, point
          clouds and orbital nodes bloom against the dark matte canvas. */}
      <EffectComposer enableNormalPass={false} multisampling={4}>
        <Bloom mipmapBlur luminanceThreshold={0.5} luminanceSmoothing={0.3} intensity={0.95} radius={0.82} />
      </EffectComposer>
    </>
  );
}
