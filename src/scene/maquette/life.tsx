// The "life system" — the maquette's central mechanic. Every hotspot object
// rests as a grey ghost; visiting its project brings it (permanently) to
// colour. LifeGroup does the material lerp for everything inside it;
// EmissiveHover is the glowing-accent variant for screens/lights.
import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { Color, MeshStandardMaterial, Vector2, type Group, type Material, type Mesh, type MeshPhysicalMaterial } from 'three';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useAccent, useActive, bounceObject, type V3 } from './shared';
import { surfaceMaps } from './surface';

// Shared so the die's bump vector isn't reallocated on every render.
const DIE_BUMP = new Vector2(0.12, 0.12);

/* ---------- The life system — you give the world its colour ----------
   Every interactive object starts as a DORMANT GHOST: a faint monochrome
   wireframe (fills nearly gone, edges dimmed grey). Clicking it floods the
   authored materials back in — with a brief glitch as it materialises — and it
   stays alive for the rest of the session (store.visited). Non-interactive
   props keep their quiet glass, so the ghosts read as the things to touch. */
export const GHOST_FILL = new Color('#7d8f9a'); // desaturated blue-grey for surfaces
export const GHOST_LINE = new Color('#93a6b1'); // slightly lighter for edges/outlines

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
  const frame = useRef(0);

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
    frame.current++;
    if (l === lastApplied.current && glitch.current === 0 && frame.current % 30 !== 0) return;
    lastApplied.current = l;

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
          mm.opacity = snap.op * (0.5 + 0.5 * l);
        } else {
          if (snap.color && mm.color) mm.color.copy(GHOST_FILL).lerp(snap.color, l);
          if (snap.emissive && mm.emissive) mm.emissive.copy(GHOST_FILL).lerp(snap.emissive, l);
          mm.emissiveIntensity = snap.ei * (0.12 + 0.88 * l);
          mm.opacity = snap.op * (0.16 + 0.84 * l);
        }
      }
    });
  });
  // userData.lifeGroup marks the subtree as life-system territory, so the
  // layer-level presence dimmer (presence.tsx) keeps its hands off it.
  return <group ref={grp} userData={{ lifeGroup: true }}>{children}</group>;
}

/** An emissive surface that powers on when its hotspot is selected and stays lit
 *  once visited (no hover response) — a smooth "turn on" or a TV-style flicker.
 *  On select it also shifts toward a lifelike colour and blooms. */
export function EmissiveHover({ slug, position, rotation, args, color, liveColor, rest = 0.12, peak = 1.0, flicker = false }: {
  slug: string;
  position: V3;
  rotation?: V3;
  args: V3;
  color?: string;
  liveColor?: string;
  rest?: number;
  peak?: number;
  flicker?: boolean;
}) {
  const { accent } = useAccent();
  const col = color ?? accent;
  const { selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const mat = useRef<MeshPhysicalMaterial>(null);
  const meshRef = useRef<Mesh>(null);
  const k = useRef(0);
  const live = useRef(0);
  const base = useMemo(() => new Color(col), [col]);
  const lifelike = useMemo(() => new Color(liveColor ?? col), [liveColor, col]);
  useFrame((s, delta) => {
    if (meshRef.current) bounceObject(meshRef.current, selected, reduced, delta);
    if (!mat.current) return;
    // select → full on, and it stays on once visited; otherwise off (no hover)
    const kT = selected || visited ? 1 : 0;
    k.current += (kT - k.current) * (flicker ? 0.32 : 0.12);
    // colour resolves to lifelike once selected, and stays that way once visited
    live.current += ((selected || visited ? 1 : 0) - live.current) * 0.07;
    const t = s.clock.elapsedTime;
    // dormant = a grey whisper of the rest level; colour + brightness are the
    // visitor's to switch on (the life mechanic)
    const restLvl = rest * (0.25 + 0.75 * k.current);
    let lvl;
    if (flicker) {
      const n = reduced ? 1 : Math.max(0.18, 0.55 + 0.5 * Math.sin(t * 46) * Math.sin(t * 8.7) + 0.2 * Math.sin(t * 113));
      lvl = restLvl + k.current * peak * n;
    } else {
      const breathe = reduced ? 0 : Math.sin(t * 2.2) * 0.07;
      lvl = restLvl + k.current * (peak + breathe);
    }
    mat.current.emissiveIntensity = lvl;
    mat.current.color.copy(GHOST_FILL).lerp(base, k.current).lerp(lifelike, live.current);
    mat.current.emissive.copy(GHOST_FILL).lerp(base, k.current).lerp(lifelike, live.current);
  });
  const maps = useMemo(() => surfaceMaps(), []);
  // A bevel, not a hard box. The die is the biggest lit face in the maquette and
  // the only thing that stops a lit face reading as a flat cut-out is a rounded
  // edge for the light to travel around.
  const r = Math.min(0.014, Math.min(args[0], args[1], args[2]) / 2 - 0.002);
  return (
    <RoundedBox ref={meshRef} args={args} radius={r} smoothness={3} position={position} rotation={rotation}>
      {/* toneMapped stays ON here. Off is right for a pinprick LED — you *want*
          it to clip and bloom — but this face is 0.4 across, and unmapped it
          plateaued at pure white over its whole area: no gradient, no edge, no
          form. Through the filmic curve the same intensity rolls off instead, so
          the face keeps a falloff and the bevel still reads. */}
      <meshPhysicalMaterial
        ref={mat}
        userData={{ lifeSkip: true }}
        color={col}
        emissive={col}
        emissiveIntensity={rest}
        roughness={0.42}
        metalness={0}
        clearcoat={0.45}
        clearcoatRoughness={0.25}
        roughnessMap={maps?.roughness ?? null}
        normalMap={maps?.normal ?? null}
        normalScale={DIE_BUMP}
      />
    </RoundedBox>
  );
}


/** The phone on the couch (Popcore). It buzzes on hover; on *select* it lifts
 *  off the cushion and rotates to face you, and the first time you open it a
 *  handful of ping-pong balls pop out of the screen and settle on the seat.
 *  The screen shows a screenshot once you've visited it — drop a JPG at
 *  public/textures/room-phone.jpg; until then it stays a plain glowing screen. */
