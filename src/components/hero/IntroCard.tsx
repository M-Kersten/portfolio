import { useEffect, useRef, useState } from 'react';
import { site } from '../../content';
import { markIntroSeen, returning, sceneStore, useSceneSelector } from '../../scene/store';
import { useReducedMotion } from '../../lib/media';

// The opening's one line, said once: "Hi, I'm Merijn and this is my work in
// miniature." It comes up as the opening shot gets going (the camera rising
// from the chip to the city while the model turns: CameraRig), low on the
// screen so the model stays in view above it, holds for the rise and clears as
// the shot lands and the lights go down — or the moment the visitor
// scrolls/taps. The hero's title is the next beat: it's released once the line
// has gone, as the model steps aside for it. A returning visitor has read the
// line: theirs is the short opening without it, the title coming up as that
// lands. No opening at all on a deep link (a /work node) or under reduced
// motion: the title is simply there. The line's copy lives in site.hero.intro
// (remove that to drop the line).

const FADE = 700; // ms for the line to fade out (covers intro-card.css's opacity transition)
const STEP_ASIDE = 450; // ms the title gives the model to get out of its way, when there's no line to fade first
/** How long the hero's title waits for an opening that hasn't begun (the 3D
 *  still downloading on a slow line, or not coming at all: no WebGL). It then
 *  goes ahead without one; an opening that arrives later plays under it. */
const NO_SHOW = 3600; // ms

export function IntroCard() {
  const intro = site.hero.intro;
  const reduced = useReducedMotion();
  // where the opening shot is (the camera sets it)
  const phase = useSceneSelector((s) => s.opening);
  // No opening to wait for on a deep link (a /work/… route goes straight to
  // the node), or once the intro has already been released — so navigating
  // back to home from another route doesn't replay it.
  const skip = useRef((typeof window !== 'undefined' && /\/work\//.test(window.location.pathname)) || sceneStore.snapshot().introOver);
  // The line is said once per browser: a returning visitor has read it.
  const silent = !intro || returning;
  const [show, setShow] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const began = useRef(false); // the opening has been seen to begin
  const off = skip.current || reduced;

  // Nothing to play (deep link / reduced motion): release the hero chrome
  // right away so the title + subtitle aren't held back for nothing.
  useEffect(() => {
    if (off) sceneStore.endIntro();
  }, [off]);

  // The line follows the shot: up while it rises, gone as it lands. The hero
  // title is the NEXT beat, released only once the line has fully faded, so
  // the two never animate at the same time (a timer is only the backstop,
  // should the fade not run at all).
  useEffect(() => {
    if (off) return;
    if (phase === 'wait' || phase === 'rise') began.current = true;
    if (phase === 'rise') {
      if (!silent) setShow(true);
      markIntroSeen();
      return;
    }
    if (!began.current || phase === 'wait') return;
    // landing, or over (cut short): the line goes, then the title comes
    const release = () => sceneStore.endIntro();
    if (silent) {
      // (no line to wait out, but the model is still on its way aside)
      const t = window.setTimeout(release, STEP_ASIDE);
      return () => clearTimeout(t);
    }
    setShow(false);
    const card = cardRef.current;
    const onFaded = (e: TransitionEvent) => {
      if (e.target === card && e.propertyName === 'opacity') release();
    };
    card?.addEventListener('transitionend', onFaded);
    const backstop = window.setTimeout(release, FADE * 2);
    return () => {
      card?.removeEventListener('transitionend', onFaded);
      clearTimeout(backstop);
    };
  }, [phase, off, silent]);

  // …and if no opening begins, the title doesn't wait for one
  useEffect(() => {
    if (off) return;
    const t = window.setTimeout(() => {
      if (!began.current) sceneStore.endIntro();
    }, NO_SHOW);
    return () => clearTimeout(t);
  }, [off]);

  // the first interaction dismisses the line early and hands the hero
  // straight back (the camera cuts its shot short on the same signal)
  useEffect(() => {
    if (off) return;
    const clear = () => {
      setShow(false);
      sceneStore.endIntro();
    };
    const evs = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    evs.forEach((ev) => window.addEventListener(ev, clear, { passive: true }));
    return () => evs.forEach((ev) => window.removeEventListener(ev, clear));
  }, [off]);

  if (off || silent || !intro) return null;
  return (
    <div ref={cardRef} className="intro-card" data-show={show || undefined} aria-hidden={!show}>
      <p className="intro-card__title">{intro.title}</p>
      {/* (a second line only when there's something it needs to add) */}
      {intro.body && <p className="intro-card__body">{intro.body}</p>}
    </div>
  );
}
