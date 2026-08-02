// Presence — the active layer holds the light, its neighbours recede. Each
// layer's dressing is wrapped in a PresenceGroup whose eased factor multiplies
// the PROP materials' opacity: 1 on the layer you're on, PRESENCE_REST on the
// others (the fog + depth veil then push them further back).
//
// The interactive story objects are deliberately exempt: anything inside a
// LifeGroup (flagged via userData.lifeGroup) or a self-animating material
// (userData.lifeSkip) keeps running the ghost→alive mechanic untouched — the
// projects you've lit stay lit even on a dimmed layer, like windows left on.
import { createContext, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { type Group, type Material, type Mesh, type Object3D } from 'three';
import { useReducedMotion } from '../../lib/useReducedMotion';

/** How bright a non-active layer rests (0..1). Raise toward 1 for less focus.
 *  Kept low so the layer you're not on genuinely recedes into the fog — the one
 *  in focus should own the frame (the descent read muddy when the layer below
 *  stayed too present and competed with the active one). */
const PRESENCE_REST = 0.12;

/** The active layer's eased presence, published to the story objects inside it.
 *
 *  `dim()` below deliberately refuses to touch anything the life system owns, so
 *  on its own it only fades a layer's DRESSING. That was fine while every story
 *  object was still a dim ghost, but a project you've lit stays lit — so once a
 *  visitor had explored a layer, half its mass ignored presence entirely and the
 *  layer never really receded. The materials that animate themselves multiply by
 *  this instead, which keeps the mechanic theirs and the focus ours.
 *
 *  A ref, not state: the value changes every frame and must not re-render. The
 *  object identity is stable, so the provider never invalidates its subtree. */
export const PresenceCtx = createContext<{ current: number }>({ current: 1 });

export function PresenceGroup({ active, children }: { active: boolean; children: ReactNode }) {
  const grp = useRef<Group>(null);
  const reduced = useReducedMotion();
  const k = useRef(active ? 1 : 0); // eased presence: 1 = the subject
  const applied = useRef(-1); // last factor written into the materials
  const snaps = useRef(new WeakMap<Material, number>()); // authored opacity per material
  const factor = useRef(active ? 1 : PRESENCE_REST); // handed to the life system

  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    const target = active ? 1 : 0;
    if (reduced || Math.abs(target - k.current) < 0.002) k.current = target;
    else k.current += (target - k.current) * 0.06;
    const f = PRESENCE_REST + (1 - PRESENCE_REST) * k.current;
    factor.current = f; // published before the early-out — the story objects read it every frame
    if (Math.abs(f - applied.current) < 0.003) return; // settled — skip the walk
    applied.current = f;
    dim(g, f, snaps.current);
  });
  return (
    <PresenceCtx.Provider value={factor}>
      <group ref={grp}>{children}</group>
    </PresenceCtx.Provider>
  );
}

// Walk the layer's subtree, skipping whole LifeGroup subtrees and any material
// that animates itself. New materials are snapshotted the first time they're
// seen (they mount at their authored opacity), so late arrivals join cleanly.
function dim(o: Object3D, f: number, snaps: WeakMap<Material, number>) {
  if (o.userData.lifeGroup) return; // the life system owns everything inside
  const raw = (o as Mesh).material as Material | Material[] | undefined;
  if (raw) {
    for (const m of Array.isArray(raw) ? raw : [raw]) {
      if (m.userData.lifeSkip) continue; // self-animating material
      let base = snaps.get(m);
      if (base === undefined) {
        base = m.opacity;
        if (!m.transparent) {
          m.transparent = true;
          m.needsUpdate = true;
        }
        snaps.set(m, base);
      }
      m.opacity = base * f;
    }
  }
  for (const c of o.children) dim(c, f, snaps);
}
