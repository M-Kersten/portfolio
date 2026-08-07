import { useCallback, useEffect, useRef, useState } from 'react';
import type { GalleryImage } from '../content';
import { asset } from '../lib/asset';
import { useFocusTrap } from '../lib/useFocusTrap';

// A case's picture set: a contact-sheet grid inside the popup, and a lightbox
// over it for looking properly.
//
// The grid is the summary and the lightbox is the reading view — which is why
// captions only appear in the lightbox. A caption under every thumbnail turns a
// twelve-frame set into a wall of text at the size where you can't see what the
// text is about; at full size it's the one place the words help.

/** Where a case's frames live — the same slug-derived convention as posters. */
export const galleryUrl = (slug: string, file: string) => asset(`/gallery/${slug}/${file}`);

export function Gallery({ slug, images, onOpen }: { slug: string; images: GalleryImage[]; onOpen: (i: number) => void }) {
  return (
    <section className="gal">
      <h4 className="story__h">Gallery</h4>
      <ul className="gal__grid">
        {images.map((img, i) => (
          <li key={img.file}>
            <button
              type="button"
              className="gal__thumb"
              onClick={() => onOpen(i)}
              // The frame number carries the position for a screen reader, which
              // a caption alone wouldn't — "2 of 12" is what tells you the set
              // has a size and where you are in it.
              aria-label={`${img.caption ?? 'Image'} — open frame ${i + 1} of ${images.length}`}
            >
              <img src={galleryUrl(slug, img.file)} alt="" loading="lazy" decoding="async" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The full-size viewer. Owns nothing but the frame it's showing — `index` and
 *  the step/close callbacks come from whoever opened it, so the popup behind it
 *  can keep one Escape handler for both layers instead of two that race. */
export function Lightbox({ slug, images, index, onStep, onClose }: { slug: string; images: GalleryImage[]; index: number; onStep: (delta: number) => void; onClose: () => void }) {
  const img = images[index];
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Loading state per frame, so stepping through a set of camera-sized images
  // doesn't flash the previous one at the new frame's caption.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [index]);
  // Its own trap while it's up; the card behind stands its own down. Declared
  // BEFORE the focus call below, because the trap remembers whatever was
  // focused when it mounts and hands it back on the way out — and effects run
  // in declaration order, so putting this second meant it "remembered" its own
  // close button and dropped focus on the floor when that button unmounted.
  useFocusTrap(boxRef);
  useEffect(() => closeRef.current?.focus(), []);

  // Swipe, because a phone is where a gallery gets looked at and the arrows are
  // a poor target there. Horizontal only: a vertical drag is the page.
  const start = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);
  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) onStep(dx < 0 ? 1 : -1);
    },
    [onStep],
  );

  const many = images.length > 1;
  return (
    // stopPropagation because this renders inside the case popup's backdrop,
    // which closes the card on any click — without it, dismissing a picture
    // would take the whole project down with it.
    <div
      className="lb"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div
        ref={boxRef}
        className="lb__frame"
        role="dialog"
        aria-modal="true"
        aria-label={img.caption ?? `Frame ${index + 1} of ${images.length}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} type="button" className="lb__btn lb__close" onClick={onClose} aria-label="Close image">
          <span aria-hidden="true">✕</span>
        </button>
        {many && (
          <>
            <button type="button" className="lb__btn lb__prev" onClick={() => onStep(-1)} aria-label="Previous image">
              <span aria-hidden="true">‹</span>
            </button>
            <button type="button" className="lb__btn lb__next" onClick={() => onStep(1)} aria-label="Next image">
              <span aria-hidden="true">›</span>
            </button>
          </>
        )}
        <img
          className="lb__img"
          data-loaded={loaded || undefined}
          // Keyed so React swaps the element rather than mutating src — without
          // it the browser keeps painting the old frame until the new one
          // decodes, and `loaded` would already have been reset to false.
          key={img.file}
          src={galleryUrl(slug, img.file)}
          alt={img.caption ?? ''}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
        <div className="lb__bar">
          {img.caption && <p className="lb__caption">{img.caption}</p>}
          {many && (
            <p className="lb__count" aria-hidden="true">
              {index + 1} / {images.length}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
