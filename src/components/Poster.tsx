import { useMemo } from 'react';
import type { SceneMode } from '../scene/store';
import { resolvePlace } from '../data/places';
import { site } from '../content';

// Static, self-hosted SVG posters — the first-class no-WebGL / low-power
// fallback (§4, §11). Many corporate viewers may only ever see this, so it is
// art-directed, not a grey box. The twin poster carries the required 3DBAG
// attribution just like the live scene (§5.6).

const SLATE_DEEP = '#46627a';
const SLATE_MID = '#6b8ca3';
const SLATE_LITE = '#90a9bb';
const HAIRLINE = '#c9d3d6';
const ACCENT = '#0f8a8a';

function MaquettePoster() {
  // three stacked isometric slabs with hairline edges and accent hotspots
  const slab = (yc: number, fill: string) => {
    const hh = 58;
    const t = 18;
    const top = `200,${yc - hh} 320,${yc} 200,${yc + hh} 80,${yc}`;
    const right = `320,${yc} 200,${yc + hh} 200,${yc + hh + t} 320,${yc + t}`;
    const left = `80,${yc} 200,${yc + hh} 200,${yc + hh + t} 80,${yc + t}`;
    return (
      <g key={yc}>
        <polygon points={left} fill={SLATE_DEEP} />
        <polygon points={right} fill={SLATE_MID} />
        <polygon points={top} fill={fill} stroke={HAIRLINE} strokeWidth={1.2} strokeLinejoin="round" />
      </g>
    );
  };
  return (
    <svg viewBox="0 0 400 320" role="img" aria-label="Three-layer capability maquette: VR training, AR overlays and a data twin.">
      {slab(232, SLATE_LITE)}
      {slab(150, SLATE_MID)}
      {slab(68, SLATE_LITE)}
      {/* accent hotspots */}
      <circle cx={250} cy={58} r={6} fill={ACCENT} />
      <circle cx={150} cy={150} r={5} fill={ACCENT} opacity={0.85} />
      <circle cx={250} cy={222} r={5} fill={ACCENT} opacity={0.7} />
    </svg>
  );
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function DistrictPoster({ seed }: { seed: number }) {
  const blocks = useMemo(() => {
    const rnd = mulberry32(seed);
    const out: { gx: number; gz: number; h: number; t: number }[] = [];
    for (let gx = -2; gx <= 2; gx++) {
      for (let gz = -2; gz <= 2; gz++) {
        if (rnd() < 0.18) continue;
        out.push({ gx, gz, h: 14 + rnd() * 60, t: rnd() });
      }
    }
    return out.sort((a, b) => a.gx + a.gz - (b.gx + b.gz));
  }, [seed]);

  const k = 30;
  const m = 15;
  const base = 200;
  const project = (gx: number, gz: number, h: number): [number, number] => [
    200 + (gx - gz) * k,
    base + (gx + gz) * m - h,
  ];
  const ramp = (t: number) => `hsl(${190 - t * 8} ${28 + t * 18}% ${62 - t * 24}%)`;

  return (
    <svg viewBox="0 0 400 320" role="img" aria-label="Isometric district digital twin built from open building data.">
      {/* ground rhombus */}
      <polygon
        points={`${project(-2.6, -2.6, 0)} ${project(2.6, -2.6, 0)} ${project(2.6, 2.6, 0)} ${project(-2.6, 2.6, 0)}`}
        fill="#eceadf"
        stroke={HAIRLINE}
        strokeWidth={1}
      />
      {blocks.map((b, i) => {
        const s = 0.42;
        const A = project(b.gx - s, b.gz - s, b.h);
        const B = project(b.gx + s, b.gz - s, b.h);
        const C = project(b.gx + s, b.gz + s, b.h);
        const D = project(b.gx - s, b.gz + s, b.h);
        const Bb = project(b.gx + s, b.gz - s, 0);
        const Cb = project(b.gx + s, b.gz + s, 0);
        const Db = project(b.gx - s, b.gz + s, 0);
        const col = ramp(b.t);
        return (
          <g key={i}>
            <polygon points={`${B} ${C} ${Cb} ${Bb}`} fill={col} opacity={0.8} />
            <polygon points={`${D} ${C} ${Cb} ${Db}`} fill={col} opacity={0.62} />
            <polygon points={`${A} ${B} ${C} ${D}`} fill={col} stroke={HAIRLINE} strokeWidth={0.8} />
          </g>
        );
      })}
    </svg>
  );
}

export function Poster({ mode, placeId }: { mode: SceneMode; placeId: string }) {
  const place = resolvePlace(placeId);
  return (
    <div className="poster">
      {mode === 'twin' ? <DistrictPoster seed={place.placeholder?.seed ?? 1} /> : <MaquettePoster />}
      {mode === 'twin' && (
        <div className="twin-caption" style={{ position: 'absolute' }}>
          <div className="twin-caption__place">{place.label} — digital twin</div>
          <p className="twin-caption__attr">
            © {site.twinSource.dataset}, {site.twinSource.release}. Static preview — interactive 3D needs WebGL.
          </p>
        </div>
      )}
      <p className="poster__note">Static preview — interactive 3D unavailable on this device.</p>
    </div>
  );
}
