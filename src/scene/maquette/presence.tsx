// Presence — the active layer holds the light, its neighbours recede. Each
// layer's dressing is wrapped in a PresenceGroup whose eased factor multiplies
// the PROP materials' opacity: 1 on the layer you're on, PRESENCE_REST on the
// others (the fog + depth veil then push them further back).
//
// The interactive story objects are deliberately exempt: anything inside a
// LifeGroup (flagged via userData.lifeGroup) or a self-animating material
// (userData.lifeSkip) keeps running the ghost→alive mechanic untouched — the
// projects you've lit stay lit even on a dimmed layer, like windows left on.
import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { type Group, type Material, type Mesh, type Object3D } from 'three';
import { useReducedMotion } from '../../lib/useReducedMotion';

/** How bright a non-active layer rests (0..1). Raise toward 1 for less focus. */
const PRESENCE_REST = 0.42;

export function PresenceGroup({ active, children }: { active: boolean; children: ReactNode }) {
  const grp = useRef<Group>(null);
  const reduced = useReducedMotion();
  const k = useRef(active ? 1 : 0); // eased presence: 1 = the subject
  const applied = useRef(-1); // last factor written into the materials
  const snaps = useRef(new WeakMap<Material, number>()); // authored opacity per material

  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    const target = active ? 1 : 0;
    if (reduced || Math.abs(target - k.current) < 0.002) k.current = target;
    else k.current += (target - k.current) * 0.06;
    const f = PRESENCE_REST + (1 - PRESENCE_REST) * k.current;
    if (Math.abs(f - applied.current) < 0.003) return; // settled — skip the walk
    applied.current = f;
    dim(g, f, snaps.current);
  });
  return <group ref={grp}>{children}</group>;
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
