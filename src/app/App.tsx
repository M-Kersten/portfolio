import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Header } from '../components/Header';
import { SceneCanvas } from '../components/SceneCanvas';
import { HomeLayout } from '../components/HomeLayout';
import { CaseModal } from '../components/CaseModal';
import { TwinPage } from '../components/TwinPage';
import { ScrollToHash } from '../components/ScrollToHash';

// One Router, one persistent <SceneCanvas/> (§6). The twin is its own top-level
// route so the home sections don't render behind (and cover) the full-screen
// twin; every other case study is a modal nested in the home layout.
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
      <main id="main">
        <Routes>
          <Route element={<HomeLayout />}>
            <Route index element={null} />
            <Route path="work/:slug" element={<CaseModal />} />
          </Route>
          <Route path="work/municipal-twin" element={<TwinPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
