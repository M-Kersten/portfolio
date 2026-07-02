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
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Whether the hero itself is on screen — guards against `journeyStep` going
  // stale (e.g. an anchor jump straight to the wall never crosses a panel).
  const [heroInView, setHeroInView] = useState(true);

  // Active layer = the panel crossing the viewport centre (robust to short panels).
  useEffect(() => {
    const panels = panelRefs.current.filter(Boolean) as HTMLDivElement[];
    if (panels.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) sceneStore.setJourneyStep(Number((e.target as HTMLElement).dataset.step));
        });
      },
      { rootMargin: '-50% 0px -50% 0px', threshold: 0 },
    );
    panels.forEach((p) => io.observe(p));
    return () => io.disconnect();
  }, []);

  // Is the hero on screen? Polled on a rAF loop rather than via scroll events or
  // an IntersectionObserver — an instant anchor jump straight to the content
  // below doesn't reliably trip either, which used to strand the title over the
  // wall. One cheap rect read per frame; setState bails when the value is stable.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const hero = heroRef.current;
      if (hero) {
        const r = hero.getBoundingClientRect();
        setHeroInView(r.bottom > 0 && r.top < window.innerHeight);
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
        <div
          key={s.step}
          ref={(el) => (panelRefs.current[s.step] = el)}
          className="hero__panel"
          data-step={s.step}
          aria-hidden="true"
        />
      ))}
    </section>
  );
}
