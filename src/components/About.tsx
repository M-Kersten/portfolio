import { site } from '../content';

export function About() {
  const a = site.about;
  return (
    <section id="about" className="section">
      <div className="container">
        <p className="section__eyebrow">{a.eyebrow}</p>
        <h2 className="section__title">{a.title}</h2>

        <div className="about__grid">
          <div>
            <p className="about__lead">{a.lead}</p>
            {a.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <dl className="about__list">
            {a.facts.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
