import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { caseWhen, roleFor, site, type CaseStudy } from '../content';
import { EXHIBIT_COUNT, exhibitNo, loopFor, pad2, paragraphs, readingMinutes, seeAlso, splitHook, walkFrom } from '../content/exhibits';
import { filmCaption } from '../content/films';
import { asset } from '../lib/asset';
import { caseOrigin } from '../lib/caseOrigin';
import { EASE, MOTION } from '../lib/motion';
import { play } from '../lib/sound';
import { useFocusTrap } from '../lib/useFocusTrap';
import { useReducedMotion } from '../lib/useReducedMotion';
import { useSheetDrag } from '../lib/useSheetDrag';
import { youtubeEmbed } from '../lib/youtube';
import { clockLabel, useYouTubeClock, type FilmClock } from '../lib/youtubeClock';
import { useSceneSelector } from '../scene/store';
import { Gallery, Lightbox } from './Gallery';
import { Scramble } from './Scramble';
import { VoiceNote } from './VoiceNote';

// A project, opened. The site is an exhibition of my work in miniature, so a
// project reads the way an exhibit does: a label beside the object, and the
// book the label opens into.
//
// In the maquette, the label. The camera reaches the object first; then a line
// runs out from it and the label opens at the line's end, beside the porthole:
// the film at the top (a silent loop, or the poster drifting; "Watch the film"
// plays it right there, with sound), the number (01–10 in the model, or "in
// the collection"), the title and what it achieved, who it was for and what
// it's made of, one sentence of curator's note, the audio guide, and "Read the
// full story". Esc closes it; ← → walk the exhibits by number.
//
// The book is the full story, set as a spread. The label becomes its left page,
// the chapter opener: the number, the title, the standfirst, and the film
// (carrying on from where it was in the label) with a line under it on what
// you're looking at. The right page swings open from the spine with the facts
// and the story itself: the problem, the approach and the lesson, each under
// its own heading, set as a book sets text, then "See also" and the way to ask
// about it. Esc folds it back into the label.
//
// On a page (the timeline, /projects, search) the card that was clicked is the
// label already, so a project opens straight onto the book, its plate growing
// out of the card's picture; ← → walk from older to newer.
//
// On a touch screen it's handled, not clicked: the label follows the finger
// sideways to the next exhibit, up into the book, down to put it away; the book
// pulls down from its top (lib/useSheetDrag).

type Place = 'maquette' | 'page';
/** Where the label rises from the bottom and the book fills the screen: phones,
 *  and tablets held upright (the porthole's own breakpoint, node-hud.css). */
const SHEET = '(max-width: 760px), (max-width: 1120px) and (orientation: portrait)';
const sheetLayout = () => window.matchMedia(SHEET).matches;
type Box = { left: number; top: number; width: number; height: number };
const box = (r: DOMRect): Box => ({
  left: r.left,
  top: r.top,
  width: r.width,
  height: r.height,
});
/** What the book unfolds from: the label (its head and its film), or on a page
 *  the picture on the card that was clicked. */
type From = { head?: Box; film: Box };
type Dir = 1 | -1;
// The side the next book comes in from after a walk: it outlives the book that
// walked (in the maquette a walk is a route change, and remounts the lot).
let enterDir: Dir | 0 = 0;
const enterAttr = (d: Dir | 0) => (d === 1 ? 'right' : d === -1 ? 'left' : undefined);
// How long the label waits for the camera before it shows anyway (no WebGL, so
// nothing will ever report the camera as arrived).
const ARRIVE_WAIT = 2200;

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
  /** The projects a page walks through (oldest first). */
  collection?: CaseStudy[];
  onClose: () => void;
  /** Step to another project; `book` says the book was open (it stays open). */
  onWalk: (slug: string, book: boolean) => void;
  /** Open straight onto the book (a link to the full story). */
  startInBook?: boolean;
  onBookChange?: (open: boolean) => void;
  /** The maquette fades the label out before its route closes. */
  closing?: boolean;
}) {
  const reduced = useReducedMotion();
  const inMaquette = place === 'maquette';
  const [book, setBook] = useState(startInBook || !inMaquette);
  const [frame, setFrame] = useState<number | null>(null); // the gallery frame open full-size
  // the film as the book takes it over from the label: where it was, and whether it was playing
  const [film, setFilm] = useState<FilmClock | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const filmRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const clock = useRef<FilmClock>({ t: 0, playing: false }); // the label's player
  // On a page the book grows out of the card's picture; in the maquette, out of
  // the label as it unfolds (set then).
  const [cardFrom] = useState<From | null>(() => {
    const r = inMaquette ? null : caseOrigin(study.slug);
    return r ? { film: box(r) } : null;
  });
  const unfoldFrom = useRef<From | null>(cardFrom);
  const { prev, next } = walkFrom(study, place, collection);

  // In the maquette the label waits for the camera: the object is reached
  // first, then the line runs out from it, then the label opens at its end.
  const reached = useSceneSelector((s) => s.selectedSlug === study.slug && s.zoomSettled);
  const [arrived, setArrived] = useState(!inMaquette || reached);
  useEffect(() => {
    if (reached) setArrived(true);
  }, [reached]);
  useEffect(() => {
    if (arrived) return;
    const t = window.setTimeout(() => setArrived(true), ARRIVE_WAIT);
    return () => clearTimeout(t);
  }, [arrived]);

  useFocusTrap(rootRef, frame === null);
  // focus goes into the label as it opens, into the book as it unfolds, and
  // into the next one after a walk
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, [study.slug, book, arrived]);
  // the tab names the project while it's open (and in the history list)
  useEffect(() => {
    const prev = document.title;
    document.title = `${study.title} — ${site.hero.name}`;
    return () => {
      document.title = prev;
    };
  }, [study.title]);
  useEffect(() => {
    play('popup-open', { volume: 0.8 });
    return () => play('popup-close', { volume: 0.8 });
  }, []);
  // a page holds still behind it (the maquette's route does its own)
  useLayoutEffect(() => {
    if (inMaquette) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [inMaquette]);

  const openBook = useCallback(() => {
    const h = headRef.current?.getBoundingClientRect();
    const f = filmRef.current?.getBoundingClientRect();
    unfoldFrom.current = f ? { head: h ? box(h) : undefined, film: box(f) } : null;
    // the film carries on in the book from where it was in the label
    setFilm(clock.current.playing || clock.current.t > 0 ? { ...clock.current } : null);
    setBook(true);
    onBookChange?.(true);
  }, [onBookChange]);
  const foldBook = useCallback(() => {
    setFrame(null);
    setFilm(null);
    setBook(false);
    onBookChange?.(false);
  }, [onBookChange]);
  const walk = useCallback(
    (slug: string) => {
      enterDir = slug === next?.slug ? 1 : slug === prev?.slug ? -1 : 0;
      unfoldFrom.current = null;
      setFrame(null);
      setFilm(null);
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
  // Esc steps back one level: the picture, then the book (to the label, in the
  // maquette), then the whole thing
  const back = book && inMaquette ? foldBook : onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (frame !== null) setFrame(null);
        else back();
        return;
      }
      if (frame !== null || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (!dir) return;
      e.preventDefault();
      step(dir);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [frame, back, step]);

  return createPortal(
    <div ref={rootRef} className="exhibit" data-place={place} data-layer={study.layer} data-book={book || undefined} data-closing={closing || undefined}>
      {/* behind it: a page dims; a click there steps back */}
      <div className="exhibit__dim" onClick={back} aria-hidden="true" />
      {!book && arrived && (
        <Label
          key={study.slug}
          study={study}
          labelRef={labelRef}
          headRef={headRef}
          filmRef={filmRef}
          closeRef={closeRef}
          clock={clock}
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
          place={place}
          from={unfoldFrom.current}
          film={film}
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

/* ---------- shared parts ---------- */

function Walk({ place, prev, next, onWalk }: { place: Place; prev?: CaseStudy; next?: CaseStudy; onWalk: (slug: string) => void }) {
  if (!prev && !next) return null;
  // the maquette walks by exhibit number, a page by date
  const tag = (c: CaseStudy) => {
    const no = exhibitNo(c.slug);
    if (place === 'maquette' && no !== null) return `${pad2(no)} ${c.title}`;
    const year = c.year?.slice(0, 4);
    return year ? `${year} ${c.title}` : c.title;
  };
  return (
    <nav className="xl__walk" aria-label={place === 'maquette' ? 'Neighbouring exhibits' : 'Older and newer projects'}>
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

const PlayMark = () => (
  <span className="xl__watch-mark" aria-hidden="true">
    <svg viewBox="0 0 12 14">
      <path d="M1.5 1.2 11 7l-9.5 5.8z" />
    </svg>
  </span>
);

/** A YouTube player, autoplaying (it's only ever mounted when pressed for). */
function Player({
  embed,
  title,
  start = 0,
  frameRef,
  onLoad,
  loaded,
}: {
  embed: string;
  title: string;
  start?: number;
  frameRef?: RefObject<HTMLIFrameElement>;
  onLoad?: () => void;
  loaded?: boolean;
}) {
  const origin = `&origin=${encodeURIComponent(window.location.origin)}`;
  return (
    <iframe
      ref={frameRef}
      src={`${embed}&autoplay=1&enablejsapi=1${origin}${start > 0 ? `&start=${start}` : ''}`}
      title={`${title}: film`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      data-loaded={loaded || undefined}
      onLoad={onLoad}
    />
  );
}

/* ---------- the label (the maquette) ---------- */

function Label({
  study,
  labelRef,
  headRef,
  filmRef,
  closeRef,
  clock,
  prev,
  next,
  reduced,
  onOpen,
  onClose,
  onWalk,
  onStep,
}: {
  study: CaseStudy;
  labelRef: RefObject<HTMLElement>;
  headRef: RefObject<HTMLDivElement>;
  filmRef: RefObject<HTMLDivElement>;
  closeRef: RefObject<HTMLButtonElement>;
  clock: MutableRefObject<FilmClock>;
  prev?: CaseStudy;
  next?: CaseStudy;
  reduced: boolean;
  onOpen: () => void;
  onClose: () => void;
  onWalk: (slug: string) => void;
  onStep: (dir: Dir) => void;
}) {
  const loop = loopFor(study.slug);
  const embed = youtubeEmbed(study.video);
  const no = exhibitNo(study.slug);
  const year = study.year?.slice(0, 4);
  const role = roleFor(study);
  const second = [study.sector, role].filter(Boolean).join(' · ');
  const [imgOk, setImgOk] = useState(true);
  const [playing, setPlaying] = useState(false); // the film, playing here with sound
  const playerRef = useRef<HTMLIFrameElement>(null);
  const [line, setLine] = useState<string | null>(null);
  const [mark, setMark] = useState<{ x: number; y: number } | null>(null);
  // a curator's note: the problem, in its first sentence (the book has the rest)
  const note = splitHook(study.problem)[0];
  const minutes = readingMinutes(study);
  const sheet = sheetLayout();

  // this label's player starts from nothing
  useEffect(() => {
    clock.current = { t: 0, playing: false };
  }, [clock]);
  useYouTubeClock(playerRef, clock, playing);
  useSheetDrag(labelRef, {
    enabled: true,
    canWalk: (d) => Boolean(d === 1 ? next : prev),
    onWalk: onStep,
    onUp: sheet ? onOpen : undefined,
    onDown: sheet ? onClose : undefined,
    grab: '.xl__film',
  });

  // The line that connects it to its object: from the centre of the porthole
  // (where the camera has just framed the object) to the label, an elbow
  // reaching its film beside the porthole, straight down to it on a phone.
  useLayoutEffect(() => {
    const el = labelRef.current;
    if (!el) return;
    const place_ = () => {
      const x = rootPx('--fr-cx', 'x');
      const y = rootPx('--fr-cy', 'y');
      const r = el.getBoundingClientRect();
      setMark({ x, y });
      if (sheetLayout()) {
        setLine(`${x},${y} ${x},${r.top}`);
        return;
      }
      const f = filmRef.current?.getBoundingClientRect();
      const ty = f ? f.top + f.height / 2 : r.top + 60;
      setLine(`${x},${y} ${r.left - 64},${ty} ${r.left},${ty}`);
    };
    place_();
    // once more after layout settles (fonts, the film's box)
    const raf = requestAnimationFrame(place_);
    window.addEventListener('resize', place_);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', place_);
    };
  }, [labelRef, filmRef]);

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
      <article ref={labelRef} className="xl" role="dialog" aria-modal="true" aria-label={study.title}>
        {sheet && <span className="xl__grip" aria-hidden="true" />}
        {/* the film first: a silent loop (or the poster, drifting), and pressed,
            the film itself, right here */}
        <div ref={filmRef} className="xl__film" data-playing={playing || undefined}>
          {playing && embed ? (
            <Player embed={embed} title={study.title} frameRef={playerRef} />
          ) : loop && !reduced ? (
            <video src={loop} poster={asset(`/posters/${study.slug}.jpg`)} muted autoPlay loop playsInline preload="metadata" aria-hidden="true" />
          ) : imgOk ? (
            <img src={asset(`/posters/${study.slug}.jpg`)} alt="" data-drift={reduced ? undefined : ''} onError={() => setImgOk(false)} />
          ) : (
            <span className="xl__ph" />
          )}
          {embed && !playing && (
            <button type="button" className="xl__watch" onClick={() => setPlaying(true)}>
              <PlayMark />
              Watch the film
            </button>
          )}
        </div>
        <div className="xl__body">
          <div ref={headRef} className="xl__head">
            <div className="xl__top">
              {no !== null ? (
                <span className="xl__no">
                  <b>{pad2(no)}</b> of {EXHIBIT_COUNT} in the model
                </span>
              ) : (
                <span className="xl__no">In the collection</span>
              )}
              <button ref={closeRef} type="button" className="xl__close" onClick={onClose} aria-label="Close">
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <h2 className="xl__title">{reduced ? study.title : <Scramble text={study.title} delay={MOTION.fast} wrap />}</h2>
            <p className="xl__outcome">{study.outcome}</p>
          </div>
          {/* who it was for, and my part in it (what it's made of is in the book) */}
          <div className="xl__facts">
            <p className="xl__meta">{[study.client, year].filter(Boolean).join(', ')}</p>
            {second && <p className="xl__materials">{second}</p>}
          </div>
          <p className="xl__note">{note}</p>
          <VoiceNote
            key={`voice-${study.slug}`}
            slug={study.slug}
            title={study.title}
            no={no !== null ? pad2(no) : undefined}
            label="Audio guide · in my own words"
          />
          {/* the way to the content: the whole story, in the book */}
          <button type="button" className="xl__read" onClick={onOpen}>
            <span>Read the full story</span>
            <span className="xl__read-time">
              {minutes} min <span aria-hidden="true">→</span>
            </span>
          </button>
          <Walk place="maquette" prev={prev} next={next} onWalk={onWalk} />
        </div>
      </article>
    </>
  );
}

/* ---------- the book ---------- */

function Book({
  study,
  place,
  from,
  film,
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
  place: Place;
  from: From | null;
  film: FilmClock | null;
  closeRef: RefObject<HTMLButtonElement>;
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
  const inMaquette = place === 'maquette';
  const embed = youtubeEmbed(study.video);
  const no = exhibitNo(study.slug);
  const role = roleFor(study);
  const when = caseWhen(study);
  const [imgOk, setImgOk] = useState(true);
  // the film plays on if it was playing in the label; otherwise it waits to be pressed
  const [playing, setPlaying] = useState(Boolean(embed && film?.playing));
  const [loaded, setLoaded] = useState(false);
  const start = film ? Math.floor(film.t) : 0;
  const spreadRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const rectoRef = useRef<HTMLElement>(null);
  const { buildsOn, ledTo } = seeAlso(study);
  const chapters = (
    [
      ['The problem', study.problem],
      ['The approach', study.approach],
      ['The lesson', study.lesson],
    ] as [string, string | undefined][]
  ).filter((c): c is [string, string] => Boolean(c[1]));
  // what you're looking at, under the film
  const caption = embed ? filmCaption(study.slug) : undefined;
  const related = [...(buildsOn ? [buildsOn] : []), ...ledTo];
  const [enter] = useState(enterDir);
  useEffect(() => {
    enterDir = 0;
  }, []);
  // on a phone the book is the whole screen: pulling it down from its top steps back
  const sheet = sheetLayout();
  useSheetDrag(spreadRef, {
    enabled: drag,
    canWalk: (d) => Boolean(d === 1 ? next : prev),
    onWalk: onStep,
    onDown: sheet ? (inMaquette ? onFold : onClose) : undefined,
    grab: '.xb__screen',
  });

  // The unfold. The label's head travels to the top of the left page and its
  // film grows into the plate (on a page, the card's picture does); the spread
  // fades up round them, and the right page swings open from the spine.
  useLayoutEffect(() => {
    const spread = spreadRef.current;
    const opener = openerRef.current;
    const screen = screenRef.current;
    const page = rectoRef.current;
    if (!spread || !screen) return;
    if (reduced || !from) {
      spread.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.fast, easing: EASE });
      return;
    }
    const d = MOTION.slow;
    const s = screen.getBoundingClientRect();
    const anims = [
      spread.animate([{ backgroundColor: 'transparent', borderColor: 'transparent', boxShadow: 'none' }, {}], { duration: d, easing: EASE }),
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
    if (opener) {
      const o = opener.getBoundingClientRect();
      anims.push(
        from.head
          ? opener.animate([{ transform: `translate(${from.head.left - o.left}px, ${from.head.top - o.top}px)` }, { transform: 'none' }], { duration: d, easing: EASE })
          : opener.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: d * 1.2, easing: EASE }),
      );
    }
    if (page && !sheetLayout()) {
      anims.push(
        page.animate(
          [
            { transformOrigin: '0 50%', transform: 'perspective(2000px) rotateY(-84deg)', opacity: 0.3 },
            { transformOrigin: '0 50%', transform: 'perspective(2000px) rotateY(0deg)', opacity: 1 },
          ],
          { duration: d * 1.3, delay: d * 0.3, easing: EASE, fill: 'backwards' },
        ),
      );
    }
    // what wasn't on the label arrives after it
    spread.querySelectorAll<HTMLElement>('[data-after]').forEach((el) => anims.push(el.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { duration: d * 1.4, easing: EASE })));
    return () => anims.forEach((a) => a.cancel());
  }, [from, reduced]);

  return (
    <div
      ref={spreadRef}
      className="xb"
      data-enter={reduced || from ? undefined : enterAttr(enter)}
      role="dialog"
      aria-modal="true"
      aria-label={`${study.title}: the full story`}
    >
      <button ref={closeRef} type="button" className="xb__close" onClick={onClose} aria-label="Close">
        <span aria-hidden="true">✕</span>
      </button>

      {/* the left page: the chapter opener and the plate */}
      <section className="xb__verso">
        <header className="xb__run" data-after="">
          <span>Work in miniature</span>
          <span>{no !== null ? `Exhibit ${pad2(no)}` : 'The collection'}</span>
        </header>
        <div className="xb__chapter">
          <div ref={openerRef} className="xb__opener">
            <p className="xb__no">
              {no !== null ? (
                <>
                  <b>{pad2(no)}</b> of {EXHIBIT_COUNT} in the model
                </>
              ) : (
                'In the collection'
              )}
            </p>
            <h2 className="xb__title">{study.title}</h2>
            <p className="xb__standfirst">{study.outcome}</p>
            <VoiceNote
              key={`voice-${study.slug}`}
              slug={study.slug}
              title={study.title}
              no={no !== null ? pad2(no) : undefined}
              label="Audio guide · in my own words"
            />
          </div>
          <figure className="xb__plate">
            <div ref={screenRef} className="xb__screen" data-playing={playing || undefined}>
              {/* the still, under the player until it has loaded (and the whole
                plate for a project without a film) */}
              {imgOk ? <img src={asset(`/posters/${study.slug}.jpg`)} alt="" onError={() => setImgOk(false)} /> : <span className="xl__ph" />}
              {embed && playing && <Player embed={embed} title={study.title} start={start} loaded={loaded} onLoad={() => setLoaded(true)} />}
              {embed && !playing && (
                <button type="button" className="xl__watch" onClick={() => setPlaying(true)}>
                  <PlayMark />
                  {start > 2 ? `Carry on watching · ${clockLabel(start)}` : 'Play the film'}
                </button>
              )}
            </div>
            {caption && (
              <figcaption className="xb__caption" data-after="">
                {caption}
              </figcaption>
            )}
          </figure>
          {(study.gallery?.length ?? 0) > 0 && (
            <div className="xb__gal" data-after="">
              <Gallery slug={study.slug} images={study.gallery!} onOpen={onFrame} />
            </div>
          )}
        </div>
      </section>

      {/* the right page: the catalogue entry, the facts then the story */}
      <section ref={rectoRef} className="xb__recto">
        <header className="xb__run xb__run--recto">
          <span>{study.title}</span>
        </header>
        {/* the tombstone: what a museum prints under a work's title */}
        <dl className="xb__tomb">
          {study.client && (
            <div>
              <dt>Client</dt>
              <dd>{study.client}</dd>
            </div>
          )}
          {role && (
            <div>
              <dt>Role</dt>
              <dd>{role}</dd>
            </div>
          )}
          {when && (
            <div>
              <dt>When</dt>
              <dd>{when}</dd>
            </div>
          )}
          {study.sector && (
            <div>
              <dt>Sector</dt>
              <dd>{study.sector}</dd>
            </div>
          )}
          {study.tech?.length ? (
            <div className="xb__tomb-wide">
              <dt>Made with</dt>
              <dd>{study.tech.join(', ')}</dd>
            </div>
          ) : null}
        </dl>
        <article className="xb__essay">
          {chapters.map(([head, text]) => (
            <section key={head}>
              <h3>{head}</h3>
              {paragraphs(text).map((para, pi) => (
                <p key={pi}>{para}</p>
              ))}
            </section>
          ))}
        </article>
        {related.length > 0 && (
          <p className="xb__see">
            See also:{' '}
            {related.map((c, i) => {
              const n = exhibitNo(c.slug);
              return (
                <span key={c.slug}>
                  {i > 0 && ' · '}
                  <button type="button" onClick={() => onWalk(c.slug)}>
                    {n !== null ? `Exhibit ${pad2(n)}, ${c.title}` : c.title}
                  </button>
                </span>
              );
            })}
          </p>
        )}
        <div className="xb__acts">
          <a className="btn" href={`mailto:${site.contact.email}?subject=${encodeURIComponent(study.title)}`}>
            Ask me about it
          </a>
          {study.links?.map((link) => (
            <a key={link.url} className="btn btn--ghost" href={link.url} target="_blank" rel="noreferrer">
              {link.label} <span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
        <footer className="xb__foot">
          {inMaquette && (
            <button type="button" className="xb__fold" onClick={onFold}>
              <span aria-hidden="true">← </span>Back to the label
            </button>
          )}
          <Walk place={place} prev={prev} next={next} onWalk={onWalk} />
        </footer>
      </section>
    </div>
  );
}
