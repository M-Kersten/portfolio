import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../lib/useReducedMotion';

// Decode-in text — the site's "signal locking on" idea applied to type:
// characters start as instrument noise and resolve left to right once the
// element scrolls into view. An invisible ghost copy reserves the final
// layout, so nothing reflows while the overlay animates. Reduced motion
// renders the plain text.

const GLYPHS = '#/\\<>[]{}=+*%!0123456789';

function noise(text: string): string {
  let s = '';
  for (const ch of text) s += ch === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
  return s;
}

export function Scramble({ text, delay = 0 }: { text: string; delay?: number }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [out, setOut] = useState(() => (reduced ? text : noise(text)));
  const started = useRef(false);

  useEffect(() => {
    if (reduced) {
      setOut(text);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let t0 = 0;
    const dur = 620 + text.length * 14;
    const step = (now: number) => {
      raf = 0;
      if (!t0) t0 = now;
      const k = (now - t0 - delay) / dur;
      if (k < 1) raf = requestAnimationFrame(step);
      if (k < 0) return; // still waiting out the stagger delay
      const solved = Math.max(0, Math.floor(Math.min(1, k) * text.length));
      setOut(text.slice(0, solved) + noise(text.slice(solved)));
    };
    const io = new IntersectionObserver(
      (es) => {
        if (es[0].isIntersecting && !started.current) {
          started.current = true;
          raf = requestAnimationFrame(step);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [text, delay, reduced]);

  return (
    <span ref={ref} className="scramble" aria-label={text}>
      <span className="scramble__ghost" aria-hidden="true">
        {text}
      </span>
      <span className="scramble__live" aria-hidden="true">
        {out}
      </span>
    </span>
  );
}
