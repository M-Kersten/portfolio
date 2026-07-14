import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { site } from '../content';
import { sceneStore, useSceneSelector } from '../scene/store';
import { HOTSPOTS } from '../scene/framing';

// Three invisible scroll panels give the camera journey its length and drive
// `journeyStep` (0 City · 1 Room · 2 Chip). The minimal title lives only on
// the City layer and clears the moment you scroll down (or inspect a node).

const STEPS = [0, 1, 2];

// One line of narration per layer, so the descent reads as a told story
// instead of a silent slideshow. The index carries the layer's accent.
const CAPTIONS = [
  { index: '01', name: 'city', blurb: 'at the scale of streets', accent: 'var(--cyan)' },
  { index: '02', name: 'room', blurb: 'the things you pick up and use', accent: 'var(--coral)' },
  { index: '03', name: 'chip', blurb: 'the tools supporting it all', accent: 'var(--lime)' },
];

// The exploration game: every 3D hotspot brought alive counts as a found
// signal. The tally is quiet instrument chrome; 10/10 triggers the world's
// completion state (see scene/maquette — threads stay lit, the city fully
// illuminates, and the "next project" ghost materialises).
const TOTAL_SIGNALS = HOTSPOTS.length;

export function HeroStage() {
  const selectedSlug = useSceneSelector((s) => s.selectedSlug);
  const journeyStep = useSceneSelector((s) => s.journeyStep);
  const heroRef = useRef<HTMLElement>(null);
  // Whether the hero itself is on screen — guards against `journeyStep` going
  // stale (e.g. an anchor jump straight to the wall never crosses a panel).
  const [heroInView, setHeroInView] = useState(true);
  // Whether the hero still owns the bottom edge of the viewport. The caption +
  // signals tally live down there, so they clear as soon as the capabilities
  // section scrolls up over that spot instead of lingering on top of it.
  const [heroOwnsBottom, setHeroOwnsBottom] = useState(true);

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
        setHeroOwnsBottom(r.bottom > vh - 32);

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
  // The caption + signal tally ride the whole journey, clearing with the HUD
  // and the moment the next section takes over the bottom of the screen.
  const overlayOpacity = selectedSlug || !heroOwnsBottom ? 0 : 1;
  const caption = CAPTIONS[journeyStep] ?? CAPTIONS[0];
  const found = useSceneSelector(
    (s) => HOTSPOTS.filter((h) => s.visited.includes(h.slug)).length,
  );
  const complete = found === TOTAL_SIGNALS;

  return (
    <section id="hero" className="hero" ref={heroRef} aria-label="Introduction">
      <div className="hero__title" style={{ opacity, pointerEvents: 'none' }}>
        <h1 className="hero__name">{site.hero.name}</h1>
        <p className="hero__sub">{site.hero.subheading}</p>
      </div>

      {/* Layer narration — remounts per step so the line slides in fresh. */}
      <div
        key={journeyStep}
        className="hero__caption"
        style={{ opacity: overlayOpacity, '--cap-accent': caption.accent } as CSSProperties}
        aria-hidden="true"
      >
        <b>{caption.index}</b> · {caption.name} <span>— {caption.blurb}</span>
      </div>

      {/* Signals found — the exploration tally. */}
      <div className="hero__signals" style={{ opacity: overlayOpacity }} data-complete={complete || undefined} aria-hidden="true">
        <span className="hero__signals-pips">
          {HOTSPOTS.map((h, i) => (
            <i key={h.slug} data-on={i < found || undefined} />
          ))}
        </span>
        <span className="hero__signals-label">
          {complete ? `signals ${TOTAL_SIGNALS}/${TOTAL_SIGNALS} — all live` : `signals ${found}/${TOTAL_SIGNALS}`}
        </span>
      </div>

      {STEPS.map((step) => (
        <div key={step} className="hero__panel" data-step={step} aria-hidden="true" />
      ))}
    </section>
  );
}
