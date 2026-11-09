import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { caseBySlug } from '../../content';
import { DEPOT_COUNT, EXHIBITION } from '../../content/exhibits';
import { HOTSPOTS } from '../../scene/framing';
import { sceneStore } from '../../scene/store';

// The exhibition guide: the leaflet the visitor is handed. It stands pushed
// into the bottom edge of the screen, folded in half like the one you take at
// the door, and its cover is the one sign down there: how many of the ten
// you've seen (4 of 10 seen), what they add up to once a couple have been
// seen (launch at ten, counted down at the end), and for a moment a
// returning visitor's greeting.
// Pulling it out slides it up into the frame, and its cover swings open to the
// left onto the inside (hero.css): the ten exhibits by floor, the way a
// printed leaflet lists them, and the visitor's own pen marks in its margin, a
// tick against each one they've seen (the tick for one seen since the guide
// was last open writes itself in as it opens). One not seen yet is in dim
// letters, and is a way there: the camera flies to it. Then (once it's been
// hinted at) the flight simulator, the ride at the end of the visit (it opens
// at ten and then takes you onto the pad, to fly the next launch), the way
// into the depot (the rest of the collection), and "start the tour over".
// Folding it shut slides it back in, and so does a click anywhere outside it.

const LAYERS = ['city', 'room', 'chip'] as const;
const TOTAL = HOTSPOTS.length;

/** The count on the cover, said the way a visitor would: how many of the ten
 *  they've seen. A gallery keeps its objects in low light and brings it up as
 *  someone walks in, and that's all the count is keeping track of: no goal in
 *  front of it (what the ten add up to is waiting at the end, in the guide).
 *  At ten it's "All 10 seen", which is also the one that fits the cover. */
const tally = (n: number) => (n >= TOTAL ? `All ${TOTAL} seen` : `${n} of ${TOTAL} seen`);

const WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** How many have to be seen before the launch is mentioned at all. A first
 *  visit is for the work: until a second exhibit has been seen the cover is
 *  only the count, and then the hint comes in (the tenth pip turns into the
 *  rocket and the note under the count says what the ten add up to). */
const HINT_AT = 2;

/** Under the count, once it's been hinted at, what it adds up to: the next
 *  launch, which the pad in the city stacks a piece at a time as exhibits are
 *  seen. The last two are counted down, and it says when the pad is ready.
 *  (Short enough for a phone's narrow cover.) */
function ahead(n: number) {
  if (n < HINT_AT) return null;
  if (n >= TOTAL) return 'Ready to launch';
  if (n === TOTAL - 1) return 'One more to launch';
  if (n === TOTAL - 2) return 'Two more to launch';
  return `Launch at ${WORD[TOTAL] ?? TOTAL}`;
}

export type GuideState = 'closed' | 'open' | 'closing';

export function ExhibitionGuide({
  state,
  visited,
  revealed,
  here,
  flashKey,
  onOpen,
  onClose,
  onOpenPad,
}: {
  state: GuideState;
  visited: string[];
  /** how many the model shows lit (it trails `visited`: the tally steps when the model does) */
  revealed: number;
  /** under the count, for a moment: a returning visitor's greeting */
  here: ReactNode;
  /** bumped whenever the count steps, to restart its flash */
  flashKey: number;
  onOpen: () => void;
  onClose: () => void;
  onOpenPad: () => void;
}) {
  const navigate = useNavigate();
  const found = visited.filter((slug) => HOTSPOTS.some((h) => h.slug === slug)).length;
  const count = tally(revealed);
  const note = ahead(revealed);
  const hinted = revealed >= HINT_AT;
  // the step that brings the hint (not a page that loads with it already given)
  const hintNow = flashKey > 0 && revealed === HINT_AT;
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  // The ticks already in the margin: the ones there when the page loaded (the
  // model as you left it) and every one shown since. A tick that isn't, on an
  // exhibit seen since the guide was last open, is written in as it opens.
  // Settled once per opening, so a render while it's open can't cut a stroke short.
  const marked = useRef<Set<string> | null>(null);
  if (!marked.current) marked.current = new Set(visited);
  const freshAtOpen = useRef<string[]>([]);
  const wasOpen = useRef(false);
  if (state === 'open' && !wasOpen.current) {
    freshAtOpen.current = visited.filter((slug) => !marked.current!.has(slug));
    for (const slug of visited) marked.current.add(slug);
  }
  wasOpen.current = state === 'open';
  const fresh = state === 'open' ? freshAtOpen.current : [];
  // open, a press anywhere outside the leaflet folds it away (and still does
  // whatever that press was for)
  useEffect(() => {
    if (state !== 'open') return;
    const away = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [state, onClose]);
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
  let ticks = 0; // the fresh ticks' order, so they write themselves in one after another
  const layer = (l: (typeof LAYERS)[number]) => (
    <div key={l} className="guide__layer">
      <span className="guide__index">{l}</span>
      <ul>
        {HOTSPOTS.filter((h) => h.layer === l).map((h) => {
          const title = caseBySlug(h.slug)?.title ?? h.slug;
          const on = visited.includes(h.slug);
          const isFresh = fresh.includes(h.slug);
          return (
            <li key={h.slug}>
              {/* one you've seen opens; one not seen yet is named too, but dim,
                  and is a way there: the camera flies to it and it lights up */}
              <button
                type="button"
                className={on ? undefined : 'guide__dark'}
                onClick={() => open(h.slug)}
                aria-label={on ? `${title}, seen` : `Fly to ${title}, not seen yet`}
              >
                <span className="guide__mark" aria-hidden="true">
                  {on && <PenTick fresh={isFresh} order={isFresh ? ticks++ : 0} />}
                </span>
                <span className="guide__name">{title}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
  return (
    <div className="guide" ref={rootRef} role="group" aria-label="Exhibition guide" data-state={state}>
      {/* the tab you take it by while it's pushed in: the cover's whole face */}
      <button
        ref={peekRef}
        type="button"
        className="guide__peek"
        onClick={onOpen}
        aria-expanded={state === 'open'}
        aria-label={note ? `Exhibition guide, ${count}. ${note}` : `Exhibition guide, ${count}`}
        tabIndex={state === 'closed' ? 0 : -1}
      />
      <div className="guide__sheet" ref={sheetRef} role="dialog" aria-label="Exhibition guide" aria-hidden={state === 'closed' || undefined}>
        {/* the left leaflet panel: hinged on the fold, with the cover on its back */}
        <section className="guide__half guide__half--left">
          <div className="guide__face guide__face--front">
            <div className="guide__head">
              <b>exhibition guide</b>
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
                  i < TOTAL - 1 || !hinted ? (
                    <i key={h.slug} data-on={i < revealed || undefined} />
                  ) : (
                    // the last one, once it's been hinted at, is what the ten
                    // add up to: the rocket (it lands as the hint is given,
                    // and with one to go it breathes, like the pad's beacon)
                    <svg
                      key={h.slug}
                      className="hero__signals-rocket"
                      viewBox="0 0 8 12"
                      data-on={i < revealed || undefined}
                      data-next={i === revealed || undefined}
                      data-new={hintNow || undefined}
                    >
                      <path d="M4 0.6C5.6 2.2 6 4.4 6 6.6V9H2V6.6C2 4.4 2.4 2.2 4 0.6Z" />
                      <path d="M2 7.2 0.6 9.6V10.6L2 9.8ZM6 7.2 7.4 9.6V10.6L6 9.8Z" />
                    </svg>
                  ),
                )}
              </span>
              <span key={flashKey} className={flashKey > 0 ? 'guide__cover-count guide__cover-count--flash' : 'guide__cover-count'}>
                {count}
              </span>
            </span>
            {/* (a returning visitor's greeting takes its place for a moment;
                a new note comes in with the count that brings it, and the
                first, the hint, comes in lit, a beat after the count) */}
            {here ??
              (note && (
                <span
                  key={note}
                  className="guide__cover-note"
                  data-close={revealed >= TOTAL - 2 || undefined}
                  data-first={hintNow || undefined}
                >
                  {note}
                </span>
              ))}
            <span className="guide__cover-title">{EXHIBITION}</span>
          </div>
        </section>
        <section className="guide__half guide__half--right">
          {/* the way to fold it away, top right, where a close button is looked for */}
          <button ref={closeRef} type="button" className="guide__close" onClick={onClose} aria-label="Fold the guide away">
            <span aria-hidden="true">✕</span>
          </button>
          <div className="guide__face guide__face--front">
            {layer('chip')}
            {/* the ride at the end of the visit: the flight simulator, which
                flies exhibit 11 (the next launch) once all ten are seen (and
                isn't listed until the cover has hinted at it) */}
            {hinted && (
              <div className="guide__layer guide__next">
                {found === TOTAL ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPad();
                    }}
                  >
                    <span className="guide__mark" aria-hidden="true" />
                    <span className="guide__name">Flight simulator</span>
                    <span className="guide__go">fly the next launch →</span>
                  </button>
                ) : (
                  <span className="guide__dark">
                    <span className="guide__mark" aria-hidden="true" />
                    <span className="guide__name">Flight simulator</span>
                    <span className="guide__when">opens once you’ve seen all {TOTAL}</span>
                  </span>
                )}
              </div>
            )}
            <Link className="guide__more" to="/projects" onClick={onClose}>
              {/* (the arrow kept with the last word on a narrow panel) */}
              {DEPOT_COUNT} more in the depot{'\u00a0'}
              <span aria-hidden="true">→</span>
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

/** A tick in the margin, as a visitor marks off what they've seen with a
 *  pen: one quick stroke, down and then up and away, a little uneven. `fresh`
 *  writes it in (hero.css), after the leaflet has opened, one after another
 *  in `order`. */
function PenTick({ fresh, order }: { fresh: boolean; order: number }) {
  return (
    <svg className="guide__tick" viewBox="0 0 18 16" data-fresh={fresh || undefined} style={fresh ? ({ '--i': order } as CSSProperties) : undefined}>
      <path d="M2.2 8.9C3.7 10 5 11.6 6 13.9C7.9 9.2 11.4 4.6 16.2 1.8" pathLength={1} />
    </svg>
  );
}
