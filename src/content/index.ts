// Typed access to the committed JSON content (§7). Importing through this
// module keeps the `as` casts in one place and gives the rest of the app
// fully-typed content.

import siteJson from './site.json';
import capabilitiesJson from './capabilities.json';
import casesJson from './cases.json';
import type { SiteContent, Capability, CaseStudy } from './types';

// JSON string values widen to `string`, so the union-typed fields (layer) need
// an `unknown` hop. The JSON is authored to match these types (see types.ts).
export const site = siteJson as unknown as SiteContent;
export const capabilities = capabilitiesJson as unknown as Capability[];
export const cases = casesJson as unknown as CaseStudy[];

export const caseBySlug = (slug: string): CaseStudy | undefined =>
  cases.find((c) => c.slug === slug);

export const LAYER_LABEL: Record<CaseStudy['layer'], string> = {
  city: 'City',
  room: 'Room',
  chip: 'Chip',
};

/** Largest → smallest scale; the order the maquette stacks (top→bottom) and the
 *  work grid groups. */
export const LAYER_ORDER: CaseStudy['layer'][] = ['city', 'room', 'chip'];

export const LAYER_TAGLINE: Record<CaseStudy['layer'], string> = {
  city: 'maps & the real world',
  room: 'games, apps & toys',
  chip: 'tools & the nerdy bits',
};

export * from './types';
