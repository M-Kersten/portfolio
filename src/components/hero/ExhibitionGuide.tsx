import { Link, useNavigate } from 'react-router-dom';
import { caseBySlug, cases } from '../../content';
import { EXHIBITS, NEXT_LAUNCH_NO, exhibitNo, pad2 } from '../../content/exhibits';
import { HOTSPOTS } from '../../scene/framing';
import { sceneStore } from '../../scene/store';

// The exhibition guide: the leaflet the tally hands you. Folded in half, like
// the one you take at the door: it comes out as its cover, which swings open
// to the left (hero.css) onto the inside. The ten exhibits by layer, numbered,
// a lit one named and bright, one still dark named and dim (it flies you
// there); then exhibit 11, the next launch (it lights at ten and then takes
// you onto the pad), the way to the rest of the collection, and "start the
// tour over".

const LAYERS = ['city', 'room', 'chip'] as const;
const TOTAL = HOTSPOTS.length;
/** The projects that aren't in the model: on the timeline and /projects. */
const IN_COLLECTION = cases.filter((c) => !EXHIBITS.includes(c.slug)).length;

export function ExhibitionGuide({
  visited,
  closing,
  onClose,
  onOpenPad,
}: {
  visited: string[];
  /** folding shut: the leaflet plays its opening backwards */
  closing: boolean;
  onClose: () => void;
  onOpenPad: () => void;
}) {
  const navigate = useNavigate();
  const found = visited.filter((slug) => HOTSPOTS.some((h) => h.slug === slug)).length;
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
    <div className="guide" role="dialog" aria-label="Exhibition guide" data-closing={closing || undefined}>
      <div className="guide__sheet">
        {/* the left leaflet panel: hinged on the fold, with the cover on its back */}
        <section className="guide__half guide__half--left">
          <div className="guide__face guide__face--front">
            <div className="guide__head">
              <b>exhibition guide</b>
            </div>
            {layer('city')}
            {layer('room')}
          </div>
          <div className="guide__face guide__face--back guide__cover" aria-hidden="true">
            <span className="guide__cover-kicker">Work in miniature</span>
            <span className="guide__cover-title">Exhibition guide</span>
            <span className="guide__cover-count">
              {found} of {TOTAL} lit
            </span>
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
