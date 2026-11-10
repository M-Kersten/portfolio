// Where a project's label stands: beside the picture that was clicked to open
// it. The openers (a timeline card, a /projects card, a search hit) note it on
// the click, and the label reads it as it mounts (Exhibit). A module value rather
// than a prop because all three hand their parent a slug, not an element.

let noted: { slug: string; rect: DOMRect; card: DOMRect | null; at: number } | null = null;

/** Remember the picture a case is being opened from, and the card it's on
 *  (the book's page grows out of the card, its plate out of the picture). */
export function noteCaseOrigin(slug: string, el: Element | null | undefined, card?: Element | null) {
  noted = el ? { slug, rect: el.getBoundingClientRect(), card: card ? card.getBoundingClientRect() : null, at: performance.now() } : null;
}

/** Where this case was opened from, if that was just now. Read-only (StrictMode
 *  runs state initialisers twice), and short-lived so a later open by some
 *  other route never flies out of a card that is no longer under the pointer. */
export function caseOrigin(slug: string): { picture: DOMRect; card: DOMRect | null } | null {
  return noted && noted.slug === slug && performance.now() - noted.at < 1000 ? { picture: noted.rect, card: noted.card } : null;
}
