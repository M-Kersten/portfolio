// Cross-layer signal threads: related projects on different layers are wired
// together like a tidy run of cable, with a label that fades in while either
// end is open (its close-up). Edit RELATIONS to change which projects are linked
// and what the thread is called.
//
// Packets only ever travel once: the "connect-made" sweep that plays after a
// node is opened for the first time, once its HUD has closed and the camera
// has settled back on the overview with the whole cable in view. Not for a node
// that was already seen when the page loaded, and not later on, while scrolling,
// for one whose cable wasn't in view when it closed. Resting on a hotspot for a
// moment lights the cable itself (its colour/opacity/width below), but sweeping
// the pointer across the markers doesn't, and nothing runs along it — that used
// to double as a steady flow, which put a moving light on screen the instant you
// so much as hovered a node, competing with the thing you were actually looking
// at.
import { useMemo, useRef, type CSSProperties } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Line as DreiLine } from '@react-three/drei';
import { AdditiveBlending, BufferAttribute, CatmullRomCurve3, Color, Vector3, type Points as ThreePoints } from 'three';

import { useReducedMotion } from '../../lib/media';
import { HOTSPOTS, LAYER_SCALE, LAYER_Y, MAQUETTE_LAYERS, MARKER_Y, layerGap, type Hotspot, type LayerId } from '../framing';
import { anchorWorld } from '../views';
import { PALETTE, useActive } from './shared';
import { useSceneSelector } from '../store';

// journeyStep per layer (same mapping the layer culling uses in ./index.tsx):
// a layer more than one step from the centred one is hidden, so a thread into it
// would route to an empty spot — we hide the whole thread in that case.
const LAYER_STEP: Record<string, number> = { city: 0, room: 1, chip: 2 };

/** How high a thread's name hangs: in the open gap between two floors — the
 *  gap it climbs out of at its lower end — halfway from the lower floor's
 *  marker line to the floor above. Never on a floor, where it landed on an
 *  exhibit (the chip-to-city thread used to name itself in the middle of the
 *  room). */
function tagHeight(a: LayerId, b: LayerId, gap: number): number {
  const lower = LAYER_STEP[a] > LAYER_STEP[b] ? a : b; // the higher step is the lower floor
  const above = MAQUETTE_LAYERS[MAQUETTE_LAYERS.indexOf(lower) + 1] ?? lower; // listed bottom → top
  const top = LAYER_Y[lower] * gap + MARKER_Y[lower] * LAYER_SCALE[lower];
  return (top + LAYER_Y[above] * gap) / 2;
}

/* ---------- Cross-layer signal lines ----------
   Related projects on different layers are wired together like a tidy run of
   cable: orthogonal segments with rounded pipe-bends that lead out of one node,
   drop a vertical riser in the margin, and lead into the other. The cables sit
   in the scene at rest (dim, neutral — unhighlighted); opening either endpoint,
   or resting the pointer on it, lights that run up in its thread colour, and
   the first visit to an end sends data packets along it once (see the top of
   the file for when). A small label names the thread in the close-up of
   either end. They live in world space because they bridge the
   differently-scaled layer groups. */
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
//
// A thread spans two layers, so it can't take "the layer accent" — but it can
// take the accent of the layer its subject belongs to, which is what these
// already nearly were. AR is the city's cyan, simulation the room's coral, data
// the chip's lime. That drops the one hue in the whole maquette that came from
// nowhere (the XR thread's violet) without giving up the category coding.
const THREAD = { ar: PALETTE.city.accent, xr: PALETTE.room.accent, data: PALETTE.chip.accent };
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
const HOVER_DWELL = 0.35; // seconds a pointer rests on an end before its cable lights
const DROP_AFTER = 1.5; // seconds back on the overview, without the whole cable in view, before a sweep is dropped

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
  // for this to clear (back on the overview) before it plays — and whether it's
  // one of this cable's ends (walked on to another, its sweep is dropped).
  const selectedSlug = useSceneSelector((s) => s.selectedSlug);
  const anySelected = selectedSlug !== null;
  const ownOpen = selectedSlug === from || selectedSlug === to;
  const bothVisible =
    Math.abs(LAYER_STEP[HOTSPOT_BY_SLUG[from].layer] - journeyStep) <= 1 &&
    Math.abs(LAYER_STEP[HOTSPOT_BY_SLUG[to].layer] - journeyStep) <= 1;

  // The cable route + a curve along it for sampling the flowing packets. The
  // label sits on the vertical riser, in the gap between floors (tagHeight).
  // Recomputed when the layer spacing changes (see layerGap) so the ends stay
  // pinned to their nodes on tall screens.
  const gap = layerGap(useThree((s) => s.size.width / s.size.height));
  const { curve, points, apex } = useMemo(() => {
    const pA = anchorWorld(HOTSPOT_BY_SLUG[from], gap);
    const pB = anchorWorld(HOTSPOT_BY_SLUG[to], gap);
    const { points: route, riser } = pipeRoute(pA, pB, from + to);
    const c = new CatmullRomCurve3(route, false, 'catmullrom', 0);
    const tagY = tagHeight(HOTSPOT_BY_SLUG[from].layer, HOTSPOT_BY_SLUG[to].layer, gap);
    return { curve: c, points: route, apex: new Vector3(riser.x, tagY, riser.z) };
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
  // Discovery hook: the FIRST time either endpoint is woken, a one-shot sweep is
  // armed that draws from the just-woken node toward its partner — tempting the
  // eye toward the still-unexplored project. Deferred until focus is back on the
  // overview so the whole span is actually in view.
  // was either endpoint awake last frame: starts as it is on mount, so the ends
  // a returning visitor saw before don't all sweep again as the page loads
  const wasFirst = useRef(visA || visB);
  const pending = useRef(false); // a link waiting to play its one-shot sweep
  const restFrom = useRef(-1); // when the pointer came to rest on an end (performance.now), -1: it isn't on one
  const drawDir = useRef(1); // +1 = from→to · −1 = to→from (leads with the just-woken end)
  const backFrom = useRef(-1); // when the visitor was back on the overview with a sweep waiting, -1: not yet
  const drawT = useRef(-1); // <0 idle; else 0..1 sweep progress

  useFrame((_s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    // the waits below (before a sweep, before it's dropped, a pointer's rest)
    // are timed from when they began, on the clock: a slow frame holds the
    // motion back (dt), it doesn't stretch or shorten a wait
    const now = performance.now();

    // Rising edge of the first wake: ARM the sweep (don't play it yet — the camera
    // has just dived onto the node and its HUD owns the eye). Lead from whichever
    // end just lit, out toward the other so the eye is drawn onward.
    const firstAwake = visA || visB;
    if (firstAwake && !wasFirst.current) {
      pending.current = true;
      drawDir.current = visA ? 1 : -1;
      backFrom.current = -1;
    }
    wasFirst.current = firstAwake;

    // Play it once the user is back on the overview and the whole span is on
    // visible layers — after a short beat so the camera has finished pulling
    // back. Back on an overview that can't show the whole span (an end on a
    // floor out of view, once the page has settled on its floor), it's dropped
    // rather than kept for later: kept, it went off by itself as the visitor
    // scrolled on, long after the visit. So is one whose end the visitor walked
    // on from to another exhibit (the label's walk): coming back out after a
    // walk past five, only the last one's cables sweep, not all of theirs at
    // once.
    if (pending.current && drawT.current < 0) {
      if (anySelected) {
        backFrom.current = -1;
        if (!ownOpen) pending.current = false;
      } else if (reduced) pending.current = false;
      else {
        if (backFrom.current < 0) backFrom.current = now;
        const back = (now - backFrom.current) / 1000;
        if (bothVisible && back > DRAW_DELAY) drawT.current = 0;
        else if (!bothVisible && back > DROP_AFTER) pending.current = false;
      }
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
    // with reading the scene; it lights in its thread colour only on select, on a
    // hover that rests (HOVER_DWELL), or briefly as the connect-sweep draws it —
    // then eases back to grey.
    if (!(hovA || hovB)) restFrom.current = -1;
    else if (restFrom.current < 0) restFrom.current = now;
    const resting = restFrom.current >= 0 && now - restFrom.current > HOVER_DWELL * 1000;
    const target = selA || selB ? 1 : resting ? 0.6 : drawing ? 0.9 : 0;
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

    // Packets run ONLY during the one-shot sweep, in the fixed direction
    // (drawDir) set the moment the first endpoint woke — a comet trailing the
    // head as it travels from the just-woken node toward its partner. Hovering
    // or selecting a node lights the cable (the material block above) but
    // leaves it still; see the file header for why the old steady flow is gone.
    const pen = pointsRef.current;
    if (pen) {
      pen.visible = drawing && bothVisible;
      if (drawing) {
        const head = drawDir.current > 0 ? drawT.current : 1 - drawT.current;
        for (let i = 0; i < SIGNAL_PACKETS; i++) {
          const f = Math.min(1, Math.max(0, head - drawDir.current * i * 0.06)); // comet tail behind the head
          const b = (1 - i / SIGNAL_PACKETS) * 1.1;
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

    // The thread's name only in the close-up of one of its ends: the overview
    // has one sign along the bottom and the markers' names, and a tag naming
    // a cable on every hover (and every sweep) was one more thing to read.
    if (labelRef.current) {
      const showLabel = bothVisible && (selA || selB);
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

