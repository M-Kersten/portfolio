import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ComponentProps, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, Html, Line as DreiLine, RoundedBox } from '@react-three/drei';
import { AdditiveBlending, Box3, BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, DoubleSide, Line as ThreeLine, LineBasicMaterial, MeshStandardMaterial, Shape, ShapeGeometry, SRGBColorSpace, TextureLoader, TubeGeometry, Vector3, type Group, type Material, type Mesh, type Object3D, type Points as ThreePoints, type Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MAQUETTE_LAYERS, HOTSPOTS, LAYER_Y, LAYER_SCALE, anchorWorld, type Hotspot, type LayerId } from './framing';
import { useTweak } from './devTweak';
import { sceneStore, useSceneSelector } from './store';
import { useReducedMotion } from '../lib/useReducedMotion';
import { asset } from '../lib/asset';
import { caseBySlug } from '../content';

// Scale ladder (top → bottom): City (GIS / location), Room (games / apps / web),
// Chip (tools / CV / data). Each layer is a flat field of dots that fade into
// the background toward the rim, holding rounded, curved-line objects: round
// towers + domes + curved roads (city), soft furniture (room), a round die +
// curved traces (chip). Lines are a calm neutral; the layer accent (city =
// cyan, room = coral, chip = lime) is reserved for highlights, the floor and a
// sparse drifting point field.

const NEUTRAL = '#9fb6c6'; // soft white-blue — the wireframe lines
const GLASS = '#5b7da0';
const BG = '#0a0d10';

interface Palette {
  accent: string;
}
const PALETTE: Record<LayerId, Palette> = {
  city: { accent: '#27e8f2' },
  room: { accent: '#ff9068' },
  chip: { accent: '#a9f75c' },
};
const AccentCtx = createContext<Palette>(PALETTE.city);
const useAccent = () => useContext(AccentCtx);

type V3 = [number, number, number];

/* ---------- maths helpers ---------- */
function circlePts(r: number, seg = 56): V3[] {
  const p: V3[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    p.push([Math.cos(a) * r, 0, Math.sin(a) * r]);
  }
  return p;
}
function roundedRectPts(w: number, d: number, r: number, seg = 6): V3[] {
  const rr = Math.max(0.001, Math.min(r, w / 2 - 0.001, d / 2 - 0.001));
  const hw = w / 2 - rr;
  const hd = d / 2 - rr;
  const pts: V3[] = [];
  const corner = (cx: number, cz: number, a0: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * rr, 0, cz + Math.sin(a) * rr]);
    }
  };
  corner(hw, hd, 0);
  corner(-hw, hd, Math.PI / 2);
  corner(-hw, -hd, Math.PI);
  corner(hw, -hd, Math.PI * 1.5);
  pts.push(pts[0]);
  return pts;
}
function smoothCurve(pts: V3[], n = 50): V3[] {
  const curve = new CatmullRomCurve3(pts.map((p) => new Vector3(p[0], p[1], p[2])));
  return curve.getPoints(n).map((v) => [v.x, v.y, v.z] as V3);
}
function makeRand(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wrap drei's Line so every maquette line participates in the scene fog (its
 *  LineMaterial otherwise ignores fog), fading with depth like the meshes. */
function Line(props: ComponentProps<typeof DreiLine>) {
  return <DreiLine fog {...props} />;
}

/* ---------- Hover behaviours ----------
   Hovering a project's dot animates the object in a way that fits what it is:
   the phone vibrates, the monitor + chip + AR projection power on / flicker, the
   building windows light up, the park's trees rustle. Each reads the hovered
   slug from the store and eases a 0→1 value it drives its motion from. */
function useActive(slug: string) {
  const hovered = useSceneSelector((s) => s.hoveredSlug) === slug;
  const selected = useSceneSelector((s) => s.selectedSlug) === slug;
  const visited = useSceneSelector((s) => s.visited.includes(slug));
  return { hovered, selected, visited };
}
// A springy squash-and-stretch bounce on the rising edge of `selected` — the
// picked object springs to life in place, then settles back to rest. State is
// stashed on the object's userData so call sites just hand us the group/mesh each
// frame. Meant for a non-rotated (or yaw-only) object so the stretch runs along
// world-up; scaling anchors at the object's local origin.
function bounceObject(obj: Object3D, selected: boolean, reduced: boolean, delta: number, amp = 0.28) {
  const u = obj.userData;
  if (selected && !u.bPrev && !reduced) u.bPop = 1; // trigger on the rising edge
  u.bPrev = selected;
  u.bPop = Math.max(0, (u.bPop ?? 0) - delta * 2.1);
  // phase 0 at the trigger → 1 as it settles; a decaying cosine gives an initial
  // stretch that oscillates (stretch → squash → settle) back to rest.
  const spring = reduced ? 0 : Math.cos((1 - u.bPop) * Math.PI * 3) * u.bPop;
  const sq = spring * amp;
  obj.scale.set(1 - sq, 1 + sq, 1 - sq);
}

/** Load an optional texture from /public. Resolves to null while loading and
 *  stays null when the file hasn't been provided, so objects keep their plain
 *  procedural fallback (used by the monitor, the phone and the Zwijsen book). */
function useOptionalTexture(path: string): Texture | null {
  const [tex, setTex] = useState<Texture | null>(null);
  useEffect(() => {
    let cancelled = false;
    new TextureLoader().load(
      asset(path),
      (t) => {
        t.colorSpace = SRGBColorSpace;
        if (cancelled) t.dispose();
        else setTex(t);
      },
      undefined,
      () => {}, // absent file → keep the fallback
    );
    return () => {
      cancelled = true;
    };
  }, [path]);
  return tex;
}

/* ---------- The life system — you give the world its colour ----------
   Every interactive object starts as a DORMANT GHOST: a faint monochrome
   wireframe (fills nearly gone, edges dimmed grey). Clicking it floods the
   authored materials back in — with a brief glitch as it materialises — and it
   stays alive for the rest of the session (store.visited). Non-interactive
   props keep their quiet glass, so the ghosts read as the things to touch. */
const GHOST_FILL = new Color('#7d8f9a'); // desaturated blue-grey for surfaces
const GHOST_LINE = new Color('#93a6b1'); // slightly lighter for edges/outlines

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
function LifeGroup({ slug, children }: { slug: string; children: ReactNode }) {
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
  return <group ref={grp}>{children}</group>;
}

/** An emissive surface that powers on when its hotspot is selected and stays lit
 *  once visited (no hover response) — a smooth "turn on" or a TV-style flicker.
 *  On select it also shifts toward a lifelike colour and blooms. */
function EmissiveHover({ slug, position, rotation, args, color, liveColor, rest = 0.12, peak = 1.0, flicker = false }: {
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

/** The phone on the couch (Popcore). It buzzes on hover; on *select* it lifts
 *  off the cushion and rotates to face you, and the first time you open it a
 *  handful of ping-pong balls pop out of the screen and settle on the seat.
 *  The screen shows a screenshot once you've visited it — drop a JPG at
 *  public/textures/room-phone.jpg; until then it stays a plain glowing screen. */
const PHONE_BALLS = 6;
const COUCH_SEAT_Y = 0.2; // top of the couch cushion, in couch-local space
function Phone({ slug, position, args, liveColor }: { slug: string; position: V3; args: V3; liveColor: string }) {
  const { accent } = useAccent();
  const { hovered, selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const rigRef = useRef<Group>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const k = useRef(0); // emissive hover/select level
  const glow = useRef(0); // 0 → 1 shift toward the lifelike colour
  const turn = useRef(0); // 0 = lying flat, 1 = lifted + facing the user
  const buzz = useRef(0); // hover buzz envelope
  const base = useMemo(() => new Color(accent), [accent]);
  const lifelike = useMemo(() => new Color(liveColor), [liveColor]);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;

  // Ping-pong balls — each carries its own little bit of physics, fired once on
  // the first open. Held as plain objects (mutated in useFrame, not React state).
  const balls = useMemo(
    () => Array.from({ length: PHONE_BALLS }, () => ({ mesh: null as Mesh | null, vel: new Vector3(), delay: 0 })),
    [],
  );
  const R = 0.015; // ball radius
  const fired = useRef(false);
  const shown = useRef(false); // whether the screenshot is currently mapped on
  const tex = useOptionalTexture('/textures/room-phone.jpg');

  useFrame((s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const t = s.clock.elapsedTime;

    // --- lift, scale, and rotate toward the user on select; buzz on hover while resting ---
    const rig = rigRef.current;
    if (rig) {
      turn.current += ((selected ? 1 : 0) - turn.current) * 0.1;
      const tt = reduced ? (selected ? 1 : 0) : turn.current;
      buzz.current += ((hovered || selected ? 1 : 0) - buzz.current) * 0.2;
      const a = reduced ? 0 : buzz.current * (1 - tt); // buzz fades as it stands up
      
      // Tweak this value to match your scene's camera angle:
      // Positive values (e.g., 0.35) rotate it right; negative values (e.g., -0.35) rotate it left.
      const YAW_OFFSET = 0.38; 

      rig.rotation.set(
        mix(-Math.PI / 2, -0.15, tt), 
        mix(0, YAW_OFFSET, tt) + (Math.sin(t * 45) * 0.022 * a), 
        mix(0.3, 0.0, tt)
      );
      
      rig.position.set(
        position[0] + Math.sin(t * 50) * 0.005 * a,
        position[1] + tt * 0.14, 
        position[2] + Math.cos(t * 58) * 0.005 * a,
      );

      const sLvl = mix(1, 1.35, tt);
      rig.scale.set(sLvl, sLvl, sLvl);
    }

    // --- emissive screen: glows on hover/visit, and swaps to a screenshot once
    // the texture is loaded and the node is opened/visited (else the plain glow) ---
    if (mat.current) {
      const m = mat.current;
      k.current += ((hovered || selected ? 1 : visited ? 0.42 : 0) - k.current) * 0.12;
      glow.current += ((selected || visited ? 1 : 0) - glow.current) * 0.07;
      const wantImg = (selected || visited) && !!tex;
      if (wantImg !== shown.current) {
        shown.current = wantImg;
        m.map = null;
        m.emissiveMap = wantImg ? tex : null;
        m.needsUpdate = true;
      }
      const breathe = reduced ? 0 : Math.sin(t * 2.2) * 0.07;
      // ghost screen until it's opened: grey and dim; hover only brightens it a
      // touch ("trying to wake"), colour floods in on click and stays
      m.emissiveIntensity = (wantImg ? 0.62 : 0.14 + 0.38 * glow.current) + k.current * (0.3 + breathe);
      if (wantImg) {
        m.color.set('#000000');
        m.emissive.set('#ffffff');
        m.emissiveIntensity = 0.8;
      } else {
        m.color.copy(GHOST_FILL).lerp(base, Math.max(glow.current, k.current * 0.3)).lerp(lifelike, glow.current);
        m.emissive.copy(GHOST_FILL).lerp(base, Math.max(glow.current, k.current * 0.3)).lerp(lifelike, glow.current);
      }
    }

    // --- fire the balls once, on the first open ---
    if (selected && !fired.current) {
      fired.current = true;
      balls.forEach((b, i) => {
        if (!b.mesh) return;
        if (reduced) {
          // no launch — just scatter them at rest on the cushion around the phone
          const ang = (i / PHONE_BALLS) * Math.PI * 2;
          b.mesh.position.set(position[0] + Math.cos(ang) * 0.07, COUCH_SEAT_Y + R, position[2] + Math.sin(ang) * 0.05);
          b.mesh.visible = true;
        } else {
          const ang = (i / PHONE_BALLS) * Math.PI * 2 + 0.6;
          b.delay = i * 0.045; // slight stagger → a little spray
          b.vel.set(Math.cos(ang) * (0.1 + Math.random() * 0.1), 0.62 + Math.random() * 0.3, Math.sin(ang) * (0.1 + Math.random() * 0.1));
          b.mesh.position.set(position[0], position[1] + 0.03, position[2]);
          b.mesh.visible = false; // shown once its stagger delay elapses
        }
      });
    }

    // --- integrate the balls: launch, arc under gravity, bounce, settle ---
    if (fired.current && !reduced) {
      const restY = COUCH_SEAT_Y + R;
      for (const b of balls) {
        if (!b.mesh) continue;
        if (b.delay > 0) {
          b.delay -= dt;
          continue;
        }
        b.mesh.visible = true;
        b.vel.y -= 2.6 * dt; // gravity
        b.mesh.position.addScaledVector(b.vel, dt);
        if (b.mesh.position.y <= restY) {
          b.mesh.position.y = restY;
          if (Math.abs(b.vel.y) < 0.14) b.vel.set(0, 0, 0); // settled
          else {
            b.vel.y = -b.vel.y * 0.5; // bounce
            b.vel.x *= 0.72;
            b.vel.z *= 0.72;
          }
        }
      }
    }
  });

  return (
    <>
      <group ref={rigRef} position={position} rotation={[-Math.PI / 2, 0, 0.3]}>
        {/* body / bezel */}
        <mesh>
          <boxGeometry args={args} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.28} roughness={0.4} toneMapped={false} />
        </mesh>
        {/* screen face — a ghost glow until opened, then the screenshot */}
        <mesh position={[0, 0, args[2] / 2 + 0.0006]}>
          <planeGeometry args={[args[0] * 0.86, args[1] * 0.93]} />
          <meshStandardMaterial ref={mat} userData={{ lifeSkip: true }} color={accent} emissive={accent} emissiveIntensity={0.5} roughness={0.4} toneMapped={true} />
        </mesh>
      </group>
      {balls.map((b, i) => (
        <mesh
          key={i}
          ref={(m) => {
            b.mesh = m;
          }}
          position={position}
          visible={false}
        >
          <sphereGeometry args={[R, 16, 12]} />
          <meshStandardMaterial color="#fffdf5" emissive="#fff0d0" emissiveIntensity={0.2} roughness={0.55} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/** The room monitor. At rest it's a dim screen that flickers on as you hover;
 *  once visited it switches to a real screenshot (drop a JPG at
 *  public/textures/room-screen.jpg). Until that file exists it falls back to the
 *  plain lit screen, so nothing breaks. */
function RoomScreen({ slug, position, rotation, args }: { slug: string; position: V3; rotation?: V3; args: V3 }) {
  const { accent } = useAccent();
  const { hovered, selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const mat = useRef<MeshStandardMaterial>(null);
  const meshRef = useRef<Mesh>(null);
  const k = useRef(0);
  const shown = useRef(false);
  const tex = useOptionalTexture('/textures/room-screen.jpg');
  const live = useRef(0);
  const accentC = useMemo(() => new Color(accent), [accent]);
  useFrame((s, delta) => {
    if (meshRef.current) bounceObject(meshRef.current, selected, reduced, delta);
    const m = mat.current;
    if (!m) return;
    k.current += ((hovered || selected ? 1 : visited ? 0.42 : 0) - k.current) * 0.3;
    live.current += ((selected || visited ? 1 : 0) - live.current) * 0.08;
    const wantImg = (selected || visited) && !!tex;
    if (wantImg !== shown.current) {
      shown.current = wantImg;
      m.map = wantImg ? tex : null;
      m.emissiveMap = wantImg ? tex : null;
      m.needsUpdate = true;
    }
    const t = s.clock.elapsedTime;
    const n = reduced ? 1 : Math.max(0.2, 0.6 + 0.45 * Math.sin(t * 46) * Math.sin(t * 8.7));
    if (shown.current) {
      m.color.set('#ffffff');
      m.emissive.set('#ffffff');
      m.emissiveIntensity = 0.6 + k.current * 0.5;
    } else {
      // ghost screen: grey + dim; hovering makes it flicker like it's trying to
      // wake, the colour itself only arrives when the visitor opens it
      m.color.copy(GHOST_FILL).lerp(accentC, live.current);
      m.emissive.copy(GHOST_FILL).lerp(accentC, live.current);
      m.emissiveIntensity = 0.08 + 0.34 * live.current + k.current * 0.9 * n;
    }
  });
  return (
    <mesh ref={meshRef} position={position} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial ref={mat} userData={{ lifeSkip: true }} color={accent} emissive={accent} emissiveIntensity={0.3} roughness={0.4} toneMapped={false} />
    </mesh>
  );
}

/** Drives the shared window material: hovering the town hall lights the whole
 *  skyline's windows (a calm blue). Once visited they stay softly lit, so the
 *  skyline keeps a quiet glow — toned down, never warm/orange. */
function WindowDriver({ mat }: { mat: MeshStandardMaterial }) {
  const { hovered, visited } = useActive('alliander-hololens');
  const reduced = useReducedMotion();
  const k = useRef(0);
  useFrame((s) => {
    const kT = hovered ? 1 : visited ? 0.5 : 0;
    k.current += (kT - k.current) * 0.09;
    const t = s.clock.elapsedTime;
    const flick = reduced ? 1 : 0.82 + 0.18 * Math.sin(t * 26) * Math.sin(t * 6.3);
    mat.emissiveIntensity = k.current * 1.1 * flick;
    mat.opacity = 0.08 + k.current * 0.6;
  });
  return null;
}

/* ---------- materials ---------- */

// A soft white-blue fresnel rim so the frosted-glass forms catch light along
// their silhouettes (more premium, less flat plastic). Injected into the
// standard material before fog/tonemapping so the rim hazes + tonemaps too.
const RIM = new Color('#b9d2e0');
function glassRim(shader: any) {
  shader.uniforms.uRim = { value: RIM };
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', 'uniform vec3 uRim;\nvoid main() {')
    .replace(
      '#include <opaque_fragment>',
      [
        '#include <opaque_fragment>',
        // Fresnel rim.
        'float _rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.6);',
        'gl_FragColor.rgb += uRim * _rim * 0.5;',
        'gl_FragColor.a = clamp(gl_FragColor.a + _rim * 0.32, 0.0, 1.0);',
        // A fine screen-space dot-grid printed across every glass surface, so the
        // maquette carries the same dithered / halftone texture as the rest of the
        // site. Screen-locked (not surface-mapped), so overlapping panes stay
        // coherent; kept gentle so the delicate glass still reads.
        'float _dg = sin(gl_FragCoord.x * 1.7) * sin(gl_FragCoord.y * 1.7);',
        'float _dot = smoothstep(-0.2, 0.6, _dg);',
        'gl_FragColor.rgb *= 0.85 + 0.3 * _dot;',
        'gl_FragColor.a = clamp(gl_FragColor.a * (0.9 + 0.16 * _dot), 0.0, 1.0);',
      ].join('\n'),
    );
}

function GlassMat({ color = GLASS, opacity = 0.2 }: { color?: string; opacity?: number }) {
  return (
    <meshStandardMaterial
      color={color}
      transparent
      opacity={opacity}
      roughness={0.34}
      metalness={0}
      emissive="#0c2a30"
      emissiveIntensity={0.14}
      depthWrite={false}
      onBeforeCompile={glassRim}
    />
  );
}

/** Like GlassMat, but the body resolves to a near-solid, glossier material once
 *  its hotspot has been visited — so visited objects read as "real". Hotspot
 *  bodies rest as a grey ghost (the life mechanic); companion furniture passes
 *  `ghost={false}` to rest as its plain authored glass and only change material
 *  when its hotspot is engaged. `solid` caps how opaque it becomes. */
function LiveGlassMat({ slug, color = GLASS, opacity = 0.2, ghost = true, solid = 0.94 }: { slug: string; color?: string; opacity?: number; ghost?: boolean; solid?: number }) {
  const { selected, visited } = useActive(slug);
  const mat = useRef<MeshStandardMaterial>(null);
  const k = useRef(0);
  const baseC = useMemo(() => new Color(color), [color]);
  useFrame(() => {
    const m = mat.current;
    if (!m) return;
    k.current += ((selected || visited ? 1 : 0) - k.current) * 0.06;
    m.color.copy(GHOST_FILL).lerp(baseC, ghost ? 0.3 + 0.7 * k.current : 1);
    const rest = ghost ? opacity * 0.3 : opacity;
    m.opacity = rest + (solid - rest) * k.current;
    m.roughness = 0.34 - 0.2 * k.current;
    m.metalness = 0.18 * k.current;
    m.depthWrite = k.current > 0.5;
  });
  return (
    <meshStandardMaterial
      ref={mat}
      userData={{ lifeSkip: true }}
      color={color}
      transparent
      opacity={opacity}
      roughness={0.34}
      metalness={0}
      emissive="#0c2a30"
      emissiveIntensity={0.14}
      depthWrite={false}
      onBeforeCompile={glassRim}
    />
  );
}

/** Flat highlight box. Defaults to the layer accent, but decorative (non-hotspot)
 *  details pass color={NEUTRAL} so the layer colour stays on the interactables. */
function Accent({ position, args, intensity = 0.4, rotation, color }: { position: V3; args: V3; intensity?: number; rotation?: V3; color?: string }) {
  const { accent } = useAccent();
  const c = color ?? accent;
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={c} emissive={c} emissiveIntensity={intensity} roughness={0.4} />
    </mesh>
  );
}

/* ---------- shape helpers ---------- */
/** A square diorama building (glass fill, neutral edges). When given a shared
 *  `winMat`, it grows a grid of windows on its two camera-facing sides that
 *  light up when the town hall is hovered. */
function Building({ x, z, w, d, h, winMat }: { x: number; z: number; w: number; d: number; h: number; winMat?: MeshStandardMaterial }) {
  const windows = useMemo(() => {
    if (!winMat) return [] as { p: V3; r?: V3; s: [number, number] }[];
    const out: { p: V3; r?: V3; s: [number, number] }[] = [];
    const rows = Math.max(1, Math.floor((h - 0.06) / 0.11));
    for (let r = 0; r < rows; r++) {
      const yy = 0.09 + r * 0.11;
      if (yy > h - 0.05) break;
      for (const c of [-1, 1]) {
        out.push({ p: [c * w * 0.22, yy, d / 2 + 0.004], s: [w * 0.26, 0.05] });
        out.push({ p: [w / 2 + 0.004, yy, c * d * 0.22], r: [0, Math.PI / 2, 0], s: [d * 0.26, 0.05] });
      }
    }
    return out;
  }, [w, d, h, winMat]);
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <GlassMat opacity={0.3} />
        <Edges threshold={20} color={NEUTRAL} />
      </mesh>
      {windows.map((win, i) => (
        <mesh key={i} position={win.p} rotation={win.r} material={winMat}>
          <planeGeometry args={win.s} />
        </mesh>
      ))}
    </group>
  );
}

/** A Dutch windmill (smock mill). The sails are still at idle; hovering its
 *  hotspot (DTT Amsterdam) turns them slowly, selecting spins them up fast, and
 *  once it's been opened they keep turning. The body solidifies once visited. */
function Windmill({ position, slug }: { position: V3; slug?: string }) {
  const sails = useRef<Group>(null);
  const popRef = useRef<Group>(null);
  const reduced = useReducedMotion();
  const { hovered, selected, visited } = useActive(slug ?? '');
  const spin = useRef(0);
  useFrame((_s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta);
    // still at idle; turns slowly once engaged (hover or select) and keeps turning
    // once opened — no fast spin-up on select
    const target = hovered || selected || visited ? 0.9 : 0;
    spin.current += (target - spin.current) * 0.04;
    if (sails.current && !reduced) sails.current.rotation.z += delta * spin.current;
  });
  return (
    <group position={position}>
      <group ref={popRef}>
      {/* grassy mound */}
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.24, 0.3, 0.06, 20]} />
        <GlassMat color="#2f8a6e" opacity={0.18} />
      </mesh>
      {/* tapered octagonal body */}
      <mesh position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.12, 0.19, 0.56, 8]} />
        <LiveGlassMat slug={slug ?? ''} opacity={0.44} />
        <Edges threshold={20} color={NEUTRAL} />
      </mesh>
      {/* cap */}
      <mesh position={[0, 0.67, 0]}>
        <coneGeometry args={[0.15, 0.16, 8]} />
        <GlassMat opacity={0.3} />
        <Edges threshold={20} color={NEUTRAL} />
      </mesh>
      {/* sails — a turning cross on the front face; they spin up when engaged */}
      <group ref={sails} position={[0, 0.62, 0.19]}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <mesh position={[0, 0.24, 0]}>
              <boxGeometry args={[0.05, 0.46, 0.01]} />
              <GlassMat color="#3f8f8a" opacity={0.34} />
              <Edges threshold={30} color={NEUTRAL} />
            </mesh>
          </group>
        ))}
      </group>
      </group>
    </group>
  );
}

/** A stylised pine — three stacked faceted cones over a short trunk stub (the
 *  stub ends below the lowest tier's skirt, so nothing shows through the
 *  leaves). Quiet teal at rest; greens up once the park has been visited. */
const PINE_TIERS: [number, number, number][] = [
  // y centre, radius, height — fractions of the tree height
  [0.3, 0.36, 0.44],
  [0.55, 0.27, 0.36],
  [0.78, 0.18, 0.3],
];
function ParkTree({ position, h = 0.45, yaw = 0, slug }: { position: V3; h?: number; yaw?: number; slug?: string }) {
  const { selected, visited } = useActive(slug ?? '');
  const live = useRef(0);
  const restCol = useMemo(() => new Color('#3f7d72'), []); // muted teal-green at rest
  const vivid = useMemo(() => new Color('#62c265'), []); // lifelike leaf green once visited
  const mat = useMemo(() => {
    const m = new MeshStandardMaterial({ color: '#3f7d72', flatShading: true, roughness: 0.7, metalness: 0, transparent: true, opacity: 0.45 });
    m.userData.lifeSkip = true; // greens up itself once visited
    return m;
  }, []);
  useFrame(() => {
    if (!slug) return;
    live.current += ((selected || visited ? 1 : 0) - live.current) * 0.06;
    mat.color.copy(restCol).lerp(vivid, live.current);
    mat.opacity = 0.45 + live.current * 0.35;
  });
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <mesh position={[0, h * 0.05, 0]}>
        <cylinderGeometry args={[h * 0.022, h * 0.03, h * 0.1, 6]} />
        <GlassMat color="#6a7a72" opacity={0.5} />
      </mesh>
      {PINE_TIERS.map(([y, r, th], i) => (
        <mesh key={i} position={[0, h * y, 0]} material={mat}>
          <coneGeometry args={[h * r, h * th, 6]} />
        </mesh>
      ))}
    </group>
  );
}

/** Fireflies over the park — soft green sparks that wander and blink. A faint
 *  few while the park is dormant; visiting it brings them out properly. */
const FLY_COUNT = 9;
function Fireflies({ slug }: { slug?: string }) {
  const { selected, visited } = useActive(slug ?? '');
  const reduced = useReducedMotion();
  const live = useRef(0);
  const flies = useRef<(Mesh | null)[]>([]);
  const seeds = useMemo(() => {
    const rand = makeRand(97);
    return Array.from({ length: FLY_COUNT }, () => ({
      x: (rand() - 0.5) * 0.8,
      z: (rand() - 0.5) * 0.8,
      y: 0.1 + rand() * 0.22,
      p: rand() * Math.PI * 2,
      s: 0.5 + rand() * 0.9,
    }));
  }, []);
  useFrame((st) => {
    live.current += ((selected || visited ? 1 : 0) - live.current) * 0.05;
    const t = st.clock.elapsedTime;
    seeds.forEach((sd, i) => {
      const m = flies.current[i];
      if (!m) return;
      if (reduced) {
        m.position.set(sd.x, sd.y, sd.z);
        m.scale.setScalar(0.6 * (0.25 + live.current * 0.75));
        return;
      }
      m.position.set(
        sd.x + Math.sin(t * 0.24 * sd.s + sd.p) * 0.07,
        sd.y + Math.sin(t * 0.5 * sd.s + sd.p * 2.1) * 0.035,
        sd.z + Math.cos(t * 0.31 * sd.s + sd.p) * 0.07,
      );
      const blink = Math.max(0, Math.sin(t * (1.1 + sd.s) + sd.p * 3));
      m.scale.setScalar(blink * (0.25 + live.current * 0.75));
    });
  });
  return (
    <group>
      {Array.from({ length: FLY_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            flies.current[i] = m;
          }}
        >
          <sphereGeometry args={[0.009, 8, 6]} />
          <meshBasicMaterial userData={{ lifeSkip: true }} color="#9fe8b0" transparent opacity={0.85} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Two little ducks drifting lazy loops on the lake (lake-local coordinates).
 *  They ghost and solidify with the rest of the park. */
function LakeDucks() {
  const reduced = useReducedMotion();
  const ducks = useRef<(Group | null)[]>([]);
  useFrame((st) => {
    const t = reduced ? 0 : st.clock.elapsedTime;
    for (let i = 0; i < 2; i++) {
      const g = ducks.current[i];
      if (!g) continue;
      const dir = i ? -1 : 1;
      const a = t * 0.14 * dir + i * 2.4;
      const rx = 0.095;
      const rz = 0.062;
      g.position.set(0.02 + Math.cos(a) * rx, 0.026, -0.015 + Math.sin(a) * rz);
      // point the beak along the direction of travel
      const vx = -Math.sin(a) * rx * dir;
      const vz = Math.cos(a) * rz * dir;
      g.rotation.y = Math.atan2(-vz, vx);
    }
  });
  return (
    <group>
      {[0, 1].map((i) => (
        <group
          key={i}
          ref={(g) => {
            ducks.current[i] = g;
          }}
        >
          <mesh scale={[1.3, 0.75, 1]}>
            <sphereGeometry args={[0.014, 10, 8]} />
            <GlassMat color="#cfc49e" opacity={0.55} />
          </mesh>
          <mesh position={[0.014, 0.012, 0]}>
            <sphereGeometry args={[0.008, 8, 6]} />
            <GlassMat color="#cfc49e" opacity={0.6} />
          </mesh>
          <mesh position={[0.024, 0.012, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.003, 0.008, 6]} />
            <GlassMat color="#e8b64f" opacity={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Soft rounded box (furniture, the chip package). Optional top outline. With a
 *  `liveSlug` its glass solidifies once that hotspot is visited; furniture that
 *  shouldn't rest as a ghost also passes `liveGhost={false}`. */
function SoftBox({ position, args, radius = 0.03, opacity = 0.2, outline = false, rotation, color, liveSlug, liveGhost = true }: { position: V3; args: V3; radius?: number; opacity?: number; outline?: boolean; rotation?: V3; color?: string; liveSlug?: string; liveGhost?: boolean }) {
  // Clamp so the corner radius never exceeds half the smallest side.
  const r = Math.min(radius, Math.min(args[0], args[1], args[2]) / 2 - 0.002);
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={args} radius={r} smoothness={3}>
        {liveSlug ? <LiveGlassMat slug={liveSlug} ghost={liveGhost} opacity={opacity} color={color} /> : <GlassMat opacity={opacity} color={color} />}
      </RoundedBox>
      {outline && (
        <Line points={roundedRectPts(args[0], args[2], radius * 1.6)} position={[0, args[1] / 2, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.45} />
      )}
    </group>
  );
}

/** Flat floor of dots that fade into the background toward the rim. Neutral —
 *  the layer colour is reserved for the project dots + a few details. */
function DotFloor({ step = 0.26 }: { step?: number }) {
  const R = 2.2;
  const { positions, colors } = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    const c = new Color(NEUTRAL);
    const bg = new Color(BG);
    const tmp = new Color();
    for (let x = -R; x <= R + 1e-6; x += step)
      for (let z = -R; z <= R + 1e-6; z += step) {
        const d = Math.hypot(x, z);
        if (d > R) continue;
        pos.push(x, 0, z);
        const fade = Math.pow(1 - d / R, 1.5);
        tmp.copy(bg).lerp(c, 0.06 + 0.5 * fade);
        col.push(tmp.r, tmp.g, tmp.b);
      }
    return { positions: new Float32Array(pos), colors: new Float32Array(col) };
  }, [step]);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.022} vertexColors transparent opacity={0.7} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/** A sparse field of neutral points drifting slowly above the layer. */
function PointCloud({ seed }: { seed: number }) {
  const ref = useRef<ThreePoints>(null);
  const reduced = useReducedMotion();
  const positions = useMemo(() => {
    const rnd = makeRand(seed);
    const n = 32;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const ang = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 1.95;
      a[i * 3] = Math.cos(ang) * r;
      a[i * 3 + 1] = 0.35 + rnd() * 1.0;
      a[i * 3 + 2] = Math.sin(ang) * r;
    }
    return a;
  }, [seed]);
  useFrame((state) => {
    if (ref.current && !reduced) ref.current.rotation.y = state.clock.elapsedTime * 0.02;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.016} color={NEUTRAL} transparent opacity={0.22} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/* ---------- City — GIS & location (top) ---------- */
/** An organic closed outline (a wobbly ring) for a natural lake shoreline. */
function blobPts(r: number, wobble: number, seg = 48, seed = 7): V3[] {
  const rnd = makeRand(seed);
  const k = 7;
  const offs = Array.from({ length: k }, () => 1 + (rnd() - 0.5) * wobble);
  const pts: V3[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const f = (a / (Math.PI * 2)) * k;
    const i0 = Math.floor(f) % k;
    const t = f - Math.floor(f);
    const rr = r * (offs[i0] * (1 - t) + offs[(i0 + 1) % k] * t);
    pts.push([Math.cos(a) * rr, 0, Math.sin(a) * rr]);
  }
  return pts;
}

/** The park's AR tower viewer — the ARCam installation, loaded from the real
 *  model at public/models/binoculars.gltf (single self-contained mesh). It's
 *  normalised at load — the same frosted glass as the buildings and windmill,
 *  stood on the ground, scaled to viewer height — and keeps the behaviour of
 *  the old build: hidden until the ARCam hotspot is selected, then pops in
 *  with a spring and pans left↔right scanning the scene. Taking a picture
 *  flashes only the viewfinder screen: a separate plane parked on the model
 *  (tweak BINOS_SCREEN_* below to fit it to the display). */
const BINOS_H = 0.25; // world height the model is normalised to
// The screen plane, in the viewer's local space (feet at y=0, height BINOS_H).
const BINOS_SCREEN_POS: V3 = [0, 0.18, 0.005];
const BINOS_SCREEN_ROT: V3 = [0, 0, 0];
const BINOS_SCREEN_SIZE: [number, number] = [0.07, 0.075];
function Binoculars({ position, rotationY = 0, slug }: { position: V3; rotationY?: number; slug?: string }) {
  const { selected, visited } = useActive(slug ?? '');
  const reduced = useReducedMotion();
  const popRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const k = useRef(0); // pop-in scale progress
  const vel = useRef(0);
  const flash = useRef(0); // camera-flash level, decays each frame
  const lastShot = useRef(0);
  const screenMat = useRef<MeshStandardMaterial>(null);
  const [model, setModel] = useState<Group | null>(null);

  useEffect(() => {
    let cancelled = false;
    new GLTFLoader().load(
      asset('/models/binoculars.gltf'),
      (g) => {
        if (cancelled) return;
        const scene = g.scene;
        // the same frosted glass as the buildings + windmill body
        const glass = new MeshStandardMaterial({
          color: GLASS,
          transparent: true,
          opacity: 0.5,
          roughness: 0.34,
          metalness: 0,
          emissive: '#0c2a30',
          emissiveIntensity: 0.14,
          depthWrite: false,
        });
        glass.onBeforeCompile = glassRim;
        scene.traverse((o) => {
          const mesh = o as Mesh;
          if ((mesh as { isMesh?: boolean }).isMesh) mesh.material = glass;
        });
        // normalise: viewer height, feet on the ground, centred on its footprint
        const box = new Box3().setFromObject(scene);
        const size = new Vector3();
        box.getSize(size);
        scene.scale.setScalar(BINOS_H / (size.y || 1));
        box.setFromObject(scene);
        scene.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
        setModel(scene);
      },
      undefined,
      () => {}, // absent model → the viewer simply never pops in
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useFrame((s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const target = selected || visited ? 1 : 0;
    if (reduced) {
      k.current = target;
      vel.current = 0;
    } else {
      // a spring toward the target → a pop-in with a little overshoot
      vel.current += ((target - k.current) * 170 - vel.current * 19) * dt;
      k.current += vel.current * dt;
    }
    const pop = popRef.current;
    if (pop) {
      const sc = Math.max(0, k.current);
      pop.scale.setScalar(sc);
      pop.visible = sc > 0.002;
    }
    const head = headRef.current;
    if (!reduced && selected && k.current > 0.55) {
      // sweep left↔right; snap a photo at each extreme
      const ph = s.clock.elapsedTime * 0.95;
      if (head) head.rotation.y = Math.sin(ph) * 0.6;
      const shot = Math.floor((ph - Math.PI / 2) / Math.PI);
      if (shot !== lastShot.current) {
        lastShot.current = shot;
        flash.current = 1;
      }
    } else if (head) {
      head.rotation.y += (0 - head.rotation.y) * 0.1; // settle back to centre
    }
    flash.current = Math.max(0, flash.current - dt * 3.4);
    if (screenMat.current) screenMat.current.emissiveIntensity = 0.2 + flash.current * 3.6;
  });

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <group ref={popRef} visible={false}>
        <group ref={headRef}>
          {model && <primitive object={model} />}
          {/* the viewfinder screen — dimly lit, flaring white on each photo */}
          {model && (
            <mesh position={BINOS_SCREEN_POS} rotation={BINOS_SCREEN_ROT}>
              <planeGeometry args={BINOS_SCREEN_SIZE} />
              <meshStandardMaterial
                ref={screenMat}
                userData={{ lifeSkip: true }}
                color="#0b1418"
                emissive="#dff6ff"
                emissiveIntensity={0.2}
                toneMapped={false}
                side={DoubleSide}
              />
            </mesh>
          )}
        </group>
      </group>
    </group>
  );
}

function Park({ position, slug }: { position: V3; slug?: string }) {
  const { accent } = useAccent();
  const { selected, visited } = useActive(slug ?? '');
  const live = selected || visited;
  const reduced = useReducedMotion();
  const popRef = useRef<Group>(null);
  // an irregular lake outline + its filled water shape
  const lake = useMemo(() => {
    const pts = blobPts(0.2, 0.5, 56, 13);
    const shape = new Shape();
    shape.moveTo(pts[0][0], pts[0][2]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][2]);
    return { geo: new ShapeGeometry(shape), shore: pts.map((p) => [p[0], 0, -p[2]] as V3) };
  }, []);
  useFrame((_s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta, 0.14);
  });
  return (
    <group position={position}>
      <group ref={popRef}>
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.02, 44]} />
        <LiveGlassMat slug="arcam" color="#2f8a6e" opacity={0.15} />
      </mesh>
      <Line points={circlePts(0.5)} position={[0, 0.024, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.4} />
      {/* lake — an irregular water body with shore, ripples, a jetty + reeds */}
      <group position={[-0.14, 0, 0.18]}>
        <mesh geometry={lake.geo} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <LiveGlassMat slug="arcam" color="#27557d" opacity={0.4} />
        </mesh>
        {/* lighter shallows */}
        <mesh position={[0.03, 0.025, -0.02]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.1, 28]} />
          <LiveGlassMat slug="arcam" color="#4a96c0" opacity={0.3} />
        </mesh>
        {/* shoreline */}
        <Line points={lake.shore} position={[0, 0.03, 0]} color={live ? '#5fc4ff' : accent} lineWidth={1.2} transparent opacity={0.6} />
        {/* ripples */}
        <Line points={circlePts(0.06, 22)} position={[-0.03, 0.032, 0.02]} color={live ? '#7fd0ff' : NEUTRAL} lineWidth={1} transparent opacity={0.4} />
        <Line points={circlePts(0.035, 18)} position={[0.06, 0.032, -0.04]} color={live ? '#7fd0ff' : NEUTRAL} lineWidth={1} transparent opacity={0.35} />
        {/* a little jetty over the water */}
        <group position={[0.13, 0, -0.07]} rotation={[0, -0.5, 0]}>
          <mesh position={[0, 0.045, 0]}>
            <boxGeometry args={[0.13, 0.012, 0.035]} />
            <GlassMat color="#9a7150" opacity={0.55} />
            <Edges threshold={30} color={NEUTRAL} />
          </mesh>
          {[-0.05, 0.04].map((px, i) => (
            <mesh key={i} position={[px, 0.022, 0.013]}>
              <cylinderGeometry args={[0.005, 0.005, 0.05, 6]} />
              <GlassMat color="#9a7150" opacity={0.5} />
            </mesh>
          ))}
        </group>
        {/* reeds at the far edge */}
        {([[-0.16, 0.03], [-0.185, -0.02], [-0.15, -0.06]] as [number, number][]).map(([rx, rz], i) => (
          <mesh key={`r${i}`} position={[rx, 0.06, rz]} rotation={[0.12 * (i - 1), 0, 0.13]}>
            <cylinderGeometry args={[0.003, 0.005, 0.11, 5]} />
            <meshStandardMaterial color="#5f8a52" roughness={0.8} />
          </mesh>
        ))}
        {/* lily pads */}
        {([[0.07, 0.06], [-0.02, -0.08]] as [number, number][]).map(([lx, lz], i) => (
          <mesh key={`l${i}`} position={[lx, 0.028, lz]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.022, 12]} />
            <meshStandardMaterial color="#3f7d52" roughness={0.7} side={DoubleSide} />
          </mesh>
        ))}
        {/* two ducks drifting their lazy loops */}
        <LakeDucks />
      </group>
      {/* a small varied grove — each pine at its own height and turn */}
      <ParkTree position={[0.2, 0, -0.18]} h={0.46} yaw={0.4} slug={slug} />
      <ParkTree position={[0.24, 0, 0.22]} h={0.34} yaw={2.1} slug={slug} />
      <ParkTree position={[-0.22, 0, -0.24]} h={0.4} yaw={1.2} slug={slug} />
      <ParkTree position={[0.4, 0, 0.04]} h={0.3} yaw={3.6} slug={slug} />
      <ParkTree position={[-0.04, 0, -0.42]} h={0.36} yaw={5.1} slug={slug} />
      {/* fireflies wandering between the trees */}
      <Fireflies slug={slug} />
      {/* the ARCam tower viewer — pops in and scans when the hotspot is selected */}
      <Binoculars position={[0.1, 0.1, 0.34]} rotationY={-0.15} slug={slug} />
      </group>
    </group>
  );
}

// The city's centrepiece — a slender, continuously tapering octagonal glass
// tower (one frustum shaft, not stacked blocks) with full-height mullion fins
// running the edges, a few floor bands that glow when engaged (the shared
// winMat, ramped by WindowDriver) and a tapered crown with a slow-pulsing
// beacon. Carries the Alliander hotspot; same GlassMat language as the rest of
// the scene, via LiveGlassMat so the shaft solidifies once visited.
const TOWER_H = 0.78;
const TOWER_R_BOT = 0.145;
const TOWER_R_TOP = 0.115; // only a gentle taper — reads as a vertical tower, not a cone
const TOWER_SIDES = 8;

function Skyscraper({ position, winMat }: { position: V3; winMat?: MeshStandardMaterial }) {
  const { accent } = useAccent();
  const { selected, visited } = useActive('alliander-hololens');
  const beacon = useRef<MeshStandardMaterial>(null);
  const reduced = useReducedMotion();
  const popRef = useRef<Group>(null);
  const lifeK = useRef(0);
  const accentC = useMemo(() => new Color(accent), [accent]);
  // mullion fins hug the taper: each runs base-radius → top-radius up one edge
  const finL = Math.hypot(TOWER_R_BOT - TOWER_R_TOP, TOWER_H);
  const finTilt = Math.atan2(TOWER_R_BOT - TOWER_R_TOP, TOWER_H);
  const finR = (TOWER_R_BOT + TOWER_R_TOP) / 2;
  const rAt = (y: number) => TOWER_R_BOT + (TOWER_R_TOP - TOWER_R_BOT) * (y / TOWER_H);
  useFrame((s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta, 0.18);
    if (!beacon.current) return;
    const t = reduced ? 0 : s.clock.elapsedTime;
    // the beacon barely smoulders on the ghost tower; it starts pulsing in
    // colour once the visitor has brought the tower to life
    lifeK.current += ((selected || visited ? 1 : 0) - lifeK.current) * 0.08;
    beacon.current.color.copy(GHOST_FILL).lerp(accentC, lifeK.current);
    beacon.current.emissive.copy(GHOST_FILL).lerp(accentC, lifeK.current);
    beacon.current.emissiveIntensity = (0.45 + 0.55 * Math.abs(Math.sin(t * 2.1))) * (0.14 + 0.86 * lifeK.current);
  });
  return (
    <group position={position}>
      <group ref={popRef}>
        {/* one continuous tapered octagonal shaft — the same frosted glass as
            the rest of the scene, set apart by its shape; ghost grey until the
            hotspot is visited, then it solidifies */}
        <mesh position={[0, TOWER_H / 2, 0]}>
          <cylinderGeometry args={[TOWER_R_TOP, TOWER_R_BOT, TOWER_H, TOWER_SIDES]} />
          <LiveGlassMat slug="alliander-hololens" opacity={0.34} />
          <Edges threshold={15} color={NEUTRAL} />
        </mesh>
        {/* full-height mullion fins along the eight edges */}
        {Array.from({ length: TOWER_SIDES }).map((_, i) => (
          <group key={i} rotation={[0, (i / TOWER_SIDES) * Math.PI * 2, 0]}>
            <mesh position={[finR, TOWER_H / 2, 0]} rotation={[0, 0, finTilt]}>
              <boxGeometry args={[0.016, finL, 0.02]} />
              <meshStandardMaterial color={NEUTRAL} emissive={NEUTRAL} emissiveIntensity={0.18} roughness={0.4} metalness={0.3} />
            </mesh>
          </group>
        ))}
        {/* floor bands wrap the shaft — faint at rest, glow when engaged */}
        {winMat &&
          [0.24, 0.42, 0.58].map((f, i) => {
            const y = TOWER_H * f;
            const r = rAt(y) + 0.004;
            return (
              <mesh key={i} position={[0, y, 0]} material={winMat}>
                <cylinderGeometry args={[r, r, 0.02, TOWER_SIDES, 1, true]} />
              </mesh>
            );
          })}
        {/* crown: a short tapered mechanical cap (flat top), then a thin antenna
            mast + a slow-pulsing beacon — a tower crown, not a spike */}
        <mesh position={[0, TOWER_H + 0.05, 0]}>
          <cylinderGeometry args={[0.055, TOWER_R_TOP, 0.1, TOWER_SIDES]} />
          <LiveGlassMat slug="alliander-hololens" opacity={0.34} />
          <Edges threshold={15} color={NEUTRAL} />
        </mesh>
        <mesh position={[0, TOWER_H + 0.15, 0]}>
          <cylinderGeometry args={[0.004, 0.004, 0.1, 8]} />
          <meshStandardMaterial color={NEUTRAL} metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, TOWER_H + 0.21, 0]}>
          <sphereGeometry args={[0.014, 12, 12]} />
          <meshStandardMaterial ref={beacon} userData={{ lifeSkip: true }} color={accent} emissive={accent} emissiveIntensity={0.6} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** A flat ground ribbon built from a centre-line — reads as a paved road (a
 *  faint surface with crisp edges) rather than a single hairline. */
function roadRibbon(points: V3[], width: number) {
  const half = width / 2;
  const left: V3[] = [];
  const right: V3[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const tx = b[0] - a[0];
    const tz = b[2] - a[2];
    const len = Math.hypot(tx, tz) || 1;
    const px = -tz / len;
    const pz = tx / len; // perpendicular in the ground plane
    left.push([p[0] + px * half, p[1], p[2] + pz * half]);
    right.push([p[0] - px * half, p[1], p[2] - pz * half]);
  }
  const verts: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    verts.push(...left[i], ...right[i], ...left[i + 1]);
    verts.push(...right[i], ...right[i + 1], ...left[i + 1]);
  }
  return { array: new Float32Array(verts), left, right };
}

function RoadRibbon({ points, width = 0.08 }: { points: V3[]; width?: number }) {
  const { array, left, right } = useMemo(() => roadRibbon(points, width), [points, width]);
  return (
    <group>
      <mesh>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[array, 3]} />
        </bufferGeometry>
        <meshBasicMaterial color="#223240" transparent opacity={0.62} side={DoubleSide} depthWrite={false} />
      </mesh>
      <Line points={left} color={NEUTRAL} lineWidth={1} transparent opacity={0.42} />
      <Line points={right} color={NEUTRAL} lineWidth={1} transparent opacity={0.42} />
    </group>
  );
}

// The Big Dipper (Ursa Major — "the Big Bear") asterism: 7 stars + the links
// between them. Handle on the right, bowl on the left.
const DIPPER: [number, number][] = [
  [0.0, 1.0], // 0 Dubhe  — bowl top-outer
  [0.0, 0.0], // 1 Merak  — bowl bottom-outer
  [1.0, 0.05], // 2 Phecda — bowl bottom-inner
  [1.05, 0.85], // 3 Megrez — bowl top-inner / handle joint
  [1.85, 1.0], // 4 Alioth
  [2.6, 1.15], // 5 Mizar
  [3.35, 1.4], // 6 Alkaid — handle end
];
const DIPPER_LINKS: [number, number][] = [
  [0, 3], [3, 2], [2, 1], [1, 0], // the bowl
  [3, 4], [4, 5], [5, 6], // the handle
];
const DIPPER_MAG = [1, 0.7, 0.65, 0.8, 1, 0.85, 1]; // relative brightness → star size

/** A star constellation (the Big Dipper) that fades in behind the windmill while
 *  it's selected, its stars twinkling and blooming against the night. */
function Constellation({ anchor }: { anchor: V3 }) {
  const { selected, visited } = useActive('dtt-amsterdam');
  const reduced = useReducedMotion();
  const grp = useRef<Group>(null);
  const starMats = useRef<(MeshStandardMaterial | null)[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineRef = useRef<any>(null);
  const k = useRef(0);
  const stars = useMemo(() => {
    const cx = DIPPER.reduce((a, s) => a + s[0], 0) / DIPPER.length;
    const cy = DIPPER.reduce((a, s) => a + s[1], 0) / DIPPER.length;
    const S = 0.26; // asterism scale
    return DIPPER.map(([x, y]) => [(x - cx) * S, (y - cy) * S, 0] as V3);
  }, []);
  const segs = useMemo(() => DIPPER_LINKS.flatMap(([a, b]) => [stars[a], stars[b]]), [stars]);
  useFrame((s) => {
    // fades in on select and stays lit once the windmill has been opened
    k.current += ((selected || visited ? 1 : 0) - k.current) * 0.08;
    const kk = k.current;
    if (grp.current) {
      grp.current.visible = kk > 0.01;
      grp.current.scale.setScalar(0.9 + 0.1 * kk);
    }
    const t = s.clock.elapsedTime;
    starMats.current.forEach((m, i) => {
      if (!m) return;
      const tw = reduced ? 1 : 0.78 + 0.32 * Math.sin(t * (1.7 + i * 0.4) + i);
      m.emissiveIntensity = kk * 1.8 * tw; // brighter to keep the now-tiny stars visible
      m.opacity = Math.min(1, kk * 1.5);
    });
    const lm = lineRef.current?.material;
    if (lm) {
      const op = kk * 0.95;
      lm.opacity = op;
      if (lm.uniforms?.opacity) lm.uniforms.opacity.value = op;
    }
  });
  return (
    <group ref={grp} position={[anchor[0] + 0.1, anchor[1] + 1.0, anchor[2] - 0.7]} rotation={[0.05, 0.4, 0]} visible={false}>
      <Line ref={lineRef} segments points={segs} color="#dcefff" lineWidth={3.0} transparent opacity={0} />
      {stars.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.0033 + DIPPER_MAG[i] * 0.0028, 10, 10]} />
          <meshStandardMaterial
            ref={(m) => {
              starMats.current[i] = m;
            }}
            color="#eaf6ff"
            emissive="#cfe8ff"
            emissiveIntensity={0}
            transparent
            opacity={0}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Power cables from the Alliander tower out to every building — thin emissive
 *  tubes (not lines) so they reliably bloom: dim blue at rest, ramping to a bright
 *  glowing blue when the tower is engaged, and staying lit once visited. All tubes
 *  share one material, animated in one place. */
function PowerWires({ from, targets }: { from: V3; targets: V3[] }) {
  const { hovered, selected, visited } = useActive('alliander-hololens');
  const k = useRef(0);
  const tubes = useMemo(
    () =>
      targets.map((t) => {
        const horiz = Math.hypot(t[0] - from[0], t[2] - from[2]);
        const sag = 0.05 + horiz * 0.14; // longer spans droop more
        const pts: Vector3[] = [];
        for (let i = 0; i <= 12; i++) {
          const u = i / 12;
          pts.push(
            new Vector3(
              from[0] + (t[0] - from[0]) * u,
              from[1] + (t[1] - from[1]) * u - sag * 4 * u * (1 - u),
              from[2] + (t[2] - from[2]) * u,
            ),
          );
        }
        return new TubeGeometry(new CatmullRomCurve3(pts), 14, 0.006, 5, false);
      }),
    [from, targets],
  );
  const mat = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#284a5c',
        emissive: '#4fd8ff',
        emissiveIntensity: 0.12,
        transparent: true,
        opacity: 0.55,
        roughness: 0.4,
        toneMapped: false,
      }),
    [],
  );
  useFrame(() => {
    const target = selected ? 1 : hovered ? 0.5 : visited ? 0.28 : 0;
    k.current += (target - k.current) * 0.09;
    const kk = k.current;
    mat.emissiveIntensity = 0.12 + kk * 2.8; // toneMapped:false → blooms on select
    mat.opacity = 0.5 + kk * 0.5;
  });
  return (
    <group>
      {tubes.map((g, i) => (
        <mesh key={i} geometry={g} material={mat} />
      ))}
    </group>
  );
}

function CityRig() {
  // Roads: a grid threading between the blocks, three avenues out toward the
  // church / windmill / park, and two curved roads sweeping around the side.
  const roads: V3[][] = useMemo(
    () => [
      [[-0.3, 0.01, -0.9], [-0.3, 0.01, 0.9]],
      [[0.3, 0.01, -0.9], [0.3, 0.01, 0.9]],
      [[-0.9, 0.01, -0.3], [0.9, 0.01, -0.3]],
      [[-0.9, 0.01, 0.3], [0.9, 0.01, 0.3]],
      [[-0.3, 0.01, -0.3], [-0.55, 0.01, -0.62]],
    ],
    [],
  );
  const curveB = useMemo(() => smoothCurve([[-1.9, 0.01, 0.45], [-1.0, 0.01, 0.85], [0.1, 0.01, 0.98], [1.05, 0.01, 0.82]]), []);
  // Sparse blocks of square buildings around a central plaza; taller toward
  // the middle so the cluster still reads as a skyline.
  const cluster = useMemo(() => {
    const rnd = makeRand(1872);
    const out: { x: number; z: number; w: number; d: number; h: number }[] = [];
    const cells = [-0.55, 0, 0.55];
    for (const cx of cells)
      for (const cz of cells) {
        if (cx === 0 && cz === 0) continue; // central plaza → town hall
        const count = 1;
        for (let k = 0; k < count; k++) {
          const x = cx + (rnd() - 0.5) * 0.12;
          const z = cz + (rnd() - 0.5) * 0.12;
          const fall = Math.max(0.1, 1 - (x * x + z * z) * 0.8);
          out.push({ x, z, w: 0.13 + rnd() * 0.05, d: 0.13 + rnd() * 0.05, h: 0.2 + fall * 0.4 + rnd() * 0.12 });
        }
      }
    return out;
  }, []);
  const { accent } = useAccent();
  // one shared material for every window, ramped by WindowDriver on town-hall hover
  const winMat = useMemo(() => {
    const m = new MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0, transparent: true, opacity: 0.1, roughness: 0.4, toneMapped: false, depthWrite: false });
    m.userData.lifeSkip = true; // WindowDriver animates it; shared with prop buildings
    return m;
  }, [accent]);
  // DEV-only position scrubbers; tree-shaken from production builds (see devTweak).
  const mill = useTweak('City.Windmill', { position: [-1.34, 0, 0.33] });
  const park = useTweak('City.Park', { position: [1.3, 0, -0.23] });
  return (
    <group>
      {/* roads through the city */}
      {roads.map((p, i) => (
        <RoadRibbon key={`r${i}`} points={p} width={0.08} />
      ))}
      {/* curved roads on the side */}
      <RoadRibbon points={curveB} width={0.09} />

      {/* the skyline + its civic peak; windows light up on town-hall hover */}
      <WindowDriver mat={winMat} />
      {cluster.map((b, i) => (
        <Building key={i} {...b} winMat={winMat} />
      ))}
      <LifeGroup slug="alliander-hololens">
        <Skyscraper position={[0, 0, 0]} winMat={winMat} />
      </LifeGroup>
      {/* power lines from the central tower to every building — glow blue on select */}
      <PowerWires from={[0, 0.8, 0]} targets={cluster.map((b) => [b.x, b.h, b.z] as V3)} />


      {/* windmill on the side — carries the DTT Amsterdam hotspot */}
      <LifeGroup slug="dtt-amsterdam">
        <Windmill position={mill.position} slug="dtt-amsterdam" />
      </LifeGroup>
      {/* the Big Dipper rises behind the windmill while it's selected */}
      <Constellation anchor={mill.position} />

      {/* parks (the first carries the arcam hotspot — its trees rustle) */}
      <LifeGroup slug="arcam">
        <Park position={park.position} slug="arcam" />
      </LifeGroup>
    </group>
  );
}

/* ---------- Room — games, apps & websites (middle) ---------- */

// A tiny race car for the Lightship Drive AR table — chassis, nose, cabin, a
// rear wing and four wheels — pointing along its local +z (its heading).
function RaceCar({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.007, -0.002]}>
        <boxGeometry args={[0.03, 0.012, 0.06]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.4} metalness={0.1} toneMapped={false} />
      </mesh>
      {/* nose */}
      <mesh position={[0, 0.005, 0.032]}>
        <boxGeometry args={[0.024, 0.008, 0.018]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.4} toneMapped={false} />
      </mesh>
      {/* cabin / windscreen */}
      <mesh position={[0, 0.017, -0.004]}>
        <boxGeometry args={[0.022, 0.012, 0.026]} />
        <meshStandardMaterial color="#0b1418" emissive={color} emissiveIntensity={0.12} roughness={0.25} toneMapped={false} />
      </mesh>
      {/* rear wing */}
      <mesh position={[0, 0.016, -0.03]}>
        <boxGeometry args={[0.032, 0.002, 0.008]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} roughness={0.4} toneMapped={false} />
      </mesh>
      {/* wheels */}
      {([[-0.018, 0.022], [0.018, 0.022], [-0.018, -0.022], [0.018, -0.022]] as [number, number][]).map(([wx, wz], i) => (
        <mesh key={i} position={[wx, 0.002, wz]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.008, 0.008, 0.006, 12]} />
          <meshStandardMaterial color="#161f27" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** Coffee table with an AR race loop and two cars (Lightship Drive). The cars
 *  ride a circle, simply rotating around the table's centre pivot. */
function CoffeeTableAR({ position, hoverSlug }: { position: V3; hoverSlug?: string }) {
  const { accent } = useAccent();
  const { hovered, selected, visited } = useActive(hoverSlug ?? '');
  const reduced = useReducedMotion();
  const ring = useRef<Group>(null);
  const popRef = useRef<Group>(null);
  const speed = useRef(0.1);
  const R = 0.2; // track radius
  useFrame((_s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta);
    // ghost table: the cars barely creep; the race only runs once it's alive
    const sT = selected || visited ? 1 : hovered ? 0.45 : 0.1;
    speed.current += (sT - speed.current) * 0.05;
    if (ring.current && !reduced) ring.current.rotation.y += Math.min(delta, 1 / 30) * speed.current;
  });
  return (
    <group position={position}>
      <group ref={popRef}>
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.32, 0.32, 0.03, 40]} />
          <LiveGlassMat slug="lightship-drive" opacity={0.2} />
          <Edges threshold={30} color={NEUTRAL} />
        </mesh>
        {([[0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]] as [number, number][]).map(([lx, lz], i) => (
          <mesh key={i} position={[lx, 0.09, lz]}>
            <cylinderGeometry args={[0.016, 0.016, 0.18, 10]} />
            <LiveGlassMat slug="lightship-drive" opacity={0.24} />
          </mesh>
        ))}
        {/* the AR race loop — a circle */}
        <Line points={circlePts(R)} position={[0, 0.2, 0]} color={accent} lineWidth={1.6} transparent opacity={0.7} />
        {/* two cars circling the centre pivot, facing their direction of travel */}
        <group ref={ring} position={[0, 0.202, 0]}>
          <group position={[R, 0, 0]} rotation={[0, Math.PI, 0]}>
            <RaceCar color="#ff5a4d" />
          </group>
          <group position={[-R, 0, 0]}>
            <RaceCar color="#4d9bff" />
          </group>
        </group>
      </group>
    </group>
  );
}

/** A VR headset prop on a stand (Virtuele Brigade). */
function VRHeadset({ position, rotation }: { position: V3; rotation?: V3 }) {
  const strap = useMemo(() => smoothCurve([[-0.075, 0, 0], [-0.05, 0.06, -0.055], [0.05, 0.06, -0.055], [0.075, 0, 0]], 24), []);
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[0.16, 0.09, 0.1]} radius={0.03} smoothness={3}>
        <GlassMat opacity={0.3} />
      </RoundedBox>
      <Accent position={[0, 0, 0.052]} args={[0.11, 0.05, 0.004]} intensity={0.3} color={NEUTRAL} />
      <Line points={strap} color={NEUTRAL} lineWidth={1.2} transparent opacity={0.5} />
    </group>
  );
}

/** A floor lamp with a glowing shade. */
function FloorLamp({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.006, 0]}>
        <cylinderGeometry args={[0.12, 0.13, 0.012, 24]} />
        <GlassMat opacity={0.22} />
      </mesh>
      <mesh position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.66, 8]} />
        <GlassMat opacity={0.3} />
      </mesh>
      <mesh position={[0, 0.72, 0]}>
        <coneGeometry args={[0.14, 0.18, 22, 1, true]} />
        <GlassMat opacity={0.2} />
        <Edges threshold={30} color={NEUTRAL} />
      </mesh>
      <Accent position={[0, 0.66, 0]} args={[0.07, 0.02, 0.07]} intensity={0.5} color={NEUTRAL} />
    </group>
  );
}

/** A leafy potted houseplant — upright arching blades fanning out of a pot.
 *  With a `liveSlug` it solidifies alongside that hotspot (the workstation). */
function PottedPlant({ position, liveSlug }: { position: V3; liveSlug?: string }) {
  const blades = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        a: (i / 9) * Math.PI * 2 + (i % 2) * 0.4,
        tilt: 0.13 + (i % 3) * 0.08,
        len: 0.34 + ((i * 7) % 3) * 0.07,
      })),
    [],
  );
  return (
    <group position={position}>
      {/* pot — kept to the scene's neutral glass, no terracotta */}
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.13, 0.1, 0.16, 22]} />
        {liveSlug ? <LiveGlassMat slug={liveSlug} ghost={false} opacity={0.4} /> : <GlassMat opacity={0.4} />}
        <Edges threshold={24} color={NEUTRAL} />
      </mesh>
      {/* soil, as understated glass rather than dark earth */}
      <mesh position={[0, 0.165, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.012, 20]} />
        {liveSlug ? <LiveGlassMat slug={liveSlug} ghost={false} opacity={0.3} /> : <GlassMat opacity={0.3} />}
      </mesh>
      {/* leaf blades — same neutral glass, no green, barely there at rest */}
      {blades.map((b, i) => (
        <group key={i} position={[0, 0.17, 0]} rotation={[0, b.a, 0]}>
          <group rotation={[b.tilt, 0, 0]}>
            <mesh position={[0, b.len / 2, 0]} scale={[1, 1, 0.18]}>
              <coneGeometry args={[0.045, b.len, 5]} />
              {liveSlug ? <LiveGlassMat slug={liveSlug} ghost={false} opacity={0.14} solid={0.5} /> : <GlassMat opacity={0.14} />}
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

// Books on the shelves (local to the bookcase group), standing spine-out with
// real depth, varied size + muted colour; a couple lean. Each shelf packed.
const BOOKS: { p: V3; s: V3; c: string; r?: V3 }[] = [
  // top shelf (y ≈ 0.78)
  { p: [-0.30, 0.78, 0.02], s: [0.05, 0.17, 0.18], c: '#2f4a6b' },
  { p: [-0.245, 0.785, 0.02], s: [0.045, 0.18, 0.18], c: '#3a608a' },
  { p: [-0.19, 0.778, 0.02], s: [0.052, 0.165, 0.18], c: '#4f74a6' },
  { p: [-0.12, 0.79, 0.02], s: [0.06, 0.19, 0.18], c: '#26405f' },
  { p: [-0.05, 0.775, 0.02], s: [0.046, 0.16, 0.18], c: '#5b7cab' },
  { p: [0.02, 0.783, 0.02], s: [0.05, 0.175, 0.18], c: '#6f8cb6' },
  { p: [0.10, 0.78, 0.02], s: [0.055, 0.17, 0.18], c: '#2f4a6b' },
  { p: [0.185, 0.787, 0.02], s: [0.05, 0.185, 0.18], c: '#3a608a' },
  { p: [0.258, 0.742, 0.02], s: [0.05, 0.16, 0.18], c: '#4f74a6', r: [0, 0, 0.17] }, // leaning
  // middle shelf (y ≈ 0.52) — gap at x ≈ 0.12 for the open Zwijsen book
  { p: [-0.30, 0.52, 0.02], s: [0.05, 0.17, 0.18], c: '#5b7cab' },
  { p: [-0.245, 0.515, 0.02], s: [0.048, 0.16, 0.18], c: '#26405f' },
  { p: [-0.185, 0.523, 0.02], s: [0.055, 0.18, 0.18], c: '#3a608a' },
  { p: [-0.11, 0.52, 0.02], s: [0.05, 0.17, 0.18], c: '#6f8cb6' },
  { p: [-0.04, 0.518, 0.02], s: [0.052, 0.165, 0.18], c: '#2f4a6b' },
  { p: [0.26, 0.52, 0.02], s: [0.05, 0.17, 0.18], c: '#5b7cab' },
  { p: [0.214, 0.5, 0.02], s: [0.05, 0.15, 0.18], c: '#26405f', r: [0, 0, -0.15] }, // leaning into the gap
  // bottom shelf (y ≈ 0.26) — books, then a horizontal stack fills the right
  { p: [-0.30, 0.26, 0.02], s: [0.052, 0.17, 0.18], c: '#3a608a' },
  { p: [-0.24, 0.265, 0.02], s: [0.05, 0.18, 0.18], c: '#4f74a6' },
  { p: [-0.18, 0.258, 0.02], s: [0.055, 0.165, 0.18], c: '#2f4a6b' },
  { p: [-0.11, 0.262, 0.02], s: [0.048, 0.175, 0.18], c: '#26405f' },
  { p: [-0.04, 0.26, 0.02], s: [0.05, 0.17, 0.18], c: '#5b7cab' },
  { p: [0.03, 0.255, 0.02], s: [0.052, 0.16, 0.18], c: '#6f8cb6' },
];

/** The Zwijsen AR-books hotspot — a real little book. Two rigid halves (cover
 *  board + page block + printed page) hinge at the spine: it stands CLOSED in
 *  its shelf gap, and on select it lifts out, tilts toward the player and the
 *  front half swings open to reveal the spread — the left/right halves of
 *  public/textures/zwijsen-book.jpg (cream pages until it loads). The printed
 *  pages sit on top of their blocks, so nothing clips through anything. */
const BOOK_W = 0.17; // full open width
const BOOK_H = 0.19; // page depth (spine length)
const BOOK_T = 0.011; // cover board thickness
const BOOK_PT = 0.009; // page block thickness per half
const BOOK_ANG = 0.22; // resting V of the halves once open
function BookHalf({ side, tex }: { side: -1 | 1; tex: Texture | null }) {
  const x = (side * BOOK_W) / 4;
  return (
    <>
      {/* cover board */}
      <mesh position={[x, 0, 0]}>
        <boxGeometry args={[BOOK_W / 2, BOOK_T, BOOK_H]} />
        <meshStandardMaterial color="#ff7a3d" emissive="#ff7a3d" emissiveIntensity={0.16} roughness={0.5} />
      </mesh>
      {/* page block */}
      <mesh position={[x, BOOK_T / 2 + BOOK_PT / 2, 0]}>
        <boxGeometry args={[BOOK_W / 2 - 0.012, BOOK_PT, BOOK_H - 0.014]} />
        <meshStandardMaterial color="#efe6d0" emissive="#efe6d0" emissiveIntensity={0.1} roughness={0.85} />
      </mesh>
      {/* the printed page on top of the block */}
      <mesh position={[x, BOOK_T / 2 + BOOK_PT + 0.0008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BOOK_W / 2 - 0.016, BOOK_H - 0.02]} />
        {tex ? (
          <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.5} roughness={0.75} toneMapped={false} side={DoubleSide} />
        ) : (
          <meshStandardMaterial color="#f3ead4" emissive="#f3ead4" emissiveIntensity={0.14} roughness={0.85} side={DoubleSide} />
        )}
      </mesh>
    </>
  );
}
function OpenBook({ slug, position }: { slug: string; position: V3 }) {
  const { selected } = useActive(slug);
  const reduced = useReducedMotion();
  const grp = useRef<Group>(null);
  const frontHinge = useRef<Group>(null); // the half that swings open
  const backHinge = useRef<Group>(null);
  const sel = useRef(0); // 0 = closed in the gap, 1 = lifted + open + facing you
  const tex = useOptionalTexture('/textures/zwijsen-book.jpg');
  // the spread is one image — clone it into a left and a right half
  const [texL, texR] = useMemo(() => {
    if (!tex) return [null, null] as const;
    const half = (off: number) => {
      const t = tex.clone();
      t.repeat.set(0.5, 1);
      t.offset.set(off, 0);
      t.needsUpdate = true;
      return t;
    };
    return [half(0), half(0.5)] as const;
  }, [tex]);
  useEffect(
    () => () => {
      texL?.dispose();
      texR?.dispose();
    },
    [texL, texR],
  );
  useFrame(() => {
    sel.current += ((selected ? 1 : 0) - sel.current) * 0.09;
    const s = reduced ? (selected ? 1 : 0) : sel.current;
    const g = grp.current;
    if (g) {
      // stands closed in the gap (cover out); lifts forward + tilts back so
      // the opening spread reads face-on. Closed, both halves fold onto the
      // hinge's +x side, so the rest pose shifts −x to centre that mass in
      // the gap and keep clear of the leaning neighbour.
      g.rotation.x = (Math.PI / 2) * (1 - s) + 1.12 * s;
      g.rotation.y = 0.35 * s;
      g.position.set(position[0] - 0.04 + 0.01 * s, position[1] + 0.01 + 0.13 * s, position[2] + 0.02 + 0.26 * s);
    }
    // the front half swings 180° around the spine, from folded-shut to the
    // open V; its hinge also drops level with the back half as it opens
    if (frontHinge.current) {
      frontHinge.current.rotation.z = Math.PI * (1 - s) - BOOK_ANG * s;
      frontHinge.current.position.y = (BOOK_T + BOOK_PT * 2 + 0.001) * (1 - s);
    }
    if (backHinge.current) backHinge.current.rotation.z = BOOK_ANG * s;
  });
  return (
    <group ref={grp} position={position}>
      {/* back half — stays put, tilting into its side of the V */}
      <group ref={backHinge}>
        <BookHalf side={1} tex={texR} />
      </group>
      {/* front half — folded over when closed, swings open on select */}
      <group ref={frontHinge}>
        <BookHalf side={-1} tex={texL} />
      </group>
      {/* spine */}
      <mesh position={[0, -0.001, 0]}>
        <boxGeometry args={[0.015, BOOK_T + 0.003, BOOK_H]} />
        <meshStandardMaterial color="#e06a30" emissive="#e06a30" emissiveIntensity={0.14} roughness={0.5} />
      </mesh>
    </group>
  );
}

/** A little mouse that lives behind the Zwijsen book. When the book is picked up
 *  it hops out of the gap it leaves, drops to the floor and then scurries a loop
 *  around the bookcase. Coords are bookcase-local; it lives outside the pop group
 *  so the bookcase's select-bounce doesn't squash it. */
const MOUSE_GROUND = 0.03; // belly on the floor, bookcase-local
function BookcaseMouse({ gap }: { gap: V3 }) {
  const { selected } = useActive('zwijsen-ar-books');
  const reduced = useReducedMotion();
  const ref = useRef<Group>(null);
  const pos = useMemo(() => new Vector3(), []);
  const vel = useMemo(() => new Vector3(), []);
  const phase = useRef<'hidden' | 'arming' | 'jump' | 'walk'>('hidden');
  const delay = useRef(0);
  const walkT = useRef(0);
  const yaw = useRef(0);
  // The loop the mouse walks — an ellipse that encloses the bookcase footprint.
  const CX = 0;
  const CZ = 0.02;
  const RX = 0.52;
  const RZ = 0.34;

  useFrame((s, delta) => {
    const g = ref.current;
    if (!g) return;
    const dt = Math.min(delta, 1 / 30);
    const t = s.clock.elapsedTime;

    if (selected && phase.current === 'hidden') {
      phase.current = 'arming';
      delay.current = reduced ? 0 : 0.35; // let the book clear the shelf first
    }
    if (phase.current === 'arming') {
      delay.current -= dt;
      if (delay.current <= 0) {
        g.visible = true;
        if (reduced) {
          phase.current = 'walk';
          walkT.current = Math.PI / 2; // sit at the front, no hop
          pos.set(CX, MOUSE_GROUND, CZ + RZ);
        } else {
          phase.current = 'jump';
          pos.set(gap[0], gap[1], gap[2]);
          vel.set(0.05, 0.72, 0.55); // hop up and out toward the room
        }
      }
    } else if (phase.current === 'jump') {
      vel.y -= 3.0 * dt; // gravity
      pos.addScaledVector(vel, dt);
      yaw.current = Math.atan2(vel.x, vel.z);
      if (pos.y <= MOUSE_GROUND) {
        pos.y = MOUSE_GROUND;
        phase.current = 'walk';
        walkT.current = Math.atan2((pos.z - CZ) / RZ, (pos.x - CX) / RX); // continue from here
      }
    } else if (phase.current === 'walk') {
      const speed = reduced ? 0 : 0.85 + Math.sin(t * 6) * 0.18; // rad/s, with a little scurry
      walkT.current += speed * dt;
      pos.set(CX + Math.cos(walkT.current) * RX, MOUSE_GROUND, CZ + Math.sin(walkT.current) * RZ);
      pos.y += reduced ? 0 : Math.abs(Math.sin(t * 15)) * 0.004; // scurry bob
      yaw.current = Math.atan2(-Math.sin(walkT.current) * RX, Math.cos(walkT.current) * RZ);
    }

    if (phase.current === 'hidden') {
      g.visible = false;
      return;
    }
    g.position.copy(pos);
    g.rotation.y = yaw.current;
    g.rotation.x = phase.current === 'jump' ? Math.max(-0.5, Math.min(0.5, -vel.y * 0.3)) : 0;
  });

  const GREY = '#8b929c';
  const PINK = '#b58794';
  return (
    <group ref={ref} visible={false}>
      <mesh scale={[0.024, 0.02, 0.034]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color={GREY} emissive="#3a3f47" emissiveIntensity={0.25} roughness={0.7} flatShading />
      </mesh>
      <mesh position={[0, 0.004, 0.03]} scale={[0.015, 0.014, 0.018]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#949aa4" emissive="#3a3f47" emissiveIntensity={0.25} roughness={0.7} flatShading />
      </mesh>
      {[-1, 1].map((sx, i) => (
        <mesh key={`ear${i}`} position={[sx * 0.011, 0.016, 0.026]}>
          <sphereGeometry args={[0.008, 10, 8]} />
          <meshStandardMaterial color={PINK} emissive="#3a3f47" emissiveIntensity={0.2} roughness={0.7} />
        </mesh>
      ))}
      {[-1, 1].map((sx, i) => (
        <mesh key={`eye${i}`} position={[sx * 0.007, 0.006, 0.042]}>
          <sphereGeometry args={[0.0035, 8, 8]} />
          <meshStandardMaterial color="#ffd7e0" emissive="#ff6a90" emissiveIntensity={1.2} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, 0.001, 0.05]}>
        <sphereGeometry args={[0.004, 8, 8]} />
        <meshStandardMaterial color="#d98aa0" emissive="#d98aa0" emissiveIntensity={0.5} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.007, -0.03]} rotation={[-0.5, 0, 0]}>
        <cylinderGeometry args={[0.0015, 0.003, 0.05, 6]} />
        <meshStandardMaterial color={PINK} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** The bookcase. Engaging the Zwijsen book "turns it on": the book spines glow,
 *  alongside the open spread lifting out to face the player. */
function Bookcase({ position }: { position: V3 }) {
  const { hovered, selected, visited } = useActive('zwijsen-ar-books');
  const bookMats = useRef<(MeshStandardMaterial | null)[]>([]);
  const lit = useRef(0);
  const reduced = useReducedMotion();
  const popRef = useRef<Group>(null);
  useFrame((_s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta, 0.1);
    const t = hovered || selected ? 1 : visited ? 0.3 : 0;
    lit.current += (t - lit.current) * 0.1;
    const e = 0.1 + lit.current * 0.7;
    for (const m of bookMats.current) if (m) m.emissiveIntensity = e;
  });
  return (
    <group position={position}>
      <group ref={popRef}>
      {/* case frame: back, sides, top, base — solidifies once the book is opened */}
      <SoftBox position={[0, 0.46, -0.09]} args={[0.74, 0.92, 0.06]} radius={0.02} liveSlug="zwijsen-ar-books" liveGhost={false} />
      <SoftBox position={[-0.355, 0.46, 0.04]} args={[0.03, 0.92, 0.26]} radius={0.01} liveSlug="zwijsen-ar-books" liveGhost={false} />
      <SoftBox position={[0.355, 0.46, 0.04]} args={[0.03, 0.92, 0.26]} radius={0.01} liveSlug="zwijsen-ar-books" liveGhost={false} />
      <SoftBox position={[0, 0.915, 0.04]} args={[0.74, 0.03, 0.26]} radius={0.01} liveSlug="zwijsen-ar-books" liveGhost={false} />
      <SoftBox position={[0, 0.02, 0.04]} args={[0.74, 0.04, 0.26]} radius={0.01} liveSlug="zwijsen-ar-books" liveGhost={false} />
      {/* shelves */}
      {[0.16, 0.42, 0.68].map((sy, s) => (
        <SoftBox key={s} position={[0, sy, 0.04]} args={[0.7, 0.02, 0.24]} radius={0.006} opacity={0.3} liveSlug="zwijsen-ar-books" liveGhost={false} />
      ))}
      {/* books — their spines glow when the bookcase is on */}
      {BOOKS.map((bk, i) => (
        <mesh key={i} position={bk.p} rotation={bk.r}>
          <boxGeometry args={bk.s} />
          <meshStandardMaterial ref={(m) => (bookMats.current[i] = m)} color={bk.c} emissive={bk.c} emissiveIntensity={0.1} roughness={0.6} />
        </mesh>
      ))}
      {/* a horizontal stack on the bottom-right shelf */}
      <group position={[0.19, 0.19, 0.02]}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.2, 0.03, 0.16]} />
          <meshStandardMaterial color="#26405f" emissive="#26405f" emissiveIntensity={0.12} roughness={0.6} />
        </mesh>
        <mesh position={[0.01, 0.032, 0.006]}>
          <boxGeometry args={[0.19, 0.028, 0.155]} />
          <meshStandardMaterial color="#3a608a" emissive="#3a608a" emissiveIntensity={0.12} roughness={0.6} />
        </mesh>
        <mesh position={[-0.008, 0.062, -0.004]}>
          <boxGeometry args={[0.18, 0.026, 0.15]} />
          <meshStandardMaterial color="#4f74a6" emissive="#4f74a6" emissiveIntensity={0.12} roughness={0.6} />
        </mesh>
      </group>
      {/* a little potted plant on top for detail — neutral glass, no green/brown */}
      <group position={[0.25, 0.93, 0.05]}>
        <mesh position={[0, 0.018, 0]}>
          <cylinderGeometry args={[0.03, 0.024, 0.04, 16]} />
          <GlassMat opacity={0.4} />
        </mesh>
        <mesh position={[0, 0.07, 0]}>
          <icosahedronGeometry args={[0.045, 0]} />
          <GlassMat opacity={0.16} />
        </mesh>
      </group>
      <LifeGroup slug="zwijsen-ar-books">
        <OpenBook slug="zwijsen-ar-books" position={[0.12, 0.52, 0.04]} />
      </LifeGroup>
      </group>
      {/* a mouse hiding behind the book — hops out of the gap and scurries around */}
      <BookcaseMouse gap={[0.12, 0.52, 0.04]} />
    </group>
  );
}

function RoomRig() {
  // DEV-only position scrubbers; tree-shaken from production builds (see devTweak).
  const desk = useTweak('Room.Desk', { position: [-1.2, 0, 0.18], rotationY: 1.76 });
  const couch = useTweak('Room.Couch', { position: [0.12, 0, -0.22], rotationY: -0.16 });
  const table = useTweak('Room.AR table', { position: [0, 0, 0.52] });
  const shelf = useTweak('Room.Bookcase', { position: [0.9, 0, -0.82] });
  const plant = useTweak('Room.Plant', { position: [-1.23, 0, 0.9] });
  const lamp = useTweak('Room.Floor lamp', { position: [-0.32, 0, -1.57] });
  return (
    <group>
      {/* round rug centred on the scene — lined up with the chip die below it;
          kept very sheer so it reads as a floor marking, not a bright disc */}
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[1.05, 1.05, 0.02, 56]} />
        <GlassMat opacity={0.06} />
      </mesh>
      <Line points={circlePts(1.05)} position={[0, 0.024, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.2} />
      <Line points={circlePts(0.78)} position={[0, 0.026, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.1} />

      {/* workstation (desk + monitor + chair) — front-left by the plant, angled
          toward the centre; the monitor flickers on hover. Engaging the monitor
          solidifies the desk, chair + plant with it (the life spreads). */}
      <group position={desk.position} rotation={[0, desk.rotationY, 0]}>
        <group position={[0, 0, -0.3]}>
          <SoftBox position={[0, 0.37, 0]} args={[0.95, 0.05, 0.45]} radius={0.03} outline liveSlug="virtuele-brigade" liveGhost={false} />
          {([[-0.42, -0.18], [0.42, -0.18], [-0.42, 0.18], [0.42, 0.18]] as [number, number][]).map(([lx, lz], i) => (
            <mesh key={i} position={[lx, 0.18, lz]}>
              <cylinderGeometry args={[0.02, 0.02, 0.36, 12]} />
              <LiveGlassMat slug="virtuele-brigade" ghost={false} opacity={0.26} />
            </mesh>
          ))}
          <LifeGroup slug="virtuele-brigade">
            <mesh position={[0, 0.45, -0.05]}>
              <cylinderGeometry args={[0.016, 0.016, 0.14, 12]} />
              <GlassMat opacity={0.26} />
            </mesh>
            <SoftBox position={[0, 0.62, -0.14]} args={[0.54, 0.34, 0.03]} radius={0.02} liveSlug="virtuele-brigade" />
            <RoomScreen slug="virtuele-brigade" position={[0, 0.62, -0.122]} args={[0.48, 0.28, 0.008]} />
          </LifeGroup>
          <SoftBox position={[0, 0.39, 0.12]} args={[0.34, 0.02, 0.12]} radius={0.012} opacity={0.26} />
          {/* desk clutter: a mug + papers */}
          <mesh position={[-0.36, 0.42, 0.12]}>
            <cylinderGeometry args={[0.03, 0.03, 0.06, 14]} />
            <GlassMat opacity={0.34} />
            <Edges threshold={30} color={NEUTRAL} />
          </mesh>
          <SoftBox position={[-0.05, 0.405, 0.14]} args={[0.13, 0.012, 0.17]} radius={0.004} opacity={0.3} />
          <VRHeadset position={[0.34, 0.44, 0.06]} rotation={[0, -0.6, 0]} />
        </group>
        {/* chair in front of the desk, facing the monitor */}
        <group position={[0, 0, 0.05]} rotation={[0, Math.PI, 0]}>
          <SoftBox position={[0, 0.24, 0]} args={[0.3, 0.06, 0.3]} radius={0.05} liveSlug="virtuele-brigade" liveGhost={false} />
          <SoftBox position={[0, 0.42, -0.14]} args={[0.3, 0.32, 0.05]} radius={0.05} liveSlug="virtuele-brigade" liveGhost={false} />
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.022, 0.022, 0.24, 12]} />
            <LiveGlassMat slug="virtuele-brigade" ghost={false} opacity={0.26} />
          </mesh>
        </group>
      </group>

      {/* bookcase (back-right) — engaging the Zwijsen book lights its spine +
          lifts the open book out of its gap */}
      <Bookcase position={shelf.position} />

      {/* couch + phone — faces the coffee table / room front (+z). Opening the
          phone solidifies the couch it sits on. */}
      <group position={couch.position} rotation={[0, couch.rotationY, 0]}>
        <SoftBox position={[0, 0.12, 0]} args={[0.92, 0.16, 0.44]} radius={0.07} outline liveSlug="popcore-games" liveGhost={false} />
        <SoftBox position={[0, 0.3, -0.2]} args={[0.92, 0.28, 0.09]} radius={0.06} liveSlug="popcore-games" liveGhost={false} />
        <SoftBox position={[-0.46, 0.22, 0]} args={[0.09, 0.24, 0.44]} radius={0.045} liveSlug="popcore-games" liveGhost={false} />
        <SoftBox position={[0.46, 0.22, 0]} args={[0.09, 0.24, 0.44]} radius={0.045} liveSlug="popcore-games" liveGhost={false} />
        <SoftBox position={[-0.24, 0.22, 0.02]} args={[0.3, 0.12, 0.32]} radius={0.06} opacity={0.22} liveSlug="popcore-games" liveGhost={false} />
        <LifeGroup slug="popcore-games">
          <Phone slug="popcore-games" position={[0.12, 0.205, 0.06]} args={[0.075, 0.155, 0.004]} liveColor="#ff7a3d" />
        </LifeGroup>
      </group>

      {/* coffee table with AR racing (Lightship Drive), directly in front of the couch */}
      <LifeGroup slug="lightship-drive">
        <CoffeeTableAR position={table.position} hoverSlug="lightship-drive" />
      </LifeGroup>

      {/* fill the diorama out, balanced around the centre; the plant belongs to
          the workstation corner, so it wakes with the monitor */}
      <PottedPlant position={plant.position} liveSlug="virtuele-brigade" />
      <FloorLamp position={lamp.position} />
    </group>
  );
}

/* ---------- Chip — tools, CV & data (bottom) ---------- */

/** Philips medical XR & AI — an ECG module with a tiny Vision Pro headset. On
 *  hover a bright blip sweeps the heart-rate waveform like a monitor trace. */
function PhilipsModule({ position, hoverSlug }: { position: V3; hoverSlug?: string }) {
  const { selected, visited } = useActive(hoverSlug ?? '');
  const reduced = useReducedMotion();
  const live = useRef(0);
  const base = useMemo(() => new Color('#9fb0bd'), []); // grey at rest
  const green = useMemo(() => new Color('#5fd07a'), []); // green on select
  const stripMat = useRef<MeshStandardMaterial>(null);
  const ecg = useMemo<V3[]>(
    () => [
      [-0.13, 0, 0], [-0.06, 0, 0], [-0.045, 0.05, 0], [-0.03, -0.035, 0], [-0.015, 0, 0],
      [0.04, 0, 0], [0.06, 0.06, 0], [0.08, -0.03, 0], [0.1, 0, 0], [0.13, 0, 0],
    ],
    [],
  );
  const dot = useRef<Mesh>(null);
  const k = useRef(0);
  const popRef = useRef<Group>(null);
  const yAtX = (x: number) => {
    for (let i = 0; i < ecg.length - 1; i++) {
      const [x0, y0] = ecg[i];
      const [x1, y1] = ecg[i + 1];
      if ((x >= x0 && x <= x1) || (x >= x1 && x <= x0)) return y0 + (y1 - y0) * (x1 === x0 ? 0 : (x - x0) / (x1 - x0));
    }
    return 0;
  };
  useFrame((s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta);
    k.current += ((selected || visited ? 1 : 0) - k.current) * 0.12;
    live.current += ((selected || visited ? 1 : 0) - live.current) * 0.07; // green stays after select
    if (stripMat.current) {
      stripMat.current.color.copy(base).lerp(green, live.current);
      stripMat.current.emissive.copy(base).lerp(green, live.current);
    }
    const d = dot.current;
    if (!d) return;
    d.visible = k.current > 0.04;
    const sweep = reduced ? 0.5 : (s.clock.elapsedTime * 0.6) % 1;
    const x = -0.13 + sweep * 0.26;
    d.position.set(x, 0.22 + yAtX(x), 0);
    d.scale.setScalar(0.5 + k.current + live.current * 0.6);
    const m = d.material as MeshStandardMaterial;
    m.color.copy(base).lerp(green, live.current);
    m.emissive.copy(base).lerp(green, live.current);
  });
  return (
    <group position={position}>
      <group ref={popRef}>
      <SoftBox position={[0, 0.14, 0]} args={[0.3, 0.05, 0.2]} radius={0.02} opacity={0.3} outline liveSlug="philips-medical-xr" />
      {/* the ECG waveform + a blip that sweeps it once engaged (the heart-rate signal) */}
      <Line points={ecg} position={[0, 0.22, 0]} color={selected || visited ? '#5fd07a' : '#9fb0bd'} lineWidth={1.8} transparent opacity={0.85} />
      <mesh ref={dot} visible={false}>
        <sphereGeometry args={[0.014, 12, 12]} />
        <meshStandardMaterial color="#9fb0bd" emissive="#9fb0bd" emissiveIntensity={2.2} roughness={0.3} toneMapped={false} />
      </mesh>
      {/* a tiny Vision Pro headset */}
      <group position={[0, 0.18, 0.12]}>
        <RoundedBox args={[0.14, 0.06, 0.05]} radius={0.02} smoothness={3}>
          <GlassMat opacity={0.34} />
        </RoundedBox>
        <mesh position={[0, 0, 0.026]}>
          <boxGeometry args={[0.1, 0.035, 0.004]} />
          <meshStandardMaterial ref={stripMat} userData={{ lifeSkip: true }} color="#9fb0bd" emissive="#9fb0bd" emissiveIntensity={0.4} roughness={0.4} toneMapped={false} />
        </mesh>
      </group>
      </group>
    </group>
  );
}

/** Decorative extra board parts — resistors, a crystal, a ribbon, solder pads. */
function MiscComponents() {
  return (
    <group>
      {/* resistors dotted across the mid-board */}
      {([[0.4, -0.3], [-0.34, 0.3], [0.28, 0.42], [-0.42, -0.32]] as [number, number][]).map(([x, z], i) => (
        <mesh key={i} position={[x, 0.135, z]} rotation={[0, i % 2 ? 0.6 : -0.4, 0]}>
          <boxGeometry args={[0.09, 0.03, 0.04]} />
          <GlassMat opacity={0.34} />
          <Edges threshold={30} color={NEUTRAL} />
        </mesh>
      ))}
      {/* crystal */}
      <mesh position={[0.34, 0.145, 0.18]}>
        <boxGeometry args={[0.1, 0.05, 0.06]} />
        <GlassMat opacity={0.4} />
        <Edges threshold={30} color={NEUTRAL} />
      </mesh>
      {/* solder pads — small neutral rings, scattered to the board's outer ring */}
      {([[0.72, 0.3], [-0.72, 0.86], [0.34, -0.92], [-0.5, -0.62], [0.86, -0.34], [-0.86, 0.1]] as [number, number][]).map(([x, z], i) => (
        <Line key={`p${i}`} points={circlePts(0.03, 18)} position={[x, 0.122, z]} color={NEUTRAL} lineWidth={1} transparent opacity={0.4} />
      ))}
    </group>
  );
}

/** A secondary IC with a finned heatsink. */
function Heatsink({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <SoftBox position={[0, 0.135, 0]} args={[0.24, 0.04, 0.24]} radius={0.01} opacity={0.34} />
      {[-0.08, -0.04, 0, 0.04, 0.08].map((x, i) => (
        <mesh key={i} position={[x, 0.21, 0]}>
          <boxGeometry args={[0.014, 0.11, 0.2]} />
          <GlassMat opacity={0.3} />
          <Edges threshold={30} color={NEUTRAL} />
        </mesh>
      ))}
    </group>
  );
}

/** A pin-header connector at the board edge. */
function PinHeader({ position, n = 6 }: { position: V3; n?: number }) {
  const span = (n - 1) * 0.045;
  return (
    <group position={position}>
      <SoftBox position={[0, 0.135, 0]} args={[span + 0.05, 0.04, 0.08]} radius={0.01} opacity={0.32} />
      {Array.from({ length: n }).map((_, i) => (
        <mesh key={i} position={[-span / 2 + i * 0.045, 0.18, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.06, 8]} />
          <meshStandardMaterial color={NEUTRAL} emissive={NEUTRAL} emissiveIntensity={0.3} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/* The chip "powers on": engaging any of its hotspots energises the whole board —
   current fills the traces out to each component and their LEDs flash. */
const CHIP_SLUGS = ['amsterdam-ai', 'custom-ar-framework', 'philips-medical-xr'];
function useChipEnergyTarget() {
  // The board powers on when any chip hotspot is selected and stays on once
  // visited — it comes to life by selecting, never by hovering.
  const selected = useSceneSelector((s) => CHIP_SLUGS.includes(s.selectedSlug ?? ''));
  const visited = useSceneSelector((s) => CHIP_SLUGS.some((c) => s.visited.includes(c)));
  return selected || visited ? 1 : 0;
}

// The board's components, spread well out around the die. Each gets a trace from
// the die and a coloured status LED that flashes (its own rhythm) when live.
// `ly` sits each LED on top of its component rather than floating above the board.
const CHIP_NODES: { x: number; z: number; ly: number; led: string; phase: number; speed: number }[] = [
  { x: 0.95, z: -0.72, ly: 0.2, led: '#7fe6ff', phase: 0.0, speed: 6.5 }, // custom-ar (back-right)
  { x: -0.95, z: -0.74, ly: 0.175, led: '#ff6a6a', phase: 1.1, speed: 5.0 }, // philips (left)
  { x: 0.92, z: 0.62, ly: 0.225, led: '#a9f75c', phase: 2.0, speed: 7.5 }, // database (front-right)
  { x: -0.98, z: 0.56, ly: 0.27, led: '#ffcf5e', phase: 0.7, speed: 5.8 }, // heatsink
  { x: 0.9, z: 0.92, ly: 0.17, led: '#7fe6ff', phase: 2.6, speed: 6.0 }, // computer vision
  { x: 0.0, z: 1.08, ly: 0.165, led: '#a9f75c', phase: 1.6, speed: 8.0 }, // pin header
  { x: -0.55, z: 0.95, ly: 0.195, led: '#ff6a6a', phase: 3.1, speed: 6.8 }, // cap
  { x: 0.55, z: -1.0, ly: 0.195, led: '#7fe6ff', phase: 0.4, speed: 7.0 }, // cap
];

/** A board trace that "fills" with current — a bright front sweeps from the die
 *  out to its component as the chip energises, then a pulse keeps flowing. Built
 *  as a vertex-coloured line so the fill can travel along it. */
function ChipTrace({ points, target, color }: { points: V3[]; target: number; color: string }) {
  const reduced = useReducedMotion();
  const { obj, colorAttr, colors } = useMemo(() => {
    const n = points.length;
    const pos = new Float32Array(n * 3);
    points.forEach((p, i) => {
      pos[i * 3] = p[0];
      pos[i * 3 + 1] = p[1];
      pos[i * 3 + 2] = p[2];
    });
    const cols = new Float32Array(n * 3);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    const ca = new BufferAttribute(cols, 3);
    g.setAttribute('color', ca);
    const m = new LineBasicMaterial({ vertexColors: true, transparent: true, toneMapped: false, depthWrite: false, blending: AdditiveBlending });
    return { obj: new ThreeLine(g, m), colorAttr: ca, colors: cols };
  }, [points]);
  const rest = useMemo(() => new Color(NEUTRAL), []);
  const hot = useMemo(() => new Color(color), [color]);
  const tmp = useMemo(() => new Color(), []);
  const k = useRef(0);
  useFrame((s) => {
    k.current += (target - k.current) * 0.07;
    const e = k.current;
    const t = s.clock.elapsedTime;
    const front = Math.min(1, e * 1.6); // the fill sweeps out as the chip energises
    const ch1 = reduced ? 0.5 : (t * 0.7) % 1; // bright charges travelling die → component
    const ch2 = reduced ? 0.5 : (t * 0.7 + 0.5) % 1;
    const n = colors.length / 3;
    for (let i = 0; i < n; i++) {
      const tt = i / (n - 1);
      const filled = tt < front ? 1 : 0;
      const charge = filled * (Math.exp(-((tt - ch1) ** 2) / 0.01) + Math.exp(-((tt - ch2) ** 2) / 0.01));
      const b = 0.12 + e * (filled * 0.4 + charge * 0.95); // steady fill + travelling charge
      tmp.copy(rest).lerp(hot, Math.min(1, filled * 0.7 + 0.25));
      colors[i * 3] = tmp.r * b;
      colors[i * 3 + 1] = tmp.g * b;
      colors[i * 3 + 2] = tmp.b * b;
    }
    colorAttr.needsUpdate = true;
  });
  return <primitive object={obj} />;
}

/** A small status LED that flashes on its own rhythm while the chip is live. */
function ChipLED({ position, color, target, phase, speed }: { position: V3; color: string; target: number; phase: number; speed: number }) {
  const reduced = useReducedMotion();
  const mat = useRef<MeshStandardMaterial>(null);
  const k = useRef(0);
  useFrame((s) => {
    k.current += (target - k.current) * 0.1;
    const blink = reduced ? 1 : Math.sin(s.clock.elapsedTime * speed + phase) > 0.45 ? 1 : 0.1;
    if (mat.current) mat.current.emissiveIntensity = 0.08 + k.current * 1.9 * blink;
  });
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.017, 12, 12]} />
      <meshStandardMaterial ref={mat} color={color} emissive={color} emissiveIntensity={0.08} roughness={0.3} toneMapped={false} />
    </mesh>
  );
}

/* ---- motherboard trace routing: straight runs joined by 90° / 45° corners ---- */
// densify a polyline so the per-vertex fill animation stays smooth on long runs
function densify(pts: V3[], step = 0.028): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / step));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1], a[2] + (b[2] - a[2]) * t]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
// an L-route from A to B with a 45° chamfer at the corner (PCB style)
function pcbRoute(ax: number, az: number, bx: number, bz: number, y: number, xFirst: boolean): V3[] {
  const sx = Math.sign(bx - ax) || 1;
  const sz = Math.sign(bz - az) || 1;
  const c = Math.min(0.1, Math.abs(bx - ax) * 0.5, Math.abs(bz - az) * 0.5);
  return xFirst
    ? [[ax, y, az], [bx - sx * c, y, az], [bx, y, az + sz * c], [bx, y, bz]]
    : [[ax, y, az], [ax, y, bz - sz * c], [ax + sx * c, y, bz], [bx, y, bz]];
}
// full trace from the package edge out to a component, leaving the edge square
function pcbTrace(bx: number, bz: number, y: number): V3[] {
  const HALF = 0.5;
  const xEdge = Math.abs(bx) >= Math.abs(bz);
  const sx = Math.sign(bx) || 1;
  const sz = Math.sign(bz) || 1;
  const ex = xEdge ? sx * HALF : Math.max(-HALF, Math.min(HALF, bx));
  const ez = xEdge ? Math.max(-HALF, Math.min(HALF, bz)) : sz * HALF;
  const stub = 0.08;
  const px = xEdge ? ex + sx * stub : ex;
  const pz = xEdge ? ez : ez + sz * stub;
  return densify([[ex, y, ez], ...pcbRoute(px, pz, bx, bz, y, xEdge)]);
}

/** custom-ar-framework as an AR camera lens — a barrel, aperture and a convex
 *  glass element that lights up (the lens "powers on") on hover / select. */
function LensComponent({ slug, position }: { slug: string; position: V3 }) {
  const { selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const mat = useRef<MeshStandardMaterial>(null);
  const k = useRef(0);
  const popRef = useRef<Group>(null);
  const lensC = useMemo(() => new Color('#7fe6ff'), []);
  useFrame((s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta);
    k.current += ((selected || visited ? 1 : 0) - k.current) * 0.12;
    if (mat.current) {
      const breathe = reduced ? 0 : Math.sin(s.clock.elapsedTime * 2.2) * 0.06;
      // ghost glass until opened, then the lens lights ice-blue
      mat.current.color.copy(GHOST_FILL).lerp(lensC, 0.2 + 0.8 * k.current);
      mat.current.emissive.copy(GHOST_FILL).lerp(lensC, 0.2 + 0.8 * k.current);
      mat.current.emissiveIntensity = 0.05 + k.current * (1.0 + breathe);
    }
  });
  return (
    <group position={position}>
      <group ref={popRef}>
      {/* barrel */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.075, 0.082, 0.1, 28]} />
        <GlassMat opacity={0.4} />
        <Edges threshold={20} color={NEUTRAL} />
      </mesh>
      {/* aperture ring */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.014, 28]} />
        <meshStandardMaterial color={NEUTRAL} emissive={NEUTRAL} emissiveIntensity={0.25} roughness={0.4} metalness={0.3} />
      </mesh>
      {/* convex glass lens that lights up */}
      <mesh position={[0, 0.108, 0]} scale={[1, 0.42, 1]}>
        <sphereGeometry args={[0.062, 24, 18]} />
        <meshStandardMaterial ref={mat} userData={{ lifeSkip: true }} color="#7fe6ff" emissive="#7fe6ff" emissiveIntensity={0.14} transparent opacity={0.55} roughness={0.12} metalness={0.1} toneMapped={false} />
      </mesh>
      {/* lens element rings */}
      <Line points={circlePts(0.055, 28)} position={[0, 0.119, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.5} />
      <Line points={circlePts(0.03, 20)} position={[0, 0.127, 0]} color="#7fe6ff" lineWidth={1.2} transparent opacity={0.6} />
      </group>
    </group>
  );
}

function ChipRig() {
  const { accent } = useAccent();
  const energy = useChipEnergyTarget();
  const TY = 0.026; // trace height, sitting on the PCB substrate
  const traces = useMemo(() => CHIP_NODES.map((nd) => pcbTrace(nd.x, nd.z, TY)), []);
  // a few decorative board traces (not to components) for the motherboard look
  const extra = useMemo(
    () => [
      densify(pcbRoute(0.58, -0.18, 1.02, -0.42, TY, true)),
      densify(pcbRoute(-0.58, 0.22, -1.05, 0.34, TY, true)),
      densify(pcbRoute(0.2, 0.55, 0.36, 1.04, TY, false)),
      densify(pcbRoute(-0.34, -0.55, -0.46, -1.04, TY, false)),
      densify(pcbRoute(0.55, 0.3, 0.86, 0.62, TY, true)),
    ],
    [],
  );
  return (
    <group>
      {/* the PCB substrate — every part mounts on it, so it reads as one board */}
      <RoundedBox args={[2.05, 0.02, 2.05]} radius={0.04} smoothness={2} position={[0, 0.01, 0]}>
        <meshStandardMaterial color="#10303a" transparent opacity={0.5} roughness={0.6} metalness={0.1} />
      </RoundedBox>
      <Line points={roundedRectPts(2.0, 2.0, 0.06)} position={[0, 0.022, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.4} />

      {/* package + die (carries amsterdam-ai — the chip powers on) */}
      <LifeGroup slug="amsterdam-ai">
        <SoftBox position={[0, 0.08, 0]} args={[1.05, 0.12, 1.05]} radius={0.08} outline liveSlug="amsterdam-ai" />
        <EmissiveHover slug="amsterdam-ai" position={[0, 0.15, 0]} args={[0.4, 0.04, 0.4]} rest={0.25} peak={1.2} liveColor="#ffcf5e" />
        <Line points={roundedRectPts(0.42, 0.42, 0.05)} position={[0, 0.175, 0]} color={accent} lineWidth={1.2} transparent opacity={0.6} />
      </LifeGroup>

      {/* motherboard traces fill with current; a solder pad + flashing LED per part */}
      {traces.map((t, i) => (
        <ChipTrace key={i} points={t} target={energy} color={accent} />
      ))}
      {extra.map((t, i) => (
        <ChipTrace key={`x${i}`} points={t} target={energy} color={accent} />
      ))}
      {CHIP_NODES.map((nd, i) => (
        <group key={i}>
          <Line points={circlePts(0.034, 16)} position={[nd.x, TY + 0.003, nd.z]} color={NEUTRAL} lineWidth={1} transparent opacity={0.5} />
          <ChipLED position={[nd.x, nd.ly, nd.z]} color={nd.led} target={energy} phase={nd.phase} speed={nd.speed} />
        </group>
      ))}

      {/* custom-ar-framework — an AR camera lens that lights up (back-right) */}
      <LifeGroup slug="custom-ar-framework">
        <LensComponent slug="custom-ar-framework" position={[0.95, 0.02, -0.72]} />
      </LifeGroup>

      {/* decorative round caps */}
      {([[-0.55, 0.95], [0.55, -1.0]] as [number, number][]).map(([cx, cz], i) => (
        <mesh key={i} position={[cx, 0.13, cz]}>
          <cylinderGeometry args={[0.05, 0.05, 0.12, 20]} />
          <GlassMat opacity={0.34} />
          <Edges threshold={30} color={NEUTRAL} />
        </mesh>
      ))}

      {/* round database stack (top platter is the accent) — moved to the front-right,
          into the spot the AR lens vacated, so the board stays balanced */}
      <group position={[0.92, 0, 0.62]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 0.05 + i * 0.07, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.06, 28]} />
            {i === 2 ? (
              <meshStandardMaterial color={NEUTRAL} emissive={NEUTRAL} emissiveIntensity={0.4} roughness={0.45} />
            ) : (
              <GlassMat opacity={0.28} />
            )}
            {i !== 2 && <Edges threshold={30} color={NEUTRAL} />}
          </mesh>
        ))}
      </group>

      {/* computer-vision frame (neutral — not a hotspot) */}
      <Line points={roundedRectPts(0.34, 0.34, 0.05)} position={[0.9, 0.16, 0.92]} color={NEUTRAL} lineWidth={1.4} transparent opacity={0.75} />

      {/* secondary IC + heatsink and a pin-header connector fill the board out */}
      <Heatsink position={[-0.98, 0, 0.56]} />
      <PinHeader position={[0.0, 0, 1.08]} n={6} />

      {/* Philips medical XR & AI module (heart-rate signal animates on hover) — left side */}
      <LifeGroup slug="philips-medical-xr">
        <PhilipsModule position={[-0.95, 0, -0.74]} hoverSlug="philips-medical-xr" />
      </LifeGroup>
      <MiscComponents />
    </group>
  );
}

function HotspotMarker({ hotspot, color, onActivate }: { hotspot: Hotspot; color: string; onActivate: (h: Hotspot) => void }) {
  const study = caseBySlug(hotspot.slug);
  const label = study?.title ?? hotspot.slug;
  const { selected, visited } = useActive(hotspot.slug);
  // The marker is the invitation to click — it always carries the layer
  // accent so it stands out against the ghost world, growing a touch
  // brighter once the object it points to has been brought alive.
  const alive = selected || visited;
  const anchor: V3 = hotspot.anchor ?? [hotspot.position[0], 0, hotspot.position[2]];
  return (
    <group>
      {/* leader line from the object up to the floating crosshair */}
      <Line points={[anchor, hotspot.position]} color={color} lineWidth={1} transparent opacity={alive ? 0.55 : 0.4} />
      {/* a ring marking the exact spot on the object */}
      <mesh position={anchor} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.016, 0.027, 20]} />
        <meshBasicMaterial color={color} transparent opacity={alive ? 0.65 : 0.48} side={2} toneMapped={false} />
      </mesh>
      <Html position={hotspot.position} center zIndexRange={[20, 0]} className="hotspot-wrap">
        <span
          className="hotspot"
          data-open={selected || undefined}
          data-alive={alive || undefined}
          style={{ '--hot': color } as CSSProperties}
        >
          <button
            type="button"
            className="hotspot__dot"
            aria-label={`${label} — open node`}
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
            <span className="hotspot__label">{label}</span>
          </button>
        </span>
      </Html>
    </group>
  );
}

const RIGS: Record<LayerId, () => JSX.Element> = { city: CityRig, room: RoomRig, chip: ChipRig };
const SEED: Record<LayerId, number> = { city: 11, room: 29, chip: 53 };

/* ---------- Cross-layer signal lines ----------
   Related projects on different layers are wired together like a tidy run of
   cable: orthogonal segments with rounded pipe-bends that lead out of one node,
   drop a vertical riser in the margin, and lead into the other. The cables sit
   in the scene at rest (dim, neutral — unhighlighted); touching either endpoint
   lights that run up in its thread colour and sends data packets flowing through
   it, with a small label naming the thread. They live in world space because
   they bridge the differently-scaled layer groups. */
interface Relation {
  thread: string; // shown as a faint label on the link
  from: string; // slug — packets flow from → to
  to: string; // slug
  color: string;
}

// Three threads weaving down the stack. AR: the framework powers the AR race
// table, which surfaces as a city park. XR · simulation: the medical-XR module
// feeds the brigade's training sim. AI · data: the model serves the game backend
// and the city's Alliander grid work.
const THREAD = { ar: '#46d6e6', xr: '#c79bff', data: '#bff06a' };
const RELATIONS: Relation[] = [
  { thread: 'AR', from: 'custom-ar-framework', to: 'lightship-drive', color: THREAD.ar },
  { thread: 'AR', from: 'lightship-drive', to: 'arcam', color: THREAD.ar },
  { thread: 'AR', from: 'custom-ar-framework', to: 'zwijsen-ar-books', color: THREAD.ar },
  { thread: 'AR games', from: 'dtt-amsterdam', to: 'lightship-drive', color: THREAD.ar },
  { thread: 'XR · simulation', from: 'philips-medical-xr', to: 'virtuele-brigade', color: THREAD.xr },
  { thread: 'AI · data', from: 'amsterdam-ai', to: 'popcore-games', color: THREAD.data },
  { thread: 'AI · data', from: 'amsterdam-ai', to: 'alliander-hololens', color: THREAD.data },
];

const HOTSPOT_BY_SLUG: Record<string, Hotspot> = Object.fromEntries(HOTSPOTS.map((h) => [h.slug, h]));
const SIGNAL_PACKETS = 5;
const PIPE_OFFSET = 0.7; // how far the vertical riser sits outside the link's midpoint
const PIPE_REST = new Color('#5a6e82'); // unlit cable colour (before highlight)
const _sv = new Vector3(); // scratch for sampling the curve each frame

// A stable outward direction for links whose endpoints both sit on the spine.
function hashDir(s: string): Vector3 {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  const a = (((h % 360) + 360) % 360) * (Math.PI / 180);
  return new Vector3(Math.cos(a), 0, Math.sin(a));
}

// Replace each interior corner of a polyline with a small quadratic fillet, so
// the right-angle cable route reads as bent pipe rather than hard mitres.
function roundCorners(pts: Vector3[], radius: number, seg = 5): Vector3[] {
  if (pts.length < 3) return pts;
  const out: Vector3[] = [pts[0].clone()];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const inDir = p.clone().sub(pts[i - 1]);
    const outDir = pts[i + 1].clone().sub(p);
    const r = Math.min(radius, inDir.length() / 2, outDir.length() / 2);
    inDir.normalize();
    outDir.normalize();
    const p1 = p.clone().addScaledVector(inDir, -r);
    const p2 = p.clone().addScaledVector(outDir, r);
    out.push(p1);
    for (let s = 1; s < seg; s++) {
      const t = s / seg;
      out.push(p1.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(p, 2 * (1 - t) * t).addScaledVector(p2, t * t));
    }
    out.push(p2);
  }
  out.push(pts[pts.length - 1].clone());
  return out;
}

// Manhattan "cable" route between two anchors on different layers: lead out at
// the source layer, drop a vertical riser in the margin, lead into the target.
function pipeRoute(pA: Vector3, pB: Vector3, key: string): { points: Vector3[]; riser: Vector3 } {
  const midX = (pA.x + pB.x) / 2;
  const midZ = (pA.z + pB.z) / 2;
  let out = new Vector3(midX, 0, midZ);
  if (out.length() < 0.2) out = hashDir(key); // both endpoints on the spine → pick a side
  out.normalize().multiplyScalar(PIPE_OFFSET);
  const rx = midX + out.x;
  const rz = midZ + out.z;
  const raw = [
    new Vector3(pA.x, pA.y, pA.z),
    new Vector3(rx, pA.y, pA.z), // run out along X at the source layer
    new Vector3(rx, pA.y, rz), // …then Z, to the foot/head of the riser
    new Vector3(rx, pB.y, rz), // vertical riser between the layers
    new Vector3(rx, pB.y, pB.z), // run in along Z at the target layer
    new Vector3(pB.x, pB.y, pB.z), // …then X, into the node
  ].filter((p, i, arr) => i === 0 || p.distanceTo(arr[i - 1]) > 1e-4);
  return { points: roundCorners(raw, 0.12, 5), riser: new Vector3(rx, (pA.y + pB.y) / 2, rz) };
}

function SignalLine({ thread, from, to, color }: Relation) {
  const reduced = useReducedMotion();
  const { hovered: hovA, selected: selA } = useActive(from);
  const { hovered: hovB, selected: selB } = useActive(to);

  // The cable route + a curve along it for sampling the flowing packets. The
  // label sits beside the vertical riser, the most "between-layers" point.
  const { curve, points, apex } = useMemo(() => {
    const pA = anchorWorld(HOTSPOT_BY_SLUG[from]);
    const pB = anchorWorld(HOTSPOT_BY_SLUG[to]);
    const { points: route, riser } = pipeRoute(pA, pB, from + to);
    const c = new CatmullRomCurve3(route, false, 'catmullrom', 0);
    return { curve: c, points: route, apex: riser.add(new Vector3(0, 0.1, 0)) };
  }, [from, to]);

  const lineRef = useRef<any>(null);
  const pointsRef = useRef<ThreePoints>(null);
  const posAttr = useRef<BufferAttribute>(null);
  const colAttr = useRef<BufferAttribute>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const posArr = useMemo(() => new Float32Array(SIGNAL_PACKETS * 3), []);
  const colArr = useMemo(() => new Float32Array(SIGNAL_PACKETS * 3), []);
  const baseCol = useMemo(() => new Color(color), [color]);
  const k = useRef(0); // eased activation: 0 idle, 0.5 hover, 1 selected
  const u = useRef(0); // packet flow phase

  useFrame((_s, delta) => {
    const target = selA || selB ? 1 : hovA || hovB ? 0.6 : 0;
    k.current += (target - k.current) * 0.12;
    const kk = k.current;

    // The cable is always present (dim, neutral) and lights up in its thread
    // colour, brighter and a touch heavier, as the link is highlighted.
    const m = lineRef.current?.material;
    if (m) {
      const op = 0.22 + kk * 0.4;
      const lw = 1.8 + kk * 1.4;
      m.opacity = op;
      m.linewidth = lw;
      if (m.color) m.color.copy(PIPE_REST).lerp(baseCol, kk);
      if (m.uniforms) {
        if (m.uniforms.opacity) m.uniforms.opacity.value = op;
        if (m.uniforms.linewidth) m.uniforms.linewidth.value = lw;
        if (m.uniforms.diffuse && m.color) m.uniforms.diffuse.value.copy(m.color);
      }
    }

    // Data flows through the cable only while it's highlighted.
    if (!reduced) u.current = (u.current + delta * 0.16) % 1;
    const pen = pointsRef.current;
    if (pen) {
      const flowing = kk > 0.04;
      pen.visible = flowing;
      if (flowing) {
        for (let i = 0; i < SIGNAL_PACKETS; i++) {
          const f = (u.current + i / SIGNAL_PACKETS) % 1;
          curve.getPointAt(f, _sv);
          posArr[i * 3] = _sv.x;
          posArr[i * 3 + 1] = _sv.y;
          posArr[i * 3 + 2] = _sv.z;
          const b = kk * (0.5 + 0.5 * Math.sin(f * Math.PI)); // fade in/out at the ends
          colArr[i * 3] = baseCol.r * b;
          colArr[i * 3 + 1] = baseCol.g * b;
          colArr[i * 3 + 2] = baseCol.b * b;
        }
        if (posAttr.current) posAttr.current.needsUpdate = true;
        if (colAttr.current) colAttr.current.needsUpdate = true;
      }
    }

    if (labelRef.current) labelRef.current.style.opacity = String(kk > 0.04 ? Math.min(1, kk * 1.25) : 0);
  });

  return (
    <group>
      <DreiLine ref={lineRef} points={points} color={PIPE_REST.getStyle()} lineWidth={1.8} transparent opacity={0.22} depthWrite={false} toneMapped={false} fog={false} />
      <points ref={pointsRef} visible={false}>
        <bufferGeometry>
          <bufferAttribute ref={posAttr} attach="attributes-position" args={[posArr, 3]} />
          <bufferAttribute ref={colAttr} attach="attributes-color" args={[colArr, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.075} vertexColors transparent blending={AdditiveBlending} depthWrite={false} sizeAttenuation toneMapped={false} />
      </points>
      <Html position={apex} center zIndexRange={[12, 0]} className="signal-wrap" style={{ pointerEvents: 'none' }}>
        <span ref={labelRef} className="signal-label" style={{ '--sig': color, opacity: 0 } as CSSProperties}>
          {thread}
        </span>
      </Html>
    </group>
  );
}

/* ---------- Depth: a soft shadow under the focused layer that also darkens the
   layers beneath it, so one reads as the subject. Follows the active layer. */
function radialVeilTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(4,6,8,0.85)');
    g.addColorStop(0.55, 'rgba(4,6,8,0.52)');
    g.addColorStop(1, 'rgba(4,6,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new CanvasTexture(c);
}

function DepthVeil() {
  const journeyStep = useSceneSelector((s) => s.journeyStep);
  const reduced = useReducedMotion();
  const ref = useRef<Mesh>(null);
  const tex = useMemo(() => radialVeilTexture(), []);
  const targetY = ([1.32, 0, -1.32][journeyStep] ?? 1.32) - 0.34;
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.y = reduced ? targetY : ref.current.position.y + (targetY - ref.current.position.y) * 0.08;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, targetY, 0]}>
      <circleGeometry args={[2.7, 64]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} fog={false} />
    </mesh>
  );
}

export interface MaquetteProps {
  onActivate: (hotspot: Hotspot) => void;
}

export function Maquette({ onActivate }: MaquetteProps) {
  const journeyStep = useSceneSelector((s) => s.journeyStep);
  const activeLayer = (['city', 'room', 'chip'] as LayerId[])[journeyStep] ?? 'city';

  return (
    <group>
      <DepthVeil />
      {MAQUETTE_LAYERS.map((layer) => {
        const Rig = RIGS[layer.id];
        return (
          <AccentCtx.Provider key={layer.id} value={PALETTE[layer.id]}>
            <group position={[0, LAYER_Y[layer.id], 0]} scale={LAYER_SCALE[layer.id]}>
              <DotFloor step={layer.id === 'city' ? 0.17 : 0.26} />
              <PointCloud seed={SEED[layer.id]} />
              <Rig />
              {activeLayer === layer.id &&
                HOTSPOTS.filter((h) => h.layer === layer.id).map((h) => (
                  <HotspotMarker key={h.slug} hotspot={h} color={PALETTE[layer.id].accent} onActivate={onActivate} />
                ))}
            </group>
          </AccentCtx.Provider>
        );
      })}
      {RELATIONS.map((rel, i) => (
        <SignalLine key={i} {...rel} />
      ))}
    </group>
  );
}
