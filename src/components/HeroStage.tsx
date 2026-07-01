import { useEffect, useRef } from 'react';
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
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);

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

  // Title lives only on the City layer; it clears the moment you scroll to Room.
  const opacity = selectedSlug ? 0 : journeyStep === 0 ? 1 : 0;

  return (
    <section id="hero" className="hero" aria-label="Introduction">
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
