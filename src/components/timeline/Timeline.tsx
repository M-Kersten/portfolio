import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { Link } from 'react-router-dom';
import { byDate, cases, caseBySlug, formatDate, site } from '../../content';
import { useTuned } from '../../dev/tuning';
import { asset } from '../../lib/asset';
import { contourCss, contourTileSteps } from '../../lib/contours';
import { PHONE, useMediaQuery, useReducedMotion } from '../../lib/media';
import { Exhibit } from '../exhibit/Exhibit';
import { SectionHead } from '../shell/SectionHead';
import { CaseCard } from './CaseCard';
import { WALL, bandsAt, buildRoute, companyFavicon, type CareerBand } from './layout';

// The projects map: a timeline you pan through. Every project is a waypoint
// pinned at its year on one route through time (layout.ts works out where);
// where a year holds more than one, they stack above and below the line. The
// route is coloured by employer, so a visitor can read who I was working for on
// each project at a glance. While the section is pinned, page scroll drives the
// map sideways, from the first project to the most recent; clicking a waypoint
// opens its book.

// ---- Travelling the route --------------------------------------------------
// "Now" on the map is a focus that sweeps across the screen as you go: it
// starts at the left edge when the wall pins and reaches the right edge as the
// route runs out, so the journey begins with nothing reached and ends with
// all of it. Everything is measured from it each frame. The route behind it is
// lit in its employers' colours and dim ahead; each waypoint's station fills
// in as the focus reaches it, and its card powers on — the poster comes up
// from grey — the maquette's ghost → alive, at timeline
// scale. Under it all, the canyon map is woven together from its points as the
// focus passes (lib/contours): far ahead it's a sparse scatter of dots, the
// trails fill in as you come up to them, and behind you they're joined into
// lines. The wall itself is flat and moves exactly with the scroll, a map
// sliding past a fixed frame.
const DIGITS = '0123456789';

/** Where the focus is on a hand-panned strip: as far across the visible width
 *  as the strip is scrolled across its whole length. */
function stripFocus(pin: HTMLElement): number {
  const p = pin.scrollLeft / Math.max(1, pin.scrollWidth - pin.clientWidth);
  return pin.scrollLeft + Math.min(1, Math.max(0, p)) * pin.clientWidth;
}

/** The year as an odometer: four windows, each a strip of 0–9 rolled to its digit. */
function Odometer({ year, refs }: { year: number; refs: MutableRefObject<(HTMLSpanElement | null)[]> }) {
  const digits = String(year).padStart(4, '0').split('');
  return (
    <>
      {digits.map((d, i) => (
        <span className="wall__digit" key={i}>
          <span className="wall__strip" ref={(el) => (refs.current[i] = el)} style={{ transform: `translateY(${-Number(d)}em)` }}>
            {DIGITS.split('').map((c) => (
              <span key={c}>{c}</span>
            ))}
          </span>
        </span>
      ))}
    </>
  );
}

// The highlights: the projects the route carries, and so the ones a book
// opened from it walks through (the archive lives on /projects).
const CURATED = cases.filter((c) => !c.archive);

export function Timeline() {
  const { workIntro } = site;
  const reduced = useReducedMotion();
  // Phones (and reduced-motion) skip the scroll-jack: the timeline becomes a
  // plain horizontally-scrollable strip you swipe through by hand.
  const isNarrow = useMediaQuery(PHONE);
  const manualPan = reduced || isNarrow;
  const cfg = useTuned(WALL);
  // The route only carries the highlights; the archive lives on /projects.
  const timeline = useMemo(() => buildRoute(CURATED, site.career ?? [], cfg), [cfg]);
  const [open, setOpen] = useState<string | null>(null);
  // The mobile sticky company bar: which band is at the scroll position, and
  // whether the timeline is on screen (so the bar only shows while it's in view).
  const [now, setNow] = useState<{ main: CareerBand; concurrent?: CareerBand } | null>(null);
  const [pinIn, setPinIn] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const farRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  // the big year at the foot of the pinned view: whichever year is under the
  // focus, written straight to the DOM from the pan loop
  const yearRef = useRef<HTMLSpanElement>(null);
  // Per-frame handles for travelling the route (applyHead): each card's slot,
  // each waypoint's station, each employer band and the year's digit strips —
  // written straight to the DOM, never through React state.
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const nodeRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const bandRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const digitRefs = useRef<(HTMLSpanElement | null)[]>([]);
  // The canyon map under the route (lib/contours), built for the ground's
  // height as the section comes near: its lines, and the same lines as trails
  // of dots at three densities, each filling in between the dots of the last.
  // The plain dot grid stands in until it arrives.
  const [topo, setTopo] = useState<{ lines: string; sparse: string; mid: string; fine: string; w: number; h: number } | null>(null);

  // Manual pan: open the strip where the projects start. From its origin, a
  // phone opened on the spawn marker and three screens of lead-in years, with
  // the first project a long swipe away and nothing to say there was anything
  // to swipe to. Only when not one project would be in view, only once, and
  // only if the visitor hasn't moved the strip — the lead-in is still there to
  // swipe back to. Declared before the effects that read the scroll position
  // (the company bar, the scroll wave), so they start from here.
  useEffect(() => {
    if (!manualPan) return;
    const pin = pinRef.current;
    const first = planeRef.current?.querySelector<HTMLElement>('.worktile-slot');
    if (!pin || !first || pin.scrollLeft !== 0 || first.offsetLeft < pin.clientWidth) return;
    pin.scrollLeft = first.offsetLeft - Math.min(48, pin.clientWidth * 0.08);
  }, [manualPan]);

  // Mobile: drive the sticky company bar from the horizontal scroll position —
  // touch has no hover, so the per-band tooltip is otherwise unreachable. The
  // band under the focus is the "current" employer; an IntersectionObserver
  // hides the bar while the timeline is off screen.
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
      const next = bandsAt(timeline.bands, stripFocus(pin));
      setNow((prev) =>
        prev?.main.company === next?.main.company && prev?.main.x1 === next?.main.x1 && prev?.concurrent?.company === next?.concurrent?.company ? prev : next,
      );
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    pin.addEventListener('scroll', onScroll, { passive: true });
    // only while the timeline is under the bar itself (the bottom of the
    // screen), so it goes as soon as the timeline scrolls up past it
    const io = new IntersectionObserver((es) => setPinIn(es[0].isIntersecting), { rootMargin: '-85% 0px 0px 0px' });
    io.observe(pin);
    compute();
    return () => {
      pin.removeEventListener('scroll', onScroll);
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isNarrow, timeline.bands]);

  // Travel the route to `head` (the plane x under the focus): light what's
  // behind it and dim what's ahead. Called per frame by whichever pan is
  // driving (the scroll-jack or the hand-panned strip). Reduced motion gets
  // the finished state: everything lit.
  const applyHead = useCallback(
    (head: number) => {
      const { stops, bands } = timeline;
      for (let i = 0; i < stops.length; i++) {
        const lit = reduced || stops[i].x <= head;
        for (const el of [slotRefs.current[i], nodeRefs.current[i]]) {
          if (el && el.hasAttribute('data-lit') !== lit) el.toggleAttribute('data-lit', lit);
        }
      }
      for (let i = 0; i < bands.length; i++) {
        const el = bandRefs.current[i];
        if (!el) continue;
        const b = bands[i];
        const f = reduced ? 1 : Math.max(0, Math.min(1, (head - b.x1) / (b.x2 - b.x1)));
        const v = `${(f * 100).toFixed(2)}%`;
        if (el.style.getPropertyValue('--fill') !== v) el.style.setProperty('--fill', v);
      }
    },
    [timeline, reduced],
  );

  // Weave the canyon map up to the focus: write where it is on the ground
  // (`front`, a ground x) for the map's masks — lines behind, the trails
  // thinning out ahead. Reduced motion gets the whole map woven.
  const applyFront = useCallback(
    (front: number) => {
      const far = farRef.current;
      if (far) far.style.setProperty('--front', reduced ? '100000px' : `${Math.round(front)}px`);
    },
    [reduced],
  );

  // The hand-panned strip (phones, reduced motion) drives the same travel off
  // its own scroll; its ground scrolls with it, so the map's front is the focus.
  useEffect(() => {
    if (!manualPan) return;
    const pin = pinRef.current;
    if (!pin) return;
    let raf = 0;
    const frame = () => {
      raf = 0;
      const focus = stripFocus(pin);
      applyHead(focus);
      applyFront(focus);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    pin.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    frame();
    return () => {
      pin.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [manualPan, applyHead, applyFront]);

  // Build the canyon map for the ground's height once the section is within
  // a few screens of view, and again only if a resize changes the height
  // enough to matter. It's most of a tenth of a second of maths the first
  // time round, so it runs in slices between frames rather than stalling one
  // while you scroll toward it: as much as fits while the browser is idle, a
  // few milliseconds at a time while it's busy.
  useEffect(() => {
    const far = farRef.current;
    if (!far) return;
    let built = 0;
    let near = false;
    let t = 0;
    let job = 0;
    const idle = (fn: (d?: IdleDeadline) => void) =>
      typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 50 }) : window.setTimeout(fn, 0);
    const unidle = (h: number) => (typeof cancelIdleCallback === 'function' ? cancelIdleCallback(h) : clearTimeout(h));
    const build = () => {
      const h = Math.round(far.offsetHeight);
      if (!near || !h || Math.abs(h - built) < 60) return;
      built = h;
      unidle(job);
      const steps = contourTileSteps(1600, h, { cell: 8, levels: 18 });
      const run = (deadline?: IdleDeadline) => {
        const t0 = performance.now();
        for (;;) {
          const r = steps.next();
          if (r.done) {
            const tile = r.value;
            // The dots: a scatter every 40px along each line, a second trail
            // filling in halfway between, a third halving that again — a dot
            // every 10px where all three show. All in the site's 2px squares,
            // and one ink, so a point that arrives early is no different from
            // one that arrives late.
            const dots = (pitch: number, phase: number) => contourCss(tile, { color: '#eaeaea', minor: 0.2, major: 0.32, dots: { size: 2, pitch, phase } });
            return setTopo({
              lines: contourCss(tile, { color: '#eaeaea', minor: 0.12, major: 0.22 }),
              sparse: dots(40, 0),
              mid: dots(40, 20),
              fine: dots(20, 10),
              w: tile.width,
              h: tile.height,
            });
          }
          const left = deadline && !deadline.didTimeout ? deadline.timeRemaining() : 6 - (performance.now() - t0);
          if (left < 2) break;
        }
        job = idle(run);
      };
      job = idle(run);
    };
    const io = new IntersectionObserver(
      (es) => {
        if (!es[0].isIntersecting || near) return;
        near = true;
        t = window.setTimeout(build, 30);
      },
      { rootMargin: '300% 0px' },
    );
    io.observe(far.parentElement ?? far);
    const onResize = () => {
      clearTimeout(t);
      t = window.setTimeout(build, 250);
    };
    window.addEventListener('resize', onResize);
    return () => {
      io.disconnect();
      clearTimeout(t);
      unidle(job);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // The scroll-jack: while the section is pinned, page scroll pans the wall
  // sideways, one to one — the map and its route slide past the frame together,
  // and nothing about them tilts, drifts or swings.
  useEffect(() => {
    if (manualPan) return;
    let raf = 0;
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
      // The focus crosses the screen as the wall pans, left edge to right
      // edge, so it reaches the end of the route exactly as the route runs out.
      const focus = p * window.innerWidth;
      // the scroll cue retires once there's no more time to scroll through
      scrollRef.current?.querySelector('.wall__cue')?.toggleAttribute('data-done', p > 0.92);
      // xAt() run backwards for the focus, held to the route
      const yr = Math.floor(timeline.minYear + (x + focus - cfg.startX) / cfg.yearGap);
      const year = String(Math.min(Math.floor(timeline.maxYear), Math.max(timeline.minYear, yr)));
      const yEl = yearRef.current;
      if (yEl && yEl.dataset.year !== year) {
        // roll each digit's strip to its new place (the odometer)
        yEl.dataset.year = year;
        year
          .padStart(4, '0')
          .split('')
          .forEach((d, i) => {
            const strip = digitRefs.current[i];
            if (strip) strip.style.transform = `translateY(${-Number(d)}em)`;
          });
      }
      const pan = `translate3d(${-x}px, ${-(p * maxY)}px, 0)`;
      plane.style.transform = pan;
      if (farRef.current) farRef.current.style.transform = pan;
      applyHead(x + focus);
      applyFront(x + focus);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [manualPan, timeline.width, timeline.minYear, timeline.maxYear, cfg, applyHead, applyFront]);

  const openStudy = open ? caseBySlug(open) : undefined;
  // The spawn point sits a short lead-in left of where the route proper starts.
  const spawnX = Math.max(74, timeline.routeLeft - 96);

  return (
    <section id="work" className="section wall" data-reduced={reduced || undefined} data-static={manualPan || undefined}>
      <div className="container">
        {workIntro.title && <SectionHead id="work" title={workIntro.title} lead={workIntro.lead} note={`${timeline.minYear} → now`} />}
        {/* Phones pan the strip by hand, and the desktop cue can't come along:
            it sits in the strip, which scrolls it away, and the company bar
            owns the bottom edge. So the cue goes here, right above it. */}
        {isNarrow && (
          <p className="wall__swipe" aria-hidden="true">
            swipe through time <span className="wall__swipe-arrow">→</span>
          </p>
        )}
      </div>

      <div className="wall__scroll" ref={scrollRef} style={manualPan ? undefined : { height: `calc(100svh + ${timeline.width}px - 100vw)` }}>
        <div className="wall__pin" ref={pinRef}>
          <div
            className="wall__far"
            ref={farRef}
            aria-hidden="true"
            data-topo={topo ? '' : undefined}
            style={{ width: `${timeline.width}px`, height: `${cfg.planeVh * 100}svh` }}
          >
            {/* the canyon map, woven from its points as the focus passes: the
                lines behind it, and ahead of it three trails of dots that
                thin out the further off they are (the masks in timeline.css) */}
            {topo && (
              <>
                <div className="wall__map wall__map--lines" style={{ backgroundImage: topo.lines, backgroundSize: `${topo.w}px ${topo.h}px` }} />
                <div className="wall__map wall__map--sparse" style={{ backgroundImage: topo.sparse, backgroundSize: `${topo.w}px ${topo.h}px` }} />
                <div className="wall__map wall__map--mid" style={{ backgroundImage: topo.mid, backgroundSize: `${topo.w}px ${topo.h}px` }} />
                <div className="wall__map wall__map--fine" style={{ backgroundImage: topo.fine, backgroundSize: `${topo.w}px ${topo.h}px` }} />
              </>
            )}
          </div>
          {/* behind the plane, so the cards pass over it */}
          <span className="wall__year" ref={yearRef} aria-hidden="true">
            <Odometer year={timeline.minYear} refs={digitRefs} />
          </span>
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
                  ref={(el) => (bandRefs.current[i] = el)}
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
                {/* hover or focus the stint for its tooltip; the band links to the
                    company's site when it has one */}
                <BandLink band={b} />
              </Fragment>
            ))}
            {site.spawn && (
              <Fragment>
                {/* A playful origin point — birth — with a compressed, not-to-
                    scale lead-in to where the career proper begins. */}
                <div className="tl-leadin" aria-hidden="true" style={{ left: `${spawnX}px`, width: `${timeline.routeLeft - spawnX}px` }} />
                <span className="tl-spawn" aria-hidden="true" style={{ left: `${spawnX}px` }} />
                <span className="tl-spawn__label" style={{ left: `${spawnX}px` }}>
                  <b>spawn</b>
                  <span>{formatDate(site.spawn)}</span>
                </span>
              </Fragment>
            )}
            <span className="tl-cap tl-cap--end" aria-hidden="true" style={{ left: `${timeline.routeLeft + timeline.routeW}px` }}>
              now →
            </span>

            {timeline.stops.map((s, i) => (
              <Fragment key={s.study.slug}>
                <span
                  className="tl-node"
                  ref={(el) => (nodeRefs.current[i] = el)}
                  aria-hidden="true"
                  style={{ left: `${s.x}px`, '--band': bandsAt(timeline.bands, s.x)?.main.color } as CSSProperties}
                />
                <span className={`tl-leader tl-leader--${s.side}`} aria-hidden="true" style={{ left: `${s.x}px` }} />
                <CaseCard
                  study={s.study}
                  slotRef={(el) => (slotRefs.current[i] = el)}
                  onOpen={() => setOpen(s.study.slug)}
                  style={s.side === 'above' ? { left: `${s.x}px`, bottom: 'calc(50% + var(--rise))' } : { left: `${s.x}px`, top: 'calc(50% + var(--rise))' }}
                />
              </Fragment>
            ))}
          </div>
          <span className="wall__cue" aria-hidden="true">
            scroll through time →
          </span>
        </div>
      </div>

      {/* Underneath the timeline: the way into the collection — every project,
          not just the highlights on the route. */}
      <div className="wall__more">
        <Link className="btn btn--ghost wall__more-btn" to="/projects">
          The collection <span aria-hidden="true">↗</span>
        </Link>
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
          {now && <NowCard main={now.main} concurrent={now.concurrent} />}
        </div>
      )}

      {openStudy && <Exhibit study={openStudy} place="page" collection={byDate(CURATED)} onClose={() => setOpen(null)} onWalk={setOpen} />}
    </section>
  );
}

/** An employer's stretch of the route, as something to hover or focus: a
 *  tooltip about the stint, and a link to the company's site when it has one. */
function BandLink({ band: b }: { band: CareerBand }) {
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
              // a missing logo falls back to the site's favicon, then to nothing
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
      {(b.role || b.location) && <span className="tl-tip__role">{[b.role, b.location].filter(Boolean).join(' · ')}</span>}
      {b.blurb && <span className="tl-tip__body">{b.blurb}</span>}
      {b.url && <span className="tl-tip__link">Visit website ↗</span>}
    </span>
  );
  const style = { left: `${b.x1}px`, width: `${b.x2 - b.x1}px`, '--band': b.color } as CSSProperties;
  // Concurrent work is drawn under the spine, so its hover target sits under it
  // too. Without the split every overlay silently ate the hover of the stints
  // it spans (same strip, later in the DOM). Above the line reaches the
  // employer, below it the concurrent band.
  const cls = b.freelance ? 'tl-seg tl-seg--free' : 'tl-seg';
  return b.url ? (
    <a className={`${cls} tl-seg--link`} style={style} href={b.url} target="_blank" rel="noreferrer" aria-label={`${b.company} — visit website`}>
      {tip}
    </a>
  ) : (
    <div className={cls} style={style}>
      {tip}
    </div>
  );
}

/** The phone's company bar: the employer under the focus, and any stint
 *  running alongside it. */
function NowCard({ main: b, concurrent }: { main: CareerBand; concurrent?: CareerBand }) {
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
        {(b.role || b.location) && <span className="tl-now__role">{[b.role, b.location].filter(Boolean).join(' · ')}</span>}
        {/* No suffix: the `freelance` flag really means "runs alongside", and
            not every concurrent stint is freelance — Rebels is an agency the
            client placements run through. The leading + and the band's own
            colour carry it. */}
        {concurrent && (
          <span className="tl-now__free" style={{ '--band': concurrent.color } as CSSProperties}>
            + {concurrent.company}
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
}
