import { useEffect, useRef } from 'react';
import { useFocusTrap } from '../lib/useFocusTrap';

// The film, full size, over the case sheet — opened by the play button on the
// sheet's poster panel.
//
// It borrows the lightbox's shell (`.lb`) rather than reimplementing a
// backdrop, because it is the same gesture on the same surface and should look
// identical. What it does NOT borrow is the lightbox component itself: that one
// is built around stepping and swiping through a set, and a single film has
// neither. Two small siblings beat one component with a mode flag.
//
// Nothing is loaded until this mounts, which is the point. The sheet used to
// embed the player on open, so every visitor fetched YouTube whether or not
// they ever pressed play.
export function FilmBox({ embed, title, onClose }: { embed: string; title: string; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Declared before the focus call below: the trap remembers whatever was
  // focused when it mounts and hands it back on the way out, and effects run in
  // declaration order (same ordering trap as the lightbox).
  useFocusTrap(boxRef);
  useEffect(() => closeRef.current?.focus(), []);

  return (
    // stopPropagation because this renders inside the sheet's backdrop, which
    // closes the case on any click — without it, dismissing the film would take
    // the whole project down with it.
    <div
      className="lb"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        ref={boxRef}
        className="lb__frame film__frame"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} — film`}
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} type="button" className="lb__btn lb__close" onClick={onClose} aria-label="Close film">
          <span aria-hidden="true">✕</span>
        </button>
        <div className="film__stage">
          <iframe
            // autoplay is honest here: the visitor pressed play to get this far.
            src={`${embed}&autoplay=1`}
            title={`${title} — film`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
