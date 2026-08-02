import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../lib/useReducedMotion';

// Decode-in text — the site's "signal locking on" idea applied to type:
// characters start as instrument noise and resolve left to right once the
// element scrolls into view. An invisible ghost copy reserves the final
// layout, so nothing reflows while the overlay animates. Reduced motion
// renders the plain text.

// Light, narrow glyphs only — heavy marks (#, {}, %, digits) at display sizes
// read like the title doubling in weight while it decodes.
const GLYPHS = '/\\<>=+*!:;·';

function noise(text: string): string {
  let s = '';
  for (const ch of text) s += ch === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
  return s;
}

// `wrap` lets the live overlay wrap like its ghost. Spaces survive the noise
// at the same indices, so the overlay only ever breaks at the ghost's own
// break candidates; in mono the break points match exactly, in proportional
// text they can shift by a word for the fraction of a second the noise is
// wider than the real text. Any text that MUST wrap (section titles on a
// phone) wants this — the no-wrap default instead paints one long clipped
// line straight off the viewport edge.
export function Scramble({ text, delay = 0, wrap = false }: { text: string; delay?: number; wrap?: boolean }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  // solved chars render as real text at full ink; the rest is a FAINT noise
  // tail (see .scramble__rest) — the title writes itself in over a whisper of
  // static instead of a full-brightness glyph storm.
  const [state, setState] = useState(() =>
    reduced ? { solved: text.length, rest: '' } : { solved: 0, rest: noise(text) },
  );
  const started = useRef(false);

  useEffect(() => {
    if (reduced) {
      setState({ solved: text.length, rest: '' });
      return;
    }
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let t0 = 0;
    // The noise shimmer re-randomises at ~12Hz, not per frame — a 60Hz churn
    // of glyphs across a display-size title read as frantic.
    let noiseAt = -1;
    let noiseFrom = 0;
    let cached = '';
    const dur = 420 + text.length * 9;
    const step = (now: number) => {
      raf = 0;
      if (!t0) t0 = now;
      const k = (now - t0 - delay) / dur;
      if (k < 1) raf = requestAnimationFrame(step);
      if (k < 0) return; // still waiting out the stagger delay
      const solved = Math.max(0, Math.floor(Math.min(1, k) * text.length));
      if (now - noiseAt > 80) {
        cached = noise(text.slice(solved));
        noiseFrom = solved;
        noiseAt = now;
      }
      setState({ solved, rest: cached.slice(solved - noiseFrom) });
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
    <span ref={ref} className={`scramble${wrap ? ' scramble--wrap' : ''}`} aria-label={text}>
      <span className="scramble__ghost" aria-hidden="true">
        {text}
      </span>
      <span className="scramble__live" aria-hidden="true">
        {text.slice(0, state.solved)}
        {state.rest && <span className="scramble__rest">{state.rest}</span>}
      </span>
    </span>
  );
}
