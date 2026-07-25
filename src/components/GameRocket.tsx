import { useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  DoubleSide,
  IcosahedronGeometry,
  type BufferGeometry,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
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
  muzzle: number; // 1 on the shot, decaying — the nose cannon's flash
  shield: number; // 1 = up (eats the next hit), 0 = down
  shieldBreak: number; // 1 at the burst, decaying — the shell flaring as it goes
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

/** A rock just broke here — the 3D layer drains these into flying debris. */
export interface Burst {
  x: number;
  y: number;
  r: number;
  tier: number;
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
const SHARD_POOL = 96;
const DEEP_N = 11;
// The engine's wash lights the FIELD, not the vehicle: it lives alone on this
// layer, which rocks and debris opt into. Without that split, inverse-square
// over a world measured in hundreds of pixels means any intensity that reaches a
// rock 200px away has already blown the hull 60px away to white.
const FIELD_LAYER = 1;

/** The camera's small lead on the ship, shared with everything that lives on the
 *  play plane so it can cancel out (see Rig). */
const camLead = { x: 0, y: 0 };

/** The camera drifts a little way after the ship. Play-plane objects add the
 *  same offset back, so their screen positions — and therefore the 2D canvas's
 *  labels, sparks and hit-boxes — are pixel-identical. Only the deep field,
 *  sitting further away, is left to shift: real parallax off the ship's own
 *  motion, for free, with no risk to the alignment that matters. */
function Rig({ view, reduced }: { view: MutableRefObject<ShipView>; reduced: boolean }) {
  const { camera, size } = useThree();
  useFrame((_, delta) => {
    if (reduced) {
      camLead.x = 0;
      camLead.y = 0;
      return;
    }
    const v = view.current;
    const tx = (v.x - size.width / 2) * 0.06;
    const ty = -(v.y - size.height / 2) * 0.06;
    const k = 1 - Math.exp(-2.4 * Math.min(delta, 0.05)); // lags behind — it's a drift
    camLead.x += (tx - camLead.x) * k;
    camLead.y += (ty - camLead.y) * k;
    camera.position.x = camLead.x;
    camera.position.y = camLead.y;
  });
  return null;
}

/** Far-off rocks drifting behind the playfield: no collision, no labels, dark
 *  enough to read as distant mass rather than hazards. They fill the void, and
 *  because they sit at other depths they parallax against the play plane. */
function DeepField({ geoms }: { geoms: BufferGeometry[] }) {
  const meshes = useRef<(Mesh | null)[]>([]);
  const { size } = useThree();
  const field = useMemo(
    () =>
      Array.from({ length: DEEP_N }, (_, i) => ({
        fx: (i * 0.618034) % 1, // golden-ratio scatter — even, not gridded
        fy: ((i * 0.381966) % 1 + (i % 3) * 0.11) % 1,
        z: -700 - ((i * 137) % 1700),
        // sized for where they sit: the frustum shrinks them by d/(d+|z|), so
        // these land as ~20–40px specks, never mistakable for a real hazard
        s: 13 + ((i * 7) % 20),
        dx: ((i % 5) - 2) * 2.1,
        dy: ((i % 3) - 1) * 1.7,
        sp: 0.05 + (i % 4) * 0.03,
        geo: i % geoms.length,
      })),
    [geoms],
  );
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    for (let i = 0; i < field.length; i++) {
      const m = meshes.current[i];
      const f = field[i];
      if (!m) continue;
      // spread across a frustum-width that accounts for their distance, so the
      // field still covers the frame however far back they sit
      const spread = 1 + Math.abs(f.z) / 1400;
      m.position.set(
        (f.fx - 0.5) * size.width * spread + f.dx * t * 3,
        (f.fy - 0.5) * size.height * spread + f.dy * t * 3,
        f.z,
      );
      m.rotation.set(t * f.sp, t * f.sp * 0.7, t * f.sp * 0.4);
      m.scale.setScalar(f.s);
    }
  });
  return (
    <group>
      {Array.from({ length: DEEP_N }, (_, i) => (
        <mesh key={i} ref={(m) => { meshes.current[i] = m; }} geometry={geoms[field[i].geo]}>
          {/* just above the void — enough to read as mass, far too dim to be
              mistaken for a hazard you could shoot */}
          <meshStandardMaterial color="#33424f" roughness={1} metalness={0} transparent opacity={0.42} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

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
      m.position.set(rk.x - size.width / 2 + camLead.x, size.height / 2 - rk.y + camLead.y, 0);
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
        <mesh
          key={i}
          ref={(m) => { meshes.current[i] = m; if (m) m.layers.enable(FIELD_LAYER); }}
          visible={false}
          geometry={geoms[0]}
        >
          {/* chipped stone, but kept translucent so the hazard's name (drawn on
              the 2D canvas below) still reads straight through it */}
          <meshStandardMaterial color="#93a1ad" roughness={0.95} metalness={0.05} transparent opacity={0.62} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

interface Shard {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rx: number; ry: number; rz: number;
  sx: number; sy: number; sz: number; // spin
  s: number; // size
  life: number; max: number;
  geo: number;
}

/** Debris: a broken rock throws real chunks, and they fly THROUGH the play plane
 *  — some toward the camera, some away — which is the clearest depth cue in the
 *  whole game. Pooled and shrunk out, so no allocation and one shared material. */
function Debris({ bursts, geoms }: { bursts: MutableRefObject<Burst[]>; geoms: BufferGeometry[] }) {
  const meshes = useRef<(Mesh | null)[]>([]);
  const shards = useRef<Shard[]>([]);
  const next = useRef(0);
  const { size } = useThree();
  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    // drain whatever broke this frame into the pool
    const q = bursts.current;
    while (q.length) {
      const b = q.shift()!;
      const n = b.tier === 0 ? 9 : b.tier === 1 ? 6 : 4;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 150;
        const slot = next.current++ % SHARD_POOL;
        shards.current[slot] = {
          x: b.x - size.width / 2, y: size.height / 2 - b.y, z: 0,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          vz: (Math.random() - 0.5) * 260, // out of the plane, both ways
          rx: Math.random() * 6.28, ry: Math.random() * 6.28, rz: Math.random() * 6.28,
          sx: (Math.random() - 0.5) * 7, sy: (Math.random() - 0.5) * 7, sz: (Math.random() - 0.5) * 7,
          s: b.r * (0.13 + Math.random() * 0.16),
          life: 0.55 + Math.random() * 0.5, max: 0.55 + Math.random() * 0.5,
          geo: (Math.random() * geoms.length) | 0,
        };
      }
    }
    for (let i = 0; i < SHARD_POOL; i++) {
      const m = meshes.current[i];
      const sh = shards.current[i];
      if (!m) continue;
      if (!sh || sh.life <= 0) {
        m.visible = false;
        continue;
      }
      sh.life -= dt;
      const drag = Math.exp(-1.5 * dt);
      sh.vx *= drag; sh.vy *= drag; sh.vz *= drag;
      sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.z += sh.vz * dt;
      sh.rx += sh.sx * dt; sh.ry += sh.sy * dt; sh.rz += sh.sz * dt;
      const p = Math.max(0, sh.life / sh.max); // 1 → 0
      const geo = geoms[sh.geo];
      if (m.geometry !== geo) m.geometry = geo;
      m.visible = true;
      m.position.set(sh.x + camLead.x, sh.y + camLead.y, sh.z);
      m.rotation.set(sh.rx, sh.ry, sh.rz);
      // ease out of existence rather than blinking off
      m.scale.setScalar(sh.s * (p < 0.35 ? p / 0.35 : 1));
    }
  });
  return (
    <group>
      {Array.from({ length: SHARD_POOL }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => { meshes.current[i] = m; if (m) m.layers.enable(FIELD_LAYER); }}
          visible={false}
          geometry={geoms[0]}
        >
          <meshStandardMaterial color="#a8b4bf" roughness={0.9} metalness={0.05} transparent opacity={0.75} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function Ship({ view }: { view: MutableRefObject<ShipView> }) {
  const g = useRef<Group>(null); // position only, in px — lights live here too
  const scaler = useRef<Group>(null);
  const head = useRef<Group>(null);
  const pivot = useRef<Group>(null);
  const flame = useRef<Group>(null);
  const flameLight = useRef<PointLight>(null);
  const wash = useRef<PointLight | null>(null); // assigned in a ref callback (sets its layer)
  const muzzle = useRef<Mesh>(null);
  const shell = useRef<Group>(null);
  const shellFill = useRef<Mesh>(null);
  const shellWire = useRef<Mesh>(null);
  const bank = useRef(0);
  const shellK = useRef(0); // eased shield presence, so it fades in and out
  const { size, camera } = useThree();
  useFrame((s, delta) => {
    const grp = g.current;
    if (!grp) return;
    // Pin the perspective frustum so 1 world unit === 1px on the z=0 play plane:
    // visible height = 2·d·tan(fov/2), so d = H / (2·tan(fov/2)). Cheap, and it
    // tracks resizes for free.
    const cam = camera as PerspectiveCamera;
    const d = size.height / (2 * Math.tan((FOV / 2) * (Math.PI / 180)));
    if (Math.abs(cam.position.z - d) > 0.5) {
      cam.position.z = d;
      cam.far = d * 4;
      cam.updateProjectionMatrix();
    }
    const v = view.current;
    // drop the px pose in, plus the camera's lead so it cancels out on screen
    grp.position.set(v.x - size.width / 2 + camLead.x, size.height / 2 - v.y + camLead.y, 0);
    grp.visible = v.visible;
    // screen rotation is a+π/2 clockwise (canvas y-down); negate for +Y-up world
    if (head.current) head.current.rotation.z = -(v.a + Math.PI / 2);
    // (re)spawn pop: ease-out-back on the scale — a touch of overshoot
    const p = Math.min(1, Math.max(0, v.pop));
    const e = 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2);
    if (scaler.current) scaler.current.scale.setScalar(SHIP_SCALE * Math.max(0.001, e));
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
    // …and throws light out into the FIELD, so burning past a rock rakes its
    // facets warm. This is the one light that crosses between the ship and the
    // hazards, which is what makes them feel like they share a space. Big number
    // because it's inverse-square over pixels: ~0.7 on a rock 150px away.
    if (wash.current) wash.current.intensity = (16000 + Math.random() * 3000) * v.throttle;
    // nose cannon flash — a hot bloom for a frame or two after the shot
    if (muzzle.current) {
      const mz = Math.max(0, Math.min(1, v.muzzle));
      muzzle.current.visible = mz > 0.02;
      muzzle.current.scale.setScalar(0.02 + mz * 0.055);
    }
    // The shield: a faceted shell around the vehicle. It eases in when held, and
    // on the hit it flares bright and blows outward as it goes — so losing it is
    // an event you watch, not a counter ticking down.
    if (shell.current && shellFill.current && shellWire.current) {
      const brk = Math.max(0, Math.min(1, v.shieldBreak));
      const k = 1 - Math.exp(-7 * Math.min(delta, 0.05));
      shellK.current += (v.shield - shellK.current) * k;
      const held = shellK.current;
      const on = held > 0.01 || brk > 0.01;
      shell.current.visible = on;
      if (on) {
        // held: sits just off the hull, breathing. bursting: punches outward.
        shell.current.scale.setScalar(0.42 * (0.94 + 0.06 * Math.sin(s.clock.elapsedTime * 2.4) + brk * 0.55));
        shell.current.rotation.y = s.clock.elapsedTime * 0.35;
        shell.current.rotation.x = s.clock.elapsedTime * 0.22;
        const fill = shellFill.current.material as MeshBasicMaterial;
        const wire = shellWire.current.material as MeshBasicMaterial;
        fill.opacity = 0.055 * held + 0.3 * brk;
        wire.opacity = 0.16 * held + 0.75 * brk;
      }
    }
  });
  return (
    <group ref={g}>
      {/* the engine's wash, in world (pixel) units so its reach is predictable.
          layers.set(FIELD_LAYER) so it lights only the rocks and debris. */}
      <pointLight
        ref={(l) => { wash.current = l; if (l) l.layers.set(FIELD_LAYER); }}
        position={[0, -40, 70]}
        color="#ff9d5c"
        intensity={0}
        distance={620}
        decay={2}
      />
      <group ref={scaler}>
        {/* The shield shell, outside the heading group so it doesn't spin with the
            vehicle: a faint faceted bubble in the site's own wireframe language,
            sitting just off the hull. Centred on the model's middle (the pivot
            offsets the body by -ROCKET_MID), so a plain sphere encloses it. */}
        <group ref={shell} visible={false}>
          <mesh ref={shellFill}>
            <icosahedronGeometry args={[1, 2]} />
            <meshBasicMaterial color="#8ff4fb" transparent opacity={0} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
          </mesh>
          <mesh ref={shellWire}>
            <icosahedronGeometry args={[1.005, 1]} />
            <meshBasicMaterial color="#27e8f2" wireframe transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
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
              {/* muzzle flash at the nose tip (nose ≈ y 0.72 in model space) */}
              <mesh ref={muzzle} position={[0, 0.74, 0]} visible={false}>
                <sphereGeometry args={[1, 10, 10]} />
                <meshBasicMaterial color="#d8fbff" transparent opacity={0.8} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

export function GameRocket({
  view,
  rocks,
  bursts,
  reduced = false,
}: {
  view: MutableRefObject<ShipView>;
  rocks: MutableRefObject<RockView[]>;
  bursts: MutableRefObject<Burst[]>;
  reduced?: boolean;
}) {
  const geoms = useMemo(() => rockGeometries(), []);
  return (
    <Canvas
      className="ast__ship3d"
      camera={{ fov: FOV, position: [0, 0, 1200], near: 1, far: 8000 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
    >
      {/* a real key/fill/rim rig: white key from the upper front, cool sky fill,
          and the site's cyan kept as a RIM off the far side — accent, not paint */}
      <ambientLight intensity={0.34} color="#c9d8e4" />
      <directionalLight position={[4, 6, 8]} intensity={2.2} color="#fff6e8" />
      <directionalLight position={[-5, 2, 4]} intensity={0.5} color="#27e8f2" />
      <directionalLight position={[0, -3, -6]} intensity={0.35} color="#8fd8ff" />
      <Rig view={view} reduced={reduced} />
      <DeepField geoms={geoms} />
      <Ship view={view} />
      <Rocks rocks={rocks} geoms={geoms} />
      <Debris bursts={bursts} geoms={geoms} />
    </Canvas>
  );
}
