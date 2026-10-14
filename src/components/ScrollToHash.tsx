import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Smoothly scrolls to #anchors after a route+hash navigation (e.g. arriving at
// /#work from the twin route), and scrolls to the top when a page of its own
// opens. Honours reduced-motion via the CSS scroll-behavior override.
export function ScrollToHash() {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    // A page of its own (the collection, the CV) opens at its top, not at
    // whatever depth the page you came from was scrolled to. The home page
    // and its /work overlays keep their scroll: the maquette's journey and
    // closing a label both set it themselves.
    if (!hash && pathname !== '/' && !pathname.startsWith('/work/')) {
      window.scrollTo(0, 0);
      return;
    }
    if (hash) {
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
  }, [hash, pathname]);

  return null;
}
