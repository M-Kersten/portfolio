import { cases, site, LAYER_ORDER, LAYER_TAGLINE } from '../content';
import { CaseCard } from './CaseCard';

// Grouped by scale (City → Room → Chip) so the three-layer story is visible in
// the content, mirroring the maquette.
export function Work() {
  const { workIntro } = site;
  return (
    <section id="work" className="section">
      <div className="container">
        <p className="section__eyebrow">{workIntro.eyebrow}</p>
        {workIntro.title && <h2 className="section__title">{workIntro.title}</h2>}
        <p className="section__lead">{workIntro.lead}</p>

        {LAYER_ORDER.map((layer) => {
          const group = cases.filter((c) => c.layer === layer);
          if (group.length === 0) return null;
          return (
            <div key={layer} className="work__group">
              <div className="work__group-head">
                <span className="work__group-tag">{LAYER_TAGLINE[layer]}</span>
              </div>
              <div className="work__grid">
                {group.map((study, i) => (
                  <CaseCard key={study.slug} study={study} feature={i === 0} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
