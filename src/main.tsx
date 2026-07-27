import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './ui/global.css';

// Start every hard load at the top and stop the browser restoring a prior
// scroll position on refresh. The maquette's load intro dollies into the City
// overview and cancels itself if the page isn't at the top (journeyStep 0) —
// a restored mid-page scroll would otherwise abort it straight to a lower
// layer. Hash deep-links (e.g. /#work) are left to ScrollToHash.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
// Instant, not smooth — html has scroll-behavior:smooth, and a smooth reset
// would animate down THROUGH the lower layers, cancelling the intro on the way.
if (!window.location.hash) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
