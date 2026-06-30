// Static, self-hosted SVG poster — the first-class no-WebGL / low-power
// fallback (§4, §11). Many corporate viewers may only ever see this, so it is
// art-directed, not a grey box.

const SLATE_DEEP = '#2a3850';
const SLATE_MID = '#3b4d68';
const SLATE_LITE = '#566c8e';
const HAIRLINE = '#7088a8';
const ACCENT = '#2ee6e6';

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
    <svg viewBox="0 0 400 320" role="img" aria-label="Three-layer capability maquette: city, room and chip.">
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

export function Poster() {
  return (
    <div className="poster">
      <MaquettePoster />
      <p className="poster__note">Static preview — interactive 3D unavailable on this device.</p>
    </div>
  );
}
