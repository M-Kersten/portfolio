// Content model — §7 of the build spec. All copy lives in committed JSON;
// no backend at v1. These types are the contract the JSON must satisfy.

// Three scales, large → small: city (GIS/location), room (games/apps/web),
// chip (tools/CV/data). The maquette layers, capabilities band and case
// categories all key off this.
export type Layer = 'city' | 'room' | 'chip';

export interface CaseStudy {
  slug: string;
  title: string;
  /** Exactly one layer tag per case (§7). */
  layer: Layer;
  client: string;
  clientLogo?: string | null;
  sector: string;
  challenge: string;
  built: string;
  /** Exactly one hard outcome metric per case (§7). */
  outcome: string;
  /** Tech stack, shown as tags in the case dialog. */
  tech?: string[];
  /** One "key lesson" — the systems-thinking throughline of Merijn's work. */
  lesson?: string;
  /** At most one case is `live` at v1 — the twin (§7). */
  live?: boolean;
  media?: string[];
  /** Sample content pending sign-off; rendered with a quiet tag. */
  draft?: boolean;
}

export interface Capability {
  layer: Layer;
  index: string;
  title: string;
  body: string;
  tags: string[];
}

export interface NavItem {
  href: string;
  label: string;
}

export interface SiteContent {
  brand: string;
  nav: NavItem[];
  hero: {
    name: string;
    /** Short, first-person subheading. Kept minimal so it stays out of the
     *  3D's way and can fade when a node is inspected. */
    subheading: string;
  };
  capabilitiesIntro: { eyebrow: string; title: string; lead: string };
  workIntro: { eyebrow: string; title: string; lead: string };
  about: {
    eyebrow: string;
    title: string;
    lead: string;
    body: string[];
    facts: { label: string; value: string }[];
  };
  contact: {
    eyebrow: string;
    title: string;
    lead: string;
    email: string;
    links: NavItem[];
  };
  /** Persistent source caption for the twin scene (§5.6, non-removable). */
  twinSource: {
    dataset: string;
    release: string;
    note: string;
  };
}
