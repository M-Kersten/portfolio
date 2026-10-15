import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { caseWhen, roleFor, site, type CaseStudy } from '../../content';
import { EXHIBIT_COUNT, exhibitNo, pad2, paragraphs, seeAlso } from '../../content/exhibits';
import { filmCaption } from '../../content/films';
import { asset } from '../../lib/asset';
import { EASE, MOTION } from '../../lib/motion';
import { useSheetDrag } from '../../lib/useSheetDrag';
import { youtubeEmbed } from '../../lib/youtube';
import { clockLabel, type FilmClock } from '../../lib/youtubeClock';
import { Gallery } from './Gallery';
import { VoiceNote } from './VoiceNote';
import { PlayMark, Player, Walk, enterAttr, sheetLayout, walkIn, type Dir, type From, type Place } from './parts';

// The book: the full story, set as a spread. The left page is the chapter
// opener (the number, the title, the standfirst, the audio guide) over the
// plate, the film; the right page swings open from the spine with the facts
// and the story itself, then "See also" and the way to ask about it.

export function Book({
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
  const [enter] = useState(walkIn.dir);
  useEffect(() => {
    walkIn.dir = 0;
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
