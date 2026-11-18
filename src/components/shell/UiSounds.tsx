import { useEffect } from 'react';
import { play } from '../../lib/sound';

// The sound of the site's own controls: every link and button ticks softly as
// the pointer comes onto it, and clicks as it's pressed. Heard from one place
// (two listeners on the document) rather than from each control, so a control
// added later sounds without being told to. `play` is silent while sound is
// off, so this only ever listens.
//
// Some controls have a sound of their own already, and would be heard twice:
// a hotspot (its hover, and the reticle's dial), and everything on the
// admission ticket when pressed (the card going in or out, the stub tearing).

const CONTROL = 'a[href], button, [role="button"]';
/** controls whose hover is sounded elsewhere */
const OWN_HOVER = '.hotspot__dot';
/** controls whose press is sounded elsewhere (anything on the ticket puts it away, or pulls it out) */
const OWN_PRESS = '.hotspot__dot, .guide';
/** a sweep across a row of links is thinned to a tick this often (ms) */
const HOVER_GAP = 90;

const controlAt = (target: EventTarget | null) => {
  const el = target instanceof Element ? target.closest<HTMLElement>(CONTROL) : null;
  return el && !el.matches(':disabled, [aria-disabled="true"]') ? el : null;
};

export function UiSounds() {
  useEffect(() => {
    let over: HTMLElement | null = null; // (moving about inside one control is still that control)
    let last = 0;
    const hover = (e: PointerEvent) => {
      // a finger doesn't hover: its "over" is the tap itself
      if (e.pointerType !== 'mouse') return;
      const el = controlAt(e.target);
      if (el === over) return;
      over = el;
      if (!el || el.closest(OWN_HOVER) || e.timeStamp - last < HOVER_GAP) return;
      last = e.timeStamp;
      play('hover', { volume: 0.15 });
    };
    // (click, not pointerdown: it's what the keyboard's Enter and Space make too)
    const press = (e: MouseEvent) => {
      const el = controlAt(e.target);
      if (el && !el.closest(OWN_PRESS)) play('select', { volume: 0.4 });
    };
    document.addEventListener('pointerover', hover);
    document.addEventListener('click', press);
    return () => {
      document.removeEventListener('pointerover', hover);
      document.removeEventListener('click', press);
    };
  }, []);
  return null;
}
