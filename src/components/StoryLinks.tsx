import { Fragment } from 'react';
import { cases, caseBySlug, type CaseStudy } from '../content';

// The storyline footer in both case dialogs: "← builds on X · led to Y →".
// Authored with one field — a case's `follows` in cases.json names the earlier
// case it grew out of; the forward direction is derived from every case that
// points back here. Clicking a link jumps the dialog to that case, so a
// visitor can walk a whole storyline end-to-end.
export function StoryLinks({ study, onJump }: { study: CaseStudy; onJump: (slug: string) => void }) {
  const parent = study.follows ? caseBySlug(study.follows) : undefined;
  const children = cases.filter((c) => c.follows === study.slug);
  if (!parent && children.length === 0) return null;

  return (
    <nav className="story-links" aria-label="Project storyline">
      {parent && (
        <button type="button" className="story-links__jump" onClick={() => onJump(parent.slug)}>
          <span aria-hidden="true">←</span> builds on <b>{parent.title}</b>
        </button>
      )}
      {children.length > 0 && (
        <span className="story-links__fwd">
          led to{' '}
          {children.map((c, i) => (
            <Fragment key={c.slug}>
              {i > 0 && <span aria-hidden="true"> · </span>}
              <button type="button" className="story-links__jump" onClick={() => onJump(c.slug)}>
                <b>{c.title}</b>
              </button>
            </Fragment>
          ))}{' '}
          <span aria-hidden="true">→</span>
        </span>
      )}
    </nav>
  );
}
