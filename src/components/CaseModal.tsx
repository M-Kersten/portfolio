import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { caseBySlug } from '../content';
import { CaseDialog } from './CaseDialog';

// Route-driven modal layered over the home scroll position (§3). The
// municipal-twin slug is the full twin scene, not a modal, so hand it off.
export function CaseModal() {
  const { slug } = useParams();
  const navigate = useNavigate();

  if (slug === 'municipal-twin') return <Navigate to="/work/municipal-twin" replace />;

  const study = slug ? caseBySlug(slug) : undefined;
  if (!study) return <Navigate to="/" replace />;

  return <CaseDialog study={study} onClose={() => navigate('/')} />;
}
