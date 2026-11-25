import { useEffect, useRef, useState, type FormEvent } from 'react';
import { site } from '../../content';
import { asset } from '../../lib/asset';
import { bookOpen, LINE_MAX, LINE_MIN, NAME_MAX, readBook, signBook, type BookLine, type BookRefusal } from '../../lib/book';
import { remember, remembered } from '../../lib/page';
import { useTicketNo } from '../../lib/visit';
import { ContactMotif } from './ContactMotif';
import { SectionHead } from '../shell/SectionHead';

/* The finale. The title, the email (the page's one call to action) and the
   links, on the centre line; under them, the floor of the exhibition's last
   room: the visitors' book on the left and exhibit 11's empty pedestal on the
   right (drawn by ContactMotif, which also sends the ripples through the dots).

   The visitors' book is public (lib/book.ts): a line, a name if you like, and
   the lines others left. A new line waits until I've read it; whoever wrote it
   sees it at once, marked as waiting. Whatever line is being written, or
   pointed at, takes shape on the pedestal.

   With no project behind it (book.ts: `bookOpen`), there's no book to keep
   lines in, and the line goes to me as an email instead.

   How the book is laid out is still being chosen between (LAYOUTS). */

/** The ways the book can be laid out:
 *    list      everything on the page: a few sentences, the form, the lines
 *    fold      a closed book: one line saying it's there and how much is in
 *              it; pointing at it shows the newest line, pressing it opens it
 *    pedestal  only a line to write on; what others wrote is read off the
 *              pedestal, one line at a time, while it's pointed at
 *    line      one row: the line to write on, with what others wrote passing
 *              through it as its placeholder, and the rest behind a count */
type Layout = 'list' | 'fold' | 'pedestal' | 'line';
/** The one that ships. In `npm run dev` a row of chips over the book switches
 *  between them (remembered), to compare; once one is chosen the others go. */
const LAYOUT: Layout = 'fold';
const LAYOUTS: [Layout, string][] = [
  ['list', 'A · List'],
  ['fold', 'B · Closed book'],
  ['pedestal', 'C · On the pedestal'],
  ['line', 'D · One line'],
];
const LAYOUT_KEY = 'mk-book-layout';

const SHORT = 3; // lines shown before "All of them", in the list
const PACE = { read: 4200, ghost: 5200 }; // ms a line stays, on the pedestal and in the placeholder

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
  const [layout, setLayout] = useState<Layout>(() => {
    const kept = import.meta.env.DEV ? remembered(LAYOUT_KEY) : null;
    return LAYOUTS.some(([id]) => id === kept) ? (kept as Layout) : LAYOUT;
  });
  const [line, setLine] = useState('');
  const [name, setName] = useState('');
  const [sent, setSent] = useState(0);
  const [book, setBook] = useState<BookLine[] | null | undefined>(undefined); // undefined: not opened yet; null: won't open
  const [status, setStatus] = useState<'idle' | 'signing' | 'thanks' | BookRefusal>('idle');
  const [peek, setPeek] = useState(''); // a line that's pointed at
  const [kept, setKept] = useState(''); // the line just written, left on the pedestal
  const [all, setAll] = useState(false); // every line shown (list, line)
  const [open, setOpen] = useState(false); // the closed book, opened (fold)
  const [reading, setReading] = useState(false); // the pedestal is being read from (pedestal)
  const [at, setAt] = useState(0); // which line it's on
  const [focused, setFocused] = useState(false); // the line to write on has the caret (line)
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

  const lines = book ?? [];
  const typing = line.trim().length > 0;
  // a line at a time: on the pedestal while it's pointed at, or through the
  // placeholder while nobody's writing
  const turning = lines.length > 1 && ((layout === 'pedestal' && reading) || (layout === 'line' && !focused && !typing));
  useEffect(() => {
    if (!turning) return;
    const t = window.setInterval(() => setAt((a) => a + 1), layout === 'pedestal' ? PACE.read : PACE.ghost);
    return () => window.clearInterval(t);
  }, [turning, layout]);
  const current = lines.length ? lines[at % lines.length] : null;

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
    setAt(0);
    setKept(written.line);
    setLine('');
    setSent((n) => n + 1);
    setStatus('thanks');
  };

  // what's on the pedestal: the line being written, else one that's pointed at
  // or passing, else the one just signed
  const passing = (layout === 'pedestal' && reading) || (layout === 'line' && !focused) ? (current?.line ?? '') : '';
  const onPedestal = line || peek || passing || kept;

  const answered = status !== 'idle' && status !== 'signing';
  const note = !bookOpen
    ? 'The book is closed for now, so this goes to me as an email.'
    : status === 'thanks'
      ? 'Thank you. It’s waiting for me to read it, and then it’s in the book for good.'
      : answered
        ? REFUSAL[status as BookRefusal]
        : 'I read every line before it goes in, so it can take a day to show up.';
  const count =
    book === undefined ? '' : book === null ? 'won’t open just now' : lines.length === 0 ? 'nothing in it yet' : `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`;

  // ---- the book's parts, shared by the layouts ----
  const label = <h3 className="contact__book-label">Visitors’ book</h3>;
  const intro = (
    <p className="contact__book-intro">
      Every exhibition ends with a book you’re not sure you’re allowed to write in. In this one you are. Tell me what you made of it, or what you think
      exhibit 11 should be.
    </p>
  );
  const field = (placeholder: string) => (
    <input
      className="contact__book-line"
      id="visitors-book-line"
      ref={inputRef}
      type="text"
      value={line}
      onChange={(e) => {
        setLine(e.target.value);
        setKept('');
        if (answered) setStatus('idle');
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      maxLength={LINE_MAX}
      placeholder={placeholder}
      aria-label="Your line in the visitors’ book"
      autoComplete="off"
      enterKeyHint="send"
      aria-describedby="visitors-book-note"
    />
  );
  const rest = (
    <div className="contact__book-row contact__book-rest">
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
  );
  const noteLine = (
    <p className="contact__book-note" id="visitors-book-note" role="status" data-kind={status === 'thanks' ? 'thanks' : answered ? 'refusal' : undefined}>
      {note}
    </p>
  );
  const entry = (l: BookLine) => (
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
  );
  const nobody = <p className="contact__book-empty">{book === null ? 'The book won’t open just now.' : 'Nobody has written in it yet. Someone has to go first.'}</p>;
  /** The lines as a list: a few, and the rest behind "All of them". */
  const list = bookOpen && book !== undefined && (
    <>
      {lines.length === 0 ? (
        nobody
      ) : (
        <ol className="contact__entries" data-all={all || undefined}>
          {(all ? lines : lines.slice(0, SHORT)).map(entry)}
        </ol>
      )}
      {lines.length > SHORT && (
        <button className="contact__book-more" type="button" onClick={() => setAll((a) => !a)} aria-expanded={all}>
          {all ? 'Fewer' : `All ${lines.length} lines`}
        </button>
      )}
    </>
  );
  // the name and the button only once there's a line to sign (the minimal layouts)
  const busy = typing || answered || status === 'signing' || undefined;

  const theBook = {
    list: () => (
      <div className="contact__book">
        {label}
        {intro}
        <form className="contact__book-form" onSubmit={sign}>
          {field('Write a line')}
          {rest}
          {noteLine}
        </form>
        {list}
      </div>
    ),
    // closed until it's opened: what it is, how much is in it, and on a hover its newest line
    fold: () => {
      const newest = lines[0];
      return (
        <div className="contact__book" data-open={open || undefined}>
          <button
            type="button"
            className="contact__book-tab"
            aria-expanded={open}
            aria-controls="visitors-book-body"
            onClick={() => setOpen((o) => !o)}
            onMouseEnter={() => !open && newest && setPeek(newest.line)}
            onMouseLeave={() => setPeek('')}
          >
            <span className="contact__book-label">Visitors’ book</span>
            {count && <span className="contact__book-count">{count}</span>}
            <span className="contact__book-turn" aria-hidden="true">
              {open ? 'Close' : 'Open'}
            </span>
          </button>
          {!open && (
            <p className="contact__book-newest" aria-hidden="true">
              {newest ? (
                <>
                  <q>{newest.line}</q> <span className="contact__entry-by">{signature(newest)}</span>
                </>
              ) : (
                'Write the first line in it.'
              )}
            </p>
          )}
          {open && (
            <div className="contact__book-body" id="visitors-book-body">
              {intro}
              <form className="contact__book-form" onSubmit={sign}>
                {field('Write a line')}
                {rest}
                {noteLine}
              </form>
              {list}
            </div>
          )}
        </div>
      );
    },
    // only a line to write on; what others wrote is read off the pedestal
    pedestal: () => (
      <div className="contact__book">
        {label}
        <form className="contact__book-form" onSubmit={sign} data-busy={busy}>
          {field('Write a line in the visitors’ book')}
          {rest}
          {noteLine}
        </form>
      </div>
    ),
    // one row: the line to write on, with what others wrote passing through it
    line: () => (
      <div className="contact__book">
        <form className="contact__book-form" onSubmit={sign} data-busy={busy}>
          <div className="contact__book-row">
            <label className="contact__book-label" htmlFor="visitors-book-line">
              Visitors’ book
            </label>
            {field(!focused && current ? `“${current.line}”` : 'Write a line')}
            {lines.length > 0 && (
              <div className="contact__book-all" data-open={all || undefined}>
                <button className="contact__book-more" type="button" onClick={() => setAll((a) => !a)} aria-expanded={all}>
                  {count}
                </button>
                <ol className="contact__entries">{lines.map(entry)}</ol>
              </div>
            )}
          </div>
          {rest}
          {noteLine}
        </form>
      </div>
    ),
  }[layout];

  const readable = layout === 'pedestal' && lines.length > 0;
  return (
    <section id="contact" className="section section--instrument">
      {/* remounted with the layout: it finds its marks in the page once */}
      <ContactMotif key={layout} line={onPedestal} sent={sent} />
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
          {import.meta.env.DEV && (
            <div className="contact__layouts" role="group" aria-label="The book’s layout (only in dev)">
              <span>Layout</span>
              {LAYOUTS.map(([id, text]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={layout === id}
                  onClick={() => {
                    setLayout(id);
                    remember(LAYOUT_KEY, id);
                    setAll(false);
                    setPeek('');
                    setReading(false);
                  }}
                >
                  {text}
                </button>
              ))}
            </div>
          )}
          <div className="contact__floor" ref={floorRef} data-layout={layout}>
            {theBook()}
            <div
              className="contact__pedestal"
              data-reading={(readable && reading) || undefined}
              onMouseEnter={readable ? () => setReading(true) : undefined}
              onMouseLeave={
                readable
                  ? () => {
                      setReading(false);
                      setAt((a) => a + 1); // the next one, next time
                    }
                  : undefined
              }
            >
              <div className="contact__label">
                {readable && reading && current ? (
                  <figure>
                    <blockquote>{current.line}</blockquote>
                    <figcaption>{signature(current)}</figcaption>
                    <span>
                      {(at % lines.length) + 1} of {lines.length}
                    </span>
                  </figure>
                ) : (
                  <dl>
                    <dt>Exhibit 11</dt>
                    <dd>Your project</dd>
                    <dd>Materials to be decided</dd>
                    {readable && (
                      <dd className="contact__label-hint">
                        {count} in the book · read them here
                      </dd>
                    )}
                  </dl>
                )}
              </div>
              {/* the pedestal and the space over it are drawn here (ContactMotif);
                  where the book is read off it, it's also the way to the next line */}
              {readable ? (
                <button
                  type="button"
                  className="contact__stage"
                  aria-label="Read the next line in the visitors’ book"
                  onClick={() => (reading ? setAt((a) => a + 1) : setReading(true))}
                  onFocus={() => setReading(true)}
                  onBlur={() => setReading(false)}
                />
              ) : (
                <div className="contact__stage" aria-hidden="true" />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
