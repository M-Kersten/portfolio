// Typed access to the committed JSON content (§7). Importing through this
// module keeps the `as` casts in one place and gives the rest of the app
// fully-typed content.

import siteJson from './site.json';
import capabilitiesJson from './capabilities.json';
import casesJson from './cases.json';
import cvJson from './cv.json';
import cvNlJson from './cv.nl.json';
import type { SiteContent, Capability, CaseStudy, CvContent, Discipline } from './types';

// JSON string values widen to `string`, so the union-typed fields (layer) need
// an `unknown` hop. The JSON is authored to match these types (see types.ts).
export const site = siteJson as unknown as SiteContent;
export const capabilities = capabilitiesJson as unknown as Capability[];
export const cases = casesJson as unknown as CaseStudy[];
export const cv = cvJson as unknown as CvContent;
export const cvNl = cvNlJson as unknown as CvContent;
/** CV content packs by language code (the /cv route picks via ?lang). */
export const cvByLang: Record<string, CvContent> = { en: cv, nl: cvNl };

export const caseBySlug = (slug: string): CaseStudy | undefined =>
  cases.find((c) => c.slug === slug);

/** A "YYYY" or "YYYY-MM" date as a fractional year (0 when absent). A year on
 *  its own sits in the *middle* of that year rather than on 1 January, so it
 *  reads closer to when it happened against the month-precise career dates. */
function fractionalYear(value?: string | null): number {
  const [y, m] = String(value ?? '').split('-').map(Number);
  if (!y) return 0;
  return m ? y + (m - 1) / 12 : y + 0.5;
}

/** A project's place in time, at month precision: where the timeline pins it,
 *  and the order the case sheet's earlier / later steps walk. */
export const caseTime = (c: CaseStudy): number => fractionalYear(c.year);

/** A copy of the list in time order (a stable sort: same-month projects keep
 *  their authored order). */
export const byDate = (list: CaseStudy[]): CaseStudy[] => [...list].sort((a, b) => caseTime(a) - caseTime(b));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The date as written for people: "Mar 2022", or just "2026". */
export function caseWhen(c: CaseStudy): string {
  const [y, m] = String(c.year ?? '').split('-');
  return y ? (m ? `${MONTHS[Number(m) - 1]} ${y}` : y) : '';
}

/** The job Merijn held on a project, from the career entry it was done at.
 *  The employer is read off the client: its own name first, then the agency
 *  after "(Via …)", so "Philips (Via Rebels)" is Philips and "Municipality of
 *  Amsterdam (Via Rebels)" is Rebels. Where one employer has two stints, the
 *  one running at the time wins. A client that names no employer (student,
 *  passion and freelance work, or a client like Niantic who hired an employer)
 *  gets no role rather than a guess from the date, which would credit a
 *  student project to whatever job was running that year. */
export function roleFor(c: CaseStudy): string | undefined {
  const career = site.career ?? [];
  const t = caseTime(c);
  const via = c.client.match(/\(via ([^)]+)\)/i)?.[1];
  const own = c.client.replace(/\s*\(via [^)]+\)/i, '');
  // how far the project falls outside a stint (0 when inside it)
  const gap = (e: (typeof career)[number]) => {
    const from = fractionalYear(e.from);
    const to = e.to ? fractionalYear(e.to) + 1 / 12 : Infinity;
    return t < from ? from - t : t >= to ? t - to : 0;
  };
  for (const name of [own, via]) {
    if (!name) continue;
    const hits = career.filter((e) =>
      new RegExp(`\\b${e.company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(name),
    );
    if (hits.length) return hits.reduce((a, b) => (gap(b) < gap(a) ? b : a)).role;
  }
  return undefined;
}

export const LAYER_LABEL: Record<CaseStudy['layer'], string> = {
  city: 'City',
  room: 'Room',
  chip: 'Chip',
};

/** Every discipline, in the order the /projects chips show them — broadest
 *  bodies of work first. Must cover the Discipline union in types.ts. */
export const DISCIPLINES: Discipline[] = ['AR', 'VR', 'AI', 'Games', 'Geo', 'Installation', 'Design'];

export * from './types';
