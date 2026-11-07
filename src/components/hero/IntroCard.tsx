import { useEffect, useRef, useState } from 'react';
import { site } from '../../content';
import { bootAt, markIntroSeen, MAQUETTE_BOOT, returning, sceneStore } from '../../scene/store';
import { useReducedMotion } from '../../lib/media';
import { isMobileViewport } from '../../lib/media';

// The movie-intro title card: shown once on first load, centred over the
// maquette, as the camera dollies in (see CameraRig's intro). It fades in on
// the maquette's beat (plainly, no decoding: it's a hello, and the one line
// anyone reads before the model), holds while the camera pushes past the
// model, then clears as the scene settles — or the moment the visitor
// scrolls/taps. Skipped on a deep link (a /work node), and its copy lives in
// site.hero.intro (remove that to drop the card).

const HOLD = 3800; // ms the card stays up before it clears itself: the fade in, and time to read the line
const FADE = 700; // ms for the card to fade out (covers intro-card.css's opacity transition)

export function IntroCard() {
  const intro = site.hero.intro;
  const reduced = useReducedMotion();
  // Play once per browser: a returning visitor has read the premise. Also
  // skipped on a phone (the intro is a desktop flourish — mobile just
  // appears), on a deep link (a /work/… route goes straight to the node), and
  // once the intro has already been released — so navigating back to home
  // from another route doesn't replay the card.
  const skip = useRef(
    !intro ||
      returning || // seen it before: a returning visitor goes straight to the model
      isMobileViewport() ||
      (typeof window !== 'undefined' && /\/work\//.test(window.location.pathname)) ||
      sceneStore.snapshot().introOver,
  );
  const [show, setShow] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  // the card comes in on the maquette's beat
  const showDelay = useRef(Math.max(0, MAQUETTE_BOOT - (performance.now() - bootAt)));

  useEffect(() => {
    // Nothing to play (deep link / no copy / reduced motion): release the hero
    // chrome right away so the title + subtitle aren't held back for nothing.
    if (skip.current || reduced) {
      sceneStore.endIntro();
      return;
    }
    // The hero title/subtitle are the NEXT beat: release them only once the card
    // has fully faded out, so the two never animate at the same time. Both
    // beats are taken from what the card actually does rather than from load:
    // while the models load, a long task can start the card late (which used to
    // cut its reading time short) and hold its fade back until a clock would
    // already have released the title. So the hold runs from when it shows, and
    // the title waits for the fade OUT to end (a timer is only the backstop,
    // should the fade not run at all).
    const card = cardRef.current;
    let t2 = 0;
    let t3 = 0;
    const release = () => {
      clearTimeout(t3);
      card?.removeEventListener('transitionend', onFaded);
      sceneStore.endIntro();
    };
    const onFaded = (e: TransitionEvent) => {
      if (card && e.target === card && e.propertyName === 'opacity' && !card.hasAttribute('data-show')) release();
    };
    const t1 = window.setTimeout(() => {
      setShow(true);
      markIntroSeen();
      t2 = window.setTimeout(() => {
        setShow(false);
        card?.addEventListener('transitionend', onFaded);
        t3 = window.setTimeout(release, FADE * 3);
      }, HOLD);
    }, showDelay.current);
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
      card?.removeEventListener('transitionend', onFaded);
      evs.forEach((ev) => window.removeEventListener(ev, clear));
    };
  }, [reduced]);

  if (skip.current || !intro || reduced) return null;
  return (
    <div ref={cardRef} className="intro-card" data-show={show || undefined} aria-hidden={!show}>
      <p className="intro-card__title">{intro.title}</p>
      {/* (a second line only when there's something it needs to add) */}
      {intro.body && <p className="intro-card__body">{intro.body}</p>}
    </div>
  );
}
