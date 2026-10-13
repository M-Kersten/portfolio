import { site } from '../content';
import { NEXT_LAUNCH_NO } from '../content/exhibits';
import { asset } from '../lib/asset';
import { ContactMotif } from './ContactMotif';
import { SectionHead } from './SectionHead';

// The commission desk: where the exhibition's last exhibit gets ordered. It
// picks up the thread from the launch pad (exhibit 11, "your project"), asks
// the question, and the address is the answer.
export function Contact() {
  const c = site.contact;
  return (
    <section id="contact" className="section section--instrument">
      <div className="container">
        <div className="contact">
          <ContactMotif />
          <SectionHead id="contact" title={c.title} lead={c.lead} align="center" note="the commission desk" />
          <p className="contact__thread">
            Exhibit {NEXT_LAUNCH_NO} is yours. What are we launching?
          </p>
          <a className="contact__email" href={`mailto:${c.email}?subject=${encodeURIComponent(`Exhibit ${NEXT_LAUNCH_NO}`)}`}>
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
