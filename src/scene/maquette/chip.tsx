// The CHIP layer (bottom) — tools, CV & data. A PCB with the pulsing die
// (Amsterdam AI), the AR lens component (custom AR framework) and the Philips
// ECG module, wired together with animated traces and LEDs that surge while a
// chip project is engaged. ChipRig composes and places everything.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, RoundedBox } from '@react-three/drei';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Line as ThreeLine, LineBasicMaterial, MeshStandardMaterial, type Group, type Mesh } from 'three';
import { useSceneSelector } from '../store';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { NEUTRAL, useAccent, circlePts, roundedRectPts, Line, useActive, bounceObject, type V3 } from './shared';
import { GHOST_FILL, LifeGroup, EmissiveHover } from './life';
import { GlassMat, SoftBox } from './materials';

/* ---------- Chip — tools, CV & data (bottom) ---------- */

/** Philips medical XR & AI — an ECG module with a tiny Vision Pro headset. On
 *  hover a bright blip sweeps the heart-rate waveform like a monitor trace. */
function PhilipsModule({ position, hoverSlug }: { position: V3; hoverSlug?: string }) {
  const { selected, visited } = useActive(hoverSlug ?? '');
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
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta);
    k.current += ((selected || visited ? 1 : 0) - k.current) * 0.12;
    live.current += ((selected || visited ? 1 : 0) - live.current) * 0.07; // green stays after select
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
      {/* the ECG waveform + a blip that sweeps it once engaged (the heart-rate signal) */}
      <Line points={ecg} position={[0, 0.22, 0]} color={selected || visited ? '#5fd07a' : '#9fb0bd'} lineWidth={1.8} transparent opacity={0.85} />
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
          <meshStandardMaterial ref={stripMat} userData={{ lifeSkip: true }} color="#9fb0bd" emissive="#9fb0bd" emissiveIntensity={0.4} roughness={0.4} toneMapped={false} />
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
  // The board powers on when any chip hotspot is selected and stays on once
  // visited — it comes to life by selecting, never by hovering.
  const selected = useSceneSelector((s) => CHIP_SLUGS.includes(s.selectedSlug ?? ''));
  const visited = useSceneSelector((s) => CHIP_SLUGS.some((c) => s.visited.includes(c)));
  return selected || visited ? 1 : 0;
}

// The board's components, spread well out around the die. Each gets a trace from
// the die and a coloured status LED that flashes (its own rhythm) when live.
// `ly` sits each LED on top of its component rather than floating above the board.
const CHIP_NODES: { x: number; z: number; ly: number; led: string; phase: number; speed: number }[] = [
  { x: 0.95, z: -0.72, ly: 0.2, led: '#7fe6ff', phase: 0.0, speed: 6.5 }, // custom-ar (back-right)
  { x: -0.95, z: -0.74, ly: 0.175, led: '#ff6a6a', phase: 1.1, speed: 5.0 }, // philips (left)
  { x: 0.92, z: 0.62, ly: 0.225, led: '#a9f75c', phase: 2.0, speed: 7.5 }, // database (front-right)
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
  const { selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const mat = useRef<MeshStandardMaterial>(null);
  const k = useRef(0);
  const popRef = useRef<Group>(null);
  const lensC = useMemo(() => new Color('#7fe6ff'), []);
  useFrame((s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta);
    k.current += ((selected || visited ? 1 : 0) - k.current) * 0.12;
    if (mat.current) {
      const breathe = reduced ? 0 : Math.sin(s.clock.elapsedTime * 2.2) * 0.06;
      // ghost glass until opened, then the lens lights ice-blue
      mat.current.color.copy(GHOST_FILL).lerp(lensC, 0.2 + 0.8 * k.current);
      mat.current.emissive.copy(GHOST_FILL).lerp(lensC, 0.2 + 0.8 * k.current);
      mat.current.emissiveIntensity = 0.05 + k.current * (1.0 + breathe);
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
        <meshStandardMaterial ref={mat} userData={{ lifeSkip: true }} color="#7fe6ff" emissive="#7fe6ff" emissiveIntensity={0.14} transparent opacity={0.55} roughness={0.12} metalness={0.1} toneMapped={false} />
      </mesh>
      {/* lens element rings */}
      <Line points={circlePts(0.055, 28)} position={[0, 0.119, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.5} />
      <Line points={circlePts(0.03, 20)} position={[0, 0.127, 0]} color="#7fe6ff" lineWidth={1.2} transparent opacity={0.6} />
      </group>
    </group>
  );
}

export function ChipRig() {
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
      <LifeGroup slug="amsterdam-ai">
        <SoftBox position={[0, 0.08, 0]} args={[1.05, 0.12, 1.05]} radius={0.08} outline liveSlug="amsterdam-ai" />
        <EmissiveHover slug="amsterdam-ai" position={[0, 0.15, 0]} args={[0.4, 0.04, 0.4]} rest={0.25} peak={1.2} liveColor="#ffcf5e" />
        <Line points={roundedRectPts(0.42, 0.42, 0.05)} position={[0, 0.175, 0]} color={accent} lineWidth={1.2} transparent opacity={0.6} />
      </LifeGroup>

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

      {/* custom-ar-framework — an AR camera lens that lights up (back-right) */}
      <LifeGroup slug="custom-ar-framework">
        <LensComponent slug="custom-ar-framework" position={[0.95, 0.02, -0.72]} />
      </LifeGroup>

      {/* decorative round caps */}
      {([[-0.55, 0.95], [0.55, -1.0]] as [number, number][]).map(([cx, cz], i) => (
        <mesh key={i} position={[cx, 0.13, cz]}>
          <cylinderGeometry args={[0.05, 0.05, 0.12, 20]} />
          <GlassMat opacity={0.34} />
          <Edges threshold={30} color={NEUTRAL} />
        </mesh>
      ))}

      {/* round database stack (top platter is the accent) — moved to the front-right,
          into the spot the AR lens vacated, so the board stays balanced */}
      <group position={[0.92, 0, 0.62]}>
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

      {/* Philips medical XR & AI module (heart-rate signal animates on hover) — left side */}
      <LifeGroup slug="philips-medical-xr">
        <PhilipsModule position={[-0.95, 0, -0.74]} hoverSlug="philips-medical-xr" />
      </LifeGroup>
      <MiscComponents />
    </group>
  );
}

