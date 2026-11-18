import { useEffect, useSyncExternalStore } from 'react';
import { sceneStore } from '../../scene/store';
import { loop, play, preload, soundOn, subscribeSound, type Loop, type SoundName } from '../../lib/sound';

// The maquette's sound (lib/sound.ts plays the files): each project waking
// is a low click, the n-th visit `wake-n`, each a little higher than the last,
// and `complete` sounds when all ten are awake and the pad powers on; opening
// one, seen before or not, is the reticle finding it (`focus`: a camera's
// dial clicking, faint, in the moment before the camera goes in; fainter
// still as it comes back out), and a hotspot coming under the pointer (or the
// keyboard's focus) a small tick. Under it all, one ambient bed per layer,
// crossfaded by the scroll journey: full while the maquette is on screen, low
// while you read the rest of the page, and quiet for the launch and the game,
// which have their own sound. On the chip's layer the chip is also heard at
// work: a bleep every few seconds, never the same twice.

const BEDS: SoundName[] = ['ambient-city', 'ambient-room', 'ambient-chip'];
const CHIP = BEDS.indexOf('ambient-chip');
/** The chip's bleeps: seconds between two (somewhere in this range), and the
 *  pitches one may play at (a pentatonic scale's steps, so any two agree). */
const BLEEP_GAP = [1.2, 4.5];
const BLEEP_STEPS = [-12, -7, -5, 0, 2, 4, 7, 9, 12];

/** Whether a hotspot coming under the pointer should make its sound. `last` is
 *  the hover that last sounded (which hotspot, and when, in ms); `now` is in
 *  the same clock. A sound on every single hover is what makes hover sounds
 *  tiring: sweeping across the maquette, or wobbling on one label's edge. */
function hoverSounds(slug: string, last: { slug: string | null; at: number }, now: number): boolean {
  // back on the one just left is a wobble on its edge unless a second has gone
  // by; across different ones, a sweep is thinned to a tick every 120 ms
  return now - last.at > (slug === last.slug ? 1000 : 120);
}

export function SoundScape() {
  const on = useSyncExternalStore(subscribeSound, soundOn, () => false);

  // the signature: wake, select, complete
  useEffect(() => {
    if (!on) return;
    preload(['wake-1', 'wake-2', 'focus', 'hover', 'ticket-open', 'ticket-close', 'ticket-tear', 'stamp']);
    let prev = sceneStore.snapshot();
    let wokeAt = 0; // a first visit marks the project, then selects it: one sound, not two
    let lastHover: { slug: string | null; at: number } = { slug: null, at: 0 };
    const off = sceneStore.subscribe(() => {
      const s = sceneStore.snapshot();
      // a hotspot under the pointer (not the one that's open: its label is already out)
      if (s.hoveredSlug && s.hoveredSlug !== prev.hoveredSlug && s.hoveredSlug !== s.selectedSlug) {
        const now = performance.now();
        if (hoverSounds(s.hoveredSlug, lastHover, now)) {
          play('hover', { volume: 0.3 });
          lastHover = { slug: s.hoveredSlug, at: now };
        }
      }
      if (s.visited.length > prev.visited.length) {
        const n = Math.min(10, s.visited.length) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
        // (under the reticle's own sound: the wake is the model's, the focus the instrument's)
        play(`wake-${n}`, { volume: 0.5 });
        play('focus', { volume: 0.35 });
        wokeAt = performance.now();
        if (n < 10) preload([`wake-${(n + 1) as 2}`]);
        else preload(['complete']);
      } else if (s.selectedSlug && s.selectedSlug !== prev.selectedSlug && performance.now() - wokeAt > 300) play('focus', { volume: 0.35 });
      // (and back out: the same dial, further off)
      else if (!s.selectedSlug && prev.selectedSlug) play('focus', { volume: 0.2, rate: 0.85 });
      if (s.celebrateAt !== null && prev.celebrateAt === null) play('complete');
      prev = s;
    });
    return () => {
      off();
    };
  }, [on]);

  // the ambient beds
  useEffect(() => {
    if (!on) return;
    const beds: Loop[] = BEDS.map((b) => loop(b));
    const hero = document.getElementById('hero');
    let heroVisible = true;
    const io = hero
      ? new IntersectionObserver(([e]) => {
          heroVisible = e.isIntersecting;
          mix();
        })
      : null;
    if (hero && io) io.observe(hero);
    function mix() {
      const s = sceneStore.snapshot();
      const room = s.launch === 'idle' ? (heroVisible ? 1 : 0.3) : 0;
      beds.forEach((bed, i) => bed.set(i === s.journeyStep ? room : 0, 1.2));
    }
    mix();
    const off = sceneStore.subscribe(mix);
    // the chip at work, while its layer is the one on screen
    preload(['chip-bleep']);
    let bleep = 0;
    const next = () => {
      bleep = window.setTimeout(
        () => {
          const s = sceneStore.snapshot();
          if (heroVisible && s.launch === 'idle' && s.journeyStep === CHIP) {
            const step = BLEEP_STEPS[Math.floor(Math.random() * BLEEP_STEPS.length)];
            play('chip-bleep', { volume: 0.05 + Math.random() * 0.07, rate: 2 ** (step / 12), pan: Math.random() * 1.2 - 0.6 });
          }
          next();
        },
        (BLEEP_GAP[0] + Math.random() * (BLEEP_GAP[1] - BLEEP_GAP[0])) * 1000,
      );
    };
    next();
    return () => {
      off();
      clearTimeout(bleep);
      io?.disconnect();
      beds.forEach((b) => b.stop(0.8));
    };
  }, [on]);

  return null;
}
