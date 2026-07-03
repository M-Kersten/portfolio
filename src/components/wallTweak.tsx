import { useSyncExternalStore, type CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// The numbers that lay the project tiles onto the wall/map. Edit WALL_DEFAULTS
// to change the layout for good; in `vite dev` a slider panel (top-left) lets
// you scrub them live and copy the result back in here. Same zero-dependency,
// DEV-gated pattern as scene/devTweak.tsx — production tree-shakes the store +
// panel away and just uses WALL_DEFAULTS.
// ---------------------------------------------------------------------------
export interface WallConfig {
  cardW: number; // tile width in px
  planeVh: number; // plane height in viewports (how far it descends as you scroll)
  startX: number; // left margin before the first tile (px)
  gapMin: number; // minimum horizontal gap after a tile (px, on top of cardW)
  gapJitter: number; // extra random horizontal gap (px)
  topStart: number; // vertical position of the first tile (% of plane height)
  topSlope: number; // extra % the tiles descend across the whole wall
  topJitter: number; // random vertical scatter, ± this many %
  topMin: number; // clamp — highest a tile may sit (min %)
  topMax: number; // clamp — lowest a tile may sit (max %)
  stackChance: number; // 0–1 — how often a column holds two tiles, stacked
  stackGap: number; // vertical spread of a stacked pair, ± this many % from centre
  rot: number; // random tile rotation, ± this many degrees
  parallax: number; // dot-field drift vs tiles (0 = fixed, 1 = moves with them)
  seed: number; // RNG seed for the scatter — change it to reshuffle
}

export const WALL_DEFAULTS: WallConfig = {
  cardW: 320,
  planeVh: 2,
  startX: 56,
  gapMin: 80,
  gapJitter: 150,
  topStart: 6,
  topSlope: 52,
  topJitter: 17,
  topMin: 3,
  topMax: 78,
  stackChance: 0.45,
  stackGap: 15,
  rot: 4.6,
  parallax: 0.72,
  seed: 9137,
};

// --- DEV live store (only reached from import.meta.env.DEV branches) ---
let current: WallConfig = { ...WALL_DEFAULTS };
const listeners = new Set<() => void>();
function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
function setVal(k: keyof WallConfig, v: number) {
  current = { ...current, [k]: v };
  for (const l of listeners) l();
}

/** The live layout config: the tweakable store in dev, the frozen defaults in prod. */
export function useWallConfig(): WallConfig {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useSyncExternalStore(subscribe, () => current);
  }
  return WALL_DEFAULTS;
}

/* ---------------------------------- panel --------------------------------- */

interface FieldSpec {
  k: keyof WallConfig;
  label: string;
  min: number;
  max: number;
  step: number;
}
const FIELDS: FieldSpec[] = [
  { k: 'cardW', label: 'tile width', min: 140, max: 480, step: 10 },
  { k: 'planeVh', label: 'plane height (vh)', min: 1, max: 3.2, step: 0.05 },
  { k: 'startX', label: 'left margin', min: 0, max: 240, step: 4 },
  { k: 'gapMin', label: 'gap min', min: 0, max: 320, step: 5 },
  { k: 'gapJitter', label: 'gap jitter', min: 0, max: 400, step: 10 },
  { k: 'topStart', label: 'top start %', min: 0, max: 50, step: 1 },
  { k: 'topSlope', label: 'top slope %', min: 0, max: 90, step: 1 },
  { k: 'topJitter', label: 'top jitter ±%', min: 0, max: 45, step: 1 },
  { k: 'topMin', label: 'clamp min %', min: 0, max: 40, step: 1 },
  { k: 'topMax', label: 'clamp max %', min: 40, max: 98, step: 1 },
  { k: 'stackChance', label: 'stack chance', min: 0, max: 1, step: 0.05 },
  { k: 'stackGap', label: 'stack gap ±%', min: 0, max: 40, step: 1 },
  { k: 'rot', label: 'rotation ±°', min: 0, max: 16, step: 0.2 },
  { k: 'parallax', label: 'dot parallax', min: 0, max: 1, step: 0.02 },
  { k: 'seed', label: 'seed', min: 1, max: 99999, step: 1 },
];

const panelStyle: CSSProperties = {
  position: 'fixed',
  top: 80,
  left: 12,
  zIndex: 9999,
  width: 240,
  maxHeight: '82vh',
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

function Row({ f, value }: { f: FieldSpec; value: number }) {
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

/** DEV-only wall-layout scrubber. App gates it on import.meta.env.DEV. */
export function WallTweakPanel() {
  const cfg = useSyncExternalStore(subscribe, () => current);
  const literal = `export const WALL_DEFAULTS: WallConfig = ${JSON.stringify(cfg, null, 2)};`;
  return (
    <div style={panelStyle}>
      <div style={{ color: '#e6edf2', fontWeight: 600 }}>wall layout</div>
      <div style={{ color: '#7f95a4', marginTop: 1 }}>drag → tweak → copy into WALL_DEFAULTS</div>
      {FIELDS.map((f) => (
        <Row key={f.k} f={f} value={cfg[f.k]} />
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button style={btnStyle} onClick={() => void navigator.clipboard?.writeText(literal)}>
          copy config
        </button>
        <button style={btnStyle} onClick={() => setVal('seed', Math.floor(Math.random() * 99999) + 1)}>
          reshuffle
        </button>
        <button
          style={btnStyle}
          onClick={() => {
            for (const f of FIELDS) setVal(f.k, WALL_DEFAULTS[f.k]);
          }}
        >
          reset
        </button>
      </div>
    </div>
  );
}
