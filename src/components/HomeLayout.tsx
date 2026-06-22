import { Outlet } from 'react-router-dom';
import { HeroStage } from './HeroStage';
import { Capabilities } from './Capabilities';
import { Work } from './Work';
import { About } from './About';
import { Contact } from './Contact';
import { Footer } from './Footer';

// The long home page. Stays mounted while a case modal (the <Outlet/>) is open,
// so the modal layers over the preserved scroll position (§3).
export function HomeLayout() {
  return (
    <>
      <HeroStage />
      <Capabilities />
      <Work />
      <About />
      <Contact />
      <Footer />
      <Outlet />
    </>
  );
}
