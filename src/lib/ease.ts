// Easing for the maquette's moments (DESIGN.md, "In the close-up"): a move
// eases out of rest and into its mark rather than starting and stopping at
// full speed, and the ones with some life in them overshoot a touch and
// settle. `t` runs 0 → 1; outside that the curves hold their ends.

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Slow out of rest, gathering speed: a launch. */
export const easeIn = (t: number, p = 2) => clamp01(t) ** p;

/** Fast away, slowing onto the mark: an arrival. */
export const easeOut = (t: number, p = 2) => 1 - (1 - clamp01(t)) ** p;

/** Slow, fast, slow. */
export function easeInOut(t: number) {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Out past the mark (by about a tenth with the default `s`), then back onto it. */
export function easeOutBack(t: number, s = 1.70158) {
  const x = clamp01(t) - 1;
  return 1 + (s + 1) * x * x * x + s * x * x;
}

/** Out of rest onto the mark the way a spring takes a step: gathering speed,
 *  on a little past (by about a twentieth with the default `damping`) and
 *  back, and settled by t 1. Where `easeOutBack` sets off at full speed, this
 *  sets off from rest: a lid falling open, a cover swinging over. */
export function settle(t: number, damping = 0.7, freq = 9) {
  const wd = freq * Math.sqrt(1 - damping * damping);
  const at = (x: number) => 1 - Math.exp(-damping * freq * x) * (Math.cos(wd * x) + ((damping * freq) / wd) * Math.sin(wd * x));
  const x = clamp01(t);
  return at(x) + (1 - at(1)) * x; // what's left of the ringing at t 1, taken up along the way
}

/** 0 → 1 → 0 over t 0…1: one swell. */
export const bump = (t: number) => (t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t));

/** Something struck, ringing down: 1 at t 0, swinging through 0 and back
 *  `freq` times a second and dying away at `decay` per second (0 before it's
 *  struck). Times how far it goes, for a press, a jolt, a recoil. */
export const ring = (t: number, freq = 3, decay = 6) => (t < 0 ? 0 : Math.exp(-decay * t) * Math.cos(2 * Math.PI * freq * t));
