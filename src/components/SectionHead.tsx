import type { ReactNode } from 'react';
import { site } from '../content';
import { useReveal } from '../lib/useReveal';
import { SectionTitle } from './SectionTitle';

// How every section opens. A mono kicker carries the section's number and name
// (the same name and order as the header nav) and a measuring rule running out
// to a short note, the way a drawing's scale bar or title block would; then
// the title, at display size; then the lead, set small and off to the right,
// so each opening is one big thing and one quiet one rather than a centred
// stack. They arrive in that order as the head scrolls in: the rule draws
// across, the title decodes, the lead rises.
export function SectionHead({
  id,
  title,
  lead,
  note,
  align = 'split',
}: {
  /** the section's anchor, as the nav links it (e.g. "capabilities") */
  id: string;
  title: string;
  lead?: ReactNode;
  /** the note at the end of the rule */
  note?: string;
  /** split: lead to the right under the title · center: the contact finale */
  align?: 'split' | 'center';
}) {
  const [ref, shown] = useReveal<HTMLElement>();
  const at = site.nav.findIndex((n) => n.href === `#${id}`);
  const label = at >= 0 ? site.nav[at].label : null;
  return (
    <header ref={ref} className="section__head" data-align={align} data-shown={shown || undefined}>
      {label && (
        <p className="section__kicker">
          <b>{String(at + 1).padStart(2, '0')}</b>
          <span>{label}</span>
          <i className="section__rule" aria-hidden="true" />
          {note && <span className="section__note">{note}</span>}
        </p>
      )}
      <SectionTitle>{title}</SectionTitle>
      {lead && <p className="section__lead">{lead}</p>}
    </header>
  );
}
