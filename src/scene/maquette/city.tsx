// The CITY layer (top) — GIS & location work. A skyline with lit windows, the
// windmill (DTT), the park with the ARCam tower viewer (ARCam), and the
// central skyscraper (Alliander), plus roads, power lines, ducks and a
// constellation. CityRig at the bottom composes and places everything.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, Html } from '@react-three/drei';
import { AdditiveBlending, Box3, CatmullRomCurve3, Color, DoubleSide, Euler, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Shape, ShapeGeometry, TubeGeometry, Vector3, type Group, type Mesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useTweak } from '../devTweak';
import { useSceneSelector } from '../store';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { asset } from '../../lib/asset';
import { NEUTRAL, GLASS, useAccent, circlePts, roundedRectPts, smoothCurve, makeRand, Line, useActive, bounceObject, type V3 } from './shared';
import { GHOST_FILL, GHOST_LINE, LifeGroup } from './life';
import { glassRim, GlassMat, LiveGlassMat } from './materials';

function WindowDriver({ mat }: { mat: MeshStandardMaterial }) {
  const { hovered, visited } = useActive('alliander-hololens');
  // Every hotspot visited -> the whole city stays lit ("all systems live").
  const complete = useSceneSelector((s) => s.completedAt !== null);
  const reduced = useReducedMotion();
  const k = useRef(0);
  useFrame((s) => {
    const kT = hovered || complete ? 1 : visited ? 0.5 : 0;
    k.current += (kT - k.current) * 0.09;
    const t = s.clock.elapsedTime;
    const flick = reduced ? 1 : 0.82 + 0.18 * Math.sin(t * 26) * Math.sin(t * 6.3);
    mat.emissiveIntensity = k.current * 1.1 * flick;
    mat.opacity = 0.08 + k.current * 0.6;
  });
  return null;
}

/* ---------- shape helpers ---------- */
/** A square diorama building (glass fill, neutral edges). When given a shared
 *  `winMat`, it grows a grid of windows on its two camera-facing sides that
 *  light up when the town hall is hovered. */
function Building({ x, z, w, d, h, winMat }: { x: number; z: number; w: number; d: number; h: number; winMat?: MeshStandardMaterial }) {
  // Every window shares one material and one unit-plane geometry, so the whole
  // grid collapses into a single instanced draw call instead of one mesh per
  // pane (a tall tower is ~40 panes). Position, facing and size are baked into
  // each instance's matrix.
  const windows = useMemo(() => {
    if (!winMat) return [] as { p: V3; ry: number; s: [number, number] }[];
    const out: { p: V3; ry: number; s: [number, number] }[] = [];
    const rows = Math.max(1, Math.floor((h - 0.06) / 0.11));
    for (let r = 0; r < rows; r++) {
      const yy = 0.09 + r * 0.11;
      if (yy > h - 0.05) break;
      for (const c of [-1, 1]) {
        out.push({ p: [c * w * 0.22, yy, d / 2 + 0.004], ry: 0, s: [w * 0.26, 0.05] });
        out.push({ p: [w / 2 + 0.004, yy, c * d * 0.22], ry: Math.PI / 2, s: [d * 0.26, 0.05] });
      }
    }
    return out;
  }, [w, d, h, winMat]);
  const winRef = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const im = winRef.current;
    if (!im || windows.length === 0) return;
    const mtx = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    const p = new Vector3();
    const s = new Vector3();
    windows.forEach((win, i) => {
      p.set(win.p[0], win.p[1], win.p[2]);
      q.setFromEuler(e.set(0, win.ry, 0));
      s.set(win.s[0], win.s[1], 1);
      im.setMatrixAt(i, mtx.compose(p, q, s));
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere(); // so building-level frustum culling stays correct
  }, [windows]);
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <GlassMat opacity={0.3} />
        <Edges threshold={20} color={NEUTRAL} />
      </mesh>
      {windows.length > 0 && (
        <instancedMesh ref={winRef} args={[undefined, undefined, windows.length]} material={winMat}>
          <planeGeometry args={[1, 1]} />
        </instancedMesh>
      )}
    </group>
  );
}

/** A Dutch windmill (smock mill). The sails are still at idle; hovering its
 *  hotspot (DTT Amsterdam) turns them slowly, selecting spins them up fast, and
 *  once it's been opened they keep turning. The body solidifies once visited. */
function Windmill({ position, slug }: { position: V3; slug?: string }) {
  const sails = useRef<Group>(null);
  const popRef = useRef<Group>(null);
  const reduced = useReducedMotion();
  const { hovered, selected, visited } = useActive(slug ?? '');
  const spin = useRef(0);
  useFrame((_s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta);
    // still at idle; turns slowly once engaged (hover or select) and keeps turning
    // once opened — no fast spin-up on select
    const target = hovered || selected || visited ? 0.9 : 0;
    spin.current += (target - spin.current) * 0.04;
    if (sails.current && !reduced) sails.current.rotation.z += delta * spin.current;
  });
  return (
    <group position={position}>
      <group ref={popRef}>
      {/* grassy mound */}
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.24, 0.3, 0.06, 20]} />
        <GlassMat color="#2f8a6e" opacity={0.18} />
      </mesh>
      {/* tapered octagonal body */}
      <mesh position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.12, 0.19, 0.56, 8]} />
        <LiveGlassMat slug={slug ?? ''} opacity={0.44} />
        <Edges threshold={20} color={NEUTRAL} />
      </mesh>
      {/* cap */}
      <mesh position={[0, 0.67, 0]}>
        <coneGeometry args={[0.15, 0.16, 8]} />
        <GlassMat opacity={0.3} />
        <Edges threshold={20} color={NEUTRAL} />
      </mesh>
      {/* sails — a turning cross on the front face; they spin up when engaged */}
      <group ref={sails} position={[0, 0.62, 0.19]}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <mesh position={[0, 0.24, 0]}>
              <boxGeometry args={[0.05, 0.46, 0.01]} />
              <GlassMat color="#3f8f8a" opacity={0.34} />
              <Edges threshold={30} color={NEUTRAL} />
            </mesh>
          </group>
        ))}
      </group>
      </group>
    </group>
  );
}

/** A stylised pine — three stacked faceted cones over a short trunk stub (the
 *  stub ends below the lowest tier's skirt, so nothing shows through the
 *  leaves). Quiet teal at rest; greens up once the park has been visited. */
const PINE_TIERS: [number, number, number][] = [
  // y centre, radius, height — fractions of the tree height
  [0.3, 0.36, 0.44],
  [0.55, 0.27, 0.36],
  [0.78, 0.18, 0.3],
];
function ParkTree({ position, h = 0.45, yaw = 0, slug }: { position: V3; h?: number; yaw?: number; slug?: string }) {
  const { selected, visited } = useActive(slug ?? '');
  const live = useRef(0);
  const restCol = useMemo(() => new Color('#3f7d72'), []); // muted teal-green at rest
  const vivid = useMemo(() => new Color('#62c265'), []); // lifelike leaf green once visited
  const mat = useMemo(() => {
    const m = new MeshStandardMaterial({ color: '#3f7d72', flatShading: true, roughness: 0.7, metalness: 0, transparent: true, opacity: 0.45 });
    m.userData.lifeSkip = true; // greens up itself once visited
    return m;
  }, []);
  useFrame(() => {
    if (!slug) return;
    live.current += ((selected || visited ? 1 : 0) - live.current) * 0.06;
    mat.color.copy(restCol).lerp(vivid, live.current);
    mat.opacity = 0.45 + live.current * 0.35;
  });
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <mesh position={[0, h * 0.05, 0]}>
        <cylinderGeometry args={[h * 0.022, h * 0.03, h * 0.1, 6]} />
        <GlassMat color="#6a7a72" opacity={0.5} />
      </mesh>
      {PINE_TIERS.map(([y, r, th], i) => (
        <mesh key={i} position={[0, h * y, 0]} material={mat}>
          <coneGeometry args={[h * r, h * th, 6]} />
        </mesh>
      ))}
    </group>
  );
}

/** Fireflies over the park — soft green sparks that wander and blink. A faint
 *  few while the park is dormant; visiting it brings them out properly. */
const FLY_COUNT = 9;
function Fireflies({ slug }: { slug?: string }) {
  const { selected, visited } = useActive(slug ?? '');
  const reduced = useReducedMotion();
  const live = useRef(0);
  const flies = useRef<(Mesh | null)[]>([]);
  const seeds = useMemo(() => {
    const rand = makeRand(97);
    return Array.from({ length: FLY_COUNT }, () => ({
      x: (rand() - 0.5) * 0.8,
      z: (rand() - 0.5) * 0.8,
      y: 0.1 + rand() * 0.22,
      p: rand() * Math.PI * 2,
      s: 0.5 + rand() * 0.9,
    }));
  }, []);
  useFrame((st) => {
    live.current += ((selected || visited ? 1 : 0) - live.current) * 0.05;
    const t = st.clock.elapsedTime;
    seeds.forEach((sd, i) => {
      const m = flies.current[i];
      if (!m) return;
      if (reduced) {
        m.position.set(sd.x, sd.y, sd.z);
        m.scale.setScalar(0.6 * (0.25 + live.current * 0.75));
        return;
      }
      m.position.set(
        sd.x + Math.sin(t * 0.24 * sd.s + sd.p) * 0.07,
        sd.y + Math.sin(t * 0.5 * sd.s + sd.p * 2.1) * 0.035,
        sd.z + Math.cos(t * 0.31 * sd.s + sd.p) * 0.07,
      );
      const blink = Math.max(0, Math.sin(t * (1.1 + sd.s) + sd.p * 3));
      m.scale.setScalar(blink * (0.25 + live.current * 0.75));
    });
  });
  return (
    <group>
      {Array.from({ length: FLY_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            flies.current[i] = m;
          }}
        >
          <sphereGeometry args={[0.009, 8, 6]} />
          <meshBasicMaterial userData={{ lifeSkip: true }} color="#9fe8b0" transparent opacity={0.85} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Two little ducks drifting lazy loops on the lake (lake-local coordinates).
 *  They ghost and solidify with the rest of the park. */
function LakeDucks() {
  const reduced = useReducedMotion();
  const ducks = useRef<(Group | null)[]>([]);
  useFrame((st) => {
    const t = reduced ? 0 : st.clock.elapsedTime;
    for (let i = 0; i < 2; i++) {
      const g = ducks.current[i];
      if (!g) continue;
      const dir = i ? -1 : 1;
      const a = t * 0.14 * dir + i * 2.4;
      const rx = 0.095;
      const rz = 0.062;
      g.position.set(0.02 + Math.cos(a) * rx, 0.026, -0.015 + Math.sin(a) * rz);
      // point the beak along the direction of travel
      const vx = -Math.sin(a) * rx * dir;
      const vz = Math.cos(a) * rz * dir;
      g.rotation.y = Math.atan2(-vz, vx);
    }
  });
  return (
    <group>
      {[0, 1].map((i) => (
        <group
          key={i}
          ref={(g) => {
            ducks.current[i] = g;
          }}
        >
          <mesh scale={[1.3, 0.75, 1]}>
            <sphereGeometry args={[0.014, 10, 8]} />
            <GlassMat color="#cfc49e" opacity={0.55} />
          </mesh>
          <mesh position={[0.014, 0.012, 0]}>
            <sphereGeometry args={[0.008, 8, 6]} />
            <GlassMat color="#cfc49e" opacity={0.6} />
          </mesh>
          <mesh position={[0.024, 0.012, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.003, 0.008, 6]} />
            <GlassMat color="#e8b64f" opacity={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Soft rounded box (furniture, the chip package). Optional top outline. With a
 *  `liveSlug` its glass solidifies once that hotspot is visited; furniture that
 *  shouldn't rest as a ghost also passes `liveGhost={false}`. */
/* ---------- City — GIS & location (top) ---------- */
/** An organic closed outline (a wobbly ring) for a natural lake shoreline. */
function blobPts(r: number, wobble: number, seg = 48, seed = 7): V3[] {
  const rnd = makeRand(seed);
  const k = 7;
  const offs = Array.from({ length: k }, () => 1 + (rnd() - 0.5) * wobble);
  const pts: V3[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const f = (a / (Math.PI * 2)) * k;
    const i0 = Math.floor(f) % k;
    const t = f - Math.floor(f);
    const rr = r * (offs[i0] * (1 - t) + offs[(i0 + 1) % k] * t);
    pts.push([Math.cos(a) * rr, 0, Math.sin(a) * rr]);
  }
  return pts;
}

/** The park's AR tower viewer — the ARCam installation, loaded from the real
 *  model at public/models/binoculars.gltf (single self-contained mesh). It's
 *  normalised at load — the same frosted glass as the buildings and windmill,
 *  stood on the ground, scaled to viewer height — and keeps the behaviour of
 *  the old build: hidden until the ARCam hotspot is selected, then pops in
 *  with a spring and pans left↔right scanning the scene. Taking a picture
 *  flashes only the viewfinder screen: a separate plane parked on the model
 *  (tweak BINOS_SCREEN_* below to fit it to the display). */
const BINOS_H = 0.22; // world height the model is normalised to
// The screen plane, in the viewer's local space (feet at y=0, height BINOS_H).
const BINOS_SCREEN_POS: V3 = [0, 0.15, -0.01];
const BINOS_SCREEN_ROT: V3 = [0, 0, 0];
const BINOS_SCREEN_SIZE: [number, number] = [0.07, 0.075];
// A simple post the viewer stands on — raise BINOS_STAND_H to lift it higher.
const BINOS_STAND_H = 0.14;
const BINOS_STAND_R = 0.02;
function Binoculars({ position, rotationY = 0, slug }: { position: V3; rotationY?: number; slug?: string }) {
  const { selected, visited } = useActive(slug ?? '');
  const reduced = useReducedMotion();
  const popRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const k = useRef(0); // pop-in scale progress
  const vel = useRef(0);
  const flash = useRef(0); // camera-flash level, decays each frame
  const lastShot = useRef(0);
  const screenMat = useRef<MeshStandardMaterial>(null);
  const [model, setModel] = useState<Group | null>(null);

  // The frosted glass shared by the buildings + windmill — the model and the
  // post it stands on both wear it, so they read as one object.
  const glass = useMemo(() => {
    const m = new MeshStandardMaterial({
      color: GLASS,
      transparent: true,
      opacity: 0.5,
      roughness: 0.34,
      metalness: 0,
      emissive: '#0c2a30',
      emissiveIntensity: 0.14,
      depthWrite: false,
    });
    m.onBeforeCompile = glassRim;
    return m;
  }, []);
  useEffect(() => () => glass.dispose(), [glass]);

  useEffect(() => {
    let cancelled = false;
    new GLTFLoader().load(
      asset('/models/binoculars.gltf'),
      (g) => {
        if (cancelled) return;
        const scene = g.scene;
        scene.traverse((o) => {
          const mesh = o as Mesh;
          if ((mesh as { isMesh?: boolean }).isMesh) mesh.material = glass;
        });
        // normalise: viewer height, feet on the ground, centred on its footprint
        const box = new Box3().setFromObject(scene);
        const size = new Vector3();
        box.getSize(size);
        scene.scale.setScalar(BINOS_H / (size.y || 1));
        box.setFromObject(scene);
        scene.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
        setModel(scene);
      },
      undefined,
      () => {}, // absent model → the viewer simply never pops in
    );
    return () => {
      cancelled = true;
    };
  }, [glass]);

  useFrame((s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    // Once brought to life it keeps working — it goes on panning and snapping
    // photos after you deselect it, for as long as it's "alive" this session.
    const live = selected || visited;
    const target = live ? 1 : 0;
    if (reduced) {
      k.current = target;
      vel.current = 0;
    } else {
      // a spring toward the target → a pop-in with a little overshoot
      vel.current += ((target - k.current) * 170 - vel.current * 19) * dt;
      k.current += vel.current * dt;
    }
    const pop = popRef.current;
    if (pop) {
      const sc = Math.max(0, k.current);
      pop.scale.setScalar(sc);
      pop.visible = sc > 0.002;
    }
    const head = headRef.current;
    if (!reduced && live && k.current > 0.55) {
      // sweep left↔right; snap a photo at each extreme
      const ph = s.clock.elapsedTime * 0.95;
      if (head) head.rotation.y = Math.sin(ph) * 0.6;
      const shot = Math.floor((ph - Math.PI / 2) / Math.PI);
      if (shot !== lastShot.current) {
        lastShot.current = shot;
        flash.current = 1;
      }
    } else if (head) {
      head.rotation.y += (0 - head.rotation.y) * 0.1; // settle back to centre
    }
    flash.current = Math.max(0, flash.current - dt * 3.4);
    // the viewfinder is a transparent glass panel at rest, flaring bright on a shot
    if (screenMat.current) {
      screenMat.current.emissiveIntensity = 0.15 + flash.current * 3.8;
      screenMat.current.opacity = 0.18 + flash.current * 0.75;
    }
  });

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <group ref={popRef} visible={false}>
        {/* the frosted-glass post it stands on (doesn't pan with the head) */}
        <mesh position={[0, BINOS_STAND_H / 2, 0]}>
          <cylinderGeometry args={[BINOS_STAND_R * 0.86, BINOS_STAND_R, BINOS_STAND_H, 20]} />
          <primitive object={glass} attach="material" />
        </mesh>
        {/* the viewer head, lifted onto the post; pans + snaps photos */}
        <group ref={headRef} position={[0, BINOS_STAND_H, 0]}>
          {model && <primitive object={model} />}
          {/* the viewfinder screen — a transparent glass panel that flares on a shot */}
          {model && (
            <mesh position={BINOS_SCREEN_POS} rotation={BINOS_SCREEN_ROT}>
              <planeGeometry args={BINOS_SCREEN_SIZE} />
              <meshStandardMaterial
                ref={screenMat}
                userData={{ lifeSkip: true }}
                color={GLASS}
                emissive="#dff6ff"
                emissiveIntensity={0.15}
                transparent
                opacity={0.18}
                depthWrite={false}
                toneMapped={false}
                side={DoubleSide}
              />
            </mesh>
          )}
        </group>
      </group>
    </group>
  );
}

function Park({ position, slug }: { position: V3; slug?: string }) {
  const { accent } = useAccent();
  const { selected, visited } = useActive(slug ?? '');
  const live = selected || visited;
  const reduced = useReducedMotion();
  const popRef = useRef<Group>(null);
  // an irregular lake outline + its filled water shape
  const lake = useMemo(() => {
    const pts = blobPts(0.2, 0.5, 56, 13);
    const shape = new Shape();
    shape.moveTo(pts[0][0], pts[0][2]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][2]);
    return { geo: new ShapeGeometry(shape), shore: pts.map((p) => [p[0], 0, -p[2]] as V3) };
  }, []);
  useFrame((_s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta, 0.14);
  });
  return (
    <group position={position}>
      <group ref={popRef}>
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.02, 44]} />
        <LiveGlassMat slug="arcam" color="#2f8a6e" opacity={0.15} />
      </mesh>
      <Line points={circlePts(0.5)} position={[0, 0.024, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.4} />
      {/* lake — an irregular water body with shore, ripples, a jetty + reeds */}
      <group position={[-0.14, 0, 0.18]}>
        <mesh geometry={lake.geo} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <LiveGlassMat slug="arcam" color="#27557d" opacity={0.4} />
        </mesh>
        {/* lighter shallows */}
        <mesh position={[0.03, 0.025, -0.02]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.1, 28]} />
          <LiveGlassMat slug="arcam" color="#4a96c0" opacity={0.3} />
        </mesh>
        {/* shoreline */}
        <Line points={lake.shore} position={[0, 0.03, 0]} color={live ? '#5fc4ff' : accent} lineWidth={1.2} transparent opacity={0.6} />
        {/* ripples */}
        <Line points={circlePts(0.06, 22)} position={[-0.03, 0.032, 0.02]} color={live ? '#7fd0ff' : NEUTRAL} lineWidth={1} transparent opacity={0.4} />
        <Line points={circlePts(0.035, 18)} position={[0.06, 0.032, -0.04]} color={live ? '#7fd0ff' : NEUTRAL} lineWidth={1} transparent opacity={0.35} />
        {/* a little jetty over the water */}
        <group position={[0.13, 0, -0.07]} rotation={[0, -0.5, 0]}>
          <mesh position={[0, 0.045, 0]}>
            <boxGeometry args={[0.13, 0.012, 0.035]} />
            <GlassMat color="#9a7150" opacity={0.55} />
            <Edges threshold={30} color={NEUTRAL} />
          </mesh>
          {[-0.05, 0.04].map((px, i) => (
            <mesh key={i} position={[px, 0.022, 0.013]}>
              <cylinderGeometry args={[0.005, 0.005, 0.05, 6]} />
              <GlassMat color="#9a7150" opacity={0.5} />
            </mesh>
          ))}
        </group>
        {/* reeds at the far edge */}
        {([[-0.16, 0.03], [-0.185, -0.02], [-0.15, -0.06]] as [number, number][]).map(([rx, rz], i) => (
          <mesh key={`r${i}`} position={[rx, 0.06, rz]} rotation={[0.12 * (i - 1), 0, 0.13]}>
            <cylinderGeometry args={[0.003, 0.005, 0.11, 5]} />
            <meshStandardMaterial color="#5f8a52" roughness={0.8} />
          </mesh>
        ))}
        {/* lily pads */}
        {([[0.07, 0.06], [-0.02, -0.08]] as [number, number][]).map(([lx, lz], i) => (
          <mesh key={`l${i}`} position={[lx, 0.028, lz]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.022, 12]} />
            <meshStandardMaterial color="#3f7d52" roughness={0.7} side={DoubleSide} />
          </mesh>
        ))}
        {/* two ducks drifting their lazy loops */}
        <LakeDucks />
      </group>
      {/* a small varied grove — each pine at its own height and turn */}
      <ParkTree position={[0.2, 0, -0.18]} h={0.46} yaw={0.4} slug={slug} />
      <ParkTree position={[0.24, 0, 0.22]} h={0.34} yaw={2.1} slug={slug} />
      <ParkTree position={[-0.22, 0, -0.24]} h={0.4} yaw={1.2} slug={slug} />
      <ParkTree position={[0.4, 0, 0.04]} h={0.3} yaw={3.6} slug={slug} />
      <ParkTree position={[-0.04, 0, -0.42]} h={0.36} yaw={5.1} slug={slug} />
      {/* fireflies wandering between the trees */}
      <Fireflies slug={slug} />
      {/* the ARCam tower viewer — pops in and scans when the hotspot is selected;
          stands on its post (raise BINOS_STAND_H to lift it higher) */}
      <Binoculars position={[-0.1, 0, 0.34]} rotationY={-0.35} slug={slug} />
      </group>
    </group>
  );
}

// The city's centrepiece — a slender, continuously tapering octagonal glass
// tower (one frustum shaft, not stacked blocks) with full-height mullion fins
// running the edges, a few floor bands that glow when engaged (the shared
// winMat, ramped by WindowDriver) and a tapered crown with a slow-pulsing
// beacon. Carries the Alliander hotspot; same GlassMat language as the rest of
// the scene, via LiveGlassMat so the shaft solidifies once visited.
const TOWER_H = 0.78;
const TOWER_R_BOT = 0.145;
const TOWER_R_TOP = 0.115; // only a gentle taper — reads as a vertical tower, not a cone
const TOWER_SIDES = 8;

function Skyscraper({ position, winMat }: { position: V3; winMat?: MeshStandardMaterial }) {
  const { accent } = useAccent();
  const { selected, visited } = useActive('alliander-hololens');
  const beacon = useRef<MeshStandardMaterial>(null);
  const reduced = useReducedMotion();
  const popRef = useRef<Group>(null);
  const lifeK = useRef(0);
  const accentC = useMemo(() => new Color(accent), [accent]);
  // mullion fins hug the taper: each runs base-radius → top-radius up one edge
  const finL = Math.hypot(TOWER_R_BOT - TOWER_R_TOP, TOWER_H);
  const finTilt = Math.atan2(TOWER_R_BOT - TOWER_R_TOP, TOWER_H);
  const finR = (TOWER_R_BOT + TOWER_R_TOP) / 2;
  const rAt = (y: number) => TOWER_R_BOT + (TOWER_R_TOP - TOWER_R_BOT) * (y / TOWER_H);
  useFrame((s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta, 0.18);
    if (!beacon.current) return;
    const t = reduced ? 0 : s.clock.elapsedTime;
    // the beacon barely smoulders on the ghost tower; it starts pulsing in
    // colour once the visitor has brought the tower to life
    lifeK.current += ((selected || visited ? 1 : 0) - lifeK.current) * 0.08;
    beacon.current.color.copy(GHOST_FILL).lerp(accentC, lifeK.current);
    beacon.current.emissive.copy(GHOST_FILL).lerp(accentC, lifeK.current);
    beacon.current.emissiveIntensity = (0.45 + 0.55 * Math.abs(Math.sin(t * 2.1))) * (0.14 + 0.86 * lifeK.current);
  });
  return (
    <group position={position}>
      <group ref={popRef}>
        {/* one continuous tapered octagonal shaft — the same frosted glass as
            the rest of the scene, set apart by its shape; ghost grey until the
            hotspot is visited, then it solidifies */}
        <mesh position={[0, TOWER_H / 2, 0]}>
          <cylinderGeometry args={[TOWER_R_TOP, TOWER_R_BOT, TOWER_H, TOWER_SIDES]} />
          <LiveGlassMat slug="alliander-hololens" opacity={0.34} />
          <Edges threshold={15} color={NEUTRAL} />
        </mesh>
        {/* full-height mullion fins along the eight edges */}
        {Array.from({ length: TOWER_SIDES }).map((_, i) => (
          <group key={i} rotation={[0, (i / TOWER_SIDES) * Math.PI * 2, 0]}>
            <mesh position={[finR, TOWER_H / 2, 0]} rotation={[0, 0, finTilt]}>
              <boxGeometry args={[0.016, finL, 0.02]} />
              <meshStandardMaterial color={NEUTRAL} emissive={NEUTRAL} emissiveIntensity={0.18} roughness={0.4} metalness={0.3} />
            </mesh>
          </group>
        ))}
        {/* floor bands wrap the shaft — faint at rest, glow when engaged */}
        {winMat &&
          [0.24, 0.42, 0.58].map((f, i) => {
            const y = TOWER_H * f;
            const r = rAt(y) + 0.004;
            return (
              <mesh key={i} position={[0, y, 0]} material={winMat}>
                <cylinderGeometry args={[r, r, 0.02, TOWER_SIDES, 1, true]} />
              </mesh>
            );
          })}
        {/* crown: a short tapered mechanical cap (flat top), then a thin antenna
            mast + a slow-pulsing beacon — a tower crown, not a spike */}
        <mesh position={[0, TOWER_H + 0.05, 0]}>
          <cylinderGeometry args={[0.055, TOWER_R_TOP, 0.1, TOWER_SIDES]} />
          <LiveGlassMat slug="alliander-hololens" opacity={0.34} />
          <Edges threshold={15} color={NEUTRAL} />
        </mesh>
        <mesh position={[0, TOWER_H + 0.15, 0]}>
          <cylinderGeometry args={[0.004, 0.004, 0.1, 8]} />
          <meshStandardMaterial color={NEUTRAL} metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, TOWER_H + 0.21, 0]}>
          <sphereGeometry args={[0.014, 12, 12]} />
          <meshStandardMaterial ref={beacon} userData={{ lifeSkip: true }} color={accent} emissive={accent} emissiveIntensity={0.6} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** A flat ground ribbon built from a centre-line — reads as a paved road (a
 *  faint surface with crisp edges) rather than a single hairline. */
function roadRibbon(points: V3[], width: number) {
  const half = width / 2;
  const left: V3[] = [];
  const right: V3[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const tx = b[0] - a[0];
    const tz = b[2] - a[2];
    const len = Math.hypot(tx, tz) || 1;
    const px = -tz / len;
    const pz = tx / len; // perpendicular in the ground plane
    left.push([p[0] + px * half, p[1], p[2] + pz * half]);
    right.push([p[0] - px * half, p[1], p[2] - pz * half]);
  }
  const verts: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    verts.push(...left[i], ...right[i], ...left[i + 1]);
    verts.push(...right[i], ...right[i + 1], ...left[i + 1]);
  }
  return { array: new Float32Array(verts), left, right };
}

function RoadRibbon({ points, width = 0.08 }: { points: V3[]; width?: number }) {
  const { array, left, right } = useMemo(() => roadRibbon(points, width), [points, width]);
  return (
    <group>
      <mesh>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[array, 3]} />
        </bufferGeometry>
        <meshBasicMaterial color="#223240" transparent opacity={0.62} side={DoubleSide} depthWrite={false} />
      </mesh>
      <Line points={left} color={NEUTRAL} lineWidth={1} transparent opacity={0.42} />
      <Line points={right} color={NEUTRAL} lineWidth={1} transparent opacity={0.42} />
    </group>
  );
}

// The Big Dipper (Ursa Major — "the Big Bear") asterism: 7 stars + the links
// between them. Handle on the right, bowl on the left.
const DIPPER: [number, number][] = [
  [0.0, 1.0], // 0 Dubhe  — bowl top-outer
  [0.0, 0.0], // 1 Merak  — bowl bottom-outer
  [1.0, 0.05], // 2 Phecda — bowl bottom-inner
  [1.05, 0.85], // 3 Megrez — bowl top-inner / handle joint
  [1.85, 1.0], // 4 Alioth
  [2.6, 1.15], // 5 Mizar
  [3.35, 1.4], // 6 Alkaid — handle end
];
const DIPPER_LINKS: [number, number][] = [
  [0, 3], [3, 2], [2, 1], [1, 0], // the bowl
  [3, 4], [4, 5], [5, 6], // the handle
];
const DIPPER_MAG = [1, 0.7, 0.65, 0.8, 1, 0.85, 1]; // relative brightness → star size

/** A star constellation (the Big Dipper) that fades in behind the windmill while
 *  it's selected, its stars twinkling and blooming against the night. */
function Constellation({ anchor }: { anchor: V3 }) {
  const { selected, visited } = useActive('dtt-amsterdam');
  const reduced = useReducedMotion();
  const grp = useRef<Group>(null);
  const starMats = useRef<(MeshStandardMaterial | null)[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineRef = useRef<any>(null);
  const k = useRef(0);
  const stars = useMemo(() => {
    const cx = DIPPER.reduce((a, s) => a + s[0], 0) / DIPPER.length;
    const cy = DIPPER.reduce((a, s) => a + s[1], 0) / DIPPER.length;
    const S = 0.26; // asterism scale
    return DIPPER.map(([x, y]) => [(x - cx) * S, (y - cy) * S, 0] as V3);
  }, []);
  const segs = useMemo(() => DIPPER_LINKS.flatMap(([a, b]) => [stars[a], stars[b]]), [stars]);
  useFrame((s) => {
    // fades in on select and stays lit once the windmill has been opened
    k.current += ((selected || visited ? 1 : 0) - k.current) * 0.08;
    const kk = k.current;
    if (grp.current) {
      grp.current.visible = kk > 0.01;
      grp.current.scale.setScalar(0.9 + 0.1 * kk);
    }
    const t = s.clock.elapsedTime;
    starMats.current.forEach((m, i) => {
      if (!m) return;
      const tw = reduced ? 1 : 0.78 + 0.32 * Math.sin(t * (1.7 + i * 0.4) + i);
      m.emissiveIntensity = kk * 1.8 * tw; // brighter to keep the now-tiny stars visible
      m.opacity = Math.min(1, kk * 1.5);
    });
    const lm = lineRef.current?.material;
    if (lm) {
      const op = kk * 0.95;
      lm.opacity = op;
      if (lm.uniforms?.opacity) lm.uniforms.opacity.value = op;
    }
  });
  return (
    <group ref={grp} position={[anchor[0] + 0.1, anchor[1] + 1.0, anchor[2] - 0.7]} rotation={[0.05, 0.4, 0]} visible={false}>
      <Line ref={lineRef} segments points={segs} color="#dcefff" lineWidth={3.0} transparent opacity={0} />
      {stars.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.0033 + DIPPER_MAG[i] * 0.0028, 10, 10]} />
          <meshStandardMaterial
            ref={(m) => {
              starMats.current[i] = m;
            }}
            color="#eaf6ff"
            emissive="#cfe8ff"
            emissiveIntensity={0}
            transparent
            opacity={0}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Power cables from the Alliander tower out to every building — thin emissive
 *  tubes (not lines) so they reliably bloom: dim blue at rest, ramping to a bright
 *  glowing blue when the tower is engaged, and staying lit once visited. All tubes
 *  share one material, animated in one place. */
function PowerWires({ from, targets }: { from: V3; targets: V3[] }) {
  const { hovered, selected, visited } = useActive('alliander-hololens');
  const k = useRef(0);
  const tubes = useMemo(
    () =>
      targets.map((t) => {
        const horiz = Math.hypot(t[0] - from[0], t[2] - from[2]);
        const sag = 0.05 + horiz * 0.14; // longer spans droop more
        const pts: Vector3[] = [];
        for (let i = 0; i <= 12; i++) {
          const u = i / 12;
          pts.push(
            new Vector3(
              from[0] + (t[0] - from[0]) * u,
              from[1] + (t[1] - from[1]) * u - sag * 4 * u * (1 - u),
              from[2] + (t[2] - from[2]) * u,
            ),
          );
        }
        return new TubeGeometry(new CatmullRomCurve3(pts), 14, 0.006, 5, false);
      }),
    [from, targets],
  );
  const mat = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#284a5c',
        emissive: '#4fd8ff',
        emissiveIntensity: 0.12,
        transparent: true,
        opacity: 0.55,
        roughness: 0.4,
        toneMapped: false,
      }),
    [],
  );
  useFrame(() => {
    const target = selected ? 1 : hovered ? 0.5 : visited ? 0.28 : 0;
    k.current += (target - k.current) * 0.09;
    const kk = k.current;
    mat.emissiveIntensity = 0.12 + kk * 2.8; // toneMapped:false → blooms on select
    mat.opacity = 0.5 + kk * 0.5;
  });
  return (
    <group>
      {tubes.map((g, i) => (
        <mesh key={i} geometry={g} material={mat} />
      ))}
    </group>
  );
}

/* ---------- The completion reward: the next project ----------
   The moment every signal has been found (store.completedAt set), a new site
   materialises at the back of the skyline: a big, simple building shell going
   up with a slow-turning crane — deliberately the only thing left as a ghost
   in a fully coloured world, because it hasn't happened yet. Its marker
   invites the visitor to be the one it gets built with. */
const SITE_POS: V3 = [-0.95, 0, -0.9];

function NextProjectSite() {
  const completedAt = useSceneSelector((s) => s.completedAt);
  const reduced = useReducedMotion();
  const rise = useRef<Group>(null);
  const jib = useRef<Group>(null);

  useFrame(() => {
    if (completedAt === null) return;
    const t = reduced ? 10 : (performance.now() - completedAt) / 1000;
    // ease up out of the ground, then idle: the crane keeps slowly working
    const k = 1 - Math.exp(-Math.max(0, t - 0.4) * 1.6);
    if (rise.current) {
      rise.current.scale.set(0.7 + 0.3 * k, Math.max(0.001, k), 0.7 + 0.3 * k);
    }
    if (jib.current && !reduced) jib.current.rotation.y = Math.sin(t * 0.3) * 0.55 + 0.5;
  });

  if (completedAt === null) return null;

  return (
    <group position={SITE_POS} rotation={[0, 0.5, 0]}>
      {/* staked-out plot */}
      <Line points={roundedRectPts(0.56, 0.56, 0.07)} color={GHOST_LINE} lineWidth={1} transparent opacity={0.55} />
      <group ref={rise}>
        {/* two simple shell volumes — the top one still going up */}
        <mesh position={[0, 0.26, 0]}>
          <boxGeometry args={[0.36, 0.52, 0.36]} />
          <meshStandardMaterial color={GHOST_FILL} transparent opacity={0.07} depthWrite={false} />
          <Edges threshold={20} color={GHOST_LINE} />
        </mesh>
        <mesh position={[0.02, 0.64, -0.02]}>
          <boxGeometry args={[0.3, 0.22, 0.3]} />
          <meshStandardMaterial color={GHOST_FILL} transparent opacity={0.05} depthWrite={false} />
          <Edges threshold={20} color={GHOST_LINE} />
        </mesh>
        {/* tower crane on the corner — mast, jib, one cable mid-lift */}
        <group position={[0.24, 0, 0.24]}>
          <mesh position={[0, 0.55, 0]}>
            <boxGeometry args={[0.022, 1.1, 0.022]} />
            <meshStandardMaterial color={GHOST_LINE} transparent opacity={0.6} />
          </mesh>
          <group ref={jib} position={[0, 1.06, 0]}>
            <mesh position={[-0.28, 0, 0]}>
              <boxGeometry args={[0.6, 0.016, 0.016]} />
              <meshStandardMaterial color={GHOST_LINE} transparent opacity={0.6} />
            </mesh>
            <Line points={[[-0.5, 0, 0], [-0.5, -0.34, 0]]} color={GHOST_LINE} lineWidth={1} transparent opacity={0.55} />
            <mesh position={[-0.5, -0.36, 0]}>
              <boxGeometry args={[0.04, 0.04, 0.04]} />
              <meshStandardMaterial color={GHOST_FILL} transparent opacity={0.45} />
            </mesh>
          </group>
        </group>
      </group>
      {/* the invitation — clicks through to contact */}
      <Html position={[0, 0.92, 0]} center zIndexRange={[18, 0]} className="hotspot-wrap">
        <button
          type="button"
          className="nextsite"
          onClick={() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <b>next project</b> — could be yours
        </button>
      </Html>
    </group>
  );
}

export function CityRig() {
  // Roads: a grid threading between the blocks, three avenues out toward the
  // church / windmill / park, and two curved roads sweeping around the side.
  const roads: V3[][] = useMemo(
    () => [
      [[-0.3, 0.01, -0.9], [-0.3, 0.01, 0.9]],
      [[0.3, 0.01, -0.9], [0.3, 0.01, 0.9]],
      [[-0.9, 0.01, -0.3], [0.9, 0.01, -0.3]],
      [[-0.9, 0.01, 0.3], [0.9, 0.01, 0.3]],
      [[-0.3, 0.01, -0.3], [-0.55, 0.01, -0.62]],
    ],
    [],
  );
  const curveB = useMemo(() => smoothCurve([[-1.9, 0.01, 0.45], [-1.0, 0.01, 0.85], [0.1, 0.01, 0.98], [1.05, 0.01, 0.82]]), []);
  // Sparse blocks of square buildings around a central plaza; taller toward
  // the middle so the cluster still reads as a skyline.
  const cluster = useMemo(() => {
    const rnd = makeRand(1872);
    const out: { x: number; z: number; w: number; d: number; h: number }[] = [];
    const cells = [-0.55, 0, 0.55];
    for (const cx of cells)
      for (const cz of cells) {
        if (cx === 0 && cz === 0) continue; // central plaza → town hall
        const count = 1;
        for (let k = 0; k < count; k++) {
          const x = cx + (rnd() - 0.5) * 0.12;
          const z = cz + (rnd() - 0.5) * 0.12;
          const fall = Math.max(0.1, 1 - (x * x + z * z) * 0.8);
          out.push({ x, z, w: 0.13 + rnd() * 0.05, d: 0.13 + rnd() * 0.05, h: 0.2 + fall * 0.4 + rnd() * 0.12 });
        }
      }
    return out;
  }, []);
  const { accent } = useAccent();
  // one shared material for every window, ramped by WindowDriver on town-hall hover
  const winMat = useMemo(() => {
    const m = new MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0, transparent: true, opacity: 0.1, roughness: 0.4, toneMapped: false, depthWrite: false });
    m.userData.lifeSkip = true; // WindowDriver animates it; shared with prop buildings
    return m;
  }, [accent]);
  // DEV-only position scrubbers; tree-shaken from production builds (see devTweak).
  const mill = useTweak('City.Windmill', { position: [-1.34, 0, 0.33] });
  const park = useTweak('City.Park', { position: [1.3, 0, -0.23] });
  return (
    <group>
      {/* roads through the city */}
      {roads.map((p, i) => (
        <RoadRibbon key={`r${i}`} points={p} width={0.08} />
      ))}
      {/* curved roads on the side */}
      <RoadRibbon points={curveB} width={0.09} />

      {/* the skyline + its civic peak; windows light up on town-hall hover */}
      <WindowDriver mat={winMat} />
      {cluster.map((b, i) => (
        <Building key={i} {...b} winMat={winMat} />
      ))}
      <LifeGroup slug="alliander-hololens">
        <Skyscraper position={[0, 0, 0]} winMat={winMat} />
      </LifeGroup>
      {/* power lines from the central tower to every building — glow blue on select */}
      <PowerWires from={[0, 0.8, 0]} targets={cluster.map((b) => [b.x, b.h, b.z] as V3)} />


      {/* windmill on the side — carries the DTT Amsterdam hotspot */}
      <LifeGroup slug="dtt-amsterdam">
        <Windmill position={mill.position} slug="dtt-amsterdam" />
      </LifeGroup>
      {/* the Big Dipper rises behind the windmill while it's selected */}
      <Constellation anchor={mill.position} />

      {/* parks (the first carries the arcam hotspot — its trees rustle) */}
      <LifeGroup slug="arcam">
        <Park position={park.position} slug="arcam" />
      </LifeGroup>

      {/* materialises only once every signal has been found */}
      <NextProjectSite />
    </group>
  );
}

