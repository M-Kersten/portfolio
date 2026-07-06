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
  /** Year the project was worked on — shown as a stamped date on the wall tile. */
  year?: string;
  /** Map tag override — a short company/label for the waypoint. Defaults to
   *  `client`. Ignored when `kind` is set (then the kind label is shown). */
  tag?: string;
  /** Flags independent work so the waypoint tag reads "Freelance" / "Passion"
   *  in its own colour instead of a client company. */
  kind?: 'freelance' | 'passion';
  /** Marks a case as currently live in production. */
  live?: boolean;
  media?: string[];
  /** A YouTube URL — embedded in the node HUD and the map card popup. */
  video?: string;
  /** URL to a fuller write-up (e.g. a blog post) — linked from the popups. */
  article?: string;
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

/** One stint on the career timeline — colours + labels a stretch of the map's
 *  route, so a visitor can see who Merijn was working for on each project. */
export interface CareerEntry {
  /** Short label drawn on the route, e.g. "Wonderment". */
  company: string;
  /** Start month, "YYYY-MM". */
  from: string;
  /** End month, "YYYY-MM", or null for the current role. */
  to: string | null;
  /** Band colour — kept distinct from the City/Room/Chip card palette. */
  color: string;
  /** Concurrent freelance / side work: drawn as an overlay below the main
   *  spine rather than taking over the route (e.g. Alliander during Philips). */
  freelance?: boolean;
  /** Job title held there — shown in the route tooltip. */
  role?: string;
  /** Where it was based — shown in the route tooltip. */
  location?: string;
  /** A sentence about the experience — shown in the route tooltip. */
  blurb?: string;
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
  /** Employment history — colours the projects-map route so a visitor can see
   *  which company Merijn was at for each project. Chronological, may overlap. */
  career?: CareerEntry[];
  /** Birth date ("YYYY-MM-DD") — drawn as a playful "spawn" point at the very
   *  start of the projects-map timeline. */
  spawn?: string;
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
