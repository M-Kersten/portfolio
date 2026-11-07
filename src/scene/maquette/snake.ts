// Snake, as the AI accelerator's die plays it (chip.tsx DieSnake draws it):
// the game on its own, apart from how it's drawn. A board of N×N cells, three
// to a side of each of the die's sixteen tiles. The snake never stops, the way
// a snake doesn't: it heads for the cell the cursor points at and, once there,
// circles it, so it can be led about. It turns off a wall or its own body
// rather than into it, so it only crashes once there's no move left; but led
// into a corner, or circling inside its own coils, it can box itself in, and
// the longer it gets the sooner that happens. With no cursor on the die it
// plays itself: the chip's own player goes for the food, looking far enough
// ahead not to trap itself.
//
// Cells are numbered row by row: cell = z * N + x, x to the right and z toward
// the viewer (the die's far edge is row 0).

export const N = 12;
const DX = [1, 0, -1, 0];
const DZ = [0, 1, 0, -1];
/** A heading: 0 +x, 1 +z, 2 −x, 3 −z (turning back on itself is never one of the choices). */
export type Dir = 0 | 1 | 2 | 3;

export interface Snake {
  /** cells, head first */
  body: number[];
  dir: Dir;
  food: number;
  /** how many it has eaten: the score */
  eaten: number;
}

/** What a step did: moved on, ate, or ran out of room. */
export type Step = 'move' | 'eat' | 'crash';

const START = 4; // cells long at the start

export function newGame(rand: () => number = Math.random): Snake {
  const z = N >> 1;
  const x0 = (N >> 1) - 1;
  const body = Array.from({ length: START }, (_, i) => z * N + (x0 - i));
  const s: Snake = { body, dir: 0, food: -1, eaten: 0 };
  s.food = placeFood(s, rand);
  return s;
}

const xOf = (c: number) => c % N;
const zOf = (c: number) => Math.floor(c / N);

/** The cell one step from `c` heading `d`, or -1 off the board. */
function next(c: number, d: number): number {
  const x = xOf(c) + DX[d];
  const z = zOf(c) + DZ[d];
  return x < 0 || x >= N || z < 0 || z >= N ? -1 : z * N + x;
}

/** Where the food goes: a free cell, not right in front of the head if it can help it. */
function placeFood(s: Snake, rand: () => number): number {
  const taken = new Set(s.body);
  const ahead = next(s.body[0], s.dir);
  const free: number[] = [];
  for (let c = 0; c < N * N; c++) if (!taken.has(c) && c !== ahead) free.push(c);
  if (!free.length) return -1;
  return free[Math.floor(rand() * free.length)];
}

/** The cells the body will hold once it has moved: all of it but the tail,
 *  which moves on (unless it's about to eat, and so grow). */
function blocked(s: Snake, growing: boolean): Set<number> {
  return new Set(growing ? s.body : s.body.slice(0, -1));
}

/** The moves it can make: on the board, not back on itself, not into its body. */
function moves(s: Snake): { d: Dir; c: number }[] {
  const out: { d: Dir; c: number }[] = [];
  for (let d = 0; d < 4; d++) {
    if (d === (s.dir + 2) % 4) continue;
    const c = next(s.body[0], d);
    if (c < 0) continue;
    if (blocked(s, c === s.food).has(c)) continue;
    out.push({ d: d as Dir, c });
  }
  return out;
}

/** How many cells it could still reach from `from` with its body (as it
 *  will be) in the way: room to manoeuvre. */
function room(s: Snake, from: number, growing: boolean): number {
  const wall = blocked(s, growing);
  wall.add(s.body[0]);
  const seen = new Set([from]);
  const todo = [from];
  while (todo.length) {
    const c = todo.pop()!;
    for (let d = 0; d < 4; d++) {
      const n = next(c, d);
      if (n >= 0 && !wall.has(n) && !seen.has(n)) {
        seen.add(n);
        todo.push(n);
      }
    }
  }
  return seen.size;
}

/** Steered by the cursor's cell: the free move that brings the head nearest
 *  it (as the crow flies, so a target behind it turns it round rather than
 *  sending it off straight), going straight on where two are as near. It
 *  doesn't look ahead: that's the chip's player, and the visitor's job. */
function steer(s: Snake, target: number, opts: { d: Dir; c: number }[]): Dir {
  const tx = xOf(target);
  const tz = zOf(target);
  let best = opts[0];
  let score = Infinity;
  for (const o of opts) {
    const k = Math.hypot(xOf(o.c) - tx, zOf(o.c) - tz) + (o.d === s.dir ? 0 : 1e-3);
    if (k < score) {
      score = k;
      best = o;
    }
  }
  return best.d;
}

/** The chip's own player: the shortest way to the food, unless taking it
 *  would leave it less room than its own length (then the roomiest move). */
function autopilot(s: Snake, opts: { d: Dir; c: number }[]): Dir {
  // how far each free cell is from the food, through free cells
  const wall = blocked(s, false);
  const dist = new Map<number, number>();
  if (s.food >= 0) {
    dist.set(s.food, 0);
    const q = [s.food];
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      for (let d = 0; d < 4; d++) {
        const n = next(c, d);
        if (n >= 0 && !dist.has(n) && !wall.has(n)) {
          dist.set(n, dist.get(c)! + 1);
          q.push(n);
        }
      }
    }
  }
  const len = s.body.length + 1;
  let best = opts[0];
  let score = Infinity;
  for (const o of opts) {
    const r = room(s, o.c, o.c === s.food);
    const toFood = dist.get(o.c) ?? Infinity;
    // a move that boxes it in counts for nothing but its room
    const k = r >= len ? toFood : 1e6 - r;
    if (k < score) {
      score = k;
      best = o;
    }
  }
  return best.d;
}

/** One step of the game, toward `target` (a cell the cursor points at) or,
 *  with none, as the chip plays it itself. */
export function step(s: Snake, target: number | null, rand: () => number = Math.random): Step {
  const opts = moves(s);
  // boxed in by the walls and its own body: nowhere left to go
  if (!opts.length) return 'crash';
  s.dir = target === null ? autopilot(s, opts) : steer(s, target, opts);
  const head = next(s.body[0], s.dir);
  s.body.unshift(head);
  if (head === s.food) {
    s.eaten++;
    s.food = placeFood(s, rand);
    return 'eat';
  }
  s.body.pop();
  return 'move';
}

/* The score, as the board shows it when the snake crashes: in a three-by-five
   pixel figure per digit. Two digits stand in a tile column each (the gap
   between the tiles is the space between them), so no tile's gap runs through
   a figure: a score under ten is shown with a nought in front, and one over a
   hundred (not that the board has room for one) is centred. */
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111'];

/** The cells that show `n`, centred on the board. */
export function figure(n: number): Set<number> {
  const text = String(Math.max(0, Math.floor(n))).padStart(2, '0'); // "07", as an arcade shows it
  const stride = text.length === 2 ? 3 : 4;
  const w = text.length * stride - (stride - 3);
  const x0 = Math.floor((N - w) / 2);
  const z0 = Math.floor((N - 5) / 2);
  const lit = new Set<number>();
  [...text].forEach((ch, i) => {
    const bits = DIGITS[Number(ch)];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (bits[r * 3 + c] === '1') lit.add((z0 + r) * N + x0 + i * stride + c);
  });
  return lit;
}
