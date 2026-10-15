import type { CSSProperties, ReactNode } from 'react';
import { site } from '../../content';
import { useReveal } from '../../lib/useReveal';
import { Scramble } from './Scramble';

// How every section opens. A mono kicker carries the section's name (the same
// name as the header nav, without a number) and a measuring rule running out
// to a short note, the way a drawing's scale bar or title block would; then
// the title, at display size; then the lead, its standfirst, directly under
// it on the same left edge, so the two read as one block (a wall text under
// an exhibit's name) rather than a short line floating off on its own. They
// arrive in that order as the head scrolls in: the rule draws across, the
// title decodes, the lead rises.
export function SectionHead({
  id,
  title,
  lead,
  note,
  align = 'split',
  level = 2,
}: {
  /** the section's anchor, as the nav links it (e.g. "capabilities") */
  id: string;
  title: string;
  lead?: ReactNode;
  /** the note at the end of the rule */
  note?: string;
  /** split: lead to the right under the title · center: the contact finale */
  align?: 'split' | 'center';
  /** the heading level — 1 where the opening is the page's own title */
  level?: 1 | 2;
}) {
  const [ref, shown] = useReveal<HTMLElement>();
  const label = site.nav.find((n) => n.href === `#${id}`)?.label ?? null;
  return (
    <header ref={ref} className="section__head" data-align={align} data-shown={shown || undefined}>
      {label && (
        <p className="section__kicker">
          <span>{label}</span>
          <i className="section__rule" aria-hidden="true" />
          {note && <span className="section__note">{note}</span>}
        </p>
      )}
      <SectionTitle level={level} text={title} />
      {lead && <p className="section__lead">{lead}</p>}
    </header>
  );
}

// The title, as stacked stepped lines rather than one flat row: split on
// newlines, each line a block that steps further in than the last (its index
// drives `--ln`, see `.section__title-ln` in base.css), decoding in as the head
// scrolls into view. `wrap` lets the decode break like the text under it, so a
// long line wraps on a phone instead of running off the edge.
function SectionTitle({ text, level }: { text: string; level: 1 | 2 }) {
  const H = level === 1 ? 'h1' : 'h2';
  return (
    <H className="section__title">
      {text.split('\n').map((line, i) => (
        <span className="section__title-ln" style={{ '--ln': i } as CSSProperties} key={i}>
          <Scramble text={line} delay={i * 150} wrap />
        </span>
      ))}
    </H>
  );
}
