import { useEffect, useRef, useState } from 'react';
import { site } from '../../content';
import { returning, sceneStore, useSceneSelector } from '../../scene/store';
import { HOTSPOTS, stepAt } from '../../scene/framing';
import { useReducedMotion } from '../../lib/media';
import { useEscape } from '../../lib/page';
import { Scramble } from '../shell/Scramble';
import { EXHIBITION } from '../../content/exhibits';
import { ExhibitionGuide } from './ExhibitionGuide';

// Three invisible scroll panels give the camera journey its length and drive
// `journeyStep` (0 City · 1 Room · 2 Chip). The title (the exhibition's name,
// yours under it, and the line under that) lives only on the City layer and
// clears the moment you scroll down (or inspect a node).

const STEPS = [0, 1, 2];

// Every object in the maquette is a project, an exhibit numbered 01–10, kept
// in low light until it's visited (as a gallery does), then lit for good. The
// one sign along the bottom is the exhibition guide's cover, with how many of
// the ten you've seen printed on it, and what they add up to (the launch). The
// count steps once a
// hotspot's HUD closes and the zoom-out has settled, not the instant it opens,
// so the visitor watches the model fill in rather than seeing the number jump
// while still looking at a close-up. 10/10 triggers the world's completion
// state (see scene/maquette): the rocket at NextProjectSite goes from ghost to
// lit.
const TOTAL = HOTSPOTS.length;
// How long the ambient tally waits, after a hotspot's HUD closes, before it
// steps to the new count. Roughly how long CameraRig's zoom-out takes to
// visually settle (its spring, CAMERA.glide, is ~95% of the way there by
// ~0.9s) — the tally lands once the visitor is actually looking at the whole
// model again, rather than jumping the instant they open a project, while
// they're still looking at the close-up and never see the model fill in.
const TALLY_SETTLE_MS = 900;
// Back from an exhibit, the hero's chrome (the title and the guide) waits
// this long before it fades back, so it returns over the model rather
// than over the close-up the camera is still pulling out of (the markers wait
// the same, hotspots.tsx).
const RETURN_MS = 400;
// A returning visitor is greeted on the guide's cover, under the count, for a
// few seconds: just "Welcome back" (the count above it already says how far
// they got). How long it stays up once the boot has played, and its fade out:
const WELCOME_MS = 6500;
const WELCOME_FADE_MS = 600;

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
  const heroRef = useRef<HTMLElement>(null);
  // Whether the hero itself is on screen — guards against `journeyStep` going
  // stale (e.g. an anchor jump straight to the wall never crosses a panel).
  const [heroInView, setHeroInView] = useState(true);
  // Whether the hero still owns the bottom edge of the viewport. The guide's
  // cover lives down there, so it clears as soon as the capabilities section
  // scrolls up over that spot instead of lingering on top of it.
  const [heroOwnsBottom, setHeroOwnsBottom] = useState(true);
  const reduced = useReducedMotion();
  // the guide is a ticket pushed into the screen's edge: 'closing' is it turning face up and sliding back in
  const [guide, setGuide] = useState<'closed' | 'open' | 'closing'>('closed');
  const guideOpen = guide === 'open';
  const closeGuide = () => setGuide((g) => (g === 'open' ? 'closing' : g));
  useEffect(() => {
    if (guide !== 'closing') return;
    const t = window.setTimeout(() => setGuide('closed'), reduced ? 0 : 880);
    return () => clearTimeout(t);
  }, [guide, reduced]);
  // Load boot sequence: the guide's cover along the bottom is the LAST beat —
  // it's held until the hero text has decoded in and the
  // maquette has powered on, so the boot reads as one thing at a time. Instant
  // under reduced motion.
  const [booted, setBooted] = useState(reduced);
  // A returning visitor (the opening has played in this browser before) is
  // greeted for a few seconds on the guide's cover as it comes up. Opening
  // anything ends it.
  const [welcome, setWelcome] = useState<'on' | 'leaving' | 'off'>(returning ? 'on' : 'off');

  // The scroll journey and the "is the hero on screen?" flag are both derived
  // from the hero's own scroll progress on one cheap rAF loop (no scroll events,
  // no IntersectionObserver). An instant anchor jump straight to the content
  // below doesn't reliably trip an observer, which used to strand the title over
  // the wall — a per-frame rect read is robust to that.
  //
  // journeyStep = which band of the hero's scroll travel we're in (stepAt).
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
        const step = stepAt(p);
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
  // exhibition guide (a deliberate "let me check" action) and the aria-label.
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
  // just back from an exhibit (see RETURN_MS)
  const [returningFrom, setReturningFrom] = useState(false);
  const hadSelection = useRef(selectedSlug);
  useEffect(() => {
    const was = hadSelection.current;
    hadSelection.current = selectedSlug;
    if (selectedSlug) setReturningFrom(false);
    if (!was || selectedSlug || reduced) return;
    setReturningFrom(true);
    const t = window.setTimeout(() => setReturningFrom(false), RETURN_MS);
    return () => clearTimeout(t);
  }, [selectedSlug, reduced]);
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
    if (selectedSlug || launching || guideOpen) {
      setWelcome('off');
      return;
    }
    const t = window.setTimeout(() => setWelcome(welcome === 'on' ? 'leaving' : 'off'), welcome === 'on' ? WELCOME_MS : reduced ? 0 : WELCOME_FADE_MS);
    return () => clearTimeout(t);
  }, [booted, welcome, selectedSlug, launching, guideOpen, reduced]);

  // Esc closes the guide
  useEscape(closeGuide, guideOpen);

  // Title lives only on the City layer (and only while the hero is on screen);
  // it clears the moment you scroll to Room or leave the hero entirely.
  const away = Boolean(selectedSlug) || launching || returningFrom;
  const opacity = away ? 0 : heroInView && journeyStep === 0 ? 1 : 0;
  // The guide's cover rides the whole journey, clearing with the HUD and the
  // moment the next section takes over the bottom of the screen.
  const overlayOpacity = away || !heroOwnsBottom ? 0 : 1;
  // under the count, for a moment: a returning visitor's greeting
  const here =
    welcome !== 'off' && booted && !guideOpen ? (
      <span className="guide__cover-here" data-leaving={welcome === 'leaving' || undefined}>
        Welcome back
      </span>
    ) : null;
  // out of sight (a label opened, the page scrolled on): the ticket goes back in, so an unseen sheet never catches a click
  useEffect(() => {
    if (!overlayOpacity) setGuide('closed');
  }, [overlayOpacity]);

  // exhibit 11, from the guide: up to the city, where the pad stands, and onto it
  const openPad = () => {
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
          <p className="hero__kicker">{EXHIBITION}</p>
          <h1 className="hero__name">
            <Scramble text={site.hero.name} delay={380} wrap />
          </h1>
          <p className="hero__sub">{site.hero.subheading}</p>
        </div>
      )}

      {/* The one sign along the bottom: the exhibition guide's cover, with
          the count printed on it. Pressing it pulls the guide out. (The cover
          is decoration to a screen reader, so the greeting is said from here.) */}
      <p className="visually-hidden" role="status">
        {welcome === 'on' && booted ? 'Welcome back' : ''}
      </p>
      <div
        className="hero__signals"
        style={{ opacity: overlayOpacity * (booted ? 1 : 0), pointerEvents: overlayOpacity && booted ? undefined : 'none' }}
        data-complete={complete || undefined}
      >
        <ExhibitionGuide
          state={guide}
          visited={visited}
          revealed={revealed}
          here={here}
          flashKey={flashKey}
          onOpen={() => setGuide('open')}
          onClose={closeGuide}
          onOpenPad={openPad}
        />
      </div>

      {STEPS.map((step) => (
        <div key={step} className="hero__panel" data-step={step} aria-hidden="true" />
      ))}
    </section>
  );
}
