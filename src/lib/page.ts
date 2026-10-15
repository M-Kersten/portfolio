import { useEffect, useLayoutEffect, useRef } from 'react';

// Small things a component does to the page around it while it's open: name
// the tab, hold the page still behind it, listen for Escape. Each puts things
// back the way it found them when it closes.

/** Name the browser tab while this is mounted, and restore the old name after. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);
}

/** Stop the page scrolling behind an overlay while `on`. */
export function useScrollLock(on = true) {
  // before paint, so the page never gets a frame to scroll in
  useLayoutEffect(() => {
    if (!on) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [on]);
}

/** Call `onEscape` when Escape is pressed, while `on`. */
export function useEscape(onEscape: () => void, on = true) {
  const handler = useRef(onEscape);
  handler.current = onEscape;
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handler.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on]);
}

/** A value remembered in this browser (localStorage), or null. Never throws:
 *  a private window or blocked storage just remembers nothing. */
export function remembered(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
/** Remember a value in this browser; null forgets it. */
export function remember(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: it just isn't remembered */
  }
}
