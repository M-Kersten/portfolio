import type { CSSProperties } from 'react';
import { Scramble } from './Scramble';

// Section headings, laid out as stacked stepped lines rather than one flat
// row. The title string is split on newlines; each line is a block that steps
// further in than the last (its index drives `--ln`; see `.section__title-ln`
// in global.css). Each line decodes in — scrambled glyphs resolving into the
// title — when the heading scrolls into view. `wrap` lets the decode overlay
// break like its ghost: on narrow screens a long line ("From the scale of a
// city") must wrap, and the no-wrap overlay used to paint one clipped line
// straight off the right edge of the phone.
// `level` is for a page whose opening IS its title (/projects): the same look,
// as the page's h1.
export function SectionTitle({ children, level = 2 }: { children: string; level?: 1 | 2 }) {
  const lines = children.split('\n');
  const H = level === 1 ? 'h1' : 'h2';
  return (
    <H className="section__title">
      {lines.map((line, i) => (
        <span className="section__title-ln" style={{ '--ln': i } as CSSProperties} key={i}>
          <Scramble text={line} delay={i * 150} wrap />
        </span>
      ))}
    </H>
  );
}
