// The floating crosshair markers that invite a click on each project. The DOM
// part (crosshair, brackets, label) lives in a drei <Html>; the leader line and
// anchor ring are real scene geometry so they sit in the fog like everything
// else. Styling lives in src/ui (search ".hotspot").
import { type CSSProperties } from 'react';
import { Html } from '@react-three/drei';
import { sceneStore } from '../store';
import { caseBySlug } from '../../content';
import { type Hotspot } from '../framing';
import { Line, useActive, type V3 } from './shared';

export function HotspotMarker({ hotspot, color, onActivate, hidden }: { hotspot: Hotspot; color: string; onActivate: (h: Hotspot) => void; hidden: boolean }) {
  const study = caseBySlug(hotspot.slug);
  const label = study?.title ?? hotspot.slug;
  const { selected, visited } = useActive(hotspot.slug);
  // The marker is the invitation to click — it always carries the layer
  // accent so it stands out against the ghost world, growing a touch
  // brighter once the object it points to has been brought alive. While ANY
  // node is open the markers all vanish, so the HUD gets a clean stage.
  const alive = selected || visited;
  const anchor: V3 = hotspot.anchor ?? [hotspot.position[0], 0, hotspot.position[2]];
  return (
    <group>
      {/* leader line from the object up to the floating crosshair */}
      <Line points={[anchor, hotspot.position]} color={color} lineWidth={1} transparent opacity={hidden ? 0 : alive ? 0.55 : 0.4} />
      {/* a ring marking the exact spot on the object */}
      <mesh position={anchor} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.016, 0.027, 20]} />
        <meshBasicMaterial color={color} transparent opacity={hidden ? 0 : alive ? 0.65 : 0.48} side={2} toneMapped={false} />
      </mesh>
      <Html position={hotspot.position} center zIndexRange={[20, 0]} className="hotspot-wrap">
        <span
          className="hotspot"
          data-open={selected || undefined}
          data-alive={alive || undefined}
          data-hidden={hidden || undefined}
          style={{ '--hot': color } as CSSProperties}
        >
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
            {/* crosshair (always) + scanner brackets that lock on hover/open */}
            <span className="hotspot__mark" aria-hidden="true">
              <b />
              <i />
              <i />
              <i />
              <i />
            </span>
            <span className="hotspot__label">
              <span className="hotspot__label-fill">{label}</span>
            </span>
          </button>
        </span>
      </Html>
    </group>
  );
}

