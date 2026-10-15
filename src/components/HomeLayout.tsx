import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { site } from '../content';
import { HeroStage } from './HeroStage';
import { Capabilities } from './Capabilities';
import { Work } from './Work';
import { About } from './About';
import { Contact } from './Contact';
import { Footer } from './Footer';
import { LaunchOverlay } from './LaunchOverlay';
import { SoundScape } from './SoundScape';

// The long home page. Stays mounted while a case modal (the <Outlet/>) is open,
// so the modal layers over the preserved scroll position (§3).
// The home page's own tab title. An open project names the tab while it's
// open; a project link arrives with its own (scripts/gen-pages.mjs); back on
// the home page the tab is the site again.
const HOME_TITLE = `${site.hero.name} — creative technologist`;

export function HomeLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname === '/') document.title = HOME_TITLE;
  }, [pathname]);
  return (
    <>
      <HeroStage />
      <Capabilities />
      <Work />
      <About />
      <Contact />
      <Footer />
      <Outlet />
      {/* the launch easter egg's DOM half (LAUNCH button, countdown, the game) */}
      <LaunchOverlay />
      <SoundScape />
    </>
  );
}
