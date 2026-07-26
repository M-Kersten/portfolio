import { Uniform } from 'three';
import { Effect } from 'postprocessing';
import { wrapEffect } from '@react-three/postprocessing';

// The maquette's grade, in one merged pass: a filmic shoulder so accents roll off
// instead of clipping, a teal/amber split tone, a saturation lift, fine grain so
// the frame reads as a photographed image rather than a viewport, and the vignette.
//
// This replaces BrightnessContrast + Vignette rather than stacking on them, and
// postprocessing merges plain effects into a single fragment shader — so the whole
// look costs no extra pass and no extra render target.
//
// HISTORY: this also carried a tilt-shift focal band (a blur growing with distance
// from a horizontal band, using screen Y as a depth proxy). It was cheap and it did
// separate the layers, but it read badly on the actual maquette — thin wireframes
// don't survive being smeared, they just go muddy. Removed deliberately; don't
// re-add it without looking at a real frame first.

const fragment = /* glsl */ `
uniform float uSat;
uniform float uContrast;
uniform float uGrain;
uniform float uVignette;
uniform float uSplit;   // teal-in-shadow / amber-in-highlight strength

float mg_luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float mg_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;

  float l = mg_luma(c);
  c = mix(vec3(l), c, 1.0 + uSat);          // let the layer accents sing

  c = c / (c + 0.78) * 1.42;                // filmic shoulder: highlights roll off
  c = (c - 0.5) * (1.0 + uContrast) + 0.5;

  // split tone — cool the shadows, warm the few hot spots
  c *= mix(vec3(0.90, 1.01, 1.09), vec3(1.0), smoothstep(0.0, 0.55, l));
  c += vec3(0.055, 0.024, 0.0) * uSplit * pow(mg_luma(c), 2.2);

  c += (mg_hash(uv * resolution + fract(time) * 431.0) - 0.5) * uGrain;

  vec2 vd = uv - 0.5;
  vd.x *= 1.08;
  c *= 1.0 - uVignette * dot(vd, vd) * 2.1;

  outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
}
`;

export interface MaquetteGradeProps {
  saturation?: number;
  contrast?: number;
  grain?: number;
  vignette?: number;
  split?: number;
}

/* The dial. Everything about the look lives here — nudge these, not the shader. */
export const GRADE = {
  saturation: 0.3,
  contrast: 0.05,
  grain: 0.016,
  vignette: 0.5,
  split: 1.0,
} satisfies MaquetteGradeProps;

class MaquetteGradeEffect extends Effect {
  constructor({
    saturation = GRADE.saturation,
    contrast = GRADE.contrast,
    grain = GRADE.grain,
    vignette = GRADE.vignette,
    split = GRADE.split,
  }: MaquetteGradeProps = {}) {
    super('MaquetteGrade', fragment, {
      uniforms: new Map<string, Uniform<number>>([
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
