import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cases, site } from '../content';
import { asset } from '../lib/asset';
import { useReducedMotion } from '../lib/useReducedMotion';
import { useReveal } from '../lib/useReveal';
import { ScanFrame } from './ScanFrame';
import { Scramble } from './Scramble';
import { SectionHead } from './SectionHead';

const PORTRAITS = 5;

// A portrait that scrubs through five photos as it rises up the screen, landing
// on the last one the moment it reaches the vertical middle of the viewport.
function AboutPortrait({ children }: { children?: ReactNode }) {
  const reduced = useReducedMotion();
  const boxRef = useRef<HTMLElement>(null);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    if (reduced) {
      setFrame(PORTRAITS - 1); // no scrubbing — just show the final shot
      return;
    }
    // Polled on a rAF loop rather than scroll events (which fire unreliably for
    // isolated jumps) — one cheap rect read per frame; setFrame bails if stable.
    // Cycling starts once the portrait's centre has risen past START (a bit up
    // from the bottom edge) and finishes at the middle, so the flip-through is
    // quick and obvious rather than a slow drift.
    const START = 0.82;
    const END = 0.5;
    let raf = 0;
    const loop = () => {
      const r = box.getBoundingClientRect();
      const cy = r.top + r.height / 2;
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (START * vh - cy) / ((START - END) * vh)));
      setFrame(Math.min(PORTRAITS - 1, Math.floor(p * PORTRAITS)));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <figure className="about__portrait" ref={boxRef} role="img" aria-label={`Portrait of ${site.hero.name}`}>
      <div className="about__portrait-ph" aria-hidden="true" />
      {Array.from({ length: PORTRAITS }, (_, i) => (
        <div
          key={i}
          className="about__portrait-frame"
          aria-hidden="true"
          style={{ backgroundImage: `url(${asset(`/profile/${i + 1}.png`)})`, opacity: i === frame ? 1 : 0 }}
        />
      ))}
      {children}
      <ScanFrame variant="portrait" />
    </figure>
  );
}

/* The annotated specimen (§4, desktop): the portrait pinned with the four
   facts using the maquette's own hotspot language — leader lines ending in
   crosshairs locked onto the photo. Geometry lives in stage coordinates
   (a 600×640 design box; the SVG and the % positions map onto the same
   box, so they stay in register at any width). */
interface PinGeo {
  c: string; // accent — the value label + leader + crosshair
  box: CSSProperties; // callout position in the stage
  line: [number, number, number, number]; // leader, callout → crosshair edge
  mark: [number, number]; // crosshair centre, on the portrait
}
// Design box is 600×720. The portrait occupies the centre; each fact is pinned
// to a corner with a leader line ending in a crosshair on the photo's edge.
const PINS: PinGeo[] = [
  { c: '#27e8f2', box: { left: 0, top: '1%', width: '25%', textAlign: 'right' }, line: [126, 74, 184, 150], mark: [188, 154] },
  { c: '#ff9068', box: { left: '75%', top: '12%', width: '25%' }, line: [470, 176, 418, 188], mark: [414, 190] },
  { c: '#a9f75c', box: { left: '75%', top: '58%', width: '25%' }, line: [470, 430, 418, 380], mark: [414, 376] },
  { c: '#27e8f2', box: { left: '1%', top: '80%', width: '26%', textAlign: 'right' }, line: [130, 566, 186, 408], mark: [190, 404] },
];

function AboutStage({ facts }: { facts: { label: string; value: string }[] }) {
  const reduced = useReducedMotion();
  const [ref, shown] = useReveal<HTMLDivElement>();
  const [hot, setHot] = useState<number | null>(null);

  // Cursor-driven holographic tilt: the whole specimen panel leans toward the
  // pointer (everything tilts as one plane, so the leaders stay locked to the
  // photo), while the portrait sits proud of the plane for a parallax pop.
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const px = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
      const py = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        el.style.setProperty('--px', px.toFixed(3));
        el.style.setProperty('--py', py.toFixed(3));
      });
    };
    const reset = () => {
      el.style.setProperty('--px', '0');
      el.style.setProperty('--py', '0');
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', reset);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', reset);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  const list = facts.slice(0, PINS.length);
  return (
    <div
      className="about__stage"
      ref={ref}
      data-shown={shown || undefined}
      data-hot={hot != null || undefined}
      style={hot != null ? ({ '--hotc': PINS[hot].c } as CSSProperties) : undefined}
    >
      <div className="about__stage-tilt">
        <AboutPortrait>
          <span className="about__scan" aria-hidden="true" />
        </AboutPortrait>
        <svg className="about__stage-svg" viewBox="0 0 600 720" preserveAspectRatio="none" aria-hidden="true">
          {list.map((f, i) => {
            const s = PINS[i];
            return (
              <g
                key={f.label}
                className="about__lead-g"
                data-on={hot === i || undefined}
                stroke={s.c}
                fill="none"
                strokeWidth="1"
                style={{ '--i': i } as CSSProperties}
              >
                <line
                  className="about__lead-line"
                  pathLength={1}
                  x1={s.line[0]}
                  y1={s.line[1]}
                  x2={s.line[2]}
                  y2={s.line[3]}
                />
                <g className="about__lead-mark">
                  <circle cx={s.mark[0]} cy={s.mark[1]} r="3.4" />
                  <line x1={s.mark[0]} y1={s.mark[1] - 9} x2={s.mark[0]} y2={s.mark[1] - 4.5} />
                  <line x1={s.mark[0]} y1={s.mark[1] + 4.5} x2={s.mark[0]} y2={s.mark[1] + 9} />
                  <line x1={s.mark[0] - 9} y1={s.mark[1]} x2={s.mark[0] - 4.5} y2={s.mark[1]} />
                  <line x1={s.mark[0] + 4.5} y1={s.mark[1]} x2={s.mark[0] + 9} y2={s.mark[1]} />
                </g>
              </g>
            );
          })}
        </svg>
        <dl className="about__pins">
          {list.map((f, i) => (
            <div
              key={f.label}
              className="about__callout"
              data-on={hot === i || undefined}
              style={{ ...PINS[i].box, '--c': PINS[i].c, '--i': i } as CSSProperties}
              onMouseEnter={() => setHot(i)}
              onMouseLeave={() => setHot((h) => (h === i ? null : h))}
            >
              <dt>{f.label}</dt>
              <dd>
                <Scramble text={f.value} delay={350 + i * 170} wrap />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/* ---- The bio, made skimmable ----------------------------------------------
   The bio was one long column, and a long column is the part of a portfolio
   people scroll past. It's the same words, laid out so a skim still gets the
   gist: the lead said out loud, a row of numbers, and the paragraphs side by
   side in pairs, each with a phrase of its own highlighted as it arrives. No
   headings over them: it's a person talking, not a brochure. All of it comes
   from the same site.json fields as before (the CMS round-trips that file
   against a fixed model), and the numbers are counted from the content, so
   they can't drift out of date. */

/** `*words*` in the About copy are the line's highlight (a marker sweeps in
 *  under them as the section arrives); everything else is plain text. */
function Marked({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*([^*]+)\*/g).map((part, i) =>
        i % 2 ? (
          <mark key={i} className="about__mark">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** The numbers, counted from the content itself. */
function aboutStats() {
  const career = site.career ?? [];
  const first = Math.min(...career.map((c) => Number(c.from.slice(0, 4))).filter(Boolean));
  const teams = new Set(career.map((c) => c.company)).size;
  return [
    { n: new Date().getFullYear() - (Number.isFinite(first) ? first : 2016), label: 'years of making it work' },
    { n: cases.length, label: 'projects, shipped or shelved' },
    { n: teams, label: 'teams, from start-ups to the military police' },
    // the launch pad in the city builds its rocket as projects wake (city.tsx)
    { n: 1, label: 'rocket on a pad in the city. Wake all ten projects to fly it' },
  ];
}

/** Counts up from zero once it's on screen; reduced motion shows the number. */
function CountUp({ to, run }: { to: number; run: boolean }) {
  const reduced = useReducedMotion();
  const [v, setV] = useState(reduced ? to : 0);
  useEffect(() => {
    if (reduced || !run) {
      if (reduced) setV(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const dur = 700 + Math.min(to, 20) * 40;
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / dur);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, run, reduced]);
  return <>{v}</>;
}

function AboutStats() {
  const [ref, shown] = useReveal<HTMLDListElement>();
  const stats = aboutStats();
  return (
    <dl className="about__stats" ref={ref} data-shown={shown || undefined}>
      {stats.map((st, i) => (
        <div key={st.label} className="about__stat" style={{ '--i': i } as CSSProperties}>
          <dt>{st.label}</dt>
          <dd>
            <CountUp to={st.n} run={shown} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** One paragraph of the bio. Each reveals on its own as it scrolls in —
 *  watching the four as one block left a phone looking at a blank gap until
 *  a quarter of a 2000px column was on screen. */
function AboutChapter({ text, i }: { text: string; i: number }) {
  const [ref, shown] = useReveal<HTMLParagraphElement>();
  return (
    <p ref={ref} className="about__chapter" data-shown={shown || undefined} style={{ '--i': i } as CSSProperties}>
      <Marked text={text} />
    </p>
  );
}

function AboutChapters({ body }: { body: string[] }) {
  return (
    <div className="about__chapters">
      {body.map((p, i) => (
        <AboutChapter key={i} text={p} i={i} />
      ))}
    </div>
  );
}

function AboutLead({ text }: { text: string }) {
  const [ref, shown] = useReveal<HTMLParagraphElement>();
  return (
    <p className="about__lead" ref={ref} data-shown={shown || undefined}>
      <Marked text={text} />
    </p>
  );
}

export function About() {
  const a = site.about;
  return (
    <section id="about" className="section section--instrument">
      <div className="container">
        {/* the note is where "based in" puts him on a map */}
        <SectionHead id="about" title={a.title} note="52.09° N · 5.12° E" />
        <div className="about__grid">
          <div className="about__main">
            <AboutLead text={a.lead} />
            <AboutStats />
            <AboutChapters body={a.body} />
          </div>
          <div className="about__side">
            <AboutStage facts={a.facts} />
            {/* Narrow screens — the classic stack; the stage needs its ring of
                callouts to breathe, so it only renders wide (CSS toggles). */}
            <div className="about__fallback">
              <AboutPortrait />
              <dl className="about__list">
                {a.facts.map((f) => (
                  <div key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
