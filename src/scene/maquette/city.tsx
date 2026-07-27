// The CITY layer (top) — GIS & location work. A skyline with lit windows, the
// windmill (DTT), the park with the ARCam tower viewer (ARCam), and the
// central skyscraper (Alliander), plus roads, power lines, ducks and a
// constellation. CityRig at the bottom composes and places everything.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, Html } from '@react-three/drei';
import { AdditiveBlending, Box3, BufferAttribute, CatmullRomCurve3, Color, DoubleSide, Euler, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Shape, ShapeGeometry, TubeGeometry, Vector3, type Group, type Mesh, type Points as ThreePoints } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useTweak } from '../devTweak';
import { launchTrack, sceneStore, useSceneSelector } from '../store';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useLaunchCount } from '../../lib/launches';
import { asset } from '../../lib/asset';
import { NEUTRAL, GLASS, useAccent, circlePts, smoothCurve, makeRand, Line, useActive, bounceObject, FX, fxEnv, type V3 } from './shared';
import { GHOST_FILL, GHOST_LINE, LifeGroup } from './life';
import { glassRim, GlassMat, LiveGlassMat } from './materials';
import { BlobShadow } from './backdrop';
import { Rise, RocketBody } from './rocket';

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
      <BlobShadow position={[0, 0.004, 0]} radius={Math.max(w, d) * 0.95} opacity={0.4} />
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

// The breeze that drives the mill, made visible — faint holographic wind streaks
// flowing across the sails while it's turning. Thin accent-tinted dashes drift
// past the front face, brightening mid-pass and fading at the ends, each on its
// own line and speed; only while engaged (off under reduced motion).
function MillWind() {
  const reduced = useReducedMotion();
  const { accent } = useAccent();
  const { hovered, selected, visited } = useActive('dtt-amsterdam');
  const windCol = useMemo(() => new Color(accent).lerp(new Color('#ffffff'), 0.5), [accent]);
  const refs = useRef<(Mesh | null)[]>([]);
  const glow = useRef(0);
  const streaks = useMemo(() => {
    const rnd = makeRand(915);
    return Array.from({ length: 7 }, () => ({
      y: 0.42 + rnd() * 0.4, // spread over the sail span
      z: 0.12 + rnd() * 0.16, // around the front face
      ph: rnd(),
      spd: 0.2 + rnd() * 0.16, // a gentle drift, each its own pace
      slope: (rnd() - 0.5) * 0.14, // a slight rise/fall across the pass
      len: 0.7 + rnd() * 0.9, // streak length (× the base dash)
    }));
  }, []);
  useFrame((s) => {
    glow.current += (((hovered || selected || visited) && !reduced ? 1 : 0) - glow.current) * FX.engage;
    const t = s.clock.elapsedTime;
    for (let i = 0; i < streaks.length; i++) {
      const m = refs.current[i];
      const d = streaks[i];
      if (!m) continue;
      const p = (t * d.spd + d.ph) % 1; // 0 at the left → 1 off the right
      m.position.set(-0.42 + p * 0.84, d.y + (p - 0.5) * d.slope, d.z);
      (m.material as MeshStandardMaterial).opacity = fxEnv(p) * FX.peak * glow.current;
    }
  });
  return (
    <group>
      {streaks.map((d, i) => (
        <mesh key={i} ref={(r) => (refs.current[i] = r)} scale={[d.len, 1, 1]}>
          <boxGeometry args={[0.07, 0.004, 0.004]} />
          <meshStandardMaterial color={windCol} emissive={windCol} emissiveIntensity={1.4} transparent opacity={0} toneMapped={false} depthWrite={false} blending={AdditiveBlending} userData={{ lifeSkip: true }} />
        </mesh>
      ))}
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
      <BlobShadow position={[0, 0.004, 0]} radius={0.42} opacity={0.38} />
      <group ref={popRef}>
      {/* Grassy mound. Every part of the mill uses LiveGlassMat, not GlassMat:
          only the body did before, so waking the windmill solidified the tower
          and left the cap, sails and mound as faint glass — the silhouette still
          read as a wireframe while every other hotspot came alive properly. */}
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.24, 0.3, 0.06, 20]} />
        <LiveGlassMat slug={slug ?? ''} color="#3e6459" opacity={0.18} />
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
        <LiveGlassMat slug={slug ?? ''} color="#5b6b74" opacity={0.3} />
        <Edges threshold={20} color={NEUTRAL} />
      </mesh>
      {/* sails — a turning cross on the front face; they spin up when engaged */}
      <group ref={sails} position={[0, 0.62, 0.19]}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <mesh position={[0, 0.24, 0]}>
              <boxGeometry args={[0.05, 0.46, 0.01]} />
              <LiveGlassMat slug={slug ?? ''} color="#4f7d92" opacity={0.34} />
              <Edges threshold={30} color={NEUTRAL} />
            </mesh>
          </group>
        ))}
      </group>
      </group>
      <MillWind />
    </group>
  );
}

/** A stylised pine — three stacked faceted cones over a short trunk stub (the
 *  stub ends below the lowest tier's skirt, so nothing shows through the
 *  leaves). Neutral glass at rest, like the rest of the furniture; visiting
 *  the park breathes a quiet sea-green into the foliage — a hint of life, not
 *  a lawn-ornament green. */
const PINE_TIERS: [number, number, number][] = [
  // y centre, radius, height — fractions of the tree height
  [0.3, 0.36, 0.44],
  [0.55, 0.27, 0.36],
  [0.78, 0.18, 0.3],
];
function ParkTree({ position, h = 0.45, yaw = 0, slug }: { position: V3; h?: number; yaw?: number; slug?: string }) {
  const { selected, visited } = useActive(slug ?? '');
  const live = useRef(0);
  const restCol = useMemo(() => new Color('#47656b'), []); // neutral glass-teal at rest
  const vivid = useMemo(() => new Color('#5ea78d'), []); // restrained sea-green once visited
  const mat = useMemo(() => {
    const m = new MeshStandardMaterial({ color: '#47656b', flatShading: true, roughness: 0.7, metalness: 0, transparent: true, opacity: 0.4 });
    m.userData.lifeSkip = true; // greens up itself once visited
    return m;
  }, []);
  useFrame(() => {
    if (!slug) return;
    live.current += ((selected || visited ? 1 : 0) - live.current) * 0.06;
    mat.color.copy(restCol).lerp(vivid, live.current);
    mat.opacity = 0.4 + live.current * 0.35;
  });
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <mesh position={[0, h * 0.05, 0]}>
        <cylinderGeometry args={[h * 0.022, h * 0.03, h * 0.1, 6]} />
        <GlassMat color="#70828e" opacity={0.5} />
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
            <GlassMat color="#c6d0d8" opacity={0.55} />
          </mesh>
          <mesh position={[0.014, 0.012, 0]}>
            <sphereGeometry args={[0.008, 8, 6]} />
            <GlassMat color="#c6d0d8" opacity={0.6} />
          </mesh>
          <mesh position={[0.024, 0.012, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.003, 0.008, 6]} />
            <GlassMat color="#d3b06e" opacity={0.7} />
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
      <BlobShadow position={[0, 0.003, 0]} radius={0.68} opacity={0.34} />
      <group ref={popRef}>
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.02, 44]} />
        <LiveGlassMat slug="arcam" color="#3e6459" opacity={0.15} />
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
        {/* a little jetty over the water — neutral grey, no timber brown */}
        <group position={[0.13, 0, -0.07]} rotation={[0, -0.5, 0]}>
          <mesh position={[0, 0.045, 0]}>
            <boxGeometry args={[0.13, 0.012, 0.035]} />
            <GlassMat color="#7e8b94" opacity={0.55} />
            <Edges threshold={30} color={NEUTRAL} />
          </mesh>
          {[-0.05, 0.04].map((px, i) => (
            <mesh key={i} position={[px, 0.022, 0.013]}>
              <cylinderGeometry args={[0.005, 0.005, 0.05, 6]} />
              <GlassMat color="#7e8b94" opacity={0.5} />
            </mesh>
          ))}
        </group>
        {/* reeds at the far edge — the same quiet glass-green as the trees */}
        {([[-0.16, 0.03], [-0.185, -0.02], [-0.15, -0.06]] as [number, number][]).map(([rx, rz], i) => (
          <mesh key={`r${i}`} position={[rx, 0.06, rz]} rotation={[0.12 * (i - 1), 0, 0.13]}>
            <cylinderGeometry args={[0.003, 0.005, 0.11, 5]} />
            <GlassMat color="#597a6d" opacity={0.6} />
          </mesh>
        ))}
        {/* lily pads */}
        {([[0.07, 0.06], [-0.02, -0.08]] as [number, number][]).map(([lx, lz], i) => (
          <mesh key={`l${i}`} position={[lx, 0.028, lz]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.022, 12]} />
            <meshStandardMaterial color="#4a6f66" roughness={0.7} transparent opacity={0.75} side={DoubleSide} />
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
  const surge = useRef<Group>(null); // a light-band that rises up the shaft
  const surgeMat = useRef<MeshStandardMaterial>(null);
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
    // a light-band surges up the shaft while the tower is alive — energy rising
    // to the crown; it hugs the taper as it climbs
    if (surge.current && surgeMat.current) {
      const p = reduced ? 0.5 : (t * FX.loopSpeed) % 1;
      const y = p * TOWER_H;
      surge.current.position.y = y;
      const r = rAt(y) / TOWER_R_BOT;
      surge.current.scale.set(r, 1, r);
      surgeMat.current.opacity = fxEnv(p) * FX.peak * lifeK.current;
    }
  });
  return (
    <group position={position}>
      <BlobShadow position={[0, 0.004, 0]} radius={0.34} opacity={0.45} />
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
        {/* a light-band that rises up the shaft while engaged (driven above) */}
        <group ref={surge}>
          <mesh>
            <cylinderGeometry args={[TOWER_R_BOT + 0.008, TOWER_R_BOT + 0.008, 0.03, TOWER_SIDES, 1, true]} />
            <meshStandardMaterial ref={surgeMat} color={accent} emissive={accent} emissiveIntensity={1.4} transparent opacity={0} blending={AdditiveBlending} side={DoubleSide} depthWrite={false} toneMapped={false} userData={{ lifeSkip: true }} />
          </mesh>
        </group>
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

/* ---------- The transformer house — powers the city ---------- */
// A Dutch "transformatorhuisje": the little neighbourhood substation that steps
// the grid down for the surrounding blocks. A squat frosted-glass box in the same
// language as the rest of the city, set apart by its overhanging roof, a door and
// the ceramic bushings on the roof. A prop (not a hotspot), like the buildings —
// but its bushing caps carry the city's power: a faint hum at rest, brightening
// with the Alliander grid when the tower is engaged or the whole city goes live.
const TRAFO_W = 0.18;
const TRAFO_D = 0.14;
const TRAFO_H = 0.11;
// a small lightning bolt for the door's hazard plate (local +z-face coords)
const TRAFO_BOLT: V3[] = [
  [0.007, 0.024, 0],
  [-0.004, 0.005, 0],
  [0.005, 0.002, 0],
  [-0.007, -0.022, 0],
];

function TransformerHouse({ position }: { position: V3 }) {
  const { accent } = useAccent();
  const { hovered, selected, visited } = useActive('alliander-hololens');
  const complete = useSceneSelector((s) => s.completedAt !== null);
  const reduced = useReducedMotion();
  const accentC = useMemo(() => new Color(accent), [accent]);
  // one shared emissive material for the bushing caps — the live "power". It opts
  // out of the life system and drives its own ghost→accent glow, like the windows.
  const capMat = useMemo(() => {
    const m = new MeshStandardMaterial({ color: GHOST_FILL, emissive: GHOST_FILL, emissiveIntensity: 0.3, roughness: 0.35, metalness: 0.2, toneMapped: false });
    m.userData.lifeSkip = true;
    return m;
  }, []);
  useEffect(() => () => capMat.dispose(), [capMat]);
  const k = useRef(0.12);
  useFrame((s) => {
    // rest to a faint smoulder; brighten with the grid (hover < visited < live/complete)
    const kT = selected || complete ? 1 : hovered ? 0.7 : visited ? 0.42 : 0.12;
    k.current += (kT - k.current) * 0.08;
    const t = reduced ? 0 : s.clock.elapsedTime;
    const hum = reduced ? 1 : 0.82 + 0.18 * Math.sin(t * 3.2); // a faint electrical hum
    capMat.color.copy(GHOST_FILL).lerp(accentC, k.current);
    capMat.emissive.copy(GHOST_FILL).lerp(accentC, k.current);
    capMat.emissiveIntensity = (0.3 + 2.6 * k.current) * hum;
  });
  return (
    <group position={position}>
      <BlobShadow position={[0, 0.004, 0]} radius={Math.max(TRAFO_W, TRAFO_D) * 0.85} opacity={0.42} />
      {/* body — the same quiet frosted glass as the buildings */}
      <mesh position={[0, TRAFO_H / 2, 0]}>
        <boxGeometry args={[TRAFO_W, TRAFO_H, TRAFO_D]} />
        <GlassMat opacity={0.34} />
        <Edges threshold={20} color={NEUTRAL} />
      </mesh>
      {/* overhanging flat roof — the trafohuisje signature */}
      <mesh position={[0, TRAFO_H + 0.007, 0]}>
        <boxGeometry args={[TRAFO_W + 0.03, 0.014, TRAFO_D + 0.03]} />
        <GlassMat color="#828f98" opacity={0.5} />
        <Edges threshold={20} color={NEUTRAL} />
      </mesh>
      {/* door + a small glowing hazard bolt on the camera-facing (+z) face */}
      <mesh position={[-TRAFO_W * 0.2, TRAFO_H * 0.44, TRAFO_D / 2 + 0.002]}>
        <planeGeometry args={[TRAFO_W * 0.26, TRAFO_H * 0.72]} />
        <meshStandardMaterial color="#16232c" roughness={0.6} metalness={0.1} transparent opacity={0.72} side={DoubleSide} />
      </mesh>
      <Line points={TRAFO_BOLT} position={[TRAFO_W * 0.18, TRAFO_H * 0.52, TRAFO_D / 2 + 0.004]} color={accent} lineWidth={1.4} transparent opacity={0.85} />
      {/* louvre vents on the +x side */}
      {[0.32, 0.52, 0.72].map((f, i) => (
        <mesh key={i} position={[TRAFO_W / 2 + 0.001, TRAFO_H * f, 0]}>
          <boxGeometry args={[0.003, 0.006, TRAFO_D * 0.5]} />
          <GlassMat color="#6f7d86" opacity={0.6} />
        </mesh>
      ))}
      {/* ceramic bushings on the roof — the electrical bit; the caps carry power */}
      {[-TRAFO_W * 0.28, 0, TRAFO_W * 0.28].map((bx, i) => (
        <group key={i} position={[bx, TRAFO_H + 0.014, -TRAFO_D * 0.14]}>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.009, 0.012, 0.04, 10]} />
            <meshStandardMaterial color="#c7d0d6" roughness={0.5} metalness={0.1} transparent opacity={0.9} />
          </mesh>
          <mesh position={[0, 0.045, 0]} material={capMat}>
            <sphereGeometry args={[0.0075, 10, 10]} />
          </mesh>
        </group>
      ))}
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
      lm.userData.lifeSkip = true; // self-animated — presence stays out
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
            userData={{ lifeSkip: true }}
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
  const mat = useMemo(() => {
    const m = new MeshStandardMaterial({
      color: '#284a5c',
      emissive: '#4fd8ff',
      emissiveIntensity: 0.12,
      transparent: true,
      opacity: 0.55,
      roughness: 0.4,
      toneMapped: false,
    });
    m.userData.lifeSkip = true; // animates its own opacity — presence stays out
    return m;
  }, []);
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

/* ---------- The completion reward: the next launch ----------
   "Let's build it together" — literally. The quiet lot between the city
   blocks and the park starts as a bare surveyed apron, and every project the
   visitor wakes adds a piece: launch mount, tower (lower, then upper), then
   the vehicle itself — legs, booster, grid fins, interstage, access arm,
   nose cone last. The 10th project powers the site on: the beacon starts
   blinking, the celebration fires (NodeHud pulls the journey home so it
   plays in view) and the invitation appears. The vehicle stays deliberately
   the only ghost in a fully coloured world, because it hasn't flown yet.
   Clicking it then moves the camera to the pad and offers a LAUNCH button
   (components/LaunchOverlay); lift-off carries the visitor up into the
   asteroids easter egg. */
const SITE_POS: V3 = [0.85, 0, -0.52];

/* Assembly order: how many woken projects each piece needs (visited.length ≥ n). */
const BUILD = { mount: 1, towerLo: 2, towerHi: 3, legs: 4, booster: 5, fins: 6, interstage: 7, arm: 8, nose: 9 };

function NextProjectSite() {
  const celebrateAt = useSceneSelector((s) => s.celebrateAt);
  const built = useSceneSelector((s) => s.visited.length); // assembly progress
  const launch = useSceneSelector((s) => s.launch);
  const flights = useLaunchCount(); // global odometer, null until known
  const reduced = useReducedMotion();
  const rocket = useRef<Group>(null);
  const exhaust = useRef<Group>(null);
  const beaconMat = useRef<MeshStandardMaterial>(null);
  const vel = useRef(0);
  const alt = useRef(0);
  const ascendT0 = useRef(0); // wall-clock ignition time (staging fallback)

  // Lattice service tower: rung rings + alternating face diagonals (the same
  // construction the old crane mast used — the site kept its scaffolding).
  const MAST_W = 0.055; // post spacing
  const MAST_H = 0.82;
  // split at step 2/5 so the tower can assemble in two pours (BUILD.towerLo/Hi)
  const lattice = useMemo(() => {
    const h = MAST_W / 2;
    const rungsLo: V3[][] = [];
    const rungsHi: V3[][] = [];
    const diagsLo: V3[] = [];
    const diagsHi: V3[] = [];
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      const y = (MAST_H / steps) * i - 0.02;
      (i <= 2 ? rungsLo : rungsHi).push([[-h, y, -h], [h, y, -h], [h, y, h], [-h, y, h], [-h, y, -h]]);
      const y0 = (MAST_H / steps) * (i - 1);
      const dir = i % 2 ? 1 : -1;
      const d = i <= 2 ? diagsLo : diagsHi;
      d.push([dir * -h, y0, h], [dir * h, y, h]);
      d.push([h, y0, dir * -h], [h, y, dir * h]);
    }
    return { rungsLo, rungsHi, diagsLo, diagsHi };
  }, []);

  useFrame((s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    // the beacon powers on with the 10th project (the site is complete) — a
    // faint standby ember while the vehicle is still being assembled
    if (beaconMat.current) {
      beaconMat.current.emissiveIntensity =
        celebrateAt === null ? 0.06 : reduced ? 0.8 : 0.3 + (Math.sin(s.clock.elapsedTime * 2.4) > 0.7 ? 1.6 : 0);
    }

    const r = rocket.current;
    if (!r) return;
    // ---- launch dynamics ----
    if (launch === 'idle' && alt.current !== 0) {
      // back from the game: the booster is quietly back on the mount (it landed)
      alt.current = 0;
      vel.current = 0;
      ascendT0.current = 0;
      r.position.set(0, 0, 0);
      r.rotation.z = 0;
    }
    if (launch === 'countdown' && !reduced) {
      // hold-down rumble while the count runs
      r.position.x = (Math.random() - 0.5) * 0.004;
      r.position.z = (Math.random() - 0.5) * 0.004;
    }
    if (launch === 'ascend') {
      if (reduced) {
        sceneStore.setLaunch('game'); // no ascent animation — cut to the game
      } else {
        if (ascendT0.current === 0) ascendT0.current = performance.now();
        vel.current += 1.7 * dt; // throttle up
        alt.current += vel.current * dt;
        r.position.y = alt.current;
        r.rotation.z = -Math.min(alt.current * 0.05, 0.16); // a hint of gravity turn
        // staging → the game takes over. The wall-clock fallback matters: the
        // sim's dt is clamped (1/30), so on a slow device the integration runs
        // below real time and altitude alone could keep the visitor waiting.
        if (alt.current > 3.2 || performance.now() - ascendT0.current > 4500) sceneStore.setLaunch('game');
      }
    }
    // exhaust: builds through the count, roars during ascent
    const ex = exhaust.current;
    if (ex) {
      const on = launch === 'ascend' ? 1 : launch === 'countdown' ? 0.25 : 0;
      ex.visible = on > 0 && !reduced;
      if (ex.visible) {
        const flick = 0.85 + Math.random() * 0.3;
        ex.scale.set(on * flick, on * (0.9 + Math.random() * 0.35), on * flick);
      }
    }
    // the camera reads the vehicle's live world position from here
    r.getWorldPosition(launchTrack);
    launchTrack.y += 0.35 * 1.15; // aim at the stack's middle, not its tail
  });

  const post = MAST_W / 2;
  const complete = celebrateAt !== null;
  const engage = () => {
    // the launch is the 10/10 reward — while the vehicle is still being
    // assembled the pad stays quiet
    if (!complete) return;
    if (sceneStore.snapshot().launch === 'idle') sceneStore.setLaunch('pad');
  };
  const anim = !reduced; // assembly pieces rise in (Rise) unless reduced
  return (
    <group position={SITE_POS} rotation={[0, 0.25, 0]}>
      {/* ---- the apron: surveyed from the very first scroll ---- */}
      <mesh position={[-0.02, 0.012, 0.03]}>
        <cylinderGeometry args={[0.17, 0.18, 0.024, 24]} />
        <meshStandardMaterial color={GHOST_FILL} transparent opacity={0.28} />
      </mesh>
      {/* surveyor's corner brackets — the plot is marked out until the build
          is complete, then the marks come up */}
      {built < 10 && (
        <group position={[-0.02, 0.028, 0.03]}>
          {([[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]).map(([sx, sz], i) => (
            <group key={i} position={[sx * 0.15, 0, sz * 0.15]}>
              <mesh position={[sx * -0.022, 0, 0]}>
                <boxGeometry args={[0.052, 0.004, 0.007]} />
                <meshStandardMaterial color={GHOST_LINE} transparent opacity={0.5} />
              </mesh>
              <mesh position={[0, 0, sz * -0.022]}>
                <boxGeometry args={[0.007, 0.004, 0.052]} />
                <meshStandardMaterial color={GHOST_LINE} transparent opacity={0.5} />
              </mesh>
            </group>
          ))}
        </group>
      )}
      <group position={[-0.02, 0, 0.03]}>
        {/* ---- piece 1: the four-legged launch mount ---- */}
        {built >= BUILD.mount && (
          <Rise animate={anim}>
            {([[-0.05, -0.05], [0.05, -0.05], [-0.05, 0.05], [0.05, 0.05]] as [number, number][]).map(([x, z], i) => (
              <mesh key={i} position={[x, 0.045, z]}>
                <boxGeometry args={[0.014, 0.065, 0.014]} />
                <meshStandardMaterial color={GHOST_LINE} transparent opacity={0.6} />
              </mesh>
            ))}
            <mesh position={[0, 0.08, 0]}>
              <cylinderGeometry args={[0.052, 0.052, 0.016, 16]} />
              <meshStandardMaterial color={GHOST_LINE} transparent opacity={0.55} />
            </mesh>
          </Rise>
        )}

        {/* ---- the vehicle, stacked piece by piece (clickable once whole) ---- */}
        <group
          ref={rocket}
          onClick={(e) => {
            e.stopPropagation();
            engage();
          }}
          onPointerOver={() => {
            if (complete) document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          <RocketBody
            // ghost while it's still being assembled piece by piece; the moment
            // the site is complete (10/10, homecoming) the vehicle powers on to a
            // lit teal solid with glowing edges — the finished rocket, ready to fly,
            // no longer a faint sketch
            mode={complete ? 'lit' : 'ghost'}
            assemble={anim}
            parts={{
              legs: built >= BUILD.legs,
              booster: built >= BUILD.booster,
              fins: built >= BUILD.fins,
              interstage: built >= BUILD.interstage,
              nose: built >= BUILD.nose,
            }}
          />
          {/* exhaust — hidden until the count */}
          <group ref={exhaust} position={[0, 0.075, 0]} visible={false}>
            <mesh position={[0, -0.1, 0]}>
              <coneGeometry args={[0.03, 0.22, 12, 1, true]} />
              <meshBasicMaterial color="#ffd9a0" transparent opacity={0.85} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
            </mesh>
            <mesh position={[0, -0.02, 0]}>
              <sphereGeometry args={[0.05, 12, 12]} />
              <meshBasicMaterial color="#ffb46a" transparent opacity={0.5} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
            </mesh>
          </group>
        </group>
      </group>

      {/* ---- the service tower (the crane's lattice, repurposed) — raised in
              two pours, lower then upper ---- */}
      <group position={[0.13, 0, -0.07]}>
        {built >= BUILD.towerLo && (
          <Rise animate={anim}>
            <mesh position={[0, 0.015, 0]}>
              <boxGeometry args={[0.14, 0.03, 0.14]} />
              <meshStandardMaterial color={GHOST_FILL} transparent opacity={0.3} />
            </mesh>
            {([[-post, -post], [post, -post], [-post, post], [post, post]] as [number, number][]).map(([x, z], i) => (
              <mesh key={i} position={[x, MAST_H * 0.2 + 0.03, z]}>
                <boxGeometry args={[0.012, MAST_H * 0.4, 0.012]} />
                <meshStandardMaterial color={GHOST_LINE} transparent opacity={0.6} />
              </mesh>
            ))}
            {lattice.rungsLo.map((r, i) => (
              <Line key={i} points={r} color={GHOST_LINE} lineWidth={1} transparent opacity={0.45} position={[0, 0.03, 0]} />
            ))}
            <Line points={lattice.diagsLo} segments color={GHOST_LINE} lineWidth={1} transparent opacity={0.4} position={[0, 0.03, 0]} />
          </Rise>
        )}
        {built >= BUILD.towerHi && (
          <Rise animate={anim}>
            {([[-post, -post], [post, -post], [-post, post], [post, post]] as [number, number][]).map(([x, z], i) => (
              <mesh key={i} position={[x, MAST_H * 0.7 + 0.03, z]}>
                <boxGeometry args={[0.012, MAST_H * 0.6, 0.012]} />
                <meshStandardMaterial color={GHOST_LINE} transparent opacity={0.6} />
              </mesh>
            ))}
            {lattice.rungsHi.map((r, i) => (
              <Line key={i} points={r} color={GHOST_LINE} lineWidth={1} transparent opacity={0.45} position={[0, 0.03, 0]} />
            ))}
            <Line points={lattice.diagsHi} segments color={GHOST_LINE} lineWidth={1} transparent opacity={0.4} position={[0, 0.03, 0]} />
            {/* beacon — a standby ember until the site powers on at 10/10 */}
            <mesh position={[0, MAST_H + 0.06, 0]}>
              <sphereGeometry args={[0.012, 10, 10]} />
              <meshStandardMaterial ref={beaconMat} color="#ff9068" emissive="#ff9068" emissiveIntensity={0.06} toneMapped={false} userData={{ lifeSkip: true }} />
            </mesh>
          </Rise>
        )}
        {/* crew access arm across to the upper stage */}
        {built >= BUILD.arm && (
          <Rise animate={anim}>
            <mesh position={[-0.085, 0.6, 0.045]} rotation={[0, 0.6, 0]}>
              <boxGeometry args={[0.14, 0.014, 0.03]} />
              <meshStandardMaterial color={GHOST_LINE} transparent opacity={0.55} />
            </mesh>
          </Rise>
        )}
      </group>

      {/* the invitation — the completed site's reward; engages the pad camera */}
      {complete && launch === 'idle' && (
        <Html position={[-0.12, 1.02, 0]} center zIndexRange={[18, 0]} className="hotspot-wrap">
          <button type="button" className="nextsite" onClick={engage}>
            <b>my next launch</b> — let's build it together
            {flights != null && (
              <span className="nextsite__tally">{String(flights).padStart(4, '0')} launches by visitors so far</span>
            )}
          </button>
        </Html>
      )}
    </group>
  );
}

/* A one-shot drift of accent-coloured sparks over the city — fired at the
   homecoming (celebrateAt), gone within ~3s. A quiet glass-raise, not
   fireworks. */
const BURST_N = 32;
const BURST_COLORS = ['#27e8f2', '#ff9068'];

function CelebrationBurst() {
  const celebrateAt = useSceneSelector((s) => s.celebrateAt);
  const reduced = useReducedMotion();
  const ref = useRef<ThreePoints>(null);
  const posAttr = useRef<BufferAttribute>(null);
  const colAttr = useRef<BufferAttribute>(null);

  const { p0, vel, base, delay, life, posArr, colArr } = useMemo(() => {
    const rnd = makeRand(97);
    const p0 = new Float32Array(BURST_N * 3);
    const vel = new Float32Array(BURST_N * 3);
    const base = new Float32Array(BURST_N * 3);
    const delay = new Float32Array(BURST_N);
    const life = new Float32Array(BURST_N);
    const c = new Color();
    for (let i = 0; i < BURST_N; i++) {
      const ang = rnd() * Math.PI * 2;
      const r = 0.25 + Math.sqrt(rnd()) * 1.05;
      p0[i * 3] = Math.cos(ang) * r;
      p0[i * 3 + 1] = 0.25 + rnd() * 0.25;
      p0[i * 3 + 2] = Math.sin(ang) * r;
      vel[i * 3] = Math.cos(ang) * (0.04 + rnd() * 0.12);
      vel[i * 3 + 1] = 0.5 + rnd() * 0.55;
      vel[i * 3 + 2] = Math.sin(ang) * (0.04 + rnd() * 0.12);
      c.set(BURST_COLORS[(rnd() * BURST_COLORS.length) | 0]);
      base[i * 3] = c.r;
      base[i * 3 + 1] = c.g;
      base[i * 3 + 2] = c.b;
      delay[i] = rnd() * 0.5; // one soft, loose wave
      life[i] = 1.6 + rnd() * 1.0;
    }
    return { p0, vel, base, delay, life, posArr: new Float32Array(BURST_N * 3), colArr: new Float32Array(BURST_N * 3) };
  }, []);

  useFrame(() => {
    const pts = ref.current;
    if (!pts || celebrateAt === null) return;
    const t = (performance.now() - celebrateAt) / 1000;
    if (t > 3.2) {
      pts.visible = false;
      return;
    }
    pts.visible = true;
    for (let i = 0; i < BURST_N; i++) {
      const tt = t - delay[i];
      const alive = tt > 0 && tt < life[i];
      const a = alive ? Math.min(1, tt * 6) * (1 - tt / life[i]) * 0.75 : 0;
      const ttc = Math.max(0, tt);
      posArr[i * 3] = p0[i * 3] + vel[i * 3] * ttc;
      posArr[i * 3 + 1] = p0[i * 3 + 1] + vel[i * 3 + 1] * ttc - 0.3 * ttc * ttc;
      posArr[i * 3 + 2] = p0[i * 3 + 2] + vel[i * 3 + 2] * ttc;
      colArr[i * 3] = base[i * 3] * a;
      colArr[i * 3 + 1] = base[i * 3 + 1] * a;
      colArr[i * 3 + 2] = base[i * 3 + 2] * a;
    }
    if (posAttr.current) posAttr.current.needsUpdate = true;
    if (colAttr.current) colAttr.current.needsUpdate = true;
  });

  if (celebrateAt === null || reduced) return null;

  return (
    <points ref={ref} visible={false}>
      <bufferGeometry>
        <bufferAttribute ref={posAttr} attach="attributes-position" args={[posArr, 3]} />
        <bufferAttribute ref={colAttr} attach="attributes-color" args={[colArr, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.035} vertexColors transparent blending={AdditiveBlending} depthWrite={false} sizeAttenuation toneMapped={false} />
    </points>
  );
}

// A few windows that stay softly lit at rest — a handful of homes awake in the
// otherwise-sleeping city. Kept in the skyline's own calm blue (never warm, per
// the window rule above), most just glowing, one or two slowly winking off and
// on. Independent of the interactive winMat, so waking the whole city (full
// bright) is still the reward. Placed on real building faces from the cluster.
function OccupiedWindows({ buildings }: { buildings: { x: number; z: number; w: number; d: number; h: number }[] }) {
  const reduced = useReducedMotion();
  const { accent } = useAccent();
  const mats = useRef<(MeshStandardMaterial | null)[]>([]);
  const wins = useMemo(() => {
    const rnd = makeRand(4231);
    const out: { p: V3; ry: number; lvl: number; spd: number; ph: number; wink: boolean }[] = [];
    buildings.forEach((b, i) => {
      if (i % 3 === 1) return; // only some buildings are occupied
      const rows = Math.max(1, Math.floor((b.h - 0.06) / 0.11));
      const yy = 0.09 + Math.floor(rnd() * rows) * 0.11;
      const front = rnd() > 0.4; // camera-facing +Z (front) or +X (side) face
      const off = (rnd() - 0.5) * 2 * 0.22;
      const p: V3 = front ? [b.x + off * b.w, yy, b.z + b.d / 2 + 0.006] : [b.x + b.w / 2 + 0.006, yy, b.z + off * b.d];
      out.push({ p, ry: front ? 0 : Math.PI / 2, lvl: 0.5 + rnd() * 0.5, spd: 0.3 + rnd() * 0.4, ph: rnd() * 6.28, wink: rnd() < 0.4 });
    });
    return out;
  }, [buildings]);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    for (let i = 0; i < wins.length; i++) {
      const m = mats.current[i];
      const w = wins[i];
      if (!m) continue;
      // winking windows go dark for a beat now and then; the rest hold a soft glow
      const wink = w.wink && !reduced ? (Math.sin(t * w.spd + w.ph) > 0.72 ? 0.12 : 1) : 1;
      m.emissiveIntensity = w.lvl * 0.5 * wink;
    }
  });
  return (
    <group>
      {wins.map((w, i) => (
        <mesh key={i} position={w.p} rotation={[0, w.ry, 0]}>
          <planeGeometry args={[0.045, 0.05]} />
          <meshStandardMaterial ref={(r) => (mats.current[i] = r)} color={accent} emissive={accent} emissiveIntensity={w.lvl * 0.5} transparent opacity={0.92} roughness={0.4} toneMapped={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// A single faint light easing along a road now and then — a lone car crossing
// the sleeping city. One small cool point (a headlight, not a warm glow), a long
// gap between passes, fading in and out at the ends, and gone entirely under
// reduced motion. Path is in the layer's local road coordinates.
function Traffic({ path }: { path: V3[] }) {
  const reduced = useReducedMotion();
  const ref = useRef<Mesh>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const PERIOD = 19; // seconds between passes
  const DUR = 6; // seconds to cross
  useFrame((s) => {
    if (!ref.current || !mat.current) return;
    const tt = s.clock.elapsedTime % PERIOD;
    if (tt > DUR) {
      mat.current.opacity = 0;
      return;
    }
    const p = tt / DUR;
    const idx = p * (path.length - 1);
    const i0 = Math.min(path.length - 2, Math.floor(idx));
    const f = idx - i0;
    const a = path[i0];
    const b = path[i0 + 1];
    ref.current.position.set(a[0] + (b[0] - a[0]) * f, 0.03, a[2] + (b[2] - a[2]) * f);
    mat.current.opacity = Math.sin(p * Math.PI) * 0.85; // ease in at the start, out at the end
  });
  if (reduced) return null;
  return (
    <mesh ref={ref} position={[path[0][0], 0.03, path[0][2]]}>
      <sphereGeometry args={[0.018, 8, 8]} />
      <meshStandardMaterial ref={mat} color="#dff2ff" emissive="#dff2ff" emissiveIntensity={2.4} transparent opacity={0} toneMapped={false} depthWrite={false} />
    </mesh>
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
        if (cx === 0 && cz === 0) continue; // central plaza → the tower
        if (cx < 0 && cz < 0) continue; // back-left plot — deliberately left open
        const count = 1;
        for (let k = 0; k < count; k++) {
          const x = cx + (rnd() - 0.5) * 0.12;
          const z = cz + (rnd() - 0.5) * 0.12;
          const fall = Math.max(0.1, 1 - (x * x + z * z) * 0.8);
          const bld = { x, z, w: 0.13 + rnd() * 0.05, d: 0.13 + rnd() * 0.05, h: 0.2 + fall * 0.4 + rnd() * 0.12 };
          // front-centre plot goes to the transformer house — build the RNG for it
          // (so the rest of the skyline is unchanged), then drop the building.
          if (cx === 0 && cz === 0.55) continue;
          out.push(bld);
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
  // The transformer house sits on the front-centre plot of the 3×3 block grid,
  // just across the road from the tower and facing the camera (its own building
  // is dropped so the spot isn't doubled up). Drag City.Transformer in the dev
  // panel to move it to any of the 9 spots.
  const trafo = useTweak('City.Transformer', { position: [0, 0, 0.55] });
  // Power lines fan from the tower to every building AND to the transformer house,
  // so it reads as part of the grid that powers the city.
  const wireTargets = useMemo(
    () => [...cluster.map((b) => [b.x, b.h, b.z] as V3), [trafo.position[0], TRAFO_H + 0.03, trafo.position[2]] as V3],
    [cluster, trafo.position],
  );
  return (
    <group>
      {/* roads through the city */}
      {roads.map((p, i) => (
        <RoadRibbon key={`r${i}`} points={p} width={0.08} />
      ))}
      {/* curved roads on the side */}
      <RoadRibbon points={curveB} width={0.09} />
      {/* a lone car easing along the curved road every so often */}
      <Traffic path={curveB} />

      {/* the skyline + its civic peak; windows light up on town-hall hover */}
      <WindowDriver mat={winMat} />
      {cluster.map((b, i) => (
        <Building key={i} {...b} winMat={winMat} />
      ))}
      {/* a few homes left lit in the sleeping city (independent of the hover glow) */}
      <OccupiedWindows buildings={cluster} />
      <LifeGroup slug="alliander-hololens">
        <Skyscraper position={[0, 0, 0]} winMat={winMat} />
      </LifeGroup>
      {/* the neighbourhood transformer house — the substation that powers the
          city, on the front-centre plot facing the camera */}
      <TransformerHouse position={trafo.position} />
      {/* power lines from the central tower to every building + the transformer —
          glow blue on select */}
      <PowerWires from={[0, 0.8, 0]} targets={wireTargets} />


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

      {/* the homecoming celebration + the site that materialises with it */}
      <NextProjectSite />
      <CelebrationBurst />
    </group>
  );
}

