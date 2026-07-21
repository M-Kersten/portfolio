import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { caseBySlug, site } from '../content';
import { sceneStore, useSceneSelector } from '../scene/store';
import { HOTSPOTS } from '../scene/framing';
import { useReducedMotion } from '../lib/useReducedMotion';
import { Scramble } from './Scramble';

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

// The exploration game: every object in the maquette IS a project — click one
// and it comes alive. The tally is quiet instrument chrome that doubles as the
// model manifest (which projects stand where, which are still dark); 10/10
// triggers the world's completion state (see scene/maquette).
const TOTAL = HOTSPOTS.length;
const LAYERS = [
  { key: 'city', index: '01', name: 'city' },
  { key: 'room', index: '02', name: 'room' },
  { key: 'chip', index: '03', name: 'chip' },
] as const;
const HINT_KEY = 'mk-model-hint';

export function HeroStage() {
  const selectedSlug = useSceneSelector((s) => s.selectedSlug);
  const journeyStep = useSceneSelector((s) => s.journeyStep);
  const visited = useSceneSelector((s) => s.visited);
  // Gates the whole hero chrome: held false through the load intro (the centred
  // premise card), flipped true once that card clears — so the title/subtitle
  // are the beat *after* the intro, not underneath it. See IntroCard.
  const introOver = useSceneSelector((s) => s.introOver);
  const navigate = useNavigate();
  const heroRef = useRef<HTMLElement>(null);
  // Whether the hero itself is on screen — guards against `journeyStep` going
  // stale (e.g. an anchor jump straight to the wall never crosses a panel).
  const [heroInView, setHeroInView] = useState(true);
  // Whether the hero still owns the bottom edge of the viewport. The caption +
  // model tally live down there, so they clear as soon as the capabilities
  // section scrolls up over that spot instead of lingering on top of it.
  const [heroOwnsBottom, setHeroOwnsBottom] = useState(true);
  const [manifestOpen, setManifestOpen] = useState(false);
  const reduced = useReducedMotion();
  // Load boot sequence: the bottom instrument line (layer caption + model tally)
  // is the LAST beat — it's held until the hero text has decoded in and the
  // maquette has powered on, so the boot reads as one thing at a time. Instant
  // under reduced motion.
  const [booted, setBooted] = useState(reduced);
  // First-visit whisper: one line that states the premise, once, then never
  // again (dismissed forever the moment a first project is opened).
  const [hintDone, setHintDone] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) === '1';
    } catch {
      return true;
    }
  });
  const [hintShown, setHintShown] = useState(false);

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

  const found = visited.filter((slug) => HOTSPOTS.some((h) => h.slug === slug)).length;
  const complete = found === TOTAL;

  // the whisper waits a beat, then appears — and retires for good on the
  // first opened project
  useEffect(() => {
    if (hintDone) return;
    const t = window.setTimeout(() => setHintShown(true), 2600);
    return () => clearTimeout(t);
  }, [hintDone]);

  // reveal the bottom instrument line last — a beat after the hero title itself
  // decodes in, which only happens once the load intro card has cleared
  // (introOver). Keeps the reveal to one thing at a time.
  useEffect(() => {
    if (reduced || !introOver) return;
    const t = window.setTimeout(() => setBooted(true), 1200);
    return () => clearTimeout(t);
  }, [reduced, introOver]);
  useEffect(() => {
    if (!hintDone && (selectedSlug !== null || found > 0)) {
      setHintDone(true);
      try {
        localStorage.setItem(HINT_KEY, '1');
      } catch {
        /* fine — shows again next visit */
      }
    }
  }, [selectedSlug, found, hintDone]);

  // Esc closes the manifest
  useEffect(() => {
    if (!manifestOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setManifestOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [manifestOpen]);

  // Title lives only on the City layer (and only while the hero is on screen);
  // it clears the moment you scroll to Room or leave the hero entirely.
  const opacity = selectedSlug ? 0 : heroInView && journeyStep === 0 ? 1 : 0;
  // The caption + model tally ride the whole journey, clearing with the HUD
  // and the moment the next section takes over the bottom of the screen.
  const overlayOpacity = selectedSlug || !heroOwnsBottom ? 0 : 1;
  const caption = CAPTIONS[journeyStep] ?? CAPTIONS[0];

  const openFromManifest = (slug: string) => {
    setManifestOpen(false);
    navigate(`/work/${slug}`);
  };

  return (
    <section id="hero" className="hero" ref={heroRef} aria-label="Introduction">
      {/* Held back through the load intro, then mounted — so its decode + rise
          play at the moment it appears (the beat after the premise card), not
          silently at load behind the card. */}
      {introOver && (
        <div className="hero__title" style={{ opacity, pointerEvents: 'none' }}>
          <h1 className="hero__name">
            <Scramble text={site.hero.name} delay={380} wrap />
          </h1>
          <p className="hero__sub">{site.hero.subheading}</p>
        </div>
      )}

      {/* Layer narration — remounts per step so the line slides in fresh. */}
      <div
        key={journeyStep}
        className="hero__caption"
        style={{ opacity: overlayOpacity * (booted ? 1 : 0), '--cap-accent': caption.accent } as CSSProperties}
        aria-hidden="true"
      >
        <b>{caption.index}</b> · {caption.name} <span>— {caption.blurb}</span>
      </div>

      {/* The model tally — every object in the maquette is a project; this is
          the running count, and clicking it opens the manifest. */}
      <div
        className="hero__signals"
        style={{ opacity: overlayOpacity * (booted ? 1 : 0), pointerEvents: overlayOpacity && booted ? undefined : 'none' }}
        data-complete={complete || undefined}
      >
        {hintShown && !hintDone && (
          <p className="hero__hint" aria-hidden="true">
            ten projects built this miniature — click one awake
          </p>
        )}
        {manifestOpen && (
          <div className="manifest" role="dialog" aria-label="Projects in this model">
            <div className="manifest__head">
              <b>the model</b>
              <span>
                {found}/{TOTAL} live
              </span>
            </div>
            {LAYERS.map((l) => (
              <div key={l.key} className="manifest__layer">
                <span className="manifest__index">
                  {l.index} · {l.name}
                </span>
                <ul>
                  {HOTSPOTS.filter((h) => h.layer === l.key).map((h) => {
                    const c = caseBySlug(h.slug);
                    const on = visited.includes(h.slug);
                    return (
                      <li key={h.slug}>
                        {on ? (
                          <button type="button" onClick={() => openFromManifest(h.slug)}>
                            <i data-on="" />
                            {c?.title ?? h.slug}
                          </button>
                        ) : (
                          <span className="manifest__dark">
                            <i />
                            {'▓'.repeat(Math.min(12, Math.max(6, (c?.title ?? h.slug).length)))}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <p className="manifest__foot">every object in the model is a project — click one to wake it</p>
          </div>
        )}
        <button
          type="button"
          className="hero__signals-btn"
          aria-expanded={manifestOpen}
          aria-label={`Projects live in the model: ${found} of ${TOTAL}. Toggle the manifest.`}
          onClick={() => setManifestOpen((v) => !v)}
        >
          <span className="hero__signals-pips">
            {HOTSPOTS.map((h, i) => (
              <i key={h.slug} data-on={i < found || undefined} />
            ))}
          </span>
          <span className="hero__signals-label">
            {complete ? `all ${TOTAL} projects live` : `${found}/${TOTAL} projects live`}
          </span>
        </button>
      </div>

      {STEPS.map((step) => (
        <div key={step} className="hero__panel" data-step={step} aria-hidden="true" />
      ))}
    </section>
  );
}
