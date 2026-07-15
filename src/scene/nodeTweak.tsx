import { useSyncExternalStore, type CSSProperties } from 'react';
import { CAMERA, HOTSPOTS, hotspotView, type Hotspot, type HotspotView } from './framing';
import { useSceneSelector } from './store';

type Full = Required<HotspotView>;

// ---------------------------------------------------------------------------
// DEV-ONLY per-hotspot camera-view tuner. Open a node in `npm run dev` and this
// panel (bottom-left) shows sliders for THAT hotspot's close-up framing —
// offset, aim, FOV push, mobile lift. Dragging drives the live camera; `copy`
// emits a `view: { … }` literal to paste onto the hotspot in framing.ts.
//
// Same hand-rolled, zero-dependency store pattern as devTweak.tsx. Everything
// here is reached only behind `import.meta.env.DEV`, so a production build
// (where DEV is a static `false`) tree-shakes the whole module away.
// ---------------------------------------------------------------------------
const overrides = new Map<string, Full>();
const listeners = new Set<() => void>();
let version = 0;

const emit = () => {
  version += 1;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

// Lazily seed a slug's editable copy from its authored/default view.
function ensure(slug: string): Full {
  let o = overrides.get(slug);
  if (!o) {
    const h = HOTSPOTS.find((x) => x.slug === slug);
    o = h ? { ...hotspotView(h) } : { offset: [...CAMERA.nodeOffset], aimDown: CAMERA.nodeAimDown, fovZoom: CAMERA.fovZoom, mobileLift: CAMERA.mobileNodeLift };
    overrides.set(slug, o);
  }
  return o;
}

/** The live-tweaked close-up view for the camera (DEV). Until a slider is
 *  touched, this is exactly the hotspot's authored/default view. */
export function tweakedView(h: Hotspot): Full {
  return overrides.get(h.slug) ?? hotspotView(h);
}

function setOffset(slug: string, i: 0 | 1 | 2, v: number) {
  const cur = ensure(slug);
  const offset = [...cur.offset] as [number, number, number];
  offset[i] = v;
  overrides.set(slug, { ...cur, offset });
  emit();
}
function setScalar(slug: string, key: 'aimDown' | 'fovZoom' | 'mobileLift', v: number) {
  overrides.set(slug, { ...ensure(slug), [key]: v });
  emit();
}
function reset(slug: string) {
  overrides.delete(slug);
  emit();
}

/* ---------------------------------- panel --------------------------------- */

const r2 = (n: number) => Math.round(n * 100) / 100;

const panelStyle: CSSProperties = {
  position: 'fixed',
  // Top-left, above the wall panel: this only shows while a node is open (so the
  // timeline's wall panel is unobstructed the rest of the time), and a node fills
  // the centre/right of the view, clear of a left-edge panel.
  top: 12,
  left: 12,
  zIndex: 10001,
  width: 250,
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

function Row({ label, value, min, max, step = 0.05, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
      <span style={{ width: 58, color: '#9fb6c6' }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ flex: 1, minWidth: 0 }} />
      <input
        type="number"
        step={step}
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

/** DEV-only per-hotspot camera tuner. Mount once (App gates it on
 *  `import.meta.env.DEV`). Shows controls for whichever node is open. */
export function NodeTweakPanel() {
  const slug = useSceneSelector((s) => s.selectedSlug);
  useSyncExternalStore(subscribe, () => version); // re-render on any override change
  const h = slug ? HOTSPOTS.find((x) => x.slug === slug) : undefined;

  if (!h) return null; // only present while a node is open (keeps the wall panel clear)

  const v = overrides.get(h.slug) ?? hotspotView(h);
  const dirty = overrides.has(h.slug);
  const literal = `view: { offset: [${r2(v.offset[0])}, ${r2(v.offset[1])}, ${r2(v.offset[2])}], aimDown: ${r2(v.aimDown)}, fovZoom: ${r2(v.fovZoom)}, mobileLift: ${r2(v.mobileLift)} },`;

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#e6edf2', fontWeight: 600 }}>
        <span>
          node camera{dirty ? <span style={{ color: '#7fe0d0' }}> ●</span> : null}
        </span>
        <span style={{ color: '#7f95a4', fontWeight: 400 }}>{h.slug}</span>
      </div>
      <div style={{ color: '#7f95a4', marginTop: 1 }}>drag → read → paste into HOTSPOTS</div>

      <Row label="offset x" value={v.offset[0]} min={-2} max={5} onChange={(n) => setOffset(h.slug, 0, n)} />
      <Row label="offset y" value={v.offset[1]} min={-2} max={4} onChange={(n) => setOffset(h.slug, 1, n)} />
      <Row label="offset z" value={v.offset[2]} min={0.3} max={7} onChange={(n) => setOffset(h.slug, 2, n)} />
      <Row label="aimDown" value={v.aimDown} min={-1} max={3} onChange={(n) => setScalar(h.slug, 'aimDown', n)} />
      <Row label="fovZoom" value={v.fovZoom} min={-10} max={30} step={0.5} onChange={(n) => setScalar(h.slug, 'fovZoom', n)} />
      <Row label="mobileLift" value={v.mobileLift} min={0} max={4} onChange={(n) => setScalar(h.slug, 'mobileLift', n)} />

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button
          onClick={() => void navigator.clipboard?.writeText(literal)}
          title="Copy the view literal"
          style={{ flex: 1, background: 'rgba(127,224,208,0.12)', border: '1px solid rgba(127,224,208,0.4)', borderRadius: 3, color: '#bfeee6', font: 'inherit', cursor: 'pointer', padding: '2px 5px' }}
        >
          copy view
        </button>
        <button
          onClick={() => reset(h.slug)}
          title="Drop the override (back to defaults)"
          disabled={!dirty}
          style={{ background: 'none', border: '1px solid rgba(159,182,198,0.25)', borderRadius: 3, color: dirty ? '#9fb6c6' : '#4a5a66', font: 'inherit', cursor: dirty ? 'pointer' : 'default', padding: '2px 7px' }}
        >
          reset
        </button>
      </div>
    </div>
  );
}
