import { useCallback, useEffect, useRef, useState } from 'react';
import { site, type CaseStudy } from '../content';
import { asset } from '../lib/asset';
import { youtubeEmbed } from '../lib/youtube';
import { useFocusTrap } from '../lib/useFocusTrap';
import { FilmBox } from './FilmBox';
import { Gallery, Lightbox } from './Gallery';
import { StoryLinks } from './StoryLinks';

// A project lifted off the wall: scaled-up card with the full detail, over a dim
// backdrop. Not the old bottom HUD — a focused card. Esc / ✕ / backdrop closes.
// Shared by the timeline (Work) and the /projects wordcloud, so both open the
// exact same card.
export function FocusCard({ study, onClose, onJump }: { study: CaseStudy; onClose: () => void; onJump: (slug: string) => void }) {
  const [imgOk, setImgOk] = useState(true);
  const embed = youtubeEmbed(study.video);
  // The poster is the side panel for every case now, not a stand-in for a
  // missing film: it fills the column edge to edge and the film plays over it.
  const poster = asset(`/posters/${study.slug}.jpg`);
  // Whether the film is up. A third layer over the sheet and the lightbox, so
  // it joins the one Escape handler below rather than adding a second.
  const [film, setFilm] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // Which gallery frame is open full-size, or null for none. Owned here rather
  // than inside the gallery so this component can keep ONE Escape handler for
  // both layers — two handlers on `document` both fire, and the card would
  // close out from under the lightbox that was meant to swallow the key.
  const [frame, setFrame] = useState<number | null>(null);
  const shots = study.gallery ?? [];
  // The lightbox wraps: at the last frame, Next returns to the first. A gallery
  // is a loop you flick through, not a form you can overrun.
  const step = useCallback(
    (delta: number) => setFrame((i) => (i === null ? i : (i + delta + shots.length) % shots.length)),
    [shots.length],
  );
  useFocusTrap(cardRef, frame === null && !film); // Tab stays inside; an overlay takes over when it's up

  // Mount only — the key handler below re-subscribes as the lightbox opens and
  // closes, and pulling focus back to the card's ✕ each time would take it off
  // whichever control the visitor had just reached.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // innermost layer first
        if (film) setFilm(false);
        else if (frame !== null) setFrame(null);
        else onClose();
        return;
      }
      if (frame === null) return;
      if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // freeze the page while focused
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, frame, film, step]);

  return (
    <div className="focus" onClick={onClose}>
      <div
        ref={cardRef}
        className="focus__card"
        data-layer={study.layer}
        role="dialog"
        aria-modal="true"
        aria-label={study.title}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The sheet's header rule. It carries the stack rather than the layer
            and title, which only repeated the heading two lines below it. */}
        <div className="focus__bar">
          {study.tech && study.tech.length > 0 && (
            <ul className="focus__chips" aria-label="Technologies">
              {study.tech.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          <button ref={closeRef} type="button" className="focus__close" onClick={onClose} aria-label="Close">
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="focus__body">
          <div>
            <h3 className="focus__title">{study.title}</h3>
            <p className="focus__outcome">{study.outcome}</p>
          </div>
          {/* The story — the three beats visitors come for. `.story` lays them
              side by side here and stacks them in the narrow node dossier. */}
          <div className="story">
            <section>
              <h4 className="story__h">The problem</h4>
              <p>{study.problem}</p>
            </section>
            <section>
              <h4 className="story__h">The approach</h4>
              <p>{study.approach}</p>
            </section>
            {study.lesson && (
              <section>
                <h4 className="story__h">The lesson</h4>
                <p>{study.lesson}</p>
              </section>
            )}
          </div>
          <div className="focus__actions">
            <a
              className="btn worktile__discuss"
              href={`mailto:${site.contact.email}?subject=${encodeURIComponent(study.title)}`}
            >
              Ask me about it
            </a>
            {study.article && (
              <a className="btn btn--ghost" href={study.article} target="_blank" rel="noreferrer">
                Read more <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
          <StoryLinks study={study} onJump={onJump} />
        </div>

        {/* Supporting column: the evidence, then the title block. Media lives
            here rather than across the top because as a 16:9 header it took
            57% of the visible sheet and pushed the writing off the fold. It
            stays after the write-up in source order too, so the stacked phone
            layout and the tab order both lead with the words. */}
        <aside className="focus__side">
          <div className="focus__media" data-playable={embed ? '' : undefined}>
            {imgOk && (
              <img src={poster} alt="" onError={() => setImgOk(false)} />
            )}
            {embed && (
              <button
                type="button"
                className="focus__play"
                onClick={() => setFilm(true)}
                aria-label={`Play the ${study.title} film`}
              >
                <span aria-hidden="true">&#9654;</span>
              </button>
            )}
          </div>
          {/* The title block: who it was for and when. The stack sits in the
              header rule instead, so this stays the facts about the job. */}
          <dl className="focus__block">
            <dt>Client</dt>
            <dd>{study.client}</dd>
            <dt>Sector</dt>
            <dd>{study.sector}</dd>
            {study.year && (
              <>
                <dt>Year</dt>
                <dd>{study.year.slice(0, 4)}</dd>
              </>
            )}
          </dl>
        </aside>

        {/* The contact sheet gets the full width of the sheet, in a row of its
            own under the write-up — it is the widest thing a case owns, and in
            the side column nine frames stacked into a single 2461px ribbon. */}
        {shots.length > 0 && (
          <div className="focus__gal">
            <Gallery slug={study.slug} images={shots} onOpen={setFrame} />
          </div>
        )}
      </div>
      {/* A sibling of the sheet, not a child: the lightbox is `fixed` and must
          measure the viewport, so it has to stay outside any ancestor that
          could become its containing block. */}
      {frame !== null && (
        <Lightbox slug={study.slug} images={shots} index={frame} onStep={step} onClose={() => setFrame(null)} />
      )}
      {film && embed && <FilmBox embed={embed} title={study.title} onClose={() => setFilm(false)} />}
    </div>
  );
}
