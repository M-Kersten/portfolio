// Cross-layer signal threads: related projects on different layers are wired
// together like a tidy run of cable, with glowing packets and a label that
// fade in while either end is hovered/selected. Edit RELATIONS to change
// which projects are linked and what the thread is called.
import { useMemo, useRef, type CSSProperties } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Line as DreiLine } from '@react-three/drei';
import { AdditiveBlending, BufferAttribute, CatmullRomCurve3, Color, Vector3, type Points as ThreePoints } from 'three';

import { useReducedMotion } from '../../lib/useReducedMotion';
import { HOTSPOTS, anchorWorld, layerGap, type Hotspot } from '../framing';
import { useActive } from './shared';
import { useSceneSelector } from '../store';

// journeyStep per layer (same mapping the layer culling uses in ./index.tsx):
// a layer more than one step from the centred one is hidden, so a thread into it
// would route to an empty spot — we hide the whole thread in that case.
const LAYER_STEP: Record<string, number> = { city: 0, room: 1, chip: 2 };

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
const _pc = new Color(); // scratch for the packets' colour each frame
const DRAW_DUR = 1.1; // seconds for the "connection made" sweep to travel the wire
const DRAW_DELAY = 0.45; // beat to wait after focus returns to the overview before it draws

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
  const { hovered: hovA, selected: selA, visited: visA } = useActive(from);
  const { hovered: hovB, selected: selB, visited: visB } = useActive(to);

  // Only show the thread while BOTH endpoints are on visible (un-culled) layers;
  // otherwise it would trail off to where a hidden layer's node used to be.
  const journeyStep = useSceneSelector((s) => s.journeyStep);
  // Whether ANY node is open (the user is in a close-up) — the connect-sweep waits
  // for this to clear (back on the overview) before it plays.
  const anySelected = useSceneSelector((s) => s.selectedSlug) !== null;
  const bothVisible =
    Math.abs(LAYER_STEP[HOTSPOT_BY_SLUG[from].layer] - journeyStep) <= 1 &&
    Math.abs(LAYER_STEP[HOTSPOT_BY_SLUG[to].layer] - journeyStep) <= 1;

  // The cable route + a curve along it for sampling the flowing packets. The
  // label sits beside the vertical riser, the most "between-layers" point.
  // Recomputed when the layer spacing changes (see layerGap) so the ends stay
  // pinned to their nodes on tall screens.
  const gap = layerGap(useThree((s) => s.size.width / s.size.height));
  const { curve, points, apex } = useMemo(() => {
    const pA = anchorWorld(HOTSPOT_BY_SLUG[from], gap);
    const pB = anchorWorld(HOTSPOT_BY_SLUG[to], gap);
    const { points: route, riser } = pipeRoute(pA, pB, from + to);
    const c = new CatmullRomCurve3(route, false, 'catmullrom', 0);
    return { curve: c, points: route, apex: riser.add(new Vector3(0, 0.1, 0)) };
  }, [from, to, gap]);

  const lineRef = useRef<any>(null);
  const pointsRef = useRef<ThreePoints>(null);
  const posAttr = useRef<BufferAttribute>(null);
  const colAttr = useRef<BufferAttribute>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const posArr = useMemo(() => new Float32Array(SIGNAL_PACKETS * 3), []);
  const colArr = useMemo(() => new Float32Array(SIGNAL_PACKETS * 3), []);
  const baseCol = useMemo(() => new Color(color), [color]);
  const k = useRef(0); // eased activation: 0 dormant-grey, 0.6 hover, 1 selected, ~0.9 while drawing
  const u = useRef(0); // packet flow phase
  // Discovery hook: the FIRST time either endpoint is woken, a one-shot sweep is
  // armed that draws from the just-woken node toward its partner — tempting the
  // eye toward the still-unexplored project. Deferred until focus is back on the
  // overview so the whole span is actually in view.
  const wasFirst = useRef(false); // was either endpoint awake last frame
  const pending = useRef(false); // a link waiting to play its one-shot sweep
  const drawDir = useRef(1); // +1 = from→to · −1 = to→from (leads with the just-woken end)
  const armT = useRef(0); // delay counter once conditions to draw are met
  const drawT = useRef(-1); // <0 idle; else 0..1 sweep progress

  useFrame((_s, delta) => {
    const dt = Math.min(delta, 1 / 30);

    // Rising edge of the first wake: ARM the sweep (don't play it yet — the camera
    // has just dived onto the node and its HUD owns the eye). Lead from whichever
    // end just lit, out toward the other so the eye is drawn onward.
    const firstAwake = visA || visB;
    if (firstAwake && !wasFirst.current) {
      pending.current = true;
      drawDir.current = visA ? 1 : -1;
      armT.current = 0;
    }
    wasFirst.current = firstAwake;

    // Play it once the user is back on the overview and the whole span is on
    // visible layers — after a short beat so the camera has finished pulling back.
    if (pending.current && drawT.current < 0 && !reduced && !anySelected && bothVisible) {
      armT.current += dt;
      if (armT.current > DRAW_DELAY) drawT.current = 0;
    }
    if (drawT.current >= 0) {
      drawT.current += dt / DRAW_DUR;
      if (drawT.current >= 1) {
        drawT.current = -1;
        pending.current = false; // one-shot
      }
    }
    const drawing = drawT.current >= 0;

    // The cable rests DORMANT GREY (neutral, unlit) so the woken web never competes
    // with reading the scene; it lights in its thread colour only on hover/select,
    // or briefly as the connect-sweep draws it — then eases back to grey.
    const target = selA || selB ? 1 : hovA || hovB ? 0.6 : drawing ? 0.9 : 0;
    k.current += (target - k.current) * 0.12;
    const kk = k.current;

    // The HUE is held back while a node is open: in a close-up the cable runs
    // right across the frame, and in full thread colour it competes with the
    // thing you opened. It keeps the opacity/weight lift, so the link to what
    // you're reading is still legible — it just stays grey. Colour is for the
    // overview, where the web is the thing you're looking at.
    const hueK = anySelected ? 0 : kk;

    // The cable is always present (dim, neutral) and lights up in its thread
    // colour, brighter and a touch heavier, as the link is highlighted.
    const m = lineRef.current?.material;
    if (m) {
      const op = 0.2 + kk * 0.42;
      const lw = 1.8 + kk * 1.4;
      m.opacity = op;
      m.linewidth = lw;
      if (m.color) m.color.copy(PIPE_REST).lerp(baseCol, hueK);
      if (m.uniforms) {
        if (m.uniforms.opacity) m.uniforms.opacity.value = op;
        if (m.uniforms.linewidth) m.uniforms.linewidth.value = lw;
        if (m.uniforms.diffuse && m.color) m.uniforms.diffuse.value.copy(m.color);
      }
    }

    // Data only flows while the cable is lit (hover/select); during the sweep the
    // packets bunch into a bright comet trailing the head as it travels from the
    // just-woken node toward its partner. Both the sweep and the steady flow run
    // ONE fixed direction (drawDir) — set the moment the first endpoint is
    // selected — so the flow never reverses on itself.
    if (!reduced) u.current = (u.current + delta * 0.16) % 1;
    const pen = pointsRef.current;
    if (pen) {
      const flowing = kk > 0.04;
      pen.visible = flowing && bothVisible;
      if (flowing) {
        const head = drawDir.current > 0 ? drawT.current : 1 - drawT.current;
        for (let i = 0; i < SIGNAL_PACKETS; i++) {
          let f: number;
          let b: number;
          if (drawing) {
            f = Math.min(1, Math.max(0, head - drawDir.current * i * 0.06)); // comet tail behind the head
            b = (1 - i / SIGNAL_PACKETS) * 1.1;
          } else {
            // steady flow in the fixed direction (drawDir); reversing 1−phase
            // when it points to→from keeps it running the same way as the sweep
            const phase = (u.current + i / SIGNAL_PACKETS) % 1;
            f = drawDir.current > 0 ? phase : 1 - phase;
            b = kk * (0.5 + 0.5 * Math.sin(phase * Math.PI)); // fade in/out at the ends
          }
          curve.getPointAt(f, _sv);
          posArr[i * 3] = _sv.x;
          posArr[i * 3 + 1] = _sv.y;
          posArr[i * 3 + 2] = _sv.z;
          // packets follow the cable's hue, so they grey out with it in a close-up
          // rather than leaving coloured sparks running along a grey wire
          _pc.copy(PIPE_REST).lerp(baseCol, hueK);
          colArr[i * 3] = _pc.r * b;
          colArr[i * 3 + 1] = _pc.g * b;
          colArr[i * 3 + 2] = _pc.b * b;
        }
        if (posAttr.current) posAttr.current.needsUpdate = true;
        if (colAttr.current) colAttr.current.needsUpdate = true;
      }
    }

    // Label on-demand only (hover/select or during the sweep) so a fully woken web
    // doesn't clutter with every thread's name at rest.
    if (labelRef.current) {
      const showLabel = bothVisible && (selA || selB || hovA || hovB || drawing);
      labelRef.current.style.opacity = String(showLabel ? Math.min(1, kk * 1.25) : 0);
    }
  });

  return (
    <group visible={bothVisible}>
      <DreiLine ref={lineRef} points={points} color={PIPE_REST.getStyle()} lineWidth={1.5} transparent opacity={0.22} depthWrite={false} toneMapped={false} fog={false} />
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

