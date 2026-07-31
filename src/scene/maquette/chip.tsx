// The CHIP layer (bottom) — tools, CV & data. A PCB with the pulsing die
// (Amsterdam AI), a security/CV camera projecting a tracked hologram cube
// (custom AR framework) and the Philips bedside heart-rate monitor, wired
// together with animated traces and LEDs that surge while a chip project is
// engaged. ChipRig composes and places everything.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, RoundedBox } from '@react-three/drei';
import { AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, DoubleSide, EdgesGeometry, Line as ThreeLine, LineBasicMaterial, LineSegments, MeshStandardMaterial, type Group, type Mesh, type MeshBasicMaterial } from 'three';
import { useSceneSelector } from '../store';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { NEUTRAL, useAccent, circlePts, roundedRectPts, Line, useActive, FX, fxEnv, type V3 } from './shared';
import { GHOST_FILL, LifeGroup, EmissiveHover } from './life';
import { GlassMat, LiveGlassMat, SoftBox } from './materials';
import { BlobShadow } from './backdrop';

/* ---------- Chip — tools, CV & data (bottom) ---------- */

/* ---- Philips medical XR & AI — a bedside vital-signs monitor ----
   A dark, ghosted screen at rest; once engaged it powers on to just two clean
   traces: a green ECG swept by a bright blip, and a cyan SpO₂ pleth below. */

// One PQRST heartbeat, laid out left→right from x0 (screen-local units).
const ecgBeat = (x0: number): V3[] => [
  [x0 + 0.0, 0, 0], [x0 + 0.02, 0, 0],
  [x0 + 0.028, 0.012, 0], [x0 + 0.037, 0, 0], // P
  [x0 + 0.05, 0, 0],
  [x0 + 0.056, -0.014, 0], [x0 + 0.062, 0.055, 0], [x0 + 0.069, -0.02, 0], [x0 + 0.075, 0, 0], // QRS
  [x0 + 0.092, 0, 0], [x0 + 0.106, 0.02, 0], [x0 + 0.12, 0, 0], // T
  [x0 + 0.14, 0, 0],
];

// A raw additive line for a glowing screen trace, its material opted out of the
// life-system ghosting (we drive its colour/opacity ourselves).
function traceObject(points: V3[], hex: string) {
  const pos = new Float32Array(points.length * 3);
  points.forEach((p, i) => {
    pos[i * 3] = p[0];
    pos[i * 3 + 1] = p[1];
    pos[i * 3 + 2] = p[2];
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  const m = new LineBasicMaterial({ color: new Color(hex), transparent: true, toneMapped: false, opacity: 0.9, depthWrite: false, blending: AdditiveBlending });
  m.userData.lifeSkip = true;
  return { line: new ThreeLine(g, m), mat: m };
}

function HeartMonitor({ position, slug }: { position: V3; slug: string }) {
  const { hovered, selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const screenMat = useRef<MeshStandardMaterial>(null);
  const blip = useRef<Mesh>(null);
  const trailRefs = useRef<(Mesh | null)[]>([]); // phosphor beads lagging the sweep
  const live = useRef(0); // 0 dormant → 1 alive
  const k = useRef(0); // hover/select brightness

  const grey = useMemo(() => new Color('#8fa1ad'), []);
  const green = useMemo(() => new Color('#5fd07a'), []);
  const cyan = useMemo(() => new Color('#7fe6ff'), []);

  const ecg = useMemo<V3[]>(() => [...ecgBeat(-0.15), ...ecgBeat(-0.008)], []);
  const pleth = useMemo<V3[]>(() => {
    const p: V3[] = [];
    for (let i = 0; i <= 64; i++) {
      const x = -0.15 + (i / 64) * 0.29;
      p.push([x, Math.pow(Math.max(0, Math.sin((x + 0.15) * 34)), 1.6) * 0.02, 0]);
    }
    return p;
  }, []);
  const ecgObj = useMemo(() => traceObject(ecg, '#5fd07a'), [ecg]);
  const plethObj = useMemo(() => traceObject(pleth, '#7fe6ff'), [pleth]);
  useEffect(
    () => () => {
      ecgObj.line.geometry.dispose();
      ecgObj.mat.dispose();
      plethObj.line.geometry.dispose();
      plethObj.mat.dispose();
    },
    [ecgObj, plethObj],
  );

  const yAtX = (x: number) => {
    for (let i = 0; i < ecg.length - 1; i++) {
      const [x0, y0] = ecg[i];
      const [x1, y1] = ecg[i + 1];
      if ((x >= x0 && x <= x1) || (x >= x1 && x <= x0)) return y0 + (y1 - y0) * (x1 === x0 ? 0 : (x - x0) / (x1 - x0));
    }
    return 0;
  };

  useFrame((s) => {
    const t = s.clock.elapsedTime;
    k.current += ((hovered || selected ? 1 : visited ? 0.5 : 0) - k.current) * 0.12;
    live.current += ((selected || visited ? 1 : 0) - live.current) * 0.07;
    const on = live.current;
    if (screenMat.current) screenMat.current.emissiveIntensity = 0.05 + 0.14 * on + 0.05 * k.current;
    ecgObj.mat.color.copy(grey).lerp(green, on);
    ecgObj.mat.opacity = 0.4 + 0.5 * on;
    plethObj.mat.color.copy(grey).lerp(cyan, on);
    plethObj.mat.opacity = 0.24 + 0.42 * on;
    // the sweeping blip + a beat-flash as it crosses the tall R-spike of the QRS
    const sweep = reduced ? 0.66 : (t * 0.7) % 1;
    const x = -0.15 + sweep * 0.28;
    const spike = Math.min(1, Math.max(0, (yAtX(x) - 0.03) / 0.025)); // ~1 on the R peak
    if (screenMat.current) screenMat.current.emissiveIntensity += spike * 0.22 * on; // the beep flash
    if (blip.current) {
      blip.current.visible = on > 0.05;
      blip.current.position.set(x, 0.035 + yAtX(x), 0.004);
      blip.current.scale.setScalar((0.55 + 0.7 * on) * (1 + spike * 0.9));
      const bm = blip.current.material as MeshStandardMaterial;
      bm.color.copy(grey).lerp(green, on);
      bm.emissive.copy(grey).lerp(green, on);
    }
    // phosphor trail: a few dimming beads lagging the sweep, like a CRT afterglow
    for (let i = 0; i < trailRefs.current.length; i++) {
      const tm = trailRefs.current[i];
      if (!tm) continue;
      const tx = x - (i + 1) * 0.014;
      const vis = on > 0.05 && tx >= -0.15 && !reduced;
      tm.visible = vis;
      if (!vis) continue;
      tm.position.set(tx, 0.035 + yAtX(tx), 0.003);
      const fade = 1 - (i + 1) / (trailRefs.current.length + 1);
      tm.scale.setScalar(0.5 * fade);
      (tm.material as MeshStandardMaterial).opacity = FX.peak * fade * on;
    }
  });

  return (
    <group position={position}>
      <group>
        {/* base pad on the board */}
        <SoftBox position={[0, 0.035, 0.02]} args={[0.36, 0.05, 0.16]} radius={0.02} opacity={0.34} liveSlug={slug} />
        {/* the monitor unit, tilted to face up-and-forward */}
        <group position={[0, 0.21, 0]} rotation={[-0.34, 0, 0]}>
          {/* casing — solidifies once visited, like every hotspot body */}
          <RoundedBox args={[0.42, 0.3, 0.05]} radius={0.02} smoothness={3}>
            <LiveGlassMat slug={slug} opacity={0.44} />
          </RoundedBox>
          <Line points={roundedRectPts(0.42, 0.3, 0.03)} position={[0, 0, 0.026]} color={NEUTRAL} lineWidth={1} transparent opacity={0.45} />
          {/* dark screen (drives its own glow) */}
          <mesh position={[0, 0.012, 0.027]}>
            <planeGeometry args={[0.35, 0.22]} />
            <meshStandardMaterial ref={screenMat} userData={{ lifeSkip: true }} color="#050f16" emissive="#0c2734" emissiveIntensity={0.06} roughness={0.5} toneMapped={false} />
          </mesh>
          {/* screen contents — just the two traces, sitting proud of the panel */}
          <group position={[0, 0.012, 0.03]}>
            <primitive object={ecgObj.line} position={[0, 0.035, 0.001]} />
            <primitive object={plethObj.line} position={[0, -0.045, 0.001]} />
            <mesh ref={blip} visible={false}>
              <sphereGeometry args={[0.009, 12, 12]} />
              <meshStandardMaterial color="#5fd07a" emissive="#5fd07a" emissiveIntensity={1.8} roughness={0.3} toneMapped={false} userData={{ lifeSkip: true }} />
            </mesh>
            {[0, 1, 2].map((i) => (
              <mesh key={i} ref={(r) => (trailRefs.current[i] = r)} visible={false}>
                <sphereGeometry args={[0.009, 10, 10]} />
                <meshStandardMaterial color="#5fd07a" emissive="#5fd07a" emissiveIntensity={1.5} transparent opacity={0} roughness={0.3} toneMapped={false} userData={{ lifeSkip: true }} />
              </mesh>
            ))}
          </group>
          {/* control buttons along the chin */}
          {[-0.15, -0.11, -0.07].map((bx, i) => (
            <mesh key={i} position={[bx, -0.12, 0.028]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.013, 0.013, 0.01, 16]} />
              <LiveGlassMat slug={slug} opacity={0.5} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

/** Decorative extra board parts — decoupling passives and spare solder pads. */
function MiscComponents() {
  // One passive per package edge, in the lateral band outboard of every trace, so
  // each sits on bare substrate beside the die. These used to be scattered at
  // radius ~0.5, which put them on TOP of the die package — no board does that,
  // and a chip wearing four resistors as a hat was most of why it read as messy.
  return (
    <group>
      {PASSIVES.map((p) => (
        <mesh key={p.edge} position={[p.x, 0.035, p.z]} rotation={[0, p.edge === 0 || p.edge === 2 ? 0 : Math.PI / 2, 0]}>
          <boxGeometry args={[0.09, 0.03, 0.04]} />
          <GlassMat opacity={0.34} />
          <Edges threshold={30} color={NEUTRAL} />
        </mesh>
      ))}
      {/* Spare solder pads — small neutral rings on the outer ring, in the gaps
          between the eight occupied slots (see PADS). They used to sit at y 0.122,
          which floated them a full 0.1 above the substrate; they lie ON the board
          now, at the same height as the traces that reach them. */}
      {PADS.map((p, i) => (
        <Line key={`p${i}`} points={circlePts(0.03, 18)} position={[p.x, TY + 0.003, p.z]} color={NEUTRAL} lineWidth={1} transparent opacity={0.4} />
      ))}
    </group>
  );
}

/** A secondary IC with a finned heatsink. */
/* Heights below are all measured off the board's top face at y 0.02. This part and
   the pin header used to sit at y 0.135 because they were originally mounted on TOP
   of the die package (whose top face is y 0.14); moving them out to the ring slots
   left them hanging a tenth of a unit above the substrate with nothing under them,
   which is what read as floating. */
function Heatsink({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <SoftBox position={[0, 0.04, 0]} args={[0.24, 0.04, 0.24]} radius={0.01} opacity={0.34} />
      {[-0.08, -0.04, 0, 0.04, 0.08].map((x, i) => (
        <mesh key={i} position={[x, 0.115, 0]}>
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
      {/* A taller, more solid body than the old 0.04 sliver: at board level that
          barely registered against the substrate and the pins read as six little
          cylinders floating on their own. A connector needs a block under it. */}
      <SoftBox position={[0, 0.05, 0]} args={[span + 0.05, 0.06, 0.085]} radius={0.01} opacity={0.5} />
      {Array.from({ length: n }).map((_, i) => (
        <mesh key={i} position={[-span / 2 + i * 0.045, 0.105, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.06, 8]} />
          {/* plain metal, not self-lit — the same idiom as the city tower's mast.
              Emissive on a dormant detail made the pins glow on a dead board. */}
          <meshStandardMaterial color={NEUTRAL} roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/* The chip "powers on" when the die itself (Amsterdam AI guides) is engaged —
   current fills the traces out to every component and their LEDs flash, as if
   the processor were driving the rest of the board. The camera and heart
   monitor already have their own dedicated wake-up animations, so they no
   longer also trigger a board-wide power surge when opened on their own. */
function useChipEnergyTarget() {
  // Comes to life by selecting, never by hovering, and stays on once visited.
  const selected = useSceneSelector((s) => s.selectedSlug === 'amsterdam-ai');
  const visited = useSceneSelector((s) => s.visited.includes('amsterdam-ai'));
  return selected || visited ? 1 : 0;
}

/* ---- board placement ----
   Every part that carries a status LED sits on one of eight slots around the
   die: the four DIAGONAL corners hold a unit (a project, or a major part), the
   four ORTHOGONAL edge midpoints hold a small one. The positions used to be
   hand-placed one at a time, which left parts crowding each other (the
   computer-vision frame sat 0.3 from the database stack) and nothing lining up
   with anything — the board read as parts dropped on a substrate. On the ring
   it reads as a laid-out PCB, and the traces from the die radiate symmetrically
   instead of wandering.

   The board is 2.05 square (±1.025) and the die package 1.05 (±0.525), so the
   ring has to live between about 0.55 and 1.0 out from centre. */
const CORNER = 0.75; // diagonal slots — the four units
const EDGE = 0.85; // orthogonal slots — the four small parts
const TY = 0.026; // trace height, sitting on the PCB substrate
const PKG = 0.525; // package half-width (the 1.05 body)

/* ---- where the runs leave the package ----
   Nine exit slots down each edge, evenly spaced. There used to be a modelled land
   at each one — a QFP comb — but at the scale this board is ever seen it was just
   36 more little boxes of noise around the part, so the lands are gone and only the
   slots remain: they still fan the traces out along the edge in a fixed order, which
   is what keeps the routing from crossing itself. Runs now emerge from under the
   package body, the way they do on a board with the pads underneath. */
const SLOTS_PER_EDGE = 9;
const SLOT_PITCH = 0.105; // the row stops short of the corners
const EXIT = PKG; // runs start at the package outline
const LEAD_OUT = 0.06; // every trace runs straight out this far before it turns

/* Edges are indexed 0 = +x, 1 = +z, 2 = -x, 3 = -z, and each edge carries its own
   lateral axis 90° counter-clockwise from its outward normal. Expressing every
   position in that frame is the whole trick: the same four destinations sit at the
   same lateral offsets on all four edges, so the routing is ONE pattern turned
   four times rather than 14 hand-placed runs, and it comes out symmetric by
   construction. */
const EDGE_N: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const slotLat = (i: number) => (i - (SLOTS_PER_EDGE - 1) / 2) * SLOT_PITCH;
/** A board point on edge `e`: `d` out along its normal, `t` along its lateral. */
function onEdge(e: number, d: number, t: number): [number, number] {
  const [nx, nz] = EDGE_N[e];
  return [nx * d - nz * t, nz * d + nx * t];
}

// Each slot gets a trace from the die and a coloured status LED that flashes on
// its own rhythm when live. `ly` sits each LED on top of its own part rather
// than floating above the board, so it stays tied to whatever occupies the slot;
// `fp` is its silkscreen footprint. `edge`/`pin` say which land it wires to —
// the corner units take the outermost land (8), the edge parts the centre one (4).
// LED palette stays inside the site's accents: cyan, lime, the coral from the
// Room layer, and the die's amber — no stray primary reds.
interface ChipNode { x: number; z: number; ly: number; led: string; phase: number; speed: number; edge: number; pin: number; fp?: [number, number] }
const CHIP_NODES: ChipNode[] = [
  // corners — the units, each leaving the edge it sits counter-clockwise from
  { x: CORNER, z: -CORNER, ly: 0.2, led: '#7fe6ff', phase: 0.0, speed: 6.5, edge: 3, pin: 8, fp: [0.3, 0.3] }, // custom-ar camera (back-right)
  { x: -CORNER, z: -CORNER, ly: 0.175, led: '#ff9068', phase: 1.1, speed: 5.0, edge: 2, pin: 8, fp: [0.44, 0.22] }, // philips monitor (back-left)
  { x: CORNER, z: CORNER, ly: 0.225, led: '#a9f75c', phase: 2.0, speed: 7.5, edge: 0, pin: 8, fp: [0.3, 0.3] }, // database stack (front-right)
  { x: -CORNER, z: CORNER, ly: 0.185, led: '#ffcf5e', phase: 0.7, speed: 5.8, edge: 1, pin: 8, fp: [0.3, 0.3] }, // heatsink (front-left)
  // edge midpoints — the small parts, straight out of the centre land
  { x: EDGE, z: 0, ly: 0.045, led: '#7fe6ff', phase: 2.6, speed: 6.0, edge: 0, pin: 4 }, // computer-vision footprint (right)
  { x: 0, z: EDGE, ly: 0.15, led: '#a9f75c', phase: 1.6, speed: 8.0, edge: 1, pin: 4, fp: [0.3, 0.13] }, // pin header (front)
  { x: -EDGE, z: 0, ly: 0.155, led: '#ff9068', phase: 3.1, speed: 6.8, edge: 2, pin: 4, fp: [0.14, 0.14] }, // cap (left)
  { x: 0, z: -EDGE, ly: 0.155, led: '#7fe6ff', phase: 0.4, speed: 7.0, edge: 3, pin: 4, fp: [0.14, 0.14] }, // cap (back)
];

// Two spare pad footprints per edge, in the lateral gaps the parts leave — the
// unpopulated positions a real board carries between its components. They wire to
// lands 6 and 2, so on every edge the four runs leave at lateral 0.42 / 0.21 / 0 /
// −0.21 and arrive at 0.75 / 0.36 / 0 / −0.36: monotonic, so nothing crosses.
const PAD_D = 0.868; // 0.94 out at 22.5° off the normal
const PAD_T = 0.36;
const PADS: { x: number; z: number; edge: number; pin: number }[] = [0, 1, 2, 3].flatMap((e) =>
  [{ t: PAD_T, pin: 6 }, { t: -PAD_T, pin: 2 }].map(({ t, pin }) => {
    const [x, z] = onEdge(e, PAD_D, t);
    return { x, z, edge: e, pin };
  }),
);

// The decorative passives sit on the substrate beside the package, in the lateral
// band outboard of every trace — they used to be dropped on TOP of the die
// package, which no board does.
const PASSIVE_D = 0.68;
const PASSIVE_T = -0.5;
/** Each passive is fed too, off the outermost unused land on its edge — they were
 *  the last things on the board just sitting there with nothing running to them. */
const PASSIVES: { x: number; z: number; edge: number; pin: number }[] = [0, 1, 2, 3].map((e) => {
  const [x, z] = onEdge(e, PASSIVE_D, PASSIVE_T);
  return { x, z, edge: e, pin: 0 };
});

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
    // this drives its own brightness per vertex every frame; presence must not also
    // scale it, or the routing dims out from under the animation
    m.userData.lifeSkip = true;
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
      // A much brighter floor than the old 0.12: dormant, the traces ARE the thing
      // that shows each part is wired to the die, so the routing has to read as
      // etched copper before the board is energised — not only as the reward for
      // it. Energising still more than doubles them.
      const b = 0.32 + e * (filled * 0.4 + charge * 0.95); // steady fill + travelling charge
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
function ChipLED({ position, color, target, phase, speed, idle = false }: { position: V3; color: string; target: number; phase: number; speed: number; idle?: boolean }) {
  const reduced = useReducedMotion();
  const mat = useRef<MeshStandardMaterial>(null);
  const k = useRef(0);
  useFrame((s) => {
    k.current += (target - k.current) * 0.1;
    const t = s.clock.elapsedTime;
    const blink = reduced ? 1 : Math.sin(t * speed + phase) > 0.45 ? 1 : 0.1;
    // idle heartbeat: a faint, slow blip even with no board energy, so the chip
    // reads as powered-but-asleep at rest. Fades out as the board actually wakes.
    const idleBlip = idle && !reduced ? Math.max(0, Math.sin(t * 1.15 + phase)) ** 10 * 0.3 * (1 - k.current) : 0;
    if (mat.current) mat.current.emissiveIntensity = 0.08 + k.current * 1.9 * blink + idleBlip;
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
/** The full run from a package land out to a part: every trace breaks out
 *  straight along its own land for LEAD_OUT — so the whole comb leaves the
 *  package in parallel, the way a real fan-out does — then takes one L with a 45°
 *  chamfer into the part. Starting at a named land rather than at a computed point
 *  on the package outline is what ties each part visibly back to the die. */
function landTrace(e: number, pin: number, bx: number, bz: number, y: number): V3[] {
  const t = slotLat(pin);
  const [ax, az] = onEdge(e, EXIT, t);
  const [lx, lz] = onEdge(e, EXIT + LEAD_OUT, t);
  // ±x edges break out along x, so turn x-first; ±z edges the other way
  return densify([[ax, y, az], ...pcbRoute(lx, lz, bx, bz, y, e === 0 || e === 2)]);
}

/** Where a run visibly ARRIVES: walking the route back from the part, the last
 *  point still clear of its footprint.
 *
 *  Runs end at the part's centre, which is correct — a real trace carries on under
 *  the body to pads you can't see — but it meant both the trace's end AND its solder
 *  pad sat hidden beneath the part, so from outside every run looked like it stopped
 *  short of whatever it was feeding. Putting the pad ring here instead, on bare
 *  substrate at the footprint edge, is what makes the connection land visibly.
 *
 *  Read off the real polyline rather than assumed, so it's right for a straight run
 *  and a chamfered corner alike, whichever axis the final straight ends up on. */
function landingPoint(route: V3[], nd: ChipNode): [number, number] {
  if (!nd.fp) return [nd.x, nd.z];
  const hw = nd.fp[0] / 2 + 0.014;
  const hd = nd.fp[1] / 2 + 0.014;
  for (let i = route.length - 1; i >= 0; i--) {
    const [x, , z] = route[i];
    if (Math.abs(x - nd.x) > hw || Math.abs(z - nd.z) > hd) return [x, z];
  }
  return [nd.x, nd.z];
}

/** custom-ar-framework as a fixed security / computer-vision camera. A faceted
 *  low-poly bullet head hangs from an articulated two-segment leg — base puck →
 *  knee joint → overhead grip, circular joint discs like a lamp arm — aimed out
 *  past the back of the board. Selecting it lifts the head once, like a desk lamp
 *  taking notice, and spawns the hologram: a clean cone of light onto a wireframe
 *  cube that bobs and turns in the beam. Once alive it keeps looking the cube up
 *  and down, selected or not (visited things stay awake). */
const CAM_LENS_Z = 0.17; // cone apex, just past the hood
const CAM_CUBE_Z = 0.78; // hologram centre, out in front of the lens
const CAM_CUBE = 0.22; // hologram cube edge length
const CAM_CONE_R = 0.22; // vision-cone radius where it meets the cube
const FACET = Math.PI / 8; // spin octagonal parts so a flat facet faces up
const HEAD_DROP = -0.08; // head centre, hanging below the grip pivot

/* The head's motion. It hangs off the grip pivot with the lens aimed +z, so a
   positive rotation.x tips that aim DOWN — pitch is the whole performance here
   and everything else is kept small enough to stay underneath it.
   One sine per axis, deliberately: the idle used to sum two sines on the yaw,
   which wandered without ever reading as a decision. */
const CAM_NOD = 0.12; // pitch sweep, rad (~7° either way)
const CAM_NOD_RATE = 0.62; // ~10s for a full down-up-down
// The pan is a fraction of the nod and runs at its own unrelated rate, so the two
// never phase-lock into a pattern you can predict.
const CAM_PAN = 0.05;
const CAM_PAN_RATE = 0.23;
// Looking up lifts the head a little: the tilt and the rise are one movement, so
// the bob is derived from the pitch rather than being its own free-running sine.
const CAM_BOB_PER_RAD = 0.1;
/* The focus rack, fired when the hologram appears: the camera hunts for focus.
   The barrel dollies in and out along its aim while the vision cone narrows and
   widens with it — tight when pushed in, wide when pulled back, the way a zoom
   trades field of view for reach. The two are driven off one curve so they read
   as a single lens action rather than two things happening near each other.
   A damped oscillation, so it overshoots and settles rather than sliding to a
   stop: an autofocus hunts past the mark before it locks. sin() starts at zero,
   so the rack always grows out of the resting pose — no first-frame jump. */
const FOCUS_FREQ = 7.0; // rad/s (~1.1Hz) — a deliberate rack, not a twitch
const FOCUS_DAMP = 2.2; // ~three clear in-out swings before it locks
const FOCUS_DOLLY = 0.055; // barrel travel along the aim; ~0.035 on the first swing
const FOCUS_CONE = 0.31; // cone radius swing; ~20% tighter on the first swing
const FOCUS_SETTLE = 2.4; // s; past here the term is negligible, so stop evaluating
function SecurityCamera({ slug, position, aimYaw = 2.35, aimPitch = -0.05 }: { slug: string; position: V3; aimYaw?: number; aimPitch?: number }) {
  const { selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const headRef = useRef<Group>(null);
  const lensMat = useRef<MeshStandardMaterial>(null);
  const coneMat = useRef<MeshBasicMaterial>(null);
  const holoRef = useRef<Group>(null); // the cube hologram, fixed on the aim axis
  const beamRef = useRef<Group>(null); // the cone + rim, attached to the lens
  const cubeRef = useRef<Group>(null);
  const cornerMats = useRef<(MeshStandardMaterial | null)[]>([]); // the tracked corners
  const k = useRef(0); // lens power
  const holo = useRef(0); // hologram presence
  const scanW = useRef(0); // continuous look-around weight (alive)
  const focusT = useRef(999); // seconds since the focus rack fired (999 = long done)
  const bodyRef = useRef<Group>(null); // the barrel — dollies along the aim
  const coneRef = useRef<Group>(null); // the vision cone + rim — widens/narrows
  const wasSel = useRef(false);
  const lensC = useMemo(() => new Color('#7fe6ff'), []);

  // the tracked cube's wireframe, on an owned material (opted out of ghosting)
  const cube = useMemo(() => {
    const geo = new EdgesGeometry(new BoxGeometry(CAM_CUBE, CAM_CUBE, CAM_CUBE));
    const mat = new LineBasicMaterial({ color: new Color('#8fd8ff'), transparent: true, toneMapped: false, opacity: 0.9, depthWrite: false });
    mat.userData.lifeSkip = true;
    return { obj: new LineSegments(geo, mat), mat, geo };
  }, []);
  useEffect(() => () => {
    cube.geo.dispose();
    cube.mat.dispose();
  }, [cube]);

  const corners = useMemo<V3[]>(() => {
    const c: V3[] = [];
    const h = CAM_CUBE / 2;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) c.push([sx * h, sy * h, sz * h]);
    return c;
  }, []);

  useFrame((s, delta) => {
    const t = s.clock.elapsedTime;
    const alive = selected || visited ? 1 : 0;
    k.current += (alive - k.current) * 0.12;
    // selecting spawns the hologram — and it stays once visited (life mechanic)
    holo.current += (alive - holo.current) * (reduced ? 1 : 0.09);
    scanW.current += (alive - scanW.current) * 0.04;
    if (selected && !wasSel.current && !reduced) focusT.current = 0; // rising edge
    wasSel.current = selected;
    focusT.current += delta;
    const on = k.current;
    if (lensMat.current) {
      const breathe = reduced ? 0 : Math.sin(t * 2.2) * 0.06;
      lensMat.current.color.copy(GHOST_FILL).lerp(lensC, 0.2 + 0.8 * on);
      lensMat.current.emissive.copy(GHOST_FILL).lerp(lensC, 0.2 + 0.8 * on);
      lensMat.current.emissiveIntensity = 0.05 + on * (1.0 + breathe);
    }
    // The idle: a steady up-and-down look over the cube. The cube holds its spot
    // (it lives outside headRef), so the beam sweeps across the tracked target as
    // the head nods — the nod amplitude is sized to keep the cube inside the cone
    // at the extremes.
    if (headRef.current && !reduced) {
      const pitch = scanW.current * Math.sin(t * CAM_NOD_RATE) * CAM_NOD;
      headRef.current.rotation.x = pitch;
      headRef.current.rotation.y = scanW.current * Math.sin(t * CAM_PAN_RATE) * CAM_PAN;
      headRef.current.position.y = -pitch * CAM_BOB_PER_RAD; // rises as it looks up
    }
    // The focus rack on select (see the FOCUS_* constants): the barrel pushes in
    // as the cone tightens, pulls back as it opens, hunting past the mark a few
    // times before it locks. One curve drives both so it reads as one lens action.
    const u = focusT.current;
    const rack = u < FOCUS_SETTLE ? Math.exp(-FOCUS_DAMP * u) * Math.sin(FOCUS_FREQ * u) : 0;
    if (bodyRef.current) bodyRef.current.position.z = FOCUS_DOLLY * rack;
    if (coneRef.current) {
      const w = 1 - FOCUS_CONE * rack; // scaled across the beam only, so its reach holds
      coneRef.current.scale.set(w, w, 1);
    }
    // the projected hologram materialises out of the lens
    const h = holo.current;
    if (holoRef.current) {
      holoRef.current.visible = h > 0.02;
      holoRef.current.scale.setScalar(h);
    }
    if (beamRef.current) {
      beamRef.current.visible = h > 0.02;
      beamRef.current.scale.setScalar(h);
    }
    cube.mat.opacity = 0.85 * h;
    if (coneMat.current) coneMat.current.opacity = 0.1 * h;
    if (cubeRef.current) {
      cubeRef.current.rotation.x = 0.42;
      if (!reduced) {
        cubeRef.current.rotation.y = t * 0.3; // a gentle turn…
        cubeRef.current.position.y = Math.sin(t * 1.4) * 0.02; // …and a soft bob
      }
    }
    // (the cube's corners light in a chase — the camera "reading" the hologram)
    const lead = reduced ? -1 : (t * 1.5) % corners.length;
    for (let i = 0; i < cornerMats.current.length; i++) {
      const m = cornerMats.current[i];
      if (!m) continue;
      let d = Math.abs(i - lead);
      d = Math.min(d, corners.length - d);
      const pulse = reduced ? 1 : Math.max(0.25, 1 - d * 0.5);
      m.emissiveIntensity = (0.3 + 1.5 * pulse) * h;
    }
  });

  return (
    <group position={position} rotation={[0, aimYaw, 0]}>
      <group>
        {/* ---- the leg stand: base puck → knee joint → overhead grip ----
            Line discipline: only the round joints keep rim edges (threshold 30,
            like the board's other cylinders); plates and boxes go edge-free so
            the mount doesn't read as a wireframe tangle. LiveGlassMat solidifies
            it all once visited, like every other hotspot body. */}
        <mesh position={[0, 0.02, -0.09]} rotation={[0, FACET, 0]}>
          <cylinderGeometry args={[0.05, 0.058, 0.035, 8]} />
          <LiveGlassMat slug={slug} opacity={0.5} />
          <Edges threshold={50} color={NEUTRAL} />
        </mesh>
        {/* lower segment — twin plates leaning forward to the knee */}
        {[-0.026, 0.026].map((x, i) => (
          <mesh key={`l${i}`} position={[x, 0.118, -0.053]} rotation={[0.43, 0, 0]}>
            <boxGeometry args={[0.011, 0.19, 0.034]} />
            <LiveGlassMat slug={slug} opacity={0.44} />
          </mesh>
        ))}
        {/* knee joint disc */}
        <mesh position={[0, 0.2, -0.015]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.032, 0.032, 0.064, 18]} />
          <LiveGlassMat slug={slug} opacity={0.5} />
          <Edges threshold={30} color={NEUTRAL} />
        </mesh>
        {/* upper segment — twin plates leaning back up to the grip hub */}
        {[-0.026, 0.026].map((x, i) => (
          <mesh key={`u${i}`} position={[x, 0.278, -0.045]} rotation={[-0.37, 0, 0]}>
            <boxGeometry args={[0.011, 0.17, 0.034]} />
            <LiveGlassMat slug={slug} opacity={0.44} />
          </mesh>
        ))}
        {/* grip hub + the horizontal arm reaching over the head */}
        <mesh position={[0, 0.355, -0.075]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.028, 0.028, 0.058, 18]} />
          <LiveGlassMat slug={slug} opacity={0.5} />
          <Edges threshold={30} color={NEUTRAL} />
        </mesh>
        <mesh position={[0, 0.358, -0.036]}>
          <boxGeometry args={[0.026, 0.02, 0.1]} />
          <LiveGlassMat slug={slug} opacity={0.46} />
        </mesh>

        {/* ---- the pivot: the head hangs from the grip and pans/nods on it ---- */}
        <group position={[0, 0.33, 0]}>
          {/* the hologram cube holds its spot on the aim axis while the camera
              scans around it — so the beam plays over the tracked target */}
          <group rotation={[aimPitch, 0, 0]}>
            <group ref={holoRef} visible={false} position={[0, HEAD_DROP, 0]}>
              <group ref={cubeRef} position={[0, 0, CAM_CUBE_Z]}>
                <primitive object={cube.obj} />
                <mesh>
                  <boxGeometry args={[CAM_CUBE, CAM_CUBE, CAM_CUBE]} />
                  <meshStandardMaterial color="#7fe6ff" emissive="#7fe6ff" emissiveIntensity={0.35} transparent opacity={0.08} toneMapped={false} depthWrite={false} side={DoubleSide} userData={{ lifeSkip: true }} />
                </mesh>
                {corners.map((c, i) => (
                  <mesh key={i} position={c}>
                    <sphereGeometry args={[0.006, 8, 8]} />
                    <meshStandardMaterial ref={(r) => (cornerMats.current[i] = r)} color="#d6f2ff" emissive="#8fd8ff" emissiveIntensity={1.4} toneMapped={false} userData={{ lifeSkip: true }} />
                  </mesh>
                ))}
              </group>
            </group>
          </group>
          <group ref={headRef}>
            <group rotation={[aimPitch, 0, 0]}>
              {/* pivot stub + yoke cap the head hangs from */}
              <mesh position={[0, 0.008, 0]}>
                <cylinderGeometry args={[0.012, 0.012, 0.045, 10]} />
                {/* plain metal — see the connector pins; nothing dormant self-lights */}
                <meshStandardMaterial color={NEUTRAL} roughness={0.4} metalness={0.5} />
              </mesh>
              <mesh position={[0, -0.015, 0]}>
                <boxGeometry args={[0.034, 0.014, 0.034]} />
                <LiveGlassMat slug={slug} opacity={0.5} />
              </mesh>
              {/* the barrel: everything past the yoke, beam included, so the focus
                  rack dollies the lens and its light together while the stub and
                  yoke stay put on the grip arm */}
              <group ref={bodyRef} position={[0, HEAD_DROP, 0]}>
                {/* faceted bullet body — threshold 50 hides the 45° facet seams,
                    so only the octagonal rims draw (the facets read via shading) */}
                <mesh position={[0, 0, -0.01]} rotation={[Math.PI / 2, FACET, 0]}>
                  <cylinderGeometry args={[0.054, 0.06, 0.2, 8]} />
                  <LiveGlassMat slug={slug} opacity={0.44} />
                  <Edges threshold={50} color={NEUTRAL} />
                </mesh>
                {/* back cap */}
                <mesh position={[0, 0, -0.12]} rotation={[Math.PI / 2, FACET, 0]}>
                  <cylinderGeometry args={[0.06, 0.046, 0.025, 8]} />
                  <LiveGlassMat slug={slug} opacity={0.5} />
                </mesh>
                {/* hood — an open octagonal shade past the lens */}
                <mesh position={[0, 0, 0.135]} rotation={[Math.PI / 2, FACET, 0]}>
                  <cylinderGeometry args={[0.062, 0.058, 0.075, 8, 1, true]} />
                  <LiveGlassMat slug={slug} opacity={0.32} />
                  <Edges threshold={50} color={NEUTRAL} />
                </mesh>
                {/* dark lens recess + the glass element that lights up */}
                <mesh position={[0, 0, 0.104]} rotation={[Math.PI / 2, FACET, 0]}>
                  <cylinderGeometry args={[0.048, 0.048, 0.012, 8]} />
                  <meshStandardMaterial color="#0b1418" roughness={0.5} metalness={0.2} />
                </mesh>
                <mesh position={[0, 0, 0.114]} scale={[1, 1, 0.5]}>
                  <sphereGeometry args={[0.04, 24, 18]} />
                  <meshStandardMaterial ref={lensMat} userData={{ lifeSkip: true }} color="#7fe6ff" emissive="#7fe6ff" emissiveIntensity={0.14} transparent opacity={0.6} roughness={0.12} metalness={0.1} toneMapped={false} />
                </mesh>

                {/* the beam — a clean cone of light, swinging with the head */}
                <group ref={beamRef} visible={false}>
                  {/* Cone + rim share one group so the focus rack can scale them
                      together. Both sit with the beam axis on local z — the cone
                      after its -90° tilt, the rim after its +90° one — so scaling
                      (w, w, 1) opens and closes the field without touching how
                      far the beam throws. */}
                  <group ref={coneRef}>
                    <mesh position={[0, 0, (CAM_LENS_Z + CAM_CUBE_Z) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
                      <coneGeometry args={[CAM_CONE_R, CAM_CUBE_Z - CAM_LENS_Z, 32, 1, true]} />
                      <meshBasicMaterial ref={coneMat} userData={{ lifeSkip: true }} color="#7fe6ff" transparent opacity={0} blending={AdditiveBlending} toneMapped={false} depthWrite={false} side={DoubleSide} />
                    </mesh>
                    {/* the beam's rim where it reaches the cube */}
                    <Line points={circlePts(CAM_CONE_R, 48)} position={[0, 0, CAM_CUBE_Z]} rotation={[Math.PI / 2, 0, 0]} color="#7fe6ff" lineWidth={1} transparent opacity={0.35} />
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

// Concentric data pulses rippling out across the board from the die — the
// processor "working" while the die (Amsterdam AI) is the active spot. Flat
// additive rings that expand from the die's edge to the board's and fade on a
// loop; tied to the die's own engagement (not the whole board) so it doesn't
// compete when another chip project is open, and silent under reduced motion.
function DiePulse() {
  const reduced = useReducedMotion();
  const { accent } = useAccent();
  const { selected, hovered } = useActive('amsterdam-ai');
  const groups = useRef<(Group | null)[]>([]);
  const mats = useRef<(MeshBasicMaterial | null)[]>([]);
  const e = useRef(0);
  const N = 3;
  useFrame((s) => {
    e.current += ((selected ? 1 : hovered ? 0.45 : 0) - e.current) * FX.engage;
    const t = s.clock.elapsedTime;
    for (let i = 0; i < N; i++) {
      const g = groups.current[i];
      const m = mats.current[i];
      if (!g || !m) continue;
      const p = reduced ? 0.5 : (t * FX.loopSpeed + i / N) % 1;
      const scale = 0.54 + p * 0.5; // die edge → board edge
      g.scale.set(scale, scale, scale);
      m.opacity = fxEnv(p) * FX.peak * e.current;
    }
  });
  return (
    <group position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {Array.from({ length: N }).map((_, i) => (
        <group key={i} ref={(r) => (groups.current[i] = r)}>
          <mesh>
            <ringGeometry args={[0.93, 1.0, 60]} />
            <meshBasicMaterial ref={(r) => (mats.current[i] = r)} color={accent} transparent opacity={0} blending={AdditiveBlending} side={DoubleSide} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function ChipRig() {
  const { accent } = useAccent();
  const energy = useChipEnergyTarget();
  // Every run on the board starts at a package land (see landTrace) — the eight
  // parts plus the eight spare pads, four runs per edge, the same pattern turned
  // four times.
  const traces = useMemo(() => CHIP_NODES.map((nd) => landTrace(nd.edge, nd.pin, nd.x, nd.z, TY)), []);
  // …and the spare pads and the passives, so every part on the board has a run
  // back to the die and no trace dead-ends anywhere.
  const extra = useMemo(() => [...PADS, ...PASSIVES].map((p) => landTrace(p.edge, p.pin, p.x, p.z, TY)), []);
  return (
    <group>
      {/* The PCB substrate — every part mounts on it, so it reads as one board.
          Wears the same frosted glass as every other dormant body in the maquette,
          just tinted to board-green: as a plain standard material it was the one
          large surface in the scene with no fresnel rim, no screen-space halftone
          and depth-writing on, so it read as an opaque slab dropped under a city
          and a room made of glass. */}
      <BlobShadow position={[0, 0.002, 0]} radius={1.4} opacity={0.34} />
      <RoundedBox args={[2.05, 0.02, 2.05]} radius={0.04} smoothness={2} position={[0, 0.01, 0]}>
        <GlassMat color="#10303a" opacity={0.38} />
      </RoundedBox>
      {/* board outline plus an inner keepout ring — two concentric rules is the
          cheapest thing that reads as fabricated silkscreen rather than a slab */}
      <Line points={roundedRectPts(2.0, 2.0, 0.06)} position={[0, 0.022, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.4} />
      <Line points={roundedRectPts(1.9, 1.9, 0.05)} position={[0, 0.022, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.16} />

      {/* silkscreen: a footprint outline printed under each part, and the package's
          own outline + pin-1 dot. Outlines that stay put whether or not the part
          above them is awake are what make the board read as a designed thing. */}
      {CHIP_NODES.map((nd, i) =>
        nd.fp ? (
          <Line
            key={`fp${i}`}
            points={roundedRectPts(nd.fp[0], nd.fp[1], 0.02)}
            position={[nd.x, TY + 0.001, nd.z]}
            color={NEUTRAL}
            lineWidth={1}
            transparent
            opacity={0.28}
          />
        ) : null,
      )}
      {/* pin-1 dot, off the package's back-left corner. It has to sit OUTSIDE the
          body: inside the 1.05 outline it was buried under the package itself and
          never drew. The package's own outline comes from SoftBox's `outline`. */}
      <Line points={circlePts(0.026, 14)} position={[-PKG - 0.05, TY + 0.002, -PKG - 0.05]} color={NEUTRAL} lineWidth={1.2} transparent opacity={0.5} />

      {/* soft pads under the raised parts, so they sit ON the board (one per slot) */}
      <BlobShadow position={[0, 0.024, 0]} radius={0.68} opacity={0.26} />
      <BlobShadow position={[-CORNER, 0.024, CORNER]} radius={0.2} opacity={0.3} />
      <BlobShadow position={[CORNER, 0.024, CORNER]} radius={0.18} opacity={0.3} />
      <BlobShadow position={[CORNER, 0.024, -CORNER]} radius={0.13} opacity={0.3} />
      <BlobShadow position={[-CORNER, 0.024, -CORNER]} radius={0.22} aspect={0.72} opacity={0.3} />
      <BlobShadow position={[0, 0.024, EDGE]} radius={0.18} aspect={0.5} opacity={0.28} />
      <BlobShadow position={[-EDGE, 0.024, 0]} radius={0.09} opacity={0.3} />
      <BlobShadow position={[0, 0.024, -EDGE]} radius={0.09} opacity={0.3} />

      {/* data pulses radiating from the die while it's the active spot */}
      <DiePulse />

      {/* package + die (carries amsterdam-ai — the chip powers on). The body's
          corner radius is small: at 0.08 it clamped to nearly half the 0.12 height
          and the package read as a cushion rather than a moulded slab. */}
      <LifeGroup slug="amsterdam-ai">
        <SoftBox position={[0, 0.08, 0]} args={[1.05, 0.12, 1.05]} radius={0.03} outline liveSlug="amsterdam-ai" />
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
      {CHIP_NODES.map((nd, i) => {
        // the pad sits where the run arrives, beside the part, not under it
        const [px, pz] = landingPoint(traces[i], nd);
        return (
          <group key={i}>
            <Line points={circlePts(0.03, 16)} position={[px, TY + 0.003, pz]} color={NEUTRAL} lineWidth={1.2} transparent opacity={0.65} />
            <ChipLED position={[nd.x, nd.ly, nd.z]} color={nd.led} target={energy} phase={nd.phase} speed={nd.speed} idle={i === 0 || i === 5} />
          </group>
        );
      })}

      {/* custom-ar-framework — a security / CV camera projecting a tracked
          hologram cube (back-right corner slot) */}
      <LifeGroup slug="custom-ar-framework">
        <SecurityCamera slug="custom-ar-framework" position={[CORNER, 0.02, -CORNER]} />
      </LifeGroup>

      {/* decorative round caps — the left and back edge slots */}
      {([[-EDGE, 0], [0, -EDGE]] as [number, number][]).map(([cx, cz], i) => (
        <mesh key={i} position={[cx, 0.08, cz]}>
          <cylinderGeometry args={[0.05, 0.05, 0.12, 20]} />
          <GlassMat opacity={0.34} />
          <Edges threshold={30} color={NEUTRAL} />
        </mesh>
      ))}

      {/* round database stack — front-right corner slot. All three platters are
          glass; the top one just carries a little more of it so the stack still
          reads as capped. It used to be a solid self-lit disc, which made a piece
          of dressing the brightest thing on a dormant board. */}
      <group position={[CORNER, 0, CORNER]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 0.05 + i * 0.07, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.06, 28]} />
            <GlassMat opacity={i === 2 ? 0.38 : 0.28} />
            <Edges threshold={30} color={NEUTRAL} />
          </mesh>
        ))}
      </group>

      {/* computer-vision footprint (neutral — not a hotspot) — right edge slot.
          Printed on the board rather than hovering at y 0.16, where it was a wire
          rectangle floating in mid-air with nothing beneath it. */}
      <Line points={roundedRectPts(0.34, 0.34, 0.05)} position={[EDGE, TY + 0.002, 0]} color={NEUTRAL} lineWidth={1.2} transparent opacity={0.5} />

      {/* secondary IC + heatsink and a pin-header connector fill the board out */}
      <Heatsink position={[-CORNER, 0, CORNER]} />
      <PinHeader position={[0, 0, EDGE]} n={6} />

      {/* Philips medical XR & AI — a bedside heart-rate monitor (back-left corner slot) */}
      <LifeGroup slug="philips-medical-xr">
        <HeartMonitor slug="philips-medical-xr" position={[-CORNER, 0, -CORNER]} />
      </LifeGroup>
      <MiscComponents />
    </group>
  );
}

