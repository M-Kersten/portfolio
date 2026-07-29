// The maquette's material language: frosted holographic glass (with a fresnel
// rim + screen-space dot grid injected into the shader), its "comes alive once
// visited" variant, flat emissive accent boxes, and the rounded soft box.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, RoundedBox, type EdgesRef } from '@react-three/drei';
import { Color, type Material, type MeshPhysicalMaterial } from 'three';
import { useAccent, useActive, GLASS, NEUTRAL, Line, roundedRectPts, type V3 } from './shared';
import { GHOST_FILL } from './life';
import { surfaceMaps } from './surface';

/* ---------- materials ---------- */

// A soft white-blue fresnel rim so the frosted-glass forms catch light along
// their silhouettes (more premium, less flat plastic). Injected into the
// standard material before fog/tonemapping so the rim hazes + tonemaps too.
const RIM = new Color('#b9d2e0');
// How much of the key light's specular highlight survives. The sun sits
// front-right (Stage: dir1 at [6, 11, 4]) — the same side the node cameras look
// from — so at full strength it lays a hard white blob across whatever you just
// zoomed into. Moving the sun does fix the glare, but it also flattens every
// vertical face in the maquette, so damp the highlight instead: this touches
// only the direct specular lobe, leaving the diffuse shading that gives the
// forms their volume, and the soft environment sheen, exactly as they were.
//
// That's the right call for GLASS. It is the wrong call for a woken object: a
// highlight is most of what tells you a surface is smooth and solid, so the
// damping is a uniform now and LiveGlassMat winds it back up as an object
// materialises (see SPEC_LIVE).
const SPEC = 0.15;
// Not 1.0. The damping exists because the key light sits on the same side the
// node cameras look from, so a fully restored lobe lays a blob across every
// large flat face (the coffee table, the PCB). This is the most highlight a
// small curved object can take before the big flat ones blow out.
const SPEC_LIVE = 0.5;

/** The uniforms the two surface states are driven through. Held per material so
 *  each object can be at its own point between glass and solid. */
export type SurfaceUniforms = {
  uSpec: { value: number }; // direct specular survival — 0.15 glass … 0.85 solid
  uRimK: { value: number }; // fresnel rim strength — 1 glass … ~0.2 solid
  uGrid: { value: number }; // screen-space dot grid — 1 glass … 0 solid
  uGrain: { value: number }; // albedo grain from the surface map — 0 glass … 1 solid
};

/** Builds the onBeforeCompile hook. `onReady` hands the uniforms back so a
 *  material can animate them; static glass simply ignores it.
 *
 *  Note the hook is intentionally one stable function body — three keys the
 *  program cache on `onBeforeCompile.toString()`, so every material built here
 *  shares one compiled program instead of forcing a recompile each.  */
export function surfaceShader(onReady?: (u: SurfaceUniforms) => void) {
  return (shader: any) => {
    shader.uniforms.uRim = { value: RIM };
    shader.uniforms.uSpec = { value: SPEC };
    shader.uniforms.uRimK = { value: 1 };
    shader.uniforms.uGrid = { value: 1 };
    shader.uniforms.uGrain = { value: 0 };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform vec3 uRim;\nuniform float uSpec;\nuniform float uRimK;\nuniform float uGrid;\nuniform float uGrain;\nvoid main() {',
      )
      .replace('#include <aomap_fragment>', 'reflectedLight.directSpecular *= uSpec;\n#include <aomap_fragment>')
      .replace(
        '#include <opaque_fragment>',
        [
          '#include <opaque_fragment>',
          // Fresnel rim — tight and bright so the silhouette reads as a crisp
          // holographic edge while the interior stays quiet (the exponent keeps
          // the glow pinned to the outline; the alpha lift firms the edge up).
          // It retires to a whisper as the object solidifies: a real object has a
          // little bounce along its edge, not a glowing outline.
          'float _rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.8);',
          'gl_FragColor.rgb += uRim * _rim * 0.68 * uRimK;',
          'gl_FragColor.a = clamp(gl_FragColor.a + _rim * 0.42 * uRimK, 0.0, 1.0);',
          // A fine screen-space dot-grid printed across every glass surface, so the
          // maquette carries the same dithered / halftone texture as the rest of the
          // site. Screen-locked (not surface-mapped), so overlapping panes stay
          // coherent; kept gentle so the delicate glass still reads.
          //
          // It has to go as an object materialises. Screen-locked texture on a
          // solid form reads as a screen door in front of the object rather than
          // anything belonging to it — the grain in the surface maps takes over.
          'float _dg = sin(gl_FragCoord.x * 1.7) * sin(gl_FragCoord.y * 1.7);',
          'float _dot = smoothstep(-0.2, 0.6, _dg);',
          'gl_FragColor.rgb *= mix(1.0, 0.85 + 0.3 * _dot, uGrid);',
          'gl_FragColor.a = clamp(gl_FragColor.a * mix(1.0, 0.9 + 0.16 * _dot, uGrid), 0.0, 1.0);',
          // Moulded-plastic tonal variation, keyed off the same map that roughens
          // the surface. Barely there — it stops large flat panels reading as a
          // single dead fill without ever looking dirty.
          '#ifdef USE_ROUGHNESSMAP',
          'float _g = texture2D( roughnessMap, vRoughnessMapUv ).g - 0.9;',
          'gl_FragColor.rgb *= 1.0 + _g * 0.5 * uGrain;',
          '#endif',
        ].join('\n'),
      );
    onReady?.(shader.uniforms as SurfaceUniforms);
  };
}

/** Back-compat name for the static glass hook. */
export const glassRim = surfaceShader();

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
export function LiveGlassMat({ slug, color = GLASS, opacity = 0.2, ghost = true, solid = 1 }: { slug: string; color?: string; opacity?: number; ghost?: boolean; solid?: number }) {
  const { selected, visited } = useActive(slug);
  const mat = useRef<MeshPhysicalMaterial>(null);
  const uni = useRef<SurfaceUniforms | null>(null);
  const k = useRef(0);
  const baseC = useMemo(() => new Color(color), [color]);
  const maps = useMemo(() => surfaceMaps(), []);
  // One stable hook shared by every instance (see surfaceShader) — memoised so
  // React never hands the material a new function on a re-render either.
  const compile = useMemo(() => surfaceShader((u) => (uni.current = u)), []);
  useFrame(() => {
    const m = mat.current;
    if (!m) return;
    k.current += ((selected || visited ? 1 : 0) - k.current) * 0.06;
    const t = k.current;
    m.color.copy(GHOST_FILL).lerp(baseC, ghost ? 0.3 + 0.7 * t : 1);
    const rest = ghost ? opacity * 0.3 : opacity;
    m.opacity = rest + (solid - rest) * t;

    // --- glass → moulded plastic ---------------------------------------
    // The body gets ROUGHER on the way to solid, not glossier, and a thin
    // clearcoat goes over the top. That's how real moulded plastic is built —
    // a slightly diffuse body under a glossy skin — and it's why the old
    // "wake up = shinier" version still read as polished glass: one uniform
    // gloss over the whole form gives a highlight that slides instead of
    // sitting on the surface.
    m.roughness = 0.34 + 0.12 * t;
    m.metalness = 0.03 * t;
    m.clearcoat = 0.02 + 0.58 * t;
    // Deliberately not a mirror finish: a tight clearcoat on a large flat panel
    // reflects the environment softbox as a hard streak. Blurring it keeps the
    // sheen as a broad gradient that still travels as you orbit.
    m.clearcoatRoughness = 0.38;
    // The emissive fill is what keeps the ghost readable in the dark. A solid
    // object must lose it completely or its shadows never close up, and shadow
    // is most of what makes a form feel like it has weight.
    m.emissiveIntensity = 0.14 * (1 - t);
    m.envMapIntensity = 1 + 0.5 * t;
    m.normalScale.set(0.18 * t, 0.18 * t);
    m.depthWrite = t > 0.5;

    const u = uni.current;
    if (u) {
      u.uSpec.value = SPEC + (SPEC_LIVE - SPEC) * t; // let the highlight back in
      u.uRimK.value = 1 - 0.78 * t; // holographic rim retires
      u.uGrid.value = 1 - t; // screen-door grid retires
      u.uGrain.value = t; // moulded tonal variation arrives
    }
  });
  return (
    <meshPhysicalMaterial
      ref={mat}
      userData={{ lifeSkip: true }}
      color={color}
      transparent
      opacity={opacity}
      roughness={0.34}
      metalness={0}
      // Non-zero at rest on purpose: three only defines USE_CLEARCOAT when
      // clearcoat > 0, so starting at exactly 0 would recompile the program the
      // first time an object woke — a visible hitch on the very frame you want
      // to look expensive.
      clearcoat={0.02}
      clearcoatRoughness={0.38}
      roughnessMap={maps?.roughness ?? null}
      normalMap={maps?.normal ?? null}
      emissive="#0c2a30"
      emissiveIntensity={0.14}
      depthWrite={false}
      onBeforeCompile={compile}
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
export function LiveEdges({ slug, threshold = 20, color = NEUTRAL, rest = 1 }: { slug: string; threshold?: number; color?: string; rest?: number }) {
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
    // `rest` caps the idle brightness before it retires — most outlines trace a
    // bulky form (a tower, a cap) where full brightness reads as a normal
    // wireframe. A long thin plane on its own in open air (the sails) has
    // nothing bulky to belong to, so its outline needs a dimmer idle cap or it
    // reads as a bold line drawn for its own sake.
    mat.opacity = rest * (1 - k.current);
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
