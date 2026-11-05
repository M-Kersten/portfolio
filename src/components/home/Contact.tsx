import { formatDate, site } from '../../content';
import { asset } from '../../lib/asset';
import { ContactMotif } from './ContactMotif';
import { SectionHead } from '../shell/SectionHead';

// The workshop: where the museum's next pieces get made, and the way to ask
// for one. Under its name, the sign on its door: when it takes on new work.

/** When the workshop takes on new work, read off the career: the month after
 *  the last booked stint ends ("Jan 2027"), or "now" once that's past. No
 *  date while a stint runs with no end to it: then there's none to give. */
function openFrom(now = new Date()): string | null {
  const career = site.career ?? [];
  if (!career.length || career.some((e) => !e.to)) return null;
  const [y, m] = career
    .map((e) => e.to as string)
    .sort()
    [career.length - 1].split('-')
    .map(Number);
  const open = new Date(y, m, 1); // the first of the month after it ends (m is 1-based)
  return open <= now ? 'now' : `from ${formatDate(`${open.getFullYear()}-${String(open.getMonth() + 1).padStart(2, '0')}`)}`;
}

export function Contact() {
  const c = site.contact;
  const open = openFrom();
  return (
    <section id="contact" className="section section--instrument">
      <div className="container">
        <div className="contact">
          <ContactMotif />
          <SectionHead id="contact" title={c.title} lead={c.lead} align="center" />
          {open && (
            <p className="contact__open">
              <i aria-hidden="true" />
              Commissions open {open}
            </p>
          )}
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
