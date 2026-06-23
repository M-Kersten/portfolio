import { useEffect, useRef, useState } from 'react';
import { site } from '../content';
import { sceneStore, useSceneSelector } from '../scene/store';
import { useReducedMotion } from '../lib/useReducedMotion';

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
  const reduced = useReducedMotion();
  const selectedSlug = useSceneSelector((s) => s.selectedSlug);
  const journeyStep = useSceneSelector((s) => s.journeyStep);

  const stageRef = useRef<HTMLElement>(null);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [topness, setTopness] = useState(1);

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

  // Keep the title + indicator visible across the whole journey; fade only once
  // the viewport centre drops below the stage (i.e. past the last layer, Chip).
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const vh = window.innerHeight;
        const stage = stageRef.current;
        const panelH = panelRefs.current[0]?.offsetHeight || vh * 0.58;
        const stageBottom = stage ? stage.offsetTop + stage.offsetHeight : panelH * 3;
        const past = (window.scrollY + vh / 2 - stageBottom) / (vh * 0.5);
        setTopness(1 - Math.min(1, Math.max(0, past)));
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const opacity = selectedSlug ? 0 : topness;
  const hidden = opacity < 0.05;
  const goto = (step: number) =>
    panelRefs.current[step]?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });

  return (
    <section id="hero" className="hero" ref={stageRef} aria-label="Introduction">
      <div className="hero__title" style={{ opacity, pointerEvents: 'none' }}>
        <h1 className="hero__name">{site.hero.name}</h1>
        <p className="hero__sub">{site.hero.subheading}</p>
        <p className="hero__scrollcue" aria-hidden="true">scroll down, have a poke around ↓</p>
      </div>

      <nav className="hero__indicator" style={{ opacity, pointerEvents: hidden ? 'none' : undefined }} aria-label="Layers">
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
