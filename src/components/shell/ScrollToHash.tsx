import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { jumpTo } from '../../lib/page';

// Smoothly scrolls to #anchors after a route+hash navigation (e.g. arriving at
// /#work from the twin route), and scrolls to the top when a page of its own
// opens. Honours reduced-motion via the CSS scroll-behavior override.
export function ScrollToHash() {
  const { hash, pathname } = useLocation();
  const type = useNavigationType();
  const first = useRef(true);

  useEffect(() => {
    const arriving = first.current;
    first.current = false;
    // A page of its own (the collection, the CV) opens at its top, not at
    // whatever depth the page you came from was scrolled to. The home page
    // and its /work overlays keep their scroll: the maquette's journey and
    // closing a label both set it themselves.
    if (!hash && pathname !== '/' && !pathname.startsWith('/work/')) {
      jumpTo(0);
      return;
    }
    // Going to an anchor scrolls to it; coming back to one doesn't. Closing an
    // exhibit steps back to the entry it was opened from, and if that entry
    // was reached through the nav (/#capabilities) the page used to jump to
    // that anchor again, away from where the exhibit had been opened. (The
    // page's first location counts as going there: a link to /#work lands on
    // the timeline.)
    if (hash && (arriving || type !== 'POP')) {
      let tries = 0;
      const tryScroll = () => {
        const el = document.getElementById(decodeURIComponent(hash.slice(1)));
        if (el) {
          el.scrollIntoView({ block: 'start' });
        } else if (tries++ < 5) {
          requestAnimationFrame(tryScroll);
        }
      };
      tryScroll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, pathname]);

  return null;
}
