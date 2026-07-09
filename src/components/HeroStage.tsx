import { useEffect, useRef, useState } from 'react';
import { site } from '../content';
import { sceneStore, useSceneSelector } from '../scene/store';

// Three short snap panels give the camera journey its scroll length and drive
// `journeyStep` (which layer is centred). The minimal title lives only on the
// City layer and clears the moment you scroll down to Room (or inspect a node).

const STEPS = [
  { step: 0, label: 'City', tag: 'maps & the real world' },
  { step: 1, label: 'Room', tag: 'games, apps & toys' },
  { step: 2, label: 'Chip', tag: 'tools & nerdy bits' },
];

export function HeroStage() {
  const selectedSlug = useSceneSelector((s) => s.selectedSlug);
  const journeyStep = useSceneSelector((s) => s.journeyStep);
  const heroRef = useRef<HTMLElement>(null);
  // Whether the hero itself is on screen — guards against `journeyStep` going
  // stale (e.g. an anchor jump straight to the wall never crosses a panel).
  const [heroInView, setHeroInView] = useState(true);

  // The scroll journey and the "is the hero on screen?" flag are both derived
  // from the hero's own scroll progress on one cheap rAF loop (no scroll events,
  // no IntersectionObserver). An instant anchor jump straight to the content
  // below doesn't reliably trip an observer, which used to strand the title over
  // the wall — a per-frame rect read is robust to that.
  //
  // journeyStep = which band of the hero's scroll travel we're in. City rests at
  // the very top and Chip at the very bottom, so they're easy to land on at the
  // extremes; Room is the only layer you have to stop *in the middle* to hold.
  // So Room gets the widest band — the middle half of the travel — which makes
  // it easy to reach, while City→Room stays a short first hop.
  useEffect(() => {
    let raf = 0;
    let lastStep = -1;
    const loop = () => {
      const hero = heroRef.current;
      if (hero) {
        const vh = window.innerHeight;
        const r = hero.getBoundingClientRect();
        setHeroInView(r.bottom > 0 && r.top < vh);

        const travel = Math.max(hero.offsetHeight - vh, 1);
        const p = Math.min(Math.max(-r.top, 0), travel) / travel; // 0→1 across the hero
        const step = p >= 0.75 ? 2 : p >= 0.25 ? 1 : 0; // City <0.25 · Room 0.25–0.75 · Chip ≥0.75
        if (step !== lastStep) {
          lastStep = step;
          sceneStore.setJourneyStep(step);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Title lives only on the City layer (and only while the hero is on screen);
  // it clears the moment you scroll to Room or leave the hero entirely.
  const opacity = selectedSlug ? 0 : heroInView && journeyStep === 0 ? 1 : 0;

  return (
    <section id="hero" className="hero" ref={heroRef} aria-label="Introduction">
      <div className="hero__title" style={{ opacity, pointerEvents: 'none' }}>
        <h1 className="hero__name">{site.hero.name}</h1>
        <p className="hero__sub">{site.hero.subheading}</p>
        <p className="hero__scrollcue" aria-hidden="true">have a poke around and see how it's all connected</p>
      </div>

      {STEPS.map((s) => (
        <div key={s.step} className="hero__panel" data-step={s.step} aria-hidden="true" />
      ))}
    </section>
  );
}
