// The floating crosshair markers that invite a click on each project. The DOM
// part (crosshair, brackets, label) lives in a drei <Html>; the leader line and
// anchor ring are real scene geometry so they sit in the fog like everything
// else. Styling lives in src/ui (search ".hotspot").
import { type CSSProperties } from 'react';
import { Html } from '@react-three/drei';
import { sceneStore } from '../store';
import { caseBySlug } from '../../content';
import { Scramble } from '../../components/Scramble';
import { type Hotspot } from '../framing';
import { Line, useActive, type V3 } from './shared';

// Touch has no hover and no click, so the cue says what the finger does.
const CUE_TEXT =
  typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches ? 'tap to wake' : 'click to wake';

export function HotspotMarker({
  hotspot,
  color,
  onActivate,
  hidden,
  cue,
  phase = 0,
}: {
  hotspot: Hotspot;
  color: string;
  onActivate: (h: Hotspot) => void;
  hidden: boolean;
  /** the first-visit cue: 'lead' asks to be clicked, 'hold' keeps still for it */
  cue?: 'lead' | 'hold';
  /** 0–1: where in the shared pulse this marker pings, so a layer's markers
   *  take turns rather than flashing in unison */
  phase?: number;
}) {
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
          data-cue={cue}
          style={{ '--hot': color, '--phase': phase } as CSSProperties}
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
            {/* The first-visit cue's tag, decoding in under the name. Decoration:
                the button already says what it does ("… — open node"). */}
            {cue === 'lead' && (
              <span className="hotspot__cue" aria-hidden="true">
                <Scramble text={CUE_TEXT} delay={240} />
              </span>
            )}
          </button>
        </span>
      </Html>
    </group>
  );
}

