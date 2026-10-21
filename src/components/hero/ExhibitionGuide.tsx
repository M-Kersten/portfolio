import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { caseBySlug, cases } from '../../content';
import { EXHIBITS, NEXT_LAUNCH_NO, exhibitNo, pad2 } from '../../content/exhibits';
import { HOTSPOTS } from '../../scene/framing';
import { sceneStore } from '../../scene/store';

// The exhibition guide: the leaflet the visitor is handed. It stands pushed
// into the bottom edge of the screen, folded in half like the one you take at
// the door, with its cover showing the count (4/10 lit) over the model: the
// tally IS the guide's cover. Pulling it out slides it up into the frame, and
// its cover swings open to the left onto the inside (hero.css): the ten
// exhibits by layer, numbered, a lit one named and bright, one still dark named
// too but in dim letters (it flies you there); then exhibit 11, the next launch
// (it lights at ten and then takes you onto the pad), the way to the rest of
// the collection, and "start the tour over". Folding it shut slides it back in.

const LAYERS = ['city', 'room', 'chip'] as const;
const TOTAL = HOTSPOTS.length;
/** The projects that aren't in the model: on the timeline and /projects. */
const IN_COLLECTION = cases.filter((c) => !EXHIBITS.includes(c.slug)).length;

/** The tally's words on the cover: the count, and what it's counting toward.
 *  The model assembles the next launch as exhibits light up, so the note names
 *  that goal from the first glance, counts down the last two, and says when
 *  it's ready. */
function tally(n: number, cue: boolean): { count: string; note?: string } {
  const count = `${n}/${TOTAL} lit`;
  if (n >= TOTAL) return { count, note: 'ready to launch' };
  // while the first-visit hint above it says the goal, the cover doesn't repeat it
  if (n === 0) return { count, note: cue ? undefined : `light all ${TOTAL} to launch` };
  if (n >= TOTAL - 2) return { count, note: `${TOTAL - n} to go` };
  return { count, note: 'stacking the next launch' };
}

export type GuideState = 'closed' | 'open' | 'closing';

export function ExhibitionGuide({
  state,
  visited,
  revealed,
  cue,
  flashKey,
  onOpen,
  onClose,
  onOpenPad,
}: {
  state: GuideState;
  visited: string[];
  /** how many the model shows lit (it trails `visited`: the tally steps when the model does) */
  revealed: number;
  /** the first-visit hint is up, which already says what the count is for */
  cue: boolean;
  /** bumped whenever the count steps, to restart its flash */
  flashKey: number;
  onOpen: () => void;
  onClose: () => void;
  onOpenPad: () => void;
}) {
  const navigate = useNavigate();
  const found = visited.filter((slug) => HOTSPOTS.some((h) => h.slug === slug)).length;
  const t = tally(revealed, cue);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const peekRef = useRef<HTMLButtonElement>(null);
  const pulled = useRef(false);
  // pushed in, nothing on the inside can be reached; pulled out, focus goes in,
  // and pushed back in it returns to the cover (unless it has gone elsewhere)
  useEffect(() => {
    const sheet = sheetRef.current;
    if (sheet) sheet.inert = state === 'closed';
    if (state === 'open') {
      pulled.current = true;
      closeRef.current?.focus({ preventScroll: true });
    } else if (state === 'closed' && pulled.current) {
      pulled.current = false;
      const at = document.activeElement;
      if (!at || at === document.body || sheet?.contains(at)) peekRef.current?.focus({ preventScroll: true });
    }
  }, [state]);
  const open = (slug: string) => {
    onClose();
    navigate(`/work/${slug}`);
  };
  const layer = (l: (typeof LAYERS)[number]) => (
    <div key={l} className="guide__layer">
      <span className="guide__index">{l}</span>
      <ul>
        {HOTSPOTS.filter((h) => h.layer === l).map((h) => {
          const c = caseBySlug(h.slug);
          const on = visited.includes(h.slug);
          const no = pad2(exhibitNo(h.slug) ?? 0);
          return (
            <li key={h.slug}>
              {/* a lit exhibit opens; one still dark is named too, but dim, and
                  is a way there: the camera flies to it and it lights up */}
              <button
                type="button"
                className={on ? undefined : 'guide__dark'}
                onClick={() => open(h.slug)}
                aria-label={on ? undefined : `Fly to exhibit ${no}, ${c?.title ?? h.slug}, still dark`}
              >
                <i data-on={on || undefined} />
                <span className="guide__no">{no}</span>
                <span className="guide__name">{c?.title ?? h.slug}</span>
                {!on && (
                  <span className="guide__go" aria-hidden="true">
                    fly there →
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
  return (
    <div className="guide" role="group" aria-label="Exhibition guide" data-state={state}>
      {/* the tab you take it by while it's pushed in: the cover's whole face */}
      <button
        ref={peekRef}
        type="button"
        className="guide__peek"
        onClick={onOpen}
        aria-expanded={state === 'open'}
        aria-label={`Exhibition guide, ${t.count}${t.note ? `, ${t.note}` : ''}`}
        tabIndex={state === 'closed' ? 0 : -1}
      />
      <div className="guide__sheet" ref={sheetRef} role="dialog" aria-label="Exhibition guide" aria-hidden={state === 'closed' || undefined}>
        {/* the left leaflet panel: hinged on the fold, with the cover on its back */}
        <section className="guide__half guide__half--left">
          <div className="guide__face guide__face--front">
            <div className="guide__head">
              <b>exhibition guide</b>
              <span>{t.count}</span>
              <button ref={closeRef} type="button" className="guide__close" onClick={onClose} aria-label="Fold the guide away">
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            {layer('city')}
            {layer('room')}
          </div>
          {/* the cover, printed on the back of that panel: the tally is its
              first lines, so it's what shows while the leaflet is pushed in */}
          <div className="guide__face guide__face--back guide__cover" aria-hidden="true">
            <span className="guide__cover-kicker">Exhibition guide</span>
            <span className="guide__cover-tally">
              <span className="hero__signals-pips">
                {HOTSPOTS.map((h, i) =>
                  i < TOTAL - 1 ? (
                    <i key={h.slug} data-on={i < revealed || undefined} />
                  ) : (
                    // the last one is what the ten add up to: the rocket
                    <svg key={h.slug} className="hero__signals-rocket" viewBox="0 0 8 12" data-on={i < revealed || undefined}>
                      <path d="M4 0.6C5.6 2.2 6 4.4 6 6.6V9H2V6.6C2 4.4 2.4 2.2 4 0.6Z" />
                      <path d="M2 7.2 0.6 9.6V10.6L2 9.8ZM6 7.2 7.4 9.6V10.6L6 9.8Z" />
                    </svg>
                  ),
                )}
              </span>
              <span key={flashKey} className={flashKey > 0 ? 'guide__cover-count guide__cover-count--flash' : 'guide__cover-count'}>
                {t.count}
              </span>
            </span>
            {t.note && <span className="guide__cover-note">{t.note}</span>}
            <span className="guide__cover-title">Work in miniature</span>
          </div>
        </section>
        <section className="guide__half guide__half--right">
          <div className="guide__face guide__face--front">
            {layer('chip')}
            {/* exhibit 11: what the ten add up to */}
            <div className="guide__layer guide__next">
              {found === TOTAL ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPad();
                  }}
                >
                  <i data-on="" />
                  <span className="guide__no">{NEXT_LAUNCH_NO}</span>
                  <span className="guide__name">The next launch</span>
                  <span className="guide__go">on the pad →</span>
                </button>
              ) : (
                <span className="guide__dark">
                  <i />
                  <span className="guide__no">{NEXT_LAUNCH_NO}</span>
                  <span className="guide__name">The next launch</span>
                  <span className="guide__when">lights at {TOTAL}</span>
                </span>
              )}
            </div>
            <Link className="guide__more" to="/projects" onClick={onClose}>
              {IN_COLLECTION} more in the collection <span aria-hidden="true">→</span>
            </Link>
            {found > 0 && (
              <button
                type="button"
                className="guide__reset"
                onClick={() => {
                  onClose();
                  sceneStore.resetVisited();
                }}
              >
                start the tour over
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
