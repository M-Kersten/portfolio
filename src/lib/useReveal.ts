import { useEffect, useRef, useState } from 'react';
import { REVEAL } from './motion';
import { useReducedMotion } from './useReducedMotion';

/** Scroll-triggered arrival. `shown` turns true once, when the element reaches
 *  the shared REVEAL point, and straight away under reduced motion. Put
 *  `data-shown` on the element and let CSS play the arrival with the motion
 *  tokens. */
export function useReveal<T extends Element>() {
  const ref = useRef<T>(null);
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced);

  useEffect(() => {
    if (reduced) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        setShown(true);
        io.disconnect();
      }
    }, REVEAL);
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  return [ref, shown] as const;
}
