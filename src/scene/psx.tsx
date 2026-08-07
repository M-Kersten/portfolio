// ---------------------------------------------------------------------------
// A PlayStation-1 render mode for the maquette, behind the fx panel's `psx`
// toggle. A SPIKE: it's here to answer "is this direction worth committing to",
// so it does the three things that carry the look at almost no cost, and none
// of the things that would mean redrawing the scene.
//
// What it does
//   · snaps vertices to a coarse screen grid — the PS1's GTE worked in
//     fixed-point with no subpixel precision, so geometry visibly wobbled as it
//     moved. This is the signature tell and the one nothing else fakes.
//   · renders into a small buffer and lets the browser upscale it with nearest
//     neighbour, which is the resolution half of the look.
//   · quantises to a 5-bit-per-channel palette with an ordered dither, the way
//     the PS1's 15-bit framebuffer did.
//
// What it deliberately doesn't do, and why the full commitment is a bigger job:
//   · affine texture warping, the other signature tell, needs textures to warp.
//     The maquette has none — every surface is a flat colour plus a screen-space
//     shader pattern.
//   · the wireframe outlines (29 <Edges>/<LiveEdges>, plus every <Line>) are
//     drawn in screen pixels, so a quarter-size buffer makes them four times
//     thicker relative to the frame. A scene whose whole drawing language is
//     outlines turns into a tangle at PS1 resolution. Going all the way means
//     dropping them and having every object carry itself on shaded solid form —
//     which is how the PS1 did it, but it's a new material language for all
//     three layers, and the ghost→solid life ramp would have to become a stipple
//     dissolve rather than an opacity fade.
// ---------------------------------------------------------------------------
import { forwardRef, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Effect } from 'postprocessing';
import { ShaderChunk, Uniform, type Material, type Mesh } from 'three';

/* ---------------------------- 1. vertex snapping --------------------------- */

// Appended to three's `project_vertex`, which every built-in material's vertex
// shader includes — so patching it here reaches the whole scene at once instead
// of needing an onBeforeCompile on all ~40 materials. Guarded by a #define so
// the chunk can sit there permanently and cost nothing while the mode is off.
//
// The define matters for more than tidiness: three keys its shader-program cache
// on material properties rather than on the source text, so flipping the chunk
// alone would hand every material back its already-compiled program. `defines`
// IS part of that key, so toggling one is what actually forces the rebuild.
const SNAP_GLSL = `
#ifdef PSX_SNAP
  {
    // guard the near plane: w goes to zero behind the camera and the divide
    // would fling the vertex across the screen
    float psxW = max(abs(gl_Position.w), 1e-4);
    vec2 psxGrid = vec2(PSX_SNAP, PSX_SNAP * 0.75); // 4:3, the console's aspect
    gl_Position.xy = floor((gl_Position.xy / psxW) * psxGrid + 0.5) / psxGrid * psxW;
  }
#endif
`;

let patched = false;
function patchProjectVertex() {
  if (patched) return;
  ShaderChunk.project_vertex += SNAP_GLSL;
  patched = true;
}

/** Turn the snap on (or off) across every material currently in the scene. */
export function usePsxVertexSnap(enabled: boolean, grid: number) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    // Only ever touch three's shader library if the mode is actually being used.
    // In production `psx` is a frozen false (the panel that flips it is
    // DEV-only), so the stock chunk is left exactly as it was.
    if (!enabled) return;
    patchProjectVertex();
    const touched: Material[] = [];
    scene.traverse((o) => {
      const m = (o as Mesh).material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        mat.defines = mat.defines ?? {};
        mat.defines.PSX_SNAP = grid.toFixed(1);
        mat.needsUpdate = true;
        touched.push(mat);
      }
    });
    return () => {
      // leaving the mode has to unset every define it set, or a material that
      // survives the toggle keeps snapping
      for (const mat of touched) {
        if (mat.defines?.PSX_SNAP) {
          delete mat.defines.PSX_SNAP;
          mat.needsUpdate = true;
        }
      }
    };
  }, [scene, enabled, grid]);
}

/* --------------------------- 2. the small buffer --------------------------- */

/** Renders into a buffer `scale` times smaller and upscales it with nearest
 *  neighbour. Driving R3F's dpr rather than the canvas size keeps the layout,
 *  the pointer maths and the <Html> hotspot overlays all at full size — only the
 *  WebGL surface shrinks. */
export function usePsxBuffer(enabled: boolean, scale: number) {
  const setDpr = useThree((s) => s.setDpr);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const base = Math.min(window.devicePixelRatio || 1, 2);
    setDpr(enabled ? Math.max(base / scale, 0.1) : base);
    const el = gl.domElement;
    // without this the browser bilinearly smooths the upscale and the whole
    // point — hard pixels — is lost
    el.style.imageRendering = enabled ? 'pixelated' : '';
    return () => {
      el.style.imageRendering = '';
      setDpr(base);
    };
  }, [enabled, scale, setDpr, gl]);
}

/* ------------------------ 3. quantise + ordered dither --------------------- */

// A 4x4 Bayer matrix without the 16-entry lookup — the two-level recursion is
// the standard closed form and needs no array indexing, which keeps this valid
// on the GLSL ES 1.0 path as well as WebGL2.
const GRADE_GLSL = /* glsl */ `
uniform float levels;
uniform float dither;

float psxBayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (levels < 2.0) { outputColor = inputColor; return; }
  vec2 p = gl_FragCoord.xy;
  float b = psxBayer2(p * 0.5) * 0.25 + psxBayer2(p); // 4x4, in [0,1)
  float n = levels - 1.0;
  // The dither is what stops a 32-step palette banding across this scene's long
  // dark gradients; the console leaned on it for exactly the same reason.
  vec3 c = floor(inputColor.rgb * n + 0.5 + (b - 0.5) * dither) / n;
  outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
}
`;

class PsxGradeEffect extends Effect {
  constructor() {
    super('PsxGrade', GRADE_GLSL, {
      uniforms: new Map([
        ['levels', new Uniform(0)],
        ['dither', new Uniform(1)],
      ]),
    });
  }
}

/** Always mounted, and a no-op at `levels < 2` — swapping effects in and out of
 *  the composer rebuilds its whole pass chain, which is a worse trade than one
 *  fullscreen shader that returns its input unchanged. */
export const PsxGrade = forwardRef<PsxGradeEffect, { levels: number; dither: number }>(({ levels, dither }, ref) => {
  const effect = useMemo(() => new PsxGradeEffect(), []);
  effect.uniforms.get('levels')!.value = levels;
  effect.uniforms.get('dither')!.value = dither;
  return <primitive ref={ref} object={effect} dispose={null} />;
});
PsxGrade.displayName = 'PsxGrade';
