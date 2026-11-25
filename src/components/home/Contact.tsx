import { useEffect, useRef, useState, type FormEvent } from 'react';
import { site } from '../../content';
import { asset } from '../../lib/asset';
import { bookOpen, LINE_MAX, LINE_MIN, NAME_MAX, readBook, signBook, type BookLine, type BookRefusal } from '../../lib/book';
import { useTicketNo } from '../../lib/visit';
import { ContactMotif } from './ContactMotif';
import { SectionHead } from '../shell/SectionHead';

/* The finale. The title, the email (the page's one call to action) and the
   links, on the centre line; under them, the floor of the exhibition's last
   room: the visitors' book on the left and exhibit 11's empty plinth on the
   right (drawn by ContactMotif, which also sends the ripples through the dots).

   The visitors' book is public (lib/book.ts): a line, a name if you like, and
   the lines others left. A new line waits until I've read it; whoever wrote it
   sees it at once, marked as waiting. Whatever line is being written, or
   pointed at, takes shape on the plinth.

   With no project behind it (book.ts: `bookOpen`), there's no book to keep
   lines in, and the line goes to me as an email instead. */

const SHORT = 3; // lines shown before "All of them"

/** Why a line didn't go in, said the way I'd say it. */
const REFUSAL: Record<BookRefusal, string> = {
  length: `Somewhere between ${LINE_MIN} characters and ${LINE_MAX}, please.`,
  links: 'No links in the book, please. Just words.',
  busy: 'The book is busy just now. Try again in a little while.',
  down: 'The book won’t open just now. An email reaches me too.',
};

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const ticketNo = (n: number) => `visitor no. ${String(n).padStart(4, '0')}`;
/** How a line is signed: the name, the ticket, both, or neither. */
function signature(l: BookLine) {
  const who = l.name ? (l.ticket ? `${l.name} · ${ticketNo(l.ticket)}` : l.name) : l.ticket ? ticketNo(l.ticket).replace(/^v/, 'V') : 'A visitor';
  return `${who} · ${day(l.at)}`;
}

export function Contact() {
  const c = site.contact;
  const ticket = useTicketNo();
  const [line, setLine] = useState('');
  const [name, setName] = useState('');
  const [sent, setSent] = useState(0);
  const [book, setBook] = useState<BookLine[] | null | undefined>(undefined); // undefined: not opened yet; null: won't open
  const [status, setStatus] = useState<'idle' | 'signing' | 'thanks' | BookRefusal>('idle');
  const [peek, setPeek] = useState(''); // a line that's pointed at
  const [kept, setKept] = useState(''); // the line just written, left on the plinth
  const [all, setAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const floorRef = useRef<HTMLDivElement>(null);

  // open the book as the floor comes near, not for every visit to the page
  useEffect(() => {
    const el = floorRef.current;
    if (!el || !bookOpen) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        void readBook().then(setBook);
      },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const sign = async (e: FormEvent) => {
    e.preventDefault();
    const text = line.trim();
    if (text.length < LINE_MIN) {
      inputRef.current?.focus();
      if (text) setStatus('length');
      return;
    }
    if (!bookOpen) {
      // no book to keep it in: it goes to me as an email
      setSent((n) => n + 1);
      window.location.href = `mailto:${c.email}?subject=${encodeURIComponent('Exhibit 11')}&body=${encodeURIComponent(name.trim() ? `${text}\n\n${name.trim()}` : text)}`;
      return;
    }
    setStatus('signing');
    const written = await signBook(text, name, ticket);
    if (typeof written === 'string') {
      setStatus(written);
      return;
    }
    setBook((b) => [written, ...(b ?? [])]);
    setKept(written.line);
    setLine('');
    setSent((n) => n + 1);
    setStatus('thanks');
  };

  const lines = book ?? [];
  const shown = all ? lines : lines.slice(0, SHORT);
  const note = !bookOpen
    ? 'The book is closed for now, so this goes to me as an email.'
    : status === 'thanks'
      ? 'Thank you. It’s waiting for me to read it, and then it’s in the book for good.'
      : status === 'signing' || status === 'idle'
        ? 'I read every line before it goes in, so it can take a day to show up.'
        : REFUSAL[status];

  return (
    <section id="contact" className="section section--instrument">
      <ContactMotif line={line || peek || kept} sent={sent} />
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
          <div className="contact__floor" ref={floorRef}>
            <div className="contact__book">
              <h3 className="contact__book-label">Visitors’ book</h3>
              <p className="contact__book-intro">
                Every exhibition ends with a book you’re not sure you’re allowed to write in. In this one you are. Tell me what you made of it, or what you
                think belongs on that plinth.
              </p>
              <form className="contact__book-form" onSubmit={sign}>
                <input
                  className="contact__book-line"
                  ref={inputRef}
                  type="text"
                  value={line}
                  onChange={(e) => {
                    setLine(e.target.value);
                    setKept('');
                    if (status !== 'idle' && status !== 'signing') setStatus('idle');
                  }}
                  maxLength={LINE_MAX}
                  placeholder="Write a line"
                  aria-label="Your line in the visitors’ book"
                  autoComplete="off"
                  enterKeyHint="send"
                  aria-describedby="visitors-book-note"
                />
                <div className="contact__book-row">
                  <input
                    className="contact__book-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={NAME_MAX}
                    placeholder="Your name, if you like"
                    aria-label="Your name (optional)"
                    autoComplete="name"
                  />
                  <button className="btn btn--ghost" type="submit" disabled={status === 'signing'}>
                    {bookOpen ? 'Sign the book' : 'Send it'} <span aria-hidden="true">→</span>
                  </button>
                </div>
                <p className="contact__book-note" id="visitors-book-note" role="status" data-kind={status === 'thanks' ? 'thanks' : status in REFUSAL ? 'refusal' : undefined}>
                  {note}
                </p>
              </form>
              {bookOpen && book !== undefined && (
                <>
                  {lines.length === 0 ? (
                    <p className="contact__book-empty">{book === null ? 'The book won’t open just now.' : 'Nobody has written in it yet. Someone has to go first.'}</p>
                  ) : (
                    <ol className="contact__entries" data-all={all || undefined}>
                      {shown.map((l) => (
                        <li
                          key={l.id}
                          className="contact__entry"
                          data-waiting={l.waiting || undefined}
                          onMouseEnter={() => setPeek(l.line)}
                          onMouseLeave={() => setPeek((p) => (p === l.line ? '' : p))}
                        >
                          <q>{l.line}</q>
                          <span className="contact__entry-by">
                            {signature(l)}
                            {l.waiting && <em> · waiting to be read</em>}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {lines.length > SHORT && (
                    <button className="contact__book-more" type="button" onClick={() => setAll((a) => !a)} aria-expanded={all}>
                      {all ? 'Fewer' : `All ${lines.length} lines`}
                    </button>
                  )}
                </>
              )}
            </div>
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
