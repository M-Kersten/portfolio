import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { caseBySlug, cases, site } from '../../content';
import { EXHIBITS, NEXT_LAUNCH_NO, exhibitNo, pad2 } from '../../content/exhibits';
import { returning, sceneStore, useSceneSelector } from '../../scene/store';
import { HOTSPOTS } from '../../scene/framing';
import { PRESS, useReducedMotion } from '../../lib/media';
import { Scramble } from '../shell/Scramble';

// Three invisible scroll panels give the camera journey its length and drive
// `journeyStep` (0 City · 1 Room · 2 Chip). The minimal title lives only on
// the City layer and clears the moment you scroll down (or inspect a node).

const STEPS = [0, 1, 2];

// One line of narration per layer, so the descent reads as a told story
// instead of a silent slideshow. The layer's name carries its accent.
const CAPTIONS = [
  { name: 'city', blurb: 'at the scale of streets', accent: 'var(--cyan)' },
  { name: 'room', blurb: 'the things you pick up and use', accent: 'var(--coral)' },
  { name: 'chip', blurb: 'the tools supporting it all', accent: 'var(--lime)' },
];

// The exploration game: every object in the maquette IS a project, an exhibit
// numbered 01–10 — click one and it lights up. The tally is quiet instrument
// chrome that doubles as the exhibition guide (which exhibit stands where,
// which are still dark, and exhibit 11, the launch they add up to); it steps
// once a hotspot's HUD closes and the zoom-out has settled, not the instant it
// opens, so the visitor watches the model fill in rather than seeing the
// number jump while still looking at a close-up. 10/10 triggers the world's
// completion state (see scene/maquette) — the rocket at NextProjectSite goes
// from ghost to lit, and the tally's own label says so.
const TOTAL = HOTSPOTS.length;
const LAYERS = [
  { key: 'city', name: 'city' },
  { key: 'room', name: 'room' },
  { key: 'chip', name: 'chip' },
] as const;
// How long the ambient tally waits, after a hotspot's HUD closes, before it
// steps to the new count. Roughly how long CameraRig's exponential zoom-out
// takes to visually settle (it eases at k=3.4/s — ~95% of the way there by
// ~0.9s) — the tally lands once the visitor is actually looking at the whole
// model again, rather than jumping the instant they open a project, while
// they're still looking at the close-up and never see the model fill in.
const TALLY_SETTLE_MS = 900;
/** The tally's words: the count, and what it's counting toward. The model
 *  assembles the next launch as exhibits light up, so the label names that
 *  goal from the first glance, counts down the last two, and says when it's ready. */
function tallyLabel(n: number, cue: boolean): string {
  if (n >= TOTAL) return `${TOTAL}/${TOTAL} lit · ready to launch`;
  // while the first-visit hint above it says the goal, the tally doesn't repeat it
  if (n === 0) return cue ? `0/${TOTAL} lit` : `0/${TOTAL} lit · light all ${TOTAL} to launch`;
  if (n >= TOTAL - 2) return `${n}/${TOTAL} lit · ${TOTAL - n} to go`;
  return `${n}/${TOTAL} lit · stacking the next launch`;
}
/** The line a returning visitor is greeted with, above the tally. The tally
 *  beside it already has the count, so this only says where they stand. */
function welcomeLine(n: number): string {
  if (n >= TOTAL) return 'Welcome back — the next launch is still on the pad';
  if (n > 0) return 'Welcome back — the model is as you left it';
  return 'Welcome back';
}
// how long the greeting stays up once the boot has played, and its fade out
const WELCOME_MS = 6500;
const WELCOME_FADE_MS = 600;
/** The projects that aren't in the model: on the timeline and /projects. */
const IN_COLLECTION = cases.filter((c) => !EXHIBITS.includes(c.slug)).length;

export function HeroStage() {
  const selectedSlug = useSceneSelector((s) => s.selectedSlug);
  const journeyStep = useSceneSelector((s) => s.journeyStep);
  const visited = useSceneSelector((s) => s.visited);
  // the launch takes the whole frame, from the pad to the game
  const launching = useSceneSelector((s) => s.launch !== 'idle');
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
  // First-visit cue (scene store): with the instrument line, one line that
  // states the premise, while a crosshair in the model asks to be clicked;
  // both retire for good the moment a first project is opened.
  const cue = useSceneSelector((s) => s.cue);
  // A returning visitor (the opening has played in this browser before) is
  // greeted for a few seconds as the instrument line comes up; the first-visit
  // cue, if it still applies, takes the spot after it. Opening anything ends it.
  const [welcome, setWelcome] = useState<'on' | 'leaving' | 'off'>(returning ? 'on' : 'off');

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

  // The real, live count — used wherever truth matters more than pacing: the
  // manifest dialog (a deliberate "let me check" action) and the aria-label.
  const found = visited.filter((slug) => HOTSPOTS.some((h) => h.slug === slug)).length;
  const foundRef = useRef(found);
  foundRef.current = found;

  // The AMBIENT tally — the pips and the label a visitor sees without asking
  // for it — shows the model's settled count (scene store), which trails
  // `found` and only steps on a deselect (zoom-out), after TALLY_SETTLE_MS.
  // Keyed on selectedSlug transitions rather than `found` itself, so opening a
  // hotspot never moves it; only closing one does. The rocket on the pad reads
  // the same count, so its next piece rises as the tally ticks.
  const revealed = useSceneSelector((s) => s.settled);
  // Bumped only on an actual numeric change (never on mount) — it's both the
  // label's `key` (React remounts on a new key, which is what restarts the
  // flash keyframe) and the switch that adds the flash class at all, so the
  // very first paint never flashes for a change that didn't happen.
  const [flashKey, setFlashKey] = useState(0);
  const wasSelected = useRef(selectedSlug);
  useEffect(() => {
    const prev = wasSelected.current;
    wasSelected.current = selectedSlug;
    if (!prev || selectedSlug) return; // only fires on prev-non-null -> null
    const reveal = () => {
      const next = foundRef.current;
      if (next === sceneStore.snapshot().settled) return; // reopened something already counted
      sceneStore.settle(next);
      setFlashKey((k) => k + 1);
    };
    if (reduced) {
      reveal();
      return;
    }
    const t = window.setTimeout(reveal, TALLY_SETTLE_MS);
    return () => clearTimeout(t);
  }, [selectedSlug, reduced]);

  const complete = revealed === TOTAL;

  // reveal the bottom instrument line last — a beat after the hero title itself
  // decodes in, which only happens once the load intro card has cleared
  // (introOver). Keeps the reveal to one thing at a time.
  useEffect(() => {
    if (reduced || !introOver) return;
    const t = window.setTimeout(() => setBooted(true), 1200);
    return () => clearTimeout(t);
  }, [reduced, introOver]);
  // …and the boot is over: the cue in the model can come in now
  useEffect(() => {
    if (booted) sceneStore.setBooted();
  }, [booted]);

  // the greeting's lifetime: up with the instrument line, then out
  useEffect(() => {
    if (!booted || welcome === 'off') return;
    if (selectedSlug || launching || manifestOpen) {
      setWelcome('off');
      return;
    }
    const t = window.setTimeout(() => setWelcome(welcome === 'on' ? 'leaving' : 'off'), welcome === 'on' ? WELCOME_MS : reduced ? 0 : WELCOME_FADE_MS);
    return () => clearTimeout(t);
  }, [booted, welcome, selectedSlug, launching, manifestOpen, reduced]);

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
  const opacity = selectedSlug || launching ? 0 : heroInView && journeyStep === 0 ? 1 : 0;
  // The caption + model tally ride the whole journey, clearing with the HUD
  // and the moment the next section takes over the bottom of the screen.
  const overlayOpacity = selectedSlug || launching || !heroOwnsBottom ? 0 : 1;
  const caption = CAPTIONS[journeyStep] ?? CAPTIONS[0];

  const openFromManifest = (slug: string) => {
    setManifestOpen(false);
    navigate(`/work/${slug}`);
  };
  // exhibit 11: up to the city, where the pad stands, and onto it
  const openPad = () => {
    setManifestOpen(false);
    const hero = heroRef.current;
    if (hero) window.scrollTo({ top: hero.offsetTop });
    sceneStore.setJourneyStep(0);
    sceneStore.setLaunch('pad');
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
        <b>{caption.name}</b> <span>— {caption.blurb}</span>
      </div>

      {/* The model tally — every object in the maquette is a project; this is
          the running count, and clicking it opens the manifest. */}
      <div
        className="hero__signals"
        style={{ opacity: overlayOpacity * (booted ? 1 : 0), pointerEvents: overlayOpacity && booted ? undefined : 'none' }}
        data-complete={complete || undefined}
      >
        {welcome !== 'off'
          ? booted &&
            !manifestOpen && (
              <p className="hero__hint hero__hint--welcome" data-leaving={welcome === 'leaving' || undefined} role="status">
                {welcomeLine(revealed)}
              </p>
            )
          : cue &&
            !manifestOpen && (
              <p className="hero__hint" aria-hidden="true">
                {PRESS} an exhibit to light it — all ten launch the next one
              </p>
            )}
        {manifestOpen && (
          <div className="manifest" role="dialog" aria-label="Exhibition guide">
            <div className="manifest__head">
              <b>exhibition guide</b>
            </div>
            {LAYERS.map((l) => (
              <div key={l.key} className="manifest__layer">
                <span className="manifest__index">{l.name}</span>
                <ul>
                  {HOTSPOTS.filter((h) => h.layer === l.key).map((h) => {
                    const c = caseBySlug(h.slug);
                    const on = visited.includes(h.slug);
                    const no = pad2(exhibitNo(h.slug) ?? 0);
                    return (
                      <li key={h.slug}>
                        {on ? (
                          <button type="button" onClick={() => openFromManifest(h.slug)}>
                            <i data-on="" />
                            <span className="manifest__no">{no}</span>
                            {c?.title ?? h.slug}
                          </button>
                        ) : (
                          // still dark: its name stays redacted, but it's a way
                          // there — the camera flies to it and it lights up
                          <button
                            type="button"
                            className="manifest__dark"
                            onClick={() => openFromManifest(h.slug)}
                            aria-label={`Fly to exhibit ${no}, still dark, in the ${l.name}`}
                          >
                            <i />
                            <span className="manifest__no">{no}</span>
                            <span aria-hidden="true">{'▓'.repeat(Math.min(12, Math.max(6, (c?.title ?? h.slug).length)))}</span>
                            <span className="manifest__go" aria-hidden="true">
                              fly there →
                            </span>
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {/* exhibit 11: what the ten add up to */}
            <div className="manifest__layer manifest__next">
              {found === TOTAL ? (
                <button type="button" onClick={openPad}>
                  <i data-on="" />
                  <span className="manifest__no">{NEXT_LAUNCH_NO}</span>
                  The next launch
                  <span className="manifest__go">on the pad →</span>
                </button>
              ) : (
                <span className="manifest__dark">
                  <i />
                  <span className="manifest__no">{NEXT_LAUNCH_NO}</span>
                  The next launch
                  <span className="manifest__when">lights at {TOTAL}</span>
                </span>
              )}
            </div>
            <Link className="manifest__more" to="/projects" onClick={() => setManifestOpen(false)}>
              {IN_COLLECTION} more in the collection <span aria-hidden="true">→</span>
            </Link>
            {found > 0 && (
              <button
                type="button"
                className="manifest__reset"
                onClick={() => {
                  setManifestOpen(false);
                  sceneStore.resetVisited();
                }}
              >
                start the tour over
              </button>
            )}
          </div>
        )}
        <button type="button" className="hero__signals-btn" aria-expanded={manifestOpen} onClick={() => setManifestOpen((v) => !v)}>
          {/* Named by its visible text plus a hidden hint, rather than an
              aria-label that said something else ("Projects live in the model:
              0 of 10…") — speech input users say what they see. */}
          <span className="hero__signals-pips" aria-hidden="true">
            {HOTSPOTS.map((h, i) =>
              i < TOTAL - 1 ? (
                <i key={h.slug} data-on={i < revealed || undefined} />
              ) : (
                // the last one is what the ten add up to: the rocket
                <svg key={h.slug} className="hero__signals-rocket" viewBox="0 0 8 12" data-on={i < revealed || undefined}>
                  <path d="M4 0.6C5.6 2.2 6 4.4 6 6.6V9H2V6.6C2 4.4 2.4 2.2 4 0.6Z" />
                  <path d="M2 7.2 0.6 9.6V10.6L2 9.8ZM6 7.2 7.4 9.6V10.6L6 9.8Z" />
                </svg>
              ),
            )}
          </span>
          <span key={flashKey} className={flashKey > 0 ? 'hero__signals-label hero__signals-label--flash' : 'hero__signals-label'}>
            {tallyLabel(revealed, cue)}
          </span>
          <span className="visually-hidden"> — the exhibition guide</span>
        </button>
      </div>

      {STEPS.map((step) => (
        <div key={step} className="hero__panel" data-step={step} aria-hidden="true" />
      ))}
    </section>
  );
}
