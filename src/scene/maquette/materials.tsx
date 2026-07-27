// The maquette's material language: frosted holographic glass (with a fresnel
// rim + screen-space dot grid injected into the shader), its "comes alive once
// visited" variant, flat emissive accent boxes, and the rounded soft box.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, RoundedBox, type EdgesRef } from '@react-three/drei';
import { Color, MeshStandardMaterial, type Material } from 'three';
import { useAccent, useActive, GLASS, NEUTRAL, Line, roundedRectPts, type V3 } from './shared';
import { GHOST_FILL } from './life';

/* ---------- materials ---------- */

// A soft white-blue fresnel rim so the frosted-glass forms catch light along
// their silhouettes (more premium, less flat plastic). Injected into the
// standard material before fog/tonemapping so the rim hazes + tonemaps too.
const RIM = new Color('#b9d2e0');
// How much of the key light's specular highlight survives on glass. The sun sits
// front-right (Stage: dir1 at [6, 11, 4]) — the same side the node cameras look
// from — so at full strength it lays a hard white blob across whatever you just
// zoomed into. Moving the sun does fix the glare, but it also flattens every
// vertical face in the maquette, so damp the highlight instead: this touches
// only the direct specular lobe, leaving the diffuse shading that gives the
// forms their volume, and the soft environment sheen, exactly as they were.
const SPEC = 0.15;
export function glassRim(shader: any) {
  shader.uniforms.uRim = { value: RIM };
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', 'uniform vec3 uRim;\nvoid main() {')
    .replace('#include <aomap_fragment>', `reflectedLight.directSpecular *= ${SPEC};\n#include <aomap_fragment>`)
    .replace(
      '#include <opaque_fragment>',
      [
        '#include <opaque_fragment>',
        // Fresnel rim — tight and bright so the silhouette reads as a crisp
        // holographic edge while the interior stays quiet (the exponent keeps
        // the glow pinned to the outline; the alpha lift firms the edge up).
        'float _rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.8);',
        'gl_FragColor.rgb += uRim * _rim * 0.68;',
        'gl_FragColor.a = clamp(gl_FragColor.a + _rim * 0.42, 0.0, 1.0);',
        // A fine screen-space dot-grid printed across every glass surface, so the
        // maquette carries the same dithered / halftone texture as the rest of the
        // site. Screen-locked (not surface-mapped), so overlapping panes stay
        // coherent; kept gentle so the delicate glass still reads.
        'float _dg = sin(gl_FragCoord.x * 1.7) * sin(gl_FragCoord.y * 1.7);',
        'float _dot = smoothstep(-0.2, 0.6, _dg);',
        'gl_FragColor.rgb *= 0.85 + 0.3 * _dot;',
        'gl_FragColor.a = clamp(gl_FragColor.a * (0.9 + 0.16 * _dot), 0.0, 1.0);',
      ].join('\n'),
    );
}

export function GlassMat({ color = GLASS, opacity = 0.2 }: { color?: string; opacity?: number }) {
  return (
    <meshStandardMaterial
      color={color}
      transparent
      opacity={opacity}
      roughness={0.34}
      metalness={0}
      emissive="#0c2a30"
      emissiveIntensity={0.14}
      depthWrite={false}
      onBeforeCompile={glassRim}
    />
  );
}

/** Like GlassMat, but the body resolves to a near-solid, glossier material once
 *  its hotspot has been visited — so visited objects read as "real". Hotspot
 *  bodies rest as a grey ghost (the life mechanic); companion furniture passes
 *  `ghost={false}` to rest as its plain authored glass and only change material
 *  when its hotspot is engaged. `solid` caps how opaque it becomes. */
export function LiveGlassMat({ slug, color = GLASS, opacity = 0.2, ghost = true, solid = 0.94 }: { slug: string; color?: string; opacity?: number; ghost?: boolean; solid?: number }) {
  const { selected, visited } = useActive(slug);
  const mat = useRef<MeshStandardMaterial>(null);
  const k = useRef(0);
  const baseC = useMemo(() => new Color(color), [color]);
  useFrame(() => {
    const m = mat.current;
    if (!m) return;
    k.current += ((selected || visited ? 1 : 0) - k.current) * 0.06;
    m.color.copy(GHOST_FILL).lerp(baseC, ghost ? 0.3 + 0.7 * k.current : 1);
    const rest = ghost ? opacity * 0.3 : opacity;
    m.opacity = rest + (solid - rest) * k.current;
    // Waking an object still makes it glossier, but gently — the shine now comes
    // off the environment rather than the key light (see SPEC above), so the
    // floor only needs to stop the lobe tightening back into a hotspot.
    m.roughness = 0.34 - 0.07 * k.current;
    m.metalness = 0.05 * k.current;
    m.depthWrite = k.current > 0.5;
  });
  return (
    <meshStandardMaterial
      ref={mat}
      userData={{ lifeSkip: true }}
      color={color}
      transparent
      opacity={opacity}
      roughness={0.34}
      metalness={0}
      emissive="#0c2a30"
      emissiveIntensity={0.14}
      depthWrite={false}
      onBeforeCompile={glassRim}
    />
  );
}

/** Flat highlight box. Defaults to the layer accent, but decorative (non-hotspot)
 *  details pass color={NEUTRAL} so the layer colour stays on the interactables. */
/** Edge outlines that RETIRE as the object wakes.
 *
 *  The edges are the ghost's wireframe, so LifeGroup deliberately brightens them
 *  on the way to alive (opacity * (0.5 + 0.5 * life)). For an object whose whole
 *  point is to end up looking solid, that's backwards — the outlines survive the
 *  fill going opaque and it still reads as a wireframe. This owns the material
 *  instead (flagging it lifeSkip so LifeGroup lets go) and fades it to nothing. */
export function LiveEdges({ slug, threshold = 20, color = NEUTRAL }: { slug: string; threshold?: number; color?: string }) {
  const { selected, visited } = useActive(slug);
  const ref = useRef<EdgesRef>(null);
  const k = useRef(0);
  useFrame(() => {
    const mat = ref.current?.material as Material | undefined;
    if (!mat) return;
    if (!mat.userData.lifeSkip) {
      mat.userData.lifeSkip = true;
      mat.transparent = true;
      mat.needsUpdate = true;
    }
    k.current += ((selected || visited ? 1 : 0) - k.current) * 0.06;
    mat.opacity = 1 - k.current;
  });
  return <Edges ref={ref} threshold={threshold} color={color} transparent />;
}

export function Accent({ position, args, intensity = 0.4, rotation, color }: { position: V3; args: V3; intensity?: number; rotation?: V3; color?: string }) {
  const { accent } = useAccent();
  const c = color ?? accent;
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={c} emissive={c} emissiveIntensity={intensity} roughness={0.4} />
    </mesh>
  );
}

export function SoftBox({ position, args, radius = 0.03, opacity = 0.2, outline = false, rotation, color, liveSlug, liveGhost = true }: { position: V3; args: V3; radius?: number; opacity?: number; outline?: boolean; rotation?: V3; color?: string; liveSlug?: string; liveGhost?: boolean }) {
  // Clamp so the corner radius never exceeds half the smallest side.
  const r = Math.min(radius, Math.min(args[0], args[1], args[2]) / 2 - 0.002);
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={args} radius={r} smoothness={3}>
        {liveSlug ? <LiveGlassMat slug={liveSlug} ghost={liveGhost} opacity={opacity} color={color} /> : <GlassMat opacity={opacity} color={color} />}
      </RoundedBox>
      {outline && (
        <Line points={roundedRectPts(args[0], args[2], radius * 1.6)} position={[0, args[1] / 2, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.45} />
      )}
    </group>
  );
}

/** Flat floor of dots that fade into the background toward the rim. Neutral —
 *  the layer colour is reserved for the project dots + a few details. */
