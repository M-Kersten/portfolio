// The exhibition: the ten projects that stand in the maquette are its
// exhibits, on display in its galleries and numbered 01–10 in the order a
// visitor meets them (city, then room, then chip, each layer in the model's own
// order). Every other project is in the depot: still in the collection, on the
// timeline and /projects, with a label of its own but no number. Exhibit 11 is
// the next launch (the rocket on the pad).
//
// Also here, because the label and the book both need them: the walk from one
// project to the next, a project's credit line and inventory number, the
// story's paragraphs and first sentence, and a project's "see also" (what it
// builds on, and what it led to).
import { HOTSPOTS } from '../scene/framing';
import { LAYER_LABEL, byDate, caseTime, cases, caseBySlug, type CaseStudy, type Layer } from './index';

const LAYER_ORDER = ['city', 'room', 'chip'] as const;

/** The exhibition's name: on the title wall at the entrance, the guide's cover
 *  and the book's running head. */
export const EXHIBITION = 'Work in miniature';

/** The galleries: one to a floor of the model, numbered in the order a visitor
 *  meets them (top down), each marked with the scale its work happens at, the
 *  way a model maker would mark it: the city small, the chip blown up. */
export const GALLERIES: Record<Layer, { no: number; name: string; scale: string }> = {
  city: { no: 1, name: LAYER_LABEL.city, scale: '1:5000' },
  room: { no: 2, name: LAYER_LABEL.room, scale: '1:20' },
  chip: { no: 3, name: LAYER_LABEL.chip, scale: '20:1' },
};
export const GALLERY_COUNT = LAYER_ORDER.length;

/** "Gallery 1" */
export const galleryName = (layer: Layer) => `Gallery ${GALLERIES[layer].no}`;

/** A small count as a word, the way a sign spells it ("ten exhibits"). */
export function countWord(n: number): string {
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const teens = ['eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  return words[n] ?? teens[n - 11] ?? String(n);
}

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
/** Where a project is, as the mark on its card says it: "On display ·
 *  Gallery 1" (in the model, on that floor), or "In the depot". */
export function exhibitMark(slug: string): string {
  const spot = HOTSPOTS.find((h) => h.slug === slug);
  return spot ? `On display · ${galleryName(spot.layer)}` : 'In the depot';
}

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

/* ---------- the tombstone ---------- */

/** Who it was made for or with, as a museum's credit line prints it
 *  ("Commissioned by Niantic, made at Wonderment"): the project's own, or its
 *  client's name for one that has none written yet. */
export const creditLine = (study: CaseStudy): string => study.credit?.trim() || study.client;

/** Each project's inventory number, the way a collection numbers what comes
 *  in: MK, the year it was made, and its place in that year's intake (by
 *  date, then title), so "MK.2022.1" is the first of 2022. Worked out rather
 *  than written down: a project added earlier in a year moves the ones after
 *  it on by one. */
const INVENTORY: Map<string, string> = (() => {
  const years = new Map<string, CaseStudy[]>();
  for (const c of cases) {
    const y = c.year?.slice(0, 4);
    if (y) years.set(y, [...(years.get(y) ?? []), c]);
  }
  const numbers = new Map<string, string>();
  for (const [y, intake] of years) {
    intake.sort((a, b) => caseTime(a) - caseTime(b) || a.title.localeCompare(b.title));
    intake.forEach((c, i) => numbers.set(c.slug, `MK.${y}.${i + 1}`));
  }
  return numbers;
})();
/** "MK.2022.1", or undefined for a project without a year. */
export const inventoryNo = (slug: string): string | undefined => INVENTORY.get(slug);

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

/** See also: what a project builds on, and what it led to. */
export function seeAlso(study: CaseStudy): { buildsOn?: CaseStudy; ledTo: CaseStudy[] } {
  return { buildsOn: study.follows ? caseBySlug(study.follows) : undefined, ledTo: cases.filter((c) => c.follows === study.slug) };
}
