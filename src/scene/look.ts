import { tunable, useTuned } from '../dev/tuning';

// The look of the 3D stage: the post-processing, the two lighting washes (at
// rest, and with an exhibit picked) and the fog, the "coming alive" material
// dynamics every exhibit shares, and the blueprint palette. Change the numbers
// here to change the look for good; in `npm run dev` the dev tools' Look tab
// scrubs them live and copies the result back out.

export interface Look {
  // ---- Post-processing (Stage's <EffectComposer>) ----
  contrast: number;
  vignetteOffset: number;
  vignetteDarkness: number;
  scanlineDensity: number; // line frequency
  scanlineOpacity: number; // 0 = off

  // ---- Lighting (Stage's rig, and SelectDim's rest ↔ picked wash) ----
  hemiIntensity: number; // resting hemisphere light
  hemiSelectDrop: number; // fraction it dims by with an exhibit picked
  dir1Intensity: number; // resting key light
  dir1SelectDrop: number; // fraction it dims by with an exhibit picked
  dir2Intensity: number; // resting accent rim light
  dir2SelectBoost: number; // added with an exhibit picked
  fogNear: number;
  fogFar: number; // resting far plane
  fogFarSelectDrop: number; // the far plane pulls in by this much when picked
  fogTint: number; // resting haze tint toward the layer's air colour
  fogTintSelectBoost: number; // added when picked
  bgTintSelect: number; // background tint toward the air colour when picked

  // ---- Shared material dynamics (maquette/materials.tsx) ----
  wakeSpeed: number; // per-frame ease rate for an exhibit coming alive
  roughnessBase: number; // the glass's resting roughness
  roughnessWakeDelta: number; // how much roughness drops as an exhibit wakes
  dotFreq: number; // the glass's screen-space halftone: higher = smaller, denser dots
  dotStrength: number; // 0 = dots invisible

  // ---- Palette: the blueprint ground (Stage pushes these into the shared
  // Color objects every frame, so they scrub like the numbers do) ----
  bgColor: string; // stage background + fog: the "paper" of the drawing
  ghostFill: string; // dormant surfaces: the pencil shading
  ghostLine: string; // dormant edges and outlines: the drawn line
  rimColor: string; // the fresnel silhouette ink on all glass
}

export const LOOK = tunable<Look>({
  contrast: 0.08,
  vignetteOffset: 0.1,
  vignetteDarkness: 0.89,
  scanlineDensity: 2.45,
  scanlineOpacity: 0.1,
  hemiIntensity: 1,
  hemiSelectDrop: 0.72,
  dir1Intensity: 1.59,
  dir1SelectDrop: 0.66,
  dir2Intensity: 1.52,
  dir2SelectBoost: 0.4,
  fogNear: 2.6,
  fogFar: 16.3,
  fogFarSelectDrop: 4.5,
  fogTint: 0.33,
  fogTintSelectBoost: 0.26,
  bgTintSelect: 0.13,
  wakeSpeed: 0.06,
  roughnessBase: 1,
  roughnessWakeDelta: 0.07,
  dotFreq: 2.15,
  dotStrength: 0.34,
  bgColor: '#0e272f',
  ghostFill: '#7a8694',
  ghostLine: '#dfe5ec',
  rimColor: '#d9d9d9',
});

/** The stage's look: live in dev, as written in production. */
export const useLook = () => useTuned(LOOK);
