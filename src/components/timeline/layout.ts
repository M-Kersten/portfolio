import { caseTime, formatPeriod, fractionalYear, type CareerEntry, type CaseStudy } from '../../content';
import { tunable } from '../../dev/tuning';

// Where everything sits on the timeline: the projects pinned along one route
// through time, and the route coloured by employer. Plain maths, no React; the
// component (Timeline.tsx) draws what this works out.

/** The spacing of the timeline, in px unless noted. In `npm run dev` the dev
 *  tools' Timeline tab scrubs these live and copies them back out. */
export const WALL = tunable({
  /** a project card's width */
  cardW: 250,
  /** the map's height, in viewport heights (≈1, so it pans sideways) */
  planeVh: 1,
  /** the margin before the first year */
  startX: 210,
  /** the distance from one year to the next */
  yearGap: 360,
  /** the gap between the route and a card's near edge, in % of the map's height */
  rise: 6,
});
export type WallLayout = typeof WALL.defaults;

/** A project's place on the route. */
export interface Stop {
  study: CaseStudy;
  /** month-precise position along the route */
  x: number;
  side: 'above' | 'below';
}

/** An employer's stretch of the route. */
export interface CareerBand {
  company: string;
  color: string;
  x1: number;
  x2: number;
  /** runs alongside the main job rather than handing over from it */
  freelance: boolean;
  role?: string;
  location?: string;
  blurb?: string;
  period: string;
  url?: string;
  logo?: string;
}

export interface Route {
  width: number;
  routeLeft: number;
  routeW: number;
  stops: Stop[];
  bands: CareerBand[];
  minYear: number;
  maxYear: number;
}

export function buildRoute(list: CaseStudy[], career: CareerEntry[], cfg: WallLayout): Route {
  // A project's position on the axis, at month precision (content/index.ts):
  // a year-only value sits in the middle of its year. Add a month to any
  // project's `year` (e.g. "2024" → "2024-09") to pin it exactly.
  const ordered = [...list].sort((a, b) => caseTime(a) - caseTime(b));
  // Start the axis at the earliest of the first project or the first job, so
  // the timeline reaches back to where the career actually began.
  const careerMin = career.length ? Math.min(...career.map((c) => Number(c.from.slice(0, 4)))) : Infinity;
  const minYear = Math.min(Math.floor(caseTime(ordered[0])), careerMin);
  // The axis has to reach "now": the current job can start *after* the last
  // logged project, so end the route at the present rather than at the last
  // project, or that band clamps to a zero-width sliver at the edge.
  const now = new Date();
  const present = now.getFullYear() + now.getMonth() / 12;
  const maxYear = Math.max(caseTime(ordered[ordered.length - 1]), present);
  const xAt = (f: number) => cfg.startX + (f - minYear) * cfg.yearGap;

  // Place the stops left→right, each at its month-precise x. A stop takes
  // whichever side (above/below) still has a clear card-width behind it,
  // preferring to alternate; if several projects bunch into the same span and
  // both sides are crowded, it slides right just far enough to clear the last
  // card on its side. So no card ever hides behind its neighbour, and giving
  // bunched projects real months simply spreads them apart on their own.
  const stops: Stop[] = [];
  const lastX: Record<Stop['side'], number> = { above: -Infinity, below: -Infinity };
  let toggle: Stop['side'] = 'above';
  for (const study of ordered) {
    let side: Stop['side'] = toggle;
    const other: Stop['side'] = side === 'above' ? 'below' : 'above';
    let x = xAt(caseTime(study));
    if (x - lastX[side] < cfg.cardW && x - lastX[other] >= cfg.cardW) side = other;
    if (x - lastX[side] < cfg.cardW) x = lastX[side] + cfg.cardW;
    stops.push({ study, x, side });
    lastX[side] = x;
    toggle = side === 'above' ? 'below' : 'above';
  }

  const routeLeft = xAt(minYear);
  const routeW = (maxYear - minYear) * cfg.yearGap;
  const routeRight = routeLeft + routeW;
  const width = routeRight + cfg.startX;

  // Career bands: colour the route by employer over time, at month precision.
  // Primary jobs form the spine: each owns the line until the next one starts,
  // so overlapping stints resolve to a clean handoff. Work flagged `freelance`
  // is drawn as a concurrent overlay instead (e.g. Alliander during Philips),
  // so nothing is misrepresented as a single sequence.
  const at = (s: string | null) => (s ? fractionalYear(s) : present);
  const xClamped = (f: number) => Math.max(routeLeft, Math.min(routeRight, xAt(f)));
  const band = (c: CareerEntry, x1: number, x2: number): CareerBand => ({
    company: c.company,
    color: c.color,
    x1,
    x2,
    freelance: Boolean(c.freelance),
    role: c.role,
    location: c.location,
    blurb: c.blurb,
    period: formatPeriod(c.from, c.to),
    url: c.url,
    logo: c.logo,
  });

  const primary = career.filter((c) => !c.freelance).sort((a, b) => at(a.from) - at(b.from));
  const bands: CareerBand[] = [];
  primary.forEach((c, i) => {
    const next = primary[i + 1];
    const end = next ? Math.min(at(c.to), at(next.from)) : at(c.to); // the later job takes over the line
    const x1 = xClamped(at(c.from));
    const x2 = xClamped(end);
    if (x2 - x1 > 1) bands.push(band(c, x1, x2));
  });
  for (const c of career.filter((c) => c.freelance)) {
    const x1 = xClamped(at(c.from));
    const x2 = xClamped(at(c.to));
    if (x2 - x1 > 1) bands.push(band(c, x1, x2));
  }

  return { width, routeLeft, routeW, stops, bands, minYear, maxYear };
}

/** The employer under a given x on the route, for the phone's company bar,
 *  which can't rely on hover. Prefers the main job, falls back to the nearest
 *  when x sits in a gap (the lead-in), and reports a concurrent stint if one
 *  runs alongside at the same spot. */
export function bandsAt(bands: CareerBand[], x: number): { main: CareerBand; concurrent?: CareerBand } | null {
  if (!bands.length) return null;
  // The map runs a little past the last band (the "now" marker and its
  // padding), so at either end the focus sits outside every band. Clamp first,
  // so main and concurrent answer about the same moment: without this the last
  // screen kept the employer but dropped the stint running alongside it.
  const lo = Math.min(...bands.map((b) => b.x1));
  const hi = Math.max(...bands.map((b) => b.x2));
  const at = Math.min(Math.max(x, lo), hi);

  const primary = bands.filter((b) => !b.freelance);
  const pool = primary.length ? primary : bands;
  const main =
    pool.find((b) => at >= b.x1 && at <= b.x2) ??
    pool.reduce((best, b) => (Math.abs((b.x1 + b.x2) / 2 - at) < Math.abs((best.x1 + best.x2) / 2 - at) ? b : best));
  const concurrent = bands.find((b) => b.freelance && b !== main && at >= b.x1 && at <= b.x2);
  return { main, concurrent };
}

/** A company's mark from its website, for when the career entry has no logo. */
export function companyFavicon(url?: string): string | null {
  if (!url) return null;
  try {
    return `https://icons.duckduckgo.com/ip3/${new URL(url).hostname}.ico`;
  } catch {
    return null;
  }
}
