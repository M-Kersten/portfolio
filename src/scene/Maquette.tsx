import { useMemo } from 'react';
import { Edges, Html, Line } from '@react-three/drei';
import { MAQUETTE_LAYERS, HOTSPOTS, type Hotspot } from './framing';
import { useSceneSelector } from './store';
import { caseBySlug } from '../content';

// Abstract hero, themed as a scale ladder (top → bottom): City (GIS / location),
// Room (games / apps / web), Chip (tools / CV / data). Clean "x-ray" look — each
// layer is a dot-grid plane and the objects are thin wireframes with faint fills;
// only the data/accents glow.

const SLATE_FILL = '#4a6080';
const XR_EDGE = '#8fb6d6';
const DOT_DIM = '#3a6f7a';
const ACCENT = '#2ee6e6';
const ACCENT_DIM = '#1aa6a6';
const XR_OPACITY = 0.14;

type V3 = [number, number, number];

/** Faint translucent fill used across the x-ray objects. */
function XrayMat({ color = SLATE_FILL, opacity = XR_OPACITY }: { color?: string; opacity?: number }) {
  return (
    <meshStandardMaterial
      color={color}
      transparent
      opacity={opacity}
      roughness={0.7}
      metalness={0.1}
      depthWrite={false}
    />
  );
}

/** A clean lattice of dots at grid intersections + a faint boundary ring. */
function DotGrid({ y, accent = [] }: { y: number; accent?: [number, number][] }) {
  const R = 2.2;
  const step = 0.3;
  const positions = useMemo(() => {
    const pos: number[] = [];
    for (let x = -R; x <= R + 1e-6; x += step) {
      for (let z = -R; z <= R + 1e-6; z += step) {
        if (Math.hypot(x, z) <= R) pos.push(x, y, z);
      }
    }
    return new Float32Array(pos);
  }, [y]);
  const ring = useMemo<V3[]>(() => {
    const p: V3[] = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      p.push([Math.cos(a) * R, y, Math.sin(a) * R]);
    }
    return p;
  }, [y]);

  return (
    <group>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.04} color={DOT_DIM} transparent opacity={0.55} sizeAttenuation depthWrite={false} />
      </points>
      <Line points={ring} color={DOT_DIM} lineWidth={1} />
      {accent.map(([x, z], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={1.1} />
        </mesh>
      ))}
    </group>
  );
}

function LocationPin({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.16, 0]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={1.0} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.18, 8]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.05, 0.072, 24]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.35} side={2} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

/* ---------- City — GIS & location (top) ---------- */
function CityRig({ y }: { y: number }) {
  const buildings: [number, number, number, number][] = [
    [-1.2, -0.4, 0.5, 0.28],
    [-0.95, -0.62, 0.4, 0.4],
    [-1.0, -0.15, 0.34, 0.22],
    [-0.62, -0.5, 0.3, 0.5],
    [-0.66, -0.05, 0.42, 0.3],
    [-1.25, 0.0, 0.3, 0.34],
    [-0.4, -0.35, 0.46, 0.24],
    [0.0, -0.58, 0.36, 0.3],
    [0.34, -0.22, 0.5, 0.26],
  ];
  const roads: V3[][] = [
    [[-1.45, y + 0.005, -0.72], [0.65, y + 0.005, -0.72]],
    [[-0.3, y + 0.005, -1.0], [-0.3, y + 0.005, 0.7]],
  ];
  return (
    <group>
      {roads.map((r, i) => (
        <Line key={i} points={r} color={ACCENT_DIM} lineWidth={1} />
      ))}
      {buildings.map(([bx, bz, h, w], i) => (
        <mesh key={i} position={[bx, y + h / 2, bz]}>
          <boxGeometry args={[w, h, w]} />
          <XrayMat />
          <Edges threshold={20} color={XR_EDGE} />
        </mesh>
      ))}
      <LocationPin position={[0.6, y, 0.5]} />
      <LocationPin position={[-0.5, y, 0.62]} />
      <LocationPin position={[0.92, y, -0.4]} />
    </group>
  );
}

/* ---------- Room — games, apps & websites (middle) ---------- */
function RoomRig({ y }: { y: number }) {
  return (
    <group>
      <group position={[0, y, -0.12]}>
        <mesh position={[0, 0.36, 0]}>
          <boxGeometry args={[0.95, 0.05, 0.5]} />
          <XrayMat />
          <Edges threshold={20} color={XR_EDGE} />
        </mesh>
        {([
          [-0.42, -0.2],
          [0.42, -0.2],
          [-0.42, 0.2],
          [0.42, 0.2],
        ] as [number, number][]).map(([lx, lz], i) => (
          <mesh key={i} position={[lx, 0.18, lz]}>
            <boxGeometry args={[0.04, 0.36, 0.04]} />
            <XrayMat opacity={0.22} />
          </mesh>
        ))}
        {/* monitor — the glowing screen reads as apps / websites */}
        <mesh position={[0, 0.6, -0.16]}>
          <boxGeometry args={[0.52, 0.32, 0.03]} />
          <XrayMat />
          <Edges threshold={20} color={XR_EDGE} />
        </mesh>
        <mesh position={[0, 0.6, -0.142]}>
          <boxGeometry args={[0.46, 0.26, 0.01]} />
          <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.75} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.44, -0.16]}>
          <boxGeometry args={[0.06, 0.08, 0.05]} />
          <XrayMat opacity={0.22} />
        </mesh>
        {/* headset — games */}
        <group position={[0.33, 0.45, 0.1]} rotation={[0.1, -0.4, 0]}>
          <mesh>
            <boxGeometry args={[0.2, 0.12, 0.15]} />
            <XrayMat opacity={0.2} />
            <Edges threshold={20} color={XR_EDGE} />
          </mesh>
          <mesh position={[0, 0, 0.08]}>
            <boxGeometry args={[0.16, 0.05, 0.02]} />
            <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.8} />
          </mesh>
        </group>
      </group>

      {/* chair */}
      <group position={[0, y, 0.52]}>
        <mesh position={[0, 0.24, 0]}>
          <boxGeometry args={[0.28, 0.05, 0.28]} />
          <XrayMat />
          <Edges threshold={20} color={XR_EDGE} />
        </mesh>
        <mesh position={[0, 0.4, 0.13]}>
          <boxGeometry args={[0.28, 0.3, 0.05]} />
          <XrayMat />
          <Edges threshold={20} color={XR_EDGE} />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.24, 10]} />
          <XrayMat opacity={0.22} />
        </mesh>
      </group>
    </group>
  );
}

/* ---------- Chip — tools, CV & data (bottom) ---------- */
function ChipRig({ y }: { y: number }) {
  const pins: V3[] = [];
  for (let i = 0; i < 6; i++) {
    const z = -0.5 + i * 0.2;
    pins.push([0.72, y + 0.04, z]);
    pins.push([-0.72, y + 0.04, z]);
  }
  const traces: V3[][] = [
    [[0.64, y + 0.02, 0.3], [1.08, y + 0.02, 0.5]],
    [[0.64, y + 0.02, -0.2], [1.04, y + 0.02, -0.46]],
    [[-0.64, y + 0.02, 0.12], [-1.04, y + 0.02, 0.36]],
    [[-0.64, y + 0.02, -0.3], [-1.0, y + 0.02, -0.56]],
  ];
  const bracket = (corner: V3, sx: number, sy: number): V3[] => [
    [corner[0] + sx * 0.1, corner[1], corner[2]],
    corner,
    [corner[0], corner[1], corner[2] + sy * 0.1],
  ];
  const cvc = 0.16;
  const cvy = y + 0.16;
  const cvx = 0.85;
  const cvz = 0.85;
  const cvCorners: [V3, number, number][] = [
    [[cvx - cvc, cvy, cvz - cvc], 1, 1],
    [[cvx + cvc, cvy, cvz - cvc], -1, 1],
    [[cvx - cvc, cvy, cvz + cvc], 1, -1],
    [[cvx + cvc, cvy, cvz + cvc], -1, -1],
  ];

  return (
    <group>
      {/* IC package */}
      <mesh position={[0, y + 0.06, 0]}>
        <boxGeometry args={[1.25, 0.12, 1.25]} />
        <XrayMat />
        <Edges threshold={20} color={XR_EDGE} />
      </mesh>
      {/* glowing die */}
      <mesh position={[0, y + 0.13, 0]}>
        <boxGeometry args={[0.4, 0.04, 0.4]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.75} roughness={0.3} />
      </mesh>
      {pins.map((p, i) => (
        <mesh key={i} position={p}>
          <boxGeometry args={[0.12, 0.04, 0.1]} />
          <XrayMat opacity={0.3} />
        </mesh>
      ))}
      {traces.map((t, i) => (
        <group key={i}>
          <Line points={t} color={ACCENT_DIM} lineWidth={1.4} />
          <mesh position={t[1]}>
            <boxGeometry args={[0.08, 0.03, 0.08]} />
            <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.5} />
          </mesh>
        </group>
      ))}
      {/* database stack */}
      <group position={[-0.95, y, -0.92]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 0.05 + i * 0.07, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.06, 20]} />
            {i === 2 ? (
              <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.5} roughness={0.4} />
            ) : (
              <XrayMat opacity={0.2} />
            )}
            {i !== 2 && <Edges threshold={20} color={XR_EDGE} />}
          </mesh>
        ))}
      </group>
      {/* computer-vision bounding box */}
      <mesh position={[cvx, y + 0.16, cvz]}>
        <boxGeometry args={[0.18, 0.18, 0.18]} />
        <XrayMat opacity={0.2} />
      </mesh>
      {cvCorners.map((c, i) => (
        <Line key={i} points={bracket(c[0], c[1], c[2])} color={ACCENT} lineWidth={2} />
      ))}
    </group>
  );
}

function HotspotMarker({ hotspot, onActivate }: { hotspot: Hotspot; onActivate: (h: Hotspot) => void }) {
  const study = caseBySlug(hotspot.slug);
  const label = study?.title ?? hotspot.slug;
  return (
    <Html position={hotspot.position} center zIndexRange={[20, 0]} className="hotspot-wrap">
      <span className="hotspot">
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
  );
}

export interface MaquetteProps {
  onActivate: (hotspot: Hotspot) => void;
}

export function Maquette({ onActivate }: MaquetteProps) {
  const [chip, room, city] = MAQUETTE_LAYERS;
  const journeyStep = useSceneSelector((s) => s.journeyStep);
  // Show only the centred layer's hotspots (journeyStep: City 0, Room 1, Chip 2;
  // MAQUETTE_LAYERS index is the reverse, so step = 2 - layerIndex).
  const activeHotspots = HOTSPOTS.filter((h) => 2 - h.layerIndex === journeyStep);

  return (
    <group>
      <DotGrid y={chip.y} accent={[[0.85, 0.85], [-0.95, -0.92]]} />
      <ChipRig y={chip.y} />

      <DotGrid y={room.y} accent={[[0, 0.48]]} />
      <RoomRig y={room.y} />

      <DotGrid y={city.y} accent={[[0.6, 0.5], [0.92, -0.4]]} />
      <CityRig y={city.y} />

      {activeHotspots.map((h) => (
        <HotspotMarker key={h.slug} hotspot={h} onActivate={onActivate} />
      ))}
    </group>
  );
}
