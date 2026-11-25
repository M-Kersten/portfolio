import { useRef, useState, type FormEvent } from 'react';
import { site } from '../../content';
import { asset } from '../../lib/asset';
import { ContactMotif } from './ContactMotif';
import { SectionHead } from '../shell/SectionHead';

/* The finale. The title, the email (the page's one call to action) and the
   links, on the centre line; under them, the floor of the exhibition's last
   room: the visitors' book on the left and exhibit 11's empty plinth on the
   right (drawn by ContactMotif, which also sends the ripples through the dots).

   The visitors' book is one line, and it isn't kept anywhere: sending it opens
   an email to me with the line in it. As it's written it takes shape on the
   plinth. */
export function Contact() {
  const c = site.contact;
  const [line, setLine] = useState('');
  const [sent, setSent] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = line.trim();
    if (!text) {
      inputRef.current?.focus();
      return;
    }
    setSent((n) => n + 1);
    window.location.href = `mailto:${c.email}?subject=${encodeURIComponent('Exhibit 11')}&body=${encodeURIComponent(text)}`;
  };

  return (
    <section id="contact" className="section section--instrument">
      <ContactMotif line={line} sent={sent} />
      <div className="container">
        <div className="contact">
          <SectionHead id="contact" title={c.title} lead={c.lead} align="center" />
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
          <div className="contact__floor">
            <form className="contact__book" onSubmit={send}>
              <label className="contact__book-label" htmlFor="visitors-book">
                Visitors’ book
              </label>
              <div className="contact__book-row">
                <input
                  id="visitors-book"
                  ref={inputRef}
                  type="text"
                  value={line}
                  onChange={(e) => setLine(e.target.value)}
                  maxLength={140}
                  placeholder="What should stand on the plinth?"
                  autoComplete="off"
                  enterKeyHint="send"
                  aria-describedby="visitors-book-note"
                />
                <button className="btn btn--ghost" type="submit">
                  Send it <span aria-hidden="true">→</span>
                </button>
              </div>
              <p className="contact__book-note" id="visitors-book-note">
                Sending opens an email to me with your line in it.
              </p>
            </form>
            <div className="contact__plinth">
              <dl className="contact__label">
                <dt>Exhibit 11</dt>
                <dd>Your project</dd>
                <dd>Materials to be decided</dd>
              </dl>
              {/* the plinth and the space over it are drawn here (ContactMotif) */}
              <div className="contact__stage" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
