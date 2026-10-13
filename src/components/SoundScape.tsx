import { useEffect, useSyncExternalStore } from 'react';
import { sceneStore } from '../scene/store';
import { loop, play, preload, soundOn, subscribeSound, type Loop, type SoundName } from '../lib/sound';

// The maquette's sound (lib/sound.ts plays the files): each project waking
// plays the next note of the signature, the n-th visit `wake-n`, so the tour
// builds a melody, and the chord sounds when all ten are awake and the pad
// powers on; opening one you've seen before is a tick. Under it all, one
// ambient bed per layer, crossfaded by the scroll journey: full while the
// maquette is on screen, low while you read the rest of the page, and quiet
// for the launch and the game, which have their own sound.

const BEDS: SoundName[] = ['ambient-city', 'ambient-room', 'ambient-chip'];

export function SoundScape() {
  const on = useSyncExternalStore(subscribeSound, soundOn, () => false);

  // the signature: wake, select, complete
  useEffect(() => {
    if (!on) return;
    preload(['wake-1', 'wake-2', 'select', 'popup-open', 'popup-close']);
    let prev = sceneStore.snapshot();
    let wokeAt = 0; // a first visit marks the project, then selects it: one sound, not two
    const off = sceneStore.subscribe(() => {
      const s = sceneStore.snapshot();
      if (s.visited.length > prev.visited.length) {
        const n = Math.min(10, s.visited.length) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
        play(`wake-${n}`);
        wokeAt = performance.now();
        if (n < 10) preload([`wake-${(n + 1) as 2}`]);
        else preload(['complete']);
      } else if (s.selectedSlug && s.selectedSlug !== prev.selectedSlug && performance.now() - wokeAt > 300) play('select', { volume: 0.7 });
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
    return () => {
      off();
      io?.disconnect();
      beds.forEach((b) => b.stop(0.8));
    };
  }, [on]);

  return null;
}
