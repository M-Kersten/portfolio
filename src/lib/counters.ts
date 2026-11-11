// The site's counters: a few public numbers in a free Supabase project (the
// site itself stays static; docs/counters.md has the setup). What they count:
// the flights flown (launches.ts), and the visitor's own two, on their
// admission ticket: its number, and how many saw all ten before them
// (visit.ts).
//
// Fails soft by design: with the env vars unset (or the project unreachable)
// every number stays null and nothing shows it, so the site never depends on
// it. The anon key is public by design: the only writes it can make are the
// +1 functions, which can do nothing else.

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Whether there's a project to count in. */
export const counting = !!SB_URL && !!SB_KEY;

const headers = { apikey: SB_KEY ?? '', authorization: `Bearer ${SB_KEY}` };

/** A counter's value, or null if it can't be had. */
export async function readCounter(name: string): Promise<number | null> {
  if (!counting) return null;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/counters?name=eq.${encodeURIComponent(name)}&select=value`, { headers });
    const rows = (await res.json()) as { value: number }[];
    return typeof rows?.[0]?.value === 'number' ? rows[0].value : null;
  } catch {
    return null;
  }
}

/** One of the +1 functions (record_launch, issue_ticket, record_all_ten):
 *  the counter's new value, or null if it didn't go through. */
export async function bump(fn: string): Promise<number | null> {
  if (!counting) return null;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: '{}',
    });
    const v = (await res.json()) as unknown;
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

/** A browser driven by software (a test, a renderer, a crawler that says so):
 *  the numbers that stand for visitors don't count it. */
export const automated = () => typeof navigator !== 'undefined' && navigator.webdriver === true;
