import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { cases, caseBySlug, LAYER_LABEL, type CaseStudy } from '../content';
import { asset } from '../lib/asset';
import { useFocusTrap } from '../lib/useFocusTrap';
import { FocusCard } from './FocusCard';

// Site-wide "find a project": a magnifying-glass button in the top bar (with an
// "F" keycap) that — on click or when you press F anywhere — opens a command-
// palette-style overlay. Typing filters every case (highlights + the long tail,
// the same set the /projects cloud shows) across its location, tags and story
// text; a hit opens the shared FocusCard. This component is self-contained
// (trigger + overlay + card), so it can drop into any top bar; only one is
// mounted per route, so the global F shortcut never double-fires.

const LAYER_COLOR: Record<string, string> = { city: 'var(--cyan)', room: 'var(--coral)', chip: 'var(--lime)' };

// Pre-built search index. Fields are split by weight so a name or tag match
// ranks above a passing mention deep in the story text.
interface Indexed {
  c: CaseStudy;
  title: string; // strongest
  strong: string; // client · sector · tag · kind · layer · tech (location + tags)
  body: string; // problem · approach · lesson · outcome · year (content)
}
const INDEX: Indexed[] = cases.map((c) => ({
  c,
  title: c.title.toLowerCase(),
  strong: [c.client, c.sector, c.tag, c.kind, LAYER_LABEL[c.layer], ...(c.tech ?? [])].filter(Boolean).join(' ').toLowerCase(),
  body: [c.problem, c.approach, c.lesson, c.outcome, c.year].filter(Boolean).join(' ').toLowerCase(),
}));

// Every token must appear somewhere (AND); the field it hits sets its weight.
function score(ix: Indexed, tokens: string[]): number {
  let s = 0;
  for (const tok of tokens) {
    let best = 0;
    if (ix.title.includes(tok)) best = 6;
    else if (ix.strong.includes(tok)) best = 4;
    else if (ix.body.includes(tok)) best = 1;
    if (best === 0) return -1; // matched nowhere → drop the case
    s += best;
  }
  if (ix.title.startsWith(tokens.join(' '))) s += 5; // exact-ish names float up
  return s;
}

export function Search() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const study = openSlug ? caseBySlug(openSlug) : undefined;

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(panelRef, open);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return cases; // empty box → the whole index, in curated order
    const tokens = query.split(/\s+/);
    return INDEX.map((ix) => ({ ix, s: score(ix, tokens) }))
      .filter((o) => o.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((o) => o.ix.c);
  }, [q]);

  // Press F anywhere (but not while typing, and not Cmd/Ctrl+F) to open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'f' && e.key !== 'F') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return;
      // don't stack over an already-open dialog (a case card, the node HUD, or us)
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Focus the box on open; freeze the page behind the overlay; restore on close.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => setActive(0), [q]);
  // keep the highlighted hit in view as you arrow through
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const close = () => {
    setOpen(false);
    setQ('');
    triggerRef.current?.focus();
  };
  const openCase = (slug: string) => {
    setOpen(false);
    setQ('');
    setOpenSlug(slug);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      // preventDefault so this keypress can't also activate the case card's
      // freshly-focused close button as it mounts (Enter would dismiss it).
      e.preventDefault();
      const c = results[active];
      if (c) openCase(c.slug);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="find"
        onClick={() => setOpen(true)}
        aria-label="Find a project"
        aria-keyshortcuts="f"
      >
        <svg className="find__glass" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
        <span className="find__label">Find</span>
        <kbd className="find__key" aria-hidden="true">F</kbd>
      </button>

      {open &&
        createPortal(
          <div className="search" role="presentation" onClick={close} onKeyDown={onKeyDown}>
          <div
            ref={panelRef}
            className="search__panel"
            role="dialog"
            aria-modal="true"
            aria-label="Find a project"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="search__bar">
              <svg className="search__glass" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <line x1="16.5" y1="16.5" x2="21" y2="21" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                className="search__input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find a project — name, tech, sector, story…"
                role="combobox"
                aria-expanded="true"
                aria-controls="search-results"
                aria-activedescendant={results[active] ? `search-hit-${active}` : undefined}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button type="button" className="search__esc" onClick={close} aria-label="Close">
                Esc
              </button>
            </div>

            <div id="search-results" className="search__results" role="listbox" aria-label="Matching projects" ref={listRef}>
              {results.length === 0 ? (
                <p className="search__empty">
                  No projects match “{q.trim()}”. Try a place, a tool, or a client.
                </p>
              ) : (
                results.map((c, i) => (
                  <button
                    key={c.slug}
                    type="button"
                    id={`search-hit-${i}`}
                    data-i={i}
                    role="option"
                    aria-selected={i === active}
                    data-active={i === active || undefined}
                    className="search__hit"
                    style={{ '--c': LAYER_COLOR[c.layer] } as CSSProperties}
                    onClick={() => openCase(c.slug)}
                    onMouseMove={() => setActive(i)}
                  >
                    <span className="search__thumb">
                      <img
                        src={asset(`/posters/${c.slug}.jpg`)}
                        alt=""
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.parentElement?.setAttribute('data-empty', '');
                          e.currentTarget.remove();
                        }}
                      />
                    </span>
                    <span className="search__hit-body">
                      <span className="search__hit-title">{c.title}</span>
                      <span className="search__hit-meta">
                        {c.client} · {c.sector}
                      </span>
                    </span>
                    <span className="search__hit-layer">{LAYER_LABEL[c.layer]}</span>
                  </button>
                ))
              )}
            </div>

            <div className="search__foot">
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> to navigate · <kbd>↵</kbd> to open
              </span>
              <span className="search__foot-count">
                {results.length} of {cases.length}
              </span>
            </div>
          </div>
          </div>,
          document.body,
        )}

      {study && createPortal(<FocusCard study={study} onClose={() => setOpenSlug(null)} onJump={setOpenSlug} />, document.body)}
    </>
  );
}
