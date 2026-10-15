// The "life system" — the maquette's central mechanic. Every hotspot object
// rests as a grey ghost; visiting its project brings it (permanently) to
// colour. LifeGroup does the material lerp for everything inside it.
import { useContext, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, MeshStandardMaterial, type Group, type Material, type Mesh } from 'three';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useActive } from './shared';
import { PresenceCtx } from './presence';

/* ---------- The life system — you give the world its colour ----------
   Every interactive object starts as a DORMANT GHOST: a faint monochrome
   wireframe (fills nearly gone, edges dimmed grey). Clicking it floods the
   authored materials back in — with a brief glitch as it materialises — and it
   stays alive for the rest of the session (store.visited). Non-interactive
   props keep their quiet glass, so the ghosts read as the things to touch. */
// Seeds match fxTweak's FX_DEFAULTS (the live source — Stage's SelectDim pushes
// the config into these Colors every frame; matching seeds keep any material
// that bakes the value at mount consistent with the first painted frame).
export const GHOST_FILL = new Color('#a8c4e4'); // pale drawing-blue for surfaces
export const GHOST_LINE = new Color('#c6dcf4'); // brighter ink for edges/outlines

interface LifeSnap {
  color: Color | null;
  emissive: Color | null;
  ei: number;
  op: number;
  isLine: boolean;
}

/** Wraps one hotspot's object subtree. Static materials are snapshotted on
 *  first sight and per-frame lerped between the ghost preset and their authored
 *  state by a life factor (hover lifts it a whisper; select/visited = 1).
 *  Materials that animate themselves opt out via `userData.lifeSkip` and blend
 *  their own ghost→alive keyed on the same selected/visited state. */
export function LifeGroup({ slug, children }: { slug: string; children: ReactNode }) {
  const { hovered, selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const grp = useRef<Group>(null);
  const L = useRef(0);
  const snaps = useRef(new WeakMap<Material, LifeSnap>());
  const born = useRef(false);
  const glitch = useRef(0);
  const idle = useRef(8 + Math.random() * 9);
  const lastApplied = useRef(-1); // last life level written to the materials
  const lastPres = useRef(-1); // …and the layer presence it was written at
  const frame = useRef(0);
  const presence = useContext(PresenceCtx);

  useFrame((s, delta) => {
    const g = grp.current;
    if (!g) return;
    const dt = Math.min(delta, 1 / 30);
    const alive = selected || visited;
    const target = alive ? 1 : hovered ? 0.22 : 0;
    if (reduced || Math.abs(target - L.current) < 0.001) L.current = target;
    else L.current += (target - L.current) * 0.09;
    // materialise: a short glitchy flicker the first time it comes alive…
    if (alive && !born.current) {
      born.current = true;
      if (!reduced) glitch.current = 0.5;
    }
    if (glitch.current > 0) glitch.current = Math.max(0, glitch.current - dt);
    else if (born.current && !reduced) {
      // …and a rare single blink afterwards — the minimal glitch garnish
      idle.current -= dt;
      if (idle.current <= 0) {
        glitch.current = 0.07;
        idle.current = 9 + Math.random() * 12;
      }
    }
    const flick = glitch.current > 0 && Math.sin(s.clock.elapsedTime * 93) > 0.35 ? 0.3 : 1;
    const l = Math.max(0, Math.min(1, L.current)) * flick;

    // Steady state (most of the time): the level already written hasn't moved,
    // so skip the subtree walk — except a periodic pass that catches materials
    // appearing late (e.g. a texture-swapped plane) and pulls them to level.
    // A layer that isn't the subject recedes, lit projects included — otherwise
    // exploring the site permanently un-dims everything you've been to.
    const pf = presence.current;
    frame.current++;
    if (l === lastApplied.current && pf === lastPres.current && glitch.current === 0 && frame.current % 30 !== 0) return;
    lastApplied.current = l;
    lastPres.current = pf;

    g.traverse((o) => {
      const raw = (o as Mesh).material as Material | Material[] | undefined;
      if (!raw) return;
      const mats = Array.isArray(raw) ? raw : [raw];
      for (const m of mats) {
        if (m.userData.lifeSkip) continue;
        const mm = m as MeshStandardMaterial; // duck-typed; guarded per property
        let snap = snaps.current.get(m);
        if (!snap) {
          snap = {
            color: mm.color ? mm.color.clone() : null,
            emissive: mm.emissive ? mm.emissive.clone() : null,
            ei: mm.emissiveIntensity ?? 0,
            op: mm.opacity ?? 1,
            isLine: (m as { isLineBasicMaterial?: boolean }).isLineBasicMaterial === true || (m as { isLineMaterial?: boolean }).isLineMaterial === true,
          };
          if (!m.transparent) {
            m.transparent = true;
            m.needsUpdate = true;
          }
          snaps.current.set(m, snap);
        }
        if (snap.isLine) {
          // edges + outlines stay readable — they ARE the ghost's wireframe
          if (snap.color && mm.color) mm.color.copy(GHOST_LINE).lerp(snap.color, l);
          mm.opacity = snap.op * (0.5 + 0.5 * l) * pf;
        } else {
          if (snap.color && mm.color) mm.color.copy(GHOST_FILL).lerp(snap.color, l);
          if (snap.emissive && mm.emissive) mm.emissive.copy(GHOST_FILL).lerp(snap.emissive, l);
          mm.emissiveIntensity = snap.ei * (0.12 + 0.88 * l) * pf;
          mm.opacity = snap.op * (0.16 + 0.84 * l) * pf;
        }
      }
    });
  });
  // userData.lifeGroup marks the subtree as life-system territory, so the
  // layer-level presence dimmer (presence.tsx) keeps its hands off it.
  return <group ref={grp} userData={{ lifeGroup: true }}>{children}</group>;
}
