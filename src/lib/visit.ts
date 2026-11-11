// The visitor's own two numbers, both on their admission ticket
// (ExhibitionGuide), both from the site's counters (counters.ts):
//
// · the ticket's number: which visitor they are. Issued once per browser and
//   remembered, on their first sign of being a person (a pointer, a key, a
//   wheel, a touch), so a crawler that only loads the page isn't handed one;
// · once they've seen all ten, how many had before them (they're the 23rd).
//   Counted once and remembered: starting the tour over doesn't count again.
//
// Nothing shows either until it's known; unconfigured or unreachable, the
// ticket reads as it always has.
import { useEffect, useSyncExternalStore } from 'react';
import { remember, remembered } from './page';
import { automated, bump, counting } from './counters';

const TICKET_KEY = 'mk-ticket';
const ALL_TEN_KEY = 'mk-all-ten';

/** A number remembered in this browser, if there is one. */
function stored(key: string): number | null {
  const n = Number(remembered(key));
  return Number.isInteger(n) && n > 0 ? n : null;
}

let ticket = stored(TICKET_KEY);
let allTen = stored(ALL_TEN_KEY);
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};
function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

let issuing = false;
function issueTicket() {
  if (ticket != null || issuing || !counting || automated()) return;
  issuing = true;
  void bump('issue_ticket').then((n) => {
    issuing = false;
    if (n == null) return; // not this time: the next visit asks again
    ticket = n;
    remember(TICKET_KEY, String(n));
    emit();
  });
}

/** What says there's a person here. */
const SIGNS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/** This visitor's ticket number, or null until it's issued (or if it can't be). */
export function useTicketNo(): number | null {
  useEffect(() => {
    if (ticket != null || !counting) return;
    const off = () => SIGNS.forEach((e) => window.removeEventListener(e, go, true));
    const go = () => {
      off();
      issueTicket();
    };
    SIGNS.forEach((e) => window.addEventListener(e, go, { capture: true, passive: true }));
    return off;
  }, []);
  return useSyncExternalStore(subscribe, () => ticket, () => null);
}

let recording = false;
/** Which visitor to see all ten this one was, once they have (`complete`), or
 *  null until it's known. */
export function useAllTenNo(complete: boolean): number | null {
  useEffect(() => {
    if (!complete || allTen != null || recording || !counting || automated()) return;
    recording = true;
    void bump('record_all_ten').then((n) => {
      recording = false;
      if (n == null) return;
      allTen = n;
      remember(ALL_TEN_KEY, String(n));
      emit();
    });
  }, [complete]);
  return useSyncExternalStore(subscribe, () => allTen, () => null);
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 1,204th */
export function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n.toLocaleString('en-GB')}${suffix}`;
}
