import { createContext, useContext, useMemo, useRef, type CSSProperties } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, Html, Line } from '@react-three/drei';
import { Color, type MeshStandardMaterial } from 'three';
import { MAQUETTE_LAYERS, HOTSPOTS, LAYER_Y, LAYER_SCALE, type Hotspot, type LayerId } from './framing';
import { useSceneSelector } from './store';
import { useReducedMotion } from '../lib/useReducedMotion';
import { caseBySlug } from '../content';

// Scale ladder (top → bottom): City (GIS / location), Room (games / apps / web),
// Chip (tools / CV / data). Each layer sits on a flat, soft dot field that fades
// out toward the rim, with the literal objects (buildings, a couch, a chip)
// authored in LOCAL coords and placed + scaled by a wrapper group. Each layer
// carries its own accent colour (city = cyan, room = coral, chip = lime); the
// look is matte and restrained — no neon rim glow.

const GLASS = '#5b7da0';
const BG = '#0a0d10';

// Per-layer palette, supplied through context so every helper picks up the
// active layer's accent without prop-drilling.
interface Palette {
  accent: string;
  edge: string;
  dim: string;
}
const PALETTE: Record<LayerId, Palette> = {
  city: { accent: '#27e8f2', edge: '#83d8df', dim: '#1d818a' },
  room: { accent: '#ff9068', edge: '#f0a98f', dim: '#bd6147' },
  chip: { accent: '#a9f75c', edge: '#bfe592', dim: '#6f9c3c' },
};
const AccentCtx = createContext<Palette>(PALETTE.city);
const useAccent = () => useContext(AccentCtx);

type V3 = [number, number, number];

function GlassMat({ color = GLASS, opacity = 0.2 }: { color?: string; opacity?: number }) {
  return (
    <meshStandardMaterial
      color={color}
      transparent
      opacity={opacity}
      roughness={0.32}
      metalness={0}
      emissive="#0c2a30"
      emissiveIntensity={0.16}
      depthWrite={false}
    />
  );
}

/** A box whose emissive intensity gently pulses (data / screens / die). */
function PulseBox({ position, args, base = 0.45, amp = 0.12, speed = 1.6 }: { position: V3; args: V3; base?: number; amp?: number; speed?: number }) {
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

function Accent({ position, args, intensity = 0.4 }: { position: V3; args: V3; intensity?: number }) {
  const { accent } = useAccent();
  return (
    <mesh position={position}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={intensity} roughness={0.4} />
    </mesh>
  );
}

function GlassBox({ position, args, opacity = 0.2 }: { position: V3; args: V3; opacity?: number }) {
  const { edge } = useAccent();
  return (
    <mesh position={position}>
      <boxGeometry args={args} />
      <GlassMat opacity={opacity} />
      <Edges threshold={20} color={edge} />
    </mesh>
  );
}

/** Flat layer floor: a disc of dots whose colour fades into the background
 *  toward the rim (gradient transparency), plus a very faint boundary ring. */
function DotGrid() {
  const { accent, dim } = useAccent();
  const R = 2.2;
  const step = 0.26;
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
        const fade = Math.pow(1 - d / R, 1.5); // 1 at centre → 0 at rim
        tmp.copy(bg).lerp(c, 0.12 + 0.78 * fade);
        col.push(tmp.r, tmp.g, tmp.b);
      }
    return { positions: new Float32Array(pos), colors: new Float32Array(col) };
  }, [accent]);
  const ring = useMemo<V3[]>(() => {
    const p: V3[] = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      p.push([Math.cos(a) * R, 0, Math.sin(a) * R]);
    }
    return p;
  }, []);
  return (
    <group>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.03} vertexColors transparent opacity={0.85} sizeAttenuation depthWrite={false} />
      </points>
      <Line points={ring} color={dim} lineWidth={1} transparent opacity={0.12} />
    </group>
  );
}

function Tree({ position, h = 0.5 }: { position: V3; h?: number }) {
  const { edge } = useAccent();
  return (
    <group position={position}>
      <mesh position={[0, h * 0.25, 0]}>
        <cylinderGeometry args={[0.022, 0.028, h * 0.5, 6]} />
        <GlassMat opacity={0.28} />
      </mesh>
      <mesh position={[0, h * 0.62, 0]}>
        <coneGeometry args={[0.15, h * 0.5, 7]} />
        <GlassMat color="#3f8f8a" opacity={0.24} />
        <Edges threshold={30} color={edge} />
      </mesh>
      <mesh position={[0, h * 0.92, 0]}>
        <coneGeometry args={[0.1, h * 0.4, 7]} />
        <GlassMat color="#3f8f8a" opacity={0.24} />
        <Edges threshold={30} color={edge} />
      </mesh>
    </group>
  );
}

/* ---------- City — GIS & location (top) ---------- */

/** A park block — the home of the niantic-explorer hotspot. */
function Park({ position }: { position: V3 }) {
  const { dim } = useAccent();
  const border: V3[] = [
    [-0.46, 0.022, -0.46], [0.46, 0.022, -0.46], [0.46, 0.022, 0.46], [-0.46, 0.022, 0.46], [-0.46, 0.022, -0.46],
  ];
  return (
    <group position={position}>
      {/* lawn */}
      <mesh position={[0, 0.012, 0]}>
        <boxGeometry args={[0.94, 0.02, 0.94]} />
        <GlassMat color="#2f8a6e" opacity={0.18} />
      </mesh>
      <Line points={border} color={dim} lineWidth={1} transparent opacity={0.55} />
      {/* pond */}
      <mesh position={[-0.16, 0.024, 0.18]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.16, 28]} />
        <GlassMat color="#2e7f86" opacity={0.24} />
      </mesh>
      {/* a winding path */}
      <Line points={[[-0.46, 0.026, -0.1], [0.05, 0.026, 0.0], [0.14, 0.026, 0.46]]} color={dim} lineWidth={1.2} transparent opacity={0.45} />
      {/* trees */}
      <Tree position={[0.22, 0, -0.2]} h={0.46} />
      <Tree position={[0.26, 0, 0.24]} h={0.38} />
      <Tree position={[-0.24, 0, -0.26]} h={0.42} />
    </group>
  );
}

/** A civic town hall — the anchor for the municipal-twin (live) hotspot. */
function TownHall({ position }: { position: V3 }) {
  const { edge } = useAccent();
  return (
    <group position={position}>
      {/* steps */}
      <GlassBox position={[0, 0.025, 0.3]} args={[0.5, 0.05, 0.14]} opacity={0.28} />
      {/* main block */}
      <mesh position={[0, 0.27, 0]}>
        <boxGeometry args={[0.62, 0.5, 0.46]} />
        <GlassMat />
        <Edges threshold={20} color={edge} />
      </mesh>
      {/* cornice band */}
      <Accent position={[0, 0.52, 0]} args={[0.66, 0.015, 0.5]} intensity={0.35} />
      {/* portico columns */}
      {[-0.22, -0.075, 0.075, 0.22].map((x, i) => (
        <mesh key={i} position={[x, 0.18, 0.235]}>
          <cylinderGeometry args={[0.016, 0.016, 0.34, 8]} />
          <GlassMat opacity={0.32} />
        </mesh>
      ))}
      {/* clock tower */}
      <mesh position={[0, 0.67, -0.02]}>
        <boxGeometry args={[0.2, 0.34, 0.2]} />
        <GlassMat />
        <Edges threshold={20} color={edge} />
      </mesh>
      {/* clock face */}
      <Accent position={[0, 0.72, 0.092]} args={[0.08, 0.08, 0.012]} intensity={0.5} />
      {/* spire */}
      <mesh position={[0, 0.9, -0.02]}>
        <coneGeometry args={[0.1, 0.16, 4]} />
        <GlassMat opacity={0.28} />
        <Edges threshold={30} color={edge} />
      </mesh>
    </group>
  );
}

function CityRig() {
  const { edge, dim } = useAccent();
  // A clean block grid: two avenues, two streets, leaving a civic block (town
  // hall) in the centre and a park block to the south.
  const roads: V3[][] = [
    [[-2, 0.01, -0.75], [2, 0.01, -0.75]],
    [[-2, 0.01, 0.4], [2, 0.01, 0.4]],
    [[-0.55, 0.01, -2], [-0.55, 0.01, 2]],
    [[1.42, 0.01, -2], [1.42, 0.01, 2]],
  ];
  // [x, z, height, footprint, hasAntenna]
  const buildings: [number, number, number, number, boolean][] = [
    [-1.35, -1.3, 0.55, 0.34, true],
    [-1.3, -0.05, 0.34, 0.3, false],
    [0.2, -1.3, 0.46, 0.32, false],
    [0.85, -1.15, 0.6, 0.3, true],
    [1.8, -1.2, 0.4, 0.3, false],
    [1.8, 0.0, 0.34, 0.34, false],
    [-1.35, 1.3, 0.3, 0.3, false],
    [1.85, 1.2, 0.5, 0.3, true],
  ];
  return (
    <group>
      {roads.map((r, i) => (
        <Line key={i} points={r} color={dim} lineWidth={1.2} transparent opacity={0.5} />
      ))}
      {/* centre-line lane dashes */}
      {[-1.5, -1.0, -0.5, 0.0, 0.7, 1.2, 1.7].map((x, i) => (
        <Line key={`d${i}`} points={[[x, 0.02, -0.75], [x + 0.16, 0.02, -0.75]]} color={dim} lineWidth={1.2} transparent opacity={0.7} />
      ))}

      {buildings.map(([bx, bz, h, w, ant], i) => (
        <group key={i} position={[bx, 0, bz]}>
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[w, h, w]} />
            <GlassMat />
            <Edges threshold={20} color={edge} />
          </mesh>
          <Accent position={[0, h + 0.008, 0]} args={[w * 0.7, 0.014, w * 0.7]} intensity={0.32} />
          {ant && (
            <mesh position={[w * 0.22, h + 0.13, w * 0.22]}>
              <cylinderGeometry args={[0.004, 0.004, 0.26, 6]} />
              <meshStandardMaterial color={edge} emissive={edge} emissiveIntensity={0.5} />
            </mesh>
          )}
        </group>
      ))}

      {/* church: nave + steeple + spire + cross */}
      <group position={[-1.4, 0, 0.95]}>
        <GlassBox position={[0, 0.18, 0]} args={[0.34, 0.36, 0.5]} />
        <GlassBox position={[0, 0.32, -0.28]} args={[0.2, 0.64, 0.2]} />
        <mesh position={[0, 0.78, -0.28]}>
          <coneGeometry args={[0.15, 0.34, 4]} />
          <GlassMat opacity={0.28} />
          <Edges threshold={30} color={edge} />
        </mesh>
        <Accent position={[0, 1.02, -0.28]} args={[0.015, 0.13, 0.015]} intensity={0.6} />
        <Accent position={[0, 1.0, -0.28]} args={[0.08, 0.015, 0.015]} intensity={0.6} />
      </group>

      {/* the town hall (live municipal twin) and the park (niantic explorer) */}
      <TownHall position={[0.2, 0, -0.2]} />
      <Park position={[0.9, 0, 0.9]} />

      {/* a couple of street trees outside the park */}
      <Tree position={[-0.9, 0, -1.1]} h={0.4} />
      <Tree position={[1.1, 0, -0.45]} h={0.36} />
    </group>
  );
}

/* ---------- Room — games, apps & websites (middle) ---------- */
function RoomRig() {
  const { accent, edge, dim } = useAccent();
  return (
    <group>
      {/* carpet */}
      <mesh position={[0.05, 0.012, 0.45]}>
        <boxGeometry args={[1.7, 0.02, 1.15]} />
        <GlassMat opacity={0.14} />
      </mesh>
      <Line
        points={[[-0.78, 0.025, -0.06], [0.88, 0.025, -0.06], [0.88, 0.025, 0.96], [-0.78, 0.025, 0.96], [-0.78, 0.025, -0.06]]}
        color={dim}
        lineWidth={1}
        transparent
        opacity={0.55}
      />

      {/* desk + monitor (virtuele-brigade lives on the screen) + keyboard */}
      <group position={[0, 0, -1.05]}>
        <GlassBox position={[0, 0.36, 0]} args={[0.95, 0.05, 0.45]} />
        {([[-0.42, -0.18], [0.42, -0.18], [-0.42, 0.18], [0.42, 0.18]] as [number, number][]).map(([lx, lz], i) => (
          <mesh key={i} position={[lx, 0.18, lz]}>
            <boxGeometry args={[0.04, 0.36, 0.04]} />
            <GlassMat opacity={0.28} />
          </mesh>
        ))}
        {/* monitor on a stand */}
        <mesh position={[0, 0.45, -0.05]}>
          <cylinderGeometry args={[0.016, 0.016, 0.14, 10]} />
          <GlassMat opacity={0.28} />
        </mesh>
        <GlassBox position={[0, 0.62, -0.14]} args={[0.54, 0.34, 0.03]} />
        <PulseBox position={[0, 0.62, -0.122]} args={[0.48, 0.28, 0.008]} base={0.4} amp={0.1} speed={1.2} />
        <Accent position={[-0.1, 0.69, -0.115]} args={[0.24, 0.02, 0.004]} intensity={0.35} />
        {/* keyboard */}
        <GlassBox position={[0, 0.39, 0.12]} args={[0.34, 0.02, 0.12]} opacity={0.28} />
      </group>

      {/* desk chair */}
      <group position={[0, 0, -0.55]}>
        <GlassBox position={[0, 0.24, 0]} args={[0.28, 0.05, 0.28]} />
        <GlassBox position={[0, 0.4, -0.13]} args={[0.28, 0.3, 0.05]} />
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.24, 10]} />
          <GlassMat opacity={0.28} />
        </mesh>
      </group>

      {/* couch with a phone on it (popcore-games lives on the phone screen) */}
      <group position={[0.1, 0, 0.78]}>
        <GlassBox position={[0, 0.12, 0]} args={[0.92, 0.16, 0.44]} />
        <GlassBox position={[0, 0.3, -0.2]} args={[0.92, 0.28, 0.08]} />
        <GlassBox position={[-0.46, 0.22, 0]} args={[0.08, 0.24, 0.44]} />
        <GlassBox position={[0.46, 0.22, 0]} args={[0.08, 0.24, 0.44]} />
        {/* a cushion */}
        <GlassBox position={[-0.24, 0.22, 0.02]} args={[0.3, 0.12, 0.32]} opacity={0.24} />
        {/* phone resting on the seat, screen up */}
        <mesh position={[0.12, 0.205, 0.06]} rotation={[-Math.PI / 2, 0, 0.3]}>
          <boxGeometry args={[0.09, 0.18, 0.012]} />
          <GlassMat opacity={0.38} />
        </mesh>
        <mesh position={[0.122, 0.212, 0.06]} rotation={[-Math.PI / 2, 0, 0.3]}>
          <boxGeometry args={[0.075, 0.155, 0.004]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.5} roughness={0.4} />
        </mesh>
      </group>

      {/* bookcase against the left edge */}
      <group position={[-1.55, 0, 0.1]}>
        <GlassBox position={[0, 0.45, 0]} args={[0.12, 0.9, 0.72]} />
        {[0.16, 0.42, 0.68].map((y, i) => (
          <GlassBox key={i} position={[0, y, 0]} args={[0.12, 0.015, 0.7]} opacity={0.28} />
        ))}
        {Array.from({ length: 9 }).map((_, i) => {
          const shelf = Math.floor(i / 3);
          const idx = i % 3;
          return (
            <mesh key={i} position={[0.01, 0.24 + shelf * 0.26, -0.22 + idx * 0.18 + (i % 2) * 0.03]}>
              <boxGeometry args={[0.07, 0.16, 0.035]} />
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.12 + (i % 3) * 0.07} roughness={0.55} />
            </mesh>
          );
        })}
      </group>

      {/* a potted plant for a little life */}
      <group position={[0.95, 0, 0.0]}>
        <mesh position={[0, 0.08, 0]}>
          <cylinderGeometry args={[0.07, 0.05, 0.16, 12]} />
          <GlassMat opacity={0.3} />
          <Edges threshold={20} color={edge} />
        </mesh>
        <mesh position={[0, 0.26, 0]}>
          <coneGeometry args={[0.12, 0.3, 7]} />
          <GlassMat color="#3f8f8a" opacity={0.24} />
          <Edges threshold={30} color={edge} />
        </mesh>
      </group>
    </group>
  );
}

/* ---------- Chip — tools, CV & data (bottom) ---------- */
function ChipRig() {
  const { accent, edge, dim } = useAccent();
  const pins: V3[] = [];
  for (let i = 0; i < 8; i++) {
    const t = -0.56 + i * 0.16;
    pins.push([0.72, 0.04, t], [-0.72, 0.04, t], [t, 0.04, 0.72], [t, 0.04, -0.72]);
  }
  const traces: V3[][] = [
    [[0.64, 0.02, 0.3], [1.1, 0.02, 0.52]],
    [[0.64, 0.02, -0.2], [1.05, 0.02, -0.48]],
    [[-0.64, 0.02, 0.12], [-1.05, 0.02, 0.38]],
    [[-0.64, 0.02, -0.3], [-1.02, 0.02, -0.58]],
    [[0.2, 0.02, 0.64], [0.42, 0.02, 1.05]],
    [[-0.3, 0.02, -0.64], [-0.5, 0.02, -1.0]],
  ];
  const bracket = (c: V3, sx: number, sy: number): V3[] => [
    [c[0] + sx * 0.1, c[1], c[2]],
    c,
    [c[0], c[1], c[2] + sy * 0.1],
  ];
  const cvc = 0.16;
  const cv: V3 = [0.85, 0.16, 0.85];
  const cvCorners: [V3, number, number][] = [
    [[cv[0] - cvc, cv[1], cv[2] - cvc], 1, 1],
    [[cv[0] + cvc, cv[1], cv[2] - cvc], -1, 1],
    [[cv[0] - cvc, cv[1], cv[2] + cvc], 1, -1],
    [[cv[0] + cvc, cv[1], cv[2] + cvc], -1, -1],
  ];
  return (
    <group>
      {/* package */}
      <GlassBox position={[0, 0.06, 0]} args={[1.25, 0.12, 1.25]} />
      {/* the die / "brain" — amsterdam-ai hotspot sits just above this */}
      <PulseBox position={[0, 0.13, 0]} args={[0.4, 0.04, 0.4]} base={0.45} amp={0.14} speed={1.5} />
      {[-0.12, 0, 0.12].map((o, i) => (
        <group key={i}>
          <Line points={[[-0.18, 0.155, o], [0.18, 0.155, o]]} color={edge} lineWidth={1} transparent opacity={0.6} />
          <Line points={[[o, 0.155, -0.18], [o, 0.155, 0.18]]} color={edge} lineWidth={1} transparent opacity={0.6} />
        </group>
      ))}
      {pins.map((p, i) => (
        <mesh key={i} position={p}>
          <boxGeometry args={[0.09, 0.04, 0.07]} />
          <GlassMat opacity={0.32} />
        </mesh>
      ))}
      {traces.map((t, i) => (
        <group key={i}>
          <Line points={t} color={dim} lineWidth={1.3} transparent opacity={0.7} />
          <Accent position={t[1]} args={[0.07, 0.025, 0.07]} intensity={0.32} />
        </group>
      ))}
      {/* components: capacitors (custom-ar-framework hotspot sits on the first),
          a resistor and a crystal */}
      {([[0.42, 0.4], [0.56, 0.28]] as [number, number][]).map(([cx, cz], i) => (
        <mesh key={i} position={[cx, 0.13, cz]}>
          <cylinderGeometry args={[0.05, 0.05, 0.12, 16]} />
          <GlassMat opacity={0.34} />
          <Edges threshold={20} color={edge} />
        </mesh>
      ))}
      <GlassBox position={[-0.42, 0.105, 0.46]} args={[0.16, 0.05, 0.07]} opacity={0.33} />
      <GlassBox position={[-0.5, 0.115, -0.4]} args={[0.18, 0.07, 0.1]} opacity={0.33} />
      {/* database stack */}
      <group position={[-0.92, 0, -0.92]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 0.05 + i * 0.07, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.06, 20]} />
            {i === 2 ? (
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.4} roughness={0.45} />
            ) : (
              <GlassMat opacity={0.28} />
            )}
            {i !== 2 && <Edges threshold={20} color={edge} />}
          </mesh>
        ))}
      </group>
      {/* computer-vision bounding box */}
      <GlassBox position={cv} args={[0.18, 0.18, 0.18]} opacity={0.28} />
      {cvCorners.map((c, i) => (
        <Line key={i} points={bracket(c[0], c[1], c[2])} color={accent} lineWidth={1.6} transparent opacity={0.8} />
      ))}
    </group>
  );
}

function HotspotMarker({ hotspot, color, onActivate }: { hotspot: Hotspot; color: string; onActivate: (h: Hotspot) => void }) {
  const study = caseBySlug(hotspot.slug);
  const label = study?.title ?? hotspot.slug;
  return (
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
  );
}

const RIGS: Record<LayerId, () => JSX.Element> = { city: CityRig, room: RoomRig, chip: ChipRig };

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
              <DotGrid />
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
