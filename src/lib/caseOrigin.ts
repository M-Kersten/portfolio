// Where a project's sheet grows from: the picture that was clicked to open it.
// The openers (a timeline card, a /projects card, a search hit) note it on the
// click, and the sheet reads it as it mounts (FocusCard). A module value rather
// than a prop because all three hand their parent a slug, not an element.

let noted: { slug: string; rect: DOMRect; at: number } | null = null;

/** Remember the element a case is being opened from. */
export function noteCaseOrigin(slug: string, el: Element | null | undefined) {
  noted = el ? { slug, rect: el.getBoundingClientRect(), at: performance.now() } : null;
}

/** Where this case was opened from, if that was just now. Read-only (StrictMode
 *  runs state initialisers twice), and short-lived so a later open by some
 *  other route never flies out of a card that is no longer under the pointer. */
export function caseOrigin(slug: string): DOMRect | null {
  return noted && noted.slug === slug && performance.now() - noted.at < 1000 ? noted.rect : null;
}
