// The global launch odometer: how many times visitors have flown the rocket,
// across everyone, ever. One of the site's counters (counters.ts; the setup is
// docs/counters.md). Unconfigured or unreachable, `useLaunchCount()` stays
// null and the labels simply don't show the tally.
import { useSyncExternalStore } from 'react';
import { bump, counting, readCounter } from './counters';

let count: number | null = null;
let fetched = false;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

async function fetchCount() {
  if (!counting || fetched) return;
  fetched = true; // one GET per page load, on first interest
  const v = await readCounter('launches');
  if (v != null) {
    count = v;
    emit();
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  void fetchCount();
  return () => void listeners.delete(l);
}

/** The all-visitors launch tally, or null while unknown/unconfigured. */
export function useLaunchCount(): number | null {
  return useSyncExternalStore(subscribe, () => count, () => null);
}

/** Fire-and-forget +1 at liftoff. Bumps the local tally optimistically, then
 *  reconciles with the value the server returns. */
export function recordLaunch() {
  if (!counting) return;
  if (count != null) {
    count += 1;
    emit();
  }
  void bump('record_launch').then((v) => {
    if (v != null) {
      count = v;
      emit();
    }
  });
}
