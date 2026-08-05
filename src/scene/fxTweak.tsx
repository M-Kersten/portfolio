import { useSyncExternalStore, type CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// The numbers behind the stage's atmosphere: postprocessing, the two rest/select
// lighting washes (+ fog), and the "coming alive" material dynamics shared by
// every hotspot object (LiveGlassMat/LiveEdges in maquette/materials.tsx). Edit
// FX_DEFAULTS to change the look for good; in `vite dev` a slider panel
// (top-left, below the wall tuner) lets you scrub them live and copy the result
// back in here. Same zero-dependency, DEV-gated pattern as wallTweak.tsx —
// production tree-shakes the store + panel away and just uses FX_DEFAULTS.
// ---------------------------------------------------------------------------
export interface FxConfig {
  // ---- Postprocessing (Stage's <EffectComposer>) ----
  bloomIntensity: number; // resting bloom strength
  bloomSelectBoost: number; // added on top, scaled by the select-in factor k
  bloomThreshold: number; // resting luminance threshold (lower = more glows)
  bloomThresholdSelectDrop: number; // how far the threshold falls at full select
  bloomSmoothing: number;
  bloomRadius: number;
  contrast: number;
  vignetteOffset: number;
  vignetteDarkness: number;
  scanlineDensity: number; // Scanline effect — line frequency
  scanlineOpacity: number; // 0 = off

  // ---- Lighting (Stage's rig + SelectDim's rest↔select wash) ----
  hemiIntensity: number; // resting hemisphere intensity
  hemiSelectDrop: number; // fraction it dims by at full select
  dir1Intensity: number; // resting key-light intensity
  dir1SelectDrop: number; // fraction it dims by at full select
  dir2Intensity: number; // resting accent rim-light intensity
  dir2SelectBoost: number; // added at full select
  fogNear: number;
  fogFar: number; // resting far plane
  fogFarSelectDrop: number; // the far plane pulls in by this much at full select
  fogTint: number; // resting haze tint toward the layer's air colour
  fogTintSelectBoost: number; // added at full select
  bgTintSelect: number; // background tint toward the air colour at full select

  // ---- Shared material dynamics (maquette/materials.tsx) ----
  wakeSpeed: number; // per-frame ease rate both LiveGlassMat and LiveEdges use
  roughnessBase: number; // LiveGlassMat's resting roughness
  roughnessWakeDelta: number; // how much roughness drops as an object wakes
  metalnessWake: number; // metalness gained at full wake
  dotFreq: number; // glassRim's screen-space halftone — dot size (higher = smaller/denser)
  dotStrength: number; // 0 = dots invisible
  // Blueprint pattern: swaps the halftone DOTS for graph-paper GRID lines —
  // both the screen-space pattern on glass (glassRim) and the maquette's floor
  // lattice (backdrop's PatternFloor), so the whole model reads as drawn on
  // squared paper. dotFreq/dotStrength keep driving it (spacing / contrast).
  gridMode: boolean;
  gridWidth: number; // grid line thickness (lattice cells, so it's zoom-stable)

  // ---- Palette — the blueprint ground (SelectDim pushes these into the live
  // Color objects every frame, so they scrub like the numbers do) ----
  bgColor: string; // stage background + fog base — the "paper" of the drawing
  ghostFill: string; // dormant surfaces (life.tsx GHOST_FILL) — the pencil shading
  ghostLine: string; // dormant edges/outlines (life.tsx GHOST_LINE) — the drawn line.
  // (Live wherever it's lerped per frame — the LifeGroup ghosts. A few places
  // pass it as a mount-time color prop (scaffold lattice, rocket); those pick
  // the new value up on reload.)
  rimColor: string; // fresnel silhouette ink on all glass (materials.tsx RIM)
}

export const FX_DEFAULTS: FxConfig = {
  "bloomIntensity": 0,
  "bloomSelectBoost": 0,
  "bloomThreshold": 1,
  "bloomThresholdSelectDrop": 0,
  "bloomSmoothing": 0,
  "bloomRadius": 0,
  "contrast": 0.08,
  "vignetteOffset": 0.1,
  "vignetteDarkness": 0.89,
  "scanlineDensity": 2.45,
  "scanlineOpacity": 0.1,
  "hemiIntensity": 1,
  "hemiSelectDrop": 0.72,
  "dir1Intensity": 1.59,
  "dir1SelectDrop": 0.66,
  "dir2Intensity": 1.52,
  "dir2SelectBoost": 0.4,
  "fogNear": 2.6,
  "fogFar": 16.3,
  "fogFarSelectDrop": 4.5,
  "fogTint": 0.33,
  "fogTintSelectBoost": 0.26,
  "bgTintSelect": 0.13,
  "wakeSpeed": 0.06,
  "roughnessBase": 1,
  "roughnessWakeDelta": 0.07,
  "metalnessWake": 0,
  "dotFreq": 2.15,
  "dotStrength": 0.34,
  "gridMode": false,
  "gridWidth": 0.14,
  "bgColor": "#0e272f",
  "ghostFill": "#7a8694",
  "ghostLine": "#dfe5ec",
  "rimColor": "#d9d9d9"
};

// --- DEV live store (only reached from import.meta.env.DEV branches) ---
let current: FxConfig = { ...FX_DEFAULTS };
const listeners = new Set<() => void>();
function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
function setVal<K extends keyof FxConfig>(k: K, v: FxConfig[K]) {
  current = { ...current, [k]: v };
  for (const l of listeners) l();
}
function resetAll() {
  current = { ...FX_DEFAULTS };
  for (const l of listeners) l();
}

/** The live tuned config in dev, the frozen defaults in prod. Safe to call from
 *  any component — including ones that read it inside a useFrame closure
 *  (Stage's SelectDim, materials.tsx's LiveGlassMat/LiveEdges) — since the
 *  component re-renders on change and useFrame always runs against the latest
 *  closure. */
export function useFxConfig(): FxConfig {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useSyncExternalStore(subscribe, () => current);
  }
  return FX_DEFAULTS;
}

/* ---------------------------------- panel --------------------------------- */

type NumKey = { [K in keyof FxConfig]: FxConfig[K] extends number ? K : never }[keyof FxConfig];
type BoolKey = { [K in keyof FxConfig]: FxConfig[K] extends boolean ? K : never }[keyof FxConfig];
type ColorKey = Exclude<keyof FxConfig, NumKey | BoolKey>;
type FieldSpec =
  | { k: NumKey; label: string; min: number; max: number; step: number }
  | { k: BoolKey; label: string; toggle: true }
  | { k: ColorKey; label: string; color: true };
interface Group {
  name: string;
  fields: FieldSpec[];
}
const GROUPS: Group[] = [
  {
    name: 'postprocessing',
    fields: [
      { k: 'bloomIntensity', label: 'bloom intensity', min: 0, max: 2, step: 0.01 },
      { k: 'bloomSelectBoost', label: 'bloom select boost', min: 0, max: 2, step: 0.01 },
      { k: 'bloomThreshold', label: 'bloom threshold', min: 0, max: 1, step: 0.01 },
      { k: 'bloomThresholdSelectDrop', label: 'bloom threshold drop', min: 0, max: 1, step: 0.01 },
      { k: 'bloomSmoothing', label: 'bloom smoothing', min: 0, max: 1, step: 0.01 },
      { k: 'bloomRadius', label: 'bloom radius', min: 0, max: 1, step: 0.01 },
      { k: 'contrast', label: 'contrast', min: -1, max: 1, step: 0.01 },
      { k: 'vignetteOffset', label: 'vignette offset', min: 0, max: 1, step: 0.01 },
      { k: 'vignetteDarkness', label: 'vignette darkness', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    name: 'texture',
    fields: [
      { k: 'gridMode', label: 'grid (blueprint)', toggle: true },
      { k: 'gridWidth', label: 'grid line width', min: 0.02, max: 0.45, step: 0.01 },
      { k: 'dotFreq', label: 'dot/grid spacing', min: 0.3, max: 4, step: 0.05 },
      { k: 'dotStrength', label: 'dot/grid strength', min: 0, max: 1, step: 0.01 },
      { k: 'scanlineDensity', label: 'scanline density', min: 0.25, max: 4, step: 0.05 },
      { k: 'scanlineOpacity', label: 'scanline opacity', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    name: 'lighting',
    fields: [
      { k: 'hemiIntensity', label: 'hemi intensity', min: 0, max: 1, step: 0.01 },
      { k: 'hemiSelectDrop', label: 'hemi select drop', min: 0, max: 1, step: 0.01 },
      { k: 'dir1Intensity', label: 'key light intensity', min: 0, max: 3, step: 0.01 },
      { k: 'dir1SelectDrop', label: 'key light select drop', min: 0, max: 1, step: 0.01 },
      { k: 'dir2Intensity', label: 'rim light intensity', min: 0, max: 2, step: 0.01 },
      { k: 'dir2SelectBoost', label: 'rim light select boost', min: 0, max: 2, step: 0.01 },
      { k: 'fogNear', label: 'fog near', min: 0, max: 10, step: 0.1 },
      { k: 'fogFar', label: 'fog far', min: 5, max: 30, step: 0.1 },
      { k: 'fogFarSelectDrop', label: 'fog far select drop', min: 0, max: 10, step: 0.1 },
      { k: 'fogTint', label: 'fog tint', min: 0, max: 1, step: 0.01 },
      { k: 'fogTintSelectBoost', label: 'fog tint select boost', min: 0, max: 1, step: 0.01 },
      { k: 'bgTintSelect', label: 'background tint (select)', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    name: 'shared material',
    fields: [
      { k: 'wakeSpeed', label: 'wake speed', min: 0.01, max: 0.3, step: 0.005 },
      { k: 'roughnessBase', label: 'roughness (rest)', min: 0, max: 1, step: 0.01 },
      { k: 'roughnessWakeDelta', label: 'roughness wake delta', min: 0, max: 0.5, step: 0.01 },
      { k: 'metalnessWake', label: 'metalness (awake)', min: 0, max: 0.5, step: 0.01 },
    ],
  },
  {
    name: 'palette',
    fields: [
      { k: 'bgColor', label: 'ground (bg + fog)', color: true },
      { k: 'ghostFill', label: 'ghost fill', color: true },
      { k: 'ghostLine', label: 'ghost line ink', color: true },
      { k: 'rimColor', label: 'silhouette ink', color: true },
    ],
  },
];

const panelStyle: CSSProperties = {
  position: 'fixed',
  // Below the wall tuner (WallTweakPanel sits at top:80, width 240) — this one
  // only shows while no hotspot is open (see FxTweakPanel below), so it never
  // competes with NodeTweakPanel for the top-left corner.
  top: 12,
  left: 268,
  zIndex: 9999,
  width: 250,
  maxHeight: '90vh',
  overflowY: 'auto',
  padding: '10px 12px',
  background: 'rgba(10,13,16,0.88)',
  border: '1px solid rgba(159,182,198,0.25)',
  borderRadius: 8,
  color: '#cdd9e2',
  font: '11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
  backdropFilter: 'blur(6px)',
  pointerEvents: 'auto',
};
const numStyle: CSSProperties = {
  width: 58,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(159,182,198,0.2)',
  borderRadius: 3,
  color: '#cdd9e2',
  font: 'inherit',
  padding: '1px 3px',
};
const btnStyle: CSSProperties = {
  background: 'none',
  border: '1px solid rgba(159,182,198,0.25)',
  borderRadius: 3,
  color: '#9fb6c6',
  font: 'inherit',
  cursor: 'pointer',
  padding: '3px 7px',
};

function ToggleRow({ f, value }: { f: Extract<FieldSpec, { toggle: true }>; value: boolean }) {
  return (
    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, cursor: 'pointer', color: value ? '#7fe0d0' : '#9fb6c6' }}>
      <span>{f.label}</span>
      <input type="checkbox" checked={value} onChange={(e) => setVal(f.k, e.target.checked)} style={{ cursor: 'pointer' }} />
    </label>
  );
}

function ColorRow({ f, value }: { f: Extract<FieldSpec, { color: true }>; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
      <span style={{ color: '#9fb6c6' }}>{f.label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ color: '#7f95a4' }}>{value}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => setVal(f.k, e.target.value)}
          style={{ width: 34, height: 20, padding: 0, background: 'none', border: '1px solid rgba(159,182,198,0.25)', borderRadius: 3, cursor: 'pointer' }}
        />
      </span>
    </div>
  );
}

function Row({ f, value }: { f: Extract<FieldSpec, { min: number }>; value: number }) {
  const r2 = (n: number) => Math.round(n * 1000) / 1000;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9fb6c6' }}>
        <span>{f.label}</span>
        <input
          type="number"
          step={f.step}
          value={r2(value)}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v)) setVal(f.k, v);
          }}
          style={numStyle}
        />
      </div>
      <input
        type="range"
        min={f.min}
        max={f.max}
        step={f.step}
        value={value}
        onChange={(e) => setVal(f.k, parseFloat(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  );
}

/** DEV-only stage-atmosphere scrubber: postprocessing, lighting, shared material
 *  wake dynamics. Mount once (App gates it on `import.meta.env.DEV`). */
export function FxTweakPanel() {
  const cfg = useSyncExternalStore(subscribe, () => current);
  const literal = `export const FX_DEFAULTS: FxConfig = ${JSON.stringify(cfg, null, 2)};`;
  return (
    <div style={panelStyle}>
      <div style={{ color: '#e6edf2', fontWeight: 600 }}>stage fx</div>
      <div style={{ color: '#7f95a4', marginTop: 1 }}>drag → tweak → copy into FX_DEFAULTS</div>
      {GROUPS.map((g) => (
        <div key={g.name} style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(159,182,198,0.12)' }}>
          <div style={{ color: '#7fe0d0', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}>{g.name}</div>
          {g.fields.map((f) =>
            'color' in f ? (
              <ColorRow key={f.k} f={f} value={cfg[f.k]} />
            ) : 'toggle' in f ? (
              <ToggleRow key={f.k} f={f} value={cfg[f.k]} />
            ) : (
              <Row key={f.k} f={f} value={cfg[f.k]} />
            ),
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button style={btnStyle} onClick={() => void navigator.clipboard?.writeText(literal)}>
          copy config
        </button>
        <button style={btnStyle} onClick={resetAll}>
          reset
        </button>
      </div>
    </div>
  );
}
