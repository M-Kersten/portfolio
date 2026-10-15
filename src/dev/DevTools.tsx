import { useState, type CSSProperties, type ReactNode } from 'react';
import { LOOK, type Look } from '../scene/look';
import { HOTSPOTS, hotspotView } from '../scene/framing';
import { useSceneSelector } from '../scene/store';
import { WALL, type WallLayout } from '../components/timeline/layout';
import { PLACEMENTS, VIEWS, useTuned, type PlacementEntry } from './tuning';
import { remember, remembered } from '../lib/page';

// The dev tools: one panel, only in `npm run dev` (App mounts it behind
// import.meta.env.DEV, so none of this ships). Folded to a small "tune" chip
// in the corner until you open it. Each tab scrubs one set of numbers live and
// copies the result back out as source to paste over the original:
//
//   Look      the 3D stage's lighting, fog, post-processing and palette
//             → LOOK in src/scene/look.ts
//   Timeline  the timeline's spacing → WALL in src/components/timeline/layout.ts
//   Camera    the close-up on the exhibit that's open → its `view` in
//             HOTSPOTS, src/scene/framing.ts
//   Objects   where the movable objects in the maquette stand → the
//             usePlacement(...) call in that layer's rig

type Tab = 'look' | 'timeline' | 'camera' | 'objects';
const TABS: Tab[] = ['look', 'timeline', 'camera', 'objects'];
const STATE_KEY = 'mk-devtools';

function saved(): { open: boolean; tab: Tab } {
  try {
    return { open: false, tab: 'look', ...JSON.parse(remembered(STATE_KEY) ?? '{}') };
  } catch {
    return { open: false, tab: 'look' };
  }
}

export function DevTools() {
  const [state, setState] = useState(saved);
  const update = (patch: Partial<typeof state>) => {
    const next = { ...state, ...patch };
    setState(next);
    remember(STATE_KEY, JSON.stringify(next));
  };

  if (!state.open) {
    return (
      <button type="button" style={{ ...S.panel, ...S.chip }} onClick={() => update({ open: true })} title="Open the dev tools">
        ⚙ tune
      </button>
    );
  }
  return (
    <div style={S.panel}>
      <div style={S.head}>
        {TABS.map((t) => (
          <button key={t} type="button" style={t === state.tab ? { ...S.tab, ...S.tabOn } : S.tab} onClick={() => update({ tab: t })}>
            {t}
          </button>
        ))}
        <button type="button" style={{ ...S.tab, marginLeft: 'auto' }} onClick={() => update({ open: false })} title="Fold away">
          ✕
        </button>
      </div>
      {state.tab === 'look' && <LookTab />}
      {state.tab === 'timeline' && <TimelineTab />}
      {state.tab === 'camera' && <CameraTab />}
      {state.tab === 'objects' && <ObjectsTab />}
    </div>
  );
}

/* ---------- the tabs ---------- */

type NumKey<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T];
type Field<T> = { k: NumKey<T>; label: string; min: number; max: number; step: number } | { k: Exclude<keyof T, NumKey<T>>; label: string; color: true };

const LOOK_GROUPS: [string, Field<Look>[]][] = [
  [
    'post-processing',
    [
      { k: 'contrast', label: 'contrast', min: -1, max: 1, step: 0.01 },
      { k: 'vignetteOffset', label: 'vignette offset', min: 0, max: 1, step: 0.01 },
      { k: 'vignetteDarkness', label: 'vignette darkness', min: 0, max: 1, step: 0.01 },
      { k: 'scanlineDensity', label: 'scanline density', min: 0.25, max: 4, step: 0.05 },
      { k: 'scanlineOpacity', label: 'scanline opacity', min: 0, max: 1, step: 0.01 },
    ],
  ],
  [
    'lighting',
    [
      { k: 'hemiIntensity', label: 'hemi intensity', min: 0, max: 1, step: 0.01 },
      { k: 'hemiSelectDrop', label: 'hemi drop (picked)', min: 0, max: 1, step: 0.01 },
      { k: 'dir1Intensity', label: 'key light', min: 0, max: 3, step: 0.01 },
      { k: 'dir1SelectDrop', label: 'key drop (picked)', min: 0, max: 1, step: 0.01 },
      { k: 'dir2Intensity', label: 'rim light', min: 0, max: 2, step: 0.01 },
      { k: 'dir2SelectBoost', label: 'rim boost (picked)', min: 0, max: 2, step: 0.01 },
      { k: 'fogNear', label: 'fog near', min: 0, max: 10, step: 0.1 },
      { k: 'fogFar', label: 'fog far', min: 5, max: 30, step: 0.1 },
      { k: 'fogFarSelectDrop', label: 'fog far drop (picked)', min: 0, max: 10, step: 0.1 },
      { k: 'fogTint', label: 'fog tint', min: 0, max: 1, step: 0.01 },
      { k: 'fogTintSelectBoost', label: 'fog tint boost (picked)', min: 0, max: 1, step: 0.01 },
      { k: 'bgTintSelect', label: 'background tint (picked)', min: 0, max: 1, step: 0.01 },
    ],
  ],
  [
    'materials',
    [
      { k: 'wakeSpeed', label: 'wake speed', min: 0.01, max: 0.3, step: 0.005 },
      { k: 'roughnessBase', label: 'roughness (rest)', min: 0, max: 1, step: 0.01 },
      { k: 'roughnessWakeDelta', label: 'roughness drop (awake)', min: 0, max: 0.5, step: 0.01 },
      { k: 'dotFreq', label: 'dot spacing', min: 0.3, max: 4, step: 0.05 },
      { k: 'dotStrength', label: 'dot strength', min: 0, max: 1, step: 0.01 },
    ],
  ],
  [
    'palette',
    [
      { k: 'bgColor', label: 'ground (background + fog)', color: true },
      { k: 'ghostFill', label: 'ghost fill', color: true },
      { k: 'ghostLine', label: 'ghost line', color: true },
      { k: 'rimColor', label: 'silhouette ink', color: true },
    ],
  ],
];

function LookTab() {
  const look = useTuned(LOOK);
  return (
    <>
      <Hint>→ LOOK in src/scene/look.ts</Hint>
      {LOOK_GROUPS.map(([name, fields]) => (
        <Group key={name} name={name}>
          {fields.map((f) =>
            'color' in f ? (
              <ColorRow key={f.k} label={f.label} value={look[f.k]} onChange={(v) => LOOK.set({ [f.k]: v })} />
            ) : (
              <Slider key={f.k} {...f} value={look[f.k]} onChange={(v) => LOOK.set({ [f.k]: v })} />
            ),
          )}
        </Group>
      ))}
      <Actions copy={asObject(look)} onReset={LOOK.reset} />
    </>
  );
}

const WALL_FIELDS: Extract<Field<WallLayout>, { min: number }>[] = [
  { k: 'cardW', label: 'card width', min: 160, max: 380, step: 5 },
  { k: 'planeVh', label: 'map height (vh)', min: 1, max: 2, step: 0.05 },
  { k: 'startX', label: 'left margin', min: 40, max: 400, step: 10 },
  { k: 'yearGap', label: 'year spacing', min: 160, max: 560, step: 10 },
  { k: 'rise', label: 'route → card %', min: 0, max: 20, step: 0.5 },
];

function TimelineTab() {
  const wall = useTuned(WALL);
  return (
    <>
      <Hint>→ WALL in src/components/timeline/layout.ts</Hint>
      {WALL_FIELDS.map((f) => (
        <Slider key={f.k} {...f} value={wall[f.k]} onChange={(v) => WALL.set({ [f.k]: v })} />
      ))}
      <Actions copy={asObject(wall)} onReset={WALL.reset} />
    </>
  );
}

function CameraTab() {
  const slug = useSceneSelector((s) => s.selectedSlug);
  const views = useTuned(VIEWS);
  const h = slug ? HOTSPOTS.find((x) => x.slug === slug) : undefined;
  if (!h) return <Hint>Open an exhibit in the maquette to tune its close-up.</Hint>;
  const v = views[h.slug] ?? hotspotView(h);
  const set = (patch: Partial<typeof v>) => VIEWS.set({ [h.slug]: { ...v, ...patch } });
  const setOffset = (i: 0 | 1 | 2, n: number) => {
    const offset = [...v.offset] as typeof v.offset;
    offset[i] = n;
    set({ offset });
  };
  const literal = `view: { offset: [${r2(v.offset[0])}, ${r2(v.offset[1])}, ${r2(v.offset[2])}], aimDown: ${r2(v.aimDown)}, fovZoom: ${r2(v.fovZoom)}${v.mobileZoom !== 1 ? `, mobileZoom: ${r2(v.mobileZoom)}` : ''} },`;
  return (
    <>
      <Hint>→ the `view` of {h.slug} in HOTSPOTS, src/scene/framing.ts</Hint>
      <Slider label="offset x" min={-2} max={5} step={0.05} value={v.offset[0]} onChange={(n) => setOffset(0, n)} />
      <Slider label="offset y" min={-2} max={4} step={0.05} value={v.offset[1]} onChange={(n) => setOffset(1, n)} />
      <Slider label="offset z" min={0.3} max={7} step={0.05} value={v.offset[2]} onChange={(n) => setOffset(2, n)} />
      <Slider label="aim down" min={-1} max={3} step={0.05} value={v.aimDown} onChange={(n) => set({ aimDown: n })} />
      <Slider label="fov zoom" min={-10} max={30} step={0.5} value={v.fovZoom} onChange={(n) => set({ fovZoom: n })} />
      <Slider label="phone zoom" min={0.5} max={2.5} step={0.05} value={v.mobileZoom} onChange={(n) => set({ mobileZoom: n })} />
      <Actions
        copy={literal}
        onReset={() => {
          const rest = { ...VIEWS.get() };
          delete rest[h.slug];
          VIEWS.reset();
          VIEWS.set(rest);
        }}
      />
    </>
  );
}

function ObjectsTab() {
  const list = Object.entries(useTuned(PLACEMENTS));
  if (!list.length) return <Hint>Scroll the maquette to load its objects.</Hint>;
  return (
    <>
      <Hint>→ the usePlacement(...) call in that layer's rig</Hint>
      {list.map(([name, e]) => (
        <Group key={name} name={name}>
          <ObjectRows name={name} e={e} />
        </Group>
      ))}
    </>
  );
}

function ObjectRows({ name, e }: { name: string; e: PlacementEntry }) {
  const set = (patch: Partial<PlacementEntry>) => PLACEMENTS.set({ [name]: { ...e, ...patch } });
  const axis = (i: 0 | 1 | 2) => (n: number) => {
    const position = [...e.position] as PlacementEntry['position'];
    position[i] = n;
    set({ position });
  };
  const pos = `position={[${e.position.map(r2).join(', ')}]}`;
  const literal = e.hasRot ? `${pos} rotation={[0, ${r2(e.rotationY)}, 0]}` : pos;
  return (
    <>
      {(['x', 'y', 'z'] as const).map((l, i) => (
        <Slider
          key={l}
          label={l}
          min={e.position[i] - e.range}
          max={e.position[i] + e.range}
          step={0.01}
          value={e.position[i]}
          onChange={axis(i as 0 | 1 | 2)}
        />
      ))}
      {e.hasRot && (
        <Slider label="turn" min={e.rotationY - Math.PI} max={e.rotationY + Math.PI} step={0.01} value={e.rotationY} onChange={(n) => set({ rotationY: n })} />
      )}
      <Actions copy={literal} />
    </>
  );
}

/* ---------- the parts ---------- */

const r2 = (n: number) => Math.round(n * 1000) / 1000;
const asObject = (o: object) =>
  JSON.stringify(o, null, 2)
    .replace(/"(\w+)":/g, '$1:')
    .replace(/"/g, "'");

function Hint({ children }: { children: ReactNode }) {
  return <div style={S.hint}>{children}</div>;
}

function Group({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div style={S.group}>
      <div style={S.groupName}>{name}</div>
      {children}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label style={S.row}>
      <span style={S.label}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, minWidth: 0 }}
      />
      <input
        type="number"
        step={step}
        value={r2(value)}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
        style={S.num}
      />
    </label>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={S.row}>
      <span style={{ ...S.label, flex: 1 }}>{label}</span>
      <span style={S.dim}>{value}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={S.swatch} />
    </label>
  );
}

function Actions({ copy, onReset }: { copy: string; onReset?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
      <button
        type="button"
        style={S.btn}
        onClick={() => {
          void navigator.clipboard?.writeText(copy).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        {copied ? 'copied' : 'copy'}
      </button>
      {onReset && (
        <button type="button" style={S.btn} onClick={onReset}>
          reset
        </button>
      )}
    </div>
  );
}

const INK = '#cdd9e2';
const DIM = '#7f95a4';
const EDGE = 'rgba(159,182,198,0.25)';
const S: Record<string, CSSProperties> = {
  panel: {
    position: 'fixed',
    left: 12,
    bottom: 12,
    zIndex: 10001,
    width: 316,
    maxHeight: '78vh',
    overflowY: 'auto',
    padding: '8px 12px 12px',
    background: 'rgba(10,13,16,0.9)',
    border: `1px solid ${EDGE}`,
    borderRadius: 8,
    color: INK,
    font: '11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
    backdropFilter: 'blur(6px)',
  },
  chip: { width: 'auto', padding: '3px 10px', cursor: 'pointer', color: DIM },
  head: { display: 'flex', gap: 2, position: 'sticky', top: -8, padding: '4px 0 6px', background: 'rgba(10,13,16,0.96)', borderBottom: `1px solid ${EDGE}` },
  tab: { background: 'none', border: 0, borderRadius: 3, color: DIM, font: 'inherit', cursor: 'pointer', padding: '2px 6px' },
  tabOn: { color: '#e6edf2', background: 'rgba(127,224,208,0.14)' },
  hint: { color: DIM, margin: '8px 0 2px' },
  group: { marginTop: 10, paddingTop: 6, borderTop: '1px solid rgba(159,182,198,0.12)' },
  groupName: { color: '#7fe0d0', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 },
  row: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 },
  label: { width: 128, color: '#9fb6c6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  dim: { color: DIM },
  num: {
    width: 54,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(159,182,198,0.2)',
    borderRadius: 3,
    color: INK,
    font: 'inherit',
    padding: '1px 3px',
  },
  swatch: { width: 34, height: 20, padding: 0, background: 'none', border: `1px solid ${EDGE}`, borderRadius: 3, cursor: 'pointer' },
  btn: { background: 'none', border: `1px solid ${EDGE}`, borderRadius: 3, color: '#9fb6c6', font: 'inherit', cursor: 'pointer', padding: '2px 8px' },
};
