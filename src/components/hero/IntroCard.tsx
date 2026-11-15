import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import { site } from '../../content';
import { EXHIBITION } from '../../content/exhibits';
import { markIntroSeen, returning, sceneStore, useSceneSelector } from '../../scene/store';
import { useReducedMotion } from '../../lib/media';

// The opening's greeting, said once: "Hi, I'm Merijn", and under it "and this
// is my work in miniature." It's set as the hero's title is and stands exactly
// where the title will, beside the model (over it, on an upright screen),
// while the opening shot plays (the camera rising from the chip to the city as
// the model turns: CameraRig): the greeting where the name comes, at its size,
// the rest where the line under the name comes. Its words rise one after
// another as the shot gets going, hold for the rise, and leave the way they
// came as it lands — or the moment the visitor scrolls/taps. The title is the
// next beat, in the same place: it's released once the greeting has gone, so
// "Hi, I'm Merijn" gives way to "Merijn Kersten". A returning visitor has had
// the opening and gets neither it nor the greeting; nor does a deep link (a
// /work node), or reduced motion: the title is simply there. The copy lives
// in site.hero.intro (`title` the greeting, `body` the line under it; remove
// the field to drop both).

const FADE = 800; // ms for the greeting to go (covers intro-card.css's exit: the words, then the block)
/** How long the hero's title waits for an opening that hasn't begun (the 3D
 *  still downloading on a slow line, or not coming at all: no WebGL). It then
 *  goes ahead without one; an opening that arrives later plays under it. */
const NO_SHOW = 3600; // ms

export function IntroCard() {
  const intro = site.hero.intro;
  const reduced = useReducedMotion();
  // where the opening shot is (the camera sets it)
  const phase = useSceneSelector((s) => s.opening);
  // No opening to wait for: a returning visitor (it plays once per browser), a
  // deep link (a /work/… route goes straight to the node), or the intro
  // already released — so navigating back to home from another route doesn't
  // replay it.
  const skip = useRef(
    !intro || returning || (typeof window !== 'undefined' && /\/work\//.test(window.location.pathname)) || sceneStore.snapshot().introOver,
  );
  // (once the title is released there's nothing left of it on the page)
  const introOver = useSceneSelector((s) => s.introOver);
  // not up yet · up · going
  const [stage, setStage] = useState<'wait' | 'in' | 'out'>('wait');
  const cardRef = useRef<HTMLDivElement>(null);
  const began = useRef(false); // the opening has been seen to begin
  const off = skip.current || reduced;

  // Nothing to play (a return visit / deep link / no copy / reduced motion):
  // release the hero chrome right away so the title + subtitle aren't held
  // back for nothing.
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
      setStage('in');
      markIntroSeen();
      return;
    }
    if (!began.current || phase === 'wait') return;
    // landing, or over (cut short): the greeting goes, then the title comes
    setStage('out');
    const card = cardRef.current;
    const release = () => sceneStore.endIntro();
    const onFaded = (e: TransitionEvent) => {
      if (e.target === card && e.propertyName === 'opacity') release();
    };
    card?.addEventListener('transitionend', onFaded);
    const backstop = window.setTimeout(release, FADE * 2);
    return () => {
      card?.removeEventListener('transitionend', onFaded);
      clearTimeout(backstop);
    };
  }, [phase, off]);

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
    const clear = () => sceneStore.endIntro();
    const evs = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    evs.forEach((ev) => window.addEventListener(ev, clear, { passive: true }));
    return () => evs.forEach((ev) => window.removeEventListener(ev, clear));
  }, [off]);

  if (off || !intro || introOver) return null;
  // Each word rises from behind its own line (a mask: intro-card.css), one
  // after another, so it's said rather than switched on. The words are only
  // its drawing: it's read out from the copy kept beside them.
  const greeting = intro.title.split(/\s+/).filter(Boolean);
  const rest = (intro.body ?? '').split(/\s+/).filter(Boolean);
  const word = (text: string, i: number) => (
    <Fragment key={i}>
      <span className="intro-card__word" aria-hidden="true">
        <span style={{ '--i': i } as CSSProperties}>{text}</span>
      </span>{' '}
    </Fragment>
  );
  return (
    <div ref={cardRef} className="hero__title intro-card" data-show={stage === 'in' || undefined} data-gone={stage === 'out' || undefined} aria-hidden={stage !== 'in'}>
      {/* the room the title's own first line takes (the exhibition's name),
          kept so the greeting stands on the name's lines, not above them */}
      <p className="hero__kicker" aria-hidden="true">
        {EXHIBITION}
      </p>
      <p className="hero__name">
        <span className="visually-hidden">{intro.title}</span>
        {greeting.map(word)}
      </p>
      {rest.length > 0 && (
        <p className="hero__sub">
          <span className="visually-hidden">{intro.body}</span>
          {/* (a beat after the greeting's last word) */}
          {rest.map((text, i) => word(text, i + greeting.length + 3))}
        </p>
      )}
    </div>
  );
}
