import { createContext, useContext, useMemo, useRef, type CSSProperties, type ComponentProps } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, Html, Line as DreiLine, RoundedBox } from '@react-three/drei';
import { CatmullRomCurve3, Color, Vector3, type Points as ThreePoints, type MeshStandardMaterial } from 'three';
import { MAQUETTE_LAYERS, HOTSPOTS, LAYER_Y, LAYER_SCALE, type Hotspot, type LayerId } from './framing';
import { useSceneSelector } from './store';
import { useReducedMotion } from '../lib/useReducedMotion';
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

/** Flat accent highlight (signage, screens framing, cross, clock, books). */
function Accent({ position, args, intensity = 0.4, rotation }: { position: V3; args: V3; intensity?: number; rotation?: V3 }) {
  const { accent } = useAccent();
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={intensity} roughness={0.4} />
    </mesh>
  );
}

/** Pulsing accent (the chip die, the screens). */
function PulseBox({ position, args, base = 0.45, amp = 0.12, speed = 1.5 }: { position: V3; args: V3; base?: number; amp?: number; speed?: number }) {
  const { accent } = useAccent();
  const mat = useRef<MeshStandardMaterial>(null);
  const reduced = useReducedMotion();
  useFrame((state) => {
    if (mat.current) mat.current.emissiveIntensity = reduced ? base : base + Math.sin(state.clock.elapsedTime * speed) * amp;
  });
  return (
    <mesh position={position}>
      <boxGeometry args={args} />
      <meshStandardMaterial ref={mat} color={accent} emissive={accent} emissiveIntensity={base} roughness={0.4} />
    </mesh>
  );
}

/* ---------- shape helpers ---------- */
/** Round, slightly tapered tower: translucent drum with clean rim circles. */
function Tower({ x, z, r, h }: { x: number; z: number; r: number; h: number }) {
  const { accent } = useAccent();
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[r * 0.9, r, h, 36]} />
        <GlassMat />
        <Edges threshold={30} color={NEUTRAL} />
      </mesh>
      <Line points={circlePts(r * 0.66)} position={[0, h + 0.01, 0]} color={accent} lineWidth={1.2} transparent opacity={0.65} />
    </group>
  );
}

/** Wireframe dome — latitude rings + longitude arcs (clean curved lines). */
function Dome({ position, r, h, segLat = 3, segLon = 4 }: { position: V3; r: number; h: number; segLat?: number; segLon?: number }) {
  const lat = useMemo(() => {
    const out: { r: number; y: number }[] = [{ r, y: 0 }];
    for (let k = 1; k <= segLat; k++) {
      const t = (k / (segLat + 0.6)) * (Math.PI / 2);
      out.push({ r: r * Math.cos(t), y: h * Math.sin(t) });
    }
    return out;
  }, [r, h, segLat]);
  const lon = useMemo(() => {
    const out: V3[][] = [];
    for (let j = 0; j < segLon; j++) {
      const ang = (j / segLon) * Math.PI * 2;
      const pts: V3[] = [];
      for (let k = 0; k <= 8; k++) {
        const t = (k / 8) * (Math.PI / 2);
        pts.push([Math.cos(ang) * r * Math.cos(t), h * Math.sin(t), Math.sin(ang) * r * Math.cos(t)]);
      }
      out.push(pts);
    }
    return out;
  }, [r, h, segLon]);
  return (
    <group position={position}>
      {lat.map((l, i) => (
        <Line key={`la${i}`} points={circlePts(l.r)} position={[0, l.y, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.45} />
      ))}
      {lon.map((pts, i) => (
        <Line key={`lo${i}`} points={pts} color={NEUTRAL} lineWidth={1} transparent opacity={0.4} />
      ))}
    </group>
  );
}

/** Round-canopy tree: a trunk line and a soft sphere ringed by two circles. */
function TreeRound({ position, h = 0.45 }: { position: V3; h?: number }) {
  return (
    <group position={position}>
      <Line points={[[0, 0, 0], [0, h * 0.5, 0]]} color={NEUTRAL} lineWidth={1} transparent opacity={0.4} />
      <group position={[0, h * 0.66, 0]}>
        <mesh>
          <sphereGeometry args={[0.13, 14, 12]} />
          <GlassMat color="#3f8f8a" opacity={0.14} />
        </mesh>
        <Line points={circlePts(0.13)} color={NEUTRAL} lineWidth={1} transparent opacity={0.4} />
        <Line points={circlePts(0.13)} rotation={[Math.PI / 2, 0, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.4} />
      </group>
    </group>
  );
}

/** Soft rounded box (furniture, the chip package). Optional top outline. */
function SoftBox({ position, args, radius = 0.03, opacity = 0.2, outline = false, rotation, color }: { position: V3; args: V3; radius?: number; opacity?: number; outline?: boolean; rotation?: V3; color?: string }) {
  // Clamp so the corner radius never exceeds half the smallest side.
  const r = Math.min(radius, Math.min(args[0], args[1], args[2]) / 2 - 0.002);
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={args} radius={r} smoothness={3}>
        <GlassMat opacity={opacity} color={color} />
      </RoundedBox>
      {outline && (
        <Line points={roundedRectPts(args[0], args[2], radius * 1.6)} position={[0, args[1] / 2, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.45} />
      )}
    </group>
  );
}

/** Flat floor of dots that fade into the background toward the rim. No ring. */
function DotFloor({ step = 0.26 }: { step?: number }) {
  const { accent } = useAccent();
  const R = 2.2;
  const { positions, colors } = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    const c = new Color(accent);
    const bg = new Color(BG);
    const tmp = new Color();
    for (let x = -R; x <= R + 1e-6; x += step)
      for (let z = -R; z <= R + 1e-6; z += step) {
        const d = Math.hypot(x, z);
        if (d > R) continue;
        pos.push(x, 0, z);
        const fade = Math.pow(1 - d / R, 1.5);
        tmp.copy(bg).lerp(c, 0.1 + 0.78 * fade);
        col.push(tmp.r, tmp.g, tmp.b);
      }
    return { positions: new Float32Array(pos), colors: new Float32Array(col) };
  }, [accent, step]);
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

/** A sparse field of accent points drifting slowly above the layer. */
function PointCloud({ seed }: { seed: number }) {
  const { accent } = useAccent();
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
      <pointsMaterial size={0.016} color={accent} transparent opacity={0.3} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/* ---------- City — GIS & location (top) ---------- */
function Park({ position }: { position: V3 }) {
  const { accent } = useAccent();
  return (
    <group position={position}>
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.02, 44]} />
        <GlassMat color="#2f8a6e" opacity={0.15} />
      </mesh>
      <Line points={circlePts(0.5)} position={[0, 0.024, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.4} />
      {/* pond */}
      <mesh position={[-0.14, 0.02, 0.16]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.15, 28]} />
        <GlassMat color="#2e7f86" opacity={0.28} />
      </mesh>
      <Line points={circlePts(0.15)} position={[-0.14, 0.03, 0.16]} color={accent} lineWidth={1} transparent opacity={0.5} />
      <TreeRound position={[0.2, 0, -0.18]} h={0.44} />
      <TreeRound position={[0.24, 0, 0.22]} h={0.36} />
      <TreeRound position={[-0.22, 0, -0.24]} h={0.4} />
    </group>
  );
}

function TownHall({ position }: { position: V3 }) {
  return (
    <group position={position}>
      {/* steps / plinth */}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.42, 0.44, 0.04, 40]} />
        <GlassMat opacity={0.16} />
        <Edges threshold={30} color={NEUTRAL} />
      </mesh>
      {/* drum */}
      <mesh position={[0, 0.31, 0]}>
        <cylinderGeometry args={[0.3, 0.33, 0.52, 40]} />
        <GlassMat />
        <Edges threshold={30} color={NEUTRAL} />
      </mesh>
      {/* dome + clock */}
      <Dome position={[0, 0.57, 0]} r={0.3} h={0.24} segLat={3} segLon={6} />
      <Accent position={[0, 0.62, 0.31]} args={[0.09, 0.09, 0.012]} intensity={0.45} />
    </group>
  );
}

function CityRig() {
  const roadA = useMemo(() => smoothCurve([[-2.1, 0.01, -0.55], [-0.7, 0.01, -0.25], [0.5, 0.01, 0.25], [2.1, 0.01, 0.55]]), []);
  const roadB = useMemo(() => smoothCurve([[-0.5, 0.01, -2.1], [-0.15, 0.01, -0.4], [0.05, 0.01, 0.5], [0.35, 0.01, 2.1]]), []);
  const towers: { x: number; z: number; r: number; h: number }[] = [
    { x: -1.35, z: -1.25, r: 0.2, h: 0.6 },
    { x: -1.4, z: 0.1, r: 0.17, h: 0.36 },
    { x: 1.5, z: -1.2, r: 0.18, h: 0.46 },
    { x: 1.7, z: 0.1, r: 0.2, h: 0.34 },
    { x: 1.55, z: 1.35, r: 0.17, h: 0.5 },
  ];
  return (
    <group>
      <Line points={roadA} color={NEUTRAL} lineWidth={1.2} transparent opacity={0.38} />
      <Line points={roadB} color={NEUTRAL} lineWidth={1.2} transparent opacity={0.38} />
      {towers.map((t, i) => (
        <Tower key={i} {...t} />
      ))}

      {/* church: round nave + dome + cross */}
      <group position={[-1.4, 0, 0.95]}>
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.17, 0.19, 0.4, 28]} />
          <GlassMat />
          <Edges threshold={30} color={NEUTRAL} />
        </mesh>
        <Dome position={[0, 0.4, 0]} r={0.19} h={0.18} segLat={2} segLon={5} />
        <Accent position={[0, 0.66, 0]} args={[0.012, 0.12, 0.012]} intensity={0.55} />
        <Accent position={[0, 0.64, 0]} args={[0.07, 0.012, 0.012]} intensity={0.55} />
      </group>

      <TownHall position={[0.2, 0, -0.2]} />
      <Park position={[0.9, 0, 0.9]} />

      <TreeRound position={[-0.85, 0, -1.05]} h={0.4} />
      <TreeRound position={[1.05, 0, -0.5]} h={0.34} />
    </group>
  );
}

/* ---------- Room — games, apps & websites (middle) ---------- */

/** Coffee table with a floating AR race loop + two cars (Lightship Drive). */
function CoffeeTableAR({ position }: { position: V3 }) {
  const { accent } = useAccent();
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
  return (
    <group position={position}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.03, 40]} />
        <GlassMat opacity={0.2} />
        <Edges threshold={30} color={NEUTRAL} />
      </mesh>
      {([[0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]] as [number, number][]).map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.09, lz]}>
          <cylinderGeometry args={[0.016, 0.016, 0.18, 10]} />
          <GlassMat opacity={0.24} />
        </mesh>
      ))}
      {/* the AR bit — a race loop + cars floating above the table */}
      <Line points={track} position={[0, 0.27, 0]} color={accent} lineWidth={1.6} transparent opacity={0.7} />
      <Accent position={[0.2, 0.28, 0.02]} args={[0.045, 0.018, 0.028]} intensity={0.5} />
      <Accent position={[-0.16, 0.28, -0.08]} args={[0.045, 0.018, 0.028]} intensity={0.5} />
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
      <Accent position={[0, 0, 0.052]} args={[0.11, 0.05, 0.004]} intensity={0.3} />
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
      <Accent position={[0, 0.66, 0]} args={[0.07, 0.02, 0.07]} intensity={0.5} />
    </group>
  );
}

/** A low media console with a small glowing TV (games / apps / web). */
function MediaConsole({ position }: { position: V3 }) {
  const { accent } = useAccent();
  return (
    <group position={position}>
      <SoftBox position={[0, 0.16, 0]} args={[0.34, 0.26, 0.78]} radius={0.03} outline />
      {([-0.3, 0.3] as number[]).map((z, i) => (
        <mesh key={i} position={[0, 0.03, z]}>
          <boxGeometry args={[0.3, 0.05, 0.04]} />
          <GlassMat opacity={0.26} />
        </mesh>
      ))}
      {/* TV facing the room (+x) */}
      <SoftBox position={[0.02, 0.5, 0]} args={[0.04, 0.4, 0.66]} radius={0.02} />
      <mesh position={[0.045, 0.5, 0]}>
        <boxGeometry args={[0.006, 0.32, 0.58]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.42} roughness={0.4} />
      </mesh>
    </group>
  );
}

function RoomRig() {
  const { accent } = useAccent();
  return (
    <group>
      {/* round rug anchoring the seating area */}
      <mesh position={[0.25, 0.012, 0.45]}>
        <cylinderGeometry args={[1.05, 1.05, 0.02, 56]} />
        <GlassMat opacity={0.12} />
      </mesh>
      <Line points={circlePts(1.05)} position={[0.25, 0.024, 0.45]} color={NEUTRAL} lineWidth={1} transparent opacity={0.3} />
      <Line points={circlePts(0.78)} position={[0.25, 0.026, 0.45]} color={accent} lineWidth={1} transparent opacity={0.16} />

      {/* desk + monitor + VR headset (back-left) */}
      <group position={[-0.9, 0, -1.0]}>
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
        <SoftBox position={[0, 0.62, -0.14]} args={[0.54, 0.34, 0.03]} radius={0.02} />
        <PulseBox position={[0, 0.62, -0.122]} args={[0.48, 0.28, 0.008]} base={0.4} amp={0.1} speed={1.2} />
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

      {/* chair */}
      <group position={[-0.55, 0, -0.42]}>
        <SoftBox position={[0, 0.24, 0]} args={[0.3, 0.06, 0.3]} radius={0.05} />
        <SoftBox position={[0, 0.42, -0.14]} args={[0.3, 0.32, 0.05]} radius={0.05} />
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.24, 12]} />
          <GlassMat opacity={0.26} />
        </mesh>
      </group>

      {/* bookcase (back-right) */}
      <group position={[1.25, 0, -1.0]}>
        <SoftBox position={[0, 0.45, 0]} args={[0.14, 0.9, 0.72]} radius={0.02} />
        {Array.from({ length: 9 }).map((_, i) => {
          const shelf = Math.floor(i / 3);
          const idx = i % 3;
          return (
            <mesh key={i} position={[0.02, 0.24 + shelf * 0.26, -0.22 + idx * 0.18 + (i % 2) * 0.03]}>
              <boxGeometry args={[0.07, 0.16, 0.035]} />
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.12 + (i % 3) * 0.06} roughness={0.55} />
            </mesh>
          );
        })}
      </group>

      {/* couch + phone (front-right) */}
      <group position={[0.95, 0, 0.85]}>
        <SoftBox position={[0, 0.12, 0]} args={[0.92, 0.16, 0.44]} radius={0.07} outline />
        <SoftBox position={[0, 0.3, -0.2]} args={[0.92, 0.28, 0.09]} radius={0.06} />
        <SoftBox position={[-0.46, 0.22, 0]} args={[0.09, 0.24, 0.44]} radius={0.045} />
        <SoftBox position={[0.46, 0.22, 0]} args={[0.09, 0.24, 0.44]} radius={0.045} />
        <SoftBox position={[-0.24, 0.22, 0.02]} args={[0.3, 0.12, 0.32]} radius={0.06} opacity={0.22} />
        <mesh position={[0.12, 0.205, 0.06]} rotation={[-Math.PI / 2, 0, 0.3]}>
          <boxGeometry args={[0.075, 0.155, 0.004]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.5} roughness={0.4} />
        </mesh>
      </group>

      {/* coffee table with AR racing in front of the couch (Lightship Drive) */}
      <CoffeeTableAR position={[0, 0, 1.0]} />

      {/* fill the diorama out */}
      <TreeRound position={[-1.3, 0, 0.85]} h={0.55} />
      <FloorLamp position={[0.25, 0, -1.5]} />
      <MediaConsole position={[-1.55, 0, 0.2]} />
    </group>
  );
}

/* ---------- Chip — tools, CV & data (bottom) ---------- */

/** Philips medical XR & AI — an ECG module with a tiny Vision Pro headset. */
function PhilipsModule({ position }: { position: V3 }) {
  const { accent } = useAccent();
  const ecg = useMemo<V3[]>(
    () => [
      [-0.13, 0, 0], [-0.06, 0, 0], [-0.045, 0.05, 0], [-0.03, -0.035, 0], [-0.015, 0, 0],
      [0.04, 0, 0], [0.06, 0.06, 0], [0.08, -0.03, 0], [0.1, 0, 0], [0.13, 0, 0],
    ],
    [],
  );
  return (
    <group position={position}>
      <SoftBox position={[0, 0.14, 0]} args={[0.3, 0.05, 0.2]} radius={0.02} opacity={0.3} outline />
      {/* the ECG waveform (accent) */}
      <Line points={ecg} position={[0, 0.22, 0]} color={accent} lineWidth={1.8} transparent opacity={0.85} />
      {/* a tiny Vision Pro headset */}
      <group position={[0, 0.18, 0.12]}>
        <RoundedBox args={[0.14, 0.06, 0.05]} radius={0.02} smoothness={3}>
          <GlassMat opacity={0.34} />
        </RoundedBox>
        <Accent position={[0, 0, 0.026]} args={[0.1, 0.035, 0.004]} intensity={0.3} />
      </group>
    </group>
  );
}

/** Decorative extra board parts — resistors, a crystal, a ribbon, solder pads. */
function MiscComponents() {
  const { accent } = useAccent();
  return (
    <group>
      {([[0.16, -0.58], [0.66, 0.08], [-0.18, 0.58]] as [number, number][]).map(([x, z], i) => (
        <mesh key={i} position={[x, 0.135, z]}>
          <boxGeometry args={[0.09, 0.03, 0.04]} />
          <GlassMat opacity={0.34} />
          <Edges threshold={30} color={NEUTRAL} />
        </mesh>
      ))}
      {/* crystal */}
      <mesh position={[-0.16, 0.145, -0.46]}>
        <boxGeometry args={[0.1, 0.05, 0.06]} />
        <GlassMat opacity={0.4} />
        <Edges threshold={30} color={NEUTRAL} />
      </mesh>
      {/* ribbon connector */}
      <group position={[-0.62, 0.13, 0.18]}>
        <SoftBox position={[0, 0.012, 0]} args={[0.07, 0.02, 0.34]} radius={0.008} opacity={0.32} />
        {[-0.12, -0.06, 0, 0.06, 0.12].map((z, i) => (
          <Line key={i} points={[[-0.03, 0.024, z], [0.03, 0.024, z]]} color={NEUTRAL} lineWidth={1} transparent opacity={0.5} />
        ))}
      </group>
      {/* solder pads — small accent rings */}
      {([[0.32, 0.62], [-0.34, 0.5], [0.52, -0.64], [-0.62, -0.45]] as [number, number][]).map(([x, z], i) => (
        <Line key={`p${i}`} points={circlePts(0.03, 18)} position={[x, 0.122, z]} color={accent} lineWidth={1} transparent opacity={0.4} />
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
  const { accent } = useAccent();
  const span = (n - 1) * 0.045;
  return (
    <group position={position}>
      <SoftBox position={[0, 0.135, 0]} args={[span + 0.05, 0.04, 0.08]} radius={0.01} opacity={0.32} />
      {Array.from({ length: n }).map((_, i) => (
        <mesh key={i} position={[-span / 2 + i * 0.045, 0.18, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.06, 8]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.3} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function ChipRig() {
  const { accent } = useAccent();
  const traces = useMemo(
    () => [
      smoothCurve([[0.22, 0.16, 0.12], [0.5, 0.16, 0.32], [0.92, 0.16, 0.5]]),
      smoothCurve([[0.22, 0.16, -0.1], [0.52, 0.16, -0.32], [0.96, 0.16, -0.52]]),
      smoothCurve([[-0.22, 0.16, 0.1], [-0.52, 0.16, 0.32], [-0.96, 0.16, 0.46]]),
      smoothCurve([[-0.22, 0.16, -0.12], [-0.5, 0.16, -0.34], [-0.9, 0.16, -0.6]]),
      smoothCurve([[0.1, 0.16, 0.22], [0.28, 0.16, 0.55], [0.42, 0.16, 1.0]]),
      smoothCurve([[-0.18, 0.16, 0.2], [-0.6, 0.16, 0.45], [-0.92, 0.16, 0.55]]),
      smoothCurve([[0.2, 0.16, -0.18], [0.0, 0.16, -0.6], [-0.05, 0.16, -1.0]]),
    ],
    [],
  );
  const cv: V3 = [0.85, 0.16, 0.85];
  return (
    <group>
      {/* rounded package + die (the die is the accent) */}
      <SoftBox position={[0, 0.06, 0]} args={[1.25, 0.12, 1.25]} radius={0.08} outline />
      <PulseBox position={[0, 0.13, 0]} args={[0.4, 0.04, 0.4]} base={0.5} amp={0.14} speed={1.5} />
      <Line points={roundedRectPts(0.42, 0.42, 0.05)} position={[0, 0.155, 0]} color={accent} lineWidth={1.2} transparent opacity={0.6} />

      {/* curved traces */}
      {traces.map((t, i) => (
        <Line key={i} points={t} color={NEUTRAL} lineWidth={1.1} transparent opacity={0.55} />
      ))}

      {/* round components (custom-ar-framework hotspot sits on the first) */}
      {([[0.42, 0.4], [0.56, 0.28], [-0.46, 0.42]] as [number, number][]).map(([cx, cz], i) => (
        <mesh key={i} position={[cx, 0.13, cz]}>
          <cylinderGeometry args={[0.05, 0.05, 0.12, 20]} />
          <GlassMat opacity={0.34} />
          <Edges threshold={30} color={NEUTRAL} />
        </mesh>
      ))}
      <SoftBox position={[-0.5, 0.11, -0.4]} args={[0.18, 0.07, 0.1]} radius={0.02} opacity={0.32} />

      {/* round database stack (top platter is the accent) */}
      <group position={[-0.92, 0, -0.92]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 0.05 + i * 0.07, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.06, 28]} />
            {i === 2 ? (
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.4} roughness={0.45} />
            ) : (
              <GlassMat opacity={0.28} />
            )}
            {i !== 2 && <Edges threshold={30} color={NEUTRAL} />}
          </mesh>
        ))}
      </group>

      {/* computer-vision frame (accent outline) */}
      <Line points={roundedRectPts(0.34, 0.34, 0.05)} position={[cv[0], cv[1], cv[2]]} color={accent} lineWidth={1.4} transparent opacity={0.75} />

      {/* secondary IC + heatsink and a pin-header connector fill the board out */}
      <Heatsink position={[-0.92, 0, 0.5]} />
      <PinHeader position={[-0.05, 0, 1.02]} n={6} />

      {/* Philips medical XR & AI module + extra decorative components */}
      <PhilipsModule position={[0.5, 0, -0.5]} />
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
            aria-label={hotspot.twin ? `${label} — fly into the live district` : `${label} — open node`}
            onClick={() => onActivate(hotspot)}
          >
            <span className="hotspot__ring" aria-hidden="true" />
            <span className="hotspot__label">
              {label}
              {hotspot.twin ? ' →' : ''}
            </span>
          </button>
        </span>
      </Html>
    </group>
  );
}

const RIGS: Record<LayerId, () => JSX.Element> = { city: CityRig, room: RoomRig, chip: ChipRig };
const SEED: Record<LayerId, number> = { city: 11, room: 29, chip: 53 };

export interface MaquetteProps {
  onActivate: (hotspot: Hotspot) => void;
}

export function Maquette({ onActivate }: MaquetteProps) {
  const journeyStep = useSceneSelector((s) => s.journeyStep);
  const activeLayer = (['city', 'room', 'chip'] as LayerId[])[journeyStep] ?? 'city';

  return (
    <group>
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
    </group>
  );
}
