// The global launch odometer — how many times visitors have flown the rocket,
// across everyone, ever. Backed by a free-tier Supabase counter (the site
// itself stays static; see docs/launch-counter.md for the 5-minute setup).
//
// Fails soft by design: with the env vars unset (or the service unreachable)
// `useLaunchCount()` stays null and the labels simply don't render the tally —
// the site never depends on it. The anon key is public by design; the only
// write path is the `record_launch` RPC, which can do nothing but +1.
import { useSyncExternalStore } from 'react';

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const live = !!SB_URL && !!SB_KEY;

let count: number | null = null;
let fetched = false;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

const headers = { apikey: SB_KEY ?? '', authorization: `Bearer ${SB_KEY}` };

async function fetchCount() {
  if (!live || fetched) return;
  fetched = true; // one GET per page load, on first interest
  try {
    const res = await fetch(`${SB_URL}/rest/v1/counters?name=eq.launches&select=value`, { headers });
    const rows = (await res.json()) as { value: number }[];
    if (typeof rows?.[0]?.value === 'number') {
      count = rows[0].value;
      emit();
    }
  } catch {
    /* stays null — the tally just doesn't show */
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

/** Fire-and-forget +1 at ignition. Bumps the local tally optimistically, then
 *  reconciles with the value the server returns. */
export function recordLaunch() {
  if (!live) return;
  if (count != null) {
    count += 1;
    emit();
  }
  fetch(`${SB_URL}/rest/v1/rpc/record_launch`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: '{}',
  })
    .then(async (res) => {
      const v = (await res.json()) as unknown;
      if (typeof v === 'number') {
        count = v;
        emit();
      }
    })
    .catch(() => {});
}
