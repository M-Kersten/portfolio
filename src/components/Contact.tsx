import { site } from '../content';
import { asset } from '../lib/asset';
import { ContactMotif } from './ContactMotif';

export function Contact() {
  const c = site.contact;
  return (
    <section id="contact" className="section section--instrument">
      <div className="container">
        <div className="contact">
          <ContactMotif />
          <h2>{c.title}</h2>
          <p>{c.lead}</p>
          <a className="contact__email" href={`mailto:${c.email}`}>
            {c.email}
          </a>
          <div className="contact__links">
            {/* generated from the same content as the site — see `npm run cv` */}
            <a className="btn btn--ghost" href={asset('/cv.pdf')} download="merijn-kersten-cv.pdf">
              CV (PDF)
            </a>
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
