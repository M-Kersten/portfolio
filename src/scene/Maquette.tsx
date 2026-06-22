import { Edges, Html, Line } from '@react-three/drei';
import { MAQUETTE_LAYERS, HOTSPOTS, type Hotspot } from './framing';
import { caseBySlug } from '../content';

// Abstract, art-directed hero (§4). Three slightly separated slabs in muted
// slate-blue with hairline contours; the bottom reads as a VR room, the middle
// as translucent AR annotation, the top as a data/network layer. Non-geographic
// on purpose — this is craft and brand, not the twin.

const SLATE_MID = '#6b8ca3';
const SLATE_DEEP = '#46627a';
const HAIRLINE = '#c9d3d6';
const ACCENT = '#0f8a8a';

const SLAB = { w: 4.4, h: 0.16, d: 3.2 };

function Slab({ y, translucent = false }: { y: number; translucent?: boolean }) {
  return (
    <mesh position={[0, y, 0]} castShadow receiveShadow>
      <boxGeometry args={[SLAB.w, SLAB.h, SLAB.d]} />
      <meshStandardMaterial
        color={translucent ? SLATE_MID : SLATE_DEEP}
        roughness={0.95}
        metalness={0}
        transparent={translucent}
        opacity={translucent ? 0.5 : 1}
      />
      <Edges threshold={15} color={HAIRLINE} />
    </mesh>
  );
}

/** Bottom: a stylised immersive room — an open corner standing on the slab. */
function VrRoom({ y }: { y: number }) {
  return (
    <group position={[0.2, y + 0.08, 0]}>
      <mesh position={[0, 0.45, -0.83]}>
        <boxGeometry args={[1.7, 0.9, 0.04]} />
        <meshStandardMaterial color={SLATE_MID} roughness={0.95} transparent opacity={0.85} />
        <Edges threshold={15} color={HAIRLINE} />
      </mesh>
      <mesh position={[-0.85, 0.45, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[1.7, 0.9, 0.04]} />
        <meshStandardMaterial color={SLATE_MID} roughness={0.95} transparent opacity={0.85} />
        <Edges threshold={15} color={HAIRLINE} />
      </mesh>
    </group>
  );
}

/** Middle: translucent AR annotation marks floating over the plane. */
function ArAnnotations({ y }: { y: number }) {
  return (
    <group position={[0, y, 0]}>
      {[
        [0.9, 0.55, -0.4],
        [-0.7, 0.4, 0.5],
      ].map((p, i) => (
        <group key={i} position={p as [number, number, number]}>
          <mesh>
            <torusGeometry args={[0.16, 0.018, 12, 32]} />
            <meshStandardMaterial color={ACCENT} roughness={0.6} emissive={ACCENT} emissiveIntensity={0.25} />
          </mesh>
          <Line points={[[0, 0, 0], [0, -(p[1] as number) + 0.1, 0]]} color={HAIRLINE} lineWidth={1} />
        </group>
      ))}
    </group>
  );
}

/** Top: a data network — nodes and edges with one accent node. */
function TwinNetwork({ y }: { y: number }) {
  const nodes: [number, number, number][] = [
    [1.1, 0.32, 0.45],
    [0.2, 0.5, -0.55],
    [-0.9, 0.36, 0.3],
    [-1.4, 0.28, -0.6],
    [0.7, 0.42, -0.1],
    [-0.2, 0.6, 0.7],
  ];
  const edges: [number, number][] = [
    [0, 4], [4, 1], [1, 5], [5, 2], [2, 3], [4, 2],
  ];
  return (
    <group position={[0, y, 0]}>
      {edges.map(([a, b], i) => (
        <Line key={i} points={[nodes[a], nodes[b]]} color={HAIRLINE} lineWidth={1} />
      ))}
      {nodes.map((n, i) => (
        <mesh key={i} position={n}>
          <sphereGeometry args={[i === 0 ? 0.1 : 0.07, 16, 16]} />
          <meshStandardMaterial
            color={i === 0 ? ACCENT : SLATE_DEEP}
            emissive={i === 0 ? ACCENT : '#000000'}
            emissiveIntensity={i === 0 ? 0.5 : 0}
            roughness={0.6}
          />
        </mesh>
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
  const [vr, ar, twin] = MAQUETTE_LAYERS;
  return (
    <group>
      <Slab y={vr.y} />
      <VrRoom y={vr.y} />

      <Slab y={ar.y} translucent />
      <ArAnnotations y={ar.y} />

      <Slab y={twin.y} />
      <TwinNetwork y={twin.y} />

      {HOTSPOTS.map((h) => (
        <HotspotMarker key={h.slug} hotspot={h} onActivate={onActivate} />
      ))}
    </group>
  );
}
