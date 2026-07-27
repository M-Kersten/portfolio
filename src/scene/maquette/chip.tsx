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
import { NEUTRAL, useAccent, circlePts, roundedRectPts, Line, useActive, bounceObject, FX, fxEnv, type V3 } from './shared';
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
  const popRef = useRef<Group>(null);
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

  useFrame((s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta);
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
      <group ref={popRef}>
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
      {/* Solder pads — small neutral rings on the outer ring, in the gaps between
          the eight occupied slots (see PADS). They used to sit at y 0.122, which
          floated them a full 0.1 above the substrate; they lie ON the board now,
          at the same height as the traces that reach them. */}
      {PADS.map(([x, z], i) => (
        <Line key={`p${i}`} points={circlePts(0.03, 18)} position={[x, TY + 0.003, z]} color={NEUTRAL} lineWidth={1} transparent opacity={0.4} />
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

// Each slot gets a trace from the die and a coloured status LED that flashes on
// its own rhythm when live. `ly` sits each LED on top of its own part rather
// than floating above the board, so it stays tied to whatever occupies the slot.
// LED palette stays inside the site's accents: cyan, lime, the coral from the
// Room layer, and the die's amber — no stray primary reds.
const CHIP_NODES: { x: number; z: number; ly: number; led: string; phase: number; speed: number }[] = [
  // corners — the units
  { x: CORNER, z: -CORNER, ly: 0.2, led: '#7fe6ff', phase: 0.0, speed: 6.5 }, // custom-ar camera (back-right)
  { x: -CORNER, z: -CORNER, ly: 0.175, led: '#ff9068', phase: 1.1, speed: 5.0 }, // philips monitor (back-left)
  { x: CORNER, z: CORNER, ly: 0.225, led: '#a9f75c', phase: 2.0, speed: 7.5 }, // database stack (front-right)
  { x: -CORNER, z: CORNER, ly: 0.27, led: '#ffcf5e', phase: 0.7, speed: 5.8 }, // heatsink (front-left)
  // edge midpoints — the small parts
  { x: EDGE, z: 0, ly: 0.17, led: '#7fe6ff', phase: 2.6, speed: 6.0 }, // computer-vision frame (right)
  { x: 0, z: EDGE, ly: 0.165, led: '#a9f75c', phase: 1.6, speed: 8.0 }, // pin header (front)
  { x: -EDGE, z: 0, ly: 0.195, led: '#ff9068', phase: 3.1, speed: 6.8 }, // cap (left)
  { x: 0, z: -EDGE, ly: 0.195, led: '#7fe6ff', phase: 0.4, speed: 7.0 }, // cap (back)
];

// The six decorative solder pads sit on the same ring, but on the diagonals
// BETWEEN the eight occupied slots, so they read as the spare footprints a real
// board leaves between its parts instead of colliding with them.
const PAD_R = 0.94;
const PADS: [number, number][] = [22.5, 67.5, 112.5, 157.5, 202.5, 337.5].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return [PAD_R * Math.cos(a), PAD_R * Math.sin(a)];
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

/** custom-ar-framework as a fixed security / computer-vision camera. A faceted
 *  low-poly bullet head hangs from an articulated two-segment leg — base puck →
 *  knee joint → overhead grip, circular joint discs like a lamp arm — aimed out
 *  past the back of the board. Selecting it spins the head one quick turn and
 *  spawns the hologram: a clean cone of light onto a wireframe cube that bobs
 *  and turns in the beam. Once alive it keeps scanning — small continuous pans
 *  and nods around the cube, selected or not (visited things stay awake). */
const CAM_LENS_Z = 0.17; // cone apex, just past the hood
const CAM_CUBE_Z = 0.78; // hologram centre, out in front of the lens
const CAM_CUBE = 0.22; // hologram cube edge length
const CAM_CONE_R = 0.22; // vision-cone radius where it meets the cube
const FACET = Math.PI / 8; // spin octagonal parts so a flat facet faces up
const HEAD_DROP = -0.08; // head centre, hanging below the grip pivot
function SecurityCamera({ slug, position, aimYaw = 2.35, aimPitch = -0.05 }: { slug: string; position: V3; aimYaw?: number; aimPitch?: number }) {
  const { selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const popRef = useRef<Group>(null);
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
  const spinT = useRef(0); // select-spin envelope, 1 → 0
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
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta);
    const t = s.clock.elapsedTime;
    const alive = selected || visited ? 1 : 0;
    k.current += (alive - k.current) * 0.12;
    // selecting spawns the hologram — and it stays once visited (life mechanic)
    holo.current += (alive - holo.current) * (reduced ? 1 : 0.09);
    scanW.current += (alive - scanW.current) * 0.04;
    if (selected && !wasSel.current && !reduced) spinT.current = 1; // rising edge
    wasSel.current = selected;
    spinT.current = Math.max(0, spinT.current - delta * 1.15);
    const on = k.current;
    if (lensMat.current) {
      const breathe = reduced ? 0 : Math.sin(t * 2.2) * 0.06;
      lensMat.current.color.copy(GHOST_FILL).lerp(lensC, 0.2 + 0.8 * on);
      lensMat.current.emissive.copy(GHOST_FILL).lerp(lensC, 0.2 + 0.8 * on);
      lensMat.current.emissiveIntensity = 0.05 + on * (1.0 + breathe);
    }
    // head: one quick unwinding turn as the hologram spawns, then a continuous
    // slight scan — panning and nodding around the cube like it's tracking it.
    // The cube holds its spot (it lives outside headRef), so the beam plays
    // over it as the camera looks around.
    if (headRef.current && !reduced) {
      const spin = -Math.PI * 2 * spinT.current * spinT.current;
      headRef.current.rotation.y = spin + scanW.current * (Math.sin(t * 0.45) * 0.16 + Math.sin(t * 0.21) * 0.07);
      headRef.current.rotation.x = scanW.current * Math.sin(t * 0.33) * 0.045;
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
      <group ref={popRef}>
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
                <meshStandardMaterial color={NEUTRAL} emissive={NEUTRAL} emissiveIntensity={0.25} roughness={0.4} metalness={0.3} />
              </mesh>
              <mesh position={[0, -0.015, 0]}>
                <boxGeometry args={[0.034, 0.014, 0.034]} />
                <LiveGlassMat slug={slug} opacity={0.5} />
              </mesh>
              <group position={[0, HEAD_DROP, 0]}>
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
  const traces = useMemo(() => CHIP_NODES.map((nd) => pcbTrace(nd.x, nd.z, TY)), []);
  // The remaining traces run out to the spare solder pads. They used to end at
  // hand-picked coordinates, which left one dead-ending 0.17 from the database
  // stack as though it had missed its target; routing them to the pads means
  // every trace on the board terminates somewhere, and every pad is fed.
  const extra = useMemo(() => PADS.map(([x, z]) => pcbTrace(x, z, TY)), []);
  return (
    <group>
      {/* the PCB substrate — every part mounts on it, so it reads as one board */}
      <BlobShadow position={[0, 0.002, 0]} radius={1.4} opacity={0.34} />
      <RoundedBox args={[2.05, 0.02, 2.05]} radius={0.04} smoothness={2} position={[0, 0.01, 0]}>
        <meshStandardMaterial color="#10303a" transparent opacity={0.5} roughness={0.6} metalness={0.1} />
      </RoundedBox>
      <Line points={roundedRectPts(2.0, 2.0, 0.06)} position={[0, 0.022, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.4} />

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
          <ChipLED position={[nd.x, nd.ly, nd.z]} color={nd.led} target={energy} phase={nd.phase} speed={nd.speed} idle={i === 0 || i === 5} />
        </group>
      ))}

      {/* custom-ar-framework — a security / CV camera projecting a tracked
          hologram cube (back-right corner slot) */}
      <LifeGroup slug="custom-ar-framework">
        <SecurityCamera slug="custom-ar-framework" position={[CORNER, 0.02, -CORNER]} />
      </LifeGroup>

      {/* decorative round caps — the left and back edge slots */}
      {([[-EDGE, 0], [0, -EDGE]] as [number, number][]).map(([cx, cz], i) => (
        <mesh key={i} position={[cx, 0.13, cz]}>
          <cylinderGeometry args={[0.05, 0.05, 0.12, 20]} />
          <GlassMat opacity={0.34} />
          <Edges threshold={30} color={NEUTRAL} />
        </mesh>
      ))}

      {/* round database stack (top platter is the accent) — front-right corner slot */}
      <group position={[CORNER, 0, CORNER]}>
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

      {/* computer-vision frame (neutral — not a hotspot) — right edge slot */}
      <Line points={roundedRectPts(0.34, 0.34, 0.05)} position={[EDGE, 0.16, 0]} color={NEUTRAL} lineWidth={1.2} transparent opacity={0.6} />

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

