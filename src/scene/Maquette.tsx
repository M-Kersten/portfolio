import { useMemo, useRef, type CSSProperties } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import { AdditiveBlending, Color, type Mesh } from 'three';
import { MAQUETTE_LAYERS, HOTSPOTS, LAYER_Y, LAYER_SCALE, type Hotspot, type LayerId } from './framing';
import { buildGridSegments, buildPointCloud, contourRing, TERRAIN_R } from './terrain';
import { useSceneSelector } from './store';
import { useReducedMotion } from '../lib/useReducedMotion';
import { caseBySlug } from '../content';

// Spatial-computing aesthetic: three stacked topographic "fields" instead of
// literal buildings. Each layer is a glowing wireframe landscape (a fine
// contour grid), undulating elevation contours, a gradient point cloud and a
// couple of tilted orbital paths — one accent colour per layer. Project
// hotspots are anchored to landmarks on the terrain (see framing.ts).

const CYAN = '#27e8f2';
const LIME = '#a9f75c';
const CORAL = '#ff9068';
const LAVENDER = '#a89eff';
const PINK = '#ff74b0';

interface FieldPalette {
  net: string;
  contour: string;
  cloudA: string;
  cloudB: string;
  orbit: string;
}
const FIELD: Record<LayerId, FieldPalette> = {
  city: { net: CYAN, contour: LAVENDER, cloudA: CYAN, cloudB: LAVENDER, orbit: LAVENDER },
  room: { net: CORAL, contour: PINK, cloudA: CORAL, cloudB: PINK, orbit: CYAN },
  chip: { net: LIME, contour: CYAN, cloudA: LIME, cloudB: CYAN, orbit: CYAN },
};
const HOT: Record<LayerId, string> = { city: CYAN, room: CORAL, chip: LIME };

/** The glowing wireframe landscape — a fine net displaced by the height field. */
function TerrainNet({ layer, color }: { layer: LayerId; color: string }) {
  const positions = useMemo(() => buildGridSegments(layer), [layer]);
  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={0.42}
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </lineSegments>
  );
}

/** Concentric elevation contours that hug the terrain (the topographic read). */
function ContourRings({ layer, color }: { layer: LayerId; color: string }) {
  const rings = useMemo(
    () => [0.32, 0.62, 0.95, 1.3, 1.68].map((r) => contourRing(layer, r)),
    [layer],
  );
  return (
    <group>
      {rings.map((pts, i) => (
        <Line key={i} points={pts} color={color} lineWidth={1.1} transparent opacity={0.5} />
      ))}
    </group>
  );
}

/** The disc boundary — a clean rim around the field. */
function RimRing({ layer, color }: { layer: LayerId; color: string }) {
  const pts = useMemo(() => contourRing(layer, TERRAIN_R - 0.02, 120), [layer]);
  return <Line points={pts} color={color} lineWidth={1.2} transparent opacity={0.32} />;
}

/** Gradient point cloud floating above the surface (vertex-coloured by height). */
function PointCloud({ layer, colorA, colorB }: { layer: LayerId; colorA: string; colorB: string }) {
  const { positions, colors } = useMemo(() => {
    const { positions, t } = buildPointCloud(layer);
    const ca = new Color(colorA);
    const cb = new Color(colorB);
    const tmp = new Color();
    const colors = new Float32Array(positions.length);
    for (let k = 0; k < t.length; k++) {
      tmp.copy(ca).lerp(cb, t[k]);
      colors[k * 3] = tmp.r;
      colors[k * 3 + 1] = tmp.g;
      colors[k * 3 + 2] = tmp.b;
    }
    return { positions, colors };
  }, [layer, colorA, colorB]);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.034}
        vertexColors
        transparent
        opacity={0.92}
        sizeAttenuation
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

/** A tilted, dashed orbital path with a small glowing node travelling along it. */
function OrbitPath({
  color,
  rx,
  rz,
  y,
  tilt,
  speed,
  phase = 0,
}: {
  color: string;
  rx: number;
  rz: number;
  y: number;
  tilt: number;
  speed: number;
  phase?: number;
}) {
  const node = useRef<Mesh>(null);
  const reduced = useReducedMotion();
  const pts = useMemo(() => {
    const p: [number, number, number][] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      p.push([Math.cos(a) * rx, 0, Math.sin(a) * rz]);
    }
    return p;
  }, [rx, rz]);
  useFrame((state) => {
    if (!node.current) return;
    const a = phase + (reduced ? 0.9 : state.clock.elapsedTime * speed);
    node.current.position.set(Math.cos(a) * rx, 0, Math.sin(a) * rz);
  });
  return (
    <group position={[0, y, 0]} rotation={[tilt, 0, 0]}>
      <Line points={pts} color={color} lineWidth={1} transparent opacity={0.32} dashed dashSize={0.14} gapSize={0.1} />
      <mesh ref={node}>
        <sphereGeometry args={[0.026, 12, 12]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Everything that makes up one topographic layer. */
function LayerField({ layer }: { layer: LayerId }) {
  const f = FIELD[layer];
  return (
    <group>
      <TerrainNet layer={layer} color={f.net} />
      <ContourRings layer={layer} color={f.contour} />
      <RimRing layer={layer} color={f.net} />
      <PointCloud layer={layer} colorA={f.cloudA} colorB={f.cloudB} />
      <OrbitPath color={f.orbit} rx={1.95} rz={1.55} y={0.62} tilt={0.5} speed={0.42} />
      <OrbitPath color={f.contour} rx={1.5} rz={1.95} y={0.9} tilt={-0.65} speed={-0.3} phase={1.6} />
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

export interface MaquetteProps {
  onActivate: (hotspot: Hotspot) => void;
}

export function Maquette({ onActivate }: MaquetteProps) {
  const journeyStep = useSceneSelector((s) => s.journeyStep);
  const activeLayer = (['city', 'room', 'chip'] as LayerId[])[journeyStep] ?? 'city';

  return (
    <group>
      {MAQUETTE_LAYERS.map((layer) => (
        <group key={layer.id} position={[0, LAYER_Y[layer.id], 0]} scale={LAYER_SCALE[layer.id]}>
          <LayerField layer={layer.id} />
          {activeLayer === layer.id &&
            HOTSPOTS.filter((h) => h.layer === layer.id).map((h) => (
              <HotspotMarker key={h.slug} hotspot={h} color={HOT[layer.id]} onActivate={onActivate} />
            ))}
        </group>
      ))}
    </group>
  );
}
