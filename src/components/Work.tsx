import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cases, caseBySlug, site, type CaseStudy } from '../content';
import { asset } from '../lib/asset';
import { useReducedMotion } from '../lib/useReducedMotion';
import { CaseCard, accentFor } from './CaseCard';

// Seeded RNG so the "randomly placed" wall is stable between renders.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CARD_W = 320;
// The wall plane is taller than the viewport, so scrolling pans it down as well
// as across — you ride diagonally past the pictures rather than straight sideways
// (2× viewport tall ⇒ a full viewport of descent over the scroll).
const PLANE_VH = 2;

// Cartographic feature names — the map's regions, rendered as classic italic
// map labels but named after programmer hazards.
const PLACES = [
  'Null Pointer Swamp',
  'Procedural Coastline',
  'Mount Stackoverflow',
  'The Race Conditions',
  'Deprecated Forest',
  'Cache Bay',
  'Off-by-One Isle',
  'Segfault Cliffs',
  'Latency Lagoon',
  'Legacy Ruins',
];
// Surveyor's marginalia — mono annotations scrawled in the gaps.
const NOTES = [
  'Turn left after the merge conflict',
  'Rendering chunks...',
  'here be race conditions',
  'terrain still loading',
  '// TODO: name this region',
  'surveyed at 3am',
  'coastline approximate',
  'you are here (probably)',
];
// Faux grid references dotted around the graticule.
const COORDS = ['52°21′N', '4°54′E', 'GRID 04·47', 'ELEV ~0m', 'x1024 y768', '° drift 0.3'];

interface Slot {
  left: number;
  topPct: number;
  rot: number;
}

interface Wall {
  width: number;
  slots: Slot[];
  string: string; // SVG path (viewBox 0 0 width 1000) — the wire the cards pin to
  segs: string[]; // per-card incoming wire segment, for the hover data-packet
}

// Lay the cards out top-left → bottom-right across the whole (tall + wide) plane,
// widely jittered so it reads like a hand-hung wall of paintings. Then thread a
// wire that pins to each card's top edge.
function buildWall(n: number): Wall {
  const rnd = mulberry32(9137);
  const slots: Slot[] = [];
  let x = 56;
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    // Descend across the full plane height, but with a wide vertical jitter so it
    // scatters rather than reading as a tidy diagonal (kept clear of the very
    // bottom so the last cards land fully in view at the end of the scroll).
    const topPct = Math.min(78, Math.max(3, 6 + t * 52 + (rnd() * 2 - 1) * 17));
    slots.push({ left: x, topPct, rot: (rnd() * 2 - 1) * 4.6 });
    x += CARD_W + 80 + rnd() * 150; // advance with a little jitter, wider gaps
  }
  const width = x + 48;

  // Pin points sit right on each card's top-centre; y is per-mille of the plane
  // height (topPct * 10) so the SVG can share a width × 1000 viewBox.
  const pin = slots.map((s) => ({ x: s.left + CARD_W / 2, y: s.topPct * 10 }));
  let string = '';
  const segs: string[] = [];
  pin.forEach((p, i) => {
    if (i === 0) {
      string += `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      segs.push('');
      return;
    }
    const prev = pin[i - 1];
    const midX = (prev.x + p.x) / 2;
    const sag = Math.min(60, Math.max(18, (p.x - prev.x) * 0.05)); // wider gap → deeper sag
    const midY = (prev.y + p.y) / 2 + sag;
    const q = `Q ${midX.toFixed(1)} ${midY.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    string += ` ${q}`;
    segs.push(`M ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${q}`);
  });

  return { width, slots, string, segs };
}

// ---- Cartographic backdrop ------------------------------------------------
// A self-contained topo layer (own square-ish viewBox, drawn with slice so it
// never distorts): wobbly contour rings for "mountains", a coastline, and the
// water it encloses. Decorative — it doesn't need to line up with the tiles.
const MAP_VBW = 3200;
const MAP_VBH = 1000;

const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

// Smooth closed curve through points, using each vertex as a quadratic control.
function smoothClosed(pts: number[][]): string {
  const n = pts.length;
  const start = mid(pts[n - 1], pts[0]);
  let d = `M ${start[0].toFixed(1)} ${start[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const c = pts[i];
    const m = mid(pts[i], pts[(i + 1) % n]);
    d += ` Q ${c[0].toFixed(1)} ${c[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
  }
  return d + ' Z';
}

function buildMap(): { contours: string; coast: string; water: string } {
  const rnd = mulberry32(7311);
  const ring = (cx: number, cy: number, r: number, offs: number[]) =>
    smoothClosed(offs.map((o, i) => [cx + Math.cos((i / offs.length) * Math.PI * 2) * r * o, cy + Math.sin((i / offs.length) * Math.PI * 2) * r * o]));

  let contours = '';
  const peaks = 6;
  for (let p = 0; p < peaks; p++) {
    const cx = 220 + (p / (peaks - 1)) * (MAP_VBW - 440) + (rnd() * 2 - 1) * 110;
    const cy = 210 + rnd() * 560;
    const baseR = 120 + rnd() * 150;
    const offs = Array.from({ length: 20 }, () => 1 + (rnd() * 2 - 1) * 0.16); // shared wobble → concentric rings
    const rings = 3 + Math.floor(rnd() * 2);
    for (let k = 0; k < rings; k++) contours += ring(cx, cy, baseR * (1 - k * 0.24), offs) + ' ';
  }

  const cn = 10;
  const cpts: number[][] = [];
  for (let i = 0; i <= cn; i++) cpts.push([(i / cn) * MAP_VBW, 660 + Math.sin(i * 1.1) * 70 + (rnd() * 2 - 1) * 55]);
  let coast = `M ${cpts[0][0].toFixed(0)} ${cpts[0][1].toFixed(0)}`;
  for (let i = 1; i < cpts.length; i++) {
    const m = mid(cpts[i - 1], cpts[i]);
    coast += ` Q ${cpts[i - 1][0].toFixed(0)} ${cpts[i - 1][1].toFixed(0)} ${m[0].toFixed(0)} ${m[1].toFixed(0)}`;
  }
  coast += ` L ${cpts[cn][0].toFixed(0)} ${cpts[cn][1].toFixed(0)}`;
  const water = `${coast} L ${MAP_VBW} ${MAP_VBH} L 0 ${MAP_VBH} Z`;
  return { contours, coast, water };
}

// A project lifted off the wall: scaled-up card with the full detail, over a dim
// backdrop. Not the old bottom HUD — a focused card. Esc / ✕ / backdrop closes.
function FocusCard({ study, onClose }: { study: CaseStudy; onClose: () => void }) {
  const [imgOk, setImgOk] = useState(true);
  const src = study.media?.[0] ?? asset(`/posters/${study.slug}.jpg`);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // freeze the wall while focused
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="focus" onClick={onClose}>
      <div
        className="focus__card"
        style={{ '--card-accent': accentFor(study.slug) } as CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-label={study.title}
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} type="button" className="focus__close" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">✕</span>
        </button>
        <div className="focus__media worktile__media">
          <div className="worktile__ph" aria-hidden="true" />
          {imgOk && <img className="worktile__img" src={src} alt="" onError={() => setImgOk(false)} />}
          <div className="worktile__scrim" aria-hidden="true" />
          {study.live && (
            <div className="worktile__badges">
              <span className="worktile__live">Live</span>
            </div>
          )}
        </div>
        <div className="focus__body">
          <span className="worktile__meta">
            {study.client} · {study.sector}
          </span>
          <h3 className="focus__title">{study.title}</h3>
          <p className="focus__outcome">{study.outcome}</p>
          <div className="worktile__cols">
            <section>
              <h4 className="worktile__h">The problem</h4>
              <p>{study.challenge}</p>
            </section>
            <section>
              <h4 className="worktile__h">What I made</h4>
              <p>{study.built}</p>
            </section>
          </div>
          {study.tech && study.tech.length > 0 && (
            <ul className="worktile__tech" aria-label="Technologies">
              {study.tech.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          {study.lesson && (
            <p className="worktile__lesson">
              <span>What I learned</span>
              {study.lesson}
            </p>
          )}
          <a
            className="btn worktile__discuss"
            href={`mailto:${site.contact.email}?subject=${encodeURIComponent(study.title)}`}
          >
            Ask me about it
          </a>
        </div>
      </div>
    </div>
  );
}

// The projects wall: cards scattered top-left → bottom-right; while the section
// is pinned, page scroll pans the wall horizontally — like riding an escalator
// down a wall of pictures. Clicking a card opens the focus view.
export function Work() {
  const { workIntro } = site;
  const reduced = useReducedMotion();
  // Random scatter (stable per build) — no longer grouped by layer.
  const ordered = useMemo(() => {
    const arr = [...cases];
    const rnd = mulberry32(4242);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, []);
  const wall = useMemo(() => buildWall(ordered.length), [ordered.length]);
  const map = useMemo(() => buildMap(), []);
  // Scatter the place names / marginalia / grid refs into the empty triangles
  // above and below the tile band.
  const labels = useMemo(() => {
    const rnd = mulberry32(2027);
    const items = [
      ...PLACES.map((text) => ({ text, kind: 'place' as const })),
      ...NOTES.map((text) => ({ text, kind: 'note' as const })),
      ...COORDS.map((text) => ({ text, kind: 'coord' as const })),
    ];
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items.map((it, k) => {
      const fx = (k + 0.5) / items.length;
      const x = 60 + fx * (wall.width - 320);
      const band = 6 + fx * 52; // ~ where the tiles sit at this x
      const above = k % 2 === 0;
      const topPct = Math.min(95, Math.max(2, above ? band - 30 - rnd() * 10 : band + 32 + rnd() * 10));
      return { ...it, x, topPct, rot: (rnd() * 2 - 1) * (it.kind === 'place' ? 2 : 3.4) };
    });
  }, [wall.width]);
  const [open, setOpen] = useState<string | null>(null);
  // Which tile is hovered — drives the data-packet that runs down the wire.
  const [hover, setHover] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const farRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const n = ordered.length;

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = scrollRef.current;
      const plane = planeRef.current;
      if (!el || !plane) return;
      const scrollable = el.offsetHeight - window.innerHeight;
      const p = scrollable > 0 ? Math.min(1, Math.max(0, -el.getBoundingClientRect().top / scrollable)) : 0;
      const maxX = Math.max(0, wall.width - window.innerWidth);
      const maxY = Math.max(0, plane.offsetHeight - window.innerHeight);
      plane.style.transform = `translate3d(${-(p * maxX)}px, ${-(p * maxY)}px, 0)`;
      // Parallax: the dot field drifts slower, so the cards read as the near
      // layer floating in front of a receding space.
      if (farRef.current) farRef.current.style.transform = `translate3d(${-(p * maxX * 0.72)}px, ${-(p * maxY * 0.72)}px, 0)`;
      // Telemetry read-outs.
      const hud = hudRef.current;
      if (hud) {
        const node = Math.min(n, Math.max(1, Math.round(p * (n - 1)) + 1));
        const set = (k: string, v: string) => hud.querySelector(`[data-k="${k}"]`)?.replaceChildren(v);
        set('scroll', `${String(Math.round(p * 100)).padStart(3, '0')}%`);
        set('node', `${String(node).padStart(2, '0')}/${n}`);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const onMove = (e: MouseEvent) => {
      const pin = pinRef.current;
      const hud = hudRef.current;
      if (!pin || !hud) return;
      const r = pin.getBoundingClientRect();
      const x = Math.round(e.clientX - r.left);
      const y = Math.round(e.clientY - r.top);
      if (x < 0 || y < 0 || x > r.width || y > r.height) return;
      hud.querySelector('[data-k="cursor"]')?.replaceChildren(
        `X:${String(x).padStart(4, '0')} Y:${String(y).padStart(4, '0')}`,
      );
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('mousemove', onMove, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced, wall.width, n]);

  const openStudy = open ? caseBySlug(open) : undefined;

  return (
    <section id="work" className="section wall" data-reduced={reduced || undefined}>
      <div className="container">
        {workIntro.title && <h2 className="section__title">{workIntro.title}</h2>}
        <p className="section__lead">{workIntro.lead}</p>
      </div>

      <div
        className="wall__scroll"
        ref={scrollRef}
        style={reduced ? undefined : { height: `calc(100svh + ${wall.width}px - 100vw)` }}
      >
        <div className="wall__pin" ref={pinRef}>
          <div
            className="wall__far"
            ref={farRef}
            aria-hidden="true"
            style={{ width: `${wall.width}px`, height: `${PLANE_VH * 100}svh` }}
          />
          <div
            className="wall__plane"
            ref={planeRef}
            style={{ width: `${wall.width}px`, height: `${PLANE_VH * 100}svh` }}
          >
            {/* Cartographic backdrop — graticule, contours, coastline + water. */}
            <svg className="wall__map" viewBox={`0 0 ${MAP_VBW} ${MAP_VBH}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <path className="wall__water" d={map.water} />
              <g className="wall__grid">
                {Array.from({ length: 6 }, (_, i) => (
                  <line key={`gv${i}`} x1={((i + 1) / 7) * MAP_VBW} y1={0} x2={((i + 1) / 7) * MAP_VBW} y2={MAP_VBH} />
                ))}
                {Array.from({ length: 4 }, (_, i) => (
                  <line key={`gh${i}`} x1={0} y1={((i + 1) / 5) * MAP_VBH} x2={MAP_VBW} y2={((i + 1) / 5) * MAP_VBH} />
                ))}
              </g>
              <path className="wall__contour" d={map.contours} />
              <path className="wall__coast" d={map.coast} />
            </svg>
            <svg
              className="wall__string"
              viewBox={`0 0 ${wall.width} 1000`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path className="wall__wire" d={wall.string} vectorEffect="non-scaling-stroke" />
              {hover != null && wall.segs[hover] && (
                // A data packet fired down the wire into the hovered tile.
                <circle key={hover} className="wall__packet" r={4} style={{ color: accentFor(ordered[hover].slug) }}>
                  <animateMotion dur="0.5s" path={wall.segs[hover]} fill="freeze" />
                </circle>
              )}
            </svg>
            {ordered.map((study, i) => (
              <span
                key={`knot-${study.slug}`}
                className="wall__knot"
                aria-hidden="true"
                style={
                  {
                    left: `${wall.slots[i].left + CARD_W / 2}px`,
                    top: `${wall.slots[i].topPct}%`,
                    '--knot': accentFor(study.slug),
                  } as CSSProperties
                }
              />
            ))}
            {labels.map((a, i) => (
              <span
                key={`lbl-${i}`}
                className={`wall__label wall__label--${a.kind}`}
                aria-hidden="true"
                style={{ left: `${a.x}px`, top: `${a.topPct}%`, '--rot': `${a.rot}deg` } as CSSProperties}
              >
                {a.text}
              </span>
            ))}
            {ordered.map((study, i) => (
              <CaseCard
                key={study.slug}
                study={study}
                onOpen={() => setOpen(study.slug)}
                onHover={(v) => setHover(v ? i : (prev) => (prev === i ? null : prev))}
                style={
                  {
                    left: `${wall.slots[i].left}px`,
                    top: `${wall.slots[i].topPct}%`,
                    '--rot': `${wall.slots[i].rot}deg`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
          <span className="wall__cue" aria-hidden="true">scroll to explore →</span>
          {/* Razor-thin scanner-frame corners around the viewport. */}
          <div className="wall__frame" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          {/* Compass rose. */}
          <div className="wall__compass" aria-hidden="true">
            <svg viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="19" />
              <line x1="22" y1="5" x2="22" y2="39" />
              <line x1="5" y1="22" x2="39" y2="22" />
              <polygon className="wall__compass-n" points="22,6 26,22 22,18 18,22" />
              <polygon points="22,38 18,22 22,26 26,22" />
            </svg>
            <span>N</span>
          </div>
          {/* Basemap legend / render layers — part instrument, part joke. */}
          <div className="wall__hud" ref={hudRef} aria-hidden="true">
            <span className="wall__hud-row wall__hud-title">
              <b>BASEMAP</b>
              <span>mk·survey</span>
            </span>
            <span className="wall__hud-row">
              <b>SCROLL</b>
              <span data-k="scroll">000%</span>
            </span>
            <span className="wall__hud-row">
              <b>SECTOR</b>
              <span data-k="node">01/{n}</span>
            </span>
            <span className="wall__hud-row">
              <b>COORD</b>
              <span data-k="cursor">X:0000 Y:0000</span>
            </span>
            <span className="wall__hud-sub">render layers</span>
            <span className="wall__hud-row wall__hud-render">
              <b>Fog</b>
              <span>covering mistakes</span>
            </span>
            <span className="wall__hud-row wall__hud-render">
              <b>Mountains</b>
              <span>billboarded</span>
            </span>
            <span className="wall__hud-row wall__hud-render">
              <b>Reflections</b>
              <span>aspirational</span>
            </span>
            <span className="wall__hud-row wall__hud-render">
              <b>Shadows</b>
              <span>estimated</span>
            </span>
          </div>
        </div>
      </div>

      {openStudy && <FocusCard study={openStudy} onClose={() => setOpen(null)} />}
    </section>
  );
}
