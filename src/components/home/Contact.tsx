import { useEffect, useRef, useState, type FormEvent } from 'react';
import { site } from '../../content';
import { asset } from '../../lib/asset';
import { bookOpen, LINE_MAX, LINE_MIN, NAME_MAX, readBook, signBook, type BookLine, type BookRefusal } from '../../lib/book';
import { useTicketNo } from '../../lib/visit';
import { ContactMotif } from './ContactMotif';
import { SectionHead } from '../shell/SectionHead';

/* The finale. The title, the email (the page's one call to action) and the
   links, on the centre line; under them, the floor of the exhibition's last
   room: a question on the left, "What do we build next?", and exhibit 11's
   empty pedestal on the right (drawn by ContactMotif, which also sends the
   ripples through the dots).

   Over the pedestal a handful of dots float about. A suggestion gives them a
   shape, its own: the one being typed (the shape changes with every letter),
   or an earlier one, while you scroll through what's been suggested so far.
   Leave them alone and they drift again.

   The suggestions are public and kept in the visitors' book (lib/book.ts): a
   line, and a name if you like. A new one waits until I've read it; whoever
   wrote it sees it at once, marked as waiting.

   With no project behind it (book.ts: `bookOpen`), there's nowhere to keep
   them, and the line goes to me as an email instead. */

/** What the line to write on suggests while it's empty, one after another. */
const EXAMPLES = [
  'An AR treasure hunt through Utrecht',
  'A museum guide you can argue with',
  'A plant that tells you when it’s thirsty',
  'A VR choir where nobody hears you sing badly',
  'Something with dinosaurs',
  'A game about bread',
];
const EXAMPLE_MS = 3200;

const HOLD = { browse: 3200, sent: 7000 }; // ms a shape stays: after the last look at the earlier ones, and after sending one

/** Why a suggestion didn't go in, said the way I'd say it. */
const REFUSAL: Record<BookRefusal, string> = {
  length: `Somewhere between ${LINE_MIN} characters and ${LINE_MAX}, please.`,
  links: 'No links, please. Just words.',
  busy: 'It’s busy here just now. Try again in a little while.',
  down: 'This won’t open just now. An email reaches me too.',
};

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const ticketNo = (n: number) => `visitor no. ${String(n).padStart(4, '0')}`;
/** Who suggested it: the name, the ticket, both, or neither. */
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
  const [status, setStatus] = useState<'idle' | 'sending' | 'thanks' | BookRefusal>('idle');
  const [at, setAt] = useState(0); // which earlier suggestion is being looked at
  const [browsing, setBrowsing] = useState(false); // and whether one is
  const [kept, setKept] = useState(''); // the one just sent, left on the pedestal a while
  const inputRef = useRef<HTMLInputElement>(null);
  const floorRef = useRef<HTMLDivElement>(null);
  const reelRef = useRef<HTMLOListElement>(null);
  const timers = useRef({ browse: 0, kept: 0, inside: false });

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
  useEffect(
    () => () => {
      window.clearTimeout(timers.current.browse);
      window.clearTimeout(timers.current.kept);
    },
    [],
  );

  const lines = book ?? [];
  const typing = line.trim().length > 0;

  // the examples, in a loop, while there's nothing written
  const [example, setExample] = useState(0);
  useEffect(() => {
    if (typing) return;
    const t = window.setInterval(() => setExample((n) => (n + 1) % EXAMPLES.length), EXAMPLE_MS);
    return () => window.clearInterval(t);
  }, [typing]);

  /** The earlier suggestions are being looked at: the one in view keeps its
   *  shape for as long as they are, and a little after. */
  const look = () => {
    const tm = timers.current;
    setBrowsing(true);
    window.clearTimeout(tm.browse);
    if (!tm.inside) tm.browse = window.setTimeout(() => setBrowsing(false), HOLD.browse);
  };
  /** Scrolled: the one at the top of the reel is the one in view. */
  const onScroll = () => {
    const reel = reelRef.current;
    if (!reel) return;
    const top = reel.scrollTop;
    const rows = Array.from(reel.children) as HTMLElement[];
    const first = rows.findIndex((r) => r.offsetTop - reel.offsetTop + r.offsetHeight / 2 > top);
    setAt(first < 0 ? rows.length - 1 : first);
    look();
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = line.trim();
    if (text.length < LINE_MIN) {
      inputRef.current?.focus();
      if (text) setStatus('length');
      return;
    }
    if (!bookOpen) {
      // nowhere to keep it: it goes to me as an email
      setSent((n) => n + 1);
      window.location.href = `mailto:${c.email}?subject=${encodeURIComponent('What we build next')}&body=${encodeURIComponent(name.trim() ? `${text}\n\n${name.trim()}` : text)}`;
      return;
    }
    setStatus('sending');
    const written = await signBook(text, name, ticket);
    if (typeof written === 'string') {
      setStatus(written);
      return;
    }
    setBook((b) => [written, ...(b ?? [])]);
    setAt(0);
    reelRef.current?.scrollTo({ top: 0 });
    setLine('');
    setSent((n) => n + 1);
    setStatus('thanks');
    // its shape stays up a while, then the dots let go
    setKept(written.line);
    window.clearTimeout(timers.current.kept);
    timers.current.kept = window.setTimeout(() => setKept(''), HOLD.sent);
  };

  // what the dots are asked to be: the suggestion being typed, else an earlier
  // one that's being looked at, else the one just sent; else nothing (they drift)
  const onPedestal = line || (browsing ? (lines[at]?.line ?? '') : '') || kept;

  const answered = status !== 'idle' && status !== 'sending';
  const note = !bookOpen
    ? 'Suggestions are closed for now, so this goes to me as an email.'
    : status === 'thanks'
      ? 'Thank you. I’ll read it, and then it joins the others.'
      : answered
        ? REFUSAL[status as BookRefusal]
        : 'I read every suggestion before it shows here, so it can take a day.';

  return (
    <section id="contact" className="section section--instrument">
      <ContactMotif line={onPedestal} sent={sent} />
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
            <div className="contact__ask">
              <h3 className="contact__ask-title">What do we build next?</h3>
            </div>
            <div className="contact__pedestal">
              <dl className="contact__label">
                <dt>Exhibit 11</dt>
                <dd>Your project</dd>
              </dl>
              {/* the pedestal, and the dots over it, are drawn here (ContactMotif) */}
              <div className="contact__stage" aria-hidden="true" />
            </div>
            <div className="contact__book">
              <form className="contact__book-form" onSubmit={send} data-busy={typing || answered || status === 'sending' || undefined}>
                <input
                  className="contact__book-line"
                  ref={inputRef}
                  type="text"
                  value={line}
                  onChange={(e) => {
                    setLine(e.target.value);
                    setKept('');
                    if (answered) setStatus('idle');
                  }}
                  maxLength={LINE_MAX}
                  placeholder={`${EXAMPLES[example]}…`}
                  aria-label="Your suggestion for what we build next"
                  autoComplete="off"
                  enterKeyHint="send"
                  aria-describedby="suggest-note"
                />
                <div className="contact__book-rest">
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
                    <button className="btn btn--ghost" type="submit" disabled={status === 'sending'}>
                      {bookOpen ? 'Suggest it' : 'Send it'} <span aria-hidden="true">→</span>
                    </button>
                  </div>
                  <p className="contact__book-note" id="suggest-note" role="status" data-kind={status === 'thanks' ? 'thanks' : answered ? 'refusal' : undefined}>
                    {note}
                  </p>
                </div>
              </form>
              {bookOpen && book !== undefined && (
                <div className="contact__earlier">
                  <h4 className="contact__book-label">
                    Suggested so far{lines.length > 0 && <span> · {lines.length}</span>}
                  </h4>
                  {lines.length === 0 ? (
                    <p className="contact__book-empty">{book === null ? 'They won’t load just now.' : 'Nothing yet. Somebody has to go first.'}</p>
                  ) : (
                    // a reel: scrolled through, the one at the top is the one in
                    // view (and on the pedestal); pointing at one picks it
                    <ol
                      className="contact__reel"
                      ref={reelRef}
                      tabIndex={0}
                      aria-label="Suggestions so far"
                      onScroll={onScroll}
                      onPointerEnter={(e) => {
                        if (e.pointerType !== 'mouse') return;
                        timers.current.inside = true;
                        look();
                      }}
                      onPointerLeave={() => {
                        timers.current.inside = false;
                        look();
                      }}
                      onFocus={look}
                    >
                      {lines.map((l, i) => (
                        <li
                          key={l.id}
                          className="contact__entry"
                          data-current={(browsing && i === at) || undefined}
                          data-waiting={l.waiting || undefined}
                          onMouseEnter={() => {
                            setAt(i);
                            look();
                          }}
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
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
