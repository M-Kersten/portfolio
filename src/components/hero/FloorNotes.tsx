import { capabilities, site } from '../../content';
import type { Layer } from '../../content';

// What I do, said where it's shown. Each floor of the model stands for a scale
// I work at, and its text stands beside it for as long as the scroll holds it
// there (the journey's beats 1–3, components/hero/journey.ts): in the hero
// title's place and set like it, so on the way down the name gives way to the
// floor's own (City, Room, Chip), with a line on what it stands for, a short
// paragraph and its tools. They used to be a section of their own further
// down the page, read after the floors had already gone by.
//
// The words are the capabilities content (capabilities.json): a title is
// written "City: maps and the real world", and shown as the name with the rest
// as the line under it.

/** The scale each floor is modelled at, as a model maker would mark it. */
const SCALE: Record<Layer, string> = { city: '1:5000', room: '1:20', chip: '20:1' };

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** `beat`: the journey's beat whose text shows (1 the City's … 3 the Chip's),
 *  or null for none (the entrance, an open exhibit, the page scrolled on). */
export function FloorNotes({ beat }: { beat: number | null }) {
  return (
    <>
      {capabilities.map((c, i) => {
        const cut = c.title.indexOf(': ');
        const name = cut < 0 ? c.title : c.title.slice(0, cut);
        const line = cut < 0 ? '' : upperFirst(c.title.slice(cut + 2));
        return (
          <article key={c.layer} className="floor-note" data-layer={c.layer} data-on={beat === i + 1 || undefined}>
            {/* the section's opening line, as every section has one: its name,
                a rule, and a note at the rule's end (here, the floor's scale) */}
            <p className="floor-note__kicker">
              <span>{site.capabilitiesIntro.title}</span>
              <i aria-hidden="true" />
              <span className="floor-note__scale">{SCALE[c.layer]}</span>
            </p>
            <h2 className="floor-note__title">
              <span className="floor-note__name">{name}</span>
              {line && (
                <>
                  <span className="visually-hidden">: </span>
                  <span className="floor-note__line">{line}</span>
                </>
              )}
            </h2>
            <p className="floor-note__body">{c.body}</p>
            <ul className="floor-note__tags">
              {c.tags.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </article>
        );
      })}
    </>
  );
}
