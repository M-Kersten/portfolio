import { useEffect, useSyncExternalStore, type CSSProperties } from 'react';

type V3 = [number, number, number];

export interface TweakInit {
  position: V3;
  /** also expose a Y-rotation slider (radians) */
  rotationY?: number;
  /** slider half-range around the seed position, world units (default 3) */
  range?: number;
}

export interface Tweaked {
  position: V3;
  rotationY: number;
}

interface Entry {
  name: string;
  position: V3;
  rotationY: number;
  hasRot: boolean;
  range: number;
}

// ---------------------------------------------------------------------------
// A tiny shared store bridging the R3F objects (which call useTweak) and the
// DOM panel (which renders the sliders). Same useSyncExternalStore pattern as
// src/scene/store.ts, so it works across the two reconcilers. Everything below
// is reached only from `import.meta.env.DEV` branches, so a production build
// tree-shakes the whole lot away (no dependency is dragged in).
// ---------------------------------------------------------------------------
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
function register(name: string, init: TweakInit) {
  if (entries.has(name)) return;
  entries.set(name, {
    name,
    position: init.position,
    rotationY: init.rotationY ?? 0,
    hasRot: init.rotationY !== undefined,
    range: init.range ?? 3,
  });
  emit();
}
function update(name: string, patch: Partial<Pick<Entry, 'position' | 'rotationY'>>) {
  const cur = entries.get(name);
  if (!cur) return;
  entries.set(name, { ...cur, ...patch }); // new object ref so snapshots compare cleanly
  emit();
}

// Cached array snapshot so useSyncExternalStore sees a stable reference between
// store changes (recomputed only when `version` bumps).
let listCache: Entry[] = [];
let listCacheVersion = -1;
function getList(): Entry[] {
  if (listCacheVersion !== version) {
    listCache = Array.from(entries.values());
    listCacheVersion = version;
  }
  return listCache;
}

/**
 * DEV-ONLY transform scrubber for placing maquette objects by eye.
 *
 * In `vite dev` this registers the object with the on-screen panel (top-right)
 * seeded at its current transform and returns the live value, so you can drag an
 * object around in the browser and copy the final coordinates straight out of
 * the panel into the source. Group objects with a dotted `name`, e.g.
 * 'Room.Desk'.
 *
 * In a production build `import.meta.env.DEV` is a static `false`, so this
 * returns the seed immediately and the entire panel + store tree-shakes out —
 * nothing ships. (Earlier this used `leva`, but its transitive deps fail Vite's
 * dep pre-bundling and it would not tree-shake; this hand-rolled panel has zero
 * dependencies.)
 *
 * Caveats:
 * - Sliders seed from the FIRST mount's values; they don't reseed if you edit
 *   the source under HMR for the same instance — do a full page refresh.
 * - Objects anchored to a hotspot (desk monitor, AR table, bookcase, park, town
 *   hall) also need their `anchor` in framing.ts updated by hand once you settle
 *   a new position, or the leader line points at the old spot.
 */
export function useTweak(name: string, init: TweakInit): Tweaked {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      register(name, init);
      // Rigs stay mounted for the session, so we never unregister — keeps the
      // panel list stable. (init intentionally read once at register time.)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name]);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const entry = useSyncExternalStore(subscribe, () => entries.get(name));
    if (entry) return { position: entry.position, rotationY: entry.rotationY };
  }
  return { position: init.position, rotationY: init.rotationY ?? 0 };
}

/* ---------------------------------- panel --------------------------------- */

const r2 = (n: number) => Math.round(n * 100) / 100;

const panelStyle: CSSProperties = {
  position: 'fixed',
  top: 12,
  right: 12,
  zIndex: 9999,
  width: 248,
  maxHeight: '90vh',
  overflowY: 'auto',
  padding: '10px 12px',
  background: 'rgba(10,13,16,0.86)',
  border: '1px solid rgba(159,182,198,0.25)',
  borderRadius: 8,
  color: '#cdd9e2',
  font: '11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
  backdropFilter: 'blur(6px)',
  pointerEvents: 'auto',
};
const numStyle: CSSProperties = {
  width: 52,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(159,182,198,0.2)',
  borderRadius: 3,
  color: '#cdd9e2',
  font: 'inherit',
  padding: '1px 3px',
};

function Axis({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
      <span style={{ width: 14, color: '#9fb6c6' }}>{label}</span>
      <input type="range" min={min} max={max} step={0.01} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ flex: 1, minWidth: 0 }} />
      <input
        type="number"
        step={0.01}
        value={r2(value)}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
        style={numStyle}
      />
    </div>
  );
}

function EntryRow({ e }: { e: Entry }) {
  const setAxis = (i: 0 | 1 | 2, v: number) => {
    const p = [...e.position] as V3;
    p[i] = v;
    update(e.name, { position: p });
  };
  const literal = e.hasRot
    ? `position={[${r2(e.position[0])}, ${r2(e.position[1])}, ${r2(e.position[2])}]} rotation={[0, ${r2(e.rotationY)}, 0]}`
    : `position={[${r2(e.position[0])}, ${r2(e.position[1])}, ${r2(e.position[2])}]}`;
  return (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(159,182,198,0.12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#e6edf2' }}>
        <span>{e.name}</span>
        <button
          onClick={() => void navigator.clipboard?.writeText(literal)}
          title="Copy JSX props"
          style={{ background: 'none', border: '1px solid rgba(159,182,198,0.25)', borderRadius: 3, color: '#9fb6c6', font: 'inherit', cursor: 'pointer', padding: '0 5px' }}
        >
          copy
        </button>
      </div>
      <Axis label="x" value={e.position[0]} min={e.position[0] - e.range} max={e.position[0] + e.range} onChange={(v) => setAxis(0, v)} />
      <Axis label="y" value={e.position[1]} min={e.position[1] - e.range} max={e.position[1] + e.range} onChange={(v) => setAxis(1, v)} />
      <Axis label="z" value={e.position[2]} min={e.position[2] - e.range} max={e.position[2] + e.range} onChange={(v) => setAxis(2, v)} />
      {e.hasRot && <Axis label="r" value={e.rotationY} min={e.rotationY - Math.PI} max={e.rotationY + Math.PI} onChange={(v) => update(e.name, { rotationY: v })} />}
    </div>
  );
}

/** DEV-only object-placement panel. Mount once (App gates it on
 *  `import.meta.env.DEV`). Lists every object that called `useTweak`. */
export function DevTweakPanel() {
  const list = useSyncExternalStore(subscribe, getList);
  return (
    <div style={panelStyle}>
      <div style={{ color: '#e6edf2', fontWeight: 600 }}>maquette tweaks</div>
      <div style={{ color: '#7f95a4', marginTop: 1 }}>drag → read coords → paste into source</div>
      {list.length === 0 && <div style={{ marginTop: 10, color: '#7f95a4' }}>scroll the scene to load objects…</div>}
      {list.map((e) => (
        <EntryRow key={e.name} e={e} />
      ))}
    </div>
  );
}
