import { useEffect, useRef, useState } from 'react';
import { site } from '../content';
import { bootAt, MAQUETTE_BOOT } from '../scene/store';
import { useReducedMotion } from '../lib/useReducedMotion';
import { Scramble } from './Scramble';

// The movie-intro title card: shown once on first load, centred over the
// maquette, as the camera dollies in (see CameraRig's intro). It decodes in on
// the maquette's beat, holds while the camera pushes past the model, then clears
// as the scene settles — or the moment the visitor scrolls/taps. Skipped on a
// deep link (a /work node), and its copy lives in site.hero.intro (remove that
// to drop the card). The premise line is written for a first-time visitor.

const HOLD = 3400; // ms the card stays up before it clears itself

export function IntroCard() {
  const intro = site.hero.intro;
  const reduced = useReducedMotion();
  // deep links (a /work/… route on load) go straight to the node — no intro
  const skip = useRef(!intro || (typeof window !== 'undefined' && /\/work\//.test(window.location.pathname)));
  const [show, setShow] = useState(false);
  // the card decodes on the maquette's beat; the Scramble waits out that delay
  const showDelay = useRef(Math.max(0, MAQUETTE_BOOT - (performance.now() - bootAt)));

  useEffect(() => {
    if (skip.current) return;
    const t1 = window.setTimeout(() => setShow(true), showDelay.current);
    const t2 = window.setTimeout(() => setShow(false), showDelay.current + HOLD);
    const clear = () => setShow(false); // first interaction dismisses it early
    const evs = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    evs.forEach((ev) => window.addEventListener(ev, clear, { passive: true }));
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      evs.forEach((ev) => window.removeEventListener(ev, clear));
    };
  }, []);

  if (skip.current || !intro) return null;
  return (
    <div className="intro-card" data-show={show || undefined} aria-hidden={!show}>
      <p className="intro-card__title">
        <Scramble text={intro.title} delay={reduced ? 0 : showDelay.current} wrap />
      </p>
      <p className="intro-card__body">{intro.body}</p>
    </div>
  );
}
