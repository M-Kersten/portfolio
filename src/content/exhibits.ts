// The exhibition: the ten projects that stand in the maquette are its
// exhibits, on display in the model and numbered 01–10 in the order a
// visitor meets them (city, then room, then chip, each layer in the model's own
// order). Every other project is in the depot: still in the collection, on the
// timeline and /projects, with a label of its own but no number. Exhibit 11 is
// the next launch (the rocket on the pad).
//
// Also here, because the label and the book both need them: the walk from one
// project to the next, a project's credit line, the story's paragraphs and
// first sentence, and a project's "see also" (what it builds on, and what it
// led to).
import { HOTSPOTS } from '../scene/framing';
import { byDate, cases, caseBySlug, type CaseStudy } from './index';

const LAYER_ORDER = ['city', 'room', 'chip'] as const;

/** The exhibition's name: over yours at the entrance, on the guide's cover
 *  and in the book's running head. */
export const EXHIBITION = 'Work in miniature';

/** The exhibits, in order: index 0 is exhibit 01. */
export const EXHIBITS: string[] = LAYER_ORDER.flatMap((layer) => HOTSPOTS.filter((h) => h.layer === layer).map((h) => h.slug));
export const EXHIBIT_COUNT = EXHIBITS.length;
/** The rocket on the pad: the one after the last. */
export const NEXT_LAUNCH_NO = EXHIBIT_COUNT + 1;

/** How many of the collection are in the depot (not in the model). */
export const DEPOT_COUNT = cases.length - EXHIBIT_COUNT;

/** A project's exhibit number (1-based), or null for one in the depot. */
export function exhibitNo(slug: string): number | null {
  const i = EXHIBITS.indexOf(slug);
  return i < 0 ? null : i + 1;
}
/** "02". */
export const pad2 = (n: number) => String(n).padStart(2, '0');
/** Where a project is, as the mark on its card says it: "On display" (in the
 *  model), or "In the depot". */
export const exhibitMark = (slug: string): string => (exhibitNo(slug) !== null ? 'On display' : 'In the depot');

/** The projects either side of this one on a walk: in the maquette, through
 *  the exhibits by number; on a page (the timeline, /projects, search), through
 *  the projects there from oldest to newest, so ← is older and → is newer. */
export function walkFrom(study: CaseStudy, place: 'maquette' | 'page', collection?: CaseStudy[]): { prev?: CaseStudy; next?: CaseStudy } {
  const no = exhibitNo(study.slug);
  if (place === 'maquette' && no !== null) {
    return { prev: no > 1 ? caseBySlug(EXHIBITS[no - 2]) : undefined, next: no < EXHIBIT_COUNT ? caseBySlug(EXHIBITS[no]) : undefined };
  }
  const list = collection?.some((c) => c.slug === study.slug) ? collection : byDate(cases);
  const i = list.findIndex((c) => c.slug === study.slug);
  return { prev: list[i - 1], next: list[i + 1] };
}

/* ---------- the label ---------- */

/** Who it was for, or where it was made ("For Niantic, at Wonderment"): the
 *  project's own credit line, or its client's name where it has none. */
export const creditLine = (study: CaseStudy): string => study.credit?.trim() || study.client;

/* ---------- the book ---------- */

/** A story beat's paragraphs (a blank line between them in the content). */
export const paragraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/* ---------- the story ---------- */

/** A beat's first sentence (its headline) and the rest. It stops at a line
 *  break too, and keeps a closing quote. */
export function splitHook(text: string): [string, string] {
  const m = text.match(/^([^\n]+?[.!?…]['’”)]?)\s+([\s\S]*)$/);
  if (m) return [m[1], m[2]];
  const br = text.indexOf('\n');
  return br > 0 ? [text.slice(0, br).trim(), text.slice(br).trim()] : [text, ''];
}

/** A project's result, as its story's headline sets it: the opening words,
 *  which carry the floor's colour, and the rest (the two put together are the
 *  sentence again). It turns where the sentence does: at a comma, a dash or a
 *  bracket ("16 cities worldwide | , and it all fits in a suitcase"); failing
 *  that, before the word it leans on ("Site visits | you can do from your
 *  chair", "The solar system | in your living room"); failing that, at the
 *  word nearest its first third. */
export function statementParts(outcome: string): [string, string] {
  const text = outcome.trim();
  const turn = text.match(/^(.{6,48}?)(,| \(| [—–-] |: )/);
  if (turn && turn[1].length < text.length * 0.8) return [turn[1], text.slice(turn[1].length)];
  // (two words in at least, and not past the middle)
  const lean = /\s(?:that|you|in|on|of|from|with|to|for|at|by|\w+ing)\b/g;
  for (let m = lean.exec(text); m; m = lean.exec(text)) {
    const lead = text.slice(0, m.index);
    if (lead.split(/\s+/).length >= 2 && m.index <= text.length * 0.6) return [lead, text.slice(m.index)];
  }
  const third = text.length * 0.36;
  let cut = -1;
  for (let i = text.indexOf(' '); i > 0; i = text.indexOf(' ', i + 1)) if (cut < 0 || Math.abs(i - third) < Math.abs(cut - third)) cut = i;
  return cut > 0 ? [text.slice(0, cut), text.slice(cut)] : [text, ''];
}

/** See also: what a project builds on, and what it led to. */
export function seeAlso(study: CaseStudy): { buildsOn?: CaseStudy; ledTo: CaseStudy[] } {
  return { buildsOn: study.follows ? caseBySlug(study.follows) : undefined, ledTo: cases.filter((c) => c.follows === study.slug) };
}
