import { useMemo, useState, type CSSProperties } from 'react';
import { DISCIPLINES, LAYER_LABEL, type CaseStudy, type Discipline, type Layer } from '../content';
import { asset } from '../lib/asset';

// The /projects index — every project (highlights + the long tail) as a
// scannable card grid. This is the one page a visitor arrives at with a
// specific question ("what's recent?", "has he shipped AR?"), so the metadata
// the maquette deliberately can't show — year, client, sector, layer — sits on
// the face of every card, and the discipline chips narrow the set rather than
// decorate it. Clicking a card opens the same case card the timeline uses.
//
// Discipline is the facet rather than tech because tech is the wrong grain to
// navigate by: most tags are used once, and Unity covers nearly every case.
// Tech is still fully searchable — the Find overlay indexes it.
//
// Everything here speaks the home page's language: chips are tags framed by
// the scanner brackets that lock on when one is picked, the sort is a row of
// mono links with the nav's drawn rule under the current one, and the cards are
// the timeline's waypoint cards — frosted, tinted by their layer, brackets
// tightening round them under the pointer.

const LAYER_COLOR: Record<Layer, string> = { city: 'var(--cyan)', room: 'var(--coral)', chip: 'var(--lime)' };

type Sort = 'new' | 'old' | 'curated';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'new', label: 'Newest' },
  { value: 'old', label: 'Oldest' },
  { value: 'curated', label: 'Hand-picked' },
];

/** Toggle one value of a Set held in state, without mutating the old set. */
function toggled<T>(set: ReadonlySet<T>, v: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(v)) next.add(v);
  return next;
}

export function ProjectsIndex({ items, onOpen }: { items: CaseStudy[]; onOpen: (slug: string) => void }) {
  const [picked, setPicked] = useState<ReadonlySet<Discipline>>(new Set());
  const [sort, setSort] = useState<Sort>('new');

  // Chips follow the canonical order, but only for disciplines actually in use
  // — so an empty category never offers a filter that leads nowhere. Derived
  // from the whole index, not the filtered view, so chips never disappear out
  // from under the pointer as you narrow; each carries its own count.
  const options = useMemo(() => {
    const count = new Map<Discipline, number>();
    for (const c of items) for (const d of c.discipline) count.set(d, (count.get(d) ?? 0) + 1);
    return DISCIPLINES.filter((d) => count.has(d)).map((d) => ({ d, n: count.get(d) ?? 0 }));
  }, [items]);

  const shown = useMemo(() => {
    // Selected disciplines are OR'd — "AR or Games", not "AR and Games" — so
    // picking a second chip always widens the set rather than emptying it.
    const hits = items.filter((c) => picked.size === 0 || c.discipline.some((d) => picked.has(d)));
    if (sort === 'curated') return hits; // the hand-authored order in cases.json
    // Years are authored as "YYYY" or "YYYY-MM", which compare correctly as
    // strings. A few long-tail entries carry no year at all — those sort last
    // either way rather than pretending to be the oldest.
    return [...hits].sort((a, b) => {
      const ay = a.year ?? '';
      const by = b.year ?? '';
      if (!ay !== !by) return ay ? -1 : 1;
      return sort === 'new' ? by.localeCompare(ay) : ay.localeCompare(by);
    });
  }, [items, picked, sort]);

  const filtered = picked.size > 0;

  return (
    <div className="pi">
      <div className="pi-bar">
        {/* "All" leads the row as the cleared state, so clearing is the same
            gesture as filtering rather than a separate link off to one side. */}
        <div className="pi-chips" role="group" aria-label="Filter by discipline">
          <button type="button" className="pi-chip" aria-pressed={!filtered} onClick={() => setPicked(new Set())}>
            All <b>{items.length}</b>
          </button>
          {options.map(({ d, n }) => (
            <button key={d} type="button" className="pi-chip" aria-pressed={picked.has(d)} onClick={() => setPicked(toggled(picked, d))}>
              {d} <b>{n}</b>
            </button>
          ))}
        </div>

        <div className="pi-tools">
          <p className="pi-count" role="status">
            {filtered ? `${shown.length} of ${items.length}` : `${items.length} projects`}
          </p>
          <div className="pi-sort" role="radiogroup" aria-label="Sort">
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={sort === s.value}
                className="pi-sort__opt"
                onClick={() => setSort(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* No empty state: every chip comes from the cases themselves and they
          OR together, so a selection can never match nothing. */}
      <ul className="pi-grid">
        {shown.map((c, i) => (
          <li key={c.slug} style={{ '--i': i } as CSSProperties}>
            <button
              type="button"
              className="pi-card"
              data-layer={c.layer}
              style={{ '--c': LAYER_COLOR[c.layer] } as CSSProperties}
              onClick={() => onOpen(c.slug)}
              aria-label={`${c.title} — ${c.client}, ${LAYER_LABEL[c.layer]}${c.year ? `, ${c.year.slice(0, 4)}` : ''}`}
            >
              <span className="pi-card__media">
                <img
                  src={asset(`/posters/${c.slug}.jpg`)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    e.currentTarget.parentElement?.setAttribute('data-empty', '');
                    e.currentTarget.remove();
                  }}
                />
              </span>
              <span className="pi-card__body">
                {/* An eyebrow, not a headline: the layer in its own colour,
                    the year opposite. The title carries the card. */}
                <span className="pi-card__stamp">
                  <span className="pi-card__layer">{LAYER_LABEL[c.layer]}</span>
                  {/* `year` may carry a month for timeline placement; the card
                      only ever stamps the year itself. */}
                  <span className="pi-card__yr">{c.year?.slice(0, 4) ?? '—'}</span>
                </span>
                <span className="pi-card__title">{c.title}</span>
                <span className="pi-card__meta">{c.client}</span>
                <span className="pi-card__sector">{c.sector}</span>
              </span>
              {/* the waypoint cards' scanner brackets, locking on under the pointer */}
              <span className="pi-card__reticle" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
