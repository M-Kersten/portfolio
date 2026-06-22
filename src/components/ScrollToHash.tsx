import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Smoothly scrolls to #anchors after a route+hash navigation (e.g. arriving at
// /#work from the twin route), and otherwise scrolls to top on real page
// changes. Honours reduced-motion via the CSS scroll-behavior override.
export function ScrollToHash() {
  const { hash, pathname } = useLocation();

  useEffect(() => {
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
