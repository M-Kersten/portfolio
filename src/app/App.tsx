import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Header } from '../components/Header';
import { SceneCanvas } from '../components/SceneCanvas';
import { HomeLayout } from '../components/HomeLayout';
import { NodeHud } from '../components/NodeHud';
import { CvPage } from '../components/CvPage';
import { ProjectsPage } from '../components/ProjectsPage';
import { ScrollToHash } from '../components/ScrollToHash';
import { DevTweakPanel } from '../scene/devTweak';
import { NodeTweakPanel } from '../scene/nodeTweak';
import { WallTweakPanel } from '../components/wallTweak';

// One Router, one persistent <SceneCanvas/> (§6). Every case study is a modal
// nested in the home layout, so the scene stays mounted behind it. The CV
// page lives outside the chrome — no header, no canvas, just the sheet.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

function SiteChrome() {
  return (
    <>
      <Header />
      <SceneCanvas />
      {import.meta.env.DEV && <DevTweakPanel />}
      {import.meta.env.DEV && <NodeTweakPanel />}
      {import.meta.env.DEV && <WallTweakPanel />}
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
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Routes>
        <Route element={<SiteChrome />}>
          <Route element={<HomeLayout />}>
            <Route index element={null} />
            <Route path="work/:slug" element={<NodeHud />} />
          </Route>
        </Route>
        <Route path="cv" element={<CvPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
