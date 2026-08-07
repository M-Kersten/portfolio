// The maquette's material language: frosted holographic glass (with a fresnel
// rim + screen-space dot grid injected into the shader), its "comes alive once
// visited" variant, and the rounded soft box.
import { useContext, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, RoundedBox, type EdgesRef } from '@react-three/drei';
import { Color, FrontSide, MeshStandardMaterial, type Material, type Side } from 'three';
import { useActive, GROUND, NEUTRAL, SURFACE, SURFACE_AWAKE, SURFACE_GLOW, Line, roundedRectPts, type Tint, type V3 } from './shared';
import { GHOST_FILL } from './life';
import { PresenceCtx } from './presence';
import { useFxConfig } from '../fxTweak';

/* ---------- materials ---------- */

// A soft white-blue fresnel rim so the frosted-glass forms catch light along
// their silhouettes (more premium, less flat plastic). Injected into the
// standard material before fog/tonemapping so the rim hazes + tonemaps too.
// Exported because every compiled glass shader holds this same Color as its
// uniform, so Stage's SelectDim can restyle every silhouette at once by
// mutating it (the live value is fxTweak's rimColor; seed kept in sync).
export const RIM = new Color('#dcecfc');
// How much of the key light's specular highlight survives on glass. The sun sits
// front-right (Stage: dir1 at [6, 11, 4]) — the same side the node cameras look
// from — so at full strength it lays a hard white blob across whatever you just
// zoomed into. Moving the sun does fix the glare, but it also flattens every
// vertical face in the maquette, so damp the highlight instead: this touches
// only the direct specular lobe, leaving the diffuse shading that gives the
// forms their volume, and the soft environment sheen, exactly as they were.
const SPEC = 0.15;
// The screen-space halftone's two knobs, shared across every compiled glass
// shader the same way RIM is: each is the actual `{ value }` uniform object
// three.js reads every frame, so Stage's SelectDim can retune the whole
// maquette's dot grid at once by mutating `.value` in place (see fxTweak's
// dotFreq/dotStrength). Seeds match FX_DEFAULTS.
export const DOT_TUNE = {
  freq: { value: 1.7 }, // higher = smaller, denser cells
  strength: { value: 0.3 }, // 0 = pattern invisible; scales both the rgb darkening and the alpha lift below, keeping their original ratio (~0.53)
};
export function glassRim(shader: any) {
  shader.uniforms.uRim = { value: RIM };
  shader.uniforms.uDotFreq = DOT_TUNE.freq;
  shader.uniforms.uDotStrength = DOT_TUNE.strength;
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', 'uniform vec3 uRim;\nuniform float uDotFreq;\nuniform float uDotStrength;\nvoid main() {')
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
        // A fine screen-space pattern printed across every glass surface, so the
        // maquette carries the same dithered / halftone texture as the rest of the
        // site. Screen-locked (not surface-mapped), so overlapping panes stay
        // coherent; kept gentle so the delicate glass still reads.
        'float _dg = sin(gl_FragCoord.x * uDotFreq) * sin(gl_FragCoord.y * uDotFreq);',
        'float _pat = smoothstep(-0.2, 0.6, _dg);',
        'gl_FragColor.rgb *= 0.85 + uDotStrength * _pat;',
        'gl_FragColor.a = clamp(gl_FragColor.a * (0.9 + uDotStrength * 0.533 * _pat), 0.0, 1.0);',
      ].join('\n'),
    );
}

/** The substance, standing still.
 *
 *  There used to be a real difference here — GlassMat was its own material with
 *  its own defaults, so a prop and a hotspot's companion piece were literally
 *  different stock sitting next to each other. Now it's the same declaration as
 *  LiveGlassMat's resting state, which is the whole point of the system: a
 *  study model is cut from one sheet, and the only reason a part looks different
 *  is that it's a different VALUE of that sheet (see SURFACE) or that something
 *  has woken it up. */
export function GlassMat({ tint = 'glass', color, opacity }: { tint?: Tint; color?: string; opacity?: number }) {
  const cut = SURFACE[tint];
  return (
    <meshStandardMaterial
      color={color ?? cut.color}
      transparent
      opacity={opacity ?? cut.rest}
      roughness={0.34}
      metalness={0}
      emissive={SURFACE_GLOW}
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
 *  when its hotspot is engaged. `solid` caps how opaque it becomes.
 *
 *  `wake` overrides where the material sits, for objects whose coming-alive isn't
 *  simply "is my hotspot open" — the skyline solidifies on the city's staggered
 *  window ramp, outward from the tower, so each building hands its own level in.
 *  A ref because it changes every frame and must not re-render. */
export function LiveGlassMat({ slug, tint = 'glass', color, opacity, ghost = true, solid = SURFACE_AWAKE, wake }: { slug: string; tint?: Tint; color?: string; opacity?: number; ghost?: boolean; solid?: number; wake?: { current: number } }) {
  const cut = SURFACE[tint];
  const fill = color ?? cut.color;
  const restOpacity = opacity ?? cut.rest;
  const { selected, visited } = useActive(slug);
  const mat = useRef<MeshStandardMaterial>(null);
  const k = useRef(0);
  const baseC = useMemo(() => new Color(fill), [fill]);
  const presence = useContext(PresenceCtx); // a layer that isn't the subject recedes
  const cfg = useFxConfig();
  useFrame(() => {
    const m = mat.current;
    if (!m) return;
    // `wake` is already eased by whoever owns it, so take it as-is rather than
    // easing an ease (that only adds lag to a ramp that's deliberately timed).
    if (wake) k.current = wake.current;
    else k.current += ((selected || visited ? 1 : 0) - k.current) * cfg.wakeSpeed;
    m.color.copy(GHOST_FILL).lerp(baseC, ghost ? 0.3 + 0.7 * k.current : 1);
    const rest = ghost ? restOpacity * 0.3 : restOpacity;
    m.opacity = (rest + (solid - rest) * k.current) * presence.current;
    // Waking an object still makes it glossier, but gently — the shine now comes
    // off the environment rather than the key light (see SPEC above), so the
    // floor only needs to stop the lobe tightening back into a hotspot.
    m.roughness = cfg.roughnessBase - cfg.roughnessWakeDelta * k.current;
    m.depthWrite = k.current > 0.5;
  });
  return (
    <meshStandardMaterial
      ref={mat}
      userData={{ lifeSkip: true }}
      color={fill}
      transparent
      opacity={restOpacity}
      roughness={0.34}
      metalness={0}
      emissive={SURFACE_GLOW}
      emissiveIntensity={0.14}
      depthWrite={false}
      onBeforeCompile={glassRim}
    />
  );
}

/** The sheet the model stands on — roads, aprons, the rug, any paved patch.
 *
 *  GROUND is a separate category from SURFACE for a reason that only shows up
 *  once you try to merge them: a floor marking has no volume, so lighting it
 *  makes no sense (there's nothing for the light to fall across), and giving it
 *  a SURFACE cut makes it read as a very thin slab of the model lying down
 *  rather than as something printed on the paper. Unlit, single-valued, and
 *  never a hotspot: if it's drawn ON the sheet rather than standing on it, it
 *  comes from here.
 *
 *  This is also the one category the first sweep missed — the rug and the park
 *  apron were `GlassMat` at hand-picked opacities (0.06, 0.15), so routing them
 *  to a SURFACE cut quadrupled them into bright discs. They were never surfaces. */
export function GroundMat({ opacity = GROUND.film, side }: { opacity?: number; side?: Side }) {
  return <meshBasicMaterial color={GROUND.sheet} transparent opacity={opacity} side={side ?? FrontSide} depthWrite={false} />;
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
export function LiveEdges({ slug, threshold = 20, rest = 1, wake }: { slug: string; threshold?: number; rest?: number; wake?: { current: number } }) {
  const { selected, visited } = useActive(slug);
  const ref = useRef<EdgesRef>(null);
  const k = useRef(0);
  // These are lifeSkip, so neither the life system nor the presence dimmer would
  // otherwise touch them — and an outline is the most visible thing on an object,
  // so a dimmed layer's tower kept a bright wireframe over a faded body.
  const presence = useContext(PresenceCtx);
  // Shares wakeSpeed with LiveGlassMat so an object's fill and its retiring
  // outline move on the same trajectory — they're always used together via
  // LifeGroup, and drifting out of step would read as two separate animations.
  const cfg = useFxConfig();
  useFrame(() => {
    const mat = ref.current?.material as Material | undefined;
    if (!mat) return;
    if (!mat.userData.lifeSkip) {
      mat.userData.lifeSkip = true;
      mat.transparent = true;
      // A line's default depthWrite is true, which was fine while it stayed
      // bright — but retiring it to invisible doesn't stop it writing depth.
      // Sitting exactly on the surface it traces, that punched a same-shaped
      // hole through whatever translucent fill sat behind/around it (the park
      // trees, semi-transparent even fully awake, are what surfaced this — a
      // solid opaque body would never show it). A line was never meant to be
      // an occluder, so it never needed to touch the depth buffer at all.
      mat.depthWrite = false;
      mat.needsUpdate = true;
    }
    if (wake) k.current = wake.current; // see LiveGlassMat's `wake`
    else k.current += ((selected || visited ? 1 : 0) - k.current) * cfg.wakeSpeed;
    // `rest` caps the idle brightness before it retires — most outlines trace a
    // bulky form (a tower, a cap) where full brightness reads as a normal
    // wireframe. A long thin plane on its own in open air (the sails) has
    // nothing bulky to belong to, so its outline needs a dimmer idle cap or it
    // reads as a bold line drawn for its own sake.
    mat.opacity = rest * (1 - k.current) * presence.current;
  });
  return <Edges ref={ref} threshold={threshold} color={NEUTRAL} transparent />;
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
