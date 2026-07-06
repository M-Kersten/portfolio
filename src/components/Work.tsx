import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cases, caseBySlug, site, type CaseStudy } from '../content';
import { asset } from '../lib/asset';
import { youtubeEmbed } from '../lib/youtube';
import { useReducedMotion } from '../lib/useReducedMotion';
import { CaseCard, accentFor } from './CaseCard';
import { useWallConfig, type WallConfig } from './wallTweak';

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

// Cartographic feature names — classic italic map labels named after programmer
// hazards. (Forests / the city carry their own labels; these name the rest.)
const PLACES = ['Null Pointer Swamp', 'Mount Stackoverflow', 'Segfault Cliffs', 'Legacy Ruins', 'The Data Stream', 'The Race Conditions'];
// Surveyor's marginalia — mono annotations scrawled in the gaps.
const NOTES = [
  'Turn left after the merge conflict',
  'Rendering chunks...',
  '// TODO: name this region',
  'terrain still loading',
  'surveyed at 3am',
];
// Faux grid references dotted around the graticule.
const COORDS = ['52°21′N', '4°54′E', 'GRID 04·47'];
// Icon features drawn on the land, each with its own label.
const FEATURES = [
  { kind: 'city' as const, label: 'Localhost' },
  { kind: 'forest' as const, label: 'Deprecated Forest' },
  { kind: 'forest' as const, label: 'The Dependency Woods' },
  { kind: 'forest' as const, label: 'Recursion Grove' },
];

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

// Lay the cards out as a row of COLUMNS descending left → right across the tall +
// wide plane. Each column holds one tile, or — `stackChance` of the time — two,
// one above the other at the same x (a stacked pair). Widely jittered so it reads
// like a hand-hung wall. Then a wire is threaded that pins to each card's top edge.
function buildWall(n: number, cfg: WallConfig): Wall {
  const rnd = mulberry32(cfg.seed);
  // Plan the columns first: sizes of 1 or 2 tiles that sum to exactly n.
  const colSizes: number[] = [];
  let remaining = n;
  while (remaining > 0) {
    const two = remaining >= 2 && rnd() < cfg.stackChance;
    colSizes.push(two ? 2 : 1);
    remaining -= two ? 2 : 1;
  }
  const cols = colSizes.length;
  const clamp = (v: number) => Math.min(cfg.topMax, Math.max(cfg.topMin, v));
  const slots: Slot[] = [];
  let x = cfg.startX;
  colSizes.forEach((size, c) => {
    const t = cols > 1 ? c / (cols - 1) : 0;
    const band = cfg.topStart + t * cfg.topSlope; // where this column sits vertically
    if (size === 2) {
      // Split the pair above / below the band; a shared partial jitter keeps the
      // gap intact while still nudging the whole column off the tidy diagonal.
      const j = (rnd() * 2 - 1) * cfg.topJitter * 0.35;
      slots.push({ left: x, topPct: clamp(band - cfg.stackGap + j), rot: (rnd() * 2 - 1) * cfg.rot });
      slots.push({ left: x, topPct: clamp(band + cfg.stackGap + j), rot: (rnd() * 2 - 1) * cfg.rot });
    } else {
      slots.push({ left: x, topPct: clamp(band + (rnd() * 2 - 1) * cfg.topJitter), rot: (rnd() * 2 - 1) * cfg.rot });
    }
    x += cfg.cardW + cfg.gapMin + rnd() * cfg.gapJitter; // advance to the next column
  });
  const width = x + 48;

  // Pin points sit right on each card's top-centre; y is per-mille of the plane
  // height (topPct * 10) so the SVG can share a width × 1000 viewBox.
  const pin = slots.map((s) => ({ x: s.left + cfg.cardW / 2, y: s.topPct * 10 }));
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

// Smooth open curve through points (for coastline, rivers, paths).
function smoothOpen(pts: number[][]): string {
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const m = mid(pts[i - 1], pts[i]);
    d += ` Q ${pts[i - 1][0].toFixed(1)} ${pts[i - 1][1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
}

function buildMap(): { contours: string; rivers: string; paths: string } {
  const rnd = mulberry32(7311);
  const ring = (cx: number, cy: number, r: number, offs: number[]) =>
    smoothClosed(offs.map((o, i) => [cx + Math.cos((i / offs.length) * Math.PI * 2) * r * o, cy + Math.sin((i / offs.length) * Math.PI * 2) * r * o]));

  // A few clean mountain groups, well spaced.
  let contours = '';
  const peaks = 3;
  const peakPos: number[][] = [];
  for (let p = 0; p < peaks; p++) {
    const cx = 380 + (p / (peaks - 1)) * (MAP_VBW - 760) + (rnd() * 2 - 1) * 120;
    const cy = 240 + rnd() * 420;
    peakPos.push([cx, cy]);
    const baseR = 140 + rnd() * 120;
    const offs = Array.from({ length: 20 }, () => 1 + (rnd() * 2 - 1) * 0.15); // shared wobble → concentric rings
    for (let k = 0; k < 3; k++) contours += ring(cx, cy, baseR * (1 - k * 0.26), offs) + ' ';
  }

  // Two rivers meandering down out of the mountains.
  let rivers = '';
  for (let r = 0; r < 2; r++) {
    const src = peakPos[r % peaks];
    let x = src[0] + (rnd() * 2 - 1) * 60;
    let y = src[1] + 50;
    const pts = [[x, y]];
    const steps = 6;
    for (let s = 1; s <= steps; s++) {
      x += (rnd() * 2 - 1) * 150;
      y += 90 + (rnd() * 2 - 1) * 30;
      pts.push([x, y]);
    }
    rivers += smoothOpen(pts) + ' ';
  }

  // One long footpath wandering across the land.
  let py = 300 + rnd() * 200;
  const ppts = [[0, py]];
  for (let s = 1; s <= 8; s++) {
    py = Math.max(140, Math.min(760, py + (rnd() * 2 - 1) * 150));
    ppts.push([(s / 8) * MAP_VBW, py]);
  }
  const paths = smoothOpen(ppts);

  return { contours, rivers, paths };
}

// A project lifted off the wall: scaled-up card with the full detail, over a dim
// backdrop. Not the old bottom HUD — a focused card. Esc / ✕ / backdrop closes.
function FocusCard({ study, onClose }: { study: CaseStudy; onClose: () => void }) {
  const [imgOk, setImgOk] = useState(true);
  const embed = youtubeEmbed(study.video);
  // With a video, only show a photo if a real one is provided; without a video,
  // fall back to the poster placeholder so the card still has a header image.
  const photo = embed ? study.media?.[0] : study.media?.[0] ?? asset(`/posters/${study.slug}.jpg`);
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
        {embed && (
          <div className="focus__video">
            <iframe
              src={embed}
              title={`${study.title} — video`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
            />
          </div>
        )}
        {photo && (
          <div className="focus__photo worktile__media">
            <div className="worktile__ph" aria-hidden="true" />
            {imgOk && <img className="worktile__img" src={photo} alt="" onError={() => setImgOk(false)} />}
            <div className="worktile__scrim" aria-hidden="true" />
            {study.live && (
              <div className="worktile__badges">
                <span className="worktile__live">Live</span>
              </div>
            )}
          </div>
        )}
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
          <div className="focus__actions">
            <a
              className="btn worktile__discuss"
              href={`mailto:${site.contact.email}?subject=${encodeURIComponent(study.title)}`}
            >
              Ask me about it
            </a>
            {study.article && (
              <a className="btn btn--ghost" href={study.article} target="_blank" rel="noreferrer">
                Read more <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
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
  const cfg = useWallConfig();
  const wall = useMemo(() => buildWall(ordered.length, cfg), [ordered.length, cfg]);
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
  // Forests + a city, spaced along the land, each with its own label.
  const features = useMemo(() => {
    const slots = wall.slots;
    // Distinct column x's (a stacked pair shares one), left → right, each with the
    // mean vertical band of its tile(s).
    const xs = [...new Set(slots.map((s) => s.left))].sort((a, b) => a - b);
    if (xs.length < 2) return [];
    const bandAt = (left: number) => {
      const ys = slots.filter((s) => s.left === left).map((s) => s.topPct);
      return ys.reduce((a, b) => a + b, 0) / ys.length;
    };
    return FEATURES.map((f, k) => {
      // Drop each feature into a horizontal gap between two columns, where no tile
      // can hide it, offset a touch above or below the tile band.
      const j = Math.max(0, Math.min(xs.length - 2, Math.round(((k + 0.5) / FEATURES.length) * (xs.length - 2))));
      const x = (xs[j] + cfg.cardW + xs[j + 1]) / 2;
      const band = (bandAt(xs[j]) + bandAt(xs[j + 1])) / 2;
      const topPct = Math.min(90, Math.max(6, band + (k % 2 === 1 ? -20 : 22)));
      return { ...f, x, topPct };
    });
  }, [wall.slots, cfg.cardW]);
  const [open, setOpen] = useState<string | null>(null);
  // Which tile is hovered — drives the data-packet that runs down the wire.
  const [hover, setHover] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const farRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  // Trail points carry a cumulative arc-length `s` (px from the first point ever),
  // so the dash pattern can be pinned to world space and never crawl.
  const trailRef = useRef<{ x: number; y: number; t: number; s: number }[]>([]);
  const trailPathRef = useRef<SVGPathElement>(null);
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
      if (farRef.current) farRef.current.style.transform = `translate3d(${-(p * maxX * cfg.parallax)}px, ${-(p * maxY * cfg.parallax)}px, 0)`;
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
    // A dashed trail that lingers behind the cursor — like charting a route as you
    // wander the map. You draw at the head as the mouse moves; the tail retracts
    // by age. The dashes are pinned to world space (dashoffset = the tail's
    // arc-length) so they stay put where drawn instead of crawling forward — each
    // dash just shrinks and pops off the tail as the line expires. Pattern below
    // must stay in sync with `.wall__trail path` stroke-dasharray in global.css.
    const LIFE = 700; // ms a point survives before the retracting tail reaches it
    const DASH = 3;
    const GAP = 7;
    const PATTERN = DASH + GAP;
    let trailRaf = 0;
    const drawTrail = () => {
      const now = performance.now();
      const pts = trailRef.current;
      const path = trailPathRef.current;
      const cutoff = now - LIFE;
      // First still-living point (everything before it has aged past LIFE).
      let i = 0;
      while (i < pts.length && pts[i].t < cutoff) i++;
      if (i >= pts.length || pts.length < 2) {
        // Nothing left alive (or too short to draw a segment) — clear and idle.
        if (i >= pts.length) trailRef.current = [];
        if (path) path.setAttribute('d', '');
        trailRaf = trailRef.current.length > 1 ? requestAnimationFrame(drawTrail) : 0;
        return;
      }
      // The tail: the exact point where the cutoff time falls, interpolated between
      // the last dead point and the first live one, so it slides smoothly instead
      // of jumping vertex to vertex.
      let tx = pts[i].x;
      let ty = pts[i].y;
      let ts = pts[i].s;
      if (i > 0) {
        const a = pts[i - 1];
        const b = pts[i];
        const f = Math.min(1, Math.max(0, (cutoff - a.t) / (b.t - a.t || 1)));
        tx = a.x + (b.x - a.x) * f;
        ty = a.y + (b.y - a.y) * f;
        ts = a.s + (b.s - a.s) * f;
      }
      let d = `M ${tx.toFixed(1)} ${ty.toFixed(1)}`;
      for (let k = i; k < pts.length; k++) d += ` L ${pts[k].x.toFixed(1)} ${pts[k].y.toFixed(1)}`;
      if (path) {
        path.setAttribute('d', d);
        // Pin the pattern to the tail's world arc-length → dashes never crawl.
        path.style.strokeDashoffset = String(ts % PATTERN);
      }
      // Drop points fully behind the tail, keeping the one anchor we interpolate from.
      if (i > 1) pts.splice(0, i - 1);
      trailRaf = requestAnimationFrame(drawTrail);
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
      const t = trailRef.current;
      const last = t[t.length - 1];
      const dist = last ? Math.hypot(x - last.x, y - last.y) : 0;
      if (!last || dist > 4) {
        // Extend the head, accumulating arc-length so the dashes can be world-locked.
        t.push({ x, y, t: performance.now(), s: (last?.s ?? 0) + dist });
        if (t.length > 240) t.shift();
      }
      if (!trailRaf) trailRaf = requestAnimationFrame(drawTrail);
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
      if (trailRaf) cancelAnimationFrame(trailRaf);
    };
  }, [reduced, wall.width, n, cfg.parallax]);

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
            style={{ width: `${wall.width}px`, height: `${cfg.planeVh * 100}svh` }}
          />
          {/* The traveller's dashed trail, lingering behind the cursor — sits
              between the dot field and the plane so the tiles occlude it. */}
          <svg className="wall__trail" aria-hidden="true">
            <path ref={trailPathRef} />
          </svg>
          <div
            className="wall__plane"
            ref={planeRef}
            style={{ width: `${wall.width}px`, height: `${cfg.planeVh * 100}svh`, '--card-w': `${cfg.cardW}px` } as CSSProperties}
          >
            {/* Cartographic backdrop — contours, a footpath and rivers. */}
            <svg className="wall__map" viewBox={`0 0 ${MAP_VBW} ${MAP_VBH}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <path className="wall__contour" d={map.contours} />
              <path className="wall__path" d={map.paths} />
              <path className="wall__river" d={map.rivers} />
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
            {features.map((f, i) => (
              <div
                key={`feat-${i}`}
                className={`wall__feature wall__feature--${f.kind}`}
                aria-hidden="true"
                style={{ left: `${f.x}px`, top: `${f.topPct}%` } as CSSProperties}
              >
                {f.kind === 'forest' ? (
                  <svg className="wall__feature-ico" viewBox="0 0 64 30">
                    {[
                      [10, 24],
                      [22, 22],
                      [34, 25],
                      [46, 21],
                      [17, 27],
                      [40, 28],
                    ].map(([tx, ty], j) => (
                      <path key={j} d={`M${tx} ${ty} l-5 0 l5 -13 l5 13 z`} />
                    ))}
                  </svg>
                ) : (
                  <svg className="wall__feature-ico" viewBox="0 0 64 30">
                    {[
                      [8, 12],
                      [16, 20],
                      [24, 9],
                      [32, 17],
                      [40, 13],
                      [48, 22],
                      [56, 15],
                    ].map(([bx, h], j) => (
                      <rect key={j} x={bx} y={30 - h} width="6" height={h} />
                    ))}
                  </svg>
                )}
                <span className="wall__feature-label">{f.label}</span>
              </div>
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
