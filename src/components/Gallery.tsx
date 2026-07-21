import { useState } from 'react';
import { asset } from '../lib/asset';
import type { CaseStudy } from '../content';

// A small gallery of captioned pictures for a case — each figure is an image
// with its short description beneath. Broken or missing images drop out quietly
// (onError), so a half-filled `gallery` never shows a torn thumbnail. Shared by
// the node HUD dossier and the focus card so both render pictures identically.

export function Gallery({ items }: { items: NonNullable<CaseStudy['gallery']> }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="gallery">
      {items.map((it, i) => (
        <GalleryFigure key={i} src={it.src} caption={it.caption} />
      ))}
    </div>
  );
}

function GalleryFigure({ src, caption }: { src: string; caption?: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    <figure className="gallery__fig">
      <img
        className="gallery__img"
        src={asset(src)}
        alt={caption ?? ''}
        loading="lazy"
        onError={() => setOk(false)}
      />
      {caption && <figcaption className="gallery__cap">{caption}</figcaption>}
    </figure>
  );
}
