import { useEffect, useRef, useState } from 'react';
import { site } from '../content';
import { sceneStore, useSceneSelector } from '../scene/store';

// Three short snap panels give the camera journey its scroll length and drive
// `journeyStep` (which layer is centred). The minimal title + layer indicator
// stay visible across the whole City → Room → Chip journey and only fade once
// you scroll past the last layer into the content below (or inspect a node).

const STEPS = [
  { step: 0, label: 'City', tag: 'maps & the real world' },
  { step: 1, label: 'Room', tag: 'games, apps & toys' },
  { step: 2, label: 'Chip', tag: 'tools & nerdy bits' },
];

export function HeroStage() {
  const selectedSlug = useSceneSelector((s) => s.selectedSlug);
  const hoveredSlug = useSceneSelector((s) => s.hoveredSlug);

  const stageRef = useRef<HTMLElement>(null);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [topness, setTopness] = useState(1);
  // The intro coach-mark bows out for good the first time you touch a node.
  const [engaged, setEngaged] = useState(false);

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

  // Keep the title + coach-mark visible across the whole journey, then fade them
  // once the hero has scrolled out of view. An IntersectionObserver on the stage
  // is robust to the pinned scroll-jack section below (a scroll-position formula
  // wasn't updating reliably once that tall section was in play).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const io = new IntersectionObserver(([e]) => setTopness(e.isIntersecting ? 1 : 0), { threshold: 0 });
    io.observe(stage);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (hoveredSlug || selectedSlug) setEngaged(true);
  }, [hoveredSlug, selectedSlug]);

  const opacity = selectedSlug ? 0 : topness;
  const coachVisible = !engaged && !selectedSlug && topness > 0.9;

  return (
    <section id="hero" className="hero" ref={stageRef} aria-label="Introduction">
      <div className="hero__title" style={{ opacity, pointerEvents: 'none' }}>
        <h1 className="hero__name">{site.hero.name}</h1>
        <p className="hero__sub">{site.hero.subheading}</p>
        <p className="hero__scrollcue" aria-hidden="true">scroll down, have a poke around ↓</p>
      </div>

      <div className="hero__coach" data-visible={coachVisible} aria-hidden="true">
        <span className="hero__coach-arrow">↑</span>
        <p className="hero__coach-lead">it's all one system</p>
        <p className="hero__coach-text">
          chip · room · city — three scales, the same hands. tap a glowing <b>+</b> to dig in, and watch the threads light up between them.
        </p>
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
