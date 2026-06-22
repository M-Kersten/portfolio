import { Edges, Html, Line } from '@react-three/drei';
import { MAQUETTE_LAYERS, HOTSPOTS, type Hotspot } from './framing';
import { caseBySlug } from '../content';

// Abstract, art-directed hero (§4) — but no longer sparse. Each of the three
// slabs carries objects that read as its discipline: a VR rig, an AR overlay,
// and a mini digital twin. Dark, with electric-cyan accents.

const SLATE_DEEP = '#2a3850';
const SLATE_MID = '#3b4d68';
const SLATE_LITE = '#566c8e';
const EDGE = '#41506a';
const EDGE_LINE = '#647c9e';
const ACCENT = '#2ee6e6';
const ACCENT_DIM = '#1aa6a6';

const SLAB = { w: 4.4, h: 0.16, d: 3.2 };

type V3 = [number, number, number];

function Slab({ y, color = SLATE_DEEP, opacity = 1 }: { y: number; color?: string; opacity?: number }) {
  return (
    <mesh position={[0, y, 0]}>
      <boxGeometry args={[SLAB.w, SLAB.h, SLAB.d]} />
      <meshStandardMaterial
        color={color}
        roughness={0.82}
        metalness={0.15}
        transparent={opacity < 1}
        opacity={opacity}
      />
      <Edges threshold={15} color={EDGE_LINE} />
    </mesh>
  );
}

function AccentNode({ position, size = 0.09 }: { position: V3; size?: number }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[size, 20, 20]} />
      <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={1.1} roughness={0.4} />
    </mesh>
  );
}

/* ---------- Bottom: VR training rig ---------- */
function VrRig({ y }: { y: number }) {
  const top = y + 0.08;
  const b = 1.5;
  const d = 1.05;
  // play-area boundary ("guardian")
  const boundary: V3[] = [
    [-b, top + 0.01, -d],
    [b, top + 0.01, -d],
    [b, top + 0.01, d],
    [-b, top + 0.01, d],
    [-b, top + 0.01, -d],
  ];
  return (
    <group>
      <Line points={boundary} color={ACCENT_DIM} lineWidth={1.2} />

      {/* headset on a low stand */}
      <group position={[0.35, top + 0.55, 0.15]} rotation={[0.12, -0.5, 0]}>
        <mesh>
          <boxGeometry args={[0.52, 0.3, 0.36]} />
          <meshStandardMaterial color={SLATE_LITE} roughness={0.55} metalness={0.3} />
          <Edges threshold={20} color={EDGE_LINE} />
        </mesh>
        {/* glowing visor strip */}
        <mesh position={[0, -0.02, 0.19]}>
          <boxGeometry args={[0.44, 0.12, 0.03]} />
          <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.9} roughness={0.3} />
        </mesh>
        {/* strap */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.04, -0.05]}>
          <torusGeometry args={[0.26, 0.028, 12, 28, Math.PI * 1.2]} />
          <meshStandardMaterial color={SLATE_MID} roughness={0.7} />
        </mesh>
      </group>
      {/* stand */}
      <mesh position={[0.35, top + 0.2, 0.15]}>
        <cylinderGeometry args={[0.05, 0.08, 0.5, 16]} />
        <meshStandardMaterial color={SLATE_DEEP} roughness={0.8} />
      </mesh>

      {/* two controllers */}
      {([
        [-0.95, 0.3],
        [-0.62, -0.55],
      ] as [number, number][]).map(([cx, cz], i) => (
        <group key={i} position={[cx, top + 0.22, cz]} rotation={[0.4, i * 0.6, 0.15]}>
          <mesh>
            <cylinderGeometry args={[0.045, 0.05, 0.3, 14]} />
            <meshStandardMaterial color={SLATE_MID} roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.08, 0.02, 12, 24]} />
            <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.6} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ---------- Middle: AR overlay ---------- */
function ArRig({ y }: { y: number }) {
  // target object with detection brackets
  const o: V3 = [0.7, y + 0.32, -0.25];
  const s = 0.26;
  const bracket = (corner: V3, sx: number, sy: number): V3[] => [
    [corner[0] + sx * 0.16, corner[1], corner[2]],
    corner,
    [corner[0], corner[1] + sy * 0.16, corner[2]],
  ];
  const fz = o[2] + s + 0.02;
  const corners: [V3, number, number][] = [
    [[o[0] - s, o[1] - s, fz], 1, 1],
    [[o[0] + s, o[1] - s, fz], -1, 1],
    [[o[0] - s, o[1] + s, fz], 1, -1],
    [[o[0] + s, o[1] + s, fz], -1, -1],
  ];

  return (
    <group>
      {/* device "screen" the AR is seen through */}
      <group position={[-0.95, y + 0.5, 0.35]} rotation={[0, 0.55, 0]}>
        <mesh>
          <boxGeometry args={[0.04, 0.92, 0.62]} />
          <meshStandardMaterial color={SLATE_DEEP} roughness={0.7} metalness={0.3} />
          <Edges threshold={20} color={EDGE_LINE} />
        </mesh>
        <mesh position={[0.03, 0, 0]}>
          <boxGeometry args={[0.01, 0.78, 0.5]} />
          <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.35} transparent opacity={0.5} roughness={0.3} />
        </mesh>
      </group>

      {/* tracked object */}
      <mesh position={o}>
        <boxGeometry args={[s * 2, s * 2, s * 2]} />
        <meshStandardMaterial color={SLATE_MID} roughness={0.8} transparent opacity={0.92} />
        <Edges threshold={20} color={EDGE_LINE} />
      </mesh>
      {corners.map((c, i) => (
        <Line key={i} points={bracket(c[0], c[1], c[2])} color={ACCENT} lineWidth={2} />
      ))}

      {/* annotation callouts: dot + leader line + label chip */}
      {([
        [[-0.2, y + 0.95, 0.4], [0.1, y + 0.45, 0.1]],
        [[1.35, y + 0.78, 0.2], [0.96, y + 0.5, -0.1]],
      ] as [V3, V3][]).map(([labelPos, anchor], i) => (
        <group key={i}>
          <Line points={[anchor, labelPos]} color={ACCENT_DIM} lineWidth={1} />
          <AccentNode position={anchor} size={0.04} />
          <mesh position={labelPos}>
            <boxGeometry args={[0.34, 0.12, 0.015]} />
            <meshStandardMaterial color={SLATE_LITE} emissive={ACCENT} emissiveIntensity={0.12} roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ---------- Top: digital twin / data ---------- */
function TwinRig({ y }: { y: number }) {
  const top = y + 0.08;
  // mini city block
  const buildings: [number, number, number, number][] = [
    [-1.3, -0.5, 0.5, 0.26],
    [-1.0, -0.7, 0.42, 0.4],
    [-1.05, -0.2, 0.34, 0.2],
    [-0.7, -0.55, 0.3, 0.5],
    [-0.72, -0.1, 0.4, 0.3],
    [-1.32, -0.05, 0.3, 0.34],
    [-0.45, -0.4, 0.46, 0.22],
  ];
  // data bars
  const bars = [0.18, 0.34, 0.26, 0.46, 0.3];
  // network
  const nodes: V3[] = [
    [0.5, top + 0.5, 0.5],
    [1.1, top + 0.35, -0.2],
    [0.2, top + 0.7, -0.5],
    [0.8, top + 0.55, 0.0],
  ];
  const edges: [number, number][] = [
    [0, 3],
    [3, 1],
    [3, 2],
  ];

  return (
    <group>
      {/* mini terrain grid */}
      {[-0.4, 0, 0.4].map((gx, i) => (
        <Line
          key={`gx${i}`}
          points={[
            [-1.5 + gx, top + 0.005, -0.9],
            [-1.5 + gx, top + 0.005, 0.9],
          ]}
          color={EDGE}
          lineWidth={0.8}
        />
      ))}

      {/* mini city */}
      {buildings.map(([bx, bz, h, w], i) => (
        <mesh key={i} position={[bx, top + h / 2, bz]}>
          <boxGeometry args={[w, h, w]} />
          <meshStandardMaterial color={i % 3 === 0 ? SLATE_LITE : SLATE_MID} roughness={0.8} />
          <Edges threshold={20} color={EDGE_LINE} />
        </mesh>
      ))}

      {/* data bars (readout) */}
      {bars.map((h, i) => (
        <group key={i} position={[0.55 + i * 0.16, top, 0.75]}>
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[0.1, h, 0.1]} />
            <meshStandardMaterial color={SLATE_LITE} roughness={0.7} />
          </mesh>
          <mesh position={[0, h + 0.02, 0]}>
            <boxGeometry args={[0.11, 0.025, 0.11]} />
            <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.7} roughness={0.3} />
          </mesh>
        </group>
      ))}

      {/* network with one aperture-bright node */}
      {edges.map(([a, c], i) => (
        <Line key={i} points={[nodes[a], nodes[c]]} color={ACCENT_DIM} lineWidth={1} />
      ))}
      {nodes.map((n, i) =>
        i === 0 ? <AccentNode key={i} position={n} size={0.1} /> : (
          <mesh key={i} position={n}>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshStandardMaterial color={SLATE_LITE} roughness={0.6} />
          </mesh>
        ),
      )}
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
  const [vr, ar, twin] = MAQUETTE_LAYERS;
  return (
    <group>
      <Slab y={vr.y} />
      <VrRig y={vr.y} />

      <Slab y={ar.y} color={SLATE_MID} opacity={0.42} />
      <ArRig y={ar.y} />

      <Slab y={twin.y} />
      <TwinRig y={twin.y} />

      {HOTSPOTS.map((h) => (
        <HotspotMarker key={h.slug} hotspot={h} onActivate={onActivate} />
      ))}
    </group>
  );
}
