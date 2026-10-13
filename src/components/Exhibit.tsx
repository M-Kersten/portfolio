import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { caseWhen, roleFor, site, type CaseStudy } from '../content';
import { EXHIBIT_COUNT, exhibitNo, loopFor, pad2, seeAlso, splitHook, walkFrom } from '../content/exhibits';
import { asset } from '../lib/asset';
import { caseOrigin } from '../lib/caseOrigin';
import { EASE, MOTION } from '../lib/motion';
import { play } from '../lib/sound';
import { useFocusTrap } from '../lib/useFocusTrap';
import { useReducedMotion } from '../lib/useReducedMotion';
import { useSheetDrag } from '../lib/useSheetDrag';
import { youtubeEmbed } from '../lib/youtube';
import { Gallery, Lightbox } from './Gallery';
import { Scramble } from './Scramble';
import { VoiceNote } from './VoiceNote';

// A project, opened: its label, and the book the label unfolds into. The one
// view of a project everywhere: in the maquette (the label stands beside the
// porthole, a line running from the object to it) and on the timeline,
// /projects and search (pinned beside the card that was clicked, the same line
// from the card).
//
// The site is an exhibition of my work in miniature, so a project reads the way
// an exhibit does. The label is the glance: the film first, playing silently,
// then the number (01–10 for the ten in the model; the rest are "in the
// collection"), the title and what it achieved, who it was for and what it's
// made of, two sentences, the audio guide (my voice note), and the way on to
// the neighbouring exhibits. Pressing the film, or "Open the full entry",
// unfolds the label into the book: the label slides across to become the right
// page, word for word where it was, and its film grows out into the left page,
// now playing with sound. The full story continues under the label on the right.
// Esc folds the book back into the label, and a second Esc closes it.
//
// On a touch screen it's handled, not clicked: the label follows the finger
// sideways to the next exhibit, up into the book, down to put it away
// (lib/useSheetDrag).

type Place = 'maquette' | 'page';
/** Where the label rises from the bottom and the book fills the screen: phones,
 *  and tablets held upright (the porthole's own breakpoint, node-hud.css). */
const SHEET = '(max-width: 760px), (max-width: 1120px) and (orientation: portrait)';
const sheetLayout = () => window.matchMedia(SHEET).matches;
type Box = { left: number; top: number; width: number; height: number };
const box = (r: DOMRect): Box => ({ left: r.left, top: r.top, width: r.width, height: r.height });
type Dir = 1 | -1;
// The side the next label comes in from after a walk: it outlives the label
// that walked (in the maquette a walk is a route change, and remounts the lot).
let enterDir: Dir | 0 = 0;
const enterAttr = (d: Dir | 0) => (d === 1 ? 'right' : d === -1 ? 'left' : undefined);

/** Read a length custom property off :root as px (a % of the viewport's width
 *  or height, a vh / vw, or px). */
function rootPx(name: string, axis: 'x' | 'y'): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  if (raw.endsWith('%')) return (n / 100) * (axis === 'x' ? window.innerWidth : window.innerHeight);
  if (raw.endsWith('vh')) return (n / 100) * window.innerHeight;
  if (raw.endsWith('vw')) return (n / 100) * window.innerWidth;
  return n;
}

export function Exhibit({
  study,
  place,
  collection,
  onClose,
  onWalk,
  startInBook = false,
  onBookChange,
  closing = false,
}: {
  study: CaseStudy;
  place: Place;
  /** The walk order for a project in the collection (exhibits walk by number). */
  collection?: CaseStudy[];
  onClose: () => void;
  /** Step to another project; `book` says the book was open (it stays open). */
  onWalk: (slug: string, book: boolean) => void;
  /** Open straight onto the book (a link to the full entry). */
  startInBook?: boolean;
  onBookChange?: (open: boolean) => void;
  /** The maquette fades the label out before its route closes. */
  closing?: boolean;
}) {
  const reduced = useReducedMotion();
  const phone = sheetLayout();
  const [book, setBook] = useState(startInBook);
  // the film plays in the book only when it was pressed for (a deep link, or
  // "Open the full entry", shows the still with a play button: no YouTube until then)
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState<number | null>(null); // the gallery frame open full-size
  const rootRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLElement>(null);
  const filmRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // where the label was, and its film, the moment it unfolded (the book grows from them)
  const unfoldFrom = useRef<{ label: Box; film: Box } | null>(null);
  const { prev, next } = walkFrom(study, collection ?? []);
  // the card it was opened from, on a page: the label pins beside it
  const [origin] = useState(() => (place === 'page' ? caseOrigin(study.slug) : null));
  const walked = useRef(false); // stepped on from where it opened: no longer pinned to that card

  useFocusTrap(rootRef, frame === null);
  // focus goes into the label as it opens, into the book as it unfolds, and
  // into the next label after a walk
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, [study.slug, book]);
  useEffect(() => {
    play('popup-open', { volume: 0.8 });
    return () => play('popup-close', { volume: 0.8 });
  }, []);
  // a page holds still behind it (the maquette's route does its own)
  useLayoutEffect(() => {
    if (place !== 'page') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [place]);

  const openBook = useCallback(
    (play: boolean) => {
      const l = labelRef.current?.getBoundingClientRect();
      const f = filmRef.current?.getBoundingClientRect();
      unfoldFrom.current = l && f ? { label: box(l), film: box(f) } : null;
      setPlaying(play);
      setBook(true);
      onBookChange?.(true);
    },
    [onBookChange],
  );
  const foldBook = useCallback(() => {
    setFrame(null);
    setBook(false);
    onBookChange?.(false);
  }, [onBookChange]);
  const walk = useCallback(
    (slug: string) => {
      walked.current = true;
      enterDir = slug === next?.slug ? 1 : slug === prev?.slug ? -1 : 0;
      unfoldFrom.current = null;
      setFrame(null);
      setPlaying(false);
      onWalk(slug, book);
    },
    [onWalk, book, next, prev],
  );
  const step = useCallback(
    (dir: Dir) => {
      const to = dir === 1 ? next : prev;
      if (to) walk(to.slug);
    },
    [walk, next, prev],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (frame !== null) setFrame(null);
        else if (book) foldBook();
        else onClose();
        return;
      }
      if (frame !== null || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const to = e.key === 'ArrowLeft' ? prev : e.key === 'ArrowRight' ? next : undefined;
      if (!to) return;
      e.preventDefault();
      walk(to.slug);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [frame, book, foldBook, onClose, prev, next, walk]);

  const pinned = place === 'page' && origin && !walked.current && !phone ? origin : null;

  return createPortal(
    <div
      ref={rootRef}
      className="exhibit"
      data-place={place}
      data-layer={study.layer}
      data-book={book || undefined}
      data-closing={closing || undefined}
    >
      {/* a page dims behind; a click there closes (or folds the book) */}
      <div className="exhibit__dim" onClick={book ? foldBook : onClose} aria-hidden="true" />
      {!book && (
        <Label
          key={study.slug}
          study={study}
          place={place}
          pinned={pinned}
          labelRef={labelRef}
          filmRef={filmRef}
          closeRef={closeRef}
          prev={prev}
          next={next}
          reduced={reduced}
          onOpen={openBook}
          onClose={onClose}
          onWalk={walk}
          onStep={step}
        />
      )}
      {book && (
        <Book
          key={study.slug}
          study={study}
          from={unfoldFrom.current}
          playing={playing}
          onPlay={() => setPlaying(true)}
          closeRef={closeRef}
          prev={prev}
          next={next}
          reduced={reduced}
          onFold={foldBook}
          onClose={onClose}
          onWalk={walk}
          onStep={step}
          drag={frame === null}
          onFrame={setFrame}
        />
      )}
      {frame !== null && (study.gallery?.length ?? 0) > 0 && (
        <Lightbox
          slug={study.slug}
          images={study.gallery!}
          index={frame}
          onStep={(d) => setFrame((i) => (i === null ? i : (i + d + study.gallery!.length) % study.gallery!.length))}
          onClose={() => setFrame(null)}
        />
      )}
    </div>,
    document.body,
  );
}

/* ---------- the label's parts, shared with the book's right page ---------- */

function ExhibitNo({ study }: { study: CaseStudy }) {
  const no = exhibitNo(study.slug);
  return no !== null ? (
    <span className="xl__no">
      <b>{pad2(no)}</b> of {EXHIBIT_COUNT} in the model
    </span>
  ) : (
    <span className="xl__no xl__no--collection">In the collection</span>
  );
}

function Head({ study, closeRef, onClose, decode }: { study: CaseStudy; closeRef: React.RefObject<HTMLButtonElement>; onClose: () => void; decode?: number }) {
  const no = exhibitNo(study.slug);
  const year = study.year?.slice(0, 4);
  const role = roleFor(study);
  const second = [study.sector, role].filter(Boolean).join(' · ');
  return (
    <>
      <div className="xl__top">
        <ExhibitNo study={study} />
        <button ref={closeRef} type="button" className="xl__close" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <h2 className="xl__title">{decode !== undefined ? <Scramble text={study.title} delay={decode} wrap /> : study.title}</h2>
      <p className="xl__outcome">{study.outcome}</p>
      <p className="xl__meta">{[study.client, year].filter(Boolean).join(', ')}</p>
      {(study.tech?.length || second) && (
        <p className="xl__materials">
          {study.tech?.join(' · ')}
          {study.tech?.length && second ? <br /> : null}
          {second}
        </p>
      )}
      <VoiceNote key={`voice-${study.slug}`} slug={study.slug} title={study.title} no={no !== null ? pad2(no) : undefined} label="Audio guide · in my own words" />
    </>
  );
}

function Walk({ prev, next, onWalk }: { prev?: CaseStudy; next?: CaseStudy; onWalk: (slug: string) => void }) {
  if (!prev && !next) return null;
  const tag = (c: CaseStudy) => {
    const no = exhibitNo(c.slug);
    return no !== null ? `${pad2(no)} ${c.title}` : c.title;
  };
  return (
    <nav className="xl__walk" aria-label="Neighbouring exhibits">
      {prev ? (
        <button type="button" onClick={() => onWalk(prev.slug)} aria-keyshortcuts="ArrowLeft">
          <span aria-hidden="true">← </span>
          {tag(prev)}
        </button>
      ) : (
        <span />
      )}
      {next && (
        <button type="button" onClick={() => onWalk(next.slug)} aria-keyshortcuts="ArrowRight">
          {tag(next)}
          <span aria-hidden="true"> →</span>
        </button>
      )}
    </nav>
  );
}

const Frame = () => (
  <span className="xl__frame" aria-hidden="true">
    <i />
    <i />
    <i />
    <i />
  </span>
);

/* ---------- the label ---------- */

function Label({
  study,
  place,
  pinned,
  labelRef,
  filmRef,
  closeRef,
  prev,
  next,
  reduced,
  onOpen,
  onClose,
  onWalk,
  onStep,
}: {
  study: CaseStudy;
  place: Place;
  pinned: DOMRect | null;
  labelRef: React.RefObject<HTMLElement>;
  filmRef: React.RefObject<HTMLDivElement>;
  closeRef: React.RefObject<HTMLButtonElement>;
  prev?: CaseStudy;
  next?: CaseStudy;
  reduced: boolean;
  onOpen: (play: boolean) => void;
  onClose: () => void;
  onWalk: (slug: string) => void;
  onStep: (dir: Dir) => void;
}) {
  const loop = loopFor(study.slug);
  const embed = youtubeEmbed(study.video);
  const [imgOk, setImgOk] = useState(true);
  const [pos, setPos] = useState<CSSProperties | undefined>(undefined);
  const [line, setLine] = useState<string | null>(null);
  const [mark, setMark] = useState<{ x: number; y: number } | null>(null);
  // two lines of curator's note: the problem, in its first sentence (the book has the rest)
  const curator = splitHook(study.problem)[0];
  const [enter] = useState(enterDir);
  useEffect(() => {
    enterDir = 0;
  }, []);
  const sheet = sheetLayout();
  useSheetDrag(labelRef, {
    enabled: true,
    canWalk: (d) => Boolean(d === 1 ? next : prev),
    onWalk: onStep,
    onUp: sheet ? () => onOpen(false) : undefined,
    onDown: sheet ? onClose : undefined,
    grab: '.xl__film',
  });

  // Where it stands, and the line that connects it: from the object in the
  // porthole (the maquette), or from the card it was opened from (a page).
  useLayoutEffect(() => {
    const el = labelRef.current;
    if (!el) return;
    const place_ = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const r = el.getBoundingClientRect();
      if (sheetLayout()) {
        setPos(undefined);
        if (place === 'maquette') {
          const x = rootPx('--fr-cx', 'x');
          const y = rootPx('--fr-cy', 'y');
          const top = el.getBoundingClientRect().top;
          setMark({ x, y });
          setLine(`${x},${y} ${x},${top}`);
        } else {
          setMark(null);
          setLine(null);
        }
        return;
      }
      if (pinned) {
        const gap = 56;
        const w = r.width;
        const right = pinned.right + gap + w < vw - 16;
        const left = right ? pinned.right + gap : Math.max(16, pinned.left - gap - w);
        const top = Math.min(Math.max(pinned.top + pinned.height / 2 - r.height / 2, 76), Math.max(76, vh - r.height - 16));
        setPos({ left, top, right: 'auto', transform: 'none' });
        const y = Math.min(Math.max(pinned.top + pinned.height / 2, top + 24), top + r.height - 24);
        const fromX = right ? pinned.right : pinned.left;
        const toX = right ? left : left + w;
        setMark({ x: fromX, y });
        setLine(`${fromX},${y} ${toX},${y}`);
        return;
      }
      setPos(undefined);
      if (place === 'maquette') {
        const x = rootPx('--fr-cx', 'x');
        const y = rootPx('--fr-cy', 'y');
        const film = filmRef.current?.getBoundingClientRect();
        const ty = film ? film.top + film.height / 2 : r.top + 60;
        setMark({ x, y });
        setLine(`${x},${y} ${r.left - 64},${ty} ${r.left},${ty}`);
      } else {
        setMark(null);
        setLine(null);
      }
    };
    place_();
    // once more after layout settles (fonts, the film's box)
    const raf = requestAnimationFrame(place_);
    window.addEventListener('resize', place_);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', place_);
    };
  }, [place, pinned, labelRef, filmRef]);

  return (
    <>
      {line && (
        <svg className="xl__line" aria-hidden="true">
          <polyline points={line} />
          {mark && (
            <>
              <rect className="xl__mark" x={mark.x - 5} y={mark.y - 5} width="10" height="10" />
              <rect className="xl__mark-dot" x={mark.x - 1.5} y={mark.y - 1.5} width="3" height="3" />
            </>
          )}
        </svg>
      )}
      <article ref={labelRef} className="xl" style={pos} data-enter={reduced ? undefined : enterAttr(enter)} role="dialog" aria-modal="true" aria-label={study.title}>
        <Frame />
        {sheet && <span className="xl__grip" aria-hidden="true" />}
        {/* the film first: a silent loop (or the poster, drifting), and the
            way into the book, where it plays with sound */}
        <div ref={filmRef} className="xl__film">
          {loop && !reduced ? (
            <video src={loop} poster={asset(`/posters/${study.slug}.jpg`)} muted autoPlay loop playsInline preload="metadata" aria-hidden="true" />
          ) : imgOk ? (
            <img src={asset(`/posters/${study.slug}.jpg`)} alt="" data-drift={reduced ? undefined : ''} onError={() => setImgOk(false)} />
          ) : (
            <span className="xl__ph" />
          )}
          <button type="button" className="xl__watch" onClick={() => onOpen(Boolean(embed))}>
            <span className="xl__watch-mark" aria-hidden="true">
              <svg viewBox="0 0 12 14">
                <path d="M1.5 1.2 11 7l-9.5 5.8z" />
              </svg>
            </span>
            {embed ? 'Watch the film' : 'Open the full entry'}
          </button>
        </div>
        <div className="xl__body">
          <Head study={study} closeRef={closeRef} onClose={onClose} decode={reduced ? undefined : MOTION.fast} />
          <p className="xl__curator">{curator}</p>
          <button type="button" className="xl__more" onClick={() => onOpen(false)}>
            Open the full entry <span aria-hidden="true">↗</span>
          </button>
          <Walk prev={prev} next={next} onWalk={onWalk} />
        </div>
      </article>
    </>
  );
}

/* ---------- the book ---------- */

function Book({
  study,
  from,
  playing,
  onPlay,
  closeRef,
  prev,
  next,
  reduced,
  onFold,
  onClose,
  onWalk,
  onStep,
  drag,
  onFrame,
}: {
  study: CaseStudy;
  from: { label: Box; film: Box } | null;
  playing: boolean;
  onPlay: () => void;
  closeRef: React.RefObject<HTMLButtonElement>;
  prev?: CaseStudy;
  next?: CaseStudy;
  reduced: boolean;
  onFold: () => void;
  onClose: () => void;
  onWalk: (slug: string) => void;
  onStep: (dir: Dir) => void;
  /** Off while a picture is open over it. */
  drag: boolean;
  onFrame: (i: number) => void;
}) {
  const embed = youtubeEmbed(study.video);
  const no = exhibitNo(study.slug);
  const year = study.year?.slice(0, 4);
  const role = roleFor(study);
  const when = caseWhen(study);
  const [imgOk, setImgOk] = useState(true);
  const [loaded, setLoaded] = useState(false); // the player, once it has drawn over the still
  const spreadRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const { buildsOn, ledTo } = seeAlso(study);
  const beats = (
    [
      ['The problem', study.problem],
      ['The approach', study.approach],
      ['The lesson', study.lesson],
    ] as [string, string | undefined][]
  ).filter((b): b is [string, string] => Boolean(b[1]));

  const [enter] = useState(enterDir);
  useEffect(() => {
    enterDir = 0;
  }, []);
  // on a phone the book is the whole screen: pulling it down from the top folds it back
  const sheet = sheetLayout();
  useSheetDrag(spreadRef, {
    enabled: drag,
    canWalk: (d) => Boolean(d === 1 ? next : prev),
    onWalk: onStep,
    onDown: sheet ? onFold : undefined,
    grab: '.xb__screen',
  });

  // The unfold: the right page starts where the label was and slides into
  // place; the film grows from the label's little film into the plate; the
  // spread itself fades up round them.
  useLayoutEffect(() => {
    const spread = spreadRef.current;
    const page = pageRef.current;
    const screen = screenRef.current;
    if (!spread || !page || !screen) return;
    if (reduced || !from) {
      spread.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.fast, easing: EASE });
      return;
    }
    const p = page.getBoundingClientRect();
    const s = screen.getBoundingClientRect();
    const d = MOTION.slow;
    const anims = [
      spread.animate([{ backgroundColor: 'transparent', borderColor: 'transparent', boxShadow: 'none' }, {}], { duration: d, easing: EASE }),
      page.animate([{ transform: `translate(${from.label.left - p.left}px, ${from.label.top - p.top}px)` }, { transform: 'none' }], { duration: d, easing: EASE }),
      screen.animate(
        [
          {
            transformOrigin: '0 0',
            transform: `translate(${from.film.left - s.left}px, ${from.film.top - s.top}px) scale(${from.film.width / s.width}, ${from.film.height / s.height})`,
          },
          { transformOrigin: '0 0', transform: 'none' },
        ],
        { duration: d, easing: EASE },
      ),
    ];
    // everything that wasn't on the label arrives after it
    spread.querySelectorAll<HTMLElement>('[data-after]').forEach((el) => anims.push(el.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { duration: d * 1.4, easing: EASE })));
    return () => anims.forEach((a) => a.cancel());
  }, [from, reduced]);

  return (
    <div ref={spreadRef} className="xb" data-enter={reduced || from ? undefined : enterAttr(enter)} role="dialog" aria-modal="true" aria-label={`${study.title}: the full entry`}>
      <div className="xb__left">
        <div className="xb__run" data-after="">
          <span>Work in miniature</span>
          <span>{no !== null ? `Plate ${pad2(no)}` : 'The collection'}</span>
        </div>
        <div ref={screenRef} className="xb__screen">
          {/* the still, under the player until it has loaded (and the whole
              plate for a project without a film) */}
          {imgOk ? <img src={asset(`/posters/${study.slug}.jpg`)} alt="" onError={() => setImgOk(false)} /> : <span className="xl__ph" />}
          {embed && playing && (
            // it plays: the visitor pressed the film to get here
            <iframe
              src={`${embed}&autoplay=1`}
              title={`${study.title}: film`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              data-loaded={loaded || undefined}
              onLoad={() => setLoaded(true)}
            />
          )}
          {embed && !playing && (
            <button type="button" className="xl__watch" onClick={onPlay}>
              <span className="xl__watch-mark" aria-hidden="true">
                <svg viewBox="0 0 12 14">
                  <path d="M1.5 1.2 11 7l-9.5 5.8z" />
                </svg>
              </span>
              Play the film
            </button>
          )}
        </div>
        <p className="xb__caption" data-after="">
          <b>{no !== null ? `Plate ${pad2(no)}.` : 'From the collection.'}</b> {study.title}
          {year ? `, ${year}` : ''}.
        </p>
        {(study.gallery?.length ?? 0) > 0 && (
          <div className="xb__gal" data-after="">
            <Gallery slug={study.slug} images={study.gallery!} onOpen={onFrame} />
          </div>
        )}
      </div>
      <div className="xb__right">
        <div ref={pageRef} className="xb__label">
          <Head study={study} closeRef={closeRef} onClose={onClose} />
        </div>
        <div className="xb__story" data-after="">
          {beats.map(([heading, text]) => (
            <p key={heading}>
              <b>{heading}.</b> {text}
            </p>
          ))}
        </div>
        {(buildsOn || ledTo.length > 0) && (
          <p className="xb__see" data-after="">
            <span className="xb__k">See also</span>
            {buildsOn && (
              <button type="button" onClick={() => onWalk(buildsOn.slug)}>
                {exhibitNo(buildsOn.slug) !== null ? `Exhibit ${pad2(exhibitNo(buildsOn.slug)!)}, ` : ''}
                {buildsOn.title}, which this builds on
              </button>
            )}
            {ledTo.map((c) => (
              <button key={c.slug} type="button" onClick={() => onWalk(c.slug)}>
                {exhibitNo(c.slug) !== null ? `Exhibit ${pad2(exhibitNo(c.slug)!)}, ` : ''}
                {c.title}, which it led to
              </button>
            ))}
          </p>
        )}
        <div className="xb__acts" data-after="">
          <a className="btn" href={`mailto:${site.contact.email}?subject=${encodeURIComponent(study.title)}`}>
            Ask me about it
          </a>
          {study.links?.map((link) => (
            <a key={link.url} className="btn btn--ghost" href={link.url} target="_blank" rel="noreferrer">
              {link.label} <span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
        <p className="xb__colophon" data-after="">
          {[study.client && `Client ${study.client}`, role && `Role ${role}`, when, study.sector].filter(Boolean).join(' · ')}
        </p>
        <div data-after="">
          <button type="button" className="xb__fold" onClick={onFold}>
            <span aria-hidden="true">↙</span> Fold back into the label
          </button>
          <Walk prev={prev} next={next} onWalk={onWalk} />
        </div>
      </div>
    </div>
  );
}
