import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ComponentProps, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, Html, Line as DreiLine, MeshTransmissionMaterial, RoundedBox } from '@react-three/drei';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, DoubleSide, Line as ThreeLine, LineBasicMaterial, MeshStandardMaterial, Shape, ShapeGeometry, SRGBColorSpace, TextureLoader, Vector3, type Group, type Mesh, type Object3D, type Points as ThreePoints, type Texture } from 'three';
import { MAQUETTE_LAYERS, HOTSPOTS, LAYER_Y, LAYER_SCALE, anchorWorld, type Hotspot, type LayerId } from './framing';
import { useTweak } from './devTweak';
import { sceneStore, useSceneSelector } from './store';
import { useReducedMotion } from '../lib/useReducedMotion';
import { asset } from '../lib/asset';
import { caseBySlug } from '../content';

// Scale ladder (top → bottom): City (GIS / location), Room (games / apps / web),
// Chip (tools / CV / data). Each layer is a flat field of dots that fade into
// the background toward the rim, holding rounded, curved-line objects: round
// towers + domes + curved roads (city), soft furniture (room), a round die +
// curved traces (chip). Lines are a calm neutral; the layer accent (city =
// cyan, room = coral, chip = lime) is reserved for highlights, the floor and a
// sparse drifting point field.

const NEUTRAL = '#9fb6c6'; // soft white-blue — the wireframe lines
const GLASS = '#5b7da0';
const BG = '#0a0d10';

interface Palette {
  accent: string;
}
const PALETTE: Record<LayerId, Palette> = {
  city: { accent: '#27e8f2' },
  room: { accent: '#ff9068' },
  chip: { accent: '#a9f75c' },
};
const AccentCtx = createContext<Palette>(PALETTE.city);
const useAccent = () => useContext(AccentCtx);

type V3 = [number, number, number];

/* ---------- maths helpers ---------- */
function circlePts(r: number, seg = 56): V3[] {
  const p: V3[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    p.push([Math.cos(a) * r, 0, Math.sin(a) * r]);
  }
  return p;
}
function roundedRectPts(w: number, d: number, r: number, seg = 6): V3[] {
  const rr = Math.max(0.001, Math.min(r, w / 2 - 0.001, d / 2 - 0.001));
  const hw = w / 2 - rr;
  const hd = d / 2 - rr;
  const pts: V3[] = [];
  const corner = (cx: number, cz: number, a0: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * rr, 0, cz + Math.sin(a) * rr]);
    }
  };
  corner(hw, hd, 0);
  corner(-hw, hd, Math.PI / 2);
  corner(-hw, -hd, Math.PI);
  corner(hw, -hd, Math.PI * 1.5);
  pts.push(pts[0]);
  return pts;
}
function smoothCurve(pts: V3[], n = 50): V3[] {
  const curve = new CatmullRomCurve3(pts.map((p) => new Vector3(p[0], p[1], p[2])));
  return curve.getPoints(n).map((v) => [v.x, v.y, v.z] as V3);
}
function makeRand(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wrap drei's Line so every maquette line participates in the scene fog (its
 *  LineMaterial otherwise ignores fog), fading with depth like the meshes. */
function Line(props: ComponentProps<typeof DreiLine>) {
  return <DreiLine fog {...props} />;
}

/* ---------- Hover behaviours ----------
   Hovering a project's dot animates the object in a way that fits what it is:
   the phone vibrates, the monitor + chip + AR projection power on / flicker, the
   building windows light up, the park's trees rustle. Each reads the hovered
   slug from the store and eases a 0→1 value it drives its motion from. */
function useActive(slug: string) {
  const hovered = useSceneSelector((s) => s.hoveredSlug) === slug;
  const selected = useSceneSelector((s) => s.selectedSlug) === slug;
  const visited = useSceneSelector((s) => s.visited.includes(slug));
  return { hovered, selected, visited };
}
// Motion plays while hovered OR selected, so it keeps living once you click in.
function useHovered(slug: string) {
  const { hovered, selected } = useActive(slug);
  return hovered || selected;
}

// A springy squash-and-stretch bounce on the rising edge of `selected`, plus a
// gentle ongoing bob while it stays selected — the picked object springs to life
// in place. State is stashed on the object's userData so call sites just hand us
// the group/mesh each frame. Meant for a non-rotated (or yaw-only) object so the
// stretch runs along world-up; scaling anchors at the object's local origin.
function bounceObject(obj: Object3D, selected: boolean, reduced: boolean, delta: number, t: number, amp = 0.28) {
  const u = obj.userData;
  if (u.bBaseY === undefined) u.bBaseY = obj.position.y;
  if (selected && !u.bPrev && !reduced) u.bPop = 1; // trigger on the rising edge
  u.bPrev = selected;
  u.bPop = Math.max(0, (u.bPop ?? 0) - delta * 2.1);
  u.bSel = (u.bSel ?? 0) + ((selected ? 1 : 0) - (u.bSel ?? 0)) * 0.08;
  // phase 0 at the trigger → 1 as it settles; a decaying cosine gives an initial
  // stretch that oscillates (stretch → squash → settle).
  const spring = reduced ? 0 : Math.cos((1 - u.bPop) * Math.PI * 3) * u.bPop;
  const sq = spring * amp;
  obj.scale.set(1 - sq, 1 + sq, 1 - sq);
  obj.position.y = u.bBaseY + (reduced ? 0 : Math.sin(t * 3) * 0.02 * u.bSel);
}

/** A subtle vibration — the phone (a gentle buzz, not a rumble). */
function Jitter({ slug, children, amp = 0.005 }: { slug: string; children: ReactNode; amp?: number }) {
  const hovered = useHovered(slug);
  const reduced = useReducedMotion();
  const ref = useRef<Group>(null);
  const k = useRef(0);
  useFrame((s) => {
    const g = ref.current;
    if (!g) return;
    k.current += ((hovered ? 1 : 0) - k.current) * 0.2;
    const a = reduced ? 0 : k.current;
    const t = s.clock.elapsedTime;
    g.position.x = Math.sin(t * 50) * amp * a;
    g.position.z = Math.cos(t * 58) * amp * a;
    g.rotation.y = Math.sin(t * 45) * 0.022 * a;
  });
  return <group ref={ref}>{children}</group>;
}

/** An emissive surface that powers on at hover — a smooth "turn on" (chip, AR)
 *  or a TV-style flicker (the monitor). On *select* it shifts toward a lifelike
 *  colour and brightens further (so it blooms), making the pick feel rewarding. */
function EmissiveHover({ slug, position, rotation, args, color, liveColor, rest = 0.12, peak = 1.0, flicker = false }: {
  slug: string;
  position: V3;
  rotation?: V3;
  args: V3;
  color?: string;
  liveColor?: string;
  rest?: number;
  peak?: number;
  flicker?: boolean;
}) {
  const { accent } = useAccent();
  const col = color ?? accent;
  const { hovered, selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const mat = useRef<MeshStandardMaterial>(null);
  const meshRef = useRef<Mesh>(null);
  const k = useRef(0);
  const live = useRef(0);
  const base = useMemo(() => new Color(col), [col]);
  const lifelike = useMemo(() => new Color(liveColor ?? col), [liveColor, col]);
  useFrame((s, delta) => {
    if (meshRef.current) bounceObject(meshRef.current, selected, reduced, delta, s.clock.elapsedTime);
    if (!mat.current) return;
    // hover/select → full; visited → a calm lit idle; otherwise off
    const kT = hovered || selected ? 1 : visited ? 0.42 : 0;
    k.current += (kT - k.current) * (flicker ? 0.32 : 0.12);
    // colour resolves to lifelike once selected, and stays that way once visited
    live.current += ((selected || visited ? 1 : 0) - live.current) * 0.07;
    const t = s.clock.elapsedTime;
    let lvl;
    if (flicker) {
      const n = reduced ? 1 : Math.max(0.18, 0.55 + 0.5 * Math.sin(t * 46) * Math.sin(t * 8.7) + 0.2 * Math.sin(t * 113));
      lvl = rest + k.current * peak * n;
    } else {
      const breathe = reduced ? 0 : Math.sin(t * 2.2) * 0.07;
      lvl = rest + k.current * (peak + breathe);
    }
    mat.current.emissiveIntensity = lvl;
    mat.current.color.copy(base).lerp(lifelike, live.current);
    mat.current.emissive.copy(base).lerp(lifelike, live.current);
  });
  return (
    <mesh ref={meshRef} position={position} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial ref={mat} color={col} emissive={col} emissiveIntensity={rest} roughness={0.4} toneMapped={false} />
    </mesh>
  );
}

/** The room monitor. At rest it's a dim screen that flickers on as you hover;
 *  once visited it switches to a real screenshot (drop a JPG at
 *  public/textures/room-screen.jpg). Until that file exists it falls back to the
 *  plain lit screen, so nothing breaks. */
function RoomScreen({ slug, position, rotation, args }: { slug: string; position: V3; rotation?: V3; args: V3 }) {
  const { accent } = useAccent();
  const { hovered, selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const mat = useRef<MeshStandardMaterial>(null);
  const meshRef = useRef<Mesh>(null);
  const k = useRef(0);
  const shown = useRef(false);
  const [tex, setTex] = useState<Texture | null>(null);
  useEffect(() => {
    let cancelled = false;
    new TextureLoader().load(
      asset('/textures/room-screen.jpg'),
      (t) => {
        t.colorSpace = SRGBColorSpace;
        if (cancelled) t.dispose();
        else setTex(t);
      },
      undefined,
      () => {}, // not provided yet → keep the plain-screen fallback
    );
    return () => {
      cancelled = true;
    };
  }, []);
  useFrame((s, delta) => {
    if (meshRef.current) bounceObject(meshRef.current, selected, reduced, delta, s.clock.elapsedTime);
    const m = mat.current;
    if (!m) return;
    k.current += ((hovered || selected ? 1 : visited ? 0.42 : 0) - k.current) * 0.3;
    const wantImg = (selected || visited) && !!tex;
    if (wantImg !== shown.current) {
      shown.current = wantImg;
      m.map = wantImg ? tex : null;
      m.emissiveMap = wantImg ? tex : null;
      m.color.set(wantImg ? '#ffffff' : accent);
      m.emissive.set(wantImg ? '#ffffff' : accent);
      m.needsUpdate = true;
    }
    const t = s.clock.elapsedTime;
    const n = reduced ? 1 : Math.max(0.2, 0.6 + 0.45 * Math.sin(t * 46) * Math.sin(t * 8.7));
    m.emissiveIntensity = shown.current ? 0.6 + k.current * 0.5 : 0.3 + k.current * 0.9 * n;
  });
  return (
    <mesh ref={meshRef} position={position} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial ref={mat} color={accent} emissive={accent} emissiveIntensity={0.3} roughness={0.4} toneMapped={false} />
    </mesh>
  );
}

/** Drives the shared window material: hovering the town hall lights the whole
 *  skyline's windows (a calm blue). Once visited they stay softly lit, so the
 *  skyline keeps a quiet glow — toned down, never warm/orange. */
function WindowDriver({ mat }: { mat: MeshStandardMaterial }) {
  const { hovered, visited } = useActive('alliander-hololens');
  const reduced = useReducedMotion();
  const k = useRef(0);
  useFrame((s) => {
    const kT = hovered ? 1 : visited ? 0.5 : 0;
    k.current += (kT - k.current) * 0.09;
    const t = s.clock.elapsedTime;
    const flick = reduced ? 1 : 0.82 + 0.18 * Math.sin(t * 26) * Math.sin(t * 6.3);
    mat.emissiveIntensity = k.current * 1.1 * flick;
    mat.opacity = 0.08 + k.current * 0.6;
  });
  return null;
}

/* ---------- materials ---------- */

// A soft white-blue fresnel rim so the frosted-glass forms catch light along
// their silhouettes (more premium, less flat plastic). Injected into the
// standard material before fog/tonemapping so the rim hazes + tonemaps too.
const RIM = new Color('#b9d2e0');
function glassRim(shader: any) {
  shader.uniforms.uRim = { value: RIM };
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', 'uniform vec3 uRim;\nvoid main() {')
    .replace(
      '#include <opaque_fragment>',
      [
        '#include <opaque_fragment>',
        'float _rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.6);',
        'gl_FragColor.rgb += uRim * _rim * 0.5;',
        'gl_FragColor.a = clamp(gl_FragColor.a + _rim * 0.32, 0.0, 1.0);',
      ].join('\n'),
    );
}

function GlassMat({ color = GLASS, opacity = 0.2 }: { color?: string; opacity?: number }) {
  return (
    <meshStandardMaterial
      color={color}
      transparent
      opacity={opacity}
      roughness={0.34}
      metalness={0}
      emissive="#0c2a30"
      emissiveIntensity={0.14}
      depthWrite={false}
      onBeforeCompile={glassRim}
    />
  );
}

/** Like GlassMat, but a hotspot's body resolves from frosted glass to a
 *  near-solid, glossier material once it's been visited — so visited objects
 *  read as "real / high-definition" rather than abstract. */
function LiveGlassMat({ slug, color = GLASS, opacity = 0.2 }: { slug: string; color?: string; opacity?: number }) {
  const { selected, visited } = useActive(slug);
  const mat = useRef<MeshStandardMaterial>(null);
  const k = useRef(0);
  useFrame(() => {
    const m = mat.current;
    if (!m) return;
    k.current += ((selected || visited ? 1 : 0) - k.current) * 0.06;
    m.opacity = opacity + (0.94 - opacity) * k.current;
    m.roughness = 0.34 - 0.2 * k.current;
    m.metalness = 0.18 * k.current;
    m.depthWrite = k.current > 0.5;
  });
  return (
    <meshStandardMaterial
      ref={mat}
      color={color}
      transparent
      opacity={opacity}
      roughness={0.34}
      metalness={0}
      emissive="#0c2a30"
      emissiveIntensity={0.14}
      depthWrite={false}
      onBeforeCompile={glassRim}
    />
  );
}

/** Real refractive glass for the city towers. `transmissionSampler` shares one
 *  low-res transmission buffer across the whole skyline, so the refraction costs
 *  a single extra pass rather than one per building. The neutral <Edges> overlay
 *  still holds each silhouette against the dark stage. */
function CityGlass({ opacity = 0.9, thickness = 0.5 }: { opacity?: number; thickness?: number }) {
  return (
    <MeshTransmissionMaterial
      transmissionSampler
      samples={4}
      resolution={256}
      transmission={1}
      roughness={0.14}
      thickness={thickness}
      ior={1.35}
      chromaticAberration={0.05}
      distortion={0.12}
      distortionScale={0.2}
      temporalDistortion={0}
      color={GLASS}
      attenuationColor="#bfe9ff"
      attenuationDistance={2.5}
      transparent
      opacity={opacity}
    />
  );
}

/** Flat highlight box. Defaults to the layer accent, but decorative (non-hotspot)
 *  details pass color={NEUTRAL} so the layer colour stays on the interactables. */
function Accent({ position, args, intensity = 0.4, rotation, color }: { position: V3; args: V3; intensity?: number; rotation?: V3; color?: string }) {
  const { accent } = useAccent();
  const c = color ?? accent;
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={c} emissive={c} emissiveIntensity={intensity} roughness={0.4} />
    </mesh>
  );
}

/* ---------- shape helpers ---------- */
/** A square diorama building (glass fill, neutral edges). When given a shared
 *  `winMat`, it grows a grid of windows on its two camera-facing sides that
 *  light up when the town hall is hovered. */
function Building({ x, z, w, d, h, winMat }: { x: number; z: number; w: number; d: number; h: number; winMat?: MeshStandardMaterial }) {
  const windows = useMemo(() => {
    if (!winMat) return [] as { p: V3; r?: V3; s: [number, number] }[];
    const out: { p: V3; r?: V3; s: [number, number] }[] = [];
    const rows = Math.max(1, Math.floor((h - 0.06) / 0.11));
    for (let r = 0; r < rows; r++) {
      const yy = 0.09 + r * 0.11;
      if (yy > h - 0.05) break;
      for (const c of [-1, 1]) {
        out.push({ p: [c * w * 0.22, yy, d / 2 + 0.004], s: [w * 0.26, 0.05] });
        out.push({ p: [w / 2 + 0.004, yy, c * d * 0.22], r: [0, Math.PI / 2, 0], s: [d * 0.26, 0.05] });
      }
    }
    return out;
  }, [w, d, h, winMat]);
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <CityGlass thickness={Math.max(w, d)} />
        <Edges threshold={20} color={NEUTRAL} />
      </mesh>
      {windows.map((win, i) => (
        <mesh key={i} position={win.p} rotation={win.r} material={winMat}>
          <planeGeometry args={win.s} />
        </mesh>
      ))}
    </group>
  );
}

/** A Dutch windmill (smock mill) with slowly turning sails. */
function Windmill({ position }: { position: V3 }) {
  const sails = useRef<Group>(null);
  const reduced = useReducedMotion();
  useFrame((s) => {
    if (sails.current && !reduced) sails.current.rotation.z = s.clock.elapsedTime * 0.5;
  });
  return (
    <group position={position}>
      {/* grassy mound */}
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.24, 0.3, 0.06, 20]} />
        <GlassMat color="#2f8a6e" opacity={0.18} />
      </mesh>
      {/* tapered octagonal body */}
      <mesh position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.12, 0.19, 0.56, 8]} />
        <GlassMat opacity={0.44} />
        <Edges threshold={20} color={NEUTRAL} />
      </mesh>
      {/* cap */}
      <mesh position={[0, 0.67, 0]}>
        <coneGeometry args={[0.15, 0.16, 8]} />
        <GlassMat opacity={0.3} />
        <Edges threshold={20} color={NEUTRAL} />
      </mesh>
      {/* sails — a turning cross on the front face */}
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
  );
}

/** A stylised low-poly tree: a slim trunk and a faceted canopy cluster. Park
 *  trees sway from their root and, once visited, the foliage greens up + solidifies. */
function TreeRound({ position, h = 0.45, swaySlug }: { position: V3; h?: number; swaySlug?: string }) {
  const { hovered, selected, visited } = useActive(swaySlug ?? '');
  const reduced = useReducedMotion();
  const ref = useRef<Group>(null);
  const k = useRef(0);
  const live = useRef(0);
  // a per-tree phase so the trees rustle out of sync rather than as one block
  const phase = useMemo(() => position[0] * 5.3 + position[2] * 3.7, [position]);
  const restCol = useMemo(() => new Color('#3f7d72'), []); // muted teal-green at rest
  const vivid = useMemo(() => new Color('#62c265'), []); // lifelike leaf green once visited
  // one shared canopy material so all the blobs green up together
  const leaf = useMemo(
    () => new MeshStandardMaterial({ color: '#3f7d72', flatShading: true, roughness: 0.7, metalness: 0, transparent: true, opacity: 0.3 }),
    [],
  );
  useFrame((s) => {
    if (swaySlug) {
      live.current += ((selected || visited ? 1 : 0) - live.current) * 0.06;
      leaf.color.copy(restCol).lerp(vivid, live.current);
      leaf.opacity = 0.55 + live.current * 0.4;
    }
    const g = ref.current;
    if (!g || !swaySlug) return;
    k.current += ((hovered || selected ? 1 : visited ? 0.4 : 0) - k.current) * 0.08;
    const a = reduced ? 0 : k.current;
    const t = s.clock.elapsedTime;
    g.rotation.z = Math.sin(t * 2.0 + phase) * 0.12 * a;
    g.rotation.x = Math.cos(t * 1.6 + phase * 1.3) * 0.075 * a;
  });
  const r = 0.14;
  return (
    <group position={position}>
      {/* trunk + canopy pivot at the base (the root), so each tree sways alone */}
      <group ref={ref}>
        <mesh position={[0, h * 0.3, 0]}>
          <cylinderGeometry args={[0.012, 0.022, h * 0.6, 6]} />
          <meshStandardMaterial color="#586a61" roughness={0.85} metalness={0} />
        </mesh>
        <group position={[0, h * 0.62, 0]}>
          <mesh material={leaf}>
            <icosahedronGeometry args={[r, 0]} />
          </mesh>
          <mesh material={leaf} position={[r * 0.62, r * 0.5, -r * 0.2]} rotation={[0.5, 0.8, 0]}>
            <icosahedronGeometry args={[r * 0.7, 0]} />
          </mesh>
          <mesh material={leaf} position={[-r * 0.55, r * 0.34, r * 0.28]} rotation={[0.2, -0.6, 0.3]}>
            <icosahedronGeometry args={[r * 0.64, 0]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** Soft rounded box (furniture, the chip package). Optional top outline. With a
 *  `liveSlug` its glass solidifies once that hotspot is visited. */
function SoftBox({ position, args, radius = 0.03, opacity = 0.2, outline = false, rotation, color, liveSlug }: { position: V3; args: V3; radius?: number; opacity?: number; outline?: boolean; rotation?: V3; color?: string; liveSlug?: string }) {
  // Clamp so the corner radius never exceeds half the smallest side.
  const r = Math.min(radius, Math.min(args[0], args[1], args[2]) / 2 - 0.002);
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={args} radius={r} smoothness={3}>
        {liveSlug ? <LiveGlassMat slug={liveSlug} opacity={opacity} color={color} /> : <GlassMat opacity={opacity} color={color} />}
      </RoundedBox>
      {outline && (
        <Line points={roundedRectPts(args[0], args[2], radius * 1.6)} position={[0, args[1] / 2, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.45} />
      )}
    </group>
  );
}

/** Flat floor of dots that fade into the background toward the rim. Neutral —
 *  the layer colour is reserved for the project dots + a few details. */
function DotFloor({ step = 0.26 }: { step?: number }) {
  const R = 2.2;
  const { positions, colors } = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    const c = new Color(NEUTRAL);
    const bg = new Color(BG);
    const tmp = new Color();
    for (let x = -R; x <= R + 1e-6; x += step)
      for (let z = -R; z <= R + 1e-6; z += step) {
        const d = Math.hypot(x, z);
        if (d > R) continue;
        pos.push(x, 0, z);
        const fade = Math.pow(1 - d / R, 1.5);
        tmp.copy(bg).lerp(c, 0.06 + 0.5 * fade);
        col.push(tmp.r, tmp.g, tmp.b);
      }
    return { positions: new Float32Array(pos), colors: new Float32Array(col) };
  }, [step]);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.022} vertexColors transparent opacity={0.7} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/** A sparse field of neutral points drifting slowly above the layer. */
function PointCloud({ seed }: { seed: number }) {
  const ref = useRef<ThreePoints>(null);
  const reduced = useReducedMotion();
  const positions = useMemo(() => {
    const rnd = makeRand(seed);
    const n = 32;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const ang = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 1.95;
      a[i * 3] = Math.cos(ang) * r;
      a[i * 3 + 1] = 0.35 + rnd() * 1.0;
      a[i * 3 + 2] = Math.sin(ang) * r;
    }
    return a;
  }, [seed]);
  useFrame((state) => {
    if (ref.current && !reduced) ref.current.rotation.y = state.clock.elapsedTime * 0.02;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.016} color={NEUTRAL} transparent opacity={0.22} sizeAttenuation depthWrite={false} />
    </points>
  );
}

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

function Park({ position, rustleSlug }: { position: V3; rustleSlug?: string }) {
  const { accent } = useAccent();
  const { selected, visited } = useActive(rustleSlug ?? '');
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
  useFrame((s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta, s.clock.elapsedTime, 0.14);
  });
  return (
    <group position={position}>
      <group ref={popRef}>
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.02, 44]} />
        <LiveGlassMat slug="niantic-explorer" color="#2f8a6e" opacity={0.15} />
      </mesh>
      <Line points={circlePts(0.5)} position={[0, 0.024, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.4} />
      {/* lake — an irregular water body with shore, ripples, a jetty + reeds */}
      <group position={[-0.14, 0, 0.18]}>
        <mesh geometry={lake.geo} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <LiveGlassMat slug="niantic-explorer" color="#27557d" opacity={0.4} />
        </mesh>
        {/* lighter shallows */}
        <mesh position={[0.03, 0.025, -0.02]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.1, 28]} />
          <LiveGlassMat slug="niantic-explorer" color="#4a96c0" opacity={0.3} />
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
      </group>
      <TreeRound position={[0.2, 0, -0.18]} h={0.44} swaySlug={rustleSlug} />
      <TreeRound position={[0.24, 0, 0.22]} h={0.36} swaySlug={rustleSlug} />
      <TreeRound position={[-0.22, 0, -0.24]} h={0.4} swaySlug={rustleSlug} />
      </group>
    </group>
  );
}

/** The civic peak of the skyline — a square block + clock tower + spire. */
// The city's centrepiece: a fancy tapering, gently twisting glass skyscraper
// with a lit crown — carries the Alliander hotspot. Each tier steps back and
// rotates a little as it rises, so the corners spiral; horizontal floor bands
// (the shared winMat, ramped by WindowDriver) glow when the node is engaged,
// and the crown beacon pulses.
const TOWER_TIERS = [
  { base: 0.0, h: 0.3, s: 0.3, rot: 0.0 },
  { base: 0.3, h: 0.27, s: 0.245, rot: 0.13 },
  { base: 0.57, h: 0.24, s: 0.19, rot: 0.26 },
  { base: 0.81, h: 0.2, s: 0.135, rot: 0.39 },
];
const TOWER_TOP = 1.01; // top of the highest tier (0.81 + 0.2)

function Skyscraper({ position, winMat }: { position: V3; winMat?: MeshStandardMaterial }) {
  const { accent } = useAccent();
  const { selected } = useActive('alliander-hololens');
  const beacon = useRef<MeshStandardMaterial>(null);
  const reduced = useReducedMotion();
  const popRef = useRef<Group>(null);
  useFrame((s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta, s.clock.elapsedTime, 0.22);
    if (!beacon.current) return;
    const t = reduced ? 0 : s.clock.elapsedTime;
    beacon.current.emissiveIntensity = 0.45 + 0.55 * Math.abs(Math.sin(t * 2.1));
  });
  return (
    <group position={position}>
      <group ref={popRef}>
      {TOWER_TIERS.map((tr, i) => (
        <group key={i} rotation={[0, tr.rot, 0]}>
          <mesh position={[0, tr.base + tr.h / 2, 0]}>
            <boxGeometry args={[tr.s, tr.h, tr.s]} />
            <LiveGlassMat slug="alliander-hololens" opacity={0.4} />
            <Edges threshold={20} color={NEUTRAL} />
          </mesh>
          {/* lit floor bands on the two camera-facing sides of each tier */}
          {winMat &&
            [0.34, 0.66].map((f, r) => {
              const yy = tr.base + tr.h * f;
              return [
                <mesh key={`z${r}`} position={[0, yy, tr.s / 2 + 0.003]} material={winMat}>
                  <planeGeometry args={[tr.s * 0.72, 0.03]} />
                </mesh>,
                <mesh key={`x${r}`} position={[tr.s / 2 + 0.003, yy, 0]} rotation={[0, Math.PI / 2, 0]} material={winMat}>
                  <planeGeometry args={[tr.s * 0.72, 0.03]} />
                </mesh>,
              ];
            })}
        </group>
      ))}
      {/* crown: a tapered glass cap, an antenna mast and a slow-pulsing beacon */}
      <mesh position={[0, TOWER_TOP + 0.07, 0]} rotation={[0, 0.39, 0]}>
        <coneGeometry args={[0.085, 0.16, 4]} />
        <GlassMat opacity={0.32} />
        <Edges threshold={30} color={NEUTRAL} />
      </mesh>
      <mesh position={[0, TOWER_TOP + 0.2, 0]}>
        <cylinderGeometry args={[0.005, 0.005, 0.12, 8]} />
        <meshStandardMaterial color={NEUTRAL} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, TOWER_TOP + 0.28, 0]}>
        <sphereGeometry args={[0.016, 12, 12]} />
        <meshStandardMaterial ref={beacon} color={accent} emissive={accent} emissiveIntensity={0.6} toneMapped={false} />
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

function CityRig() {
  // Roads: a grid threading between the blocks, three avenues out toward the
  // church / windmill / park, and two curved roads sweeping around the side.
  const roads: V3[][] = useMemo(
    () => [
      [[-0.3, 0.01, -0.9], [-0.3, 0.01, 0.9]],
      [[0.3, 0.01, -0.9], [0.3, 0.01, 0.9]],
      [[-0.9, 0.01, -0.3], [0.9, 0.01, -0.3]],
      [[-0.9, 0.01, 0.3], [0.9, 0.01, 0.3]],
      [[0.3, 0.01, 0.3], [1.0, 0.01, 0.6]],
      [[-0.3, 0.01, 0.3], [-1.15, 0.01, 0.5]],
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
    const cells = [-0.58, 0, 0.58];
    for (const cx of cells)
      for (const cz of cells) {
        if (cx === 0 && cz === 0) continue; // central plaza → town hall
        const count = rnd() < 0.45 ? 2 : 1;
        for (let k = 0; k < count; k++) {
          const x = cx + (rnd() - 0.5) * 0.16;
          const z = cz + (rnd() - 0.5) * 0.16;
          const fall = Math.max(0.16, 1 - (x * x + z * z) * 0.8);
          out.push({ x, z, w: 0.13 + rnd() * 0.05, d: 0.13 + rnd() * 0.05, h: 0.2 + fall * 0.4 + rnd() * 0.12 });
        }
      }
    return out;
  }, []);
  const { accent } = useAccent();
  // one shared material for every window, ramped by WindowDriver on town-hall hover
  const winMat = useMemo(
    () => new MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0, transparent: true, opacity: 0.1, roughness: 0.4, toneMapped: false, depthWrite: false }),
    [accent],
  );
  // DEV-only position scrubbers; tree-shaken from production builds (see devTweak).
  const mill = useTweak('City.Windmill', { position: [-1.2, 0, 0.5] });
  const park = useTweak('City.Park', { position: [1.05, 0, -0.72] });
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
      <Skyscraper position={[0, 0, 0]} winMat={winMat} />

      {/* windmill on the side */}
      <Windmill position={mill.position} />

      {/* parks (the first carries the niantic-explorer hotspot — its trees rustle) */}
      <Park position={park.position} rustleSlug="niantic-explorer" />
    </group>
  );
}

/* ---------- Room — games, apps & websites (middle) ---------- */

// A tiny race car for the Lightship Drive AR table — chassis, nose, cabin, a
// rear wing and four wheels — pointing along its local +z (its heading).
function RaceCar({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.007, -0.002]}>
        <boxGeometry args={[0.03, 0.012, 0.06]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.4} metalness={0.1} toneMapped={false} />
      </mesh>
      {/* nose */}
      <mesh position={[0, 0.005, 0.032]}>
        <boxGeometry args={[0.024, 0.008, 0.018]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.4} toneMapped={false} />
      </mesh>
      {/* cabin / windscreen */}
      <mesh position={[0, 0.017, -0.004]}>
        <boxGeometry args={[0.022, 0.012, 0.026]} />
        <meshStandardMaterial color="#0b1418" emissive={color} emissiveIntensity={0.12} roughness={0.25} toneMapped={false} />
      </mesh>
      {/* rear wing */}
      <mesh position={[0, 0.016, -0.03]}>
        <boxGeometry args={[0.032, 0.002, 0.008]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} roughness={0.4} toneMapped={false} />
      </mesh>
      {/* wheels */}
      {([[-0.018, 0.022], [0.018, 0.022], [-0.018, -0.022], [0.018, -0.022]] as [number, number][]).map(([wx, wz], i) => (
        <mesh key={i} position={[wx, 0.002, wz]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.008, 0.008, 0.006, 12]} />
          <meshStandardMaterial color="#161f27" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

// The cars launch off a ramp partway round the loop: a short window where they
// rise on a sine arc and pitch nose-up (take-off) then nose-down (landing).
const JUMP_FR = 0.0; // ramp position along the loop (0..1)
const JUMP_SPAN = 0.18; // how much of the lap the jump covers
const JUMP_H = 0.078; // peak height
const JUMP_PITCH = 0.5; // nose tilt at take-off / landing (rad)
function jumpAt(f: number) {
  let p = f - JUMP_FR;
  if (p < 0) p += 1;
  if (p < JUMP_SPAN) {
    const u = p / JUMP_SPAN;
    return { dy: JUMP_H * Math.sin(Math.PI * u), pitch: -JUMP_PITCH * Math.cos(Math.PI * u) };
  }
  return { dy: 0, pitch: 0 };
}

/** Coffee table with an AR race loop, two cars and a ramp they jump (Lightship
 *  Drive). On hover the cars lap the loop and launch off the ramp. */
function CoffeeTableAR({ position, hoverSlug }: { position: V3; hoverSlug?: string }) {
  const { accent } = useAccent();
  const { hovered, selected, visited } = useActive(hoverSlug ?? '');
  const reduced = useReducedMotion();
  const track = useMemo(
    () =>
      smoothCurve(
        [
          [0.22, 0, 0.0], [0.1, 0, 0.16], [-0.12, 0, 0.14], [-0.22, 0, 0.0],
          [-0.12, 0, -0.15], [0.1, 0, -0.16], [0.22, 0, 0.0],
        ],
        64,
      ),
    [],
  );
  const car1 = useRef<Group>(null);
  const car2 = useRef<Group>(null);
  const k = useRef(0);
  const dist = useRef(0.3); // park the cars away from the ramp at rest
  const popRef = useRef<Group>(null);
  // the ramp sits on the loop at JUMP_FR, oriented along the track there
  const ramp = useMemo(() => {
    const n = track.length;
    const i = Math.min(n - 2, Math.floor(JUMP_FR * (n - 1)));
    const a = track[i];
    const b = track[i + 1];
    return { pos: [a[0], 0.196, a[2]] as V3, rotY: Math.atan2(b[0] - a[0], b[2] - a[2]) };
  }, [track]);
  const place = (g: Group | null, t: number) => {
    if (!g) return;
    const n = track.length;
    const f = ((t % 1) + 1) % 1;
    const i = Math.min(n - 2, Math.floor(f * (n - 1)));
    const a = track[i];
    const b = track[i + 1];
    const { dy, pitch } = jumpAt(f);
    g.rotation.order = 'YXZ';
    g.position.set(a[0], 0.202 + dy, a[2]);
    g.rotation.y = Math.atan2(b[0] - a[0], b[2] - a[2]);
    g.rotation.x = pitch;
  };
  useFrame((s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta, s.clock.elapsedTime);
    k.current += ((hovered || selected ? 1 : visited ? 0.4 : 0) - k.current) * 0.1;
    if (!reduced) dist.current += delta * 0.22 * k.current;
    place(car1.current, dist.current);
    place(car2.current, dist.current + 0.5);
  });
  const rampAngle = Math.atan2(JUMP_H, 0.085);
  return (
    <group position={position}>
      <group ref={popRef}>
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.32, 0.32, 0.03, 40]} />
          <LiveGlassMat slug="lightship-drive" opacity={0.2} />
          <Edges threshold={30} color={NEUTRAL} />
        </mesh>
        {([[0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]] as [number, number][]).map(([lx, lz], i) => (
          <mesh key={i} position={[lx, 0.09, lz]}>
            <cylinderGeometry args={[0.016, 0.016, 0.18, 10]} />
            <GlassMat opacity={0.24} />
          </mesh>
        ))}
        {/* the AR race loop */}
        <Line points={track} position={[0, 0.2, 0]} color={accent} lineWidth={1.6} transparent opacity={0.7} />
        {/* the ramp the cars launch off */}
        <group position={ramp.pos} rotation={[0, ramp.rotY, 0]}>
          <mesh position={[0, JUMP_H * 0.5, 0]} rotation={[-rampAngle, 0, 0]}>
            <boxGeometry args={[0.05, 0.006, 0.085]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.45} transparent opacity={0.55} roughness={0.4} toneMapped={false} />
            <Edges threshold={20} color={NEUTRAL} />
          </mesh>
        </group>
        {/* the two cars */}
        <group ref={car1}>
          <RaceCar color="#ff5a4d" />
        </group>
        <group ref={car2}>
          <RaceCar color="#4d9bff" />
        </group>
      </group>
    </group>
  );
}

/** A VR headset prop on a stand (Virtuele Brigade). */
function VRHeadset({ position, rotation }: { position: V3; rotation?: V3 }) {
  const strap = useMemo(() => smoothCurve([[-0.075, 0, 0], [-0.05, 0.06, -0.055], [0.05, 0.06, -0.055], [0.075, 0, 0]], 24), []);
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[0.16, 0.09, 0.1]} radius={0.03} smoothness={3}>
        <GlassMat opacity={0.3} />
      </RoundedBox>
      <Accent position={[0, 0, 0.052]} args={[0.11, 0.05, 0.004]} intensity={0.3} color={NEUTRAL} />
      <Line points={strap} color={NEUTRAL} lineWidth={1.2} transparent opacity={0.5} />
    </group>
  );
}

/** A floor lamp with a glowing shade. */
function FloorLamp({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.006, 0]}>
        <cylinderGeometry args={[0.12, 0.13, 0.012, 24]} />
        <GlassMat opacity={0.22} />
      </mesh>
      <mesh position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.66, 8]} />
        <GlassMat opacity={0.3} />
      </mesh>
      <mesh position={[0, 0.72, 0]}>
        <coneGeometry args={[0.14, 0.18, 22, 1, true]} />
        <GlassMat opacity={0.2} />
        <Edges threshold={30} color={NEUTRAL} />
      </mesh>
      <Accent position={[0, 0.66, 0]} args={[0.07, 0.02, 0.07]} intensity={0.5} color={NEUTRAL} />
    </group>
  );
}

/** A leafy potted houseplant — upright arching blades fanning out of a pot. */
function PottedPlant({ position }: { position: V3 }) {
  const blades = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        a: (i / 9) * Math.PI * 2 + (i % 2) * 0.4,
        tilt: 0.13 + (i % 3) * 0.08,
        len: 0.34 + ((i * 7) % 3) * 0.07,
        c: i % 2 ? '#3f8f5e' : '#4fa86e',
      })),
    [],
  );
  return (
    <group position={position}>
      {/* pot */}
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.13, 0.1, 0.16, 22]} />
        <GlassMat color="#9a6b4e" opacity={0.55} />
        <Edges threshold={24} color={NEUTRAL} />
      </mesh>
      {/* soil */}
      <mesh position={[0, 0.165, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.012, 20]} />
        <meshStandardMaterial color="#2b2420" roughness={0.95} />
      </mesh>
      {/* leaf blades */}
      {blades.map((b, i) => (
        <group key={i} position={[0, 0.17, 0]} rotation={[0, b.a, 0]}>
          <group rotation={[b.tilt, 0, 0]}>
            <mesh position={[0, b.len / 2, 0]} scale={[1, 1, 0.18]}>
              <coneGeometry args={[0.045, b.len, 5]} />
              <meshStandardMaterial color={b.c} flatShading roughness={0.65} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

// Books on the shelves (local to the bookcase group), standing spine-out with
// real depth, varied size + muted colour; a couple lean. Each shelf packed.
const BOOKS: { p: V3; s: V3; c: string; r?: V3 }[] = [
  // top shelf (y ≈ 0.78)
  { p: [-0.30, 0.78, 0.02], s: [0.05, 0.17, 0.18], c: '#2f4a6b' },
  { p: [-0.245, 0.785, 0.02], s: [0.045, 0.18, 0.18], c: '#3a608a' },
  { p: [-0.19, 0.778, 0.02], s: [0.052, 0.165, 0.18], c: '#4f74a6' },
  { p: [-0.12, 0.79, 0.02], s: [0.06, 0.19, 0.18], c: '#26405f' },
  { p: [-0.05, 0.775, 0.02], s: [0.046, 0.16, 0.18], c: '#5b7cab' },
  { p: [0.02, 0.783, 0.02], s: [0.05, 0.175, 0.18], c: '#6f8cb6' },
  { p: [0.10, 0.78, 0.02], s: [0.055, 0.17, 0.18], c: '#2f4a6b' },
  { p: [0.185, 0.787, 0.02], s: [0.05, 0.185, 0.18], c: '#3a608a' },
  { p: [0.258, 0.742, 0.02], s: [0.05, 0.16, 0.18], c: '#4f74a6', r: [0, 0, 0.17] }, // leaning
  // middle shelf (y ≈ 0.52) — gap at x ≈ 0.12 for the orange book
  { p: [-0.30, 0.52, 0.02], s: [0.05, 0.17, 0.18], c: '#5b7cab' },
  { p: [-0.245, 0.515, 0.02], s: [0.048, 0.16, 0.18], c: '#26405f' },
  { p: [-0.185, 0.523, 0.02], s: [0.055, 0.18, 0.18], c: '#3a608a' },
  { p: [-0.11, 0.52, 0.02], s: [0.05, 0.17, 0.18], c: '#6f8cb6' },
  { p: [-0.04, 0.518, 0.02], s: [0.052, 0.165, 0.18], c: '#2f4a6b' },
  { p: [0.26, 0.52, 0.02], s: [0.05, 0.17, 0.18], c: '#5b7cab' },
  { p: [0.214, 0.5, 0.02], s: [0.05, 0.15, 0.18], c: '#26405f', r: [0, 0, -0.15] }, // leaning into the gap
  // bottom shelf (y ≈ 0.26) — books, then a horizontal stack fills the right
  { p: [-0.30, 0.26, 0.02], s: [0.052, 0.17, 0.18], c: '#3a608a' },
  { p: [-0.24, 0.265, 0.02], s: [0.05, 0.18, 0.18], c: '#4f74a6' },
  { p: [-0.18, 0.258, 0.02], s: [0.055, 0.165, 0.18], c: '#2f4a6b' },
  { p: [-0.11, 0.262, 0.02], s: [0.048, 0.175, 0.18], c: '#26405f' },
  { p: [-0.04, 0.26, 0.02], s: [0.05, 0.17, 0.18], c: '#5b7cab' },
  { p: [0.03, 0.255, 0.02], s: [0.052, 0.16, 0.18], c: '#6f8cb6' },
];

/** The Zwijsen AR-books spine — a closed orange book on the shelf that lifts out
 *  and opens on select, revealing its inner spread. Drop a JPG at
 *  public/textures/zwijsen-book.jpg for the spread; until then it falls back to a
 *  plain cream page, so nothing breaks. */
function OpenBook({ slug, position }: { slug: string; position: V3 }) {
  const { hovered, selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const grp = useRef<Group>(null);
  const cover = useRef<Group>(null);
  const sel = useRef(0); // 0 = closed on the shelf, 1 = lifted + open
  const glow = useRef(0);
  const live = useRef(0);
  const [tex, setTex] = useState<Texture | null>(null);
  const base = useMemo(() => new Color('#ff7a3d'), []);
  const lively = useMemo(() => new Color('#ffb066'), []);
  const bodyMat = useMemo(
    () => new MeshStandardMaterial({ color: '#ff7a3d', emissive: '#ff7a3d', emissiveIntensity: 0.3, roughness: 0.4, toneMapped: false }),
    [],
  );
  useEffect(() => {
    let cancelled = false;
    new TextureLoader().load(
      asset('/textures/zwijsen-book.jpg'),
      (t) => {
        t.colorSpace = SRGBColorSpace;
        if (cancelled) t.dispose();
        else setTex(t);
      },
      undefined,
      () => {}, // not provided yet → keep the cream-page fallback
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const W = 0.16;
  const H = 0.2;
  const T = 0.012;
  useFrame(() => {
    sel.current += ((selected ? 1 : 0) - sel.current) * 0.09;
    glow.current += ((hovered || selected ? 1 : visited ? 0.4 : 0) - glow.current) * 0.12;
    live.current += ((selected || visited ? 1 : 0) - live.current) * 0.06;
    const s = reduced ? (selected ? 1 : 0) : sel.current;
    const g = grp.current;
    if (g) {
      // closed → standing cover-out (rot.x = 90°); open → tilted back toward the
      // player and lifted forward so the spread reads face-on
      g.rotation.x = (Math.PI / 2) * (1 - s) + 1.18 * s;
      g.rotation.y = 0.4 * s;
      g.position.set(position[0] - 0.03 * s, position[1] + 0.14 * s, position[2] + 0.02 + 0.26 * s);
    }
    if (cover.current) cover.current.rotation.z = 2.4 * s; // front cover swings open
    bodyMat.emissiveIntensity = 0.28 + glow.current * 0.7;
    bodyMat.color.copy(base).lerp(lively, live.current * 0.6);
    bodyMat.emissive.copy(base).lerp(lively, live.current * 0.6);
  });
  return (
    <group ref={grp} position={position}>
      {/* page block (cream) between the covers */}
      <mesh position={[0.006, 0, 0]}>
        <boxGeometry args={[W - 0.02, 0.02, H - 0.012]} />
        <meshStandardMaterial color="#efe6d0" emissive="#efe6d0" emissiveIntensity={0.1} roughness={0.85} />
      </mesh>
      {/* back cover */}
      <mesh position={[0, -0.012, 0]} material={bodyMat}>
        <boxGeometry args={[W, T, H]} />
      </mesh>
      {/* inner spread — the texture (or cream fallback), facing up */}
      <mesh position={[0.006, 0.011, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W - 0.022, H - 0.018]} />
        {tex ? (
          <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.55} roughness={0.7} toneMapped={false} />
        ) : (
          <meshStandardMaterial color="#f3ead4" emissive="#f3ead4" emissiveIntensity={0.16} roughness={0.85} />
        )}
      </mesh>
      {/* spine */}
      <mesh position={[-W / 2, 0, 0]} material={bodyMat}>
        <boxGeometry args={[0.016, T + 0.03, H]} />
      </mesh>
      {/* front cover — hinged at the spine, lifts open on select */}
      <group ref={cover} position={[-W / 2, 0.012, 0]}>
        <mesh position={[W / 2, 0, 0]} material={bodyMat}>
          <boxGeometry args={[W, T, H]} />
        </mesh>
        {/* a title plate on the cover */}
        <mesh position={[W / 2, T * 0.6, 0.03]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[W * 0.52, 0.045]} />
          <meshStandardMaterial color="#fff0db" emissive="#fff0db" emissiveIntensity={0.3} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** An under-shelf light strip that warms up when the Zwijsen book is engaged. */
function ShelfLight({ y }: { y: number }) {
  const { hovered, selected, visited } = useActive('zwijsen-ar-books');
  const mat = useRef<MeshStandardMaterial>(null);
  const k = useRef(0);
  useFrame(() => {
    const t = hovered || selected ? 1 : visited ? 0.35 : 0;
    k.current += (t - k.current) * 0.1;
    if (mat.current) mat.current.emissiveIntensity = k.current * 1.5;
  });
  return (
    <mesh position={[0, y, 0.11]}>
      <boxGeometry args={[0.66, 0.006, 0.014]} />
      <meshStandardMaterial ref={mat} color="#ffe2b4" emissive="#ffe2b4" emissiveIntensity={0} roughness={0.4} toneMapped={false} />
    </mesh>
  );
}

/** The bookcase. Engaging the Zwijsen book "turns it on": the under-shelf strips
 *  warm up and the book spines glow, alongside the orange book lifting + opening. */
function Bookcase({ position }: { position: V3 }) {
  const { hovered, selected, visited } = useActive('zwijsen-ar-books');
  const bookMats = useRef<(MeshStandardMaterial | null)[]>([]);
  const lit = useRef(0);
  const reduced = useReducedMotion();
  const popRef = useRef<Group>(null);
  useFrame((s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta, s.clock.elapsedTime, 0.1);
    const t = hovered || selected ? 1 : visited ? 0.3 : 0;
    lit.current += (t - lit.current) * 0.1;
    const e = 0.1 + lit.current * 0.7;
    for (const m of bookMats.current) if (m) m.emissiveIntensity = e;
  });
  return (
    <group position={position}>
      <group ref={popRef}>
      {/* case frame: back, sides, top, base */}
      <SoftBox position={[0, 0.46, -0.09]} args={[0.74, 0.92, 0.06]} radius={0.02} />
      <SoftBox position={[-0.355, 0.46, 0.04]} args={[0.03, 0.92, 0.26]} radius={0.01} />
      <SoftBox position={[0.355, 0.46, 0.04]} args={[0.03, 0.92, 0.26]} radius={0.01} />
      <SoftBox position={[0, 0.915, 0.04]} args={[0.74, 0.03, 0.26]} radius={0.01} />
      <SoftBox position={[0, 0.02, 0.04]} args={[0.74, 0.04, 0.26]} radius={0.01} />
      {/* shelves */}
      {[0.16, 0.42, 0.68].map((sy, s) => (
        <SoftBox key={s} position={[0, sy, 0.04]} args={[0.7, 0.02, 0.24]} radius={0.006} opacity={0.3} />
      ))}
      {/* under-shelf light strips — warm up when engaged (the bookcase turns on) */}
      {[0.4, 0.66, 0.9].map((y, i) => (
        <ShelfLight key={`l${i}`} y={y} />
      ))}
      {/* books — their spines glow when the bookcase is on */}
      {BOOKS.map((bk, i) => (
        <mesh key={i} position={bk.p} rotation={bk.r}>
          <boxGeometry args={bk.s} />
          <meshStandardMaterial ref={(m) => (bookMats.current[i] = m)} color={bk.c} emissive={bk.c} emissiveIntensity={0.1} roughness={0.6} />
        </mesh>
      ))}
      {/* a horizontal stack on the bottom-right shelf */}
      <group position={[0.19, 0.19, 0.02]}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.2, 0.03, 0.16]} />
          <meshStandardMaterial color="#26405f" emissive="#26405f" emissiveIntensity={0.12} roughness={0.6} />
        </mesh>
        <mesh position={[0.01, 0.032, 0.006]}>
          <boxGeometry args={[0.19, 0.028, 0.155]} />
          <meshStandardMaterial color="#3a608a" emissive="#3a608a" emissiveIntensity={0.12} roughness={0.6} />
        </mesh>
        <mesh position={[-0.008, 0.062, -0.004]}>
          <boxGeometry args={[0.18, 0.026, 0.15]} />
          <meshStandardMaterial color="#4f74a6" emissive="#4f74a6" emissiveIntensity={0.12} roughness={0.6} />
        </mesh>
      </group>
      {/* a little potted plant on top for detail */}
      <group position={[0.25, 0.93, 0.05]}>
        <mesh position={[0, 0.018, 0]}>
          <cylinderGeometry args={[0.03, 0.024, 0.04, 16]} />
          <GlassMat color="#8a6a4f" opacity={0.45} />
        </mesh>
        <mesh position={[0, 0.07, 0]}>
          <icosahedronGeometry args={[0.045, 0]} />
          <meshStandardMaterial color="#3f7d62" flatShading roughness={0.7} />
        </mesh>
      </group>
      <OpenBook slug="zwijsen-ar-books" position={[0.12, 0.52, 0.04]} />
      </group>
    </group>
  );
}

function RoomRig() {
  // DEV-only position scrubbers; tree-shaken from production builds (see devTweak).
  const desk = useTweak('Room.Desk', { position: [-0.82, 0, 0.5], rotationY: 0.62 });
  const couch = useTweak('Room.Couch', { position: [0, 0, -0.32] });
  const table = useTweak('Room.AR table', { position: [0, 0, 0.52] });
  const shelf = useTweak('Room.Bookcase', { position: [0.9, 0, -0.82] });
  const plant = useTweak('Room.Plant', { position: [-1.42, 0, 0.74] });
  const lamp = useTweak('Room.Floor lamp', { position: [1.05, 0, 0.5] });
  return (
    <group>
      {/* round rug centred on the scene — lined up with the chip die below it */}
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[1.05, 1.05, 0.02, 56]} />
        <GlassMat opacity={0.12} />
      </mesh>
      <Line points={circlePts(1.05)} position={[0, 0.024, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.3} />
      <Line points={circlePts(0.78)} position={[0, 0.026, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.16} />

      {/* workstation (desk + monitor + chair) — front-left by the plant, angled
          toward the centre; the monitor flickers on hover */}
      <group position={desk.position} rotation={[0, desk.rotationY, 0]}>
        <group position={[0, 0, -0.3]}>
          <SoftBox position={[0, 0.37, 0]} args={[0.95, 0.05, 0.45]} radius={0.03} outline />
          {([[-0.42, -0.18], [0.42, -0.18], [-0.42, 0.18], [0.42, 0.18]] as [number, number][]).map(([lx, lz], i) => (
            <mesh key={i} position={[lx, 0.18, lz]}>
              <cylinderGeometry args={[0.02, 0.02, 0.36, 12]} />
              <GlassMat opacity={0.26} />
            </mesh>
          ))}
          <mesh position={[0, 0.45, -0.05]}>
            <cylinderGeometry args={[0.016, 0.016, 0.14, 12]} />
            <GlassMat opacity={0.26} />
          </mesh>
          <SoftBox position={[0, 0.62, -0.14]} args={[0.54, 0.34, 0.03]} radius={0.02} liveSlug="virtuele-brigade" />
          <RoomScreen slug="virtuele-brigade" position={[0, 0.62, -0.122]} args={[0.48, 0.28, 0.008]} />
          <SoftBox position={[0, 0.39, 0.12]} args={[0.34, 0.02, 0.12]} radius={0.012} opacity={0.26} />
          {/* desk clutter: a mug + papers */}
          <mesh position={[-0.36, 0.42, 0.12]}>
            <cylinderGeometry args={[0.03, 0.03, 0.06, 14]} />
            <GlassMat opacity={0.34} />
            <Edges threshold={30} color={NEUTRAL} />
          </mesh>
          <SoftBox position={[-0.05, 0.405, 0.14]} args={[0.13, 0.012, 0.17]} radius={0.004} opacity={0.3} />
          <VRHeadset position={[0.34, 0.44, 0.06]} rotation={[0, -0.6, 0]} />
        </group>
        {/* chair in front of the desk, facing the monitor */}
        <group position={[0, 0, 0.32]} rotation={[0, Math.PI, 0]}>
          <SoftBox position={[0, 0.24, 0]} args={[0.3, 0.06, 0.3]} radius={0.05} />
          <SoftBox position={[0, 0.42, -0.14]} args={[0.3, 0.32, 0.05]} radius={0.05} />
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.022, 0.022, 0.24, 12]} />
            <GlassMat opacity={0.26} />
          </mesh>
        </group>
      </group>

      {/* bookcase (back-right) — engaging the Zwijsen book turns its shelf lights
          on + opens the orange book */}
      <Bookcase position={shelf.position} />

      {/* couch + phone — faces the coffee table / room front (+z) */}
      <group position={couch.position}>
        <SoftBox position={[0, 0.12, 0]} args={[0.92, 0.16, 0.44]} radius={0.07} outline />
        <SoftBox position={[0, 0.3, -0.2]} args={[0.92, 0.28, 0.09]} radius={0.06} />
        <SoftBox position={[-0.46, 0.22, 0]} args={[0.09, 0.24, 0.44]} radius={0.045} />
        <SoftBox position={[0.46, 0.22, 0]} args={[0.09, 0.24, 0.44]} radius={0.045} />
        <SoftBox position={[-0.24, 0.22, 0.02]} args={[0.3, 0.12, 0.32]} radius={0.06} opacity={0.22} />
        <Jitter slug="popcore-games">
          <EmissiveHover slug="popcore-games" position={[0.12, 0.205, 0.06]} rotation={[-Math.PI / 2, 0, 0.3]} args={[0.075, 0.155, 0.004]} liveColor="#ff7a3d" rest={0.5} peak={0.3} />
        </Jitter>
      </group>

      {/* coffee table with AR racing (Lightship Drive), directly in front of the couch */}
      <CoffeeTableAR position={table.position} hoverSlug="lightship-drive" />

      {/* fill the diorama out, balanced around the centre */}
      <PottedPlant position={plant.position} />
      <FloorLamp position={lamp.position} />
    </group>
  );
}

/* ---------- Chip — tools, CV & data (bottom) ---------- */

/** Philips medical XR & AI — an ECG module with a tiny Vision Pro headset. On
 *  hover a bright blip sweeps the heart-rate waveform like a monitor trace. */
function PhilipsModule({ position, hoverSlug }: { position: V3; hoverSlug?: string }) {
  const { hovered, selected, visited } = useActive(hoverSlug ?? '');
  const reduced = useReducedMotion();
  const live = useRef(0);
  const base = useMemo(() => new Color('#9fb0bd'), []); // grey at rest
  const green = useMemo(() => new Color('#5fd07a'), []); // green on select
  const stripMat = useRef<MeshStandardMaterial>(null);
  const ecg = useMemo<V3[]>(
    () => [
      [-0.13, 0, 0], [-0.06, 0, 0], [-0.045, 0.05, 0], [-0.03, -0.035, 0], [-0.015, 0, 0],
      [0.04, 0, 0], [0.06, 0.06, 0], [0.08, -0.03, 0], [0.1, 0, 0], [0.13, 0, 0],
    ],
    [],
  );
  const dot = useRef<Mesh>(null);
  const k = useRef(0);
  const popRef = useRef<Group>(null);
  const yAtX = (x: number) => {
    for (let i = 0; i < ecg.length - 1; i++) {
      const [x0, y0] = ecg[i];
      const [x1, y1] = ecg[i + 1];
      if ((x >= x0 && x <= x1) || (x >= x1 && x <= x0)) return y0 + (y1 - y0) * (x1 === x0 ? 0 : (x - x0) / (x1 - x0));
    }
    return 0;
  };
  useFrame((s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta, s.clock.elapsedTime);
    k.current += ((hovered || selected ? 1 : visited ? 0.4 : 0) - k.current) * 0.12;
    live.current += ((selected ? 1 : 0) - live.current) * 0.07; // green only while selected
    if (stripMat.current) {
      stripMat.current.color.copy(base).lerp(green, live.current);
      stripMat.current.emissive.copy(base).lerp(green, live.current);
    }
    const d = dot.current;
    if (!d) return;
    d.visible = k.current > 0.04;
    const sweep = reduced ? 0.5 : (s.clock.elapsedTime * 0.6) % 1;
    const x = -0.13 + sweep * 0.26;
    d.position.set(x, 0.22 + yAtX(x), 0);
    d.scale.setScalar(0.5 + k.current + live.current * 0.6);
    const m = d.material as MeshStandardMaterial;
    m.color.copy(base).lerp(green, live.current);
    m.emissive.copy(base).lerp(green, live.current);
  });
  return (
    <group position={position}>
      <group ref={popRef}>
      <SoftBox position={[0, 0.14, 0]} args={[0.3, 0.05, 0.2]} radius={0.02} opacity={0.3} outline liveSlug="philips-medical-xr" />
      {/* the ECG waveform + a blip that sweeps it on hover (the heart-rate signal) */}
      <Line points={ecg} position={[0, 0.22, 0]} color={selected ? '#5fd07a' : '#9fb0bd'} lineWidth={1.8} transparent opacity={0.85} />
      <mesh ref={dot} visible={false}>
        <sphereGeometry args={[0.014, 12, 12]} />
        <meshStandardMaterial color="#9fb0bd" emissive="#9fb0bd" emissiveIntensity={2.2} roughness={0.3} toneMapped={false} />
      </mesh>
      {/* a tiny Vision Pro headset */}
      <group position={[0, 0.18, 0.12]}>
        <RoundedBox args={[0.14, 0.06, 0.05]} radius={0.02} smoothness={3}>
          <GlassMat opacity={0.34} />
        </RoundedBox>
        <mesh position={[0, 0, 0.026]}>
          <boxGeometry args={[0.1, 0.035, 0.004]} />
          <meshStandardMaterial ref={stripMat} color="#9fb0bd" emissive="#9fb0bd" emissiveIntensity={0.4} roughness={0.4} toneMapped={false} />
        </mesh>
      </group>
      </group>
    </group>
  );
}

/** Decorative extra board parts — resistors, a crystal, a ribbon, solder pads. */
function MiscComponents() {
  return (
    <group>
      {/* resistors dotted across the mid-board */}
      {([[0.4, -0.3], [-0.34, 0.3], [0.28, 0.42], [-0.42, -0.32]] as [number, number][]).map(([x, z], i) => (
        <mesh key={i} position={[x, 0.135, z]} rotation={[0, i % 2 ? 0.6 : -0.4, 0]}>
          <boxGeometry args={[0.09, 0.03, 0.04]} />
          <GlassMat opacity={0.34} />
          <Edges threshold={30} color={NEUTRAL} />
        </mesh>
      ))}
      {/* crystal */}
      <mesh position={[0.34, 0.145, 0.18]}>
        <boxGeometry args={[0.1, 0.05, 0.06]} />
        <GlassMat opacity={0.4} />
        <Edges threshold={30} color={NEUTRAL} />
      </mesh>
      {/* solder pads — small neutral rings, scattered to the board's outer ring */}
      {([[0.72, 0.3], [-0.72, 0.86], [0.34, -0.92], [-0.5, -0.62], [0.86, -0.34], [-0.86, 0.1]] as [number, number][]).map(([x, z], i) => (
        <Line key={`p${i}`} points={circlePts(0.03, 18)} position={[x, 0.122, z]} color={NEUTRAL} lineWidth={1} transparent opacity={0.4} />
      ))}
    </group>
  );
}

/** A secondary IC with a finned heatsink. */
function Heatsink({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <SoftBox position={[0, 0.135, 0]} args={[0.24, 0.04, 0.24]} radius={0.01} opacity={0.34} />
      {[-0.08, -0.04, 0, 0.04, 0.08].map((x, i) => (
        <mesh key={i} position={[x, 0.21, 0]}>
          <boxGeometry args={[0.014, 0.11, 0.2]} />
          <GlassMat opacity={0.3} />
          <Edges threshold={30} color={NEUTRAL} />
        </mesh>
      ))}
    </group>
  );
}

/** A pin-header connector at the board edge. */
function PinHeader({ position, n = 6 }: { position: V3; n?: number }) {
  const span = (n - 1) * 0.045;
  return (
    <group position={position}>
      <SoftBox position={[0, 0.135, 0]} args={[span + 0.05, 0.04, 0.08]} radius={0.01} opacity={0.32} />
      {Array.from({ length: n }).map((_, i) => (
        <mesh key={i} position={[-span / 2 + i * 0.045, 0.18, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.06, 8]} />
          <meshStandardMaterial color={NEUTRAL} emissive={NEUTRAL} emissiveIntensity={0.3} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/* The chip "powers on": engaging any of its hotspots energises the whole board —
   current fills the traces out to each component and their LEDs flash. */
const CHIP_SLUGS = ['amsterdam-ai', 'custom-ar-framework', 'philips-medical-xr'];
function useChipEnergyTarget() {
  const selected = useSceneSelector((s) => CHIP_SLUGS.includes(s.selectedSlug ?? ''));
  const hovered = useSceneSelector((s) => CHIP_SLUGS.includes(s.hoveredSlug ?? ''));
  const visited = useSceneSelector((s) => CHIP_SLUGS.some((c) => s.visited.includes(c)));
  return selected ? 1 : hovered ? 0.6 : visited ? 0.25 : 0;
}

// The board's components, spread well out around the die. Each gets a trace from
// the die and a coloured status LED that flashes (its own rhythm) when live.
// `ly` sits each LED on top of its component rather than floating above the board.
const CHIP_NODES: { x: number; z: number; ly: number; led: string; phase: number; speed: number }[] = [
  { x: 0.92, z: 0.62, ly: 0.2, led: '#7fe6ff', phase: 0.0, speed: 6.5 }, // custom-ar
  { x: 0.95, z: -0.72, ly: 0.175, led: '#ff6a6a', phase: 1.1, speed: 5.0 }, // philips
  { x: -0.95, z: -0.74, ly: 0.225, led: '#a9f75c', phase: 2.0, speed: 7.5 }, // database
  { x: -0.98, z: 0.56, ly: 0.27, led: '#ffcf5e', phase: 0.7, speed: 5.8 }, // heatsink
  { x: 0.9, z: 0.92, ly: 0.17, led: '#7fe6ff', phase: 2.6, speed: 6.0 }, // computer vision
  { x: 0.0, z: 1.08, ly: 0.165, led: '#a9f75c', phase: 1.6, speed: 8.0 }, // pin header
  { x: -0.55, z: 0.95, ly: 0.195, led: '#ff6a6a', phase: 3.1, speed: 6.8 }, // cap
  { x: 0.55, z: -1.0, ly: 0.195, led: '#7fe6ff', phase: 0.4, speed: 7.0 }, // cap
];

/** A board trace that "fills" with current — a bright front sweeps from the die
 *  out to its component as the chip energises, then a pulse keeps flowing. Built
 *  as a vertex-coloured line so the fill can travel along it. */
function ChipTrace({ points, target, color }: { points: V3[]; target: number; color: string }) {
  const reduced = useReducedMotion();
  const { obj, colorAttr, colors } = useMemo(() => {
    const n = points.length;
    const pos = new Float32Array(n * 3);
    points.forEach((p, i) => {
      pos[i * 3] = p[0];
      pos[i * 3 + 1] = p[1];
      pos[i * 3 + 2] = p[2];
    });
    const cols = new Float32Array(n * 3);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    const ca = new BufferAttribute(cols, 3);
    g.setAttribute('color', ca);
    const m = new LineBasicMaterial({ vertexColors: true, transparent: true, toneMapped: false, depthWrite: false, blending: AdditiveBlending });
    return { obj: new ThreeLine(g, m), colorAttr: ca, colors: cols };
  }, [points]);
  const rest = useMemo(() => new Color(NEUTRAL), []);
  const hot = useMemo(() => new Color(color), [color]);
  const tmp = useMemo(() => new Color(), []);
  const k = useRef(0);
  useFrame((s) => {
    k.current += (target - k.current) * 0.07;
    const e = k.current;
    const t = s.clock.elapsedTime;
    const front = Math.min(1, e * 1.6); // the fill sweeps out as the chip energises
    const ch1 = reduced ? 0.5 : (t * 0.7) % 1; // bright charges travelling die → component
    const ch2 = reduced ? 0.5 : (t * 0.7 + 0.5) % 1;
    const n = colors.length / 3;
    for (let i = 0; i < n; i++) {
      const tt = i / (n - 1);
      const filled = tt < front ? 1 : 0;
      const charge = filled * (Math.exp(-((tt - ch1) ** 2) / 0.01) + Math.exp(-((tt - ch2) ** 2) / 0.01));
      const b = 0.12 + e * (filled * 0.4 + charge * 0.95); // steady fill + travelling charge
      tmp.copy(rest).lerp(hot, Math.min(1, filled * 0.7 + 0.25));
      colors[i * 3] = tmp.r * b;
      colors[i * 3 + 1] = tmp.g * b;
      colors[i * 3 + 2] = tmp.b * b;
    }
    colorAttr.needsUpdate = true;
  });
  return <primitive object={obj} />;
}

/** A small status LED that flashes on its own rhythm while the chip is live. */
function ChipLED({ position, color, target, phase, speed }: { position: V3; color: string; target: number; phase: number; speed: number }) {
  const reduced = useReducedMotion();
  const mat = useRef<MeshStandardMaterial>(null);
  const k = useRef(0);
  useFrame((s) => {
    k.current += (target - k.current) * 0.1;
    const blink = reduced ? 1 : Math.sin(s.clock.elapsedTime * speed + phase) > 0.45 ? 1 : 0.1;
    if (mat.current) mat.current.emissiveIntensity = 0.08 + k.current * 1.9 * blink;
  });
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.017, 12, 12]} />
      <meshStandardMaterial ref={mat} color={color} emissive={color} emissiveIntensity={0.08} roughness={0.3} toneMapped={false} />
    </mesh>
  );
}

/* ---- motherboard trace routing: straight runs joined by 90° / 45° corners ---- */
// densify a polyline so the per-vertex fill animation stays smooth on long runs
function densify(pts: V3[], step = 0.028): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / step));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1], a[2] + (b[2] - a[2]) * t]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
// an L-route from A to B with a 45° chamfer at the corner (PCB style)
function pcbRoute(ax: number, az: number, bx: number, bz: number, y: number, xFirst: boolean): V3[] {
  const sx = Math.sign(bx - ax) || 1;
  const sz = Math.sign(bz - az) || 1;
  const c = Math.min(0.1, Math.abs(bx - ax) * 0.5, Math.abs(bz - az) * 0.5);
  return xFirst
    ? [[ax, y, az], [bx - sx * c, y, az], [bx, y, az + sz * c], [bx, y, bz]]
    : [[ax, y, az], [ax, y, bz - sz * c], [ax + sx * c, y, bz], [bx, y, bz]];
}
// full trace from the package edge out to a component, leaving the edge square
function pcbTrace(bx: number, bz: number, y: number): V3[] {
  const HALF = 0.5;
  const xEdge = Math.abs(bx) >= Math.abs(bz);
  const sx = Math.sign(bx) || 1;
  const sz = Math.sign(bz) || 1;
  const ex = xEdge ? sx * HALF : Math.max(-HALF, Math.min(HALF, bx));
  const ez = xEdge ? Math.max(-HALF, Math.min(HALF, bz)) : sz * HALF;
  const stub = 0.08;
  const px = xEdge ? ex + sx * stub : ex;
  const pz = xEdge ? ez : ez + sz * stub;
  return densify([[ex, y, ez], ...pcbRoute(px, pz, bx, bz, y, xEdge)]);
}

/** custom-ar-framework as an AR camera lens — a barrel, aperture and a convex
 *  glass element that lights up (the lens "powers on") on hover / select. */
function LensComponent({ slug, position }: { slug: string; position: V3 }) {
  const { hovered, selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const mat = useRef<MeshStandardMaterial>(null);
  const k = useRef(0);
  const popRef = useRef<Group>(null);
  useFrame((s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta, s.clock.elapsedTime);
    k.current += ((hovered || selected ? 1 : visited ? 0.42 : 0) - k.current) * 0.12;
    if (mat.current) {
      const breathe = reduced ? 0 : Math.sin(s.clock.elapsedTime * 2.2) * 0.06;
      mat.current.emissiveIntensity = 0.14 + k.current * (1.0 + breathe);
    }
  });
  return (
    <group position={position}>
      <group ref={popRef}>
      {/* barrel */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.075, 0.082, 0.1, 28]} />
        <GlassMat opacity={0.4} />
        <Edges threshold={20} color={NEUTRAL} />
      </mesh>
      {/* aperture ring */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.014, 28]} />
        <meshStandardMaterial color={NEUTRAL} emissive={NEUTRAL} emissiveIntensity={0.25} roughness={0.4} metalness={0.3} />
      </mesh>
      {/* convex glass lens that lights up */}
      <mesh position={[0, 0.108, 0]} scale={[1, 0.42, 1]}>
        <sphereGeometry args={[0.062, 24, 18]} />
        <meshStandardMaterial ref={mat} color="#7fe6ff" emissive="#7fe6ff" emissiveIntensity={0.14} transparent opacity={0.55} roughness={0.12} metalness={0.1} toneMapped={false} />
      </mesh>
      {/* lens element rings */}
      <Line points={circlePts(0.055, 28)} position={[0, 0.119, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.5} />
      <Line points={circlePts(0.03, 20)} position={[0, 0.127, 0]} color="#7fe6ff" lineWidth={1.2} transparent opacity={0.6} />
      </group>
    </group>
  );
}

function ChipRig() {
  const { accent } = useAccent();
  const energy = useChipEnergyTarget();
  const TY = 0.026; // trace height, sitting on the PCB substrate
  const traces = useMemo(() => CHIP_NODES.map((nd) => pcbTrace(nd.x, nd.z, TY)), []);
  // a few decorative board traces (not to components) for the motherboard look
  const extra = useMemo(
    () => [
      densify(pcbRoute(0.58, -0.18, 1.02, -0.42, TY, true)),
      densify(pcbRoute(-0.58, 0.22, -1.05, 0.34, TY, true)),
      densify(pcbRoute(0.2, 0.55, 0.36, 1.04, TY, false)),
      densify(pcbRoute(-0.34, -0.55, -0.46, -1.04, TY, false)),
      densify(pcbRoute(0.55, 0.3, 0.86, 0.62, TY, true)),
    ],
    [],
  );
  return (
    <group>
      {/* the PCB substrate — every part mounts on it, so it reads as one board */}
      <RoundedBox args={[2.05, 0.02, 2.05]} radius={0.04} smoothness={2} position={[0, 0.01, 0]}>
        <meshStandardMaterial color="#10303a" transparent opacity={0.5} roughness={0.6} metalness={0.1} />
      </RoundedBox>
      <Line points={roundedRectPts(2.0, 2.0, 0.06)} position={[0, 0.022, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.4} />

      {/* package + die (carries amsterdam-ai — the chip powers on) */}
      <SoftBox position={[0, 0.08, 0]} args={[1.05, 0.12, 1.05]} radius={0.08} outline liveSlug="amsterdam-ai" />
      <EmissiveHover slug="amsterdam-ai" position={[0, 0.15, 0]} args={[0.4, 0.04, 0.4]} rest={0.25} peak={1.2} liveColor="#ffcf5e" />
      <Line points={roundedRectPts(0.42, 0.42, 0.05)} position={[0, 0.175, 0]} color={accent} lineWidth={1.2} transparent opacity={0.6} />

      {/* motherboard traces fill with current; a solder pad + flashing LED per part */}
      {traces.map((t, i) => (
        <ChipTrace key={i} points={t} target={energy} color={accent} />
      ))}
      {extra.map((t, i) => (
        <ChipTrace key={`x${i}`} points={t} target={energy} color={accent} />
      ))}
      {CHIP_NODES.map((nd, i) => (
        <group key={i}>
          <Line points={circlePts(0.034, 16)} position={[nd.x, TY + 0.003, nd.z]} color={NEUTRAL} lineWidth={1} transparent opacity={0.5} />
          <ChipLED position={[nd.x, nd.ly, nd.z]} color={nd.led} target={energy} phase={nd.phase} speed={nd.speed} />
        </group>
      ))}

      {/* custom-ar-framework — an AR camera lens that lights up */}
      <LensComponent slug="custom-ar-framework" position={[0.92, 0.02, 0.62]} />

      {/* decorative round caps */}
      {([[-0.55, 0.95], [0.55, -1.0]] as [number, number][]).map(([cx, cz], i) => (
        <mesh key={i} position={[cx, 0.13, cz]}>
          <cylinderGeometry args={[0.05, 0.05, 0.12, 20]} />
          <GlassMat opacity={0.34} />
          <Edges threshold={30} color={NEUTRAL} />
        </mesh>
      ))}

      {/* round database stack (top platter is the accent) */}
      <group position={[-0.95, 0, -0.74]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 0.05 + i * 0.07, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.06, 28]} />
            {i === 2 ? (
              <meshStandardMaterial color={NEUTRAL} emissive={NEUTRAL} emissiveIntensity={0.4} roughness={0.45} />
            ) : (
              <GlassMat opacity={0.28} />
            )}
            {i !== 2 && <Edges threshold={30} color={NEUTRAL} />}
          </mesh>
        ))}
      </group>

      {/* computer-vision frame (neutral — not a hotspot) */}
      <Line points={roundedRectPts(0.34, 0.34, 0.05)} position={[0.9, 0.16, 0.92]} color={NEUTRAL} lineWidth={1.4} transparent opacity={0.75} />

      {/* secondary IC + heatsink and a pin-header connector fill the board out */}
      <Heatsink position={[-0.98, 0, 0.56]} />
      <PinHeader position={[0.0, 0, 1.08]} n={6} />

      {/* Philips medical XR & AI module (heart-rate signal animates on hover) */}
      <PhilipsModule position={[0.95, 0, -0.72]} hoverSlug="philips-medical-xr" />
      <MiscComponents />
    </group>
  );
}

function HotspotMarker({ hotspot, color, onActivate }: { hotspot: Hotspot; color: string; onActivate: (h: Hotspot) => void }) {
  const study = caseBySlug(hotspot.slug);
  const label = study?.title ?? hotspot.slug;
  const anchor: V3 = hotspot.anchor ?? [hotspot.position[0], 0, hotspot.position[2]];
  return (
    <group>
      {/* subtle leader line from the object up to the floating dot */}
      <Line points={[anchor, hotspot.position]} color={color} lineWidth={1} transparent opacity={0.38} />
      {/* a faint flat ring marking the exact spot on the object */}
      <mesh position={anchor} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.016, 0.027, 20]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} side={2} toneMapped={false} />
      </mesh>
      <Html position={hotspot.position} center zIndexRange={[20, 0]} className="hotspot-wrap">
        <span className="hotspot" style={{ '--hot': color } as CSSProperties}>
          <button
            type="button"
            className="hotspot__dot"
            aria-label={`${label} — open node`}
            onPointerEnter={() => sceneStore.setHovered(hotspot.slug)}
            onPointerLeave={() => sceneStore.setHovered(null)}
            onFocus={() => sceneStore.setHovered(hotspot.slug)}
            onBlur={() => sceneStore.setHovered(null)}
            onClick={() => {
              sceneStore.setHovered(null);
              onActivate(hotspot);
            }}
          >
            <span className="hotspot__ring" aria-hidden="true" />
            <span className="hotspot__label">{label}</span>
          </button>
        </span>
      </Html>
    </group>
  );
}

const RIGS: Record<LayerId, () => JSX.Element> = { city: CityRig, room: RoomRig, chip: ChipRig };
const SEED: Record<LayerId, number> = { city: 11, room: 29, chip: 53 };

/* ---------- Cross-layer signal lines ----------
   Related projects on different layers are wired together like a tidy run of
   cable: orthogonal segments with rounded pipe-bends that lead out of one node,
   drop a vertical riser in the margin, and lead into the other. The cables sit
   in the scene at rest (dim, neutral — unhighlighted); touching either endpoint
   lights that run up in its thread colour and sends data packets flowing through
   it, with a small label naming the thread. They live in world space because
   they bridge the differently-scaled layer groups. */
interface Relation {
  thread: string; // shown as a faint label on the link
  from: string; // slug — packets flow from → to
  to: string; // slug
  color: string;
}

// Three threads weaving down the stack. AR: the framework powers the AR race
// table, which surfaces as a city park. XR · simulation: the medical-XR module
// feeds the brigade's training sim. AI · data: the model serves the game backend
// and the city's Alliander grid work.
const THREAD = { ar: '#46d6e6', xr: '#c79bff', data: '#bff06a' };
const RELATIONS: Relation[] = [
  { thread: 'AR', from: 'custom-ar-framework', to: 'lightship-drive', color: THREAD.ar },
  { thread: 'AR', from: 'lightship-drive', to: 'niantic-explorer', color: THREAD.ar },
  { thread: 'AR', from: 'custom-ar-framework', to: 'zwijsen-ar-books', color: THREAD.ar },
  { thread: 'XR · simulation', from: 'philips-medical-xr', to: 'virtuele-brigade', color: THREAD.xr },
  { thread: 'AI · data', from: 'amsterdam-ai', to: 'popcore-games', color: THREAD.data },
  { thread: 'AI · data', from: 'amsterdam-ai', to: 'alliander-hololens', color: THREAD.data },
];

const HOTSPOT_BY_SLUG: Record<string, Hotspot> = Object.fromEntries(HOTSPOTS.map((h) => [h.slug, h]));
const SIGNAL_PACKETS = 5;
const PIPE_OFFSET = 0.7; // how far the vertical riser sits outside the link's midpoint
const PIPE_REST = new Color('#5a6e82'); // unlit cable colour (before highlight)
const _sv = new Vector3(); // scratch for sampling the curve each frame

// A stable outward direction for links whose endpoints both sit on the spine.
function hashDir(s: string): Vector3 {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  const a = (((h % 360) + 360) % 360) * (Math.PI / 180);
  return new Vector3(Math.cos(a), 0, Math.sin(a));
}

// Replace each interior corner of a polyline with a small quadratic fillet, so
// the right-angle cable route reads as bent pipe rather than hard mitres.
function roundCorners(pts: Vector3[], radius: number, seg = 5): Vector3[] {
  if (pts.length < 3) return pts;
  const out: Vector3[] = [pts[0].clone()];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const inDir = p.clone().sub(pts[i - 1]);
    const outDir = pts[i + 1].clone().sub(p);
    const r = Math.min(radius, inDir.length() / 2, outDir.length() / 2);
    inDir.normalize();
    outDir.normalize();
    const p1 = p.clone().addScaledVector(inDir, -r);
    const p2 = p.clone().addScaledVector(outDir, r);
    out.push(p1);
    for (let s = 1; s < seg; s++) {
      const t = s / seg;
      out.push(p1.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(p, 2 * (1 - t) * t).addScaledVector(p2, t * t));
    }
    out.push(p2);
  }
  out.push(pts[pts.length - 1].clone());
  return out;
}

// Manhattan "cable" route between two anchors on different layers: lead out at
// the source layer, drop a vertical riser in the margin, lead into the target.
function pipeRoute(pA: Vector3, pB: Vector3, key: string): { points: Vector3[]; riser: Vector3 } {
  const midX = (pA.x + pB.x) / 2;
  const midZ = (pA.z + pB.z) / 2;
  let out = new Vector3(midX, 0, midZ);
  if (out.length() < 0.2) out = hashDir(key); // both endpoints on the spine → pick a side
  out.normalize().multiplyScalar(PIPE_OFFSET);
  const rx = midX + out.x;
  const rz = midZ + out.z;
  const raw = [
    new Vector3(pA.x, pA.y, pA.z),
    new Vector3(rx, pA.y, pA.z), // run out along X at the source layer
    new Vector3(rx, pA.y, rz), // …then Z, to the foot/head of the riser
    new Vector3(rx, pB.y, rz), // vertical riser between the layers
    new Vector3(rx, pB.y, pB.z), // run in along Z at the target layer
    new Vector3(pB.x, pB.y, pB.z), // …then X, into the node
  ].filter((p, i, arr) => i === 0 || p.distanceTo(arr[i - 1]) > 1e-4);
  return { points: roundCorners(raw, 0.12, 5), riser: new Vector3(rx, (pA.y + pB.y) / 2, rz) };
}

function SignalLine({ thread, from, to, color }: Relation) {
  const reduced = useReducedMotion();
  const { hovered: hovA, selected: selA } = useActive(from);
  const { hovered: hovB, selected: selB } = useActive(to);

  // The cable route + a curve along it for sampling the flowing packets. The
  // label sits beside the vertical riser, the most "between-layers" point.
  const { curve, points, apex } = useMemo(() => {
    const pA = anchorWorld(HOTSPOT_BY_SLUG[from]);
    const pB = anchorWorld(HOTSPOT_BY_SLUG[to]);
    const { points: route, riser } = pipeRoute(pA, pB, from + to);
    const c = new CatmullRomCurve3(route, false, 'catmullrom', 0);
    return { curve: c, points: route, apex: riser.add(new Vector3(0, 0.1, 0)) };
  }, [from, to]);

  const lineRef = useRef<any>(null);
  const pointsRef = useRef<ThreePoints>(null);
  const posAttr = useRef<BufferAttribute>(null);
  const colAttr = useRef<BufferAttribute>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const posArr = useMemo(() => new Float32Array(SIGNAL_PACKETS * 3), []);
  const colArr = useMemo(() => new Float32Array(SIGNAL_PACKETS * 3), []);
  const baseCol = useMemo(() => new Color(color), [color]);
  const k = useRef(0); // eased activation: 0 idle, 0.5 hover, 1 selected
  const u = useRef(0); // packet flow phase

  useFrame((_s, delta) => {
    const target = selA || selB ? 1 : hovA || hovB ? 0.6 : 0;
    k.current += (target - k.current) * 0.12;
    const kk = k.current;

    // The cable is always present (dim, neutral) and lights up in its thread
    // colour, brighter and a touch heavier, as the link is highlighted.
    const m = lineRef.current?.material;
    if (m) {
      const op = 0.22 + kk * 0.4;
      const lw = 1.8 + kk * 1.4;
      m.opacity = op;
      m.linewidth = lw;
      if (m.color) m.color.copy(PIPE_REST).lerp(baseCol, kk);
      if (m.uniforms) {
        if (m.uniforms.opacity) m.uniforms.opacity.value = op;
        if (m.uniforms.linewidth) m.uniforms.linewidth.value = lw;
        if (m.uniforms.diffuse && m.color) m.uniforms.diffuse.value.copy(m.color);
      }
    }

    // Data flows through the cable only while it's highlighted.
    if (!reduced) u.current = (u.current + delta * 0.16) % 1;
    const pen = pointsRef.current;
    if (pen) {
      const flowing = kk > 0.04;
      pen.visible = flowing;
      if (flowing) {
        for (let i = 0; i < SIGNAL_PACKETS; i++) {
          const f = (u.current + i / SIGNAL_PACKETS) % 1;
          curve.getPointAt(f, _sv);
          posArr[i * 3] = _sv.x;
          posArr[i * 3 + 1] = _sv.y;
          posArr[i * 3 + 2] = _sv.z;
          const b = kk * (0.5 + 0.5 * Math.sin(f * Math.PI)); // fade in/out at the ends
          colArr[i * 3] = baseCol.r * b;
          colArr[i * 3 + 1] = baseCol.g * b;
          colArr[i * 3 + 2] = baseCol.b * b;
        }
        if (posAttr.current) posAttr.current.needsUpdate = true;
        if (colAttr.current) colAttr.current.needsUpdate = true;
      }
    }

    if (labelRef.current) labelRef.current.style.opacity = String(kk > 0.04 ? Math.min(1, kk * 1.25) : 0);
  });

  return (
    <group>
      <DreiLine ref={lineRef} points={points} color={PIPE_REST.getStyle()} lineWidth={1.8} transparent opacity={0.22} depthWrite={false} toneMapped={false} fog={false} />
      <points ref={pointsRef} visible={false}>
        <bufferGeometry>
          <bufferAttribute ref={posAttr} attach="attributes-position" args={[posArr, 3]} />
          <bufferAttribute ref={colAttr} attach="attributes-color" args={[colArr, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.075} vertexColors transparent blending={AdditiveBlending} depthWrite={false} sizeAttenuation toneMapped={false} />
      </points>
      <Html position={apex} center zIndexRange={[12, 0]} className="signal-wrap" style={{ pointerEvents: 'none' }}>
        <span ref={labelRef} className="signal-label" style={{ '--sig': color, opacity: 0 } as CSSProperties}>
          {thread}
        </span>
      </Html>
    </group>
  );
}

/* ---------- Depth: a soft shadow under the focused layer that also darkens the
   layers beneath it, so one reads as the subject. Follows the active layer. */
function radialVeilTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(4,6,8,0.85)');
    g.addColorStop(0.55, 'rgba(4,6,8,0.52)');
    g.addColorStop(1, 'rgba(4,6,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new CanvasTexture(c);
}

function DepthVeil() {
  const journeyStep = useSceneSelector((s) => s.journeyStep);
  const reduced = useReducedMotion();
  const ref = useRef<Mesh>(null);
  const tex = useMemo(() => radialVeilTexture(), []);
  const targetY = ([1.32, 0, -1.32][journeyStep] ?? 1.32) - 0.34;
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.y = reduced ? targetY : ref.current.position.y + (targetY - ref.current.position.y) * 0.08;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, targetY, 0]}>
      <circleGeometry args={[2.7, 64]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} fog={false} />
    </mesh>
  );
}

export interface MaquetteProps {
  onActivate: (hotspot: Hotspot) => void;
}

export function Maquette({ onActivate }: MaquetteProps) {
  const journeyStep = useSceneSelector((s) => s.journeyStep);
  const activeLayer = (['city', 'room', 'chip'] as LayerId[])[journeyStep] ?? 'city';

  return (
    <group>
      <DepthVeil />
      {MAQUETTE_LAYERS.map((layer) => {
        const Rig = RIGS[layer.id];
        return (
          <AccentCtx.Provider key={layer.id} value={PALETTE[layer.id]}>
            <group position={[0, LAYER_Y[layer.id], 0]} scale={LAYER_SCALE[layer.id]}>
              <DotFloor step={layer.id === 'city' ? 0.17 : 0.26} />
              <PointCloud seed={SEED[layer.id]} />
              <Rig />
              {activeLayer === layer.id &&
                HOTSPOTS.filter((h) => h.layer === layer.id).map((h) => (
                  <HotspotMarker key={h.slug} hotspot={h} color={PALETTE[layer.id].accent} onActivate={onActivate} />
                ))}
            </group>
          </AccentCtx.Provider>
        );
      })}
      {RELATIONS.map((rel, i) => (
        <SignalLine key={i} {...rel} />
      ))}
    </group>
  );
}
