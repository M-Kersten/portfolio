import { useEffect, useRef, type RefObject } from 'react';

// Direct manipulation for a label (or the book) on a touch screen: it follows
// the finger, then either snaps back or carries on and commits. Sideways walks
// to the neighbouring exhibit; up pulls the label open into the book (the sheet
// grows under the finger); down puts it away. The axis is decided on the first
// few pixels of movement, and only a gesture this claims stops the page from
// scrolling: a vertical drag in a label whose text still has somewhere to
// scroll just scrolls it, the way a native sheet does.

type Dir = 1 | -1; // 1 = on to the next (the finger travels left), -1 = back

type Opts = {
  enabled: boolean;
  /** Is there an exhibit that way? If not, it gives a little and springs back. */
  canWalk: (dir: Dir) => boolean;
  onWalk: (dir: Dir) => void;
  /** Pulled up past the line (the sheet only). */
  onUp?: () => void;
  /** Pulled down past the line (the sheet only). */
  onDown?: () => void;
  /** Where a vertical pull may start whatever the scroll (the film at the top). */
  grab?: string;
  /** The element that scrolls, when it isn't the dragged one. */
  scroller?: () => HTMLElement | null;
};

const SNAP = 'translate 240ms cubic-bezier(.2,.8,.2,1), opacity 240ms ease, min-height 240ms cubic-bezier(.2,.8,.2,1)';
const OUT = 180; // ms to carry on off the screen before committing
// past this the pull gives less and less, so the sheet never runs away
const rubber = (d: number, free: number) => (d < free ? d : free + (d - free) * 0.35);

export function useSheetDrag(ref: RefObject<HTMLElement>, opts: Opts) {
  const o = useRef(opts);
  o.current = opts;

  useEffect(() => {
    const el = ref.current;
    if (!el || !opts.enabled) return;
    type Pt = { x: number; y: number; t: number };
    let s: { x: number; y: number; h: number; axis: 'x' | 'up' | 'down' | 'none' | null; grab: boolean; top: boolean; end: boolean; pts: Pt[] } | null = null;
    let timer = 0;
    const root = () => el.closest('.exhibit');
    const reset = (animate: boolean) => {
      el.style.transition = animate ? SNAP : '';
      el.style.translate = '';
      el.style.opacity = '';
      el.style.minHeight = '';
      root()?.removeAttribute('data-dragging');
    };
    // a drag the finger lifted from mustn't also count as a press on the film
    const swallow = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        s = null;
        return;
      }
      const p = e.touches[0];
      const sc = o.current.scroller?.() ?? el;
      s = {
        x: p.clientX,
        y: p.clientY,
        h: el.offsetHeight,
        axis: null,
        grab: !!(o.current.grab && (e.target as Element | null)?.closest?.(o.current.grab)),
        top: sc.scrollTop <= 0,
        end: sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2,
        pts: [{ x: p.clientX, y: p.clientY, t: e.timeStamp }],
      };
    };

    const onMove = (e: TouchEvent) => {
      if (!s || s.axis === 'none' || e.touches.length !== 1) return;
      const p = e.touches[0];
      const dx = p.clientX - s.x;
      const dy = p.clientY - s.y;
      s.pts.push({ x: p.clientX, y: p.clientY, t: e.timeStamp });
      if (s.pts.length > 6) s.pts.shift();
      if (s.axis === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.2) s.axis = 'x';
        else if (dy < 0 && o.current.onUp && (s.grab || s.end)) s.axis = 'up';
        else if (dy > 0 && o.current.onDown && (s.grab || s.top)) s.axis = 'down';
        else {
          s.axis = 'none';
          return;
        }
        el.style.transition = 'none';
        root()?.setAttribute('data-dragging', '');
      }
      if (e.cancelable) e.preventDefault();
      if (s.axis === 'x') {
        const k = o.current.canWalk(dx < 0 ? 1 : -1) ? 1 : 0.22;
        const x = dx * k;
        el.style.translate = `${x}px 0`;
        el.style.opacity = String(1 - Math.min(Math.abs(x) / el.offsetWidth, 1) * 0.6);
      } else if (s.axis === 'up') {
        el.style.minHeight = `${Math.min(s.h + rubber(-dy, 140), window.innerHeight)}px`;
      } else {
        el.style.translate = `0 ${dy}px`;
      }
    };

    const onEnd = (e: TouchEvent) => {
      const g = s;
      s = null;
      if (!g || g.axis === null || g.axis === 'none') return;
      const p = e.changedTouches[0];
      const dx = p.clientX - g.x;
      const dy = p.clientY - g.y;
      const a = g.pts[0];
      const b = g.pts[g.pts.length - 1];
      const dt = Math.max(b.t - a.t, 1);
      const vx = (b.x - a.x) / dt; // px per ms
      const vy = (b.y - a.y) / dt;
      el.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => el.removeEventListener('click', swallow, { capture: true }), 400);

      if (g.axis === 'x') {
        const dir: Dir = dx < 0 ? 1 : -1;
        const far = Math.abs(dx) > el.offsetWidth * 0.3 || (Math.abs(vx) > 0.45 && Math.abs(dx) > 40);
        if (far && o.current.canWalk(dir)) {
          el.style.transition = `translate ${OUT}ms ease-in, opacity ${OUT}ms ease-in`;
          el.style.translate = `${-dir * (el.offsetWidth + 60)}px 0`;
          el.style.opacity = '0';
          timer = window.setTimeout(() => {
            root()?.removeAttribute('data-dragging');
            o.current.onWalk(dir);
          }, OUT);
        } else reset(true);
      } else if (g.axis === 'up') {
        if (-dy > 72 || vy < -0.4) {
          root()?.removeAttribute('data-dragging');
          o.current.onUp?.(); // the book unfolds from wherever the sheet was let go
        } else reset(true);
      } else {
        if (dy > 110 || (vy > 0.45 && dy > 30)) {
          el.style.transition = `translate ${OUT}ms ease-in, opacity ${OUT}ms ease-in`;
          el.style.translate = `0 ${el.offsetHeight * 0.6 + 80}px`;
          el.style.opacity = '0';
          timer = window.setTimeout(() => {
            root()?.removeAttribute('data-dragging');
            o.current.onDown?.();
          }, OUT);
        } else reset(true);
      }
    };
    const onCancel = () => {
      if (s?.axis && s.axis !== 'none') reset(true);
      s = null;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onCancel);
    return () => {
      clearTimeout(timer);
      root()?.removeAttribute('data-dragging');
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
      el.removeEventListener('click', swallow, { capture: true });
    };
  }, [ref, opts.enabled]);
}
