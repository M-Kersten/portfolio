// The Virtuele Brigade's chase, in stages (scenario.tsx draws it on the
// monitor and runs it from the editor): the story on its own, apart from how
// it's drawn. A small district, a suspect, and the two in VR after it, one
// clue at a time.
//
// Each story starts at the checkpoint. A stage shows a clue on the map (the
// suspect running off, a witness pointing the way, footprints, the suspect
// hiding) and then waits for you: point the team where the clue says and they
// walk there along the streets, and the next clue comes. At the last one the
// suspect's hiding, and where you point is the far side of it: one of the two
// goes round to cut it off while the other waits, and then they close in from
// both sides and have it. Then they walk back to the checkpoint and the next
// story starts. Nothing happens until you point: the story waits for you.
import { Vector2 } from 'three';

/* The district, as the map shows it: junctions on a grid, a canal across the
   middle with a bridge at each end. Units are the map's own (about a block a
   fifth of one), x across and z down the map. */
export const COLS = [-0.38, -0.17, 0.04, 0.25, 0.46];
export const ROWS = [-0.3, -0.12, 0.06, 0.24];
export const CANAL = { z: -0.03, w: 0.07 }; // between the second row and the third
export const BRIDGES = [1, 3]; // the columns that cross it
export const node = (r: number, c: number) => r * COLS.length + c;
export const NODES = ROWS.flatMap((z) => COLS.map((x) => ({ x, z })));
export const STREETS: [number, number][] = [];
for (let r = 0; r < ROWS.length; r++) for (let c = 0; c + 1 < COLS.length; c++) STREETS.push([node(r, c), node(r, c + 1)]);
for (let r = 0; r + 1 < ROWS.length; r++) for (let c = 0; c < COLS.length; c++) if (r !== 1 || BRIDGES.includes(c)) STREETS.push([node(r, c), node(r + 1, c)]);
const NEAR: number[][] = NODES.map(() => []);
STREETS.forEach(([a, b]) => {
  NEAR[a].push(b);
  NEAR[b].push(a);
});
const gap = (a: number, b: number) => Math.hypot(NODES[a].x - NODES[b].x, NODES[a].z - NODES[b].z);

/** The way from junction `from` to `to` along the streets, junction by
 *  junction, keeping off `avoid` ([] if there's none). */
export function route(from: number, to: number, avoid = -1): number[] {
  const n = NODES.length;
  const d = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  d[from] = 0;
  for (;;) {
    let k = -1;
    for (let i = 0; i < n; i++) if (!done[i] && d[i] < Infinity && (k < 0 || d[i] < d[k])) k = i;
    if (k < 0 || k === to) break;
    done[k] = true;
    for (const m of NEAR[k]) {
      if (m === avoid || done[m]) continue;
      if (d[k] + gap(k, m) < d[m]) {
        d[m] = d[k] + gap(k, m);
        prev[m] = k;
      }
    }
  }
  const out = [to];
  while (out[0] !== from) {
    const p = prev[out[0]];
    if (p < 0) return [];
    out.unshift(p);
  }
  return out;
}

/* The places the stories go, each with the mark the map draws for it (in the
   block beside its junction, `dx`/`dz` off it). */
export type Icon = 'barrier' | 'stall' | 'tree' | 'train' | 'anchor' | 'shed';
export const PLACES: { at: number; icon: Icon; dx: number; dz: number }[] = [
  { at: node(2, 2), icon: 'barrier', dx: 0.07, dz: 0.06 }, // the checkpoint
  { at: node(0, 1), icon: 'stall', dx: 0.08, dz: 0.07 }, // the market
  { at: node(3, 4), icon: 'anchor', dx: -0.08, dz: -0.07 }, // the harbour
  { at: node(3, 2), icon: 'shed', dx: -0.08, dz: -0.07 }, // the sheds
  { at: node(0, 0), icon: 'tree', dx: 0.08, dz: 0.07 }, // the park
  { at: node(0, 4), icon: 'train', dx: -0.08, dz: 0.07 }, // the station
];
export const CHECKPOINT = node(2, 2);

/** A clue: the suspect running off from one junction to another (and out of
 *  sight), a witness at one pointing to another, footprints from the team to
 *  another, or the suspect hiding at one (the far side of it is where to point). */
export type Clue = { kind: 'run'; from: number; to: number } | { kind: 'witness'; at: number; to: number } | { kind: 'prints'; to: number } | { kind: 'hiding'; at: number };
export interface Stage {
  head: string; // what's happening, along the top of the map
  sub: string; // what to do about it
  clue: Clue;
  target: number; // where to point the team
}
/** The stories, in turn. */
export const STORIES: Stage[][] = [
  [
    { head: 'A DRIVER RUNS FROM THE CHECKPOINT', sub: 'POINT THE TEAM AFTER THEM', clue: { kind: 'run', from: CHECKPOINT, to: node(1, 3) }, target: node(1, 3) },
    { head: 'A WITNESS: THEY RAN TO THE MARKET', sub: 'SEND THE TEAM TO THE MARKET', clue: { kind: 'witness', at: node(1, 4), to: node(0, 1) }, target: node(0, 1) },
    { head: 'FOOTPRINTS, DOWN TO THE HARBOUR', sub: 'FOLLOW THEM', clue: { kind: 'prints', to: node(3, 4) }, target: node(3, 4) },
    { head: 'THERE, HIDING BY THE SHEDS', sub: 'SEND ONE ROUND THE BACK TO CUT THEM OFF', clue: { kind: 'hiding', at: node(3, 2) }, target: node(3, 1) },
  ],
  [
    { head: 'A DRIVER RUNS FROM THE CHECKPOINT', sub: 'POINT THE TEAM AFTER THEM', clue: { kind: 'run', from: CHECKPOINT, to: node(1, 1) }, target: node(1, 1) },
    { head: 'A DOG WALKER SAW THEM IN THE PARK', sub: 'SEND THE TEAM TO THE PARK', clue: { kind: 'witness', at: node(1, 0), to: node(0, 0) }, target: node(0, 0) },
    { head: 'FOOTPRINTS, OFF TO THE STATION', sub: 'FOLLOW THEM', clue: { kind: 'prints', to: node(0, 4) }, target: node(0, 4) },
    { head: 'THERE, ON THE PLATFORM', sub: 'SEND ONE ROUND THE BACK TO CUT THEM OFF', clue: { kind: 'hiding', at: node(1, 4) }, target: node(1, 3) },
  ],
];

export const WALK = 0.28; // units a second the team walks the map
export const LOOK = 0.7; // s they look about on getting somewhere, before the next clue
export const CLUE_LEN = { run: 2.2, witness: 1.1, prints: 1.4, hiding: 0.6 }; // s each kind of clue takes to show
const BRIEF = 1.6; // s at the checkpoint before the story starts
export const CAUGHT_LEN = 3.2; // s the catch holds before they head back

/** One of the two on the map: walking `path` (junctions), `s` along it. They
 *  walk the same path together, and the map draws the second beside the first. */
export interface Walker {
  path: number[];
  s: number;
}
const standing = (n: number): Walker => ({ path: [n], s: 0 });
/** Where on its path a walker is. */
export function place(w: Walker, out: Vector2) {
  let s = Math.max(0, w.s);
  for (let k = 0; k + 1 < w.path.length; k++) {
    const l = gap(w.path[k], w.path[k + 1]);
    if (s <= l) {
      const a = NODES[w.path[k]];
      const b = NODES[w.path[k + 1]];
      return out.set(a.x + ((b.x - a.x) * s) / l, a.z + ((b.z - a.z) * s) / l);
    }
    s -= l;
  }
  const e = NODES[w.path[w.path.length - 1]];
  return out.set(e.x, e.z);
}
/** How long a path is. */
export const length = (p: number[]) => p.reduce((n, a, k) => (k ? n + gap(p[k - 1], a) : 0), 0);
const end = (w: Walker) => w.path[w.path.length - 1];
const there = (w: Walker) => w.s >= length(w.path) - 1e-6;

export type Phase = 'brief' | 'clue' | 'wait' | 'go' | 'round' | 'close' | 'caught' | 'home';
export interface Story {
  phase: Phase;
  t: number; // s in this phase
  story: number;
  stage: number;
  /** the two: walking together (the map draws the second beside the first), or apart
   *  while one goes round the back */
  team: Walker[];
  done: number; // stages done this story
}
export const newStory = (): Story => ({ phase: 'brief', t: 0, story: 0, stage: 0, team: [standing(CHECKPOINT), standing(CHECKPOINT)], done: 0 });
export const stageOf = (s: Story): Stage | null => STORIES[s.story][s.stage] ?? null;
/** Where the team stands (the first of the two). */
export const teamAt = (s: Story) => end(s.team[0]);

/** What a frame of the story did, if anything: a clue came, you sent the
 *  team, they got there, they caught the suspect, a new story began. */
export type Beat = 'clue' | 'arrived' | 'caught' | 'brief' | null;

/** You've pointed the team to the stage's target: off they go (at the last
 *  stage, one round the back while the other waits by the hiding place). */
export function send(s: Story): boolean {
  const st = stageOf(s);
  if (s.phase !== 'wait' || !st) return false;
  const from = teamAt(s);
  if (st.clue.kind === 'hiding') {
    const hide = st.clue.at;
    // the first to the junction before the hiding place, on the team's side;
    // the second round the back to where you pointed, keeping off it
    const near = route(from, hide);
    s.team[0] = { path: near.slice(0, -1), s: 0 };
    s.team[1] = { path: route(from, st.target, hide), s: 0 };
    s.phase = 'round';
  } else {
    const p = route(from, st.target);
    s.team = [{ path: p, s: 0 }, { path: p, s: 0 }];
    s.phase = 'go';
  }
  s.t = 0;
  return true;
}

/** One frame of the story. */
export function step(s: Story, dt: number): Beat {
  s.t += dt;
  const st = stageOf(s);
  const walk = (w: Walker, k = 1) => {
    w.s = Math.min(length(w.path), w.s + WALK * k * dt);
  };
  switch (s.phase) {
    case 'brief':
      if (s.t < BRIEF) return null;
      Object.assign(s, { phase: 'clue', t: 0, stage: 0, done: 0 });
      return 'clue';
    case 'clue':
      if (st && s.t >= LOOK + CLUE_LEN[st.clue.kind]) Object.assign(s, { phase: 'wait', t: 0 });
      return null;
    case 'wait':
      return null;
    case 'go': {
      s.team.forEach((w) => walk(w));
      if (!s.team.every(there)) return null;
      s.done++;
      s.team = [standing(teamAt(s)), standing(teamAt(s))];
      Object.assign(s, { phase: 'clue', t: 0, stage: s.stage + 1 });
      return 'arrived';
    }
    case 'round':
      // the second goes round the back (quicker, it has further to go)
      walk(s.team[0]);
      walk(s.team[1], 1.6);
      if (!there(s.team[0]) || !there(s.team[1])) return null;
      if (st?.clue.kind === 'hiding') {
        const hide = st.clue.at;
        s.team = s.team.map((w) => ({ path: [end(w), hide], s: 0 }));
      }
      Object.assign(s, { phase: 'close', t: 0 });
      return null;
    case 'close':
      s.team.forEach((w) => walk(w, 0.8));
      if (!s.team.every(there)) return null;
      s.done++;
      Object.assign(s, { phase: 'caught', t: 0 });
      return 'caught';
    case 'caught':
      if (s.t < CAUGHT_LEN) return null;
      {
        // back to the checkpoint, together
        const p = route(teamAt(s), CHECKPOINT);
        s.team = [{ path: p, s: 0 }, { path: p, s: 0 }];
      }
      Object.assign(s, { phase: 'home', t: 0, story: (s.story + 1) % STORIES.length, stage: 0 });
      return null;
    case 'home':
      s.team.forEach((w) => walk(w, 1.3));
      if (!s.team.every(there)) return null;
      s.team = [standing(CHECKPOINT), standing(CHECKPOINT)];
      Object.assign(s, { phase: 'brief', t: 0, done: 0 });
      return 'brief';
  }
  return null;
}
