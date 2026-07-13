import { useSyncExternalStore, type CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// The numbers that lay the project tiles onto the wall/map. Edit WALL_DEFAULTS
// to change the layout for good; in `vite dev` a slider panel (top-left) lets
// you scrub them live and copy the result back in here. Same zero-dependency,
// DEV-gated pattern as scene/devTweak.tsx — production tree-shakes the store +
// panel away and just uses WALL_DEFAULTS.
// ---------------------------------------------------------------------------
export interface WallConfig {
  cardW: number; // waypoint card width in px
  planeVh: number; // plane height in viewports (≈1 → the timeline pans horizontally)
  startX: number; // left margin before the first year (px)
  yearGap: number; // horizontal distance between consecutive years (px)
  rise: number; // gap between the route line and a card's near edge (% of plane height)
  parallax: number; // dot-field drift vs the timeline (0 = fixed, 1 = moves with it)

  // ---- Motion feel (velocity-driven; 0 disables the effect) ----
  dollyZoom: number; // how far the wall pulls back at full pan speed (0.05 = to 95%)
  dollyTilt: number; // backward tilt (deg) at full speed (needs perspective)
  motionEase: number; // response (higher = snappier, lower = floatier)
}

const WALL_DEFAULTS: WallConfig = {
  cardW: 250,
  planeVh: 1,
  startX: 210,
  yearGap: 360,
  rise: 6,
  parallax: 0.72,

  dollyZoom: 0.04,
  dollyTilt: 1.1,
  motionEase: 0.12,
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
  { k: 'cardW', label: 'card width', min: 160, max: 380, step: 5 },
  { k: 'planeVh', label: 'plane height (vh)', min: 1, max: 2, step: 0.05 },
  { k: 'startX', label: 'left margin', min: 40, max: 400, step: 10 },
  { k: 'yearGap', label: 'year spacing', min: 160, max: 560, step: 10 },
  { k: 'rise', label: 'route → card %', min: 0, max: 20, step: 0.5 },
  { k: 'parallax', label: 'dot parallax', min: 0, max: 1, step: 0.02 },
  { k: 'dollyZoom', label: 'dolly zoom', min: 0, max: 0.15, step: 0.005 },
  { k: 'dollyTilt', label: 'dolly tilt °', min: 0, max: 6, step: 0.1 },
  { k: 'motionEase', label: 'motion response', min: 0.03, max: 0.3, step: 0.01 },
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
