import { cases, site } from '../content';
import { CaseCard } from './CaseCard';

export function Work() {
  const { workIntro } = site;
  return (
    <section id="work" className="section">
      <div className="container">
        <p className="section__eyebrow">{workIntro.eyebrow}</p>
        <h2 className="section__title">{workIntro.title}</h2>
        <p className="section__lead">{workIntro.lead}</p>

        <div className="work__grid">
          {cases.map((study) => (
            <CaseCard key={study.slug} study={study} />
          ))}
        </div>
      </div>
    </section>
  );
}
