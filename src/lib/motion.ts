// The motion system's numbers for the few things timed in code (scroll reveals,
// staggers, the text decode). They mirror the tokens in ui/tokens.css, so a
// change to one is a change to both.

/** Durations and the sibling stagger, in ms (= --t-fast, --t-base, --t-slow,
 *  --stagger). */
export const MOTION = {
  fast: 200,
  base: 350,
  slow: 600,
  stagger: 80,
} as const;

/** The one point in the scroll where content counts as arrived: a quarter of
 *  it on screen, and clear of the bottom edge. Every section's reveal and the
 *  title decode use it, so things arrive at the same moment everywhere. */
export const REVEAL: IntersectionObserverInit = { threshold: 0.25, rootMargin: '0px 0px -8% 0px' };
