import { useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  DoubleSide,
  IcosahedronGeometry,
  type BufferGeometry,
  type Group,
  type Mesh,
  type PerspectiveCamera,
  type PointLight,
} from 'three';
import { RocketBody, ROCKET_MID } from '../scene/maquette/rocket';

// The asteroids playfield's 3D layer: the ship is the actual launch vehicle and
// the hazards are real tumbling rocks, both in a transparent canvas over the 2D
// game. The engine writes live poses into refs each frame; this reads them and
// drives the models. Pointer-events are off (see .ast__ship3d) so the 2D canvas
// underneath keeps the touch controls.
//
// The camera is PERSPECTIVE, but pinned so one world unit === one CSS pixel on
// the z=0 plane the game plays on — so the engine's screen-space maths keeps
// working untouched, while depth, foreshortening and real shading come for free.

export interface ShipView {
  x: number; // screen px
  y: number; // screen px (canvas y-down)
  a: number; // heading, radians (a = -π/2 is nose-up, matching the 2D ship)
  throttle: number; // 0→1 engine ramp (the engine spools, it doesn't switch)
  turn: number; // -1..1 current rotation input — the model banks into it
  visible: boolean;
  pop: number; // 0→1 since (re)spawn — drives the scale-in
}

/** One hazard, as the 3D layer needs it (the engine keeps the authoritative 2D
 *  state; this is a per-frame view of it). */
export interface RockView {
  x: number; // screen px
  y: number; // screen px
  r: number; // radius in px
  rot: number; // the 2D spin, radians — carried through so labels/flashes agree
  id: number; // stable per rock, picks its shape + tumble
  born: number; // 0→1 spawn-in
}

const SHIP_SCALE = 190; // world→px: model is ~0.63 tall → ~120px, so it owns the frame
const FOV = 30;
// A steady tilt on the whole playfield, applied OUTSIDE the heading rotation, so
// the vehicle is always seen a little from above whatever way it's pointing —
// that's what turns a flat silhouette into an object with a near and far side.
const TILT = 0.4; // ~23°

/** Craggy rock shapes: an icosahedron pushed around by a smooth function of the
 *  vertex DIRECTION — continuous, so the duplicated verts of the non-indexed
 *  geometry always agree and no facets tear open. Normals are then recomputed
 *  per face, which is what gives the flat, chipped-stone shading. Built once. */
function rockGeometries(n = 6): BufferGeometry[] {
  return Array.from({ length: n }, (_, k) => {
    const g = new IcosahedronGeometry(1, 1);
    const pos = g.attributes.position;
    const s = k * 1.7 + 0.6;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const d =
        1 +
        0.2 * Math.sin(2.7 * x + s) * Math.cos(2.1 * y - s) +
        0.14 * Math.sin(3.3 * z + 1.7 * s) +
        0.08 * Math.cos(4.1 * x * y + s);
      pos.setXYZ(i, x * d, y * d, z * d);
    }
    g.computeVertexNormals();
    return g;
  });
}

const ROCK_POOL = 64; // plenty: a wave's big rocks can quarter into smalls

function Rocks({ rocks, geoms }: { rocks: MutableRefObject<RockView[]>; geoms: BufferGeometry[] }) {
  const meshes = useRef<(Mesh | null)[]>([]);
  const { size } = useThree();
  useFrame((s) => {
    const list = rocks.current;
    const t = s.clock.elapsedTime;
    for (let i = 0; i < ROCK_POOL; i++) {
      const m = meshes.current[i];
      if (!m) continue;
      const rk = list[i];
      if (!rk) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      // each rock keeps its own shape for life (keyed on id, not pool slot, so
      // shapes don't shuffle when one ahead of it is destroyed)
      const geo = geoms[rk.id % geoms.length];
      if (m.geometry !== geo) m.geometry = geo;
      m.position.set(rk.x - size.width / 2, size.height / 2 - rk.y, 0);
      // tumble on all three axes — Z carries the engine's own spin so the 2D
      // label and hit-flash stay in step with the silhouette
      const k = (rk.id % 3) + 1;
      m.rotation.set(t * 0.24 * k, t * 0.19 * (4 - k), -rk.rot);
      m.scale.setScalar(rk.r * (0.72 + 0.28 * rk.born));
    }
  });
  return (
    <group>
      {Array.from({ length: ROCK_POOL }, (_, i) => (
        <mesh key={i} ref={(m) => { meshes.current[i] = m; }} visible={false} geometry={geoms[0]}>
          {/* chipped stone, but kept translucent so the hazard's name (drawn on
              the 2D canvas below) still reads straight through it */}
          <meshStandardMaterial color="#93a1ad" roughness={0.95} metalness={0.05} transparent opacity={0.62} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function Ship({ view }: { view: MutableRefObject<ShipView> }) {
  const g = useRef<Group>(null);
  const head = useRef<Group>(null);
  const pivot = useRef<Group>(null);
  const flame = useRef<Group>(null);
  const flameLight = useRef<PointLight>(null);
  const bank = useRef(0);
  const { size, camera } = useThree();
  useFrame((_, delta) => {
    const grp = g.current;
    if (!grp) return;
    // Pin the perspective frustum so 1 world unit === 1px on the z=0 play plane:
    // visible height = 2·d·tan(fov/2), so d = H / (2·tan(fov/2)). Cheap, and it
    // tracks resizes for free.
    const cam = camera as PerspectiveCamera;
    const d = size.height / (2 * Math.tan((FOV / 2) * (Math.PI / 180)));
    if (Math.abs(cam.position.z - d) > 0.5) {
      cam.position.set(0, 0, d);
      cam.far = d * 3;
      cam.updateProjectionMatrix();
    }
    const v = view.current;
    // ortho-like mapping still holds on the play plane → drop the px pose in
    grp.position.set(v.x - size.width / 2, size.height / 2 - v.y, 0);
    grp.visible = v.visible;
    // screen rotation is a+π/2 clockwise (canvas y-down); negate for +Y-up world
    if (head.current) head.current.rotation.z = -(v.a + Math.PI / 2);
    // (re)spawn pop: ease-out-back on the scale — a touch of overshoot
    const p = Math.min(1, Math.max(0, v.pop));
    const e = 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2);
    grp.scale.setScalar(SHIP_SCALE * Math.max(0.001, e));
    // bank into the turn — a roll about the long axis, eased so it settles
    if (pivot.current) {
      const k = 1 - Math.exp(-9 * Math.min(delta, 0.05));
      bank.current += (-v.turn * 0.5 - bank.current) * k;
      pivot.current.rotation.y = bank.current;
    }
    if (flame.current) {
      flame.current.visible = v.throttle > 0.03;
      const th = v.throttle;
      const f = (0.7 + Math.random() * 0.6) * (0.45 + 0.55 * th);
      flame.current.scale.set((0.9 + Math.random() * 0.2) * (0.6 + 0.4 * th), f, (0.9 + Math.random() * 0.2) * (0.6 + 0.4 * th));
    }
    // the burn washes the hull warm while the engine's lit
    if (flameLight.current) flameLight.current.intensity = (260 + Math.random() * 200) * v.throttle;
  });
  return (
    <group ref={g}>
      {/* the playfield tilt — outside the heading, so the view angle is steady */}
      <group rotation={[TILT, 0, 0]}>
        <group ref={head}>
          {/* pivot about the model's middle so it rotates in place */}
          <group ref={pivot} position={[0, -ROCKET_MID, 0]}>
            {/* The pad's vehicle is a slender 1:9 needle — right in the maquette,
                but at game size the hull is too thin to show any shading. Fatten
                the barrel (not the length) just for the game: a stubbier stack
                reads as a solid object, and the fins and legs actually register.
                Wraps the plume too, so the exhaust still matches the nozzle (the
                animated scale lives on the inner group, untouched by this). */}
            <group scale={[1.75, 1, 1.75]}>
              <RocketBody mode="lit" />
            {/* exhaust plume out of the tail (tail ≈ y 0.09), pointing −Y */}
            <group ref={flame} position={[0, 0.06, 0]} visible={false}>
              <mesh position={[0, -0.11, 0]} rotation={[Math.PI, 0, 0]}>
                <coneGeometry args={[0.03, 0.2, 12, 1, true]} />
                <meshBasicMaterial color="#ffd9a0" transparent opacity={0.85} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
              </mesh>
              {/* hot inner core */}
              <mesh position={[0, -0.075, 0]} rotation={[Math.PI, 0, 0]}>
                <coneGeometry args={[0.015, 0.12, 10, 1, true]} />
                <meshBasicMaterial color="#fff3da" transparent opacity={0.95} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
              </mesh>
              <mesh position={[0, -0.02, 0]}>
                <sphereGeometry args={[0.045, 12, 12]} />
                <meshBasicMaterial color="#ffb46a" transparent opacity={0.5} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
              </mesh>
              {/* the burn's glow on the hull (intensity driven in useFrame) */}
              <pointLight ref={flameLight} position={[0, -0.04, 0.05]} color="#ffb46a" intensity={0} decay={2} />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

export function GameRocket({ view, rocks }: { view: MutableRefObject<ShipView>; rocks: MutableRefObject<RockView[]> }) {
  const geoms = useMemo(() => rockGeometries(), []);
  return (
    <Canvas
      className="ast__ship3d"
      camera={{ fov: FOV, position: [0, 0, 1200], near: 1, far: 6000 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
    >
      {/* a real key/fill/rim rig: white key from the upper front, cool sky fill,
          and the site's cyan kept as a RIM off the far side — accent, not paint */}
      <ambientLight intensity={0.34} color="#c9d8e4" />
      <directionalLight position={[4, 6, 8]} intensity={2.2} color="#fff6e8" />
      <directionalLight position={[-5, 2, 4]} intensity={0.5} color="#27e8f2" />
      <directionalLight position={[0, -3, -6]} intensity={0.35} color="#8fd8ff" />
      <Ship view={view} />
      <Rocks rocks={rocks} geoms={geoms} />
    </Canvas>
  );
}
