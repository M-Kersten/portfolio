import { useEffect, useRef, useState } from 'react';
import { site, type CaseStudy } from '../content';
import { asset } from '../lib/asset';
import { youtubeEmbed } from '../lib/youtube';
import { useFocusTrap } from '../lib/useFocusTrap';
import { StoryLinks } from './StoryLinks';
import { Gallery } from './Gallery';

// A project lifted off the wall: scaled-up card with the full detail, over a dim
// backdrop. Not the old bottom HUD — a focused card. Esc / ✕ / backdrop closes.
// Shared by the timeline (Work) and the /projects wordcloud, so both open the
// exact same card.
export function FocusCard({ study, onClose, onJump }: { study: CaseStudy; onClose: () => void; onJump: (slug: string) => void }) {
  const [imgOk, setImgOk] = useState(true);
  const embed = youtubeEmbed(study.video);
  // With a video, only show a photo if a real one is provided; without a video,
  // fall back to the poster placeholder so the card still has a header image.
  const photo = embed ? study.media?.[0] : study.media?.[0] ?? asset(`/posters/${study.slug}.jpg`);
  const closeRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useFocusTrap(cardRef); // Tab stays inside; focus returns to the card on close

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // freeze the page while focused
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

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
            {study.live && (
              <div className="worktile__badges">
                <span className="worktile__live">Live</span>
              </div>
            )}
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
          {study.gallery && study.gallery.length > 0 && <Gallery items={study.gallery} />}
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
    </div>
  );
}
