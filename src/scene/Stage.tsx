import { Suspense } from 'react';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { useSceneSelector } from './store';
import { resolvePlace } from '../data/places';
import { twinEstablishing, type Hotspot } from './framing';
import { CameraRig } from './CameraRig';
import { Maquette } from './Maquette';
import { District } from './District';

// In-canvas scene root. One renderer, two scenes (§6): the maquette and the
// twin are never mounted at once — the camera move bridges them. Lighting is a
// procedural Lightformer environment (no external HDR fetch, so nothing for a
// corporate firewall to block — §12), giving the soft "model on a desk" look.

export function Stage({ onActivate }: { onActivate: (h: Hotspot) => void }) {
  const mode = useSceneSelector((s) => s.mode);
  const placeId = useSceneSelector((s) => s.placeId);
  const twinSettled = useSceneSelector((s) => s.twinSettled);
  const place = resolvePlace(placeId);
  const est = twinEstablishing(place.view);

  return (
    <>
      <color attach="background" args={['#f7f6f2']} />
      <hemisphereLight intensity={0.55} color="#ffffff" groundColor="#d8d4c8" />
      <directionalLight position={[6, 11, 4]} intensity={0.85} color="#fff6ec" />

      <Environment resolution={256} frames={1}>
        <Lightformer intensity={1.2} position={[4, 6, 4]} scale={9} color="#ffffff" />
        <Lightformer intensity={0.5} position={[-5, 3, -3]} scale={9} color="#e8eef0" />
        <Lightformer intensity={0.6} position={[0, -4, 0]} scale={12} color="#d8d4c8" />
      </Environment>

      <CameraRig />

      {mode === 'maquette' ? (
        <>
          <Maquette onActivate={onActivate} />
          <ContactShadows
            position={[0, -1.55, 0]}
            scale={13}
            blur={2.6}
            opacity={0.32}
            far={6}
            frames={1}
            color="#1b2a2e"
          />
        </>
      ) : (
        <Suspense fallback={null}>
          <District />
          <ContactShadows
            position={[0, 0, 0]}
            scale={Math.max(160, place.view.distance * 1.3)}
            blur={2.4}
            opacity={0.22}
            far={60}
            frames={1}
            color="#1b2a2e"
          />
          {twinSettled && (
            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.08}
              target={[est.target.x, est.target.y, est.target.z]}
              minDistance={20}
              maxDistance={420}
              maxPolarAngle={Math.PI * 0.49}
            />
          )}
        </Suspense>
      )}
    </>
  );
}
