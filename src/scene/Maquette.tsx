import { useMemo } from 'react';
import { Edges, Html, Instance, Instances, Line } from '@react-three/drei';
import { MAQUETTE_LAYERS, HOTSPOTS, type Hotspot } from './framing';
import { caseBySlug } from '../content';

// Abstract, art-directed hero (§4) — a large centerpiece, themed as a scale
// ladder that zooms from large to small (top → bottom): a City (GIS / location),
// a Room (games / apps / web) and a Chip (tools / CV / data). Each layer is a
// hexagonal honeycomb platform carrying objects at that scale. Dark, with
// electric-cyan accents.

const SLATE_DEEP = '#2a3850';
const SLATE_MID = '#3b4d68';
const SLATE_LITE = '#566c8e';
const EDGE_LINE = '#647c9e';
const ACCENT = '#2ee6e6';
const ACCENT_DIM = '#1aa6a6';

const HEX_S = 0.42; // hex size (centre → corner) == lattice spacing
const HEX_R = HEX_S * 0.9; // tile radius (gap forms the grid lines)
const HEX_H = 0.18;
const HEX_RINGS = 3;

type V3 = [number, number, number];

/** Flat-top axial hex → world (the default 6-gon cylinder is already flat-top). */
function hexWorld(q: number, r: number, y: number): V3 {
  return [HEX_S * 1.5 * q, y, HEX_S * Math.sqrt(3) * (q / 2 + r)];
}

function hexTiles(): [number, number][] {
  const out: [number, number][] = [];
  for (let q = -HEX_RINGS; q <= HEX_RINGS; q++) {
    for (let r = Math.max(-HEX_RINGS, -q - HEX_RINGS); r <= Math.min(HEX_RINGS, -q + HEX_RINGS); r++) {
      out.push([q, r]);
    }
  }
  return out;
}

function HexPlatform({
  y,
  color = SLATE_DEEP,
  opacity = 1,
  accent = [],
}: {
  y: number;
  color?: string;
  opacity?: number;
  accent?: [number, number][];
}) {
  const tiles = useMemo(hexTiles, []);
  return (
    <group>
      <Instances range={tiles.length} limit={tiles.length}>
        <cylinderGeometry args={[HEX_R, HEX_R, HEX_H, 6]} />
        <meshStandardMaterial
          color={color}
          roughness={0.82}
          metalness={0.18}
          transparent={opacity < 1}
          opacity={opacity}
        />
        {tiles.map(([q, r], i) => (
          <Instance key={i} position={hexWorld(q, r, y)} />
        ))}
      </Instances>

      {accent.map(([q, r], i) => {
        const [x, , z] = hexWorld(q, r, y);
        return (
          <mesh key={i} position={[x, y + 0.015, z]}>
            <cylinderGeometry args={[HEX_R * 0.98, HEX_R * 0.98, HEX_H + 0.03, 6]} />
            <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.85} roughness={0.3} />
          </mesh>
        );
      })}
    </group>
  );
}

function LocationPin({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.16, 0]}>
        <sphereGeometry args={[0.055, 16, 16]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.95} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.18, 8]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.4} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.05, 0.075, 24]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.3} side={2} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

/* ---------- Top: City — GIS & location (largest scale, many tiny objects) ---------- */
function CityRig({ y }: { y: number }) {
  const top = y + HEX_H / 2;
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
    [[-1.45, top + 0.005, -0.72], [0.65, top + 0.005, -0.72]],
    [[-0.3, top + 0.005, -1.0], [-0.3, top + 0.005, 0.7]],
  ];
  return (
    <group>
      {roads.map((r, i) => (
        <Line key={i} points={r} color={EDGE_LINE} lineWidth={1} />
      ))}
      {buildings.map(([bx, bz, h, w], i) => (
        <mesh key={i} position={[bx, top + h / 2, bz]}>
          <boxGeometry args={[w, h, w]} />
          <meshStandardMaterial color={i % 3 === 0 ? SLATE_LITE : SLATE_MID} roughness={0.8} />
          <Edges threshold={20} color={EDGE_LINE} />
        </mesh>
      ))}
      <LocationPin position={[0.6, top, 0.5]} />
      <LocationPin position={[-0.5, top, 0.62]} />
      <LocationPin position={[0.92, top, -0.4]} />
    </group>
  );
}

/* ---------- Middle: Room — games, apps & websites (human scale) ---------- */
function RoomRig({ y }: { y: number }) {
  const top = y + HEX_H / 2;
  return (
    <group>
      {/* desk + monitor + headset */}
      <group position={[0, top, -0.12]}>
        <mesh position={[0, 0.36, 0]}>
          <boxGeometry args={[0.95, 0.05, 0.5]} />
          <meshStandardMaterial color={SLATE_LITE} roughness={0.7} />
          <Edges threshold={20} color={EDGE_LINE} />
        </mesh>
        {([
          [-0.42, -0.2],
          [0.42, -0.2],
          [-0.42, 0.2],
          [0.42, 0.2],
        ] as [number, number][]).map(([lx, lz], i) => (
          <mesh key={i} position={[lx, 0.18, lz]}>
            <boxGeometry args={[0.04, 0.36, 0.04]} />
            <meshStandardMaterial color={SLATE_DEEP} roughness={0.8} />
          </mesh>
        ))}
        {/* monitor — the glowing screen reads as apps / websites */}
        <mesh position={[0, 0.6, -0.16]}>
          <boxGeometry args={[0.52, 0.32, 0.03]} />
          <meshStandardMaterial color={SLATE_DEEP} roughness={0.6} />
          <Edges threshold={20} color={EDGE_LINE} />
        </mesh>
        <mesh position={[0, 0.6, -0.142]}>
          <boxGeometry args={[0.46, 0.26, 0.01]} />
          <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.44, -0.16]}>
          <boxGeometry args={[0.06, 0.08, 0.05]} />
          <meshStandardMaterial color={SLATE_DEEP} />
        </mesh>
        {/* VR headset on the desk — games */}
        <group position={[0.33, 0.45, 0.1]} rotation={[0.1, -0.4, 0]}>
          <mesh>
            <boxGeometry args={[0.2, 0.12, 0.15]} />
            <meshStandardMaterial color={SLATE_MID} roughness={0.55} metalness={0.3} />
            <Edges threshold={20} color={EDGE_LINE} />
          </mesh>
          <mesh position={[0, 0, 0.08]}>
            <boxGeometry args={[0.16, 0.05, 0.02]} />
            <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.8} />
          </mesh>
        </group>
      </group>

      {/* chair */}
      <group position={[0, top, 0.52]}>
        <mesh position={[0, 0.24, 0]}>
          <boxGeometry args={[0.28, 0.05, 0.28]} />
          <meshStandardMaterial color={SLATE_MID} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.4, 0.13]}>
          <boxGeometry args={[0.28, 0.3, 0.05]} />
          <meshStandardMaterial color={SLATE_MID} roughness={0.7} />
          <Edges threshold={20} color={EDGE_LINE} />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.24, 10]} />
          <meshStandardMaterial color={SLATE_DEEP} />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.14, 0.14, 0.02, 16]} />
          <meshStandardMaterial color={SLATE_DEEP} />
        </mesh>
      </group>
    </group>
  );
}

/* ---------- Bottom: Chip — tools, CV & data (smallest scale, one zoomed-in part) ---------- */
function ChipRig({ y }: { y: number }) {
  const top = y + HEX_H / 2;
  const pins: V3[] = [];
  for (let i = 0; i < 6; i++) {
    const z = -0.5 + i * 0.2;
    pins.push([0.72, top + 0.04, z]);
    pins.push([-0.72, top + 0.04, z]);
  }
  const traces: V3[][] = [
    [[0.64, top + 0.02, 0.3], [1.08, top + 0.02, 0.5]],
    [[0.64, top + 0.02, -0.2], [1.04, top + 0.02, -0.46]],
    [[-0.64, top + 0.02, 0.12], [-1.04, top + 0.02, 0.36]],
    [[-0.64, top + 0.02, -0.3], [-1.0, top + 0.02, -0.56]],
  ];
  const bracket = (corner: V3, sx: number, sy: number): V3[] => [
    [corner[0] + sx * 0.1, corner[1], corner[2]],
    corner,
    [corner[0], corner[1], corner[2] + sy * 0.1],
  ];
  const cvc = 0.16;
  const cvy = top + 0.16;
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
      <mesh position={[0, top + 0.06, 0]}>
        <boxGeometry args={[1.25, 0.12, 1.25]} />
        <meshStandardMaterial color={SLATE_MID} roughness={0.7} metalness={0.25} />
        <Edges threshold={20} color={EDGE_LINE} />
      </mesh>
      {/* glowing core / die */}
      <mesh position={[0, top + 0.13, 0]}>
        <boxGeometry args={[0.4, 0.04, 0.4]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.7} roughness={0.3} />
      </mesh>
      {/* pins */}
      {pins.map((p, i) => (
        <mesh key={i} position={p}>
          <boxGeometry args={[0.12, 0.04, 0.1]} />
          <meshStandardMaterial color={SLATE_LITE} metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      {/* circuit traces to pads */}
      {traces.map((t, i) => (
        <group key={i}>
          <Line points={t} color={ACCENT_DIM} lineWidth={1.4} />
          <mesh position={t[1]}>
            <boxGeometry args={[0.08, 0.03, 0.08]} />
            <meshStandardMaterial color={SLATE_LITE} />
          </mesh>
        </group>
      ))}
      {/* database stack */}
      <group position={[-0.95, top, -0.92]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 0.05 + i * 0.07, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.06, 20]} />
            <meshStandardMaterial
              color={i === 2 ? ACCENT : SLATE_LITE}
              emissive={i === 2 ? ACCENT : '#000000'}
              emissiveIntensity={i === 2 ? 0.5 : 0}
              roughness={0.5}
            />
          </mesh>
        ))}
      </group>
      {/* computer-vision bounding box around a detected part */}
      <mesh position={[cvx, top + 0.16, cvz]}>
        <boxGeometry args={[0.18, 0.18, 0.18]} />
        <meshStandardMaterial color={SLATE_DEEP} roughness={0.8} />
        <Edges threshold={20} color={EDGE_LINE} />
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
          aria-label={hotspot.twin ? `${label} — fly into the live district` : `${label} — open case study`}
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
  return (
    <group>
      <HexPlatform y={chip.y} accent={[[2, -2], [-2, 1], [1, 1]]} />
      <ChipRig y={chip.y} />

      <HexPlatform y={room.y} color={SLATE_MID} accent={[[-1, -1], [2, -1], [0, 2]]} />
      <RoomRig y={room.y} />

      <HexPlatform y={city.y} accent={[[0, 0], [1, -2], [-2, 2]]} />
      <CityRig y={city.y} />

      {HOTSPOTS.map((h) => (
        <HotspotMarker key={h.slug} hotspot={h} onActivate={onActivate} />
      ))}
    </group>
  );
}
