import { useState, type CSSProperties } from 'react';
import { type CaseStudy } from '../content';
import { asset } from '../lib/asset';

// Card accent is decoupled from the layer (the 3D scene already tells that
// story) — each project gets a stable colour from the four-colour palette, so
// the wall reads as a colourful scatter rather than three tidy groups.
const PALETTE = ['var(--cyan)', 'var(--lime)', 'var(--coral)', 'var(--lavender)'];
export function accentFor(slug: string): string {
  const h = Array.from(slug).reduce((a, c) => a + c.charCodeAt(0), 0);
  return PALETTE[h % PALETTE.length];
}

// A poster tile on the wall. `style` carries its absolute placement + tilt.
// Clicking it lifts the project off the wall into the focus view (no HUD).
export function CaseCard({
  study,
  onOpen,
  onHover,
  style,
}: {
  study: CaseStudy;
  onOpen: () => void;
  onHover?: (hovering: boolean) => void;
  style?: CSSProperties;
}) {
  const [imgOk, setImgOk] = useState(true);
  const src = study.media?.[0] ?? asset(`/posters/${study.slug}.jpg`);
  const seed = Array.from(study.slug).reduce((a, c) => a + c.charCodeAt(0), 0);

  return (
    <button
      type="button"
      className="worktile"
      style={{ ...style, '--card-accent': accentFor(study.slug), '--card-ang': `${120 + (seed % 90)}deg` } as CSSProperties}
      onClick={onOpen}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      aria-label={`${study.title} — open`}
    >
      <div className="worktile__media">
        <div className="worktile__ph" aria-hidden="true" />
        {imgOk && (
          <img className="worktile__img" src={src} alt="" loading="lazy" decoding="async" onError={() => setImgOk(false)} />
        )}
        <div className="worktile__scrim" aria-hidden="true" />
        {study.live && (
          <div className="worktile__badges">
            <span className="worktile__live">Live</span>
          </div>
        )}
        {study.year && <span className="worktile__year">{study.year}</span>}
      </div>
      <div className="worktile__body">
        <span className="worktile__meta">
          {study.client} · {study.sector}
        </span>
        <h3 className="worktile__title">{study.title}</h3>
        {study.tech && study.tech.length > 0 && (
          <ul className="worktile__tech" aria-label="Tech used">
            {study.tech.slice(0, 3).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
      </div>
      {/* AR-style tracking overlay — corner brackets that "lock on" on hover. */}
      <span className="worktile__reticle" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}
