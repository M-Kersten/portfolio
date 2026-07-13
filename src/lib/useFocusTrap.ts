import { useEffect, type RefObject } from 'react';

// Keep keyboard focus inside an open dialog. Both case dialogs (the focus
// card and the node HUD) sit over a page that is only *visually* dimmed —
// without a trap, Tab walks straight out of the dialog into the obscured
// content behind it. On close, focus returns to wherever the visitor was
// (the card / hotspot they opened).
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, iframe, [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const before = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (n) => n.offsetParent !== null, // skip hidden controls
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      // Wrap at the ends; if focus somehow escaped the dialog, pull it back.
      if (e.shiftKey && (current === first || !el.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !el.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      before?.focus?.();
    };
  }, [ref, active]);
}
