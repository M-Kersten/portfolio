import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Header } from '../components/Header';
import { SceneCanvas } from '../components/SceneCanvas';
import { HomeLayout } from '../components/HomeLayout';
import { NodeHud } from '../components/NodeHud';
import { ScrollToHash } from '../components/ScrollToHash';
import { DevTweakPanel } from '../scene/devTweak';

// One Router, one persistent <SceneCanvas/> (§6). Every case study is a modal
// nested in the home layout, so the scene stays mounted behind it.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

export function App() {
  return (
    <BrowserRouter basename={basename}>
      <ScrollToHash />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <SceneCanvas />
      {import.meta.env.DEV && <DevTweakPanel />}
      <main id="main">
        <Routes>
          <Route element={<HomeLayout />}>
            <Route index element={null} />
            <Route path="work/:slug" element={<NodeHud />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
