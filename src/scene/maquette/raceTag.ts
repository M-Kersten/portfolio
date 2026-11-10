/* Crown tag on the Lightship Drive table (room.tsx CoffeeTableAR).

   The real game's twist was a crown that could be taken from the leader. In
   the table's close-up the two cars come off the course and play just that,
   free on the mat: the purple car is yours and drives toward the cursor, the
   way a toy car follows your finger in AR; the orange one is the rival. Whoever
   wears the crown scores for every second they keep it; touch the one wearing
   it and it's yours, and they spin out for a moment, so you get away. The
   kickers are still on the mat: drive up one and you jump, and a car in the air
   can't be touched, so they're the way to escape (the rival knows it too). A
   kicker met from the side or the back is just in the way.

   This is the game's own state and rules, in table space (x along the table, z
   across it, y up off the mat, metres; a car's yaw is its heading, from +z
   toward +x, as three's rotation.y), with no three.js in it: room.tsx draws it.
   Car 0 is yours, car 1 the rival. */

export interface Kicker {
  /** its centre on the mat */
  x: number;
  z: number;
  /** the way up it, toe to lip, as a yaw */
  yaw: number;
}

export interface TagWorld {
  /** half the drivable mat, along and across (a car's centre stays inside) */
  hx: number;
  hz: number;
  kickers: Kicker[];
  /** the kicker's footprint and face: its length toe to back, width, height
   *  at the lip, where the lip is (from the toe), and the face as (from the
   *  toe, height) */
  ramp: { l: number; w: number; h: number; lip: number; face: [number, number][] };
}

export interface TagCar {
  x: number;
  z: number;
  yaw: number;
  /** speed along its heading (m/s) */
  v: number;
  /** how it's actually moving (m/s): along its heading, plus the slide sideways
   *  that grip takes out of it (`slip`, + to its right), so it can slide into
   *  a corner */
  vx: number;
  vz: number;
  slip: number;
  /** height off the mat, and its rate while in the air */
  y: number;
  vy: number;
  air: boolean;
  /** the kicker it's climbing, or -1 */
  ramp: number;
  /** the nose's pitch to draw (negative is nose up), eased */
  pitch: number;
  /** spun out after losing the crown: how long it's still out, and the spin to draw */
  stun: number;
  spin: number;
  /** a landing's squash, 1 as it lands and fading */
  land: number;
  /** the getaway after taking the crown, 1 and fading: a burst of speed */
  burst: number;
  /** seconds worn the crown, all told */
  held: number;
  /** how long it's been trying to get somewhere without moving (the AI replans) */
  stuck: number;
}

interface Plan {
  x: number;
  z: number;
  until: number;
  /** 'approach': lining up on a kicker's toe; 'run': up it and off */
  phase: 'go' | 'approach' | 'run';
  kicker: number;
}

export interface Tag {
  cars: [TagCar, TagCar];
  /** who wears the crown */
  holder: 0 | 1;
  /** since the game began (s) */
  time: number;
  /** when the crown last changed hands */
  tagAt: number;
  /** how long the holder has kept it this time */
  streak: number;
  plans: [Plan | null, Plan | null];
}

export type TagEvent = { kind: 'tag'; to: 0 | 1 } | { kind: 'launch'; car: 0 | 1 } | { kind: 'land'; car: 0 | 1 };

/* The cars' handling. Yours is a touch quicker than the rival either way, so
   it can always be caught and always be got away from; the rival steers
   perfectly, which makes up for it. A car turns its nose first and its
   weight follows: grip (GRIP) takes the sideways slide out of it a little at a
   time, so a hard turn at speed slides into the corner, yours most (it's a
   toy car on a mat), the rival a bit less. Yours goes where you point and
   nothing else steers it: no going round kickers for you, no easing off for a
   bend. */
const R = 0.02; // a car's reach: two closer than 2R are touching
export const TAG_R = R;
const TURN = 5.2; // rad/s, at speed
const TURN_YOU = 7;
const GRIP = 8; // 1/s: how fast the slide dies away (the rival)
const GRIP_YOU = 5.5; // yours slides more
const GRIP_RAMP = 14; // up a kicker's face it runs true
const ACC = 0.75; // m/s², gathering speed
const BRAKE = 1.4; // m/s², shedding it
const YOU = 0.24; // your top speed
const CHASE = 0.205; // the rival hunting you
const FLEE = 0.2; // the rival getting away, tiring as it keeps the crown
const TIRE = 0.25; // how much slower it's got after keeping the crown TIRE_S
const TIRE_S = 12;
const LEAD = 0.3; // s: the chaser aims where the holder will be
const STUN = 0.95; // s spun out after losing the crown
const SPIN = 0.6; // s the spin itself takes
const BURST = 0.55; // extra speed at the getaway's peak
const BURST_S = 1.2;
const TAG_GAP = 0.3; // s before the crown can change hands again
const VREF = 0.2; // the course's top speed, at which a jump matches the race's

export function newTag(seed: { x: number; z: number; yaw: number; v: number }[], holder: 0 | 1): Tag {
  const car = (s: (typeof seed)[number]): TagCar => ({
    x: s.x,
    z: s.z,
    yaw: s.yaw,
    v: s.v,
    vx: Math.sin(s.yaw) * s.v,
    vz: Math.cos(s.yaw) * s.v,
    slip: 0,
    y: 0,
    vy: 0,
    air: false,
    ramp: -1,
    pitch: 0,
    stun: 0,
    spin: 0,
    land: 0,
    burst: 0,
    held: 0,
    stuck: 0,
  });
  return { cars: [car(seed[0]), car(seed[1])], holder, time: 0, tagAt: -9, streak: 0, plans: [null, null] };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** the kicker's face: its height `a` from the toe, and its slope there */
function face(w: TagWorld, a: number): [number, number] {
  const f = w.ramp.face;
  for (let i = 1; i < f.length; i++) {
    if (a <= f[i][0]) {
      const [x0, y0] = f[i - 1];
      const [x1, y1] = f[i];
      const k = (y1 - y0) / (x1 - x0);
      return [y0 + k * (Math.max(a, 0) - x0), k];
    }
  }
  return [0, 0];
}

/** a point in a kicker's frame: how far from its toe, and how far off its middle */
function local(k: Kicker, w: TagWorld, x: number, z: number): [number, number] {
  const dx = x - k.x;
  const dz = z - k.z;
  const s = Math.sin(k.yaw);
  const c = Math.cos(k.yaw);
  return [dx * s + dz * c + w.ramp.l / 2, dx * c - dz * s];
}

/** Where to steer for `x, z` from where the car is: straight there, or, when
 *  a kicker's in the way and the car isn't lined up to drive up it from its
 *  toe, along the kicker's side first. */
function around(w: TagWorld, car: TagCar, x: number, z: number): [number, number] {
  const pad = w.ramp.w / 2 + R + 0.014;
  for (const k of w.kickers) {
    const [ca, cs] = local(k, w, car.x, car.z);
    const [ga, gs] = local(k, w, x, z);
    // lined up behind the toe, heading on up it: no need to go round
    if (ca < 0.02 && Math.abs(cs) < w.ramp.w / 2 - 0.006 && ga > ca + 0.02) continue;
    // does the way there cross the kicker (with room for the car)? Not if
    // where it's going is up against it: then it just goes
    const lo = -R - 0.008;
    const hi = w.ramp.l + R + 0.008;
    if (ga > lo && ga < hi && Math.abs(gs) < pad) continue;
    let t0 = 0;
    let t1 = 1;
    const clip = (p: number, q: number, min: number, max: number) => {
      if (Math.abs(q) < 1e-9) return p >= min && p <= max;
      let a = (min - p) / q;
      let b = (max - p) / q;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      return t0 <= t1;
    };
    if (!clip(ca, ga - ca, lo, hi) || !clip(cs, gs - cs, -pad + 0.006, pad - 0.006)) continue;
    // go along the side the car is on, to level with where it's going
    // (or the other side, if there's no room on this one before the edge)
    const a = Math.min(hi + 0.01, Math.max(lo - 0.01, ga));
    const s = Math.sin(k.yaw);
    const c = Math.cos(k.yaw);
    const u = a - w.ramp.l / 2;
    const at = (side: number): [number, number] => [k.x + s * u + c * side * pad, k.z + c * u - s * side * pad];
    const side = Math.sign(cs) || Math.sign(gs) || 1;
    const [px, pz] = at(side);
    return Math.abs(px) <= w.hx && Math.abs(pz) <= w.hz ? [px, pz] : at(-side);
  }
  return [x, z];
}

/** the jump's pull back down: at the course's speed a car flies as far as it
 *  does in the race (room.tsx FLIGHT, FALL) */
function gravity(w: TagWorld) {
  const { h, lip, face: f } = w.ramp;
  const launch = (h * 0.36) / (lip - f[1][0]);
  const flight = 0.12;
  const fall = (h + launch * flight) / flight ** 2;
  return { launch, g: 2 * fall * VREF * VREF };
}

type Goal = { x: number; z: number; v: number; straight?: boolean; you?: boolean };

function drive(car: TagCar, i: 0 | 1, w: TagWorld, dt: number, goal: Goal, events: TagEvent[]) {
  const { launch, g } = gravity(w);
  car.land = Math.max(0, car.land - dt * 4);
  car.burst = Math.max(0, car.burst - dt / BURST_S);
  if (car.stun > 0) {
    car.stun = Math.max(0, car.stun - dt);
    car.spin = Math.min(Math.PI * 2, car.spin + (Math.PI * 2 * dt) / SPIN);
    if (car.stun === 0) car.spin = 0;
  }
  if (car.air) {
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    car.y += car.vy * dt;
    car.vy -= g * dt;
    if (car.y <= 0) {
      car.y = 0;
      car.vy = 0;
      car.air = false;
      car.land = 1;
      events.push({ kind: 'land', car: i });
    }
  } else {
    // steer for the goal (the rival goes round a kicker that's in the way;
    // yours goes where it's pointed), and take the speed it wants
    const [gx, gz] = car.ramp >= 0 || goal.you ? [goal.x, goal.z] : around(w, car, goal.x, goal.z);
    const want = Math.atan2(gx - car.x, gz - car.z);
    const off = wrap(want - car.yaw);
    const d = Math.hypot(goal.x - car.x, goal.z - car.z);
    let rate = (goal.you ? TURN_YOU : TURN) * (0.45 + 0.55 * Math.min(1, Math.abs(car.v) / 0.1));
    if (car.ramp >= 0) rate *= goal.you ? 0.6 : 0.2;
    let target = goal.straight
      ? goal.v
      : goal.you
        ? // flat out until it's nearly there (easing off only to turn right round)
          goal.v * clamp((d - 0.008) / 0.04, 0, 1) * (Math.abs(off) > 2.2 ? 0.7 : 1)
        : goal.v * clamp((d - 0.012) / 0.07, 0, 1) * (1 - 0.6 * Math.min(1, Math.abs(off) / 1.7));
    if (car.stun > 0) {
      rate = 0;
      target = 0;
    }
    car.yaw = wrap(car.yaw + clamp(off, -rate * dt, rate * dt));
    // its way of going, along its nose and sideways: the engine works along
    // the nose, grip takes the sideways slide out a little at a time
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    let f = car.vx * fx + car.vz * fz;
    let l = car.vx * fz - car.vz * fx;
    const top = target * (1 + BURST * car.burst);
    f += clamp(top - f, -BRAKE * dt, ACC * (1 + 2 * car.burst) * dt);
    l *= Math.exp(-(car.ramp >= 0 ? GRIP_RAMP : goal.you ? GRIP_YOU : GRIP) * dt);
    car.vx = f * fx + l * fz;
    car.vz = f * fz - l * fx;
    car.v = f;
    car.slip = l;
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    // the kickers: up one from its toe, or bumped off its sides and back
    if (car.ramp >= 0) {
      const [a, across] = local(w.kickers[car.ramp], w, car.x, car.z);
      if (Math.abs(across) > w.ramp.w / 2) {
        // off its side: it drops
        car.ramp = -1;
        car.air = true;
        car.vy = 0;
      } else if (a >= w.ramp.lip) {
        // off the lip
        const along = Math.cos(car.yaw - w.kickers[car.ramp].yaw);
        car.ramp = -1;
        car.air = true;
        car.y = w.ramp.h;
        car.vy = launch * Math.max(car.v, 0.12) * Math.max(0.3, along);
        events.push({ kind: 'launch', car: i });
      } else if (a < 0) {
        car.ramp = -1;
        car.y = 0;
      } else {
        car.y = face(w, a)[0];
      }
    } else {
      for (let k = 0; k < w.kickers.length; k++) {
        const kk = w.kickers[k];
        const [a, across] = local(kk, w, car.x, car.z);
        const side = w.ramp.w / 2 + R * 0.45;
        if (Math.abs(across) > side || a < -R * 0.5 || a > w.ramp.l + R * 0.5) continue;
        const along = Math.cos(Math.atan2(car.vx, car.vz) - kk.yaw);
        if (a < 0.03 && along > 0.2 && Math.abs(across) < w.ramp.w / 2 + 0.006) {
          // onto its toe, and up: met anywhere across the front and going
          // roughly its way, it takes the car (nudged in off the very edge)
          car.ramp = k;
          car.y = face(w, Math.max(a, 0))[0];
          const inside = w.ramp.w / 2 - 0.005;
          if (Math.abs(across) > inside) {
            const nudge = (Math.abs(across) - inside) * Math.sign(across);
            car.x -= Math.cos(kk.yaw) * nudge;
            car.z += Math.sin(kk.yaw) * nudge;
          }
          break;
        }
        // in the way: pushed back out the shortest way, losing speed
        const back = a + R * 0.5;
        const front = w.ramp.l + R * 0.5 - a;
        const out = side - Math.abs(across);
        const s = Math.sin(kk.yaw);
        const c = Math.cos(kk.yaw);
        if (out < back && out < front) {
          const sgn = Math.sign(across) || 1;
          car.x += c * out * sgn;
          car.z -= s * out * sgn;
        } else if (back < front) {
          car.x -= s * back;
          car.z -= c * back;
        } else {
          car.x += s * front;
          car.z += c * front;
        }
        car.v *= 0.5;
        car.vx *= 0.5;
        car.vz *= 0.5;
      }
    }
    // pointed at somewhere and not getting there: the AI picks somewhere else
    car.stuck = Math.hypot(car.vx, car.vz) < 0.025 && d > 0.05 && car.stun === 0 ? car.stuck + dt : 0;
  }
  // the edges of the mat
  const cx = clamp(car.x, -w.hx, w.hx);
  const cz = clamp(car.z, -w.hz, w.hz);
  // (it bumps off them: what was going into the edge comes back a little)
  if (cx !== car.x) {
    car.x = cx;
    car.vx *= -0.25;
  }
  if (cz !== car.z) {
    car.z = cz;
    car.vz *= -0.25;
  }
  // the nose: up the face, along the flight, level on the mat
  let aim = 0;
  if (car.air) aim = -Math.atan2(car.vy, Math.max(Math.hypot(car.vx, car.vz), 0.05));
  else if (car.ramp >= 0) aim = -Math.atan(face(w, local(w.kickers[car.ramp], w, car.x, car.z)[0])[1]);
  car.pitch += (aim - car.pitch) * (1 - Math.exp(-dt * 16));
}

/** Where the rival (or your car, on a touch screen) is headed next. With the
 *  crown, on through open mat away from the chaser and never past it, or up
 *  a kicker when the chaser's near; without it, where the holder is going.
 *  It never parks: with the crown it drives on through each place it picked,
 *  picking the next as it gets near, and would rather carry on the way it's
 *  going than double back. */
function think(tag: Tag, i: 0 | 1, w: TagWorld): Goal {
  const me = tag.cars[i];
  const them = tag.cars[i === 0 ? 1 : 0];
  const ai = i === 1 ? 1 : 0.88; // your car, driving itself, is a little less sharp
  if (tag.holder !== i) {
    tag.plans[i] = null;
    const lead = LEAD * ai;
    return {
      x: them.x + them.vx * lead,
      z: them.z + them.vz * lead,
      v: (i === 1 ? CHASE : CHASE * 0.95) * ai,
    };
  }
  const v = FLEE * (1 - TIRE * Math.min(1, tag.streak / TIRE_S)) * (i === 1 ? 1 : 0.95);
  let p = tag.plans[i];
  const near = p ? Math.hypot(p.x - me.x, p.z - me.z) : 0;
  // lined up in front of the toe (or near enough where it was headed)
  const funnel = (() => {
    if (!p || p.phase !== 'approach') return false;
    const [a, across] = local(w.kickers[p.kicker], w, me.x, me.z);
    return a > -0.1 && a < 0.02 && Math.abs(across) < w.ramp.w / 2 - 0.01;
  })();
  if (p && p.phase === 'approach' && (near < 0.04 || funnel)) {
    // lined up on the toe: up it and off the far side
    const k = w.kickers[p.kicker];
    p = tag.plans[i] = {
      x: k.x + Math.sin(k.yaw) * (w.ramp.l / 2 + 0.16),
      z: k.z + Math.cos(k.yaw) * (w.ramp.l / 2 + 0.16),
      until: tag.time + 1.6,
      phase: 'run',
      kicker: p.kicker,
    };
  }
  const chaserClose = Math.hypot(them.x - me.x, them.z - me.z) < 0.16;
  const chaserNear = Math.hypot(them.x - me.x, them.z - me.z) < 0.26;
  if (!p || tag.time > p.until || (p.phase === 'go' && near < 0.07) || (p.phase === 'approach' && near < 0.04) || me.stuck > 0.5 || (p.phase === 'go' && chaserClose && Math.hypot(p.x - them.x, p.z - them.z) < 0.1)) {
    me.stuck = 0;
    const pick: { best: Plan | null; score: number } = { best: null, score: -Infinity };
    const consider = (x: number, z: number, phase: Plan['phase'], kicker: number) => {
      const dx = x - me.x;
      const dz = z - me.z;
      const len = Math.hypot(dx, dz) || 1e-6;
      if (len < 0.1) return; // somewhere else, not here
      let s = Math.hypot(x - them.x, z - them.z) - 0.3 * len;
      // carrying on the way it's going, rather than doubling back
      const sp = Math.hypot(me.vx, me.vz);
      if (sp > 0.03) s += 0.09 * ((me.vx * dx + me.vz * dz) / (sp * len));
      // not past the chaser to get there
      const t = ((them.x - me.x) * dx + (them.z - me.z) * dz) / (len * len);
      if (t > 0 && t < 1) {
        const px = me.x + dx * t - them.x;
        const pz = me.z + dz * t - them.z;
        if (Math.hypot(px, pz) < 0.08) s -= 0.4;
      }
      if (phase === 'approach' && chaserNear) s += chaserClose ? 0.08 : 0.04;
      if (s > pick.score) {
        pick.score = s;
        pick.best = { x, z, until: tag.time + (phase === 'approach' ? 2.2 : 1.6), phase, kicker };
      }
    };
    for (const fx of [-0.8, -0.4, 0, 0.4, 0.8]) for (const fz of [-0.75, 0, 0.75]) consider(fx * w.hx, fz * w.hz, 'go', -1);
    w.kickers.forEach((k, n) => {
      const x = k.x - Math.sin(k.yaw) * (w.ramp.l / 2 + 0.06);
      const z = k.z - Math.cos(k.yaw) * (w.ramp.l / 2 + 0.06);
      if (Math.abs(x) < w.hx && Math.abs(z) < w.hz) consider(x, z, 'approach', n);
    });
    p = tag.plans[i] = pick.best;
  }
  if (!p) return { x: me.x, z: me.z, v };
  // (on through a place it's passing, slowing only to line up on a kicker)
  return { x: p.x, z: p.z, v, straight: p.phase !== 'approach' };
}

/** One step of the game. `target` is where the cursor points on the mat, for
 *  your car; null and your car drives itself (a touch screen, where it plays
 *  on its own). */
export function stepTag(tag: Tag, w: TagWorld, dt: number, target: { x: number; z: number } | null): TagEvent[] {
  const events: TagEvent[] = [];
  tag.time += dt;
  tag.streak += dt;
  tag.cars[tag.holder].held += dt;
  const goals = [
    target ? { x: clamp(target.x, -w.hx, w.hx), z: clamp(target.z, -w.hz, w.hz), v: YOU, you: true } : think(tag, 0, w),
    think(tag, 1, w),
  ];
  drive(tag.cars[0], 0, w, dt, goals[0], events);
  drive(tag.cars[1], 1, w, dt, goals[1], events);
  // touching: they don't drive through each other, and the crown changes hands
  const [a, b] = tag.cars;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const apart = Math.abs(a.y - b.y) > 0.012; // one's over the other, in the air
  if (d < 2 * R && !apart) {
    const push = (2 * R - d) / 2;
    const nx = d > 1e-6 ? dx / d : 1;
    const nz = d > 1e-6 ? dz / d : 0;
    a.x -= nx * push;
    a.z -= nz * push;
    b.x += nx * push;
    b.z += nz * push;
    const holder = tag.cars[tag.holder];
    const chaser = tag.cars[tag.holder === 0 ? 1 : 0];
    if (!a.air && !b.air && chaser.stun === 0 && tag.time - tag.tagAt > TAG_GAP) {
      const to = (tag.holder === 0 ? 1 : 0) as 0 | 1;
      tag.holder = to;
      tag.tagAt = tag.time;
      tag.streak = 0;
      holder.stun = STUN;
      holder.spin = 0;
      holder.v *= 0.3;
      holder.vx *= 0.3;
      holder.vz *= 0.3;
      chaser.burst = 1;
      tag.plans = [null, null];
      events.push({ kind: 'tag', to });
    }
  }
  return events;
}
