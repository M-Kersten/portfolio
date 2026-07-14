import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cases, caseBySlug, site, type CareerEntry, type CaseStudy } from '../content';
import { asset } from '../lib/asset';
import { youtubeEmbed } from '../lib/youtube';
import { useFocusTrap } from '../lib/useFocusTrap';
import { useReducedMotion } from '../lib/useReducedMotion';
import { CaseCard } from './CaseCard';
import { SectionTitle } from './SectionTitle';
import { StoryLinks } from './StoryLinks';
import { useWallConfig, type WallConfig } from './wallTweak';

const SPAWN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "1997-03-16" → "16 Mar 1997".
function formatSpawn(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${SPAWN_MONTHS[(m || 1) - 1]} ${y}`;
}

// "2016-09" + "2018-09" → "Sep 2016 – Sep 2018"; null `to` → "… – present".
function fmtPeriod(from: string, to: string | null): string {
  const p = (s: string) => {
    const [y, m] = s.split('-').map(Number);
    return `${SPAWN_MONTHS[(m || 1) - 1]} ${y}`;
  };
  return `${p(from)} – ${to ? p(to) : 'present'}`;
}

// The company mark for a route tooltip: an explicit logo if the entry provides
// crisper mark) with the site's own favicon as a fallback if the file is
// missing. Returns null when there's nothing to show.
function companyFavicon(url?: string): string | null {
  if (!url) return null;
  try {
    return `https://icons.duckduckgo.com/ip3/${new URL(url).hostname}.ico`;
  } catch {
    return null;
  }
}

// ---- Timeline layout ------------------------------------------------------
// The map is a single route through time. Every project is a waypoint pinned at
// its year; where a year holds more than one, they stack above and below the
// line. The route itself is coloured by employer (see career bands below), so a
// visitor can read who Merijn was working for on each project at a glance.
interface Stop {
  study: CaseStudy;
  x: number; // horizontal position (px) — month-precise position on the axis
  side: 'above' | 'below';
}
interface CareerBand {
  company: string;
  color: string;
  x1: number;
  x2: number;
  freelance: boolean;
  role?: string;
  location?: string;
  blurb?: string;
  period: string;
  url?: string;
  logo?: string;
}
interface Timeline {
  width: number;
  routeLeft: number;
  routeW: number;
  stops: Stop[];
  bands: CareerBand[];
  minYear: number;
  maxYear: number;
}

function buildTimeline(list: CaseStudy[], career: CareerEntry[], cfg: WallConfig): Timeline {
  // A project's position on the axis, at month precision. `year` may carry a
  // month ("YYYY-MM"); a year-only value sits in the *middle* of its year
  // rather than jammed on the 1-January tick, so it reads closer to when it
  // happened and lines up better against the month-precise career bands. Add a
  // month to any project's `year` (e.g. "2024" → "2024-09") to pin it exactly.
  const posOf = (c: CaseStudy) => {
    const [y, m] = String(c.year ?? '').split('-').map(Number);
    if (!y) return 0;
    return m ? y + (m - 1) / 12 : y + 0.5;
  };
  const ordered = [...list].sort((a, b) => posOf(a) - posOf(b));
  // Start the axis at the earliest of the first project or the first job, so
  // the timeline reaches back to where the career actually began.
  const careerMin = career.length ? Math.min(...career.map((c) => Number(c.from.slice(0, 4)))) : Infinity;
  const minYear = Math.min(Math.floor(posOf(ordered[0])), careerMin);
  // The axis has to reach "now": the current job can start *after* the last
  // logged project (e.g. Marechaussee began in 2025-07, past every project
  // year), so end the route at the present rather than the last project —
  // otherwise that band clamps to a zero-width sliver at the edge and vanishes.
  const now = new Date();
  const present = now.getFullYear() + now.getMonth() / 12;
  const maxYear = Math.max(posOf(ordered[ordered.length - 1]), present);
  const xAt = (f: number) => cfg.startX + (f - minYear) * cfg.yearGap;

  // Place the stops left→right, each at its month-precise x. A stop takes
  // whichever side (above/below) still has a clear card-width behind it,
  // preferring to alternate; if several projects bunch into the same span and
  // both sides are crowded, it slides right just far enough to clear the last
  // card on its side. So no card ever hides behind its neighbour (four projects
  // in one year fan into two clean columns), and giving bunched projects real
  // months simply spreads them apart on their own.
  const stops: Stop[] = [];
  const lastX: Record<'above' | 'below', number> = { above: -Infinity, below: -Infinity };
  let toggle: 'above' | 'below' = 'above';
  for (const study of ordered) {
    let side: 'above' | 'below' = toggle;
    const other: 'above' | 'below' = side === 'above' ? 'below' : 'above';
    let x = xAt(posOf(study));
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

  // ---- Career bands — colour the route by employer over time. ------------
  // Dates map onto the same x-axis at month precision. Primary jobs form the
  // spine: each owns the line until the next one starts, so overlapping stints
  // resolve to a clean handoff. Work flagged `freelance` is drawn as a
  // concurrent overlay instead (e.g. Alliander during Philips), so nothing is
  // misrepresented as a single sequence.
  const frac = (s: string | null) => {
    if (!s) return present;
    const [y, m] = s.split('-').map(Number);
    return y + ((m || 1) - 1) / 12;
  };
  const xFrac = (f: number) => Math.max(routeLeft, Math.min(routeRight, cfg.startX + (f - minYear) * cfg.yearGap));

  const primary = career
    .filter((c) => !c.freelance)
    .map((c) => ({ ...c, s: frac(c.from), e: frac(c.to) }))
    .sort((a, b) => a.s - b.s);
  const bands: CareerBand[] = [];
  primary.forEach((c, i) => {
    const next = primary[i + 1];
    const end = next ? Math.min(c.e, next.s) : c.e; // the later job takes over the line
    const x1 = xFrac(c.s);
    const x2 = xFrac(end);
    if (x2 - x1 > 1)
      bands.push({ company: c.company, color: c.color, x1, x2, freelance: false, role: c.role, location: c.location, blurb: c.blurb, period: fmtPeriod(c.from, c.to), url: c.url, logo: c.logo });
  });
  career
    .filter((c) => c.freelance)
    .forEach((c) => {
      const x1 = xFrac(frac(c.from));
      const x2 = xFrac(frac(c.to));
      if (x2 - x1 > 1)
        bands.push({ company: c.company, color: c.color, x1, x2, freelance: true, role: c.role, location: c.location, blurb: c.blurb, period: fmtPeriod(c.from, c.to), url: c.url, logo: c.logo });
    });

  return { width, routeLeft, routeW, stops, bands, minYear, maxYear };
}

// The career band under a given x on the timeline — used by the mobile info bar,
// which can't rely on hover. Prefers the primary (spine) band, falls back to the
// nearest when x sits in a gap (the spawn lead-in), and reports a concurrent
// freelance stint if one overlaps at the same spot.
function bandsAt(bands: CareerBand[], x: number): { main: CareerBand; concurrent?: CareerBand } | null {
  if (!bands.length) return null;
  const primary = bands.filter((b) => !b.freelance);
  const pool = primary.length ? primary : bands;
  let main = pool.find((b) => x >= b.x1 && x <= b.x2);
  if (!main) {
    main = pool.reduce(
      (best, b) => {
        const d = Math.abs((b.x1 + b.x2) / 2 - x);
        return d < best.d ? { b, d } : best;
      },
      { b: pool[0], d: Infinity },
    ).b;
  }
  const concurrent = bands.find((b) => b.freelance && b !== main && x >= b.x1 && x <= b.x2);
  return { main, concurrent };
}

// A project lifted off the wall: scaled-up card with the full detail, over a dim
// backdrop. Not the old bottom HUD — a focused card. Esc / ✕ / backdrop closes.
function FocusCard({ study, onClose, onJump }: { study: CaseStudy; onClose: () => void; onJump: (slug: string) => void }) {
  const [imgOk, setImgOk] = useState(true);
  const embed = youtubeEmbed(study.video);
  // With a video, only show a photo if a real one is provided; without a video,
  // fall back to the poster placeholder so the card still has a header image.
  const photo = embed ? study.media?.[0] : study.media?.[0] ?? asset(`/posters/${study.slug}.jpg`);
  const closeRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useFocusTrap(cardRef); // Tab stays inside; focus returns to the card on close

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
        ref={cardRef}
        className="focus__card"
        data-layer={study.layer}
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
          {/* The story — the three beats visitors come for. */}
          <div className="story">
            <section>
              <h4 className="story__h">The problem</h4>
              <p>{study.problem}</p>
            </section>
            <section>
              <h4 className="story__h">The approach</h4>
              <p>{study.approach}</p>
            </section>
            {study.lesson && (
              <section>
                <h4 className="story__h">The lesson</h4>
                <p>{study.lesson}</p>
              </section>
            )}
          </div>
          {study.tech && study.tech.length > 0 && (
            <ul className="worktile__tech" aria-label="Technologies">
              {study.tech.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
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
          <StoryLinks study={study} onJump={onJump} />
        </div>
      </div>
    </div>
  );
}

// The projects map: a timeline you pan through. While the section is pinned,
// page scroll drives the wall sideways — you travel from the first project to
// the most recent, each pinned to the route at the year it happened. Clicking a
// waypoint opens the focus view.
export function Work() {
  const { workIntro } = site;
  const reduced = useReducedMotion();
  // Phones (and reduced-motion) skip the scroll-jack: the timeline becomes a
  // plain horizontally-scrollable strip you swipe through by hand.
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches,
  );
  const manualPan = reduced || isNarrow;
  const cfg = useWallConfig();
  const timeline = useMemo(() => buildTimeline(cases, site.career ?? [], cfg), [cfg]);
  const [open, setOpen] = useState<string | null>(null);
  // The mobile sticky company bar: which band is at the scroll position, and
  // whether the timeline is on screen (so the bar only shows while it's in view).
  const [now, setNow] = useState<{ main: CareerBand; concurrent?: CareerBand } | null>(null);
  const [pinIn, setPinIn] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const farRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  // The dot field's current parallax offset + the last cursor position, so the
  // hover glow stays aligned to the dots as you scroll, not only as you move.
  const farOffset = useRef({ x: 0, y: 0 });
  const lastCursor = useRef<{ x: number; y: number; r: number } | null>(null);

  // Track the narrow breakpoint so orientation / resize flips the mode live.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    const on = () => setIsNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Mobile: drive the sticky company bar from the horizontal scroll position —
  // touch has no hover, so the per-band tooltip is otherwise unreachable. The
  // band under the viewport's centre is the "current" employer; an
  // IntersectionObserver hides the bar while the timeline is off screen.
  useEffect(() => {
    if (!isNarrow) {
      setNow(null);
      setPinIn(false);
      return;
    }
    const pin = pinRef.current;
    if (!pin) return;
    let raf = 0;
    const compute = () => {
      raf = 0;
      const centerX = pin.scrollLeft + pin.clientWidth / 2;
      const next = bandsAt(timeline.bands, centerX);
      setNow((prev) =>
        prev?.main.company === next?.main.company &&
        prev?.main.x1 === next?.main.x1 &&
        prev?.concurrent?.company === next?.concurrent?.company
          ? prev
          : next,
      );
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    pin.addEventListener('scroll', onScroll, { passive: true });
    const io = new IntersectionObserver((es) => setPinIn(es[0].isIntersecting), { threshold: 0.35 });
    io.observe(pin);
    compute();
    return () => {
      pin.removeEventListener('scroll', onScroll);
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isNarrow, timeline.bands]);

  useEffect(() => {
    if (manualPan) return;
    let raf = 0;
    // Keep the bright dot layer sitting exactly over the (parallaxed) base dots,
    // and the glow pool under the last-known cursor.
    const syncGlow = () => {
      const glow = glowRef.current;
      if (!glow) return;
      glow.style.setProperty('--ox', `${-farOffset.current.x}px`);
      glow.style.setProperty('--oy', `${-farOffset.current.y}px`);
      if (lastCursor.current) {
        glow.style.setProperty('--mx', `${lastCursor.current.x}px`);
        glow.style.setProperty('--my', `${lastCursor.current.y}px`);
        glow.style.setProperty('--r', `${lastCursor.current.r}px`);
      }
    };
    // ---- Motion feel: the dolly -------------------------------------------
    // The wall reacts to how fast you pan: at speed the whole plane eases back
    // and tilts away a touch — a camera pulling out to travel — then settles
    // back in when you stop. Intensity lives in the wall tweak panel
    // (dollyZoom / dollyTilt / motionEase); set to 0 to disable. At rest the
    // values decay to exactly zero, so the resting wall is pixel-identical to
    // a wall without this code.
    const SPEED_REF = 35; // px/frame that counts as "full speed"
    let lastX = -1; // pan position on the previous frame (-1 = not measured yet)
    let vel = 0; // smoothed pan velocity
    const update = () => {
      raf = 0;
      const el = scrollRef.current;
      const plane = planeRef.current;
      if (!el || !plane) return;
      const scrollable = el.offsetHeight - window.innerHeight;
      const p = scrollable > 0 ? Math.min(1, Math.max(0, -el.getBoundingClientRect().top / scrollable)) : 0;
      const maxX = Math.max(0, timeline.width - window.innerWidth);
      const maxY = Math.max(0, plane.offsetHeight - window.innerHeight);
      const x = p * maxX;

      // Smoothed velocity (px/frame). dv is 0 on settle frames, so it eases
      // back to rest through the same lerp that ramps it up.
      const dv = lastX < 0 ? 0 : x - lastX;
      lastX = x;
      vel += (dv - vel) * cfg.motionEase;
      const speed = Math.min(1, vel / SPEED_REF); // 0..1 of full speed
      const absoluteSpeed = Math.min(1, Math.abs(vel) / SPEED_REF); // 0..1 of full speed
      const scale = 1 - cfg.dollyZoom * absoluteSpeed;
      const tilt = cfg.dollyTilt * speed;

      // Scale/tilt around the point currently at the viewport's centre.
      plane.style.transformOrigin = `${x + window.innerWidth / 2}px 50%`;
      plane.style.transform =
        `translate3d(${-x}px, ${-(p * maxY)}px, 0) scale(${scale}) rotateY(${tilt}deg)`;
      // Parallax: the dot field drifts slower, so the timeline reads as the near
      // layer floating in front of a receding space.
      farOffset.current = { x: p * maxX * cfg.parallax, y: p * maxY * cfg.parallax };
      if (farRef.current) farRef.current.style.transform = `translate3d(${-farOffset.current.x}px, ${-farOffset.current.y}px, 0)`;
      syncGlow();
      // Keep animating (even without scroll events) until the motion settles.
      if (Math.abs(vel) >= 0.05 && !raf) raf = requestAnimationFrame(update);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    // Hover glow: a soft pool that lights up the background dots nearest the
    // cursor. We move the mask centre to the cursor; syncGlow keeps the bright
    // dot layer aligned to the base field underneath.
    const onMove = (e: MouseEvent) => {
      const pin = pinRef.current;
      const glow = glowRef.current;
      if (!pin || !glow) return;
      const r = pin.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (x < 0 || y < 0 || x > r.width || y > r.height) {
        lastCursor.current = null;
        glow.style.setProperty('--mx', '-9999px');
        glow.style.setProperty('--my', '-9999px');
        return;
      }
      // Over a waypoint card, grow the pool and centre it on the card so the
      // dots around the whole tile light up (the card occludes the middle).
      const tile = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.worktile');
      let cx = x;
      let cy = y;
      let rad = 130;
      if (tile) {
        const t = tile.getBoundingClientRect();
        cx = t.left + t.width / 2 - r.left;
        cy = t.top + t.height / 2 - r.top;
        rad = Math.max(t.width, t.height) / 2 + 110;
      }
      lastCursor.current = { x: cx, y: cy, r: rad };
      glow.style.setProperty('--mx', `${cx}px`);
      glow.style.setProperty('--my', `${cy}px`);
      glow.style.setProperty('--r', `${rad}px`);
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
  }, [manualPan, timeline.width, cfg]);

  const openStudy = open ? caseBySlug(open) : undefined;
  // The spawn point sits a short lead-in left of where the route proper starts.
  const spawnX = Math.max(74, timeline.routeLeft - 96);

  return (
    <section id="work" className="section wall" data-reduced={reduced || undefined} data-static={manualPan || undefined}>
      <div className="container">
        {workIntro.title && <SectionTitle>{workIntro.title}</SectionTitle>}
        <p className="section__lead">{workIntro.lead}</p>
      </div>

      <div
        className="wall__scroll"
        ref={scrollRef}
        style={manualPan ? undefined : { height: `calc(100svh + ${timeline.width}px - 100vw)` }}
      >
        <div className="wall__pin" ref={pinRef}>
          <div
            className="wall__far"
            ref={farRef}
            aria-hidden="true"
            style={{ width: `${timeline.width}px`, height: `${cfg.planeVh * 100}svh` }}
          />
          {/* Hover glow — a bright copy of the dot field, masked to a soft pool
              around the cursor so the dots nearest it light up. Sits between the
              base dots and the plane so the waypoints occlude it. */}
          <div className="wall__glow" ref={glowRef} aria-hidden="true" />
          <div
            className="wall__plane"
            ref={planeRef}
            style={
              {
                width: `${timeline.width}px`,
                height: `${cfg.planeVh * 100}svh`,
                '--card-w': `${cfg.cardW}px`,
                '--rise': `${cfg.rise}%`,
              } as CSSProperties
            }
          >
            {/* The route: one line through time, coloured by employer. A faint
                base line shows through the gaps between jobs. */}
            <div className="tl-route" aria-hidden="true" style={{ left: `${timeline.routeLeft}px`, width: `${timeline.routeW}px` }} />
            {timeline.bands.map((b, i) => (
              <Fragment key={`${b.company}-${i}`}>
                <span
                  className={b.freelance ? 'tl-band tl-band--free' : 'tl-band'}
                  aria-hidden="true"
                  style={{ left: `${b.x1}px`, width: `${b.x2 - b.x1}px`, '--band': b.color } as CSSProperties}
                />
                <span
                  className={b.freelance ? 'tl-band__label tl-band__label--free' : 'tl-band__label'}
                  style={{ left: `${(b.x1 + b.x2) / 2}px`, '--band': b.color } as CSSProperties}
                >
                  {b.company}
                </span>
                {/* Hover/focus target over the line + label → tooltip about the
                    stint; when the company has a site, the whole band links to
                    it (opens in a new tab). */}
                {(() => {
                  const logo = b.logo ? asset(b.logo) : null;
                  const favicon = companyFavicon(b.url);
                  const mark = logo ?? favicon;
                  const tip = (
                    <span className="tl-tip" role="tooltip">
                      <span className="tl-tip__top">
                        {mark && (
                          <img
                            className={logo ? 'tl-tip__logo' : 'tl-tip__logo tl-tip__logo--favicon'}
                            src={mark}
                            alt=""
                            loading="lazy"
                            data-fallback={logo && favicon ? favicon : undefined}
                            onError={(e) => {
                              const fb = e.currentTarget.getAttribute('data-fallback');
                              if (fb && !e.currentTarget.src.endsWith(fb)) {
                                e.currentTarget.src = fb;
                                e.currentTarget.removeAttribute('data-fallback');
                                e.currentTarget.classList.add('tl-tip__logo--favicon');
                              } else {
                                e.currentTarget.style.display = 'none';
                              }
                            }}
                          />
                        )}
                        <b>{b.company}</b>
                        <span className="tl-tip__period">{b.period}</span>
                      </span>
                      {(b.role || b.location) && (
                        <span className="tl-tip__role">{[b.role, b.location].filter(Boolean).join(' · ')}</span>
                      )}
                      {b.blurb && <span className="tl-tip__body">{b.blurb}</span>}
                      {b.url && <span className="tl-tip__link">Visit website ↗</span>}
                    </span>
                  );
                  const segStyle = { left: `${b.x1}px`, width: `${b.x2 - b.x1}px`, '--band': b.color } as CSSProperties;
                  return b.url ? (
                    <a className="tl-seg tl-seg--link" style={segStyle} href={b.url} target="_blank" rel="noreferrer" aria-label={`${b.company} — visit website`}>
                      {tip}
                    </a>
                  ) : (
                    <div className="tl-seg" style={segStyle}>
                      {tip}
                    </div>
                  );
                })()}
              </Fragment>
            ))}
            {site.spawn && (
              <Fragment>
                {/* A playful origin point — birth — with a compressed, not-to-
                    scale lead-in to where the career proper begins. */}
                <div
                  className="tl-leadin"
                  aria-hidden="true"
                  style={{ left: `${spawnX}px`, width: `${timeline.routeLeft - spawnX}px` }}
                />
                <span className="tl-spawn" aria-hidden="true" style={{ left: `${spawnX}px` }} />
                <span className="tl-spawn__label" style={{ left: `${spawnX}px` }}>
                  <b>spawn</b>
                  <span>{formatSpawn(site.spawn)}</span>
                </span>
              </Fragment>
            )}
            <span className="tl-cap tl-cap--end" aria-hidden="true" style={{ left: `${timeline.routeLeft + timeline.routeW}px` }}>
              now →
            </span>

            {timeline.stops.map((s) => (
              <Fragment key={s.study.slug}>
                <span className="tl-node" aria-hidden="true" style={{ left: `${s.x}px` }} />
                <span className={`tl-leader tl-leader--${s.side}`} aria-hidden="true" style={{ left: `${s.x}px` }} />
                <CaseCard
                  study={s.study}
                  onOpen={() => setOpen(s.study.slug)}
                  style={
                    s.side === 'above'
                      ? { left: `${s.x}px`, bottom: 'calc(50% + var(--rise))' }
                      : { left: `${s.x}px`, top: 'calc(50% + var(--rise))' }
                  }
                />
              </Fragment>
            ))}
          </div>
          <span className="wall__cue" aria-hidden="true">scroll through time →</span>
          {/* Razor-thin scanner-frame corners around the viewport. */}
          <div className="wall__frame" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>

      {/* Mobile — a sticky bar reading out the employer at the current scroll
          position (touch can't reach the per-band hover tooltips). */}
      {isNarrow && (
        <div
          className="tl-now"
          data-in={pinIn && now ? '' : undefined}
          style={now ? ({ '--band': now.main.color } as CSSProperties) : undefined}
          aria-live="polite"
        >
          {now &&
            (() => {
              const b = now.main;
              const logo = b.logo ? asset(b.logo) : companyFavicon(b.url);
              const body = (
                <>
                  {logo && (
                    <img
                      className="tl-now__logo"
                      src={logo}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  <span className="tl-now__text">
                    <span className="tl-now__head">
                      <b>{b.company}</b>
                      <span className="tl-now__period">{b.period}</span>
                    </span>
                    {(b.role || b.location) && (
                      <span className="tl-now__role">{[b.role, b.location].filter(Boolean).join(' · ')}</span>
                    )}
                    {now.concurrent && (
                      <span className="tl-now__free" style={{ '--band': now.concurrent.color } as CSSProperties}>
                        + {now.concurrent.company} · freelance
                      </span>
                    )}
                  </span>
                  {b.url && (
                    <span className="tl-now__link" aria-hidden="true">
                      ↗
                    </span>
                  )}
                </>
              );
              return b.url ? (
                <a className="tl-now__card" href={b.url} target="_blank" rel="noreferrer" aria-label={`${b.company} — visit website`}>
                  {body}
                </a>
              ) : (
                <span className="tl-now__card">{body}</span>
              );
            })()}
        </div>
      )}

      {openStudy && <FocusCard study={openStudy} onClose={() => setOpen(null)} onJump={setOpen} />}
    </section>
  );
}
