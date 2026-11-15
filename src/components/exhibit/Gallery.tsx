import { useCallback, useEffect, useRef, useState } from 'react';
import type { Picture } from '../../content/media';
import { useFocusTrap } from '../../lib/useFocusTrap';

// A project's pictures, full size: the lightbox any picture floating behind
// its story opens into (Story.tsx), where the captions are.

/** The full-size viewer. Owns nothing but the frame it's showing — `index` and
 *  the step/close callbacks come from whoever opened it, so the story behind it
 *  can keep one Escape handler for both layers instead of two that race. */
export function Lightbox({
  images,
  index,
  onStep,
  onClose,
}: {
  images: Picture[];
  index: number;
  onStep: (delta: number) => void;
  onClose: () => void;
}) {
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
    // stopPropagation because this renders inside the exhibit's backdrop,
    // which closes the book on any click — without it, dismissing a picture
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
          key={img.src}
          src={img.src}
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
