// Lit on hover — the "lit hologram". Pointing at a project's hotspot shines a
// light on the object it belongs to, and the light stays on while that project
// is open. Nothing else changes: at rest every material renders exactly as it
// did before this file existed.
//
// While lit, an object's stylised devices start describing the light instead
// of sitting on every surface in the same amount:
//   · the halftone becomes the shading — tiny dots where the light falls, big
//     dots in shade and in cast shadow, on a screen fixed in CSS pixels;
//   · the fresnel rim takes the layer's accent and is brightest on the side the
//     light comes from;
//   · faint (ghost) glass catches the light on the faces turned to it, so a
//     project you haven't opened yet still visibly lights up;
//   · a solid (woken) object reads as one glass volume — a depth-only twin is
//     drawn just before it, so you see through the object, not into it;
//   · a solid object casts a shadow, printed on the floor as halftone dots.
//     Ghosts cast none: shadows arrive with the wake.
//
// All of that happens in the shaders; nothing here adds illumination. It is a
// stylised key: the direction comes from the viewer's upper left (so whatever
// you look at reads), and while something is lit, a depth pass drawn from that
// key and fitted to the lit objects feeds the halftone its shadows.
//
// The shadows are this file's own, not three's shadow maps. One shadow-casting
// light is enough for three to compile shadow sampling into every material that
// takes light, so the whole resting maquette carried it — every surface, every
// frame, for an effect that only ever shows on one object. Here nothing samples
// the key but a lit object's own shaders, and only while it's lit; the depth
// pass only runs while something is. At rest the scene draws exactly what it
// did before any of this existed, with shaders that differ only by a branch it
// skips.
import { useContext, useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BackSide,
  Box3,
  Color,
  DepthTexture,
  DoubleSide,
  FrontSide,
  type IUniform,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  type Object3D,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  type Side,
  UniformsLib,
  UniformsUtils,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useSceneSelector } from '../store';
import { useAccent } from './shared';
import { PresenceCtx } from './presence';

/** The key's depth map: its size in texels, and how it's sampled — the same
 *  bias, normal offset and 17-tap spread three's PCF shadows had here. */
const MAP_SIZE = 1024;
const SHADOW_BIAS = -0.0004; // depth units: pulls a surface toward the key, against acne
const NORMAL_BIAS = 0.015; // world units along the surface's normal, the same job
const SHADOW_RADIUS = 3; // texels — the PCF spread that softens the edge into a dot gradient

/** Shared uniforms, the same objects in every lit shader (like RIM/DOT_TUNE):
 *  ShadeLight keeps the key direction and pixel ratio current each frame. */
const LIT = {
  keyDir: { value: new Vector3(-0.5, 1, 0.5).normalize() }, // world space, toward the light
  cell: { value: 4 }, // halftone cell, CSS px — big enough to read as a screen, not as noise
  dpr: { value: 1.25 }, // canvas pixel ratio, so the cell stays in CSS px
  // the dots' ink: the stage's night, a touch lifted toward the deep glass
  ink: { value: new Color('#0e272f').lerp(new Color('#1c3346'), 0.35) },
  // 1 while the depth map is drawn this frame, fitted to the lit bodies. At
  // any other time it holds nothing (or the last lit body's shadow), so the
  // lit block ignores it.
  shadow: { value: 0 },
  shadowMap: { value: null as DepthTexture | null }, // ShadeLight's; three binds an empty texture until then
  shadowMatrix: { value: new Matrix4() }, // world → the map's [0,1] uv and depth
  shadowTexel: { value: 1 / MAP_SIZE },
};
/** The level a material reads when nothing drives it: never lit. */
const LIT_OFF = { value: 0 };

/** How fast the light comes on and goes off (1/s, exponential). */
const LIT_RATE = 7;
/** Where the lit layers sit in the draw order. After the floor's sheen (-2)
 *  and blob shadows (-1): the hover shadows printed on the bare floor, then
 *  the lit objects' depth twins, then everything standing on the floor (0) —
 *  the markings drawn on it included, which print their own (ShadowPrint). */
const DOTS_ORDER = -0.5;
const TWIN_ORDER = -0.25;

/* ---------- shader ---------- */

/** A number as a GLSL float literal. */
const glf = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export const LIT_PARS = /* glsl */ `
uniform vec3 uKeyDir;
uniform float uLitCell;
uniform float uLitDpr;
uniform vec3 uLitInk;
uniform float uLit;
uniform vec3 uRimLit;
uniform float uLitShadow;
uniform sampler2D uLitShadowMap;
uniform mat4 uLitShadowMatrix;
uniform float uLitShadowTexel;
// A 45-degree halftone screen in CSS pixels; tone 0..1 is ink coverage. The
// screen is locked to the pixel grid, so how fast d changes from one pixel to
// the next is known up front — 2 / (cell * dpr), times 1 to 1.41 with the
// angle — and the dot's edge is antialiased without derivatives. Nothing in a
// lit shader takes one, so its branch is safe on every compiler.
float litHalftone( float tone ) {
  vec2 p = gl_FragCoord.xy / uLitDpr;
  p = vec2( p.x + p.y, p.y - p.x ) * 0.70710678;
  vec2 c = fract( p / uLitCell ) - 0.5;
  float d = length( c ) * 2.0;
  float r = sqrt( clamp( tone, 0.0, 1.0 ) );
  float aa = 2.4 / ( uLitCell * uLitDpr );
  return 1.0 - smoothstep( r - aa, r + aa, d );
}
// 1 where the key's depth map sees this point, 0 where a lit body is nearer to
// it. Explicit LOD, for the same reason as above.
float litDepthTest( vec2 uv, float z ) {
  return step( z, textureLod( uLitShadowMap, uv, 0.0 ).r );
}
// How much of the key reaches a point in world space: 1 in the light, 0 in a
// lit body's shadow, soft in between — three's 17-tap PCF, at the same spread.
float litShadowAt( vec3 world ) {
  vec4 s = uLitShadowMatrix * vec4( world, 1.0 );
  vec3 c = s.xyz / s.w;
  c.z += ${glf(SHADOW_BIAS)};
  if ( c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0 ) return 1.0;
  float a = uLitShadowTexel * ${glf(SHADOW_RADIUS)};
  float b = a * 0.5;
  return (
    litDepthTest( c.xy + vec2( -a, -a ), c.z ) +
    litDepthTest( c.xy + vec2( 0.0, -a ), c.z ) +
    litDepthTest( c.xy + vec2( a, -a ), c.z ) +
    litDepthTest( c.xy + vec2( -b, -b ), c.z ) +
    litDepthTest( c.xy + vec2( 0.0, -b ), c.z ) +
    litDepthTest( c.xy + vec2( b, -b ), c.z ) +
    litDepthTest( c.xy + vec2( -a, 0.0 ), c.z ) +
    litDepthTest( c.xy + vec2( -b, 0.0 ), c.z ) +
    litDepthTest( c.xy, c.z ) +
    litDepthTest( c.xy + vec2( b, 0.0 ), c.z ) +
    litDepthTest( c.xy + vec2( a, 0.0 ), c.z ) +
    litDepthTest( c.xy + vec2( -b, b ), c.z ) +
    litDepthTest( c.xy + vec2( 0.0, b ), c.z ) +
    litDepthTest( c.xy + vec2( b, b ), c.z ) +
    litDepthTest( c.xy + vec2( -a, a ), c.z ) +
    litDepthTest( c.xy + vec2( 0.0, a ), c.z ) +
    litDepthTest( c.xy + vec2( a, a ), c.z )
  ) * ( 1.0 / 17.0 );
}
`;

/** How much light a ghost's lit faces catch: colour toward the light, alpha. */
const CATCH_RGB = 0.3;
const CATCH_A = 0.3;

/** The lit look, mixed over whatever the material already drew by uLit.
 *  Expects `_base` (the lit colour before any stylisation), `_n` (view-space
 *  normal) and `_rim` (the fresnel term) in scope. uLit is a uniform, and
 *  nothing inside takes a derivative, so the branch costs a resting material
 *  one comparison. */
function litBlock(k: { dots: number; rim: number; alpha: number }) {
  const f = (n: number) => n.toFixed(3);
  return /* glsl */ `
if ( uLit > 0.001 ) {
  vec3 _l = normalize( ( viewMatrix * vec4( uKeyDir, 0.0 ) ).xyz );
  float _ndl = dot( _n, _l );
  float _sh = 1.0;
  if ( uLitShadow > 0.5 ) {
    // this fragment in world space — the view matrix is rigid, so its inverse
    // is the transpose about the eye — nudged off its surface along the normal
    vec3 _wp = ( vec4( - vViewPosition - viewMatrix[ 3 ].xyz, 0.0 ) * viewMatrix ).xyz;
    vec3 _wn = ( vec4( _n, 0.0 ) * viewMatrix ).xyz;
    _sh = litShadowAt( _wp + _wn * ${glf(NORMAL_BIAS)} );
  }
  float _lt = clamp( _ndl, 0.0, 1.0 ) * _sh;
  // tiny dots in the light, big dots in shade — the halftone IS the shading
  float _tone = mix( 0.06, 1.0, 1.0 - smoothstep( 0.05, 0.8, _lt ) );
  vec4 _lc = _base;
  // Faint glass catches the light: a ghost's lit faces brighten toward the
  // light's colour and firm up, the fainter the glass the more — dots alone
  // barely register on a ghost. A woken, near-solid body is left to its dots.
  float _catch = _lt * ( 1.0 - _base.a );
  _lc.rgb = mix( _lc.rgb, uRimLit, _catch * ${f(CATCH_RGB)} );
  _lc.a += _catch * ${f(CATCH_A)};
  _lc.rgb = mix( _lc.rgb, uLitInk, litHalftone( _tone ) * ${f(k.dots)} );
  // the rim in the layer's accent, strongest where the light hits
  float _side = 0.35 + 0.65 * smoothstep( -0.3, 0.7, _ndl );
  _lc.rgb += uRimLit * _rim * ${f(k.rim)} * _side;
  _lc.a = clamp( _lc.a + _rim * ${f(k.alpha)}, 0.0, 1.0 );
  gl_FragColor = mix( gl_FragColor, _lc, uLit );
}
`;
}
/** Glass: the dots, the rim and the rim's alpha lift. */
export const LIT_GLASS = litBlock({ dots: 0.62, rim: 0.62, alpha: 0.42 });
/** A plain solid (books, the pines): gentler dots, a thin rim, no alpha. */
const LIT_SOLID = litBlock({ dots: 0.5, rim: 0.3, alpha: 0 });

/** Wire the lit uniforms into a shader. Per-material values live on the
 *  material's userData (`litU`, `rimLit`); a material without them is never
 *  lit and keeps its exact resting look. */
export function litUniforms(shader: { uniforms: Record<string, unknown> }, mat: Material | undefined) {
  shader.uniforms.uKeyDir = LIT.keyDir;
  shader.uniforms.uLitCell = LIT.cell;
  shader.uniforms.uLitDpr = LIT.dpr;
  shader.uniforms.uLitInk = LIT.ink;
  shader.uniforms.uLitShadow = LIT.shadow;
  shader.uniforms.uLitShadowMap = LIT.shadowMap;
  shader.uniforms.uLitShadowMatrix = LIT.shadowMatrix;
  shader.uniforms.uLitShadowTexel = LIT.shadowTexel;
  shader.uniforms.uLit = (mat?.userData.litU as { value: number } | undefined) ?? LIT_OFF;
  shader.uniforms.uRimLit = (mat?.userData.rimLit as { value: Color } | undefined) ?? { value: new Color('#ffffff') };
}
/** A material at or above this opacity counts as solid (a woken object) —
 *  solid enough to get a body. */
export const LIT_SOLID_OPACITY = 0.5;

/** onBeforeCompile for a plain MeshStandardMaterial that should light up with
 *  its hotspot. Its resting look is untouched: the lit block only mixes in
 *  while uLit > 0. `this` is the material (three calls it as a method). */
export function litShade(this: unknown, shader: { uniforms: Record<string, unknown>; fragmentShader: string }) {
  litUniforms(shader, this as Material | undefined);
  shader.fragmentShader = shader.fragmentShader.replace('void main() {', `${LIT_PARS}\nvoid main() {`).replace(
    '#include <opaque_fragment>',
    [
      '#include <opaque_fragment>',
      'vec4 _base = gl_FragColor;',
      'vec3 _n = normalize( normal );',
      'float _rim = pow( 1.0 - clamp( dot( _n, normalize( vViewPosition ) ), 0.0, 1.0 ), 2.8 );',
      LIT_SOLID,
    ].join('\n'),
  );
}

/* ---------- the level ---------- */

/** The light level (0..1) for a project's objects: on while its hotspot is
 *  hovered or focused, and while the project is open. The raw selection, not
 *  the zoom-gated one, so the light doesn't dip while the camera flies in —
 *  clicking a hotspot clears the hover in the same instant. Returned as a
 *  uniform object, worn by a material as `userData.litU` (see useLitLink). */
function useLit(slug: string) {
  const hovered = useSceneSelector((s) => !!slug && s.hoveredSlug === slug);
  const open = useSceneSelector((s) => !!slug && s.selectedSlug === slug);
  const reduced = useReducedMotion();
  const u = useMemo(() => ({ value: 0 }), []);
  useFrame((_s, delta) => {
    const target = hovered || open ? 1 : 0;
    if (reduced) u.value = target;
    else u.value += (target - u.value) * (1 - Math.exp(-LIT_RATE * Math.min(delta, 0.1)));
    if (Math.abs(target - u.value) < 0.002) u.value = target;
  });
  return u;
}

/** The layer's accent, lifted toward white — the lit rim colour. */
function useRimLit(accent: string) {
  return useMemo(() => ({ value: new Color(accent).lerp(new Color('#ffffff'), 0.55) }), [accent]);
}

/** A project's light as its materials wear it: spread into a material's
 *  userData (it's read when the shader compiles). One per object is plenty —
 *  every part of it can share the same link. */
export type LitLink = { litU: { value: number }; rimLit: { value: Color } };
export function useLitLink(slug: string): LitLink {
  const litU = useLit(slug);
  const rimLit = useRimLit(useAccent().accent);
  return useMemo(() => ({ litU, rimLit }), [litU, rimLit]);
}

/** Props that light a plain standard material with its project: spread onto a
 *  <meshStandardMaterial>. Any userData it already carries goes in `keep`. */
export function litMat(link: LitLink, keep?: Record<string, unknown>) {
  return { userData: { ...keep, ...link }, onBeforeCompile: litShade };
}

/* ---------- the body: one volume + a shadow ---------- */

/** Depth-only twin: drawn just before its mesh, it leaves the object's front
 *  surface in the depth buffer, so the glass shows that surface and nothing
 *  of its own insides. Transparent so it sorts with the glass it serves. */
const DEPTH_TWIN = new MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true });
DEPTH_TWIN.userData.lifeSkip = true;

/** Which meshes wear which material — built at most once a frame, and only in
 *  a frame where some body is looking for its meshes (a whole skyline can
 *  light up at once; it shouldn't walk the scene once per building). */
const index = { frame: -1, meshes: new Map<Material, Mesh[]>() };

/** What the lit objects add up to this frame — the key fits itself to it and
 *  draws its casters (one frame late, which nobody can see). */
const LIT_STATE = {
  box: new Box3(),
  level: 0,
  casters: [] as Mesh[],
  used: { box: new Box3(), level: 0, casters: [] as Mesh[] },
  frame: 0,
  /** Start a frame: last frame's total becomes the one in use. */
  flip() {
    this.used.box.copy(this.box);
    this.used.level = this.level;
    const spare = this.used.casters; // swap the lists rather than copy them
    this.used.casters = this.casters;
    this.casters = spare;
    this.casters.length = 0;
    this.box.makeEmpty();
    this.level = 0;
    this.frame++;
    index.meshes.clear(); // last frame's lookups; don't hold on to its meshes
  },
};
const _box = new Box3();

function meshesWearing(scene: Object3D, mat: Material): Mesh[] {
  if (index.frame !== LIT_STATE.frame) {
    index.frame = LIT_STATE.frame;
    index.meshes.clear();
    scene.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || m.material === DEPTH_TWIN || Array.isArray(m.material)) return;
      const list = index.meshes.get(m.material);
      if (list) list.push(m);
      else index.meshes.set(m.material, [m]);
    });
  }
  return index.meshes.get(mat) ?? [];
}

/** Finds its meshes — the ones wearing a set of materials, or every lit mesh
 *  under a group — and, while the light is on and the object is solid, puts
 *  them in the key's depth pass and gives each transparent one its depth twin.
 *  Lookups only happen while lit, and only when a mesh has gone missing. */
class LitBody {
  private meshes: Mesh[] = [];
  private twins = new Map<Mesh, Mesh>();
  private on = false;
  constructor(private source: Set<Material> | Object3D) {}

  private stale() {
    const src = this.source;
    if (this.meshes.length === 0) return true;
    return this.meshes.some((m) => !m.parent || (src instanceof Set && !src.has(m.material as Material)));
  }
  private find(scene: Object3D) {
    this.meshes = [];
    const src = this.source;
    if (src instanceof Set) {
      for (const mat of src) this.meshes.push(...meshesWearing(scene, mat));
      return;
    }
    src.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && !Array.isArray(m.material) && m.material !== DEPTH_TWIN && m.material.userData.litU) this.meshes.push(m);
    });
  }
  update(scene: Object3D, level: number, solid: boolean) {
    // On with the light, not partway through it, so the shadow fades in with
    // the rest of the look (see ShadowDots) instead of arriving mid-fade.
    const on = level > 0 && solid;
    if (on && this.stale()) {
      this.dispose(); // let go of whatever the old set held
      this.find(scene);
      this.on = false; // so the switch below applies to the fresh set
    }
    if (on !== this.on) {
      this.on = on;
      for (const m of this.meshes) {
        // Opaque parts are one volume already. Instanced ones (the outskirts'
        // boxes) would need an instanced twin, and a convex box drawn front
        // side only has no insides to hide.
        if (!(m.material as Material).transparent || (m as InstancedMesh).isInstancedMesh) continue;
        let t = this.twins.get(m);
        if (on && !t) {
          t = new Mesh(m.geometry, DEPTH_TWIN);
          t.renderOrder = TWIN_ORDER;
          m.add(t);
          this.twins.set(m, t);
        }
        if (t) t.visible = on;
      }
    }
    if (!on) return;
    for (const m of this.meshes) {
      const t = this.twins.get(m);
      if (t && t.geometry !== m.geometry) t.geometry = m.geometry; // args changed under us
      const im = m as InstancedMesh;
      if (im.isInstancedMesh) {
        if (!im.boundingBox) im.computeBoundingBox(); // every instance, in its own space
        _box.copy(im.boundingBox!);
      } else {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        _box.copy(m.geometry.boundingBox!);
      }
      _box.applyMatrix4(m.matrixWorld);
      LIT_STATE.box.union(_box);
      LIT_STATE.casters.push(m);
    }
    LIT_STATE.level = Math.max(LIT_STATE.level, level);
  }
  dispose() {
    for (const [m, t] of this.twins) m.remove(t);
    this.twins.clear();
    this.meshes = [];
  }
}

/** Give an object a lit body: a set of materials, or a group whose lit meshes
 *  (the ones wearing a link — see litMat) are the body. Call the returned
 *  function with `(level, solid)` from the owner's frame loop. */
export function useLitBody(source: Material[] | (() => Material[]) | RefObject<Object3D | null>) {
  const scene = useThree((s) => s.scene);
  const body = useRef<LitBody | null>(null);
  useEffect(
    () => () => {
      body.current?.dispose();
      body.current = null;
    },
    [],
  );
  return (level: number, solid: boolean) => {
    if (!body.current) {
      if (level <= 0) return; // nothing to do until the light first comes on
      if ('current' in source) {
        if (!source.current) return;
        body.current = new LitBody(source.current);
      } else {
        const list = typeof source === 'function' ? source() : source;
        if (list.length === 0) return;
        body.current = new LitBody(new Set(list));
      }
    }
    body.current.update(scene, level, solid);
  };
}

/* ---------- the key and the printed shadows ---------- */

const WORLD_UP = new Vector3(0, 1, 0);

/** What a caster draws into the key's depth map: the back faces of a
 *  front-sided surface and the reverse, both for double-sided — three's rule
 *  for its own shadow maps, which keeps a lit face from shadowing itself. */
const DEPTH_BY_SIDE: Record<Side, MeshDepthMaterial> = {
  [FrontSide]: new MeshDepthMaterial({ side: FrontSide, colorWrite: false }),
  [BackSide]: new MeshDepthMaterial({ side: BackSide, colorWrite: false }),
  [DoubleSide]: new MeshDepthMaterial({ side: DoubleSide, colorWrite: false }),
};
const FLIP: Record<Side, Side> = { [FrontSide]: BackSide, [BackSide]: FrontSide, [DoubleSide]: DoubleSide };

/** The key's depth pass draws stand-ins in a scene of its own: the lit meshes'
 *  geometry at their world transforms, in depth materials. Drawing the real
 *  scene from a second camera would hand three a second, different set of
 *  lights every frame, and every material in the scene would go back through
 *  program selection twice a frame for it. */
const KEY_SCENE = new Scene();
KEY_SCENE.matrixWorldAutoUpdate = false; // the stand-ins carry their casters' world matrices
const standIns = new WeakMap<Mesh, Mesh>();

function standIn(caster: Mesh): Mesh {
  let s = standIns.get(caster);
  if (!s) {
    const im = caster as InstancedMesh;
    if (im.isInstancedMesh) {
      const si = new InstancedMesh(im.geometry, DEPTH_BY_SIDE[FrontSide], im.count);
      si.instanceMatrix = im.instanceMatrix; // the same instances, not a copy
      s = si;
    } else s = new Mesh(caster.geometry, DEPTH_BY_SIDE[FrontSide]);
    s.matrixAutoUpdate = false;
    s.frustumCulled = false; // the key's frustum is fitted to these very meshes
    standIns.set(caster, s);
  }
  return s;
}

/** Visible all the way up, and still in a scene. */
function shown(o: Object3D | null) {
  for (; o; o = o.parent) {
    if (!o.visible) return false;
    if ((o as Scene).isScene) return true;
  }
  return false;
}

/** Draw the casters' depth, seen from the key, into its map. */
function drawKeyDepth(gl: WebGLRenderer, cam: OrthographicCamera, map: WebGLRenderTarget, casters: Mesh[]) {
  KEY_SCENE.clear();
  for (const m of casters) {
    const mat = m.material as Material;
    if (!mat.visible || !shown(m)) continue;
    const s = standIn(m);
    if (s.parent) continue; // listed twice (two bodies sharing a mesh)
    m.updateWorldMatrix(true, false); // this frame's pose, not the last render's
    s.matrixWorld.copy(m.matrixWorld);
    s.geometry = m.geometry;
    s.material = DEPTH_BY_SIDE[mat.shadowSide ?? FLIP[mat.side]];
    if ((m as InstancedMesh).isInstancedMesh) (s as InstancedMesh).count = (m as InstancedMesh).count;
    KEY_SCENE.add(s);
  }
  const prev = gl.getRenderTarget();
  const autoClear = gl.autoClear;
  gl.autoClear = true; // the composer turns it off; this pass clears its own map
  gl.setRenderTarget(map);
  gl.render(KEY_SCENE, cam);
  gl.setRenderTarget(prev);
  gl.autoClear = autoClear;
}

/** The stylised key. Adds no light: while something is lit it draws that
 *  object's depth from the key's direction, fitted tightly around it, for the
 *  lit shaders and the printed dots to read — and nothing at all otherwise.
 *  Also keeps the shared key direction and pixel ratio current for every lit
 *  shader. */
export function ShadeLight() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const reduced = useReducedMotion();
  const v = useMemo(() => ({ r: new Vector3(), u: new Vector3(), f: new Vector3(), c: new Vector3(), s: new Vector3() }), []);
  const key = useMemo(() => {
    const cam = new OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
    const map = new WebGLRenderTarget(MAP_SIZE, MAP_SIZE, { depthBuffer: true, stencilBuffer: false, depthTexture: new DepthTexture(MAP_SIZE, MAP_SIZE) });
    return { cam, map };
  }, []);
  useEffect(() => {
    LIT.shadowMap.value = key.map.depthTexture;
    return () => {
      if (LIT.shadowMap.value === key.map.depthTexture) LIT.shadowMap.value = null;
      key.map.depthTexture?.dispose();
      key.map.dispose();
    };
  }, [key]);
  useFrame((_s, delta) => {
    LIT_STATE.flip();
    LIT.dpr.value = gl.getPixelRatio();
    // from the viewer's upper left and a little in front of the subject, so
    // the faces you look at read as lit and the shade falls right and back
    camera.matrixWorld.extractBasis(v.r, v.u, v.f); // f = +z: back toward the viewer
    LIT.keyDir.value.copy(v.r).multiplyScalar(-0.55).addScaledVector(WORLD_UP, 1).addScaledVector(v.f, 0.55).normalize();
    const { box, level, casters } = LIT_STATE.used;
    const on = level > 0 && !box.isEmpty() && casters.length > 0;
    LIT.shadow.value = on ? 1 : 0;
    // the printed shadows fade with the light — once it's off the map is left
    // as it was, so they fade out on the last shadow drawn
    easeDots(on ? level : 0, delta, reduced);
    if (!on) return; // nothing lit: no depth pass at all
    box.getCenter(v.c);
    box.getSize(v.s);
    const reach = Math.max(v.s.x, v.s.y, v.s.z) * 0.9 + 0.25; // room for the shadow thrown past the object
    const cam = key.cam;
    cam.position.copy(v.c).addScaledVector(LIT.keyDir.value, reach * 3);
    cam.lookAt(v.c);
    cam.left = -reach;
    cam.right = reach;
    cam.top = reach;
    cam.bottom = -reach;
    cam.near = 0.01;
    cam.far = reach * 6;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // world → the map's [0,1] uv and depth (three's shadow matrix)
    LIT.shadowMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    drawKeyDepth(gl, cam, key.map, casters);
  });
  return null;
}

/** Cast shadows printed as halftone dots, on the same screen as the lit glass:
 *  the floor's own point in the key's depth map, through the same PCF. */
const DOTS_VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec3 vLitWorld;
void main() {
  vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
  vLitWorld = worldPosition.xyz;
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const DOTS_FRAGMENT = /* glsl */ `
uniform vec3 color;
uniform float opacity;
${LIT_PARS}
varying vec3 vLitWorld;
#include <common>
#include <fog_pars_fragment>
void main() {
  // a floor faces up, so that's the way the normal offset runs
  float lit = litShadowAt( vLitWorld + vec3( 0.0, ${glf(NORMAL_BIAS)}, 0.0 ) );
  gl_FragColor = vec4( color, opacity * litHalftone( 1.0 - lit ) );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;
/** The dots' opacity, one value for both materials; ShadeLight eases it with
 *  the light, so a shadow that arrives with a wake (a lit ghost turning solid)
 *  fades in too. */
const DOTS_ALPHA = { value: 0 };
/** Two shared materials (a road is drawn from both sides, a rug from one) that
 *  every floor printing the shadows wears. */
function dotShadowMaterial(side: Side) {
  const uniforms: Record<string, IUniform> = { ...UniformsUtils.clone(UniformsLib.fog), color: { value: new Color('#02080b') }, opacity: DOTS_ALPHA };
  litUniforms({ uniforms }, undefined);
  const m = new ShaderMaterial({ uniforms, vertexShader: DOTS_VERTEX, fragmentShader: DOTS_FRAGMENT, transparent: true, depthWrite: false, side, fog: true });
  m.userData.lifeSkip = true;
  return m;
}
const DOTS = { front: dotShadowMaterial(FrontSide), both: dotShadowMaterial(DoubleSide) };
/** How dark the printed shadow gets at full light. */
const DOTS_OPACITY = 0.55;

function easeDots(level: number, delta: number, reduced: boolean) {
  const target = DOTS_OPACITY * level;
  let o = DOTS_ALPHA.value;
  o = reduced ? target : o + (target - o) * (1 - Math.exp(-LIT_RATE * Math.min(delta, 0.1)));
  if (o < 0.002) o = 0;
  DOTS_ALPHA.value = o;
}

/** The layer's bare floor, catching the lit objects' shadows. Drawn under
 *  everything standing on it (see DOTS_ORDER); only the layer in focus can
 *  hold a lit object, so only its floor shows them. */
export function ShadowDots({ active }: { active: boolean }) {
  const mesh = useRef<Mesh>(null);
  useFrame(() => {
    if (mesh.current) mesh.current.visible = active && DOTS_ALPHA.value > 0; // no draw at all while nothing's lit
  });
  return (
    <mesh ref={mesh} visible={false} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0015, 0]} renderOrder={DOTS_ORDER} material={DOTS.front}>
      <circleGeometry args={[2.3, 72]} />
    </mesh>
  );
}

/** The printed shadow on a marking drawn on the floor (the rug, the roads, a
 *  plot, the chip's board). A marking sorts in with everything standing on
 *  it, so it would draw over the floor's dots and veil them; this is a copy of
 *  the marking's own surface, a hair above it, so it sorts straight after the
 *  marking and prints the shadow on top. Place it inside the marking's mesh. */
export function ShadowPrint({ twoSided = false }: { twoSided?: boolean }) {
  const mesh = useRef<Mesh>(null);
  const presence = useContext(PresenceCtx); // 1 on the layer in focus
  const mat = twoSided ? DOTS.both : DOTS.front;
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const host = m.parent as Mesh | null;
    if (host?.isMesh && m.geometry !== host.geometry) m.geometry = host.geometry;
    m.visible = DOTS_ALPHA.value > 0 && presence.current > 0.999;
  });
  return <mesh ref={mesh} visible={false} position={[0, 0.0005, 0]} material={mat} />;
}
