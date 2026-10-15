import { type RefObject } from 'react';
import { type CaseStudy } from '../../content';
import { exhibitNo, pad2 } from '../../content/exhibits';

// What the label and the book share: where they are, the touch layout, the
// walk to the neighbouring projects, and the film player.

export type Place = 'maquette' | 'page';
/** Where the label rises from the bottom and the book fills the screen: phones,
 *  and tablets held upright (the porthole's own breakpoint, porthole.css). */
export const SHEET = '(max-width: 760px), (max-width: 1120px) and (orientation: portrait)';
export const sheetLayout = () => window.matchMedia(SHEET).matches;
export type Box = { left: number; top: number; width: number; height: number };
export const box = (r: DOMRect): Box => ({
  left: r.left,
  top: r.top,
  width: r.width,
  height: r.height,
});
/** What the book unfolds from: the label (its head and its film), or on a page
 *  the picture on the card that was clicked. */
export type From = { head?: Box; film: Box };
export type Dir = 1 | -1;
/** The side the next book comes in from after a walk: it outlives the book that
 *  walked (in the maquette a walk is a route change, and remounts the lot). */
export const walkIn: { dir: Dir | 0 } = { dir: 0 };
export const enterAttr = (d: Dir | 0) => (d === 1 ? 'right' : d === -1 ? 'left' : undefined);

export function Walk({ place, prev, next, onWalk }: { place: Place; prev?: CaseStudy; next?: CaseStudy; onWalk: (slug: string) => void }) {
  if (!prev && !next) return null;
  // the maquette walks by exhibit number, a page by date
  const tag = (c: CaseStudy) => {
    const no = exhibitNo(c.slug);
    if (place === 'maquette' && no !== null) return `${pad2(no)} ${c.title}`;
    const year = c.year?.slice(0, 4);
    return year ? `${year} ${c.title}` : c.title;
  };
  return (
    <nav className="xl__walk" aria-label={place === 'maquette' ? 'Neighbouring exhibits' : 'Older and newer projects'}>
      {prev ? (
        <button type="button" onClick={() => onWalk(prev.slug)} aria-keyshortcuts="ArrowLeft">
          <span aria-hidden="true">← </span>
          {tag(prev)}
        </button>
      ) : (
        <span />
      )}
      {next && (
        <button type="button" onClick={() => onWalk(next.slug)} aria-keyshortcuts="ArrowRight">
          {tag(next)}
          <span aria-hidden="true"> →</span>
        </button>
      )}
    </nav>
  );
}

export const PlayMark = () => (
  <span className="xl__watch-mark" aria-hidden="true">
    <svg viewBox="0 0 12 14">
      <path d="M1.5 1.2 11 7l-9.5 5.8z" />
    </svg>
  </span>
);

/** A YouTube player, autoplaying (it's only ever mounted when pressed for). */
export function Player({
  embed,
  title,
  start = 0,
  frameRef,
  onLoad,
  loaded,
}: {
  embed: string;
  title: string;
  start?: number;
  frameRef?: RefObject<HTMLIFrameElement>;
  onLoad?: () => void;
  loaded?: boolean;
}) {
  const origin = `&origin=${encodeURIComponent(window.location.origin)}`;
  return (
    <iframe
      ref={frameRef}
      src={`${embed}&autoplay=1&enablejsapi=1${origin}${start > 0 ? `&start=${start}` : ''}`}
      title={`${title}: film`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      data-loaded={loaded || undefined}
      onLoad={onLoad}
    />
  );
}
