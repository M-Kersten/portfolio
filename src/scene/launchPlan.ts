// The launch, as a flight plan: when everything happens, which engines are
// burning, how fast and how high the two stages are, and the milestones
// along the telemetry's track. Plain numbers and functions of the film's clock — no three.js — so the
// DOM telemetry (components/LaunchHud) and the scene (maquette/launch.ts,
// launchSite.tsx) read the same plan without the page's entry chunk pulling
// in the 3D stack.
//
// The clock: film seconds, liftoff at 0, the terminal count before it. The
// count and the climb past the tower run in real time; once the stack is
// clear the film becomes a time-lapse, and `missionTime`
// maps it back onto a real flight's clock, which is what the telemetry and
// the T+ readout show. The profile is a Starship flight's, rounded: Max-Q at
// about T+1:02, MECO at T+2:41 around 65 km and 5,000+ km/h, hot staging, the
// booster's boostback, and the catch at the tower at about T+6:50.

/** Seconds of terminal count shown before liftoff. */
export const COUNT = 8;

/** How much slower than its own clock the film plays: every beat stays where
 *  the plan puts it, the film just takes longer to watch. The count a little,
 *  the flight from liftoff on more, so each beat has time to land. */
const COUNT_PACE = 1.2;
const FLIGHT_PACE = 1.75;
/** The film's time, seconds of wall clock after it started. */
export function filmAt(seconds: number): number {
  const count = COUNT * COUNT_PACE;
  return seconds < count ? seconds / COUNT_PACE - COUNT : (seconds - count) / FLIGHT_PACE;
}
/** How many film seconds a wall-clock second is, at film time t. */
export const filmRate = (t: number) => 1 / (t < 0 ? COUNT_PACE : FLIGHT_PACE);

export const T = {
  start: -COUNT,
  /** the ship's quick-disconnect arm swings back to the tower */
  qd: -6.6,
  /** water through the deflector plate under the mount */
  deluge: -4.6,
  /** Raptor startup: the centre three, then the inner ring, then the outer */
  startup: -3.0,
  inner: -2.45,
  outer: -1.85,
  /** the hold-downs let go */
  release: 0,
  /** the stack is clear of the tower: the film turns into a time-lapse */
  clear: 6.2,
  maxq: 7.8,
  /** the camera alongside, through Max-Q and staging */
  tracking: 7.3,
  /** main engine cutoff: the booster's outer twenty and inner ten shut down */
  meco: 10.6,
  /** the ship lights its six through the vented ring, still attached */
  hotstage: 10.8,
  /** the stages part */
  sep: 11.2,
  /** the booster's centre three shut down */
  centerOff: 11.35,
  /** turned round, the booster relights thirteen to fly back */
  boostback: 13.0,
  boostbackEnd: 14.9,
  /** the camera stays with the ship as it flies on */
  onward: 14.6,
  /** cut back to the tower: the booster is coming home */
  ret: 16.6,
  /** the landing burn: thirteen engines, then the centre three */
  landing: 17.5,
  closeUp: 18.8,
  landing3: 18.9,
  /** the chopsticks close round it */
  close: 19.55,
  catch: 20.2,
  /** the game takes over */
  end: 22.6,
};

/** The film's clock, shared by the scene (which owns and writes it every
 *  frame) and the telemetry overlay (which reads it). `fixed` is for the
 *  capture tooling in dev: step the film that many seconds a frame instead of
 *  by the wall clock, so a slow renderer still films every beat. */
export const film = { time: -COUNT, running: false, fixed: 0 };

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Piecewise-linear lookup in [x, ...values] rows sorted by x. */
function table(rows: number[][], x: number, col: number): number {
  if (x <= rows[0][0]) return rows[0][col];
  for (let i = 1; i < rows.length; i++) {
    if (x <= rows[i][0]) {
      const a = rows[i - 1];
      const b = rows[i];
      return lerp(a[col], b[col], (x - a[0]) / (b[0] - a[0]));
    }
  }
  return rows[rows.length - 1][col];
}

/* ---------- the clock ---------- */

// film seconds → mission seconds (T+). Real time through the count and the
// climb past the tower, then compressed.
const CLOCK = [
  [-COUNT, -COUNT],
  [T.clear, T.clear],
  [T.maxq, 62],
  [T.meco, 161],
  [T.sep, 164],
  [T.boostback, 170],
  [T.ret, 236],
  [T.landing, 395],
  [T.catch, 411],
  [T.end, 414],
];

/** Mission time (seconds, negative before liftoff) at film time t. */
export function missionTime(t: number): number {
  return table(CLOCK, t, 1);
}

/** "T−00:00:08" / "T+00:02:41". */
export function clockLabel(m: number): string {
  const s = Math.abs(m < 0 ? Math.floor(m) : Math.floor(m));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `T${m < 0 ? '−' : '+'}${hh}:${mm}:${ss}`;
}

/* ---------- telemetry ---------- */

// [mission s, km/h, km]. Rounded from Starship's flights: the booster through
// MECO, its boostback taking the speed off, the fall from about 95 km and the
// landing burn; the ship accelerating on toward orbital speed.
const BOOSTER_TM = [
  [0, 0, 0],
  [10, 80, 0.12],
  [30, 420, 2.4],
  [62, 1500, 12],
  [100, 2950, 29],
  [140, 4350, 48],
  [161, 5250, 65],
  [166, 5160, 69],
  [175, 4500, 75],
  [200, 2600, 86],
  [230, 1500, 93],
  [260, 1250, 95],
  [300, 2600, 80],
  [340, 3700, 48],
  [370, 2300, 18],
  [395, 1150, 2.6],
  [405, 260, 0.35],
  [411, 0, 0.07],
  [500, 0, 0.07],
];
const SHIP_TM = [
  [0, 0, 0],
  [10, 80, 0.12],
  [30, 420, 2.4],
  [62, 1500, 12],
  [100, 2950, 29],
  [140, 4350, 48],
  [161, 5250, 65],
  [166, 5300, 69],
  [175, 5700, 75],
  [200, 7800, 98],
  [236, 10400, 122],
  [300, 14800, 143],
  [360, 19300, 150],
  [414, 23400, 152],
];
// propellant left, 0–1: [mission s, booster, ship]
const PROP = [
  [0, 1, 1],
  [161, 0.11, 1],
  [166, 0.1, 0.995],
  [230, 0.045, 0.82],
  [395, 0.04, 0.5],
  [411, 0.008, 0.46],
  [414, 0.008, 0.45],
];

export interface Telemetry {
  speed: number; // km/h
  alt: number; // km
  lox: number; // 0–1
  ch4: number; // 0–1
}
export function boosterTelemetry(m: number): Telemetry {
  const p = table(PROP, m, 1);
  return { speed: Math.max(0, table(BOOSTER_TM, m, 1)), alt: Math.max(0, table(BOOSTER_TM, m, 2)), lox: p, ch4: Math.min(1, p * 1.04) };
}
export function shipTelemetry(m: number): Telemetry {
  const p = table(PROP, m, 2);
  return { speed: Math.max(0, table(SHIP_TM, m, 1)), alt: Math.max(0, table(SHIP_TM, m, 2)), lox: p, ch4: Math.min(1, p * 1.03) };
}

/* ---------- engines ---------- */

/** Super Heavy's 33 Raptors in their three rings, and Starship's six (three
 *  sea-level in the middle, three vacuum bells round them). Radii and phases
 *  are the model's (scripts/models/build_rocket.py), in its units. */
export const BOOSTER_RINGS = [
  { n: 3, r: 0.0055, ph: 0 },
  { n: 10, r: 0.0152, ph: 0.1 },
  { n: 20, r: 0.0236, ph: 0 },
];
export const SHIP_RINGS = [
  { n: 3, r: 0.0062, ph: 0 },
  { n: 3, r: 0.0185, ph: Math.PI / 3 },
];
export const BOOSTER_ENGINES = 33;
export const SHIP_ENGINES = 6;

/** One engine coming up: lit at `on`, spooled over `rise` seconds, out at `off`
 *  (over `fall`). */
function burn(t: number, on: number, off: number, rise = 0.22, fall = 0.12): number {
  if (t < on || t > off + fall) return 0;
  return smooth(on, on + rise, t) * (1 - smooth(off, off + fall, t));
}

/** Each booster engine's thrust, 0–1, centre three first, then the ten, then
 *  the twenty (each ring in order round it), written into `out`. */
export function boosterEngines(t: number, out: Float32Array | number[]): void {
  let i = 0;
  for (let ring = 0; ring < 3; ring++) {
    const n = BOOSTER_RINGS[ring].n;
    for (let j = 0; j < n; j++, i++) {
      let v = 0;
      if (ring === 0) {
        // the centre three: first up, last off after MECO (throttled down for
        // staging), lit again for boostback and for the whole landing burn
        v = Math.max(
          burn(t, T.startup + j * 0.07, T.centerOff) * (t > T.meco ? 0.55 : 1),
          burn(t, T.boostback + j * 0.05, T.boostbackEnd),
          burn(t, T.landing + j * 0.05, T.catch - 0.05, 0.2, 0.25),
        );
      } else if (ring === 1) {
        // the inner ten: startup, boostback, and the first part of the landing
        v = Math.max(
          burn(t, T.inner + j * 0.035, T.meco + 0.08),
          burn(t, T.boostback + 0.15 + j * 0.03, T.boostbackEnd),
          burn(t, T.landing + 0.1 + j * 0.03, T.landing3, 0.2, 0.2),
        );
      } else {
        // the outer twenty: lit in sequence round the ring, out at MECO
        v = burn(t, T.outer + j * 0.026, T.meco);
      }
      out[i] = v;
    }
  }
}

/** Each ship engine's thrust: the three sea-level engines, then the three
 *  vacuum bells, lit through the ring at hot staging. */
export function shipEngines(t: number, out: Float32Array | number[]): void {
  for (let j = 0; j < 3; j++) out[j] = burn(t, T.hotstage + j * 0.04, 1e9, 0.18);
  for (let j = 0; j < 3; j++) out[3 + j] = burn(t, T.hotstage + 0.16 + j * 0.05, 1e9, 0.3);
}

/** The water deluge, 0 → 1: on before the engines light, and dying away once
 *  the stack is off the mount. */
export function deluge(t: number): number {
  return smooth(T.deluge, T.deluge + 0.6, t) * (1 - smooth(T.release + 1.2, T.release + 3.2, t));
}

/* ---------- milestones ---------- */

/** The marks along the telemetry's track. */
export const MILESTONES: { t: number; mark: string }[] = [
  { t: T.startup, mark: 'Startup' },
  { t: T.release, mark: 'Liftoff' },
  { t: T.maxq, mark: 'Max-Q' },
  { t: T.meco, mark: 'MECO' },
  { t: T.hotstage, mark: 'Staging' },
  { t: T.boostback, mark: 'Boostback' },
  { t: T.landing, mark: 'Landing' },
  { t: T.catch, mark: 'Catch' },
];
