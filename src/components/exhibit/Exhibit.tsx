import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { site, type CaseStudy } from '../../content';
import { walkFrom } from '../../content/exhibits';
import { caseOrigin } from '../../lib/caseOrigin';
import { useReducedMotion } from '../../lib/media';
import { useDocumentTitle, useScrollLock } from '../../lib/page';
import { play } from '../../lib/sound';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { type FilmClock } from '../../lib/youtube';
import { useSceneSelector } from '../../scene/store';
import { Book } from './Book';
import { Lightbox } from './Gallery';
import { Label } from './Label';
import { LEAVE_MS, TURN_MS, box, sheetLayout, walkIn, type Dir, type From, type Place } from './parts';

// A project, opened. The site is an exhibition of my work in miniature, so a
// project reads the way an exhibit does: a label beside the object, and the
// book the label opens into.
//
// In the maquette, the label. The camera reaches the object first; then a line
// runs out from it and the label opens at the line's end, beside the porthole:
// the film at the top (a silent loop, or the poster drifting; "Watch the film"
// plays it right there, with sound), the number (01–10 in the model, or "in
// the collection"), the title and what it achieved, who it was for and what
// it's made of, one sentence of curator's note, the audio tour, and "Read the
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
//
// This file holds the two together (which one is open, the walk, the keys);
// the label is Label.tsx, the book Book.tsx, and what they share is parts.tsx.
// Its styles are src/ui/exhibit.css.

// How long the label waits for the camera before it shows anyway (no WebGL, so
// nothing will ever report the camera as arrived). Once the camera has reported
// an arrival in this visit it's known to be there, and a slow device can take
// longer than that over a walk's glide, which would open the next label before
// the camera has moved: then the wait is only a backstop.
const ARRIVE_WAIT = 2200;
const ARRIVE_BACKSTOP = 6000;
/** On a page, how long the book takes to settle away before it's gone
 *  (exhibit.css, .exhibit[data-place='page'][data-closing]). */
const SHUT_MS = 220;
const camera = { reported: false };

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
    return r ? { film: box(r.picture), box: r.card ? box(r.card) : undefined } : null;
  });
  const unfoldFrom = useRef<From | null>(cardFrom);
  const { prev, next } = walkFrom(study, place, collection);

  // In the maquette the label waits for the camera: the object is reached
  // first, then the line runs out from it, then the label opens at its end.
  const reached = useSceneSelector((s) => s.selectedSlug === study.slug && s.zoomSettled);
  const [arrived, setArrived] = useState(!inMaquette || reached);
  useEffect(() => {
    if (!reached) return;
    camera.reported = true;
    setArrived(true);
  }, [reached]);
  useEffect(() => {
    if (arrived) return;
    const t = window.setTimeout(() => setArrived(true), camera.reported ? ARRIVE_BACKSTOP : ARRIVE_WAIT);
    return () => clearTimeout(t);
  }, [arrived]);

  useFocusTrap(rootRef, frame === null);
  // focus goes into the label as it opens, into the book as it unfolds, and
  // into the next one after a walk
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, [study.slug, book, arrived]);
  // the tab names the project while it's open (and in the history list)
  useDocumentTitle(`${study.title} — ${site.hero.name}`);
  // a walk from one exhibit to the next is one move, not a close and an open:
  // it arrives without the pair of sounds (and its label from the side it was
  // walked to, exhibit.css)
  const [arrivedBy] = useState(walkIn.dir);
  const walkedOn = useRef(false);
  useEffect(() => {
    walkIn.dir = 0;
    if (!arrivedBy) play('popup-open', { volume: 0.8 });
    return () => {
      if (!walkedOn.current) play('popup-close', { volume: 0.8 });
    };
  }, [arrivedBy]);
  // (on a page this stays mounted through a walk, so it's only "walked on" until the next project is in)
  useEffect(() => {
    walkedOn.current = false;
  }, [study.slug]);
  // a page holds still behind it (the maquette's route does its own)
  useScrollLock(!inMaquette);

  const openBook = useCallback(() => {
    const h = headRef.current?.getBoundingClientRect();
    const f = filmRef.current?.getBoundingClientRect();
    const l = labelRef.current?.getBoundingClientRect();
    unfoldFrom.current = f ? { box: l ? box(l) : undefined, head: h ? box(h) : undefined, film: box(f) } : null;
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
  // Walking to the next or the previous project from the book turns the page:
  // the leaf lifts off the spine first (TURN_MS), and the next spread's page
  // lands as the new book arrives (exhibit.css). From the label in the
  // maquette, the label steps aside the way you're going (LEAVE_MS) as the
  // camera sets off, and the next one comes in from the other side once it
  // arrives. Where there's no spread (the phone) or no motion, it's a plain
  // step. The turn belongs to the project it was started from: on a page (the
  // timeline, the collection, search) this stays mounted as the walk swaps its
  // project, and a turn left standing kept the new book's page lifted off and
  // every further walk blocked.
  const [turn, setTurn] = useState<{ slug: string; dir: Dir } | null>(null);
  const turning: Dir | 0 = turn?.slug === study.slug ? turn.dir : 0;
  const turnTimer = useRef(0);
  useEffect(() => () => clearTimeout(turnTimer.current), []);
  const walk = useCallback(
    (slug: string) => {
      if (turning) return;
      const dir = slug === next?.slug ? 1 : slug === prev?.slug ? -1 : 0;
      walkIn.dir = dir;
      unfoldFrom.current = null;
      setFrame(null);
      setFilm(null);
      walkedOn.current = true;
      if ((book || inMaquette) && dir && !reduced && !sheetLayout()) {
        setTurn({ slug: study.slug, dir });
        turnTimer.current = window.setTimeout(
          () => {
            setTurn(null);
            onWalk(slug, book);
          },
          book ? TURN_MS : LEAVE_MS,
        );
      } else onWalk(slug, book);
    },
    [onWalk, book, next, prev, turning, reduced, study.slug, inMaquette],
  );
  const step = useCallback(
    (dir: Dir) => {
      const to = dir === 1 ? next : prev;
      if (to) walk(to.slug);
    },
    [walk, next, prev],
  );
  // On a page the book settles away (SHUT_MS) before it's gone; the maquette
  // fades its label out on its own way out (`closing`).
  const [shutting, setShutting] = useState(false);
  const shutTimer = useRef(0);
  useEffect(() => () => clearTimeout(shutTimer.current), []);
  const close = useCallback(() => {
    if (inMaquette || reduced) return onClose();
    if (shutting) return;
    setShutting(true);
    shutTimer.current = window.setTimeout(onClose, SHUT_MS);
  }, [inMaquette, reduced, onClose, shutting]);
  // Esc steps back one level: the picture, then the book (to the label, in the
  // maquette), then the whole thing
  const back = book && inMaquette ? foldBook : close;

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
    <div
      ref={rootRef}
      className="exhibit"
      data-place={place}
      data-layer={study.layer}
      data-book={book || undefined}
      data-closing={closing || shutting || undefined}
      data-leaving={(!book && turning) || undefined}
      data-arrive={(!reduced && arrivedBy) || undefined}
    >
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
          turning={turning}
          onFold={foldBook}
          onClose={close}
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
