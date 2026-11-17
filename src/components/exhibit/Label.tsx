import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { roleFor, type CaseStudy } from '../../content';
import { EXHIBIT_COUNT, creditLine, exhibitNo, pad2, splitHook } from '../../content/exhibits';
import { loopFor } from '../../content/media';
import { asset } from '../../lib/asset';
import { MOTION } from '../../lib/motion';
import { useSheetDrag } from '../../lib/useSheetDrag';
import { useYouTubeClock, youtubeEmbed, youtubeStart, type FilmClock } from '../../lib/youtube';
import { Scramble } from '../shell/Scramble';
import { VoiceNote } from './VoiceNote';
import { PlayMark, Player, Walk, sheetLayout, type Dir } from './parts';

// The label, in the maquette: it opens beside the porthole once the camera has
// reached the object, with a line drawn from the object to it. The film at the
// top, the number, the title and what it achieved, its credit line, one
// sentence of curator's note, the audio tour, and "Read the full story".

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

export function Label({
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
  labelRef: RefObject<HTMLDivElement>;
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
  const filmStart = youtubeStart(study.video);
  const no = exhibitNo(study.slug);
  const year = study.year?.slice(0, 4);
  const role = roleFor(study);
  const second = [study.sector, role].filter(Boolean).join(' · ');
  const [imgOk, setImgOk] = useState(true);
  // The film plays itself as the label opens: silent, on a loop, with none of
  // YouTube's controls (a loop file first if the project has one). The label
  // has its own three along the film's foot: stop, sound, full screen. Not
  // under reduced motion, nor on a connection that asked for less data: there
  // the poster stands in, behind "Play the film".
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  const [asked, setAsked] = useState(false); // the film, asked for by hand
  const rolling = Boolean(embed) && (asked || (!loop && !reduced && !saveData));
  const looping = Boolean(loop) && !asked && !reduced;
  const [filmUp, setFilmUp] = useState(false);
  const [held, setHeld] = useState(false);
  const [sound, setSound] = useState(false);
  const playerRef = useRef<HTMLIFrameElement>(null);
  const loopRef = useRef<HTMLVideoElement>(null);
  const tell = (func: string, args: unknown[] = []) => playerRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  const voice = (on: boolean) => {
    if (on) {
      tell('unMute');
      tell('setVolume', [100]);
    } else tell('mute');
  };
  // (asked for with its sound: the player has to be there before it can be told)
  useEffect(() => {
    if (!filmUp || !sound) return;
    const timers = [200, 900, 2000].map((ms) => window.setTimeout(() => voice(true), ms));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filmUp]);
  const [line, setLine] = useState<string | null>(null);
  const [mark, setMark] = useState<{ x: number; y: number } | null>(null);
  // a curator's note: the problem, in its first sentence (the book has the rest)
  const note = splitHook(study.problem)[0];
  const sheet = sheetLayout();

  // this label's player starts from nothing
  useEffect(() => {
    clock.current = { t: 0, playing: false };
  }, [clock]);
  useYouTubeClock(playerRef, clock, rolling);
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
      <div ref={labelRef} className="xl" role="dialog" aria-modal="true" aria-label={study.title} tabIndex={-1}>
        {sheet && <span className="xl__grip" aria-hidden="true" />}
        {/* the film first: a silent loop (or the poster, drifting), and pressed,
            the film itself, right here */}
        <div ref={filmRef} className="xl__film" data-playing={(rolling && sound) || undefined}>
          {looping ? (
            <video ref={loopRef} src={loop} poster={asset(`/posters/${study.slug}.jpg`)} muted autoPlay loop playsInline preload="metadata" aria-hidden="true" />
          ) : imgOk ? (
            <img src={asset(`/posters/${study.slug}.jpg`)} alt="" data-drift={reduced || rolling ? undefined : ''} onError={() => setImgOk(false)} />
          ) : (
            <span className="xl__ph" />
          )}
          {rolling && embed && <Player bare embed={embed} title={study.title} start={filmStart} frameRef={playerRef} loaded={filmUp} onLoad={() => setFilmUp(true)} />}
          {embed && !rolling && !looping && (
            <button type="button" className="xl__watch" onClick={() => setAsked(true)}>
              <PlayMark />
              Play the film
            </button>
          )}
          {/* the film's own few controls, in the site's hand */}
          {(rolling || looping) && (
            <div className="xs__controls">
              <button
                type="button"
                aria-pressed={held}
                onClick={() => {
                  if (rolling) tell(held ? 'playVideo' : 'pauseVideo');
                  else if (held) void loopRef.current?.play();
                  else loopRef.current?.pause();
                  setHeld(!held);
                }}
              >
                {held ? 'Play' : 'Pause'}
              </button>
              {embed && (
                <button
                  type="button"
                  aria-pressed={sound}
                  onClick={() => {
                    // (a loop has no sound of its own: its sound is the film's)
                    if (rolling) voice(!sound);
                    else setAsked(true);
                    setHeld(false);
                    setSound(!sound);
                  }}
                >
                  {sound ? 'Sound off' : 'Sound on'}
                </button>
              )}
              {document.fullscreenEnabled && (
                <button type="button" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : filmRef.current?.requestFullscreen())?.catch(() => {})}>
                  Full screen
                </button>
              )}
            </div>
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
                <span className="xl__no">In the depot</span>
              )}
              <button ref={closeRef} type="button" className="xl__close" onClick={onClose} aria-label="Close">
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <h2 className="xl__title">{reduced ? study.title : <Scramble text={study.title} delay={MOTION.fast} wrap />}</h2>
            <p className="xl__outcome">{study.outcome}</p>
          </div>
          {/* who it was for (or where it was made) and the year, then the
              field and my part in it (what it's made with is in the book) */}
          <div className="xl__facts">
            {/* (the year kept on the line with the credit's last word) */}
            <p className="xl__meta">{[creditLine(study), year].filter(Boolean).join('\u00a0·\u00a0')}</p>
            {second && <p className="xl__materials">{second}</p>}
          </div>
          <p className="xl__note">{note}</p>
          <VoiceNote
            key={`voice-${study.slug}`}
            slug={study.slug}
            title={study.title}
            label="Audio tour · in my own words"
          />
          {/* the way to the content: the whole story, in the book */}
          <button type="button" className="xl__read" onClick={onOpen}>
            <span>Read the full story</span>
            <span aria-hidden="true">→</span>
          </button>
          <Walk place="maquette" prev={prev} next={next} onWalk={onWalk} />
        </div>
      </div>
    </>
  );
}
