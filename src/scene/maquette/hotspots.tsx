// The floating crosshair markers that invite a click on each project. The DOM
// part (crosshair, brackets, label) lives in a drei <Html>; the leader line and
// anchor ring are real scene geometry so they sit in the fog like everything
// else. Styling lives in src/ui (search ".hotspot").
import { useEffect, useRef, type CSSProperties, type ElementRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { type MeshBasicMaterial } from 'three';
import { sceneStore } from '../store';
import { caseBySlug } from '../../content';
import { Scramble } from '../../components/shell/Scramble';
import { type Hotspot } from '../framing';
import { useReducedMotion } from '../../lib/media';
import { Line, useActive, type V3 } from './shared';

// The museum's own invitation, the sign on a hands-on exhibit: it says the same
// thing to a mouse and a finger, and the title wall says it first.
const CUE_TEXT = 'please touch';
// Closing an exhibit, the markers come back once the camera has mostly pulled
// out, not while it's still flying (the crosshairs wait the same in
// hotspots.css); they go at once.
const SHOW_DELAY = 0.4;

// A floor's names stand in one row over their crosshairs (hotspots.css) until
// two would run into each other, or one into the title wall's lines or the
// flight simulator's sign over the pad: then the one further right moves up a
// row, or two, to wherever it clears what's already there (and where nothing
// clears, to wherever it overlaps least). Worked out from the screen a few
// times a second, since where the crosshairs land changes with the window and
// the floor; a name only comes back down once there's clear room for it, so
// the camera's idle sway can't set it flickering between rows.
const ROWS = 3;
const GAP = 6; // px kept clear between two names in a row
const DOWN_GAP = 16; // …and the room a raised name wants before it comes back down
const NAME_TICK_MS = 300;

type Box = { l: number; r: number; t: number; b: number };

/** What else is on screen for the names to keep clear of: the title wall's
 *  lines of text while it shows (the line boxes of its words, not the boxes of
 *  the elements holding them: a heading's box runs the wall's full width), and
 *  the flight simulator's sign while it's up. */
function obstacles(): Box[] {
  const lines: Box[] = [];
  const sign = document.querySelector<HTMLElement>('.nextsite-wrap');
  if (sign && parseFloat(sign.style.opacity || '0') > 0.5) {
    const r = sign.getBoundingClientRect();
    lines.push({ l: r.left, r: r.right, t: r.top, b: r.bottom });
  }
  const title = document.querySelector<HTMLElement>('.hero__title');
  if (!title || parseFloat(getComputedStyle(title).opacity) < 0.05) return lines;
  const range = document.createRange();
  const words = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
  for (let t = words.nextNode(); t; t = words.nextNode()) {
    // (not the copy kept for screen readers: off screen, it measures as one
    // long line across the wall)
    if (!t.textContent?.trim() || t.parentElement?.closest('.visually-hidden')) continue;
    range.selectNodeContents(t);
    for (const r of range.getClientRects()) if (r.width > 0) lines.push({ l: r.left, r: r.right, t: r.top, b: r.bottom });
  }
  return lines;
}

/** Keeps the shown floor's marker names out of each other's way, and out of
 *  the title wall and the simulator's sign (see ROWS); phones show no names,
 *  and then there's nothing to do. */
export function useNameRows(layer: string) {
  useEffect(() => {
    const tick = () => {
      // (not while the tab is hidden, nor once the page has scrolled on past
      // the model: the hero is 1.4 screens tall)
      if (document.hidden || window.scrollY > window.innerHeight * 1.6) return;
      const names = [...document.querySelectorAll<HTMLElement>('.hotspot')].flatMap((el) => {
        const mark = el.querySelector('.hotspot__mark');
        const name = el.querySelector<HTMLElement>('.hotspot__label-fill');
        if (!mark || !name?.offsetWidth) return [];
        // measured off the crosshair, which a raised name doesn't move: every
        // name sits the same way over its own, so that offset drops out
        const m = mark.getBoundingClientRect();
        const em = parseFloat(getComputedStyle(name).fontSize);
        // a row up is 1.5em (hotspots.css); the letters themselves take about
        // 1.15em of it, which is what mustn't touch
        return [{ el, x: m.left + m.width / 2, y: m.top, w: name.offsetWidth, h: 1.15 * em, lift: 1.5 * em, row: Number(el.dataset.row ?? 0) }];
      });
      if (!names.length) return;
      names.sort((a, b) => a.x - b.x);
      const placed: Box[] = obstacles();
      for (const n of names) {
        const at = (row: number): Box => ({ l: n.x - n.w / 2, r: n.x + n.w / 2, t: n.y - row * n.lift - n.h, b: n.y - row * n.lift });
        // how much a name in this row would cover of what's there already
        const hit = (row: number, gap: number) => {
          const box = at(row);
          return placed.reduce((sum, p) => {
            const x = Math.min(box.r + gap, p.r) - Math.max(box.l - gap, p.l);
            const y = Math.min(box.b + 2, p.b) - Math.max(box.t - 2, p.t);
            return x > 0 && y > 0 ? sum + x * y : sum;
          }, 0);
        };
        let row = 0;
        while (row < ROWS && hit(row, row < n.row ? DOWN_GAP : GAP) > 0) row++;
        if (row === ROWS) {
          // nowhere clear: wherever it covers least, staying put on a tie
          let best = n.row;
          for (let r = 0; r < ROWS; r++) if (hit(r, GAP) < hit(best, GAP)) best = r;
          row = best;
        }
        placed.push(at(row));
        if (row !== n.row) {
          n.el.dataset.row = String(row);
          n.el.style.setProperty('--row', String(row));
        }
      }
    };
    tick();
    const id = window.setInterval(tick, NAME_TICK_MS);
    return () => window.clearInterval(id);
  }, [layer]);
}

export function HotspotMarker({
  hotspot,
  color,
  onActivate,
  hidden,
  cue,
  phase = 0,
}: {
  hotspot: Hotspot;
  color: string;
  onActivate: (h: Hotspot) => void;
  hidden: boolean;
  /** the first-visit cue: 'lead' asks to be clicked, 'hold' keeps still for it */
  cue?: 'lead' | 'hold';
  /** 0–1: where in the shared pulse this marker pings, so a layer's markers
   *  take turns rather than flashing in unison */
  phase?: number;
}) {
  const study = caseBySlug(hotspot.slug);
  const label = study?.title ?? hotspot.slug;
  const { selected, visited } = useActive(hotspot.slug);
  // The marker is the invitation to click — it always carries the layer
  // accent so it stands out against the ghost world, growing a touch
  // brighter once the object it points to has been brought alive. While ANY
  // node is open the markers all vanish, so the HUD gets a clean stage.
  const alive = selected || visited;
  // the leader drops straight down onto the object's top (Hotspot.foot)
  const foot: V3 = [hotspot.position[0], hotspot.foot, hotspot.position[2]];
  // the leader line and the ring fade with the crosshair rather than popping
  const reduced = useReducedMotion();
  const lineRef = useRef<ElementRef<typeof Line>>(null);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const shown = useRef(hidden ? 0 : 1);
  const since = useRef(SHOW_DELAY);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    since.current = hidden ? 0 : since.current + dt;
    const want = !hidden && since.current >= SHOW_DELAY ? 1 : 0;
    shown.current = reduced ? (hidden ? 0 : 1) : shown.current + (want - shown.current) * (1 - Math.exp(-(want ? 7 : 14) * dt));
    const line = lineRef.current?.material as { opacity: number } | undefined;
    if (line) line.opacity = shown.current * (alive ? 0.55 : 0.4);
    if (ringMat.current) ringMat.current.opacity = shown.current * (alive ? 0.65 : 0.48);
  });
  return (
    <group>
      {/* leader line from the object up to the floating crosshair */}
      <Line ref={lineRef} points={[foot, hotspot.position]} color={color} lineWidth={1} transparent opacity={0} />
      {/* a ring where the line meets the object */}
      <mesh position={[foot[0], foot[1] + 0.003, foot[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.016, 0.027, 20]} />
        <meshBasicMaterial ref={ringMat} color={color} transparent opacity={0} side={2} toneMapped={false} />
      </mesh>
      <Html position={hotspot.position} center zIndexRange={[20, 0]} className="hotspot-wrap">
        <span
          className="hotspot"
          data-open={selected || undefined}
          data-alive={alive || undefined}
          data-hidden={hidden || undefined}
          data-cue={cue}
          style={{ '--hot': color, '--phase': phase } as CSSProperties}
        >
          <button
            type="button"
            className="hotspot__dot"
            aria-label={`Open ${label}`}
            onPointerEnter={() => sceneStore.setHovered(hotspot.slug)}
            onPointerLeave={() => sceneStore.setHovered(null)}
            onFocus={() => sceneStore.setHovered(hotspot.slug)}
            onBlur={() => sceneStore.setHovered(null)}
            onClick={() => {
              sceneStore.setHovered(null);
              onActivate(hotspot);
            }}
          >
            {/* crosshair (always) + scanner brackets that lock on hover/open */}
            <span className="hotspot__mark" aria-hidden="true">
              <b />
              <i />
              <i />
              <i />
              <i />
            </span>
            <span className="hotspot__label">
              <span className="hotspot__label-fill">{label}</span>
            </span>
            {/* The first-visit cue's tag, decoding in under the name. Decoration:
                the button already says which exhibit it opens. */}
            {cue === 'lead' && (
              <span className="hotspot__cue" aria-hidden="true">
                <Scramble text={CUE_TEXT} delay={240} />
              </span>
            )}
          </button>
        </span>
      </Html>
    </group>
  );
}

