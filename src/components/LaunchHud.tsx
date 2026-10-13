import { useEffect, useRef } from 'react';
import {
  BOOSTER_ENGINES,
  BOOSTER_RINGS,
  MILESTONES,
  SHIP_ENGINES,
  SHIP_RINGS,
  T,
  boosterEngines,
  boosterTelemetry,
  clockLabel,
  film,
  missionTime,
  shipEngines,
  shipTelemetry,
  type Telemetry,
} from '../scene/launchPlan';
import { launchAudio } from '../lib/launchAudio';

// The launch's telemetry, the way a launch broadcast shows it: each stage's
// speed and altitude, its engines as a diagram of dots that light as they
// start and go dark as they shut down, its propellant, the mission clock and a
// track of the milestones along the bottom. It all reads the flight plan
// (launchPlan.ts) at the film's clock, which the scene writes every frame;
// nothing here re-renders per frame — a loop writes the numbers and classes
// straight into the DOM, and drives the film's sound (lib/launchAudio) off
// the same clock.

const MARKS = MILESTONES;

/** An engine diagram: the stage's nozzles seen from below, as dots. */
function Engines({ rings, scale, refs, label }: { rings: { n: number; r: number; ph: number }[]; scale: number; refs: React.MutableRefObject<(SVGCircleElement | null)[]>; label: string }) {
  let k = 0;
  const outer = Math.max(...rings.map((r) => r.r));
  const size = (outer + 0.006) * scale;
  return (
    <svg className="lhud__engines" viewBox={`${-size} ${-size} ${size * 2} ${size * 2}`} role="img" aria-label={label}>
      <circle className="lhud__hull" r={size - 0.0012 * scale} />
      {rings.map(({ n, r, ph }, ri) =>
        Array.from({ length: n }, (_, i) => {
          const a = (Math.PI * 2 * i) / n + ph;
          const idx = k++;
          return (
            <circle
              key={`${ri}-${i}`}
              ref={(el) => {
                refs.current[idx] = el;
              }}
              className="lhud__engine"
              cx={r * Math.sin(a) * scale}
              cy={-r * Math.cos(a) * scale}
              r={(rings.length === 2 && ri === 1 ? 0.0052 : 0.0029) * scale}
            />
          );
        }),
      )}
    </svg>
  );
}

function Stage({
  name,
  rings,
  refs,
  out,
  label,
}: {
  name: string;
  rings: { n: number; r: number; ph: number }[];
  refs: React.MutableRefObject<(SVGCircleElement | null)[]>;
  out: React.MutableRefObject<Record<string, HTMLElement | null>>;
  label: string;
}) {
  const set = (k: string) => (el: HTMLElement | null) => {
    out.current[k] = el;
  };
  return (
    <section className="lhud__stage">
      <h2 className="lhud__name">{name}</h2>
      <div className="lhud__body">
        <Engines rings={rings} scale={1000} refs={refs} label={label} />
        <dl className="lhud__read">
          <div>
            <dt>Speed</dt>
            <dd>
              <b ref={set('speed')}>0</b> km/h
            </dd>
          </div>
          <div>
            <dt>Altitude</dt>
            <dd>
              <b ref={set('alt')}>0</b> km
            </dd>
          </div>
          <div className="lhud__prop">
            <dt>LOX</dt>
            <dd>
              <span className="lhud__bar">
                <i ref={set('lox')} />
              </span>
            </dd>
          </div>
          <div className="lhud__prop">
            <dt>CH4</dt>
            <dd>
              <span className="lhud__bar">
                <i ref={set('ch4')} />
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

const fmt = new Intl.NumberFormat('en-US');
function write(out: Record<string, HTMLElement | null>, tm: Telemetry) {
  if (out.speed) out.speed.textContent = fmt.format(Math.round(tm.speed / 10) * 10);
  if (out.alt) out.alt.textContent = tm.alt < 10 ? tm.alt.toFixed(1) : String(Math.round(tm.alt));
  if (out.lox) out.lox.style.transform = `scaleX(${tm.lox.toFixed(3)})`;
  if (out.ch4) out.ch4.style.transform = `scaleX(${tm.ch4.toFixed(3)})`;
}

export function LaunchHud() {
  const boosterDots = useRef<(SVGCircleElement | null)[]>([]);
  const shipDots = useRef<(SVGCircleElement | null)[]>([]);
  const boosterOut = useRef<Record<string, HTMLElement | null>>({});
  const shipOut = useRef<Record<string, HTMLElement | null>>({});
  const clock = useRef<HTMLSpanElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const marks = useRef<(HTMLLIElement | null)[]>([]);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const b = new Float32Array(BOOSTER_ENGINES);
    const s = new Float32Array(SHIP_ENGINES);
    let raf = 0;
    const audio = launchAudio();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = film.time;
      const m = missionTime(t);
      audio.update(t);
      if (clock.current) clock.current.textContent = clockLabel(m);
      // the stages' numbers: one vehicle until staging
      write(boosterOut.current, boosterTelemetry(Math.max(0, m)));
      write(shipOut.current, shipTelemetry(Math.max(0, m)));
      // the engine diagrams
      boosterEngines(t, b);
      shipEngines(t, s);
      boosterDots.current.forEach((el, i) => el?.setAttribute('data-lit', b[i] > 0.5 ? '1' : b[i] > 0.02 ? '0.5' : '0'));
      shipDots.current.forEach((el, i) => el?.setAttribute('data-lit', s[i] > 0.5 ? '1' : s[i] > 0.02 ? '0.5' : '0'));
      // the milestone track: evenly spaced marks, the line filling between them
      let p = 0;
      for (let i = 0; i < MARKS.length; i++) {
        const passed = t >= MARKS[i].t;
        const el = marks.current[i];
        if (el) {
          if (passed) el.dataset.passed = '';
          else delete el.dataset.passed;
        }
        if (passed) {
          const next = MARKS[i + 1];
          p = next ? i + Math.min(1, (t - MARKS[i].t) / (next.t - MARKS[i].t)) : i;
        }
      }
      if (fill.current) fill.current.style.transform = `scaleX(${(p / (MARKS.length - 1)).toFixed(4)})`;
      // the stage blocks part company at staging
      root.current?.toggleAttribute('data-staged', t >= T.sep);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      audio.stop();
    };
  }, []);

  return (
    <div className="lhud" ref={root} aria-hidden="true">
      <div className="lhud__bar-row">
        <Stage name="Super Heavy" rings={BOOSTER_RINGS} refs={boosterDots} out={boosterOut} label="Booster engines" />
        <div className="lhud__mid">
          <span className="lhud__clock" ref={clock}>
            T−00:00:08
          </span>
          <div className="lhud__track">
            <span className="lhud__line">
              <span className="lhud__fill" ref={fill} />
            </span>
            <ol>
              {MARKS.map((mk, i) => (
                <li
                  key={mk.mark}
                  ref={(el) => {
                    marks.current[i] = el;
                  }}
                >
                  <span>{mk.mark}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <Stage name="Starship" rings={SHIP_RINGS} refs={shipDots} out={shipOut} label="Ship engines" />
      </div>
    </div>
  );
}
