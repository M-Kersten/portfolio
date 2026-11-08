// The Virtuele Brigade's chase through a terminal, room by room (scenario.tsx
// runs it from the editor, terminalArt.ts draws it): the story on its own,
// apart from how it's drawn. Four rooms in a square, a suspect, and the two in
// VR after them.
//
// The monitor shows one room at a time, from above. A story starts at
// passport control: a traveller bolts for the door and out of the room, and the
// story waits for you to point the team after them (rest the cursor on the
// door). The two walk out of the frame and the view pans to the next room,
// where they are. In the baggage hall and the staff corridor the suspect's
// hiding: point at a hiding place and one of the two goes to look while the
// other keeps watch, until they find them and the suspect runs for the next
// door. On the loading dock they've cornered them: point at the far side of
// where they hide and one goes round the back to cut them off while the other
// waits, and they close in and have them. Then the two walk back up to
// passport control and the next story starts. Nothing happens until you point:
// the story waits for you.

/** A point on the plan: x across, y down (toward you, on the desk). */
export type Pt = [number, number];
/** A box on the plan: x, y of its top left corner, its width and height. */
export type Rect = [number, number, number, number];

/** One room's frame, as the monitor shows it, in plan units (a px of the view
 *  at 1280 across), and the room's walls inside it (room-local coordinates
 *  run from their top left corner). The rooms sit in a square, a frame each;
 *  between neighbours, their doors open onto each other across the gap. */
export const FRAME = { w: 1280, h: 520 };
export const BOX: Rect = [40, 34, 1200, 460];
/** How far a person reaches from their middle, kept off what's in the way. */
export const BODY = 26;
/** How far a person is drawn from their middle (the shoulders): out of a
 *  frame by this much, they've left it. */
export const REACH = 34;

export type Side = 'l' | 'r' | 't' | 'b';
/** A gap in a wall: which wall, how far along it its middle is, how wide. */
export interface Door {
  side: Side;
  at: number;
  w: number;
}
export type ThingKind = 'booth' | 'queue' | 'bench' | 'line' | 'arrow' | 'plant' | 'carousel' | 'trolleys' | 'pillar' | 'suitcases' | 'lockers' | 'crates' | 'cart' | 'container' | 'tug' | 'bin';
/** Something in a room, room-local: what it is (terminalArt.ts draws each
 *  kind), its box, how many of it in a row (`n`), and whether it's in the way
 *  (floor markings aren't). */
export interface Thing {
  kind: ThingKind;
  x: number;
  y: number;
  w: number;
  h: number;
  n?: number;
  floor?: boolean;
}
/** A hiding place: what it's called on the screen, the box drawn round it,
 *  where one of the two stands to look, and where the suspect is if they're
 *  there. */
export interface Spot {
  name: string;
  box: Rect;
  look: Pt;
  hide: Pt;
}
export interface Room {
  name: string;
  /** what the story says as the suspect runs for the way on */
  runs: string;
  col: number;
  row: number;
  doors: Door[];
  /** the doors the way round goes: in from the room before, on to the next */
  entry: number;
  exit: number;
  things: Thing[];
  /** where the suspect may be hiding (the baggage hall, the staff corridor) */
  spots: Spot[];
  /** where the two stand on coming in */
  posts: [Pt, Pt];
}

/* The terminal: passport control at the top left, the baggage hall beside it,
   the staff corridor under that and the loading dock beside it; the way round
   goes in that order, and from the dock back up to passport control. */
export const ROOMS: Room[] = [
  {
    name: 'PASSPORT CONTROL',
    runs: '',
    col: 0,
    row: 0,
    doors: [
      { side: 'r', at: 230, w: 92 }, // on, to the baggage hall
      { side: 'b', at: 1060, w: 92 }, // back in, from the loading dock
      { side: 'l', at: 330, w: 92 }, // arrivals
    ],
    entry: 1,
    exit: 0,
    things: [
      { kind: 'plant', x: 1120, y: 30, w: 52, h: 52 },
      { kind: 'queue', x: 120, y: 230, w: 380, h: 144, n: 3 },
      { kind: 'booth', x: 560, y: 50, w: 120, h: 90 },
      { kind: 'booth', x: 730, y: 50, w: 120, h: 90 },
      { kind: 'booth', x: 900, y: 50, w: 120, h: 90 },
      { kind: 'line', x: 540, y: 180, w: 0, h: 240, floor: true }, // wait behind the line
      { kind: 'bench', x: 640, y: 380, w: 300, h: 34 },
      { kind: 'arrow', x: 1070, y: 210, w: 60, h: 40, floor: true }, // the way on
    ],
    spots: [],
    posts: [
      [430, 175],
      [490, 125],
    ],
  },
  {
    name: 'BAGGAGE HALL',
    runs: 'THEY RUN FOR THE STAFF DOOR',
    col: 1,
    row: 0,
    doors: [
      { side: 'l', at: 230, w: 92 },
      { side: 'b', at: 820, w: 92 },
    ],
    entry: 0,
    exit: 1,
    things: [
      { kind: 'carousel', x: 256, y: 50, w: 520, h: 150 },
      { kind: 'trolleys', x: 240, y: 330, w: 160, h: 80, n: 6 },
      { kind: 'pillar', x: 810, y: 300, w: 60, h: 60 },
      { kind: 'suitcases', x: 1010, y: 110, w: 130, h: 120 },
    ],
    spots: [
      { name: 'THE CAROUSEL', box: [236, 30, 560, 190], look: [516, 250], hide: [516, 125] },
      { name: 'THE TROLLEYS', box: [220, 310, 200, 120], look: [320, 278], hide: [320, 372] },
      { name: 'THE PILLAR', box: [790, 280, 150, 100], look: [752, 330], hide: [905, 330] },
      { name: 'THE SUITCASES', box: [990, 90, 170, 160], look: [960, 282], hide: [1075, 170] },
    ],
    posts: [
      [110, 262],
      [64, 330],
    ],
  },
  {
    name: 'STAFF CORRIDOR',
    runs: 'THEY RUN FOR THE LOADING DOCK',
    col: 1,
    row: 1,
    doors: [
      { side: 't', at: 820, w: 92 },
      { side: 'l', at: 300, w: 92 },
    ],
    entry: 0,
    exit: 1,
    things: [
      { kind: 'lockers', x: 290, y: 14, w: 274, h: 60, n: 6 },
      { kind: 'lockers', x: 630, y: 14, w: 136, h: 60, n: 3 },
      { kind: 'crates', x: 330, y: 300, w: 150, h: 104 },
      { kind: 'cart', x: 720, y: 320, w: 110, h: 56 },
      { kind: 'bin', x: 1120, y: 384, w: 48, h: 48 },
    ],
    spots: [
      { name: 'THE LOCKERS', box: [276, 4, 302, 84], look: [427, 132], hide: [427, 98] },
      { name: 'THE LAST LOCKERS', box: [616, 4, 164, 84], look: [698, 132], hide: [698, 98] },
      { name: 'THE CRATES', box: [314, 284, 182, 136], look: [405, 246], hide: [505, 412] },
      { name: 'THE CART', box: [704, 304, 142, 88], look: [775, 268], hide: [866, 352] },
    ],
    posts: [
      [860, 150],
      [930, 206],
    ],
  },
  {
    name: 'LOADING DOCK',
    runs: '',
    col: 0,
    row: 1,
    doors: [
      { side: 'r', at: 300, w: 92 }, // in, from the staff corridor
      { side: 't', at: 1060, w: 92 }, // back up to passport control
      { side: 'l', at: 230, w: 160 }, // the loading door, out onto the apron
    ],
    entry: 0,
    exit: 1,
    things: [
      { kind: 'container', x: 380, y: 30, w: 100, h: 120 },
      { kind: 'container', x: 500, y: 30, w: 100, h: 120 },
      { kind: 'container', x: 620, y: 30, w: 100, h: 120 },
      { kind: 'container', x: 640, y: 270, w: 150, h: 110 },
      { kind: 'tug', x: 220, y: 290, w: 110, h: 64 },
    ],
    spots: [],
    posts: [
      [1090, 270],
      [1124, 352],
    ],
  },
];
/** The room the final catch is in. */
export const LAST = 3;

/** A story: who runs, from where at passport control (room-local), and where
 *  on the loading dock they're cornered: where they hide, where the one who
 *  waits stands (`near`), the far side you point at (`far`), and where each
 *  closes in to (`pinch`: the one who waited, the one who went round). */
export interface Story {
  head: string;
  from: Pt;
  facing: number;
  corner: { hide: Pt; near: Pt; far: Pt; pinch: [Pt, Pt] };
}
export const STORIES: Story[] = [
  {
    head: 'A TRAVELLER RUNS FROM PASSPORT CONTROL',
    from: [960, 172],
    facing: -Math.PI / 2,
    corner: { hide: [606, 326], near: [846, 326], far: [504, 286], pinch: [[620, 424], [560, 318]] },
  },
  {
    head: 'SOMEONE JUMPS THE QUEUE AND RUNS',
    from: [520, 300],
    facing: -0.6,
    corner: { hide: [184, 322], near: [388, 322], far: [112, 236], pinch: [[200, 404], [140, 292]] },
  },
];

export const WALK = 300; // plan units a second the two walk
export const HURRY = 1.3; // and how much quicker, going to search a place or round the back
export const RUN = 560; // how fast the suspect runs
export const PAN = 1.5; // s the view takes from one room to the next
export const LOOK = 1.1; // s a search takes, once there
export const FOUND = 0.9; // s the suspect's caught out before they run
export const BRIEF = 1.8; // s at passport control before someone bolts
export const CAUGHT_LEN = 3.2; // s the catch holds before they head back
const GAP = 64; // how far behind the first the second walks, going together
const OUT = 150; // how far past a door the suspect runs before they're gone

/* ---------- the plan ---------- */

const W = BOX[2];
const H = BOX[3];
/** A room's top left corner on the plan (inside its walls). */
export const originOf = (r: number): Pt => [ROOMS[r].col * FRAME.w + BOX[0], ROOMS[r].row * FRAME.h + BOX[1]];
/** A room's frame on the plan: what the view shows while it's there. */
export const frameOf = (r: number): Rect => [ROOMS[r].col * FRAME.w, ROOMS[r].row * FRAME.h, FRAME.w, FRAME.h];
/** A room-local point on the plan. */
export function onPlan(r: number, p: Pt): Pt {
  const o = originOf(r);
  return [o[0] + p[0], o[1] + p[1]];
}
const NORMAL: Record<Side, Pt> = { l: [1, 0], r: [-1, 0], t: [0, 1], b: [0, -1] };
/** A point on a door's line through the wall, room-local: `inset` into the
 *  room (out of it, negative). */
export function doorPoint(d: Door, inset = 0): Pt {
  const [nx, ny] = NORMAL[d.side];
  const x = d.side === 'l' ? 0 : d.side === 'r' ? W : d.at;
  const y = d.side === 't' ? 0 : d.side === 'b' ? H : d.at;
  return [x + nx * inset, y + ny * inset];
}

/** Where the ring goes for pointing at a door: a step into the room from
 *  it, so all of the ring shows. */
export const DOOR_RING = 34;

const inBox = (p: Pt, r: Rect) => p[0] > r[0] && p[0] < r[0] + r[2] && p[1] > r[1] && p[1] < r[1] + r[3];
const gap = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
/** Whether the segment a → b passes through the box's inside (along its
 *  edges, or through a corner, doesn't count). */
function cuts(a: Pt, b: Pt, r: Rect): boolean {
  const e = 0.5;
  const lo = [r[0] + e, r[1] + e];
  const hi = [r[0] + r[2] - e, r[1] + r[3] - e];
  let t0 = 0;
  let t1 = 1;
  for (let k = 0; k < 2; k++) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-9) {
      if (a[k] <= lo[k] || a[k] >= hi[k]) return false;
      continue;
    }
    let u = (lo[k] - a[k]) / d;
    let v = (hi[k] - a[k]) / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u);
    t1 = Math.min(t1, v);
    if (t0 >= t1) return false;
  }
  return true;
}
/** What's in the way in a room, each with a person's reach round it. */
const blocks = ROOMS.map((room) => room.things.filter((t) => !t.floor).map((t): Rect => [t.x - BODY, t.y - BODY, t.w + 2 * BODY, t.h + 2 * BODY]));

/** The way from `a` to `b` in room `r` (room-local), round what's in the way:
 *  the shortest, by way of the corners of what's in the way. Whatever either
 *  end stands right by isn't in the way (a place to look from is up against
 *  what it looks at). */
export function route(r: number, a: Pt, b: Pt): Pt[] {
  const bs = blocks[r].filter((x) => !inBox(a, x) && !inBox(b, x));
  const clear = (p: Pt, q: Pt) => bs.every((x) => !cuts(p, q, x));
  if (clear(a, b)) return [a, b];
  const m = BODY * 0.8; // room to pass along a wall
  const nodes: Pt[] = [a, b];
  for (const x of bs)
    for (const c of [
      [x[0] - 1, x[1] - 1],
      [x[0] + x[2] + 1, x[1] - 1],
      [x[0] - 1, x[1] + x[3] + 1],
      [x[0] + x[2] + 1, x[1] + x[3] + 1],
    ] as Pt[]) {
      if (c[0] < m || c[0] > W - m || c[1] < m || c[1] > H - m || bs.some((o) => inBox(c, o))) continue;
      nodes.push(c);
    }
  const n = nodes.length;
  const d = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  d[0] = 0;
  for (;;) {
    let k = -1;
    for (let i = 0; i < n; i++) if (!done[i] && d[i] < Infinity && (k < 0 || d[i] < d[k])) k = i;
    if (k < 0 || k === 1) break;
    done[k] = true;
    for (let j = 0; j < n; j++) {
      if (done[j]) continue;
      const l = d[k] + gap(nodes[k], nodes[j]);
      if (l < d[j] && clear(nodes[k], nodes[j])) {
        d[j] = l;
        prev[j] = k;
      }
    }
  }
  if (prev[1] < 0) return [a, b];
  const out: Pt[] = [b];
  for (let k = prev[1]; k >= 0; k = prev[k]) out.unshift(nodes[k]);
  return out;
}
/** `route`, on the plan. */
const routeOn = (r: number, a: Pt, b: Pt) => route(r, a, b).map((p) => onPlan(r, p));
/** Back from the plan into room `r`. */
function local(r: number, p: Pt): Pt {
  const o = originOf(r);
  return [p[0] - o[0], p[1] - o[1]];
}

/* ---------- people on the move ---------- */

/** Someone walking `path` (on the plan), `s` along it (before 0: waiting to
 *  set off), at `speed`. */
export interface Walker {
  path: Pt[];
  s: number;
  speed: number;
}
const standing = (p: Pt): Walker => ({ path: [p], s: 0, speed: WALK });
/** How long a path is. */
export const length = (p: Pt[]) => p.reduce((n, a, k) => (k ? n + gap(p[k - 1], a) : 0), 0);
/** Where on its path a walker is (into `out`), and which way the path goes
 *  there (into `dir`, if given; nothing for one standing still). */
export function place(w: Walker, out: Pt, dir?: Pt): Pt {
  let s = Math.max(0, w.s);
  const p = w.path;
  for (let k = 0; k + 1 < p.length; k++) {
    const l = gap(p[k], p[k + 1]);
    if (s <= l && l > 0) {
      out[0] = p[k][0] + ((p[k + 1][0] - p[k][0]) * s) / l;
      out[1] = p[k][1] + ((p[k + 1][1] - p[k][1]) * s) / l;
      if (dir) {
        dir[0] = (p[k + 1][0] - p[k][0]) / l;
        dir[1] = (p[k + 1][1] - p[k][1]) / l;
      }
      return out;
    }
    s -= l;
  }
  const e = p[p.length - 1];
  out[0] = e[0];
  out[1] = e[1];
  if (dir) dir[0] = dir[1] = 0;
  return out;
}
const there = (w: Walker) => w.s >= length(w.path) - 1e-6;
const where = (w: Walker): Pt => place(w, [0, 0]);
/** Whether a walker's on its way (set off, not there yet). */
export const walking = (w: Walker) => w.s > 0 && !there(w);

/* ---------- the story ---------- */

export type Phase = 'brief' | 'bolt' | 'door' | 'go' | 'search' | 'look' | 'found' | 'corner' | 'round' | 'close' | 'caught' | 'home';
export interface Chase {
  phase: Phase;
  t: number; // s in this phase
  story: number;
  /** the room the view's on, and while it pans (`pan` 0 → 1; −1 when it's
   *  still) the one it's on its way to */
  room: number;
  to: number;
  pan: number;
  team: [Walker, Walker];
  /** the one of the two who goes first (going together), or goes to look */
  lead: number;
  /** the suspect: where they run, and whether they're there to see */
  suspect: Walker & { shown: boolean };
  /** the hiding place they're in, the ones searched, the one being searched */
  hide: number;
  searched: boolean[];
  spot: number;
  /** rooms done this story (a pip each) */
  done: number;
}
export function newChase(story = 0): Chase {
  const st = STORIES[story];
  return {
    phase: 'brief',
    t: 0,
    story,
    room: 0,
    to: 0,
    pan: -1,
    team: [standing(onPlan(0, ROOMS[0].posts[0])), standing(onPlan(0, ROOMS[0].posts[1]))],
    lead: 0,
    suspect: { ...standing(onPlan(0, st.from)), speed: RUN, shown: true },
    hide: 0,
    searched: [],
    spot: -1,
    done: 0,
  };
}

/** What can be pointed at now, and what it does: the door on (`door`), a
 *  hiding place (`spot`, by its index), the far side of where they're
 *  cornered (`far`). */
export type Target = { kind: 'door' } | { kind: 'spot'; i: number } | { kind: 'far' };
export function targets(c: Chase): Target[] {
  if (c.phase === 'door') return [{ kind: 'door' }];
  if (c.phase === 'search') return ROOMS[c.room].spots.flatMap((_, i): Target[] => (c.searched[i] ? [] : [{ kind: 'spot', i }]));
  if (c.phase === 'corner') return [{ kind: 'far' }];
  return [];
}

/** What a frame of the story did, if anything: someone bolted, the two got
 *  to the next room, a place searched and nothing there, the suspect found,
 *  caught, a new story begun. */
export type Beat = 'bolt' | 'arrived' | 'empty' | 'found' | 'caught' | 'brief' | null;

function set(c: Chase, phase: Phase) {
  c.phase = phase;
  c.t = 0;
}
/** The two going on together into the next room (`to`), through the door
 *  between: the nearer the door first, the other behind. */
function goOn(c: Chase, to: number, out: number, into: number) {
  const r = c.room;
  const a = doorPoint(ROOMS[r].doors[out], 60);
  const b = onPlan(to, doorPoint(ROOMS[to].doors[into], 60));
  const paths = c.team.map((w, i) => [...routeOn(r, local(r, where(w)), a), ...routeOn(to, local(to, b), ROOMS[to].posts[i])]) as [Pt[], Pt[]];
  // (to the door, each: the shorter way goes first)
  const toDoor = c.team.map((w) => length(route(r, local(r, where(w)), a)));
  c.lead = toDoor[0] <= toDoor[1] ? 0 : 1;
  const f = 1 - c.lead;
  c.team = [
    { path: paths[0], s: 0, speed: WALK },
    { path: paths[1], s: 0, speed: WALK },
  ];
  // the second sets off once the first's a step ahead
  c.team[f].s = Math.min(0, toDoor[f] - toDoor[c.lead] - GAP);
  c.to = to;
  c.pan = -1;
}
/** The suspect off for the way on, from where they are, and out of the room. */
function runFor(c: Chase) {
  const r = c.room;
  const d = ROOMS[r].doors[ROOMS[r].exit];
  const path = [...routeOn(r, local(r, where(c.suspect)), doorPoint(d, 60)), onPlan(r, doorPoint(d, -OUT))];
  Object.assign(c.suspect, { path, s: 0, speed: RUN, shown: true });
}

/** Cornered, if you pointed at the far side now: which of the two would wait
 *  on this side (the nearer), the way they'd go to it, and the way the other
 *  would go round the back (on the plan). */
export function wayRound(c: Chase): { lead: number; near: Pt[]; far: Pt[] } {
  const r = c.room;
  const k = STORIES[c.story].corner;
  const near = c.team.map((w) => route(r, local(r, where(w)), k.near));
  const lead = length(near[0]) <= length(near[1]) ? 0 : 1;
  return { lead, near: near[lead].map((p) => onPlan(r, p)), far: routeOn(r, local(r, where(c.team[1 - lead])), k.far) };
}

/** You've rested the cursor on `t`: the story goes on (false if it can't). */
export function act(c: Chase, t: Target): boolean {
  const r = c.room;
  const room = ROOMS[r];
  if (t.kind === 'door' && c.phase === 'door') {
    c.done++;
    goOn(c, (r + 1) % ROOMS.length, room.exit, ROOMS[(r + 1) % ROOMS.length].entry);
    set(c, 'go');
    return true;
  }
  if (t.kind === 'spot' && c.phase === 'search' && !c.searched[t.i]) {
    const spot = room.spots[t.i];
    // the nearer of the two goes to look; the other stays, keeping watch
    const ways = c.team.map((w) => route(r, local(r, where(w)), spot.look));
    c.lead = length(ways[0]) <= length(ways[1]) ? 0 : 1;
    c.team[c.lead] = { path: ways[c.lead].map((p) => onPlan(r, p)), s: 0, speed: WALK * HURRY };
    c.team[1 - c.lead] = standing(where(c.team[1 - c.lead]));
    c.spot = t.i;
    set(c, 'look');
    return true;
  }
  if (t.kind === 'far' && c.phase === 'corner') {
    const way = wayRound(c);
    c.lead = way.lead;
    c.team[c.lead] = { path: way.near, s: 0, speed: WALK };
    c.team[1 - c.lead] = { path: way.far, s: 0, speed: WALK * HURRY };
    set(c, 'round');
    return true;
  }
  return false;
}

/** One frame of the story. */
export function step(c: Chase, dt: number): Beat {
  c.t += dt;
  const r = c.room;
  const room = ROOMS[r];
  const walk = (w: Walker, k = 1) => {
    w.s = Math.min(length(w.path), w.s + w.speed * k * dt);
  };
  switch (c.phase) {
    case 'brief':
      if (c.t < BRIEF) return null;
      runFor(c);
      set(c, 'bolt');
      return 'bolt';
    case 'bolt':
      walk(c.suspect);
      if (!there(c.suspect)) return null;
      c.suspect.shown = false;
      set(c, 'door');
      return null;
    case 'door':
    case 'search':
    case 'corner':
      return null;
    case 'go':
    case 'home': {
      c.team.forEach((w) => walk(w));
      // the view pans once the first is out of the frame
      if (c.pan < 0) {
        const f = frameOf(r);
        const p = where(c.team[c.lead]);
        if (p[0] < f[0] - REACH || p[0] > f[0] + f[2] + REACH || p[1] < f[1] - REACH || p[1] > f[1] + f[3] + REACH) c.pan = 0;
      }
      if (c.pan >= 0) c.pan = Math.min(1, c.pan + dt / PAN);
      if (c.pan < 1 || !c.team.every(there)) return null;
      const home = c.phase === 'home';
      c.room = c.to;
      c.pan = -1;
      c.team = [standing(where(c.team[0])), standing(where(c.team[1]))];
      if (home) {
        // back at passport control: the next story
        const next = newChase((c.story + 1) % STORIES.length);
        Object.assign(c, { ...next, team: c.team });
        return 'brief';
      }
      if (c.room === LAST) {
        // cornered: there they are, hiding
        const k = STORIES[c.story].corner;
        Object.assign(c.suspect, standing(onPlan(c.room, k.hide)), { speed: RUN, shown: true });
        set(c, 'corner');
      } else {
        c.searched = ROOMS[c.room].spots.map(() => false);
        c.hide = Math.floor(Math.random() * ROOMS[c.room].spots.length);
        c.spot = -1;
        set(c, 'search');
      }
      return 'arrived';
    }
    case 'look': {
      const w = c.team[c.lead];
      walk(w);
      // (the look starts once they're there)
      if (!there(w)) c.t = 0;
      if (c.t < LOOK) return null;
      c.searched[c.spot] = true;
      if (c.spot === c.hide) {
        Object.assign(c.suspect, standing(onPlan(r, room.spots[c.spot].hide)), { speed: RUN, shown: true });
        set(c, 'found');
        return 'found';
      }
      set(c, 'search');
      return 'empty';
    }
    case 'found':
      if (c.t < FOUND) return null;
      runFor(c);
      set(c, 'bolt');
      return null;
    case 'round':
      c.team.forEach((w) => walk(w));
      if (!c.team.every(there)) return null;
      {
        // then both close in
        const k = STORIES[c.story].corner;
        const o = 1 - c.lead;
        c.team[c.lead] = { path: routeOn(r, local(r, where(c.team[c.lead])), k.pinch[0]), s: 0, speed: WALK * 0.8 };
        c.team[o] = { path: routeOn(r, local(r, where(c.team[o])), k.pinch[1]), s: 0, speed: WALK * 0.8 };
      }
      set(c, 'close');
      return null;
    case 'close':
      c.team.forEach((w) => walk(w));
      if (!c.team.every(there)) return null;
      c.done++;
      set(c, 'caught');
      return 'caught';
    case 'caught':
      if (c.t < CAUGHT_LEN) return null;
      // back up to passport control, the way round
      c.suspect.shown = false;
      goOn(c, 0, room.exit, ROOMS[0].entry);
      set(c, 'home');
      return null;
  }
  return null;
}

/** Where officer `i` is looking, if at something in particular (the way
 *  they're walking, otherwise). */
export function aim(c: Chase, i: number): Pt | null {
  const w = c.team[i];
  if (walking(w)) return null;
  const r = c.room;
  switch (c.phase) {
    case 'brief':
      return onPlan(r, [790, 95]); // the booths
    case 'bolt':
    case 'found':
    case 'corner':
    case 'round':
    case 'close':
    case 'caught':
      return c.suspect.shown || c.phase === 'caught' ? where(c.suspect) : onPlan(r, doorPoint(ROOMS[r].doors[ROOMS[r].exit]));
    case 'door':
      return onPlan(r, doorPoint(ROOMS[r].doors[ROOMS[r].exit], DOOR_RING));
    case 'search':
      return onPlan(r, [600, 230]);
    case 'look': {
      const b = ROOMS[r].spots[c.spot].box;
      return onPlan(r, [b[0] + b[2] / 2, b[1] + b[3] / 2]);
    }
  }
  return null;
}

/** The story's line along the top of the screen: what's happening, and what
 *  to do about it. */
export function lines(c: Chase): [string, string] {
  const room = ROOMS[c.room];
  const st = STORIES[c.story];
  const ran = c.room === 0 ? st.head : `THERE! ${room.runs}`;
  switch (c.phase) {
    case 'brief':
      return ['ON PATROL AT PASSPORT CONTROL', 'TWO IN VR, YOU IN THE EDITOR'];
    case 'bolt':
    case 'found':
      return [ran, ''];
    case 'door':
      return [ran, 'POINT THE TEAM AFTER THEM'];
    case 'go':
      return c.pan < 0 ? [ran, 'THE TEAM GOES AFTER THEM'] : [`ON THEIR WAY TO THE ${ROOMS[c.to].name}`, ''];
    case 'search':
      return [`THEY'RE HIDING IN THE ${room.name}`, c.searched.some(Boolean) ? 'NOT THERE: POINT AT ANOTHER PLACE' : 'SEARCH IT: POINT AT A HIDING PLACE'];
    case 'look':
      return [`THEY'RE HIDING IN THE ${room.name}`, `CHECKING ${room.spots[c.spot].name}`];
    case 'corner':
      return ['CORNERED ON THE LOADING DOCK', 'SEND ONE ROUND THE BACK TO CUT THEM OFF'];
    case 'round':
      return ['ONE GOES ROUND THE BACK', 'THE OTHER WAITS'];
    case 'close':
      return ['CLOSING IN', 'FROM BOTH SIDES'];
    case 'caught':
      return ['CAUGHT', 'WELL DONE'];
    case 'home':
      return ['BACK TO PASSPORT CONTROL', ''];
  }
}
