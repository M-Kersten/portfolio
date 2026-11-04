import type { Vector3 } from 'three';

// One step of a critically damped spring toward `to` (the closed-form
// approximation game engines use for "smooth damp", stable at any frame time),
// with its velocity carried in `vel`. `glide` is roughly the time it takes to
// arrive, in seconds. Where an exponential chase leaves at full speed the
// instant its goal changes, this gathers speed and settles, and a new goal
// mid-move bends the path rather than snapping its speed. The camera rides it
// (CAMERA.glide), and so does anything that should move the way it does.
function springFactor(dt: number, glide: number) {
  const x = (2 / glide) * dt;
  return { omega: 2 / glide, decay: 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x) };
}

export function spring(cur: number, to: number, vel: { v: number }, dt: number, glide: number): number {
  const { omega, decay } = springFactor(dt, glide);
  const change = cur - to;
  const temp = (vel.v + omega * change) * dt;
  vel.v = (vel.v - omega * temp) * decay;
  return to + (change + temp) * decay;
}

/** One step of a springy spring toward `to`: underdamped, so it overshoots
 *  and settles where `spring` arrives without passing. `freq` is how fast it
 *  swings (per second) and `damping` how soon it calms (1 would be critical:
 *  no overshoot; about 0.4–0.6 reads as lively, a servo or a heavy cap).
 *  Sub-stepped, so a slow frame doesn't throw it. */
export function wobble(cur: number, to: number, vel: { v: number }, dt: number, freq = 2, damping = 0.5): number {
  const w = 2 * Math.PI * freq;
  const n = Math.max(1, Math.ceil(dt * 120));
  const h = dt / n;
  let x = cur;
  for (let i = 0; i < n; i++) {
    vel.v += (-w * w * (x - to) - 2 * damping * w * vel.v) * h;
    x += vel.v * h;
  }
  return x;
}

export function springVec(cur: Vector3, to: Vector3, vel: Vector3, dt: number, glide: number) {
  const { omega, decay } = springFactor(dt, glide);
  for (const k of ['x', 'y', 'z'] as const) {
    const change = cur[k] - to[k];
    const temp = (vel[k] + omega * change) * dt;
    vel[k] = (vel[k] - omega * temp) * decay;
    cur[k] = to[k] + (change + temp) * decay;
  }
}
