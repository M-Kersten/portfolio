import { useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, DoubleSide, type Group, type OrthographicCamera } from 'three';
import { RocketBody, ROCKET_MID } from '../scene/maquette/rocket';

// The asteroids ship, rendered as the actual 3D launch vehicle in a transparent
// canvas layered over the 2D game. The game engine writes the ship's live pose
// into `view` each frame; this reads it and drives the model. Pointer-events are
// off (see .ast__ship3d) so the 2D canvas underneath keeps the touch controls.

export interface ShipView {
  x: number; // screen px
  y: number; // screen px (canvas y-down)
  a: number; // heading, radians (a = -π/2 is nose-up, matching the 2D ship)
  thrust: boolean;
  visible: boolean;
}

const SHIP_SCALE = 78; // world→px: model is ~0.63 tall → ~49px, reads clearly on black

function Ship({ view }: { view: MutableRefObject<ShipView> }) {
  const g = useRef<Group>(null);
  const flame = useRef<Group>(null);
  const { size, camera } = useThree();
  useFrame(() => {
    const grp = g.current;
    if (!grp) return;
    // Pin the ortho frustum to the canvas in CSS pixels ourselves, so 1 world
    // unit === 1px regardless of how R3F auto-configures the camera. Cheap, and
    // it tracks resizes for free.
    const cam = camera as OrthographicCamera;
    if (cam.left !== -size.width / 2) {
      cam.left = -size.width / 2;
      cam.right = size.width / 2;
      cam.top = size.height / 2;
      cam.bottom = -size.height / 2;
      cam.updateProjectionMatrix();
    }
    const v = view.current;
    // ortho world is centred, +Y up → map the screen-px ship pose in
    grp.position.set(v.x - size.width / 2, size.height / 2 - v.y, 0);
    // screen rotation is a+π/2 clockwise (canvas y-down); negate for +Y-up world
    grp.rotation.z = -(v.a + Math.PI / 2);
    grp.visible = v.visible;
    if (flame.current) {
      flame.current.visible = v.thrust;
      const f = 0.7 + Math.random() * 0.6;
      flame.current.scale.set(0.9 + Math.random() * 0.2, f, 0.9 + Math.random() * 0.2);
    }
  });
  return (
    <group ref={g} scale={SHIP_SCALE}>
      {/* pivot about the model's middle so it rotates in place */}
      <group position={[0, -ROCKET_MID, 0]}>
        <RocketBody mode="lit" />
        {/* exhaust plume out of the tail (tail ≈ y 0.09), pointing −Y */}
        <group ref={flame} position={[0, 0.06, 0]} visible={false}>
          <mesh position={[0, -0.11, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.03, 0.2, 12, 1, true]} />
            <meshBasicMaterial color="#ffd9a0" transparent opacity={0.85} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
          </mesh>
          <mesh position={[0, -0.02, 0]}>
            <sphereGeometry args={[0.045, 12, 12]} />
            <meshBasicMaterial color="#ffb46a" transparent opacity={0.5} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export function GameRocket({ view }: { view: MutableRefObject<ShipView> }) {
  return (
    <Canvas
      className="ast__ship3d"
      orthographic
      camera={{ position: [0, 0, 100], near: 0.1, far: 400, zoom: 1 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 6]} intensity={1.3} color="#eaf6ff" />
      <directionalLight position={[-4, 1, 3]} intensity={0.6} color="#27e8f2" />
      <Ship view={view} />
    </Canvas>
  );
}
