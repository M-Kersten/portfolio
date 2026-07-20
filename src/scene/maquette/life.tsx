// The "life system" — the maquette's central mechanic. Every hotspot object
// rests as a grey ghost; visiting its project brings it (permanently) to
// colour. LifeGroup does the material lerp for everything inside it;
// EmissiveHover is the glowing-accent variant for screens/lights.
import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, CanvasTexture, Color, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, type Group, type Material, type Mesh } from 'three';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useAccent, useActive, bounceObject, type V3 } from './shared';

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
  const mat = useRef<MeshStandardMaterial>(null);
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
  return (
    <mesh ref={meshRef} position={position} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial ref={mat} userData={{ lifeSkip: true }} color={col} emissive={col} emissiveIntensity={rest} roughness={0.4} toneMapped={false} />
    </mesh>
  );
}

/** A soft radial "wave" texture — transparent at the centre, brightest in an
 *  outer band (the wavefront), fading to nothing at the rim. Scaled up over time
 *  it reads as a soft expanding wave rather than a clean-edged ring. The layer
 *  tint is baked in, lifted toward white so it's caught light, not a colour gel.
 *  Cached (three tints total). */
const waveCache = new Map<string, CanvasTexture>();
function waveTexture(tint: string): CanvasTexture {
  const cached = waveCache.get(tint);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const col = new Color(tint).lerp(new Color('#ffffff'), 0.3);
    const r = Math.round(col.r * 255);
    const g = Math.round(col.g * 255);
    const b = Math.round(col.b * 255);
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    // faint at the centre, swelling to a soft peak in the outer band, gone by the
    // rim — a diffuse wavefront that fades toward the centre (no hard outline)
    grad.addColorStop(0.0, `rgba(${r},${g},${b},0)`);
    grad.addColorStop(0.42, `rgba(${r},${g},${b},0.04)`);
    grad.addColorStop(0.66, `rgba(${r},${g},${b},0.22)`);
    grad.addColorStop(0.84, `rgba(${r},${g},${b},0.68)`);
    grad.addColorStop(0.93, `rgba(${r},${g},${b},0.3)`);
    grad.addColorStop(1.0, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new CanvasTexture(c);
  waveCache.set(tint, tex);
  return tex;
}

/** The power-on wave — the visible "it just switched on" pulse. The first time an
 *  object comes alive (the rising edge of selected/visited, i.e. the same
 *  ghost→alive moment LifeGroup glitches through), a soft wavefront (a gentle
 *  ripple of two) swells outward from its anchor and dissolves — diffuse and
 *  fading toward the centre, not a clean ring. Camera-facing so it reads from the
 *  three-quarter view; one-shot per object per session; skipped under reduced
 *  motion. The composition root places one at each hotspot's local anchor. */
const RING_DUR = 0.72; // seconds for one wave to swell + dissolve
const RING_N = 2; // a gentle ripple of this many soft waves
const RING_STAGGER = 0.2; // seconds between the two
const RING_TOTAL = RING_DUR + (RING_N - 1) * RING_STAGGER;
export function PowerRing({ slug, anchor, color }: { slug: string; anchor: V3; color: string }) {
  const { selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const camera = useThree((s) => s.camera);
  const meshes = useRef<(Mesh | null)[]>([]);
  const mats = useRef<(MeshBasicMaterial | null)[]>([]);
  const born = useRef(false);
  const t = useRef(-1); // <0 = idle; else seconds into the wave
  const tex = useMemo(() => waveTexture(color), [color]);
  useFrame((_, delta) => {
    if (reduced) return;
    if ((selected || visited) && !born.current) {
      born.current = true;
      t.current = 0; // rising edge → fire the wave once
    }
    if (t.current < 0) return; // idle: nothing to draw
    t.current += Math.min(delta, 1 / 30);
    for (let i = 0; i < RING_N; i++) {
      const m = meshes.current[i];
      if (!m) continue;
      const p = (t.current - i * RING_STAGGER) / RING_DUR; // this wave's own phase
      if (p < 0 || p >= 1) {
        m.visible = false; // not started yet, or already dissolved
        continue;
      }
      const e = 1 - Math.pow(1 - p, 3); // ease-out expansion
      m.scale.setScalar(0.16 + e * 1.0); // swells outward past the object edge
      m.quaternion.copy(camera.quaternion); // billboard toward the camera
      m.visible = true;
      const mat = mats.current[i];
      // soft in-and-out (sine) so it never snaps on; kept low so it's a whisper,
      // trailing wave fainter still
      if (mat) mat.opacity = Math.sin(Math.PI * p) * 0.5 * (1 - i * 0.35);
    }
    if (t.current >= RING_TOTAL) {
      t.current = -1; // one-shot: back to rest
      for (const m of meshes.current) if (m) m.visible = false;
    }
  });
  return (
    <group position={anchor}>
      {Array.from({ length: RING_N }, (_, i) => (
        <mesh key={i} ref={(m) => { meshes.current[i] = m; }} visible={false} renderOrder={4}>
          <circleGeometry args={[1, 48]} />
          <meshBasicMaterial ref={(m) => { mats.current[i] = m; }} map={tex} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} side={DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

/** The phone on the couch (Popcore). It buzzes on hover; on *select* it lifts
 *  off the cushion and rotates to face you, and the first time you open it a
 *  handful of ping-pong balls pop out of the screen and settle on the seat.
 *  The screen shows a screenshot once you've visited it — drop a JPG at
 *  public/textures/room-phone.jpg; until then it stays a plain glowing screen. */
