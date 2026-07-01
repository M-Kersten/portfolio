import { useState } from 'react';
import { cases, site, LAYER_ORDER } from '../content';
import { CaseCard } from './CaseCard';

// One horizontal, scrollable track of project posters, ordered by scale
// (City → Room → Chip) so the accent colour shifts as you scroll through the
// scales. Clicking a card expands it inline — no route, no HUD.
export function Work() {
  const { workIntro } = site;
  const [open, setOpen] = useState<string | null>(null);
  const ordered = LAYER_ORDER.flatMap((layer) => cases.filter((c) => c.layer === layer));

  return (
    <section id="work" className="section">
      <div className="container">
        <p className="section__eyebrow">{workIntro.eyebrow}</p>
        {workIntro.title && <h2 className="section__title">{workIntro.title}</h2>}
        <p className="section__lead">{workIntro.lead}</p>
      </div>

      <div className="worktrack">
        {ordered.map((study) => (
          <CaseCard
            key={study.slug}
            study={study}
            open={open === study.slug}
            onToggle={() => setOpen((cur) => (cur === study.slug ? null : study.slug))}
          />
        ))}
      </div>
    </section>
  );
}
