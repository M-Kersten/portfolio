import type { CSSProperties } from 'react';
import { Scramble } from './Scramble';

// Section headings, laid out as stacked stepped lines rather than one flat
// row. The title string is split on newlines; each line is a block that steps
// further in than the last (its index drives `--ln`; see `.section__title-ln`
// in global.css). Each line decodes in — scrambled glyphs resolving into the
// title — when the heading scrolls into view.
export function SectionTitle({ children }: { children: string }) {
  const lines = children.split('\n');
  return (
    <h2 className="section__title">
      {lines.map((line, i) => (
        <span className="section__title-ln" style={{ '--ln': i } as CSSProperties} key={i}>
          <Scramble text={line} delay={i * 150} />
        </span>
      ))}
    </h2>
  );
}
