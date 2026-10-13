// The exhibition: the ten projects that stand in the maquette are its
// exhibits, numbered 01–10 in the order a visitor meets them (city, then room,
// then chip, each layer in the model's own order). Every other project is in
// the collection: on the timeline and /projects, with a label of its own but
// no number. Exhibit 11 is the next launch (the rocket on the pad).
//
// Also here, because the label and the book both need them: each project's
// silent film loop (src/assets/loops/<slug>.mp4, see the README there), the
// first sentence of a story beat, and a project's "see also" (what it builds
// on, and what it led to).
import { HOTSPOTS } from '../scene/framing';
import { cases, caseBySlug, type CaseStudy } from './index';

const LAYER_ORDER = ['city', 'room', 'chip'] as const;

/** The exhibits, in order: index 0 is exhibit 01. */
export const EXHIBITS: string[] = LAYER_ORDER.flatMap((layer) => HOTSPOTS.filter((h) => h.layer === layer).map((h) => h.slug));
export const EXHIBIT_COUNT = EXHIBITS.length;
/** The rocket on the pad: the one after the last. */
export const NEXT_LAUNCH_NO = EXHIBIT_COUNT + 1;

/** A project's exhibit number (1-based), or null for one in the collection. */
export function exhibitNo(slug: string): number | null {
  const i = EXHIBITS.indexOf(slug);
  return i < 0 ? null : i + 1;
}
/** "02". */
export const pad2 = (n: number) => String(n).padStart(2, '0');
/** The mark on a project's card: "Exhibit 02", or "Collection". */
export function exhibitMark(slug: string): string {
  const no = exhibitNo(slug);
  return no !== null ? `Exhibit ${pad2(no)}` : 'Collection';
}

/** The projects either side of this one on a walk through the exhibition: by
 *  exhibit number for an exhibit, by date through the collection otherwise. */
export function walkFrom(study: CaseStudy, collection: CaseStudy[]): { prev?: CaseStudy; next?: CaseStudy } {
  const no = exhibitNo(study.slug);
  if (no !== null) {
    return { prev: no > 1 ? caseBySlug(EXHIBITS[no - 2]) : undefined, next: no < EXHIBIT_COUNT ? caseBySlug(EXHIBITS[no]) : undefined };
  }
  const list = collection.some((c) => c.slug === study.slug) ? collection : cases;
  const i = list.findIndex((c) => c.slug === study.slug);
  return { prev: list[i - 1], next: list[i + 1] };
}

/* ---------- film loops ---------- */

const loops = import.meta.glob('../assets/loops/*.{mp4,webm}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const LOOPS: Record<string, string> = Object.fromEntries(Object.entries(loops).map(([p, url]) => [p.split('/').pop()!.replace(/\.[^.]+$/, ''), url]));
/** The URL of a project's silent film loop, if it has one. */
export const loopFor = (slug: string): string | undefined => LOOPS[slug];

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
