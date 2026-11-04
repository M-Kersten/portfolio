import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref, type RefObject } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, Bloom, BrightnessContrast, Vignette, Scanline } from '@react-three/postprocessing';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, type DirectionalLight, type Fog, type HemisphereLight, type Material, type Mesh, type Object3D } from 'three';
import { BloomEffect, type EffectComposer as EffectComposerImpl } from 'postprocessing';
import { useReducedMotion } from '../lib/media';
import { isLiteDevice } from '../lib/media';
import { useSceneSelector } from './store';
import { fitScale, type Hotspot } from './framing';
import { CameraRig } from './CameraRig';
import { Maquette } from './maquette/index';
import { GHOST_FILL, GHOST_LINE } from './maquette/life';
import { RIM, DOT_TUNE } from './maquette/materials';
import { ShadeLight } from './maquette/lit';
import { useLook } from './look';
import { compileInBatches, whenQuiet } from './warm';
import { maquetteLoaded } from './maquette/kit';
import { LAYER_HEX } from '../content';

// The layer accents — each layer has its own "air", and the whole stage washes
// further toward it when a node in it is picked.
const LAYER_BY_STEP = ['city', 'room', 'chip'] as const;
// phones and tablets: the launch's bloom at half resolution
const LITE = isLiteDevice();
/** The launch's bloom, and how long after the site completes it joins the
 *  effect chain (at a quiet moment — see useBloom). */
const BLOOM = 1.15;
const BLOOM_JOIN = 1500;
const noBlur = () => {};
/** How long after the models are in before the not-yet-drawn is compiled. */
const REST_WAIT = 2500;

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
  const cfg = useLook();
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const d = useRef(0);
  const bg = useMemo(() => new Color(), []); // set from cfg.bgColor every frame below
  const tmp = useMemo(() => new Color(), []);
  // The resting air colour — eased toward the active layer's accent, so it also
  // holds through a fade-out (journeyStep tracks the layer you left from) with
  // no snap back to cyan.
  const air = useMemo(() => new Color(LAYER_HEX.city), []);
  useFrame(() => {
    // The palette rides the frame loop so the dev tools' colour swatches scrub
    // the whole scene live: `bg` feeds the fog/background lerps below, and
    // GHOST_FILL / RIM are the shared Color objects every dormant material and
    // compiled glass shader already reads from. In production these are the
    // LOOK as written, so the sets are constant (and cheap either way).
    bg.set(cfg.bgColor);
    GHOST_FILL.set(cfg.ghostFill);
    GHOST_LINE.set(cfg.ghostLine);
    RIM.set(cfg.rimColor);
    const target = selected ? 1 : 0;
    d.current += (target - d.current) * (reduced ? 1 : 0.07);
    const k = d.current;
    // ease the air toward the active layer's accent (a cross-fade of atmosphere
    // as you scroll between layers, not a snap)
    tmp.set(LAYER_HEX[LAYER_BY_STEP[journeyStep] ?? 'city']);
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
  const cfg = useLook();
  // only whether a launch is on: the stage re-renders (and its effect chain is
  // put together again) when that flips, not at every step of the count
  const launchOn = useSceneSelector((s) => s.launch !== 'idle');
  // No MSAA while the launch runs (its smoke's overdraw stalled GPUs into a
  // lost context). Switched on the composer in place: as a prop it built a
  // whole new composer, its passes and their shaders, the moment the pad
  // opened and again when it closed.
  const composer = useRef<EffectComposerImpl>(null);
  useEffect(() => {
    if (composer.current) composer.current.multisampling = launchOn ? 0 : 2;
  }, [launchOn]);
  const bloom = useBloom(launchOn);
  useWarmRest();

  // The halftone's two knobs live on every compiled glass shader as the same
  // shared uniform objects (see DOT_TUNE) — mutate `.value` in place here on
  // change rather than a per-frame loop, since (unlike SelectDim's washes)
  // these don't animate on their own.
  useEffect(() => {
    DOT_TUNE.freq.value = cfg.dotFreq;
    DOT_TUNE.strength.value = cfg.dotStrength;
  }, [cfg.dotFreq, cfg.dotStrength]);

  return (
    <>
      <color attach="background" args={[cfg.bgColor]} />
      {/* Subtle depth haze so the layers behind the active one recede. */}
      <fog attach="fog" args={[cfg.bgColor, cfg.fogNear, cfg.fogFar]} />
      <hemisphereLight ref={hemi} intensity={cfg.hemiIntensity} color="#aebfd6" groundColor={cfg.bgColor} />
      <directionalLight ref={dir1} position={[6, 11, 4]} intensity={1.1} color="#eaf2ff" />
      <directionalLight ref={dir2} position={[-7, 4, -6]} intensity={0.5} color="#27e8f2" />
      <SelectDim hemi={hemi} dir1={dir1} dir2={dir2} />
      {/* The hover light: adds no light of its own, only the shadows and the
          direction the lit halftone reads (maquette/lit.tsx). */}
      <ShadeLight />

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
          of the frame where the maquette lives, and a faint scanline. Bloom used
          to lead this chain; it had been tuned to nothing, so it built a mipmap
          blur every frame and composited black over the result. It's back for
          the launch (useBloom): a high threshold, so only the fire — drawn
          hotter than white — blooms. */}
      <EffectComposer ref={composer} enableNormalPass={false} multisampling={2}>
        {/* (the wrapper types its ref as the class; what it hands over is the instance) */}
        {bloom.on ? <Bloom ref={bloom.ref as unknown as Ref<typeof BloomEffect>} mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={BLOOM} radius={0.72} resolutionScale={LITE ? 0.5 : 1} /> : <></>}
        <BrightnessContrast contrast={cfg.contrast} />
        <Vignette eskil={false} offset={cfg.vignetteOffset} darkness={cfg.vignetteDarkness} />
        <Scanline density={cfg.scanlineDensity} opacity={cfg.scanlineOpacity} />
      </EffectComposer>
    </>
  );
}

/* The launch's bloom. Adding it to the chain builds the chain's shader again,
   and its own blur shaders draw for the first time; done as the pad opened,
   that was part of the first-launch stall. So it joins once the site is
   complete, at a quiet moment, draws one frame (at no strength) to get its
   shaders built, and then waits: between launches its blur isn't drawn and it
   adds nothing to the picture. If a launch starts before then, it joins then. */
function useBloom(launchOn: boolean) {
  const complete = useSceneSelector((s) => s.celebrateAt !== null);
  const [joined, setJoined] = useState(false);
  useEffect(() => {
    if (!complete) {
      setJoined(false);
      return;
    }
    return whenQuiet(() => setJoined(true), BLOOM_JOIN);
  }, [complete]);
  const on = joined || launchOn;
  const ref = useRef<BloomEffect>(null);
  const built = useRef<BloomEffect | null>(null); // the one whose shaders have been drawn with
  // before the frame it's drawn in
  useLayoutEffect(() => {
    const b = ref.current;
    if (!b) return;
    if (launchOn) {
      delete (b as { update?: unknown }).update; // its own again
      b.intensity = BLOOM;
      built.current = b;
    } else {
      b.intensity = 0;
      b.update =
        built.current === b
          ? noBlur
          : // one real pass, which builds its shaders, then none
            (...args) => {
              BloomEffect.prototype.update.apply(b, args);
              b.update = noBlur;
              built.current = b;
            };
    }
  }, [launchOn, on]);
  return { on, ref };
}

/* Whatever is in the scene but has never been drawn — the parts of an exhibit
   that only show in its close-up, a model that arrived after the opening's
   compile (CameraRig), everything on a phone, which has no opening dolly to
   hide that compile behind — is compiled at its first draw: a stall at the
   moment it appears. So once the models are in and the page is quiet, all of
   it is compiled ahead, a batch per idle slice (warm.ts). */
function useWarmRest() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    let live = true;
    let cancel = () => {};
    let batches = () => {};
    maquetteLoaded().then(() => {
      if (!live) return;
      cancel = whenQuiet(() => {
        const cold: Object3D[] = [];
        scene.traverse((o) => {
          const raw = (o as Mesh).material as Material | Material[] | undefined;
          if (raw && (Array.isArray(raw) ? raw : [raw]).some((m) => !(gl.properties.get(m) as { programs?: unknown }).programs)) cold.push(o);
        });
        batches = compileInBatches(gl, camera, cold, scene);
      }, REST_WAIT);
    });
    return () => {
      live = false;
      cancel();
      batches();
    };
  }, [gl, scene, camera]);
}
