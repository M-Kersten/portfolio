// The Virtuele Brigade's chase (scenario.tsx draws it, runs it from the
// editor and tells the two in VR what to do): the game on its own, apart
// from how it's drawn. A small district, a suspect running for a way out of
// it, two after it, and the streets you close.
//
// The district is in the desk's frame, at the height the two stand at:
// junctions on a grid over the space above the desk that the close-up has in
// the picture, a canal across the middle with a bridge at each end, and a way
// out at each corner. Each round the two walk to a checkpoint; a suspect gets
// out a street away, stands a moment, and runs for the nearest way out it can
// get to without a closed street or one of the two in its way, picking again
// at every junction. The first of the two goes after it, to the junction
// nearest it; the second cuts round to head it off, at the first junction on
// its way out that it can get to first. They're no faster than it, so it's the
// streets you close that catch it: it turns back from a closed one, or from one
// of the two ahead of it, stopping a beat to look about, and with no way out
// left it keeps away from them until they have it.
import { Vector2 } from 'three';

export const COLS = [-0.38, -0.17, 0.04, 0.25, 0.46];
export const ROWS = [-0.3, -0.12, 0.06, 0.24];
export const CANAL = { z: -0.03, w: 0.07 }; // between the second row and the third
export const BRIDGES = [1, 3]; // the columns that cross it
export const node = (r: number, c: number) => r * COLS.length + c;
export const GRID = COLS.length * ROWS.length;
/** The ways out: what they're called on the map's line, the junction they
 *  leave from, and where they leave the map. */
export const WAYS: { name: string; from: number; x: number; z: number }[] = [
  { name: 'the station', from: node(0, 4), x: 0.54, z: ROWS[0] },
  { name: 'the ring road', from: node(0, 0), x: COLS[0], z: -0.38 },
  { name: 'the highway', from: node(3, 0), x: -0.46, z: ROWS[3] },
  { name: 'the harbour', from: node(3, 4), x: COLS[4], z: 0.32 },
];
export const NODES = [...ROWS.flatMap((z) => COLS.map((x) => ({ x, z, way: -1 }))), ...WAYS.map((w, i) => ({ x: w.x, z: w.z, way: i }))];
export const STREETS: [number, number][] = [];
for (let r = 0; r < ROWS.length; r++) for (let c = 0; c + 1 < COLS.length; c++) STREETS.push([node(r, c), node(r, c + 1)]);
for (let r = 0; r + 1 < ROWS.length; r++) for (let c = 0; c < COLS.length; c++) if (r !== 1 || BRIDGES.includes(c)) STREETS.push([node(r, c), node(r + 1, c)]);
WAYS.forEach((w, i) => STREETS.push([w.from, GRID + i]));
const NEAR: number[][] = NODES.map(() => []);
STREETS.forEach(([a, b], i) => {
  NEAR[a].push(i);
  NEAR[b].push(i);
});
export const LEN = STREETS.map(([a, b]) => Math.hypot(NODES[a].x - NODES[b].x, NODES[a].z - NODES[b].z));
const across = (st: number, n: number) => (STREETS[st][0] === n ? STREETS[st][1] : STREETS[st][0]);
/** How long the street from junction `a` to `b` is (0: there isn't one). */
const leg = (a: number, b: number) => {
  const st = NEAR[a].find((k) => across(k, a) === b);
  return st === undefined ? 0 : LEN[st];
};

/** Each round in turn: where the suspect gets out, and where the two are,
 *  a street off on the checkpoint's side, so it runs the other way. */
export const ROUNDS = [
  { suspect: node(1, 2), cops: [node(1, 3), node(0, 3)] },
  { suspect: node(2, 2), cops: [node(2, 3), node(3, 3)] },
  { suspect: node(1, 2), cops: [node(1, 1), node(0, 1)] },
  { suspect: node(2, 2), cops: [node(2, 1), node(3, 1)] },
];
export const SPEED = { suspect: 0.08, cop: 0.08, walk: 0.15 }; // units a second: running, chasing, and walking back to the checkpoint
export const STILL = 1.6; // s the suspect stands at the checkpoint before it runs: time to read where it's going
export const REACT = [0.55, 0.85]; // s after it runs that each of the two sets off after it
export const CATCH = 0.05; // how near one of them has to get to it
const SHY = 0.1; // it won't run through a junction one of them is this near…
const BACKS = 0.12; // …and turns back from one this near ahead of it
const HESITATE = 0.35; // s it stops to look about when its way's cut
export const BLOCKS = 3; // the streets you can close a round
export const ROW = 5; // catches in a row for a full row
export const CAUGHT_LEN = 2.8; // s a catch holds before the next round
export const GONE_LEN = 2.4; // s a getaway holds

type Open = (st: number, from: number, to: number) => boolean;
/** How far every junction is from `from` along the streets `open` lets
 *  through, and the one before it on the way. A way out is the end of the line. */
function reach(from: number, open: Open) {
  const n = NODES.length;
  const d = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  d[from] = 0;
  for (;;) {
    let k = -1;
    for (let i = 0; i < n; i++) if (!done[i] && d[i] < Infinity && (k < 0 || d[i] < d[k])) k = i;
    if (k < 0) break;
    done[k] = true;
    if (NODES[k].way >= 0 && k !== from) continue;
    for (const st of NEAR[k]) {
      const m = across(st, k);
      if (done[m] || !open(st, k, m)) continue;
      if (d[k] + LEN[st] < d[m]) {
        d[m] = d[k] + LEN[st];
        prev[m] = k;
      }
    }
  }
  return { d, prev };
}
function path(prev: number[], from: number, to: number): number[] {
  const out = [to];
  while (out[0] !== from) {
    const p = prev[out[0]];
    if (p < 0) return [];
    out.unshift(p);
  }
  return out;
}
/** The two keep to the district; closed streets don't stop them. */
const INSIDE: Open = (_st, _a, b) => NODES[b].way < 0;
/** One step toward `goal` along the streets `open` lets through (-1: there, or no way). */
export function stepTo(from: number, goal: number, open: Open = INSIDE) {
  if (from === goal) return -1;
  const p = path(reach(from, open).prev, from, goal);
  return p.length > 1 ? p[1] : -1;
}

/** One of the three on the map: at a junction (`to` = `at`), or `u` of the
 *  way along street `st` from `at` to `to`. */
export interface Runner {
  at: number;
  to: number;
  st: number;
  u: number;
  wait: number;
}
const runner = (n: number): Runner => ({ at: n, to: n, st: -1, u: 0, wait: 0 });
export const still = (m: Runner) => m.to === m.at;
export function spot(m: Runner, out: Vector2) {
  const a = NODES[m.at];
  if (still(m)) return out.set(a.x, a.z);
  const b = NODES[m.to];
  return out.set(a.x + (b.x - a.x) * m.u, a.z + (b.z - a.z) * m.u);
}
/** Its heading along its street (x, z), or none standing. */
export function heading(m: Runner, out: Vector2) {
  if (still(m)) return out.set(0, 0);
  return out.set(NODES[m.to].x - NODES[m.at].x, NODES[m.to].z - NODES[m.at].z).normalize();
}
function setOff(m: Runner, to: number) {
  m.st = NEAR[m.at].find((st) => across(st, m.at) === to) ?? -1;
  m.to = to;
  m.u = 0;
}
function turnBack(m: Runner) {
  const a = m.at;
  m.at = m.to;
  m.to = a;
  m.u = 1 - m.u;
}
/** On along its street; true as it gets to the end. */
function advance(m: Runner, speed: number, dt: number) {
  if (still(m)) return false;
  m.u += (speed * dt) / LEN[m.st];
  if (m.u < 1) return false;
  m.at = m.to;
  m.u = 0;
  return true;
}

export type Phase = 'gather' | 'chase' | 'caught' | 'gone';
export interface Chase {
  phase: Phase;
  t: number; // s in this phase
  clock: number; // s since it began
  round: number;
  sus: Runner;
  cops: Runner[];
  /** the suspect's way out, junction by junction from the one it's at or
   *  making for, and which way out that is (-1: none left, it's cornered) */
  plan: number[];
  way: number;
  closed: number[];
  by: number; // which of the two caught it
  turnedAt: number;
  row: number; // catches in a row
}
/** A chase, the two starting at junctions `cops`. */
export function newChase(cops: number[]): Chase {
  return { phase: 'gather', t: 0, clock: 0, round: 0, sus: runner(ROUNDS[0].suspect), cops: cops.map(runner), plan: [], way: -1, closed: [], by: -1, turnedAt: -99, row: 0 };
}
/** The junction nearest (x, z). */
export function nearestNode(x: number, z: number) {
  let best = 0;
  for (let k = 1; k < GRID; k++) if (Math.hypot(NODES[k].x - x, NODES[k].z - z) < Math.hypot(NODES[best].x - x, NODES[best].z - z)) best = k;
  return best;
}

const _a = new Vector2();
const _b = new Vector2();
const _d = new Vector2();
const _c = [new Vector2(), new Vector2()];
/** How near the nearer of the two is to (x, z). */
function nearest(c: Chase, x: number, z: number) {
  return Math.min(...c.cops.map((m, i) => spot(m, _c[i]).distanceTo(_a.set(x, z))));
}
/** Whether one of the two is on street `st`. */
const busy = (c: Chase, st: number) => c.cops.some((m) => !still(m) && m.st === st);
/** The suspect's way from junction `from`: the nearest way out it can get to
 *  without a closed street, a street one of the two is on or a junction one of
 *  them is near. Sets `plan` (from `from`) and `way`. */
function plot(c: Chase, from: number) {
  const { d, prev } = reach(from, (st, _f, b) => !c.closed.includes(st) && !busy(c, st) && nearest(c, NODES[b].x, NODES[b].z) > SHY);
  let best = -1;
  for (let i = 0; i < WAYS.length; i++) {
    const k = GRID + i;
    if (d[k] < Infinity && (best < 0 || d[k] < d[best] - 1e-6)) best = k;
  }
  c.plan = best >= 0 ? path(prev, from, best) : [];
  c.way = best >= 0 ? NODES[best].way : -1;
}
/** Its way again, from where it's making for (or standing at): what the map
 *  shows, `plan` starting at the next junction. */
function replot(c: Chase) {
  const s = c.sus;
  plot(c, still(s) ? s.at : s.to);
  if (still(s) && c.plan.length > 1) c.plan.shift();
}
/** Where the suspect goes from the junction it's at: on its way out, or,
 *  cornered, away from the nearer of the two if there's anywhere further off
 *  (-1: it stays put). */
function flee(c: Chase): number {
  const n = c.sus.at;
  plot(c, n);
  if (c.plan.length > 1) {
    c.plan.shift();
    return c.plan[0];
  }
  let to = -1;
  let far = nearest(c, NODES[n].x, NODES[n].z);
  for (const st of NEAR[n]) {
    const m = across(st, n);
    if (c.closed.includes(st) || busy(c, st) || NODES[m].way >= 0) continue;
    const f = nearest(c, NODES[m].x, NODES[m].z);
    if (f > far + 0.03) {
      far = f;
      to = m;
    }
  }
  return to;
}
/** Where one of the two goes from the junction it's at. The first (0) is on
 *  the suspect's heels: to the junction nearest it on its street. The second
 *  (1) cuts round to head it off: to the first junction on its way out that it
 *  can get to first, or, with none, the last one before its way out, to cover
 *  that; cornered, it comes at it from the other end of its street. Either
 *  goes straight at it once it's on a street from where they stand. */
function pursue(c: Chase, i: number): number {
  const n = c.cops[i].at;
  const s = c.sus;
  if (!still(s) && (s.at === n || s.to === n)) return s.at === n ? s.to : s.at;
  const near = still(s) || s.u < 0.5 ? s.at : s.to;
  let goal = near;
  if (i === 1) {
    goal = still(s) ? s.at : near === s.at ? s.to : s.at;
    if (c.plan.length > 1) {
      const { d } = reach(n, INSIDE);
      // how far the suspect has to go to each junction on its way
      let run = still(s) ? leg(s.at, c.plan[0]) : LEN[s.st] * (1 - s.u);
      goal = c.plan[c.plan.length - 2];
      for (let k = 0; k < c.plan.length - 1; k++) {
        if (k > 0) run += leg(c.plan[k - 1], c.plan[k]);
        if (c.plan[k] === near) continue; // that's the first one's
        if (d[c.plan[k]] / SPEED.cop <= run / SPEED.suspect + 0.2) {
          goal = c.plan[k];
          break;
        }
      }
    }
  }
  return stepTo(n, goal);
}

/** What a frame of the chase did, if anything: the suspect got out at the
 *  checkpoint, it ran, they caught it, it got away. */
export type Beat = 'out' | 'run' | 'caught' | 'gone' | null;

/** Close street `st`, if it's a chase and there are any left to close. If it
 *  was on the suspect's way, it stops where it is to look about, and its way
 *  changes. */
export function closeStreet(c: Chase, st: number): boolean {
  if (c.phase !== 'chase' || c.closed.length >= BLOCKS || c.closed.includes(st)) return false;
  const s = c.sus;
  // the streets it's about to run down (its own, if it's short of the barrier)
  let from = s.at;
  let on = false;
  for (const n of c.plan) {
    const k = NEAR[from].find((x) => across(x, from) === n);
    if (k === st && !(k === s.st && !still(s) && s.u >= 0.5)) on = true;
    from = n;
  }
  c.closed.push(st);
  replot(c);
  if (on && c.t > STILL) s.wait = Math.max(s.wait, HESITATE);
  return true;
}

/** One frame of the chase. */
export function step(c: Chase, dt: number): Beat {
  c.t += dt;
  c.clock += dt;
  const R = ROUNDS[c.round];
  const s = c.sus;
  if (c.phase === 'gather') {
    // walking back to the checkpoint, along the streets
    let there = 0;
    c.cops.forEach((m, i) => {
      if (still(m)) {
        const nx = stepTo(m.at, R.cops[i]);
        if (nx >= 0) setOff(m, nx);
        else if (m.at === R.cops[i]) there++;
      } else advance(m, SPEED.walk, dt);
    });
    if (there < 2 || c.t < 0.6) return null;
    // the suspect gets out: where it'll run for shows on the map
    Object.assign(c, { phase: 'chase', t: 0, sus: runner(R.suspect), closed: [], by: -1, turnedAt: -99 });
    replot(c);
    return 'out';
  }
  if (c.phase === 'caught' || c.phase === 'gone') {
    if (c.t < (c.phase === 'caught' ? CAUGHT_LEN : GONE_LEN)) return null;
    if (c.row >= ROW) c.row = 0;
    Object.assign(c, { phase: 'gather', t: 0, round: (c.round + 1) % ROUNDS.length, plan: [], way: -1, closed: [] });
    return null;
  }
  // the chase: the suspect stands a moment, then runs, junction by junction
  let beat: Beat = null;
  if (c.t >= STILL) {
    if (c.t - dt < STILL) beat = 'run';
    if (s.wait > 0) s.wait -= dt;
    else if (still(s)) {
      const was = c.way;
      const nx = flee(c);
      if (was >= 0 && c.way !== was) {
        // its way's cut: it stops to look about before it goes the other way
        s.wait = HESITATE;
        replot(c);
      } else if (nx >= 0) setOff(s, nx);
      else s.wait = 0.25;
    } else {
      // its street closed in front of it, or one of the two coming at it: back
      spot(s, _a);
      heading(s, _d);
      const ahead = c.cops.some((m, i) => spot(m, _c[i]).distanceTo(_a) < BACKS && _b.copy(_c[i]).sub(_a).dot(_d) > 0.02);
      if (((c.closed.includes(s.st) && s.u < 0.5) || ahead) && c.clock - c.turnedAt > 0.5) {
        turnBack(s);
        s.wait = HESITATE;
        c.turnedAt = c.clock;
        replot(c);
      } else if (advance(s, SPEED.suspect, dt) && NODES[s.at].way >= 0) {
        Object.assign(c, { phase: 'gone', t: 0, row: 0 });
        return 'gone';
      }
    }
  }
  // the two, after it once they've seen it go
  c.cops.forEach((m, i) => {
    if (c.t < STILL + REACT[i]) return;
    if (m.wait > 0) {
      m.wait -= dt;
      return;
    }
    if (still(m)) {
      const nx = pursue(c, i);
      if (nx >= 0) setOff(m, nx);
      else m.wait = 0.15;
      return;
    }
    // the suspect on its street behind it: round
    if (!still(s) && s.st === m.st) {
      spot(m, _a);
      spot(s, _b).sub(_a);
      if (_b.dot(heading(m, _d)) < 0) turnBack(m);
    }
    advance(m, SPEED.cop, dt);
  });
  // caught: one of them has it
  if (c.t > STILL) {
    spot(s, _a);
    for (let i = 0; i < 2; i++)
      if (spot(c.cops[i], _c[i]).distanceTo(_a) < CATCH) {
        Object.assign(c, { phase: 'caught', t: 0, by: i, row: c.row + 1 });
        return 'caught';
      }
  }
  return beat;
}
