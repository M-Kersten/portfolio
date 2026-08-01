import { useMemo, useState, type CSSProperties } from 'react';
import { LAYER_LABEL, type CaseStudy, type Layer } from '../content';
import { asset } from '../lib/asset';

// The /projects index — every project (highlights + the long tail) as a
// scannable card grid. This is the one page a visitor arrives at with a
// specific question ("what's recent?", "has he shipped AR?"), so the metadata
// the maquette deliberately can't show — year, client, sector, layer — sits on
// the face of every card, and the tech chips narrow the set rather than
// decorate it. Clicking a card opens the same case card the timeline uses.

const LAYER_COLOR: Record<Layer, string> = { city: 'var(--cyan)', room: 'var(--coral)', chip: 'var(--lime)' };

type Sort = 'new' | 'old' | 'curated';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'new', label: 'Newest first' },
  { value: 'old', label: 'Oldest first' },
  { value: 'curated', label: 'Curated order' },
];

// A tech tag only earns a filter chip once it links two projects together —
// otherwise the row fills with 30 one-off tags that each narrow 16 cases to 1.
const MIN_TECH_USES = 2;

/** Toggle one value of a Set held in state, without mutating the old set. */
function toggled<T>(set: ReadonlySet<T>, v: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(v)) next.add(v);
  return next;
}

export function ProjectsIndex({ items, onOpen }: { items: CaseStudy[]; onOpen: (slug: string) => void }) {
  const [techs, setTechs] = useState<ReadonlySet<string>>(new Set());
  const [sort, setSort] = useState<Sort>('new');

  // Facet options come from the whole index, not the filtered view, so chips
  // never disappear out from under the pointer as you narrow.
  const techOptions = useMemo(() => {
    const uses = new Map<string, number>();
    for (const c of items) for (const t of c.tech ?? []) uses.set(t, (uses.get(t) ?? 0) + 1);
    return [...uses]
      .filter(([, n]) => n >= MIN_TECH_USES)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([t]) => t);
  }, [items]);

  const shown = useMemo(() => {
    // Selected tech tags are OR'd — "Unity or AR", not "Unity and AR" — so
    // picking a second tag always widens the set rather than emptying it.
    const hits = items.filter((c) => techs.size === 0 || (c.tech ?? []).some((t) => techs.has(t)));
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
  }, [items, techs, sort]);

  const filtered = techs.size > 0;
  const clear = () => setTechs(new Set());

  return (
    <>
      <div className="pi-bar">
        <div className="pi-facets">
          <div className="pi-facet">
            <span className="pi-facet__name" id="pi-facet-tech">
              Tech
            </span>
            <div className="pi-chips" role="group" aria-labelledby="pi-facet-tech">
              {techOptions.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="pi-chip"
                  aria-pressed={techs.has(t)}
                  onClick={() => setTechs(toggled(techs, t))}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pi-controls">
          <p className="pi-count" role="status">
            {filtered ? `${shown.length} of ${items.length}` : `${items.length} projects`}
          </p>
          {filtered && (
            <button type="button" className="pi-clear" onClick={clear}>
              Clear filters
            </button>
          )}
          <label className="pi-sort">
            <span className="pi-sort__name">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
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
                <span className="pi-card__stamp">
                  {/* `year` may carry a month for timeline placement; the card
                      only ever stamps the year itself. */}
                  <span className="pi-card__yr">{c.year?.slice(0, 4) ?? '—'}</span>
                  <span className="pi-card__layer">{LAYER_LABEL[c.layer]}</span>
                </span>
                <span className="pi-card__title">{c.title}</span>
                <span className="pi-card__meta">{c.client}</span>
                <span className="pi-card__sector">{c.sector}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
