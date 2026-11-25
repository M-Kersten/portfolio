// The visitors' book: lines people leave on their way out (Contact.tsx), kept
// in the same free Supabase project as the counters (counters.ts; the setup,
// and how to read and show what's been written, is docs/visitors-book.md).
//
// A line isn't in the book for everyone until I've read it: it's stored
// waiting, and only lines marked as shown can be read back. So the one who
// wrote it sees their own line straight away, from their own browser's
// memory, marked as waiting; everyone else sees it once it's shown.
//
// What's stored: the line, the name if one was given, the ticket number if
// there was one, and when. Nothing else, and nothing about who or where.
//
// Fails soft like the counters: with no project configured there is no book
// (`bookOpen` is false, and the contact section offers an email instead), and
// a project that can't be reached reads as an empty book that won't open.

import { counting, project } from './counters';
import { remember, remembered } from './page';

export interface BookLine {
  id: number;
  line: string;
  name: string | null;
  ticket: number | null;
  /** when it was written (ISO) */
  at: string;
  /** written from this browser, and not in the book for everyone yet */
  waiting?: boolean;
}

/** Why a line didn't go in. */
export type BookRefusal = 'length' | 'links' | 'busy' | 'down';

/** Whether there's a book to write in. */
export const bookOpen = counting;

export const LINE_MAX = 140;
export const LINE_MIN = 3;
export const NAME_MAX = 40;

const OWN_KEY = 'mk-book';
const OWN_DAYS = 21; // a line of yours that never turned up is forgotten after this

/** The lines written from this browser that are still waiting. */
function own(): BookLine[] {
  try {
    const rows = JSON.parse(remembered(OWN_KEY) ?? '[]') as BookLine[];
    const fresh = Date.now() - OWN_DAYS * 864e5;
    return Array.isArray(rows) ? rows.filter((r) => r && typeof r.line === 'string' && Date.parse(r.at) > fresh) : [];
  } catch {
    return [];
  }
}

/** The book, newest first: your own waiting lines, then everyone's shown ones.
 *  Null if it can't be opened. */
export async function readBook(): Promise<BookLine[] | null> {
  if (!bookOpen) return null;
  try {
    const res = await fetch(`${project.url}/rest/v1/visitors_book?select=id,line,name,ticket,at:written_at&shown=is.true&order=written_at.desc&limit=60`, {
      headers: project.headers,
    });
    if (!res.ok) return null;
    const shown = (await res.json()) as BookLine[];
    if (!Array.isArray(shown)) return null;
    // one of yours that's now shown isn't waiting any more
    const waiting = own().filter((o) => !shown.some((s) => s.id === o.id));
    remember(OWN_KEY, JSON.stringify(waiting));
    return [...waiting.map((w) => ({ ...w, waiting: true })), ...shown];
  } catch {
    return null;
  }
}

/** Write a line in it. Resolves to the line as it stands in the book (waiting),
 *  or to why it didn't go in. */
export async function signBook(line: string, name: string, ticket: number | null): Promise<BookLine | BookRefusal> {
  if (!bookOpen) return 'down';
  const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
  const text = tidy(line);
  const by = tidy(name) || null;
  if (text.length < LINE_MIN || text.length > LINE_MAX || (by?.length ?? 0) > NAME_MAX) return 'length';
  try {
    const res = await fetch(`${project.url}/rest/v1/rpc/sign_book`, {
      method: 'POST',
      headers: { ...project.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ p_line: text, p_name: by, p_ticket: ticket }),
    });
    const body = (await res.json()) as unknown;
    if (!res.ok || typeof body !== 'number') {
      const why = String((body as { message?: string } | null)?.message ?? '');
      return why.includes('book_links') ? 'links' : why.includes('book_length') ? 'length' : why.includes('book_busy') ? 'busy' : 'down';
    }
    const mine: BookLine = { id: body, line: text, name: by, ticket, at: new Date().toISOString() };
    remember(OWN_KEY, JSON.stringify([mine, ...own()].slice(0, 20)));
    return { ...mine, waiting: true };
  } catch {
    return 'down';
  }
}
