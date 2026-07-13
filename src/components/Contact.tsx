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
            {/* CV in both languages — generated from the site's own content
                (see `npm run cv`); /cv is the on-screen version with a toggle */}
            <a className="btn btn--ghost" href={asset('/cv.pdf')} download="merijn-kersten-cv.pdf">
              CV — EN
            </a>
            <a className="btn btn--ghost" href={asset('/cv-nl.pdf')} download="merijn-kersten-cv-nl.pdf">
              CV — NL
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
