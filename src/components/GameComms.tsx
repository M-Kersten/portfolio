import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { asset } from '../lib/asset';
import { play } from '../lib/sound';
import { useReducedMotion } from '../lib/useReducedMotion';

// Ground control: the game's messages arrive as a transmission from Merijn rather
// than as floating terminal text — a holographic bust in the corner of the
// viewport, talking to the player directly. The portrait is one of the real
// About-section photos, duotoned and scanlined in CSS (see .comms in launch.css);
// the line types in like it's coming over a link with a bit of latency.
//
// The engine drives this imperatively through `sayRef` (same pattern as the
// restart hook), so a message costs no React render in the game loop.

// The same portrait the About section lands on, so the two agree and dropping a
// real photo into public/profile/ lights this up too — no second asset to keep.
const PORTRAIT = '/profile/5.png';
const HOLD = 4200; // ms the panel stays up after the line finishes typing
const CPS = 42; // characters per second while typing

export function GameComms({
  sayRef,
  busyRef,
}: {
  /** Say a line; `stay` keeps it up instead of closing after a beat (the
   *  verdict at the end of a run). */
  sayRef: MutableRefObject<(msg: string, stay?: boolean) => void>;
  /** True while a line is on screen, so the game can hold its optional asides
   *  back rather than cutting Merijn off mid-sentence. */
  busyRef: MutableRefObject<boolean>;
}) {
  const reduced = useReducedMotion();
  const [msg, setMsg] = useState(''); // the full line
  const [shown, setShown] = useState(0); // characters revealed so far
  const [open, setOpen] = useState(false);
  const stayRef = useRef(false);
  const hideT = useRef<number>();
  const typeT = useRef<number>();

  // Register the imperative hook once. Each call re-opens the panel and restarts
  // the type-on.
  useEffect(() => {
    sayRef.current = (next: string, stay = false) => {
      stayRef.current = stay;
      window.clearTimeout(hideT.current);
      window.clearInterval(typeT.current);
      setMsg(next);
      setShown(reduced ? next.length : 0);
      setOpen(true);
      busyRef.current = true;
      play('comms-open', { volume: 0.5 });
    };
    return () => {
      sayRef.current = () => {};
      busyRef.current = false;
      window.clearTimeout(hideT.current);
      window.clearInterval(typeT.current);
    };
  }, [sayRef, busyRef, reduced]);

  // Type the line out, then hold it a beat and close.
  useEffect(() => {
    if (!open || !msg) return;
    const done = () => {
      if (stayRef.current) return;
      hideT.current = window.setTimeout(() => {
        play('comms-close', { volume: 0.5 });
        setOpen(false);
        busyRef.current = false;
      }, HOLD);
    };
    if (reduced) {
      done();
      return () => window.clearTimeout(hideT.current);
    }
    let ticks = 0;
    typeT.current = window.setInterval(() => {
      // a blip every few characters, as the line comes over the link
      if (++ticks % 3 === 0 && ticks < msg.length) play('comms-type', { volume: 0.25, rate: 0.9 + Math.random() * 0.2 });
      setShown((n) => {
        if (n >= msg.length) {
          window.clearInterval(typeT.current);
          done();
          return n;
        }
        return n + 1;
      });
    }, 1000 / CPS);
    return () => {
      window.clearInterval(typeT.current);
      window.clearTimeout(hideT.current);
    };
  }, [open, msg, reduced, busyRef]);

  const typing = shown < msg.length;

  return (
    <>
      <div className="comms" data-open={open || undefined} aria-hidden="true">
        {/* the projected bust */}
        <div className="comms__proj">
          <div className="comms__photo" style={{ backgroundImage: `url(${asset(PORTRAIT)})` }} />
          <div className="comms__scan" />
          <div className="comms__glow" />
          <span className="comms__frame">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
        {/* the transmission itself */}
        <div className="comms__body">
          <span className="comms__who">GROUND CONTROL</span>
          <p className="comms__msg">
            {msg.slice(0, shown)}
            {typing && <b className="comms__caret" />}
          </p>
        </div>
      </div>
      {/* The panel above is decorative to a screen reader (a hologram and a
          character-by-character reveal say nothing), so the line is announced
          once, in full, from outside it. */}
      <p className="visually-hidden" aria-live="polite">
        {msg}
      </p>
    </>
  );
}
