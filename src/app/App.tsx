import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';
import { Header } from '../components/shell/Header';
import { SceneCanvas } from '../components/hero/SceneCanvas';
import { IntroCard } from '../components/hero/IntroCard';
import { BootVeil } from '../components/shell/BootVeil';
import { FocusReticle } from '../components/hero/FocusReticle';
import { HomeLayout } from '../components/home/HomeLayout';
import { NodeHud } from '../components/exhibit/NodeHud';
import { NotFound } from '../components/shell/NotFound';
import { CvPage } from '../components/pages/CvPage';
import { ProjectsPage } from '../components/pages/ProjectsPage';
import { ScrollToHash } from '../components/shell/ScrollToHash';
import { DevTools } from '../dev/DevTools';

// One Router, one persistent <SceneCanvas/> (§6). Every case study is a modal
// nested in the home layout, so the scene stays mounted behind it. The CV
// page lives outside the chrome — no header, no canvas, just the sheet.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

function SiteChrome() {
  return (
    <>
      <Header />
      <SceneCanvas />
      <IntroCard />
      {/* The porthole reticle + the route-driven dossier (NodeHud) both portal to
          <body> and layer above the fixed header, so the focus view reads as the
          top plane — you look through the ring at the woken object. */}
      <FocusReticle />
      {import.meta.env.DEV && <DevTools />}
      <main id="main">
        <Outlet />
      </main>
    </>
  );
}

export function App() {
  return (
    <BrowserRouter basename={basename}>
      <ScrollToHash />
      {/* outside the routes: the fade-up is a property of the page load, so it
          covers the CV and projects sheets too, not just the maquette chrome */}
      <BootVeil />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Routes>
        <Route element={<SiteChrome />}>
          <Route element={<HomeLayout />}>
            <Route index element={null} />
            <Route path="work/:slug" element={<NodeHud />} />
            {/* a wrong address: a closed room, with the exhibition behind it */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
        <Route path="cv" element={<CvPage />} />
        <Route path="projects" element={<ProjectsPage />} />
      </Routes>
    </BrowserRouter>
  );
}
