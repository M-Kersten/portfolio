import { useEffect, useSyncExternalStore } from 'react';
import { hotspotView, type Hotspot, type HotspotView } from '../scene/framing';

// The numbers the site is tuned by, and the live versions the dev tools scrub.
//
// A tunable is a plain set of values (the look of the 3D stage, the spacing of
// the timeline…) declared where it's used. Production reads its `defaults` and
// nothing else. In `npm run dev` the same values sit in a tiny store that the
// dev tools panel (DevTools.tsx) can change while you watch, then copy back out
// as source to paste over the defaults. `import.meta.env.DEV` is a constant,
// so a production build drops the store reads entirely.

export interface Tunable<T extends object> {
  /** The values as written in the source: what production always uses. */
  readonly defaults: T;
  get(): T;
  set(patch: Partial<T>): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

export function tunable<T extends object>(defaults: T): Tunable<T> {
  let current = defaults;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    defaults,
    get: () => current,
    set(patch) {
      current = { ...current, ...patch };
      emit();
    },
    reset() {
      current = defaults;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** A tunable's values: live in dev (a component re-renders as they're scrubbed,
 *  and a useFrame closure always sees the latest), the defaults in production. */
export function useTuned<T extends object>(t: Tunable<T>): T {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useSyncExternalStore(t.subscribe, t.get);
  }
  return t.defaults;
}

/* ---------- placing objects in the maquette ---------- */

type V3 = [number, number, number];

export interface Placement {
  position: V3;
  rotationY: number;
}
export interface PlacementEntry extends Placement {
  /** whether the object also takes a turn about Y */
  hasRot: boolean;
  /** how far either side of the seed the sliders reach, in world units */
  range: number;
}

/** Every object that asked to be placeable, by name ("Room.Desk"). */
export const PLACEMENTS = tunable<Record<string, PlacementEntry>>({});

/** An object's position (and turn), placeable by eye from the dev tools.
 *  Production returns the seed as written. In dev, drag it about in the panel
 *  and copy the JSX props it prints back into the source. Objects anchored to a
 *  hotspot also need their `anchor` in framing.ts moved to match, or the
 *  marker's line points at the old spot. */
export function usePlacement(name: string, seed: { position: V3; rotationY?: number; range?: number }): Placement {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      if (PLACEMENTS.get()[name]) return;
      PLACEMENTS.set({
        [name]: { position: seed.position, rotationY: seed.rotationY ?? 0, hasRot: seed.rotationY !== undefined, range: seed.range ?? 3 },
      });
      // the seed is read once: a full reload picks up an edit to it
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name]);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const live = useSyncExternalStore(PLACEMENTS.subscribe, () => PLACEMENTS.get()[name]);
    if (live) return live;
  }
  return { position: seed.position, rotationY: seed.rotationY ?? 0 };
}

/* ---------- the camera's close-up on each exhibit ---------- */

/** Close-ups being tuned in the dev tools, by hotspot slug. */
export const VIEWS = tunable<Record<string, Required<HotspotView>>>({});

/** A hotspot's close-up: as written in framing.ts, or as it's being tuned. */
export function viewFor(h: Hotspot): Required<HotspotView> {
  return (import.meta.env.DEV && VIEWS.get()[h.slug]) || hotspotView(h);
}
