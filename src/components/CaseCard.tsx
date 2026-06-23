import { useNavigate } from 'react-router-dom';
import { LAYER_LABEL, type CaseStudy } from '../content';

export function CaseCard({ study }: { study: CaseStudy }) {
  const navigate = useNavigate();
  return (
    <button type="button" className="case-card" data-layer={study.layer} onClick={() => navigate(`/work/${study.slug}`)}>
      <div className="case-card__top">
        <span className="case-card__layer">{LAYER_LABEL[study.layer]}</span>
        {study.live && <span className="case-card__live">Live twin</span>}
      </div>
      <h3 className="case-card__title">{study.title}</h3>
      <p className="case-card__client">
        {study.client} · {study.sector}
      </p>
      <div className="case-card__outcome">
        <span>Outcome</span>
        {study.outcome}
      </div>
    </button>
  );
}
