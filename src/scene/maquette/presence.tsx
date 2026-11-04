// Presence — the active layer holds the light, its neighbours recede. Each
// layer's dressing is wrapped in a PresenceGroup whose eased factor multiplies
// the PROP materials' opacity: 1 on the layer you're on, PRESENCE_REST on the
// others (the fog + depth veil then push them further back).
//
// The interactive story objects run the ghost→alive mechanic untouched:
// anything inside a LifeGroup (flagged via userData.lifeGroup) or a
// self-animating material (userData.lifeSkip) keeps its own look — the projects
// you've lit stay lit. But they recede with their layer all the same: the life
// system multiplies the factor in (PresenceCtx), and the self-animating
// materials are faded at draw time (see fadeSelfAnimated below).
import { createContext, useEffect, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { type Group, type Material, type Mesh, type Object3D, type Scene } from 'three';
import { useReducedMotion } from '../../lib/media';

/** How bright a non-active layer rests (0..1). Raise toward 1 for less focus.
 *  Kept low so the layer you're not on genuinely recedes into the fog — the one
 *  in focus should own the frame (the descent read muddy when the layer below
 *  stayed too present and competed with the active one). */
const PRESENCE_REST = 0.12;
/** Frames between the dimmer's passes over a settled layer, for whatever has
 *  mounted on it since (a model that finished loading, a piece of the launch
 *  site going up). Walking only when the factor moved left those at full
 *  strength on a layer that had already receded. */
const REWALK = 30;

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
  const scene = useThree((s) => s.scene);
  const k = useRef(active ? 1 : 0); // eased presence: 1 = the subject
  const applied = useRef(-1); // last factor written into the materials
  const frame = useRef(0);
  const snaps = useRef(new WeakMap<Material, number>()); // authored opacity per material
  const factor = useRef(active ? 1 : PRESENCE_REST); // handed to the life system

  // the self-animating materials on this layer fade at draw time (below)
  useEffect(() => {
    hookScene(scene);
    const layer = { group: grp, factor };
    LAYERS.add(layer);
    return () => {
      LAYERS.delete(layer);
    };
  }, [scene]);

  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    const target = active ? 1 : 0;
    if (reduced || Math.abs(target - k.current) < 0.002) k.current = target;
    else k.current += (target - k.current) * 0.06;
    const f = PRESENCE_REST + (1 - PRESENCE_REST) * k.current;
    factor.current = f; // published before the early-out — the story objects read it every frame
    frame.current++;
    // settled: skip the walk, bar the odd pass for late arrivals
    if (Math.abs(f - applied.current) < 0.003 && frame.current % REWALK !== 0) return;
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

/* ---------- The self-animating materials ----------
   dim() can't fade a material that animates itself (userData.lifeSkip): its
   owner rewrites it every frame, so a factor written in would be overwritten —
   or, for one written only once, compounded. Owners used to multiply the
   factor in themselves, and the ones that didn't (a phone, a screen, the
   city's windows…) stayed at full strength on a layer that had receded. So
   these are faded where nothing can overwrite it: at draw time. Just before the
   scene is drawn, every such material on a receded layer takes its layer's
   factor; straight after, it gets back what its owner wrote. An owner that
   already multiplies the factor in says so (userData.presenceOwn) and is left
   alone. */
const LAYERS = new Set<{ group: { current: Group | null }; factor: { current: number } }>();
const faded: { m: Material; op: number }[] = [];
const fadedSet = new Set<Material>();
const hooked = new WeakSet<Scene>();

function hookScene(scene: Scene) {
  if (hooked.has(scene)) return;
  hooked.add(scene);
  const before = scene.onBeforeRender;
  const after = scene.onAfterRender;
  scene.onBeforeRender = function (...args: Parameters<Scene['onBeforeRender']>) {
    before.apply(this, args);
    fadeSelfAnimated();
  };
  scene.onAfterRender = function (...args: Parameters<Scene['onAfterRender']>) {
    restoreSelfAnimated();
    after.apply(this, args);
  };
}

function fadeSelfAnimated() {
  for (const { group, factor } of LAYERS) {
    const f = factor.current;
    if (group.current && f < 0.999) fadeWalk(group.current, f);
  }
}

function fadeWalk(o: Object3D, f: number) {
  if (!o.visible) return; // not drawn anyway
  const raw = (o as Mesh).material as Material | Material[] | undefined;
  if (raw) {
    for (const m of Array.isArray(raw) ? raw : [raw]) {
      if (!m.userData.lifeSkip || m.userData.presenceOwn || fadedSet.has(m)) continue;
      if (!m.transparent) {
        // an opaque material ignores its opacity; once it has had to recede it
        // draws as glass from then on, as the dressing does (dim above)
        m.transparent = true;
        m.needsUpdate = true;
      }
      fadedSet.add(m);
      faded.push({ m, op: m.opacity });
      m.opacity *= f;
    }
  }
  for (const c of o.children) fadeWalk(c, f);
}

function restoreSelfAnimated() {
  for (let i = faded.length - 1; i >= 0; i--) faded[i].m.opacity = faded[i].op;
  faded.length = 0;
  fadedSet.clear();
}
