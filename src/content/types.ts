// Content model — §7 of the build spec. All copy lives in committed JSON;
// no backend at v1. These types are the contract the JSON must satisfy.

// Three scales, large → small: city (GIS/location), room (games/apps/web),
// chip (tools/CV/data). The maquette layers, capabilities band and case
// categories all key off this.
export type Layer = 'city' | 'room' | 'chip';

// The kind of work a case represents — the facet the /projects index filters
// on. Tech tags are the wrong grain to navigate by (most are used once, and
// Unity covers nearly everything); this is the coarse question a visitor
// actually arrives with. A case may span more than one. Keep DISCIPLINES in
// index.ts in step with this union — it drives the chip order.
export type Discipline = 'AR' | 'VR' | 'AI' | 'Games' | 'Geo' | 'Installation' | 'Design';

/** One frame of a case's gallery.
 *
 *  `file` is a filename, not a path: the images live in
 *  `public/gallery/<slug>/`, the same slug-derived convention the posters use,
 *  so the JSON stays readable and there is exactly one place a picture can be.
 *  They are listed rather than discovered because a static build has no
 *  directory listing at runtime — and listing them is what gives you an order
 *  and a place to write the captions. */
export interface GalleryImage {
  /** Filename inside `public/gallery/<slug>/`, e.g. "03-install.jpg". */
  file: string;
  /** Shown under the image in the lightbox, and used as its alt text. An
   *  uncaptioned frame is treated as decorative and gets `alt=""` — which is
   *  correct: a screen reader reading out "image, image, image" twelve times
   *  is worse than silence. */
  caption?: string;
}

/** One outbound link on a case, with the words that go on its button.
 *
 *  This replaced a single `article?: string` that rendered a hardcoded "Read
 *  more". One field could only ever hold one destination, and several projects
 *  have a handful — a write-up, a talk, a press piece, a demo film. Worse, the
 *  fixed label was already lying: two of the thirteen `article` values were
 *  YouTube URLs sitting behind a button that said "Read more".
 *
 *  So the label is authored per link rather than derived from the URL. A guess
 *  from the domain gets "medium.com" right and "some-agency.nl/a-thing" wrong,
 *  and the person writing the case always knows what the thing on the end of
 *  the link actually is. */
export interface CaseLink {
  /** Absolute http(s) URL. Opens in a new tab. */
  url: string;
  /** The button's words, e.g. "Read the write-up", "Watch the talk". */
  label: string;
}

export interface CaseStudy {
  slug: string;
  title: string;
  /** Exactly one layer tag per case (§7). */
  layer: Layer;
  client: string;
  sector: string;
  /** At least one discipline — the /projects index filters on these. */
  discipline: Discipline[];
  /** The story, told in three beats — these carry the case dialogs. */
  problem: string;
  approach: string;
  /** One "key lesson" — the third beat; optional but almost always worth it. */
  lesson?: string;
  /** Exactly one hard outcome metric per case (§7) — the big summary line. */
  outcome: string;
  /** Tech stack, shown as tags in the case dialog. */
  tech?: string[];
  /** Slug of the earlier case this one builds on. Renders as a "← builds on"
   *  link in the dialogs, and the reverse ("led to →") is derived, so one
   *  field threads the cases into walkable storylines. */
  follows?: string;
  /** Year the project was worked on — shown as a stamped date on the wall tile. */
  year?: string;
  /** Map tag override — a short company/label for the waypoint. Defaults to
   *  `client`. Ignored when `kind` is set (then the kind label is shown). */
  tag?: string;
  /** Flags independent work so the waypoint tag reads "Freelance" / "Passion"
   *  in its own colour instead of a client company. */
  kind?: 'freelance' | 'passion';
  /** A YouTube URL — embedded in the node HUD and the map card popup. */
  video?: string;
  /** Outbound links — write-ups, talks, press, demo films. Rendered as buttons
   *  in the case dialogs, in the order given, each with its own label. */
  links?: CaseLink[];
  /** A long-tail project: it appears in the /projects wordcloud (the full index)
   *  but is kept off the curated hero + timeline. Highlights leave this unset. */
  archive?: boolean;
  /** Extra frames, for a project whose argument is the pictures rather than the
   *  write-up. They show as a grid inside the case popup and open full-size in
   *  a lightbox; the poster stays the card image either way, so a case can have
   *  a gallery and still read normally everywhere else. */
  gallery?: GalleryImage[];
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
  /** The industry, e.g. "Health care" — shown on the CV's meta line. */
  sector?: string;
  /** Tech used there — shown on the CV's meta line. */
  tech?: string[];
  /** The full CV paragraph for this stint. The CV falls back to `blurb`
   *  when absent; the site's tooltips always use the short `blurb`. */
  detail?: string;
  /** Company website — the route band links here (opens in a new tab). */
  url?: string;
  /** Optional explicit logo (public/ path). When omitted, the tooltip falls
   *  back to the company's favicon derived from `url`. */
  logo?: string;
}

/** UI strings for one CV language (labels + toolbar). */
export interface CvUi {
  profile: string;
  yearsUnit: string;
  experience: string;
  education: string;
  certificates: string;
  stack: string;
  languages: string;
  offTheClockLabel: string;
  now: string;
  back: string;
  download: string;
}

/** The CV-only extras (src/content/cv.json = English, cv.nl.json = Dutch).
 *  The work-history STRUCTURE comes from site.json's career; a non-English
 *  pack overrides each entry's sector/detail via `career` (same order as
 *  site.json). `npm run cv` snapshots the /cv page to public/cv.pdf and its
 *  Dutch twin public/cv-nl.pdf. */
export interface CvContent {
  /** Labels + toolbar strings for this language. */
  ui: CvUi;
  /** One-line role statement under the name. */
  tagline: string;
  /** The "about" paragraph at the top of the CV. */
  profile: string;
  /** Head shot (public/ path), shown beside the header. */
  photo?: string;
  /** Home base — shown prominently in the header. */
  location: string;
  /** Phone number (display form; the tel: link strips the spaces). */
  phone?: string;
  /** Web / social links — the quieter row under the location line. */
  links: { label: string; href?: string }[];
  /** Tools & skills list for the extras strip. */
  stack: string[];
  education: {
    school: string;
    degree: string;
    location?: string;
    /** "YYYY-MM" bounds, both required to show a period. */
    from?: string;
    to?: string;
    /** A short paragraph about it. */
    note?: string;
  }[];
  certificates?: string[];
  languages: string[];
  /** One relaxed line of interests. */
  offTheClock: string;
  /** Per-career-entry text overrides, in the same order as site.json's
   *  career. Present on non-English packs; English reads sector/detail from
   *  site.json directly. */
  career?: { sector?: string; detail: string }[];
}

export interface SiteContent {
  brand: string;
  nav: NavItem[];
  hero: {
    name: string;
    /** Short, first-person subheading. Kept minimal so it stays out of the
     *  3D's way and can fade when a node is inspected. */
    subheading: string;
    /** The movie-intro title card, shown once on first load as the camera
     *  dollies into the maquette — written for someone who's never met Merijn.
     *  Remove this field to skip the intro card entirely. */
    intro?: { title: string; body: string };
  };
  capabilitiesIntro: { title: string; lead: string };
  workIntro: { title?: string; lead: string };
  /** Employment history — colours the projects-map route so a visitor can see
   *  which company Merijn was at for each project. Chronological, may overlap. */
  career?: CareerEntry[];
  /** Birth date ("YYYY-MM-DD") — drawn as a playful "spawn" point at the very
   *  start of the projects-map timeline. */
  spawn?: string;
  about: {
    title: string;
    lead: string;
    body: string[];
    facts: { label: string; value: string }[];
  };
  contact: {
    title: string;
    lead: string;
    email: string;
    links: NavItem[];
  };
}
