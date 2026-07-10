// Cross-layer signal threads: related projects on different layers are wired
// together like a tidy run of cable, with glowing packets and a label that
// fade in while either end is hovered/selected. Edit RELATIONS to change
// which projects are linked and what the thread is called.
import { useMemo, useRef, type CSSProperties } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line as DreiLine } from '@react-three/drei';
import { AdditiveBlending, BufferAttribute, CatmullRomCurve3, Color, Vector3, type Points as ThreePoints } from 'three';

import { useReducedMotion } from '../../lib/useReducedMotion';
import { useSceneSelector } from '../store';
import { HOTSPOTS, anchorWorld, type Hotspot } from '../framing';
import { useActive } from './shared';

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
export const RELATIONS: Relation[] = [
  { thread: 'Location based AR', from: 'lightship-drive', to: 'arcam', color: THREAD.ar },
  { thread: 'AR', from: 'custom-ar-framework', to: 'zwijsen-ar-books', color: THREAD.ar },
  { thread: 'Games', from: 'dtt-amsterdam', to: 'lightship-drive', color: THREAD.ar },
  { thread: 'Simulation', from: 'philips-medical-xr', to: 'virtuele-brigade', color: THREAD.xr },
  { thread: 'AI & data', from: 'amsterdam-ai', to: 'popcore-games', color: THREAD.data },
  { thread: 'Big data', from: 'amsterdam-ai', to: 'alliander-hololens', color: THREAD.data },
];

const HOTSPOT_BY_SLUG: Record<string, Hotspot> = Object.fromEntries(HOTSPOTS.map((h) => [h.slug, h]));
const SIGNAL_PACKETS = 5;
const PIPE_OFFSET = 0.7; // how far the vertical riser sits outside the link's midpoint
const PIPE_REST = new Color('#5a6e82'); // unlit cable colour (before highlight)
const _sv = new Vector3(); // scratch for sampling the curve each frame
const _sc = new Color(); // scratch for the completion colour drift
// Once every signal is found the cables stay calm — only their packets keep
// flowing, slowly drifting through the three thread colours, so the network
// reads as one quiet system exchanging everything.
const CYCLE = [new Color('#46d6e6'), new Color('#c79bff'), new Color('#bff06a')];

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

export function SignalLine({ thread, from, to, color }: Relation) {
  const reduced = useReducedMotion();
  const { hovered: hovA, selected: selA } = useActive(from);
  const { hovered: hovB, selected: selB } = useActive(to);
  // "All systems live": once every hotspot has been visited the whole network
  // stays lit — packets streaming on every thread — as the completion state.
  const complete = useSceneSelector((s) => s.completedAt !== null);

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
  const ck = useRef(0); // eased completion: packets-only, cables stay at rest
  const u = useRef(0); // packet flow phase

  useFrame((_s, delta) => {
    const target = selA || selB ? 1 : hovA || hovB ? 0.6 : 0;
    k.current += (target - k.current) * 0.12;
    ck.current += ((complete ? 1 : 0) - ck.current) * 0.03; // slow, quiet fade-in
    const kk = k.current;
    const cc = ck.current;

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

    // Data flows through the cable while it's highlighted — and, once all
    // signals are found, forever: a calm stream whose colours drift through
    // the thread palette while the cable itself stays at rest.
    if (!reduced) u.current = (u.current + delta * (kk > 0.04 ? 0.16 : 0.09)) % 1;
    const pen = pointsRef.current;
    if (pen) {
      const flowing = kk > 0.04 || cc > 0.04;
      pen.visible = flowing;
      if (flowing) {
        const t = _s.clock.elapsedTime;
        for (let i = 0; i < SIGNAL_PACKETS; i++) {
          const f = (u.current + i / SIGNAL_PACKETS) % 1;
          curve.getPointAt(f, _sv);
          posArr[i * 3] = _sv.x;
          posArr[i * 3 + 1] = _sv.y;
          posArr[i * 3 + 2] = _sv.z;
          const ends = 0.5 + 0.5 * Math.sin(f * Math.PI); // fade in/out at the ends
          const bA = kk * ends;
          const bC = cc * 0.5 * ends;
          if (bA >= bC) {
            colArr[i * 3] = baseCol.r * bA;
            colArr[i * 3 + 1] = baseCol.g * bA;
            colArr[i * 3 + 2] = baseCol.b * bA;
          } else {
            // drift through the palette, phase-offset per packet
            const ph = (t * 0.1 + i / SIGNAL_PACKETS) % 1;
            const j = Math.floor(ph * CYCLE.length);
            _sc.copy(CYCLE[j]).lerp(CYCLE[(j + 1) % CYCLE.length], ph * CYCLE.length - j);
            colArr[i * 3] = _sc.r * bC;
            colArr[i * 3 + 1] = _sc.g * bC;
            colArr[i * 3 + 2] = _sc.b * bC;
          }
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

