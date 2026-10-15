import { useEffect, useState } from 'react';

// What the screen and the visitor's settings are: the phone breakpoint, reduced
// motion, and whether this is a touch screen. One place, so every component
// asks the same question the same way.

/** The site's phone breakpoint: the same 760px the stylesheets switch at. */
export const PHONE = '(max-width: 760px)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
/** A touch screen: no hover, and a finger rather than a pointer. */
const TOUCH = '(hover: none)';

const matches = (query: string) => typeof window !== 'undefined' && window.matchMedia(query).matches;

/** Whether a media query matches, kept up to date as it changes (a rotation, a
 *  resize, the visitor changing a setting). */
export function useMediaQuery(query: string): boolean {
  const [on, setOn] = useState(() => matches(query));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setOn(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return on;
}

/** The visitor's reduced-motion setting. Honoured everywhere: orbits stop,
 *  camera moves become cuts, reveals arrive finished. */
export const useReducedMotion = () => useMediaQuery(REDUCED_MOTION);

// Read once, at load:
/** A phone-sized screen. The opening dolly and the intro card are a desktop
 *  flourish; on a phone the site just appears. */
export const isMobileViewport = () => matches(PHONE);
/** A phone or tablet (small screen or touch-first): the launch film runs a
 *  lighter version here, with fewer smoke puffs and a cheaper bloom. */
export const isLiteDevice = () => matches(`${PHONE}, (pointer: coarse)`);
/** A touch screen, which has no hover. */
export const isTouch = () => matches(TOUCH);
/** What the finger or the pointer does to press something: "tap" or "click". */
export const PRESS = isTouch() ? 'tap' : 'click';
