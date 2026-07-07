import { site } from '../content';
import { ScanFrame } from './ScanFrame';

export function Contact() {
  const c = site.contact;
  return (
    <section id="contact" className="section section--instrument">
      <ScanFrame variant="section" />
      <div className="container">
        <div className="contact">
          <h2>{c.title}</h2>
          <p>{c.lead}</p>
          <a className="contact__email" href={`mailto:${c.email}`}>
            {c.email}
          </a>
          <div className="contact__links">
            {c.links.map((l) => (
              <a key={l.label} className="btn btn--ghost" href={l.href} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
