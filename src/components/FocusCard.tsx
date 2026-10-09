import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { byDate, cases, caseWhen, roleFor, site, type CaseStudy, type Layer } from '../content';
import { asset } from '../lib/asset';
import { caseOrigin } from '../lib/caseOrigin';
import { EASE, MOTION } from '../lib/motion';
import { useFocusTrap } from '../lib/useFocusTrap';
import { useReducedMotion } from '../lib/useReducedMotion';
import { youtubeEmbed } from '../lib/youtube';
import { Gallery, Lightbox } from './Gallery';
import { Scramble } from './Scramble';

// A project, opened up: the case sheet. Shared by the timeline (Work), the
// /projects index and search, so all three open the exact same sheet.
//
// It leads with the work: the poster is the stage, top left, and the film
// plays right there. Beside it the title block says what the project is in
// five seconds (title, outcome); under them the facts are ruled off in one
// row (client, role, when, sector, stack); then the story in its three beats,
// each led by its first sentence as a headline; and at the foot, the projects
// either side of it in time, so the work can be walked without closing
// anything (← → and a swipe do the same). The layer shows only as colour.
// The "builds on / led to" storyline stays with the maquette's dossier
// (NodeHud), where the relations are drawn between the objects.
//
// It opens out of the picture that was clicked (lib/caseOrigin): that picture
// flies to the stage as a grey ghost, the brackets lock on round the sheet,
// then the poster colours in and the title decodes. Esc / ✕ / backdrop close.

/** How the project on the sheet arrived: out of a card, opened without one,
 *  or stepped to from its neighbour. Picks its entrance (focus-card.css,
 *  [data-enter]). */
type Enter = 'fly' | 'open' | 'earlier' | 'later';

const LAYER_COLOR: Record<Layer, string> = { city: 'var(--cyan)', room: 'var(--coral)', chip: 'var(--lime)' };

/** A beat's first sentence (its headline) and the rest, as About splits its
 *  chapters. It stops at a line break too, and keeps a closing quote. */
function splitHook(text: string): [string, string] {
  const m = text.match(/^([^\n]+?[.!?…]['’”)]?)\s+([\s\S]*)$/);
  if (m) return [m[1], m[2]];
  const br = text.indexOf('\n');
  return br > 0 ? [text.slice(0, br).trim(), text.slice(br).trim()] : [text, ''];
}

export function FocusCard({
  study,
  onClose,
  onJump,
  browse = cases,
}: {
  study: CaseStudy;
  onClose: () => void;
  onJump: (slug: string) => void;
  /** The projects the earlier / later steps walk, in any order (they're put in
   *  time order here). Every project by default; the timeline passes its own. */
  browse?: CaseStudy[];
}) {
  const reduced = useReducedMotion();
  // The picture it was opened from, if one was just clicked: the sheet grows
  // out of it. Read once, on mount; with reduced motion it simply appears.
  const [origin] = useState(() => (reduced ? null : caseOrigin(study.slug)));
  const [flying, setFlying] = useState(origin !== null);
  const [enter, setEnter] = useState<Enter>(origin ? 'fly' : 'open');
  // Which gallery frame is open full-size, or null for none. Owned here rather
  // than inside the gallery so this component can keep ONE Escape handler for
  // both layers — two handlers on `document` both fire, and the sheet would
  // close out from under the lightbox that was meant to swallow the key.
  const [frame, setFrame] = useState<number | null>(null);
  // what a screen reader hears on stepping to another project
  const [said, setSaid] = useState('');
  const shellRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const shots = study.gallery ?? [];

  // The neighbours in time. A project the browsed set doesn't hold walks the
  // whole index instead.
  const { earlier, later } = useMemo(() => {
    const list = byDate(browse.some((c) => c.slug === study.slug) ? browse : cases);
    const i = list.findIndex((c) => c.slug === study.slug);
    return { earlier: list[i - 1] as CaseStudy | undefined, later: list[i + 1] as CaseStudy | undefined };
  }, [browse, study.slug]);

  const go = useCallback(
    (slug: string, how: Enter) => {
      setFrame(null);
      setEnter(how);
      onJump(slug);
    },
    [onJump],
  );

  // The lightbox wraps: at the last frame, Next returns to the first. A gallery
  // is a loop you flick through, not a form you can overrun.
  const step = useCallback(
    (delta: number) => setFrame((i) => (i === null ? i : (i + delta + shots.length) % shots.length)),
    [shots.length],
  );
  useFocusTrap(shellRef, frame === null); // Tab stays inside; the lightbox traps while it's up

  // Freeze the page behind. A layout effect, so the scrollbar has gone before
  // the flight below measures where the stage ends up.
  useLayoutEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // The flight: the clicked picture, as a grey ghost, from its card to the
  // stage. The stage's own poster stays hidden under it until it lands
  // ([data-flying]), so the hand-over is invisible.
  useLayoutEffect(() => {
    if (!origin) return;
    const ghost = ghostRef.current;
    const stage = stageRef.current;
    if (!ghost || !stage) {
      setFlying(false);
      return;
    }
    const box = (r: DOMRect) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    const flight = ghost.animate([box(origin), box(stage.getBoundingClientRect())], {
      duration: MOTION.slow,
      easing: EASE,
      fill: 'forwards',
    });
    flight.onfinish = () => setFlying(false);
    return () => flight.cancel();
  }, [origin]);

  // Mount only — pulling focus back to the ✕ on every render would take it off
  // whichever control the visitor had just reached.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // innermost layer first
        if (frame !== null) setFrame(null);
        else onClose();
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (frame !== null) {
        step(e.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      const to = e.key === 'ArrowLeft' ? earlier : later;
      if (!to) return;
      e.preventDefault();
      go(to.slug, e.key === 'ArrowLeft' ? 'earlier' : 'later');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, frame, step, earlier, later, go]);

  // A new project starts at the top of the sheet.
  useLayoutEffect(() => {
    cardRef.current?.scrollTo(0, 0);
  }, [study.slug]);

  // Stepping by button takes the button away with the old sheet, so hand focus
  // to the same step on the new one (Enter keeps walking), or to the ✕ at the
  // end of the line. And say where we've got to, for anyone listening.
  const seen = useRef(study.slug);
  useEffect(() => {
    if (seen.current === study.slug) return;
    seen.current = study.slug;
    setSaid(`${study.title}, ${caseWhen(study)}`);
    if (shellRef.current?.contains(document.activeElement)) return;
    const same = shellRef.current?.querySelector<HTMLElement>(`[data-step="${enter}"]`);
    (same ?? closeRef.current)?.focus({ preventScroll: true });
  }, [study, enter]);

  // Swipe between projects on a phone. Horizontal only: a vertical drag is the
  // sheet scrolling.
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const p = e.touches[0];
    touch.current = e.touches.length === 1 ? { x: p.clientX, y: p.clientY, t: e.timeStamp } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.5 || e.timeStamp - s.t > 800) return;
    const to = dx < 0 ? later : earlier;
    if (to) go(to.slug, dx < 0 ? 'later' : 'earlier');
  };

  return (
    <div className="focus" onClick={onClose} data-flight={origin ? '' : undefined} data-flying={flying || undefined}>
      {/* The shell is the dialog: the sheet, a ✕ that stays put while the sheet
          scrolls under it, and the scanner brackets round them — the same four
          corners that frame the cards it opens from, re-keyed per project so
          they lock on again at each one. */}
      <div
        ref={shellRef}
        className="focus__shell"
        data-layer={study.layer}
        role="dialog"
        aria-modal="true"
        aria-label={study.title}
        onClick={(e) => e.stopPropagation()}
      >
        <span key={study.slug} className="focus__frame" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <button ref={closeRef} type="button" className="focus__close" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">✕</span>
        </button>
        <div ref={cardRef} className="focus__card" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <Sheet
            key={study.slug}
            study={study}
            enter={enter}
            stageRef={stageRef}
            earlier={earlier}
            later={later}
            onGo={go}
            onFrame={setFrame}
          />
        </div>
        <p className="visually-hidden" aria-live="polite">
          {said}
        </p>
      </div>
      {flying && origin && (
        <div
          ref={ghostRef}
          className="focus__ghost"
          aria-hidden="true"
          style={{
            backgroundImage: `url("${asset(`/posters/${study.slug}.jpg`)}")`,
            left: origin.left,
            top: origin.top,
            width: origin.width,
            height: origin.height,
          }}
        />
      )}
      {/* A sibling of the shell, not a child: the lightbox is `fixed` and must
          measure the viewport, so it has to stay outside any ancestor that
          could become its containing block. */}
      {frame !== null && shots.length > 0 && (
        <Lightbox slug={study.slug} images={shots} index={frame} onStep={step} onClose={() => setFrame(null)} />
      )}
    </div>
  );
}

/** One project's sheet. Keyed per project by FocusCard, so stepping to the
 *  next one starts it afresh: the film stopped, the poster grey again, the
 *  title decoding. */
function Sheet({
  study,
  enter,
  stageRef,
  earlier,
  later,
  onGo,
  onFrame,
}: {
  study: CaseStudy;
  enter: Enter;
  stageRef: RefObject<HTMLDivElement>;
  earlier?: CaseStudy;
  later?: CaseStudy;
  onGo: (slug: string, how: Enter) => void;
  onFrame: (i: number) => void;
}) {
  const embed = youtubeEmbed(study.video);
  const [imgOk, setImgOk] = useState(true);
  // The film plays in the stage, in place of the poster, once it's asked for;
  // nothing is fetched from YouTube before that.
  const [playing, setPlaying] = useState(false);
  const filmRef = useRef<HTMLIFrameElement>(null);
  // the play button the keyboard was on is gone: hand focus to the player
  useEffect(() => {
    if (playing) filmRef.current?.focus();
  }, [playing]);

  const role = roleFor(study);
  const when = caseWhen(study);
  const shots = study.gallery ?? [];
  const beats = (
    [
      ['The problem', study.problem],
      ['The approach', study.approach],
      ['The lesson', study.lesson],
    ] as [string, string | undefined][]
  ).filter((b): b is [string, string] => Boolean(b[1]));
  // The title decodes as the sheet lands: partway through the flight, or a
  // beat after stepping over from the last project.
  const decodeAt = enter === 'fly' ? MOTION.base : enter === 'open' ? MOTION.fast : MOTION.stagger;

  return (
    <div className="focus__sheet" data-enter={enter}>
      {/* The row the ✕ floats over. On a phone it's the bar that stays at the
          top while the sheet scrolls, naming the project, with the ✕ at its
          end. The layer needs no label: its colour is on the brackets, the
          kickers and the play mark. */}
      <div className="focus__top">
        <span className="focus__name" aria-hidden="true">
          {study.title}
        </span>
      </div>

      {/* The stage: the work first. The whole picture is the play button; the
          square in its corner says so. */}
      <div ref={stageRef} className="focus__stage">
        {playing && embed ? (
          <iframe
            ref={filmRef}
            // autoplay is honest here: the visitor pressed play to get this far
            src={`${embed}&autoplay=1`}
            title={`${study.title} — film`}
            // no `web-share`: Chrome doesn't know it as an iframe permission
            // and logs a warning for it on every embed
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <>
            {imgOk ? (
              <img src={asset(`/posters/${study.slug}.jpg`)} alt="" onError={() => setImgOk(false)} />
            ) : (
              <span className="focus__ph" aria-hidden="true" />
            )}
            {embed && (
              <button
                type="button"
                className="focus__play"
                onClick={() => setPlaying(true)}
                aria-label={`Play the ${study.title} film`}
              >
                <span className="focus__play-icon" aria-hidden="true">
                  <svg viewBox="0 0 12 14">
                    <path d="M1.5 1.2 11 7l-9.5 5.8z" />
                  </svg>
                </span>
              </button>
            )}
          </>
        )}
      </div>

      {/* The title block: what this is, in five seconds. */}
      <div className="focus__head">
        <h3 className="focus__title">
          <Scramble text={study.title} delay={decodeAt} wrap />
        </h3>
        <p className="focus__outcome">{study.outcome}</p>
        <div className="focus__actions">
          <a
            className="btn worktile__discuss"
            href={`mailto:${site.contact.email}?subject=${encodeURIComponent(study.title)}`}
          >
            Ask me about it
          </a>
          {/* Every outbound link the case carries, in the order authored and
              with its own words. */}
          {study.links?.map((link) => (
            <a key={link.url} className="btn btn--ghost" href={link.url} target="_blank" rel="noreferrer">
              {link.label} <span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      </div>

      {/* The facts about the job, ruled off in one row: a drawing's title block.
          "My role" comes from the career entry the project was done at, and is
          left off where the client names no employer (roleFor). */}
      <dl className="focus__facts">
        <div className="focus__fact">
          <dt>Client</dt>
          <dd>{study.client}</dd>
        </div>
        {role && (
          <div className="focus__fact">
            <dt>My role</dt>
            <dd>{role}</dd>
          </div>
        )}
        {when && (
          <div className="focus__fact">
            <dt>When</dt>
            <dd>{when}</dd>
          </div>
        )}
        <div className="focus__fact">
          <dt>Sector</dt>
          <dd>{study.sector}</dd>
        </div>
        {study.tech && study.tech.length > 0 && (
          <div className="focus__fact focus__fact--stack">
            <dt>Stack</dt>
            <dd>
              <ul className="focus__chips">
                {study.tech.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>

      {/* The story in its three beats, each led by its first sentence set as a
          headline, so the headlines alone tell it (About's chapters work the
          same way). */}
      <div className="story focus__story">
        {beats.map(([heading, text]) => {
          const [hook, rest] = splitHook(text);
          return (
            <section key={heading}>
              <h4 className="story__h">{heading}</h4>
              <p className="focus__hook">{hook}</p>
              {rest && <p>{rest}</p>}
            </section>
          );
        })}
      </div>

      {/* The contact sheet gets the full width, in a row of its own under the
          story: it is the widest thing a case owns. */}
      {shots.length > 0 && (
        <div className="focus__gal">
          <Gallery slug={study.slug} images={shots} onOpen={onFrame} />
        </div>
      )}

      {/* The way on, without closing: the projects either side of this one
          in time. */}
      {(earlier || later) && (
        <nav className="focus__foot focus__pager" aria-label="More projects">
          {earlier && <Step to={earlier} dir="earlier" onGo={onGo} />}
          {later && <Step to={later} dir="later" onGo={onGo} />}
        </nav>
      )}
    </div>
  );
}

/** A step to the project before or after this one in time: which way and its
 *  year in mono, the title under it, a pip in its layer's colour. */
function Step({ to, dir, onGo }: { to: CaseStudy; dir: 'earlier' | 'later'; onGo: (slug: string, how: Enter) => void }) {
  const year = to.year?.slice(0, 4);
  return (
    <button
      type="button"
      className="focus__step"
      data-step={dir}
      style={{ '--c': LAYER_COLOR[to.layer] } as CSSProperties}
      onClick={() => onGo(to.slug, dir)}
      aria-keyshortcuts={dir === 'earlier' ? 'ArrowLeft' : 'ArrowRight'}
    >
      <span className="focus__step-meta">
        {dir === 'earlier' && (
          <span className="focus__step-arrow" aria-hidden="true">
            ←
          </span>
        )}
        {dir === 'earlier' ? 'Earlier' : 'Later'}
        {year && <span className="focus__step-year">{year}</span>}
        {dir === 'later' && (
          <span className="focus__step-arrow" aria-hidden="true">
            →
          </span>
        )}
      </span>
      <span className="focus__step-title">{to.title}</span>
    </button>
  );
}
