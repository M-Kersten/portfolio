// The floating crosshair markers that invite a click on each project. The DOM
// part (crosshair, brackets, label) lives in a drei <Html>; the leader line and
// anchor ring are real scene geometry so they sit in the fog like everything
// else. Styling lives in src/ui (search ".hotspot").
import { useRef, type CSSProperties, type ElementRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { type MeshBasicMaterial } from 'three';
import { sceneStore } from '../store';
import { caseBySlug } from '../../content';
import { Scramble } from '../../components/shell/Scramble';
import { type Hotspot } from '../framing';
import { PRESS, useReducedMotion } from '../../lib/media';
import { Line, useActive, type V3 } from './shared';

// Touch has no hover and no click, so the cue says what the finger does.
const CUE_TEXT = `${PRESS} to light it`;
// Closing an exhibit, the markers come back once the camera has mostly pulled
// out, not while it's still flying (the crosshairs wait the same in
// hotspots.css); they go at once.
const SHOW_DELAY = 0.4;

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
  const anchor: V3 = hotspot.anchor;
  // the leader line and the ring fade with the crosshair rather than popping
  const reduced = useReducedMotion();
  const lineRef = useRef<ElementRef<typeof Line>>(null);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const shown = useRef(hidden ? 0 : 1);
  const since = useRef(SHOW_DELAY);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    since.current = hidden ? 0 : since.current + dt;
    const want = !hidden && since.current >= SHOW_DELAY ? 1 : 0;
    shown.current = reduced ? (hidden ? 0 : 1) : shown.current + (want - shown.current) * (1 - Math.exp(-(want ? 7 : 14) * dt));
    const line = lineRef.current?.material as { opacity: number } | undefined;
    if (line) line.opacity = shown.current * (alive ? 0.55 : 0.4);
    if (ringMat.current) ringMat.current.opacity = shown.current * (alive ? 0.65 : 0.48);
  });
  return (
    <group>
      {/* leader line from the object up to the floating crosshair */}
      <Line ref={lineRef} points={[anchor, hotspot.position]} color={color} lineWidth={1} transparent opacity={0} />
      {/* a ring marking the exact spot on the object */}
      <mesh position={anchor} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.016, 0.027, 20]} />
        <meshBasicMaterial ref={ringMat} color={color} transparent opacity={0} side={2} toneMapped={false} />
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
            aria-label={`Open ${label}`}
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
                the button already says which exhibit it opens. */}
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

