import { useEffect, useRef, useState } from 'react';
import { site } from '../content';
import { sceneStore, useSceneSelector } from '../scene/store';
import { useReducedMotion } from '../lib/useReducedMotion';

// Three full-height snap panels give the camera journey its scroll length and
// drive `journeyStep` (which layer is centred). The panels are transparent so the
// fixed canvas shows through; a minimal title + a layer indicator sit on top and
// fade out when a node is inspected.

const STEPS = [
  { step: 0, label: 'City', tag: 'GIS & location' },
  { step: 1, label: 'Room', tag: 'Games · apps · web' },
  { step: 2, label: 'Chip', tag: 'Tools · CV · data' },
];

export function HeroStage() {
  const reduced = useReducedMotion();
  const selectedSlug = useSceneSelector((s) => s.selectedSlug);
  const journeyStep = useSceneSelector((s) => s.journeyStep);

  const stageRef = useRef<HTMLElement>(null);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [inView, setInView] = useState(true);

  // Active layer = the panel currently filling the viewport.
  useEffect(() => {
    const panels = panelRefs.current.filter(Boolean) as HTMLDivElement[];
    if (panels.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            sceneStore.setJourneyStep(Number((e.target as HTMLElement).dataset.step));
          }
        });
      },
      { threshold: [0.5, 0.8] },
    );
    panels.forEach((p) => io.observe(p));
    return () => io.disconnect();
  }, []);

  // Title visibility: only while the stage is on screen.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const titleVisible = inView && !selectedSlug;
  const goto = (step: number) =>
    panelRefs.current[step]?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });

  return (
    <section id="hero" className="hero" ref={stageRef} aria-label="Introduction">
      <div className="hero__title" data-visible={titleVisible}>
        <h1 className="hero__name">{site.hero.name}</h1>
        <p className="hero__sub">{site.hero.subheading}</p>
        <p className="hero__scrollcue" aria-hidden="true">Scroll to explore ↓</p>
      </div>

      <nav className="hero__indicator" data-visible={titleVisible} aria-label="Layers">
        {STEPS.map((s) => (
          <button
            key={s.step}
            type="button"
            className="hero__indicator-step"
            data-active={journeyStep === s.step}
            onClick={() => goto(s.step)}
          >
            <span className="hero__indicator-num">{`0${s.step + 1}`}</span>
            <span className="hero__indicator-label">{s.label}</span>
            <span className="hero__indicator-tag">{s.tag}</span>
          </button>
        ))}
      </nav>

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
