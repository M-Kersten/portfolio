import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, BrightnessContrast, Vignette, Scanline } from '@react-three/postprocessing';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, type DirectionalLight, type Fog, type HemisphereLight } from 'three';
import { useReducedMotion } from '../lib/useReducedMotion';
import { useSceneSelector } from './store';
import { fitScale, type Hotspot } from './framing';
import { CameraRig } from './CameraRig';
import { Maquette } from './maquette';
import { GHOST_FILL, GHOST_LINE } from './maquette/life';
import { RIM, DOT_TUNE } from './maquette/materials';
import { useFxConfig } from './fxTweak';

// The layer accents — each layer has its own "air", and the whole stage washes
// further toward it when a node in it is picked.
const LAYER_ACCENT: Record<string, string> = { city: '#27e8f2', room: '#ff9068', chip: '#a9f75c' };
const LAYER_BY_STEP = ['city', 'room', 'chip'];
const RIM_HEX = '#27e8f2'; // city cyan — the fallback / starting air

// Two coupled washes give the maquette its atmosphere:
//   1. Air (by scroll): the fog, background and rim light ease toward the ACTIVE
//      layer's accent, so descending City→Room→Chip cross-fades the atmosphere
//      cyan → coral → lime. Kept a whisper at rest — the layers should *feel*
//      different, not look tinted.
//   2. Pick (on select): the same colour deepens and the fill lights drop, so
//      the emissive object stays the brightest thing and the scene glows around
//      the pick.
function SelectDim({ hemi, dir1, dir2 }: {
  hemi: RefObject<HemisphereLight | null>;
  dir1: RefObject<DirectionalLight | null>;
  dir2: RefObject<DirectionalLight | null>;
}) {
  const selected = useSceneSelector((s) => s.selectedSlug);
  const journeyStep = useSceneSelector((s) => s.journeyStep);
  const reduced = useReducedMotion();
  const cfg = useFxConfig();
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const d = useRef(0);
  const bg = useMemo(() => new Color(), []); // set from cfg.bgColor every frame below
  const tmp = useMemo(() => new Color(), []);
  // The resting air colour — eased toward the active layer's accent, so it also
  // holds through a fade-out (journeyStep tracks the layer you left from) with
  // no snap back to cyan.
  const air = useMemo(() => new Color(RIM_HEX), []);
  useFrame(() => {
    // The palette rides the frame loop so the fx panel's colour swatches scrub
    // the whole scene live: `bg` feeds the fog/background lerps below, and
    // GHOST_FILL / RIM are the shared Color objects every dormant material and
    // compiled glass shader already reads from. In production these are the
    // frozen FX_DEFAULTS, so the sets are constant (and cheap either way).
    bg.set(cfg.bgColor);
    GHOST_FILL.set(cfg.ghostFill);
    GHOST_LINE.set(cfg.ghostLine);
    RIM.set(cfg.rimColor);
    const target = selected ? 1 : 0;
    d.current += (target - d.current) * (reduced ? 1 : 0.07);
    const k = d.current;
    // ease the air toward the active layer's accent (a cross-fade of atmosphere
    // as you scroll between layers, not a snap)
    tmp.set(LAYER_ACCENT[LAYER_BY_STEP[journeyStep] ?? 'city'] ?? RIM_HEX);
    if (reduced) air.copy(tmp);
    else air.lerp(tmp, 0.045);

    if (hemi.current) hemi.current.intensity = cfg.hemiIntensity * (1 - cfg.hemiSelectDrop * k);
    if (dir1.current) dir1.current.intensity = cfg.dir1Intensity * (1 - cfg.dir1SelectDrop * k);
    if (dir2.current) {
      dir2.current.intensity = cfg.dir2Intensity + cfg.dir2SelectBoost * k; // the accent rim grows on select
      dir2.current.color.copy(air); // the rim light itself carries the layer air
    }
    const fog = scene.fog as Fog | null;
    if (fog) {
      // The camera eases back on narrow screens (CameraRig/fitScale), so scale
      // the fog band with it — otherwise the pulled-back subject hazes out.
      const fit = fitScale(size.width / size.height);
      fog.near = cfg.fogNear * fit;
      fog.far = (cfg.fogFar - cfg.fogFarSelectDrop * k) * fit;
      // the haze carries the layer's colour — it only tints where there's depth
      // (behind/around the objects), never the empty black sky, so each layer
      // gets its own air without washing the frame. Deepens on select.
      fog.color.copy(bg).lerp(air, cfg.fogTint + cfg.fogTintSelectBoost * k);
    }
    // background frame: near-black at rest, tinting only as a node is picked (the
    // scene glowing around the pick) — never a resting colour wash
    if (scene.background instanceof Color) scene.background.copy(bg).lerp(air, cfg.bgTintSelect * k);
  });
  return null;
}

// In-canvas scene root. Dark stage with a cyan rim light; the procedural
// Lightformer environment means no external HDR fetch (nothing for a corporate
// firewall to block — §12).

export function Stage({ onActivate }: { onActivate: (h: Hotspot) => void }) {
  const hemi = useRef<HemisphereLight>(null);
  const dir1 = useRef<DirectionalLight>(null);
  const dir2 = useRef<DirectionalLight>(null);
  const cfg = useFxConfig();

  // The halftone's two knobs live on every compiled glass shader as the same
  // shared uniform objects (see DOT_TUNE) — mutate `.value` in place here on
  // change rather than a per-frame loop, since (unlike SelectDim's washes)
  // these don't animate on their own.
  useEffect(() => {
    DOT_TUNE.freq.value = cfg.dotFreq;
    DOT_TUNE.strength.value = cfg.dotStrength;
    DOT_TUNE.grid.value = cfg.gridMode ? 1 : 0;
    DOT_TUNE.gridWidth.value = cfg.gridWidth;
  }, [cfg.dotFreq, cfg.dotStrength, cfg.gridMode, cfg.gridWidth]);

  return (
    <>
      <color attach="background" args={[cfg.bgColor]} />
      {/* Subtle depth haze so the layers behind the active one recede. */}
      <fog attach="fog" args={[cfg.bgColor, cfg.fogNear, cfg.fogFar]} />
      <hemisphereLight ref={hemi} intensity={cfg.hemiIntensity} color="#aebfd6" groundColor={cfg.bgColor} />
      <directionalLight ref={dir1} position={[6, 11, 4]} intensity={1.1} color="#eaf2ff" />
      <directionalLight ref={dir2} position={[-7, 4, -6]} intensity={0.5} color="#27e8f2" />
      <SelectDim hemi={hemi} dir1={dir1} dir2={dir2} />

      {/* Reflections come almost entirely from this procedural environment; kept
          gentle so glossy surfaces catch a soft sheen rather than a hot mirror
          blob. */}
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={0.55} position={[5, 6, 4]} scale={9} color="#cfe0ff" />
        <Lightformer intensity={0.4} position={[-6, 3, -4]} scale={9} color="#27e8f2" />
        <Lightformer intensity={0.28} position={[3, 2, -6]} scale={8} color="#a89eff" />
        <Lightformer intensity={0.3} position={[0, -5, 0]} scale={12} color="#0a0d10" />
      </Environment>

      <CameraRig />

      <Maquette onActivate={onActivate} />

      {/* A touch more contrast, a soft vignette pooling the light in the centre
          of the frame where the maquette lives, and a faint scanline.

          Bloom used to lead this chain and is gone. It had been tuned to
          nothing — intensity, radius, smoothing and select-boost all at 0, with
          the luminance threshold at 1 — so it built a mipmap blur chain every
          frame and composited a black image over the result. The ignition and
          celebration surges that drove its intensity went with it: they were
          already invisible, since a bloom of radius 0 has nothing to spread. */}
      <EffectComposer enableNormalPass={false} multisampling={2}>
        <BrightnessContrast contrast={cfg.contrast} />
        <Vignette eskil={false} offset={cfg.vignetteOffset} darkness={cfg.vignetteDarkness} />
        <Scanline density={cfg.scanlineDensity} opacity={cfg.scanlineOpacity} />
      </EffectComposer>
    </>
  );
}
