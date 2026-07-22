import { useEffect, useRef, useState } from 'react';
import { site } from '../content';
import { bootAt, MAQUETTE_BOOT, sceneStore } from '../scene/store';
import { useReducedMotion } from '../lib/useReducedMotion';
import { isMobileViewport } from '../lib/isMobile';
import { Scramble } from './Scramble';

// The movie-intro title card: shown once on first load, centred over the
// maquette, as the camera dollies in (see CameraRig's intro). It decodes in on
// the maquette's beat, holds while the camera pushes past the model, then clears
// as the scene settles — or the moment the visitor scrolls/taps. Skipped on a
// deep link (a /work node), and its copy lives in site.hero.intro (remove that
// to drop the card). The premise line is written for a first-time visitor.

const HOLD = 3400; // ms the card stays up before it clears itself
const FADE = 650; // ms for the card to fade out (covers intro-card.css's opacity transition)

export function IntroCard() {
  const intro = site.hero.intro;
  const reduced = useReducedMotion();
  // Play once per page load. Skipped on a phone (the intro is a desktop
  // flourish — mobile just appears), on a deep link (a /work/… route goes
  // straight to the node), and once the intro has already been released — so
  // navigating back to home from another route doesn't replay the card.
  const skip = useRef(
    !intro ||
      isMobileViewport() ||
      (typeof window !== 'undefined' && /\/work\//.test(window.location.pathname)) ||
      sceneStore.snapshot().introOver,
  );
  const [show, setShow] = useState(false);
  // the card decodes on the maquette's beat; the Scramble waits out that delay
  const showDelay = useRef(Math.max(0, MAQUETTE_BOOT - (performance.now() - bootAt)));

  useEffect(() => {
    // Nothing to play (deep link / no copy / reduced motion): release the hero
    // chrome right away so the title + subtitle aren't held back for nothing.
    if (skip.current || reduced) {
      sceneStore.endIntro();
      return;
    }
    const t1 = window.setTimeout(() => setShow(true), showDelay.current);
    const t2 = window.setTimeout(() => setShow(false), showDelay.current + HOLD);
    // The hero title/subtitle are the NEXT beat: release them only once the card
    // has fully faded out, so the two never animate at the same time.
    const t3 = window.setTimeout(() => sceneStore.endIntro(), showDelay.current + HOLD + FADE);
    const clear = () => {
      setShow(false); // first interaction dismisses the card early…
      sceneStore.endIntro(); // …and hands the hero straight back
    };
    const evs = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    evs.forEach((ev) => window.addEventListener(ev, clear, { passive: true }));
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      evs.forEach((ev) => window.removeEventListener(ev, clear));
    };
  }, [reduced]);

  if (skip.current || !intro || reduced) return null;
  return (
    <div className="intro-card" data-show={show || undefined} aria-hidden={!show}>
      <p className="intro-card__title">
        <Scramble text={intro.title} delay={reduced ? 0 : showDelay.current} wrap />
      </p>
      <p className="intro-card__body">{intro.body}</p>
    </div>
  );
}
