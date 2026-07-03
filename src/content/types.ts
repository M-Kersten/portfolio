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
  /** For touring installations — the cities/venues it has travelled to. */
  places?: string[];
  /** For field-deployed work — "what breaks in the real world", label + note. */
  fieldNotes?: { label: string; body: string }[];
  /** Year the project was worked on — shown as a stamped date on the wall tile. */
  year?: string;
  /** Marks a case as currently live in production. */
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

/** An employer / studio shown in the About "where I've worked" strip; clicking
 *  the name opens a popup with the role, timeframe and a short blurb. */
export interface Company {
  name: string;
  /** Role held there, e.g. "XR developer". */
  role: string;
  /** Timeframe, e.g. "2019 — 2021" or "2024". */
  period: string;
  /** Where the role was based, e.g. "Amsterdam, NL" or "Remote". */
  location?: string;
  /** A sentence or two on the experience. */
  blurb: string;
  /** Optional external link (opens in a new tab). */
  url?: string;
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
  workIntro: { eyebrow: string; title?: string; lead: string };
  about: {
    eyebrow: string;
    title: string;
    lead: string;
    body: string[];
    facts: { label: string; value: string }[];
    /** Short strip of past employers/studios, each opening an experience popup. */
    companies?: Company[];
  };
  contact: {
    eyebrow: string;
    title: string;
    lead: string;
    email: string;
    links: NavItem[];
  };
}
