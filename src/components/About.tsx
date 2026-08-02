import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { site } from '../content';
import { asset } from '../lib/asset';
import { useReducedMotion } from '../lib/useReducedMotion';
import { ScanFrame } from './ScanFrame';
import { Scramble } from './Scramble';
import { SectionTitle } from './SectionTitle';

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
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [hot, setHot] = useState<number | null>(null);

  useEffect(() => {
    if (reduced) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es[0].isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

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
              <g key={f.label} className="about__lead-g" data-on={hot === i || undefined} stroke={s.c} fill="none" strokeWidth="1">
                <line
                  className="about__lead-line"
                  pathLength={1}
                  x1={s.line[0]}
                  y1={s.line[1]}
                  x2={s.line[2]}
                  y2={s.line[3]}
                  style={{ transitionDelay: `${0.12 + i * 0.16}s` }}
                />
                <g className="about__lead-mark" style={{ transitionDelay: `${0.3 + i * 0.16}s` }}>
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
              style={{ ...PINS[i].box, '--c': PINS[i].c, transitionDelay: `${0.08 + i * 0.16}s` } as CSSProperties}
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

export function About() {
  const a = site.about;
  return (
    <section id="about" className="section section--instrument">
      <div className="container">
        <div className="about__grid">
          <div>
            <SectionTitle>{a.title}</SectionTitle>
            <p className="about__lead">{a.lead}</p>
            {a.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
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
