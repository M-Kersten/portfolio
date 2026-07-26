import { Uniform } from 'three';
import { Effect } from 'postprocessing';
import { wrapEffect } from '@react-three/postprocessing';

// The maquette's look, in one merged pass: a tilt-shift focal band, a filmic
// shoulder with a teal/amber split, fine grain, and the vignette.
//
// WHY NOT <DepthOfField/>: real bokeh is genuinely expensive — a circle-of-
// confusion pass plus multi-pass blur, and it forces the depth texture. We don't
// need any of that here. The maquette is a fixed three-quarter diorama, so screen
// Y correlates almost perfectly with depth: a blur that grows with the distance
// from a horizontal band gives the same read for a handful of taps and no extra
// render target. (That is also, literally, how a tilt-shift lens behaves.)
//
// And postprocessing MERGES plain effects into a single fragment shader, so this
// costs no new pass. It replaces BrightnessContrast and Vignette outright, which
// means the composer is doing less work than before — the only added cost is the
// blur taps, and those early-out to zero inside the focal band.

const fragment = /* glsl */ `
uniform float uBlur;    // max blur radius, in UV
uniform float uFocus;   // centre of the sharp band (0 top .. 1 bottom)
uniform float uBand;    // half-height of the fully sharp band
uniform float uFalloff; // distance over which it reaches full blur
uniform float uSat;     // colour lift on what stays sharp
uniform float uContrast;
uniform float uGrain;
uniform float uVignette;
uniform float uSplit;   // teal-in-shadow / amber-in-highlight strength

float mg_luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float mg_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // ---- tilt-shift: radius from the distance out of the focal band ----------
  float d = max(abs(uv.y - uFocus) - uBand, 0.0);
  float r = smoothstep(0.0, uFalloff, d) * uBlur;

  vec3 c = inputColor.rgb;
  if (r > 0.0004) {
    // 12-tap golden-angle disc. Cheap, and dense enough that thin wireframes
    // smear evenly instead of ghosting into separate copies.
    vec3 s = c;
    float w = 1.0;
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 2.39996323;
      float rad = sqrt((float(i) + 0.5) / 12.0) * r;
      vec2 o = vec2(cos(a) * rad / aspect, sin(a) * rad);
      s += texture2D(inputBuffer, uv + o).rgb;
      w += 1.0;
    }
    c = s / w;
  }

  // ---- grade ---------------------------------------------------------------
  float l = mg_luma(c);
  // saturation, weighted toward what's in focus so the accents in the sharp
  // band sing and the soft edges stay quiet
  float sharp = 1.0 - smoothstep(0.0, uFalloff, d);
  c = mix(vec3(l), c, 1.0 + uSat * sharp);

  c = c / (c + 0.78) * 1.42;              // filmic shoulder: highlights roll off
  c = (c - 0.5) * (1.0 + uContrast) + 0.5;

  // split tone — cool the shadows, warm the few hot spots
  c *= mix(vec3(0.90, 1.01, 1.09), vec3(1.0), smoothstep(0.0, 0.55, l));
  c += vec3(0.055, 0.024, 0.0) * uSplit * pow(mg_luma(c), 2.2);

  // ---- grain + vignette ----------------------------------------------------
  c += (mg_hash(uv * resolution + fract(time) * 431.0) - 0.5) * uGrain;

  vec2 vd = uv - 0.5;
  vd.x *= 1.08;
  c *= 1.0 - uVignette * dot(vd, vd) * 2.1;

  outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
}
`;

export interface MaquetteGradeProps {
  blur?: number;
  focus?: number;
  band?: number;
  falloff?: number;
  saturation?: number;
  contrast?: number;
  grain?: number;
  vignette?: number;
  split?: number;
}

/* The dial. Everything about the look lives here — nudge these, not the shader.
   `focus` is where the sharp band sits vertically: 0.5 is the middle of the
   frame, which is where the camera keeps the active layer. */
export const GRADE = {
  blur: 0.014,    // max radius in UV — small numbers go a long way at 1440p
  focus: 0.52,
  band: 0.13,     // generous, so thin wireframes in the subject stay crisp
  falloff: 0.24,
  saturation: 0.3,
  contrast: 0.05,
  grain: 0.016,
  vignette: 0.5,
  split: 1.0,
} satisfies MaquetteGradeProps;

class MaquetteGradeEffect extends Effect {
  constructor({
    blur = GRADE.blur,
    focus = GRADE.focus,
    band = GRADE.band,
    falloff = GRADE.falloff,
    saturation = GRADE.saturation,
    contrast = GRADE.contrast,
    grain = GRADE.grain,
    vignette = GRADE.vignette,
    split = GRADE.split,
  }: MaquetteGradeProps = {}) {
    super('MaquetteGrade', fragment, {
      uniforms: new Map<string, Uniform<number>>([
        ['uBlur', new Uniform(blur)],
        ['uFocus', new Uniform(focus)],
        ['uBand', new Uniform(band)],
        ['uFalloff', new Uniform(falloff)],
        ['uSat', new Uniform(saturation)],
        ['uContrast', new Uniform(contrast)],
        ['uGrain', new Uniform(grain)],
        ['uVignette', new Uniform(vignette)],
        ['uSplit', new Uniform(split)],
      ]),
    });
  }
}

export const MaquetteGrade = wrapEffect(MaquetteGradeEffect);
