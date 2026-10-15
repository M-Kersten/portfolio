import { Link, useNavigate } from 'react-router-dom';
import { caseBySlug, cases } from '../../content';
import { EXHIBITS, NEXT_LAUNCH_NO, exhibitNo, pad2 } from '../../content/exhibits';
import { HOTSPOTS } from '../../scene/framing';
import { sceneStore } from '../../scene/store';

// The exhibition guide: the sheet the tally opens. The ten exhibits by layer,
// numbered; a lit one is named and opens it, a dark one keeps its name
// redacted but flies you there. Under them, exhibit 11, the next launch (it
// lights at ten and then takes you onto the pad), the way to the rest of the
// collection, and "start the tour over".

const LAYERS = ['city', 'room', 'chip'] as const;
const TOTAL = HOTSPOTS.length;
/** The projects that aren't in the model: on the timeline and /projects. */
const IN_COLLECTION = cases.filter((c) => !EXHIBITS.includes(c.slug)).length;

export function ExhibitionGuide({ visited, onClose, onOpenPad }: { visited: string[]; onClose: () => void; onOpenPad: () => void }) {
  const navigate = useNavigate();
  const found = visited.filter((slug) => HOTSPOTS.some((h) => h.slug === slug)).length;
  const open = (slug: string) => {
    onClose();
    navigate(`/work/${slug}`);
  };
  return (
    <div className="guide" role="dialog" aria-label="Exhibition guide">
      <div className="guide__head">
        <b>exhibition guide</b>
      </div>
      {LAYERS.map((l) => (
        <div key={l} className="guide__layer">
          <span className="guide__index">{l}</span>
          <ul>
            {HOTSPOTS.filter((h) => h.layer === l).map((h) => {
              const c = caseBySlug(h.slug);
              const on = visited.includes(h.slug);
              const no = pad2(exhibitNo(h.slug) ?? 0);
              return (
                <li key={h.slug}>
                  {on ? (
                    <button type="button" onClick={() => open(h.slug)}>
                      <i data-on="" />
                      <span className="guide__no">{no}</span>
                      {c?.title ?? h.slug}
                    </button>
                  ) : (
                    // still dark: its name stays redacted, but it's a way
                    // there — the camera flies to it and it lights up
                    <button type="button" className="guide__dark" onClick={() => open(h.slug)} aria-label={`Fly to exhibit ${no}, still dark, in the ${l}`}>
                      <i />
                      <span className="guide__no">{no}</span>
                      <span aria-hidden="true">{'▓'.repeat(Math.min(12, Math.max(6, (c?.title ?? h.slug).length)))}</span>
                      <span className="guide__go" aria-hidden="true">
                        fly there →
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
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
            The next launch
            <span className="guide__go">on the pad →</span>
          </button>
        ) : (
          <span className="guide__dark">
            <i />
            <span className="guide__no">{NEXT_LAUNCH_NO}</span>
            The next launch
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
  );
}
