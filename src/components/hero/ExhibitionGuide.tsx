import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { caseBySlug } from '../../content';
import { DEPOT_COUNT, EXHIBITION } from '../../content/exhibits';
import { HOTSPOTS } from '../../scene/framing';
import { sceneStore } from '../../scene/store';

// The exhibition guide: your admission ticket. It stands pushed into the
// bottom edge of the screen, and its top is the one sign down there: ADMIT
// ONE, how many of the ten you've seen (4 of 10 seen), what they add up to
// once a couple have been seen (launch at ten, counted down at the end), and
// for a moment a returning visitor's greeting.
// Pulling it out slides it up into the frame and turns it over (hero.css): on
// the back, the ten exhibits by floor, and a stamp against each one you've
// seen, in its floor's colour (one seen since the guide was last out stamps
// itself in as it turns over). One not seen yet is in dim letters, and is a
// way there: the camera flies to it. Past the perforation, the stub is the
// eleventh: once it's been hinted at, the next launch, which opens at ten;
// then tearing it off takes you onto the pad to fly it. Under the list, the
// way into the depot (the rest of the collection) and "start the tour over".
// Pushing it back in turns it face up again, and so does a click anywhere
// outside it.

const LAYERS = ['city', 'room', 'chip'] as const;
const TOTAL = HOTSPOTS.length;
/** how long tearing the stub off takes, before the pad (hero.css, guide-tear) */
const TEAR_MS = 1750;

/** The count on the cover, said the way a visitor would: how many of the ten
 *  they've seen. A gallery keeps its objects in low light and brings it up as
 *  someone walks in, and that's all the count is keeping track of: no goal in
 *  front of it (what the ten add up to is waiting at the end, in the guide).
 *  At ten it's "All 10 seen", which is also the one that fits the cover. */
const tally = (n: number) => (n >= TOTAL ? `All ${TOTAL} seen` : `${n} of ${TOTAL} seen`);

const WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** How many have to be seen before the launch is mentioned at all. A first
 *  visit is for the work: until a second exhibit has been seen the cover is
 *  only the count, and then the hint comes in (a rocket drops into the
 *  strip's last cell and the note under the count says what the ten add up
 *  to). */
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
  // the ten in the order they were seen, for the strip's cells
  const seenOrder = visited.filter((slug) => HOTSPOTS.some((h) => h.slug === slug));
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
  // open, a press anywhere outside the ticket puts it away (and still does
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
  // at ten, the stub torn off: a tug, the tear running down the perforation,
  // and it comes away and drops (hero.css, guide-tear); then the pad
  const [torn, setTorn] = useState(false);
  useEffect(() => {
    if (state === 'closed') setTorn(false);
  }, [state]);
  const tear = () => {
    if (torn) return;
    setTorn(true);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(
      () => {
        onClose();
        onOpenPad();
      },
      reduced ? 0 : TEAR_MS,
    );
  };
  const open = (slug: string) => {
    onClose();
    navigate(`/work/${slug}`);
  };
  let stamps = 0; // the fresh stamps' order, so they come down one after another
  let n = 0; // each exhibit's place in the ten, for its stamp's angle
  const layer = (l: (typeof LAYERS)[number]) => (
    <div key={l} className="guide__layer">
      <span className="guide__index">{l}</span>
      <ul>
        {HOTSPOTS.filter((h) => h.layer === l).map((h) => {
          const title = caseBySlug(h.slug)?.title ?? h.slug;
          const on = visited.includes(h.slug);
          const isFresh = fresh.includes(h.slug);
          const index = n++;
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
                <span className="guide__name">{title}</span>
                {on && <Stamp layer={l} index={index} fresh={isFresh} order={isFresh ? stamps++ : 0} />}
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
        <div className="guide__ticket">
          {/* the front, face up while it's pushed in: the top of it is what shows */}
          <section className="guide__side guide__side--front guide__cover" aria-hidden="true">
            <div className="guide__main">
              <span className="guide__cover-kicker">Admit one · exhibition guide</span>
              <span className="guide__cover-tally">
                {/* the ten as a strip of cells, the way a strip ticket is
                    stamped a cell at a time: each one seen fills the next cell
                    with a stamp in its floor's colour, in the order they were
                    seen; once it's been hinted at, the last cell holds the
                    rocket the ten add up to (it lands as the hint is given,
                    and with one to go it breathes, like the pad's beacon) */}
                <span className="guide__strip">
                  {HOTSPOTS.map((h, i) => {
                    const on = i < revealed;
                    const rocket = i === TOTAL - 1 && hinted;
                    const by = on ? HOTSPOTS.find((x) => x.slug === seenOrder[i])?.layer : undefined;
                    return (
                      <i
                        key={h.slug}
                        className="guide__cell"
                        data-on={(on && !rocket) || undefined}
                        data-layer={by}
                        data-fresh={(flashKey > 0 && on && i === revealed - 1) || undefined}
                        style={{ '--tilt': `${TILT[(i * 3) % TILT.length]}deg` } as CSSProperties}
                      >
                        {rocket && (
                          <svg
                            className="hero__signals-rocket"
                            viewBox="0 0 8 12"
                            data-on={on || undefined}
                            data-next={i === revealed || undefined}
                            data-new={hintNow || undefined}
                          >
                            <path d="M4 0.6C5.6 2.2 6 4.4 6 6.6V9H2V6.6C2 4.4 2.4 2.2 4 0.6Z" />
                            <path d="M2 7.2 0.6 9.6V10.6L2 9.8ZM6 7.2 7.4 9.6V10.6L6 9.8Z" />
                          </svg>
                        )}
                      </i>
                    );
                  })}
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
            <div className="guide__stub">
              <span className="guide__serial">No. {String(TOTAL + 1).padStart(4, '0')}</span>
            </div>
          </section>
          {/* the back, turned up once it's out: the ten, stamped as you see them */}
          <section className="guide__side guide__side--back">
            <div className="guide__main">
              <div className="guide__head">
                <b>admit one · {tally(found)}</b>
                <button ref={closeRef} type="button" className="guide__close" onClick={onClose} aria-label="Put the ticket away">
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M1.5 1.5 10.5 10.5M10.5 1.5 1.5 10.5" />
                  </svg>
                </button>
              </div>
              {layer('city')}
              {layer('room')}
              {layer('chip')}
              <div className="guide__foot">
                <Link className="guide__more" to="/projects" onClick={onClose}>
                  {/* (the arrow kept with the last word on a narrow ticket) */}
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
            </div>
            {/* the stub: the eleventh, the ride at the end of the visit (the
                flight simulator, which flies the next launch), once the cover
                has hinted at it; torn off at ten, it takes you onto the pad */}
            <div className="guide__stub" data-torn={torn || undefined}>
              {!hinted ? (
                <span className="guide__serial">No. {String(TOTAL + 1).padStart(4, '0')}</span>
              ) : found === TOTAL ? (
                <button type="button" className="guide__tear" onClick={tear}>
                  <span>tear here · fly the next launch</span>
                </button>
              ) : (
                <span className="guide__serial">11 · the next launch · opens at {TOTAL}</span>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** The validator's stamp against an exhibit you've seen: SEEN, in its floor's
 *  colour, set down a little crooked (each at its own angle). `fresh` stamps
 *  it in (hero.css), once the ticket has turned over, one after another in
 *  `order`. */
const TILT = [-4, 3, -2, 5, -3, 2, -5, 4, -1, 3];
function Stamp({ layer, index, fresh, order }: { layer: string; index: number; fresh: boolean; order: number }) {
  return (
    <span
      className="guide__stamp"
      data-layer={layer}
      data-fresh={fresh || undefined}
      aria-hidden="true"
      style={{ '--tilt': `${TILT[index % TILT.length]}deg`, '--i': order } as CSSProperties}
    >
      seen
    </span>
  );
}
