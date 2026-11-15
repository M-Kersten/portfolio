import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { caseWhen, roleFor, site, type CaseStudy } from '../../content';
import { exhibitNo, pad2, paragraphs, seeAlso, statementParts } from '../../content/exhibits';
import { filmCaption } from '../../content/films';
import { stillsFor, voiceFor } from '../../content/media';
import { asset } from '../../lib/asset';
import { useMediaQuery } from '../../lib/media';
import { EASE, MOTION } from '../../lib/motion';
import { useSheetDrag } from '../../lib/useSheetDrag';
import { youtubeEmbed, youtubeStart } from '../../lib/youtube';
import { VoiceNote } from './VoiceNote';
import { PlayMark, Player, SHEET, enterAttr, walkIn, type Dir, type From, type Place } from './parts';

// The story: a project, in full. From a page (the chronology, the collection,
// search) the card that was clicked has already been the label, so a project
// opens straight onto it; in the maquette it's what the label's "Read the
// full story" opens. It takes the whole screen.
//
// What the project achieved is the headline, set as large as the hero's name,
// its opening words in the floor's colour; the project's own name is the small
// line over it, with who it was for. Beside it, the film on its plate. Under
// both, the story runs as stops along a line, the way the chronology draws a
// career: in short (when, my part in it, what it's made of, where to read on),
// the problem, the approach, the lesson; and the line runs on into the way to
// ask about it. Along the bottom, the walk to the older and the newer project
// (in the maquette, to the exhibit before and the one after), and where this
// one is among them.
//
// A project can have more films than the one on its plate: a link of its that
// goes to YouTube plays right there, on the plate, in the first one's place.
//
// The stage over the line is the same height for every project, so walking
// from one to the next the line stays where it is and what's on it changes
// (and where one does need more room, the line glides to it).
//
// Behind all that the project's pictures float, at three depths: its gallery
// if it has one, otherwise frames from its film (content/media.ts, stills).
// The near ones hang off the film, in colour; further back they're smaller,
// dimmer and grey, drifting off along the line. They drift a little all the
// time and shift with the pointer, the near ones most; resting the pointer on
// one brings it forward. A gallery picture opens full-size; a frame of the
// film starts the film.
//
// On a phone (and a tablet held upright) it's one column: the headline, the
// film with the pictures stacked behind it, then the line turned upright with
// its stops down the page.
//
// Its styles are src/ui/story.css. The label and the book it opens into (the
// maquette's) are Label.tsx and Book.tsx; what holds them together is
// Exhibit.tsx.

/** The curve the film's plate grows out of the card on (as the book's does). */
const GROW = 'cubic-bezier(0.2, 0, 0, 1)';

/** Where a picture floats. On a wide screen: `a`, `b` and `c` hang off the
 *  film (over its top right corner, under its bottom right, over its top left);
 *  `d`, `e` and `f` drift off along the line, each smaller than the last. On a
 *  phone `a`, `b` and `c` are the stack behind the film. */
type Slot = 'a' | 'b' | 'c' | 'd' | 'e' | 'f';
/** Which places the pictures take, in order: the two best first (beside the
 *  film, and one out along the line), so a project with two or three pictures
 *  has them spread across the screen rather than bunched. `b` shares the room
 *  under the film with the film's caption, so a long caption has that room to
 *  itself (CAPTION_BESIDE) and the picture goes adrift instead. */
const WIDE: Slot[] = ['a', 'd', 'b', 'c', 'e', 'f'];
const WIDE_LONG_CAPTION: Slot[] = ['a', 'd', 'e', 'c', 'f'];
const CAPTION_BESIDE = 100; // characters: four lines at the width a picture leaves it
const UPRIGHT: Slot[] = ['a', 'b', 'c'];
/** How far back each hangs (2 near … 4 far). */
const DEPTH: Record<Slot, number> = { a: 2, b: 2, c: 3, d: 3, e: 4, f: 4 };
const DEPTH_UPRIGHT: Record<Slot, number> = { ...DEPTH, b: 3, c: 4 };

/** The headline's steps on the type scale, largest first (story.css: `l` is
 *  the hero name's size). It takes the largest at which it fits the block the
 *  stage gives it (story.css --head-h), which is what holds the line under it
 *  at one height. */
const SIZES = ['l', 'm', 's'] as const;

/** How far down the screen the line was in the story a walk has just left, so
 *  the next one's can glide from there. */
const rail: { y: number | null } = { y: null };

type Pic = { src: string; frame?: number; label?: string };

export function Story({
  study,
  place,
  from,
  closeRef,
  prev,
  next,
  position,
  backTo,
  reduced,
  turning,
  onClose,
  onBack,
  onWalk,
  onStep,
  drag,
  onFrame,
}: {
  study: CaseStudy;
  place: Place;
  /** What it was opened from (a card, or the label): the film's plate grows
   *  out of its picture. */
  from: From | null;
  closeRef: RefObject<HTMLButtonElement>;
  prev?: CaseStudy;
  next?: CaseStudy;
  /** Where this project is among the ones being walked through (1-based). */
  position?: { at: number; of: number };
  /** Where closing goes back to ("the chronology"), for the way back's words. */
  backTo?: string;
  reduced: boolean;
  /** A walk is leaving: 1 on to the next, -1 back. */
  turning: Dir | 0;
  onClose: () => void;
  /** The way back, where that isn't closing it (in the maquette: to the label). */
  onBack?: () => void;
  onWalk: (slug: string) => void;
  onStep: (dir: Dir) => void;
  /** Off while a picture is open over it. */
  drag: boolean;
  onFrame: (i: number) => void;
}) {
  // The film on the plate: the project's own, until another of its films is
  // asked for (a link of its that goes to YouTube).
  const [film, setFilm] = useState(study.video);
  const embed = youtubeEmbed(film);
  const more = (study.links ?? []).filter((l) => youtubeEmbed(l.url));
  const elsewhere = (study.links ?? []).filter((l) => !youtubeEmbed(l.url));
  const no = exhibitNo(study.slug);
  const role = roleFor(study);
  const when = caseWhen(study);
  const layer = study.layer.charAt(0).toUpperCase() + study.layer.slice(1);
  const caption = youtubeEmbed(study.video) ? filmCaption(study.slug) : undefined;
  const { buildsOn, ledTo } = seeAlso(study);
  const related = [...(buildsOn ? [buildsOn] : []), ...ledTo];
  const chapters = (
    [
      ['The problem', study.problem],
      ['The approach', study.approach],
      ['The lesson', study.lesson],
    ] as [string, string | undefined][]
  ).filter((c): c is [string, string] => Boolean(c[1]));
  const [imgOk, setImgOk] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const sheet = useMediaQuery(SHEET);
  const rootRef = useRef<HTMLDivElement>(null);
  const statementRef = useRef<HTMLParagraphElement>(null);
  const blockRef = useRef<HTMLSpanElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const askRef = useRef<HTMLAnchorElement>(null);
  // How it arrives is settled as it does: from a walk (and from which side),
  // out of a card, or just opened. (A walk on from here clears what the
  // exhibit holds of the card, and that mustn't start the arrival over.)
  const [enter] = useState(walkIn.dir);
  const [origin] = useState(from);
  const arrival = enter ? enterAttr(enter) : origin ? 'card' : 'open';
  useEffect(() => {
    walkIn.dir = 0;
  }, []);

  // The headline: the result, word by word (each rises from behind its own
  // line: story.css), its opening words in the floor's colour.
  const outcome = study.outcome?.trim() ?? '';
  const [lead] = statementParts(outcome);
  let at = 0;
  const words = outcome.split(/\s+/).map((word) => {
    const start = outcome.indexOf(word, at);
    at = start + word.length;
    return { word, lit: Math.max(0, Math.min(word.length, lead.length - start)) };
  });

  // …at the largest size it fits its block at, measured on the page: how a
  // sentence breaks depends on its words and on the screen.
  useLayoutEffect(() => {
    const el = statementRef.current;
    const block = blockRef.current;
    if (!el || !block) return;
    const fit = () => {
      const room = block.offsetHeight + 1;
      for (const size of SIZES) {
        el.dataset.size = size;
        if (el.offsetHeight <= room) break;
      }
    };
    fit();
    const seen = new ResizeObserver(fit);
    if (el.parentElement) seen.observe(el.parentElement);
    return () => seen.disconnect();
  }, [outcome]);

  // After a walk the line glides from where the last story had it (and the way
  // to ask, which stands on it, with it). It rarely has far to go.
  useLayoutEffect(() => {
    const line = lineRef.current;
    if (!line) return;
    const was = rail.y;
    rail.y = null;
    const by = was === null ? 0 : was - line.getBoundingClientRect().top;
    const glides =
      enter && !reduced && !sheet && Math.abs(by) > 1
        ? [line, askRef.current].map((el) =>
            el?.animate([{ transform: `translateY(${by}px)` }, { transform: 'none' }], { duration: MOTION.base, easing: EASE }),
          )
        : [];
    return () => {
      glides.forEach((a) => a?.cancel());
      rail.y = line.getBoundingClientRect().top;
    };
    // (once, as it arrives: where it is then is where it stays)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The stops share the line by how much each has to say (the last one keeps
  // clear of the way to ask, which stands on the line's end).
  const share = chapters.map(([, text]) => Math.max(text.length, 200));
  const total = share.reduce((a, b) => a + b, 0);
  const cols = `var(--xs-short) ${share
    .map((n, i) => `minmax(${i === share.length - 1 ? 'var(--xs-last)' : '0px'}, ${Math.max(0.74, (share.length * n) / total).toFixed(2)}fr)`)
    .join(' ')}`;

  // The pictures: the project's own first, then frames from its film.
  const gallery: Pic[] = (study.gallery ?? []).map((g, i) => ({ src: asset(`/gallery/${study.slug}/${g.file}`), frame: i, label: g.caption }));
  const pics: Pic[] = [...gallery, ...stillsFor(study.slug).map((src) => ({ src }))];
  const hasVoice = Boolean(voiceFor(study.slug));
  // (the audio tour stands where the furthest two would drift to)
  const wide = (caption?.length ?? 0) > CAPTION_BESIDE ? WIDE_LONG_CAPTION : WIDE;
  const slots = (sheet ? UPRIGHT : wide.filter((s) => !hasVoice || (s !== 'e' && s !== 'f'))).slice(0, pics.length);
  const depth = sheet ? DEPTH_UPRIGHT : DEPTH;
  const placed = slots.map((slot, n) => ({ slot, n, pic: pics[n] }));
  const picture = ({ slot, n, pic }: (typeof placed)[number]) => (
    <span key={slot} className="xs__pic" data-slot={slot} data-depth={depth[slot]} style={{ '--n': n } as CSSProperties}>
      {pic.frame !== undefined ? (
        <button
          type="button"
          className="xs__pic-in"
          onClick={() => onFrame(pic.frame!)}
          aria-label={`${pic.label ?? 'Picture'} — open picture ${pic.frame + 1} of ${gallery.length}`}
        >
          <img src={pic.src} alt="" loading="lazy" decoding="async" />
        </button>
      ) : (
        // a frame of the film: pressing it plays the film (the button on the
        // plate is the control; this is the same press, for a pointer)
        <span className="xs__pic-in" aria-hidden="true" data-plays={(embed && !playing) || undefined} onClick={embed && !playing ? () => setPlaying(true) : undefined}>
          <img src={pic.src} alt="" loading="lazy" decoding="async" />
        </span>
      )}
    </span>
  );
  const hung = placed.filter((p) => p.slot <= 'c');
  const adrift = placed.filter((p) => p.slot > 'c');

  // On a touch screen it's handled: sideways walks on, down from its top puts
  // it away.
  useSheetDrag(rootRef, {
    enabled: drag,
    canWalk: (d) => Boolean(d === 1 ? next : prev),
    onWalk: onStep,
    onDown: sheet ? onClose : undefined,
    grab: '.xs__bar',
    scroller: () => scrollRef.current,
  });

  // Opened from a card, the film's plate grows out of the card's picture while
  // the rest arrives round it (story.css); otherwise everything just arrives.
  useLayoutEffect(() => {
    const screen = screenRef.current;
    if (!screen || reduced || !origin || enter) return;
    const s = screen.getBoundingClientRect();
    const a = screen.animate(
      [
        {
          transformOrigin: '0 0',
          transform: `translate(${origin.film.left - s.left}px, ${origin.film.top - s.top}px) scale(${origin.film.width / s.width}, ${origin.film.height / s.height})`,
        },
        { transformOrigin: '0 0', transform: 'none' },
      ],
      { duration: MOTION.slow, easing: GROW },
    );
    return () => a.cancel();
  }, [origin, reduced, enter]);

  // The pictures shift with the pointer, the near ones most (story.css reads
  // --px / --py, each -1 … 1 across the screen).
  useEffect(() => {
    const root = rootRef.current;
    if (!root || reduced || sheet || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      raf = 0;
      root.style.setProperty('--px', x.toFixed(3));
      root.style.setProperty('--py', y.toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      x = (e.clientX / window.innerWidth) * 2 - 1;
      y = (e.clientY / window.innerHeight) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    root.addEventListener('pointermove', onMove);
    return () => {
      root.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [reduced, sheet]);

  // A fade over the foot of the page while there's more of it below.
  useEffect(() => {
    const root = rootRef.current;
    const sc = scrollRef.current;
    if (!root || !sc) return;
    const check = () => root.toggleAttribute('data-more', sc.scrollHeight - sc.scrollTop - sc.clientHeight > 12);
    check();
    sc.addEventListener('scroll', check, { passive: true });
    const seen = new ResizeObserver(check);
    seen.observe(sc);
    if (sc.firstElementChild) seen.observe(sc.firstElementChild);
    return () => {
      sc.removeEventListener('scroll', check);
      seen.disconnect();
    };
  }, []);

  // the maquette walks by exhibit number, a page by date
  const tag = (c: CaseStudy) => {
    const n = place === 'maquette' ? exhibitNo(c.slug) : null;
    const mark = n !== null ? pad2(n) : c.year?.slice(0, 4);
    return (
      <>
        {mark && <b>{mark}</b>} <span className="xs__walk-name">{c.title}</span>
      </>
    );
  };
  const show = (url: string) => {
    setFilm(url);
    setLoaded(false);
    setPlaying(true);
    scrollRef.current?.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <div
      ref={rootRef}
      className="xs"
      data-enter={reduced ? undefined : arrival}
      data-turning={turning || undefined}
      data-playing={playing || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={`${study.title}: the full story`}
      tabIndex={-1}
    >
      <div className="xs__bar">
        <button type="button" className="xs__back" onClick={onBack ?? onClose}>
          <span aria-hidden="true">← </span>Back{backTo ? ` to ${backTo}` : ''}
        </button>
        <p className="xs__mark">
          <b>{no !== null ? `Exhibit ${pad2(no)}` : 'In the depot'}</b>
          <span className="xs__mark-layer"> · {layer}</span>
          {when && <span className="xs__mark-when"> · {when}</span>}
        </p>
        <button ref={closeRef} type="button" className="xs__close" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <div ref={scrollRef} className="xs__scroll">
        <div className="xs__page">
          <section className="xs__stage" data-adrift={adrift.length > 0 || hasVoice || undefined}>
            <div className="xs__name">
              <h2 className="xs__title">{study.title}</h2>
              {study.credit && <span className="xs__credit">{study.credit}</span>}
            </div>
            <div className="xs__lead">
              {/* (the headline's block, to measure it against) */}
              <span ref={blockRef} className="xs__block" aria-hidden="true" />
              <p ref={statementRef} className="xs__statement">
                <span className="visually-hidden">{outcome}</span>
                {outcome &&
                  words.map(({ word, lit }, i) => (
                    <Fragment key={i}>
                      <span className="xs__w" aria-hidden="true">
                        <span style={{ '--i': i } as CSSProperties}>
                          {lit > 0 && <em>{word.slice(0, lit)}</em>}
                          {word.slice(lit)}
                        </span>
                      </span>{' '}
                    </Fragment>
                  ))}
              </p>
              <div className="xs__band">
                <VoiceNote
                  key={`voice-${study.slug}`}
                  slug={study.slug}
                  title={study.title}
                  no={no !== null ? pad2(no) : undefined}
                  label="Audio tour · in my own words"
                />
                {adrift.length > 0 && <div className="xs__adrift">{adrift.map(picture)}</div>}
              </div>
            </div>
            <figure className="xs__plate" data-pics={hung.length} data-low={hung.some((p) => p.slot === 'b') || undefined}>
              <div className="xs__hang">
                <div ref={screenRef} className="xs__screen">
                  {/* the still, under the player until it has loaded (and the
                      whole plate for a project without a film) */}
                  {imgOk ? <img src={asset(`/posters/${study.slug}.jpg`)} alt="" onError={() => setImgOk(false)} /> : <span className="xl__ph" />}
                  {embed && playing && <Player key={film} embed={embed} title={study.title} start={youtubeStart(film)} loaded={loaded} onLoad={() => setLoaded(true)} />}
                  {embed && !playing && (
                    <button type="button" className="xl__watch" onClick={() => setPlaying(true)}>
                      <PlayMark />
                      Play the film
                    </button>
                  )}
                </div>
                {hung.map(picture)}
              </div>
              {caption && <figcaption className="xs__caption">{caption}</figcaption>}
            </figure>
          </section>

          <section className="xs__route">
            <span ref={lineRef} className="xs__line" aria-hidden="true" />
            <ol className="xs__stops" style={{ '--cols': cols } as CSSProperties}>
              <li className="xs__stop xs__stop--short" style={{ '--i': 0 } as CSSProperties}>
                <h3 className="xs__h">
                  {when && <em>{when}</em>}In short
                </h3>
                {/* (who it was for is beside its name, over the headline) */}
                <dl className="xs__facts">
                  {role ? (
                    <div>
                      <dt>Role</dt>
                      <dd>{role}</dd>
                    </div>
                  ) : (
                    study.sector && (
                      <div>
                        <dt>Sector</dt>
                        <dd>{study.sector}</dd>
                      </div>
                    )
                  )}
                  {study.tech?.length ? (
                    <div>
                      <dt>Made with</dt>
                      <dd>{study.tech.join(' · ')}</dd>
                    </div>
                  ) : null}
                </dl>
                {(study.links?.length ?? 0) > 0 && (
                  <p className="xs__links">
                    {/* another film plays here, on the plate; anything else is a way out */}
                    {more.map((link) => (
                      <button key={link.url} type="button" aria-pressed={playing && film === link.url} onClick={() => show(link.url)}>
                        <span aria-hidden="true">▸ </span>
                        {link.label}
                      </button>
                    ))}
                    {elsewhere.map((link) => (
                      <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
                        {link.label} <span aria-hidden="true">↗</span>
                      </a>
                    ))}
                  </p>
                )}
                {related.length > 0 && (
                  <p className="xs__see">
                    See also{' '}
                    {related.map((c) => {
                      const n = exhibitNo(c.slug);
                      return (
                        <button key={c.slug} type="button" onClick={() => onWalk(c.slug)}>
                          {n !== null ? `Exhibit ${pad2(n)}, ${c.title}` : c.title}
                        </button>
                      );
                    })}
                  </p>
                )}
              </li>
              {chapters.map(([head, text], i) => (
                <li key={head} className="xs__stop" style={{ '--i': i + 1 } as CSSProperties}>
                  <h3 className="xs__h">
                    <em>{pad2(i + 1)}</em>
                    {head}
                  </h3>
                  {paragraphs(text).map((para, pi) => (
                    <p key={pi}>{para}</p>
                  ))}
                </li>
              ))}
            </ol>
            {/* where the line runs on to */}
            <a ref={askRef} className="btn xs__ask" href={`mailto:${site.contact.email}?subject=${encodeURIComponent(study.title)}`}>
              Ask me about it <span aria-hidden="true">→</span>
            </a>
          </section>
        </div>
      </div>
      <span className="xs__more" aria-hidden="true" />

      <nav className="xs__walk" aria-label={place === 'maquette' ? 'Neighbouring exhibits' : 'Older and newer projects'}>
        {prev ? (
          <button type="button" className="xs__walk-prev" onClick={() => onWalk(prev.slug)} aria-keyshortcuts="ArrowLeft">
            <span aria-hidden="true">← </span>
            {tag(prev)}
          </button>
        ) : (
          <span />
        )}
        {position ? (
          <p className="xs__pos">
            {position.of <= 24 && (
              <span className="xs__cells" aria-hidden="true">
                {Array.from({ length: position.of }, (_, i) => (
                  <i key={i} data-on={i === position.at - 1 || undefined} />
                ))}
              </span>
            )}
            <span className="xs__count">
              <span className="visually-hidden">Project </span>
              <b>{pad2(position.at)}</b>
              <span aria-hidden="true"> / </span>
              <span className="visually-hidden"> of </span>
              {position.of}
            </span>
          </p>
        ) : (
          <span />
        )}
        {next ? (
          <button type="button" className="xs__walk-next" onClick={() => onWalk(next.slug)} aria-keyshortcuts="ArrowRight">
            {tag(next)}
            <span aria-hidden="true"> →</span>
          </button>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
