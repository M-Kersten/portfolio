import { capabilities, site } from '../content';

// The three-pillar band mirrors the hero's three layers (§3).
export function Capabilities() {
  const { capabilitiesIntro } = site;
  return (
    <section id="capabilities" className="section">
      <div className="container">
        <p className="section__eyebrow">{capabilitiesIntro.eyebrow}</p>
        <h2 className="section__title">{capabilitiesIntro.title}</h2>
        <p className="section__lead">{capabilitiesIntro.lead}</p>

        <div className="capabilities__grid">
          {capabilities.map((c) => (
            <article key={c.layer} className="capability" data-layer={c.layer}>
              <div className="capability__index">{c.index}</div>
              <h3 className="capability__title">{c.title}</h3>
              <p className="capability__body">{c.body}</p>
              <ul className="capability__tags">
                {c.tags.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
