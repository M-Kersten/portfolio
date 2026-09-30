import type { ReactNode } from 'react';
import { useReveal } from '../lib/useReveal';
import { SectionTitle } from './SectionTitle';

// How every section opens: the title, at display size, then the lead, set
// small and off to the right, so each opening is one big thing and one quiet
// one rather than a centred stack. They arrive in that order as the head
// scrolls in: the title decodes, the lead rises.
export function SectionHead({
  title,
  lead,
  align = 'split',
}: {
  title: string;
  lead?: ReactNode;
  /** split: lead to the right under the title · center: the contact finale */
  align?: 'split' | 'center';
}) {
  const [ref, shown] = useReveal<HTMLElement>();
  return (
    <header ref={ref} className="section__head" data-align={align} data-shown={shown || undefined}>
      <SectionTitle>{title}</SectionTitle>
      {lead && <p className="section__lead">{lead}</p>}
    </header>
  );
}
