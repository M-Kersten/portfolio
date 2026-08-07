import { useCallback, useEffect, useRef, useState } from 'react';
import { site, type CaseStudy } from '../content';
import { asset } from '../lib/asset';
import { youtubeEmbed } from '../lib/youtube';
import { useFocusTrap } from '../lib/useFocusTrap';
import { Gallery, Lightbox } from './Gallery';
import { StoryLinks } from './StoryLinks';

// A project lifted off the wall: scaled-up card with the full detail, over a dim
// backdrop. Not the old bottom HUD — a focused card. Esc / ✕ / backdrop closes.
// Shared by the timeline (Work) and the /projects wordcloud, so both open the
// exact same card.
export function FocusCard({ study, onClose, onJump }: { study: CaseStudy; onClose: () => void; onJump: (slug: string) => void }) {
  const [imgOk, setImgOk] = useState(true);
  const embed = youtubeEmbed(study.video);
  // The video is the header when there is one; otherwise the poster stands in.
  const photo = embed ? null : asset(`/posters/${study.slug}.jpg`);
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
  useFocusTrap(cardRef, frame === null); // Tab stays inside; the lightbox takes over when it's up

  // Mount only — the key handler below re-subscribes as the lightbox opens and
  // closes, and pulling focus back to the card's ✕ each time would take it off
  // whichever control the visitor had just reached.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (frame !== null) setFrame(null); // innermost layer first
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
  }, [onClose, frame, step]);

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
        <button ref={closeRef} type="button" className="focus__close" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">✕</span>
        </button>
        {embed && (
          <div className="focus__video">
            <iframe
              src={embed}
              title={`${study.title} — video`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
            />
          </div>
        )}
        {photo && (
          <div className="focus__photo worktile__media">
            <div className="worktile__ph" aria-hidden="true" />
            {imgOk && <img className="worktile__img" src={photo} alt="" onError={() => setImgOk(false)} />}
            <div className="worktile__scrim" aria-hidden="true" />
          </div>
        )}
        <div className="focus__body">
          <span className="worktile__meta">
            {study.client} · {study.sector}
          </span>
          <h3 className="focus__title">{study.title}</h3>
          <p className="focus__outcome">{study.outcome}</p>
          {/* The story — the three beats visitors come for. */}
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
          {/* After the story, before the stack: the pictures document what was
              just described, and on a picture-led project they carry most of
              the weight — so they sit above the tech tags, not under them. */}
          {shots.length > 0 && <Gallery slug={study.slug} images={shots} onOpen={setFrame} />}
          {study.tech && study.tech.length > 0 && (
            <ul className="worktile__tech" aria-label="Technologies">
              {study.tech.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
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
      </div>
      {/* A sibling of the card, not a child: the card sets backdrop-filter,
          which makes it the containing block for fixed descendants, so a
          lightbox nested inside would be clipped to the card's own box. */}
      {frame !== null && (
        <Lightbox slug={study.slug} images={shots} index={frame} onStep={step} onClose={() => setFrame(null)} />
      )}
    </div>
  );
}
