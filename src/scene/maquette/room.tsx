// The ROOM layer (middle) — games, apps & the web. The desk with the monitor
// (Virtuele Brigade) and its keyboard / mouse / coffee cup, the couch with the
// phone (Popcore), the AR race table (Lightship Drive) and the bookcase with the
// openable Zwijsen book, plus lamp and plant props. RoomRig composes and places
// everything.
import { useEffect, useMemo, useRef, type ElementRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, DoubleSide, Euler, FrontSide, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, Ray, RepeatWrapping, RingGeometry, SRGBColorSpace, TorusGeometry, Vector2, Vector3, Vector4, type Group, type Mesh, type Side, type Sprite, type SpriteMaterial, type Texture } from 'three';
import { usePlacement } from '../../dev/tuning';
import { isTouch, useReducedMotion } from '../../lib/media';
import { play } from '../../lib/sound';
import { spring } from '../../lib/spring';
import { bump, easeIn, easeInOut, easeOut, easeOutBack, ring } from '../../lib/ease';
import { cursorAtDepth, cursorIdle, cursorNdc, cursorRay, useCloseUp } from './closeup';
import { drawSpread, hideUv, mouseIcon, SPREADS, SPREAD_H, SPREAD_W } from './bookPages';
import { POSTS, ROUND_LEN, Scenario, newSessionLink, type SessionLink } from './scenario';
import { GOLD, PALETTE, SURFACE, SURFACE_GLOW, NEUTRAL, useAccent, type Tint, circlePts, roundedRectPts, roundedPlaneGeometry, Line, useActive, useOptionalTexture, FX, type V3 } from './shared';
import { GHOST_FILL, LifeGroup } from './life';
import { Crease, GlassMat, GroundMat, LiveEdges, LiveGlassMat, glassRim, glowTexture } from './materials';
import { useBooksKit, useCarKit, useHeadsetKit, useMonitorKit, usePhoneKit, useTableKit, type BooksKit } from './kit';
import { BlobShadow } from './backdrop';
import { litMat, ShadowPrint, useLitBody, useLitLink, type LitLink } from './lit';
import { hang, lathe, leaf, merge, place, softBox, softSeam, tube, useGeometry, type Soft } from './shapes';

const PHONE_BALLS = 6;
const COUCH_SEAT_Y = 0.2; // top of the couch cushion, in couch-local space
// the handset's size (build_phone.py: W, H, T); the screen is drawn here, off W and H
const PHONE_W = 0.075;
const PHONE_H = 0.155;
const PHONE_T = 0.0075;
/* The balls, once out, lie about the cushions. In the close-up, hover over one
   and it sinks into the cushion, gathering itself, and shoots for the bin beside
   the couch: up over the arm and down through the rim, or off it. A miss lies
   on the floor a moment, then hops back onto the seat (hover it to send it at
   once). Six in and the bin is full: it rocks, falls over and spills them, gets
   back up, and they hop back for another round. A tiny game, Popcore's trade.
   All of it in the couch's frame. */
const BALL_R = 0.015;
const BALL_G = 2.6; // gravity on the balls, at the maquette's slower pace (m/s²)
// where a ball's centre rolls on the seat: forward of the back cushions (see
// backAt: at the seat's height their face is at −0.034), short of the front edge
const SEAT = { x: [-0.33, 0.33], z: [-0.03, 0.2] };
// The seat cushions, as Couch builds them (COUCH_SEAT): each one's middle
// across and back, its half-width and half-depth, its flat top, how far that's
// crowned in the middle, and how round its edges are. A ball rests on the
// crown, and dips into the seam where the two meet.
const CUSHION = { cx: 0.1885, cz: 0.02, hw: 0.1845, hd: 0.2, top: COUCH_SEAT_Y - 0.003, crown: 0.007, round: 0.026 };
/** A ball's centre resting on the seat at (x, z). */
function seatAt(x: number, z: number) {
  const ax = Math.abs(x);
  const u = (ax - CUSHION.cx) / CUSHION.hw;
  const s = (z - CUSHION.cz) / CUSHION.hd;
  let y = CUSHION.top + CUSHION.crown * Math.max(0, 1 - u * u) * Math.max(0, 1 - s * s) + BALL_R;
  // the seam: each cushion's inside edge rounded down to it
  const e = ax - (CUSHION.cx - CUSHION.hw + CUSHION.round);
  if (e < 0) y = Math.min(y, CUSHION.top - CUSHION.round + Math.sqrt(Math.max(0, (CUSHION.round + BALL_R) ** 2 - e * e)));
  return y;
}
// the right-hand arm, the bin's side: from its inside to its outside, its top,
// how round its top edges are, and how far its top's crowned in the middle
const ARM = { x: [0.375, 0.46], top: 0.262, round: 0.03, crown: 0.006 };
/* The back cushions, as Couch builds them (COUCH_BACK, reclined 0.19 rad): in
   the couch's side view, the foot of their flat front face, how far it leans
   back for each unit up, how high it runs, how far its middle bulges, the
   round of their bottom front edge (its centre and radius), and their top. */
const BACK = { y0: 0.2431, z0: -0.047, lean: 0.195, y1: 0.361, bulge: 0.013, foot: [0.2356, -0.0862] as const, round: 0.04, top: 0.405, x: 0.375 };
// …and behind the arms, the couch's frame: its front face, its top, how wide it runs
const FRAME_BACK = { z: -0.15, top: 0.33, x: 0.46 };
/** How far forward a ball's centre has to stay of the back cushions at
 *  height y: their front face leaning back, bulging a little in the middle,
 *  and the round of their foot, all grown by a ball's radius. */
function backAt(y: number) {
  if (y >= BACK.y0) {
    const v = Math.min(1, (y - (BACK.y0 + BACK.y1) / 2) / ((BACK.y1 - BACK.y0) / 2));
    return BACK.z0 - BACK.lean * (y - BACK.y0) + BACK.bulge * Math.max(0, 1 - v * v) + BALL_R * 1.02;
  }
  const dy = y - BACK.foot[0];
  const r = BACK.round + BALL_R;
  return Math.abs(dy) < r ? BACK.foot[1] + Math.sqrt(r * r - dy * dy) : -Infinity;
}
const COUCH_Z = [-0.22, 0.22]; // the couch's depth
const FLOOR_Y = 0.022; // the rug's top, which the bin stands on
const FLOOR = { x: [-0.2, 0.95], z: [-0.3, 0.5] }; // as far as a ball on the floor rolls
// the bin: where it stands, its cup (radius at the base and at the rim, height,
// the floor inside it), and which way it falls over (a turn about y: the front)
const BIN = { x: 0.6, z: 0.1, r0: 0.032, r1: 0.044, h: 0.085, floor: 0.004, yaw: -Math.PI / 2 };
const RIM = { y: FLOOR_Y + BIN.h, r: BIN.r1 - 0.002 }; // the circle a ball has to drop through
// full, it rocks (wait), falls over (fall) onto its rim (angle), spilling the
// balls once it's past `spill`, lies there (lie) and gets back up (up); seconds
const BIN_TIP = { wait: 0.7, fall: 0.55, angle: Math.PI / 2 + Math.atan((BIN.r1 - BIN.r0) / BIN.h), spill: 0.95, lie: 1.8, up: 0.8 };
/* Knocking it over is the round's payoff, so it lands with weight: the game
   holds still for a beat as it hits (HIT_STOP: s, and how slow), a ring runs
   out across the floor from its mouth, the phone's screen flashes, and
   confetti bursts out in the room's colours and flutters down (CONFETTI). Full,
   before it goes, its rim lights up and the rocking builds. */
const HIT_STOP = { len: 0.14, slow: 0.25 };
const CONFETTI = { n: 40, size: [0.011, 0.006] as const, speed: [0.35, 0.75] as const, g: 1.7, drag: 1.8, life: 2.2 };
// where the balls sit in it, in its own frame: pairs, each across the groove
// of the one below, so six fill it to just under the rim
const BIN_SLOTS = Array.from({ length: PHONE_BALLS }, (_, i) => {
  const layer = Math.floor(i / 2);
  const a = (i % 2) * Math.PI + layer * (Math.PI / 2) + 0.3;
  return new Vector3(Math.cos(a) * BALL_R, BIN.floor + BALL_R + layer * BALL_R * Math.SQRT2, Math.sin(a) * BALL_R);
});
const SHOT_ERR = [0.04, 0.024]; // how far off a throw can drop (a disc's radius): a base, and per unit of distance
const SHOT_REACH = 1.8; // how near the cursor's ray has to pass a ball, in ball radii
const SHOT_REST = 0.25; // s a ball lies still before it can go again
const SHOT_CHARGE = 0.09; // s it sinks into the cushion, gathering itself, before it goes
const FLOOR_BACK = 2.5; // s a ball lies off the seat (the floor, an arm) before it hops back onto it
const DRAG = { seat: 2.2, floor: 3.2 }; // the cushion's friction, and the rug's (1/s)
interface Ball { mesh: Group | null; body: Mesh | null; vel: Vector3; delay: number; rest: number; charge: number; landAt: number; impact: number; slot: number; backAt: number; rattle: boolean }
interface Bit { pos: Vector3; vel: Vector3; spin: Vector3; rot: Euler; at: number; down: boolean }
type BinPhase = 'up' | 'full' | 'tip' | 'lying' | 'righting';

/** What's under a ball's centre at (x, z): the seat, an arm, or the floor. */
function surfaceAt(x: number, z: number): 'seat' | 'arm' | 'floor' {
  if (z < COUCH_Z[0] - BALL_R || z > COUCH_Z[1] + BALL_R) return 'floor';
  const ax = Math.abs(x);
  if (ax < ARM.x[0] - BALL_R) return 'seat';
  return ax < ARM.x[1] + BALL_R ? 'arm' : 'floor';
}
/** How high a ball's centre sits over (x, z): on the seat (its cushions'
 *  crown and their seam, seatAt), on the floor, or on an arm, whose top edges
 *  are rounded and its top crowned, the way the couch's are. Where it rises
 *  more than a little above a ball, it's a wall to it. */
function restAt(x: number, z: number) {
  const floor = FLOOR_Y + BALL_R;
  if (z < COUCH_Z[0] - BALL_R || z > COUCH_Z[1] + BALL_R) return floor;
  const ax = Math.abs(x);
  const under = ax < ARM.x[0] ? seatAt(x, z) : floor;
  if (ax <= ARM.x[0] - BALL_R || ax >= ARM.x[1] + BALL_R) return under;
  // the arm grown by a ball's radius: crowned on top, a quarter round at each edge
  const mid = (ARM.x[0] + ARM.x[1]) / 2;
  const u = (ax - mid) / ((ARM.x[1] - ARM.x[0]) / 2);
  const w = z / COUCH_Z[1];
  const top = ARM.top + ARM.crown * Math.max(0, 1 - u * u) * Math.max(0, 1 - w * w);
  const dx = ax - Math.max(ARM.x[0] + ARM.round, Math.min(ARM.x[1] - ARM.round, ax));
  const r = ARM.round + BALL_R;
  return Math.max(under, top - ARM.round + Math.sqrt(Math.max(0, r * r - dx * dx)));
}

/** Sends a ball from `p` to `to` on an arc: taking `t0` seconds, or longer
 *  (so higher) where it has to clear something on the way, the arm above all.
 *  At f of the way the arc stands ½g·T²·f(1−f) over the straight line. */
function throwTo(b: Ball, p: Vector3, to: Vector3, t0: number) {
  let T = t0;
  const mid = (ARM.x[0] + ARM.x[1]) / 2;
  const fa = (Math.sign(to.x || 1) * mid - p.x) / (to.x - p.x); // where it passes over the arm's middle
  for (let j = 0; j <= 24; j++) {
    const f = j === 24 ? fa : (j + 0.5) / 24;
    if (!(f > 0 && f < 1)) continue;
    const need = restAt(p.x + f * (to.x - p.x), p.z + f * (to.z - p.z)) + 0.008 - (p.y + f * (to.y - p.y));
    if (need > 0) T = Math.max(T, Math.sqrt(need / (0.5 * BALL_G * f * (1 - f))));
  }
  b.vel.set((to.x - p.x) / T, (to.y - p.y) / T + 0.5 * BALL_G * T, (to.z - p.z) / T);
}

/** A point in the bin's own frame (its base's centre at the origin, upright)
 *  in the couch's, with the bin tipped `angle` over the edge it falls across. */
function binPoint(q: Vector3, angle: number, out: Vector3) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = (q.x - BIN.r0) * c + q.y * s + BIN.r0;
  const y = -(q.x - BIN.r0) * s + q.y * c;
  const cy = Math.cos(BIN.yaw);
  const sy = Math.sin(BIN.yaw);
  return out.set(BIN.x + x * cy + q.z * sy, FLOOR_Y + y, BIN.z - x * sy + q.z * cy);
}
// shared scratch for the instanced rings, flat on the surface they spread over
const _m4 = new Matrix4();
const _q4 = new Quaternion();
const _v3 = new Vector3();
const _c3 = new Color();
const FLAT = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
const RINGS = 12;
// …and for the balls
const UP = new Vector3(0, 1, 0);
const ORIGIN = new Vector3();
const _at = new Vector3();
const _to = new Vector3();
const _dir = new Vector3();
/** The phone on the couch (Popcore), a Blender model (build_phone.py). It lies
 *  face down, the way a phone is left on a cushion, so what you see from across
 *  the room is its back, and the camera island on it is what says "phone". It
 *  buzzes on hover, and the screen it's lying on lights the cushion round its
 *  edges. On *select* it lifts off the cushion and turns over to face you, and
 *  the first time you open it a handful of ping-pong balls pop out and settle on
 *  the seat. The screen shows a screenshot once you've visited it — drop a JPG at
 *  public/textures/room-phone.jpg; until then it stays a plain glowing screen. */
function Phone({ slug, position, liveColor }: { slug: string; position: V3; liveColor: string }) {
  const { accent, accentPale, accentDeep } = useAccent();
  const { hovered, selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const close = useCloseUp(slug);
  const frame = useRef<Group>(null); // the couch's frame, to find the cursor in
  const ray = useMemo(() => new Ray(), []);
  const kit = usePhoneKit();
  const rigRef = useRef<Group>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const spill = useRef<MeshBasicMaterial>(null);
  // lit on hover (lit.tsx): the handset, not its screen
  const lit = useLitLink(slug);
  const body = useLitBody(rigRef);
  const k = useRef(0); // emissive hover/select level
  const glow = useRef(0); // 0 → 1 shift toward the lifelike colour
  const turn = useRef(0); // 0 = lying face down, 1 = lifted + facing the user
  const buzz = useRef(0); // hover buzz envelope
  const base = useMemo(() => new Color(accent), [accent]);
  const lifelike = useMemo(() => new Color(liveColor), [liveColor]);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;

  // Ping-pong balls — each carries its own little bit of physics, fired once on
  // the first open. Held as plain objects (mutated in useFrame, not React state).
  // `slot` is its place in the bin (−1: out), `backAt` when one lying off the
  // seat hops back onto it, `rattle` that it's coming down again off the rim.
  const balls = useMemo<Ball[]>(
    () => Array.from({ length: PHONE_BALLS }, () => ({ mesh: null, body: null, vel: new Vector3(), delay: 0, rest: 0, charge: -1, landAt: -99, impact: 0, slot: -1, backAt: -1, rattle: false })),
    [],
  );
  const R = BALL_R;
  const fired = useRef(false);
  // the phone lying face down on the seat, which a ball can't roll through: its
  // middle, its half-width and half-length, and its turn (the rig's rest pose)
  const PHONE_LIE = { x: position[0], z: position[2], hw: PHONE_W / 2, hl: PHONE_H / 2, turn: 0.3 };
  // the round's payoff (see HIT_STOP, CONFETTI): when the game slows for the
  // bin's landing, the phone's screen flash, the confetti and the rim's light
  const hitStop = useRef(-99);
  const cheerAt = useRef(-99);
  const bits = useMemo<Bit[]>(() => Array.from({ length: CONFETTI.n }, () => ({ pos: new Vector3(), vel: new Vector3(), spin: new Vector3(), rot: new Euler(), at: -99, down: false })), []);
  const bitsIM = useRef<InstancedMesh>(null);
  const rimGlow = useRef<MeshBasicMaterial>(null);
  // the game's own clock: frame time, so a slow frame slows the game down
  // rather than jumping it (a throw through the rim between two frames)
  const clock = useRef(0);
  // the bin: how many are in, what it's doing and since when, how far it's
  // tipped, and when a ball last dropped in or hit the rim
  const bin = useRef({ n: 0, phase: 'up' as BinPhase, at: -99, angle: 0, inAt: -99, rimAt: -99 });
  const binPivot = useRef<Group>(null);
  const binBody = useRef<Group>(null);
  // a tapered cup with its wall's top rolled into a rim (the welt's pale)
  const binGeo = useGeometry(() => ({
    cup: lathe([[0, 0], [BIN.r0, 0], [BIN.r1 - 0.0005, BIN.h - 0.004], [BIN.r1 - 0.0035, BIN.h - 0.002], [BIN.r0 - 0.003, BIN.floor], [0, BIN.floor]], 40),
    rim: new TorusGeometry(RIM.r, 0.0024, 6, 48).rotateX(-Math.PI / 2).translate(0, BIN.h - 0.0015, 0),
    glow: new TorusGeometry(RIM.r, 0.0045, 6, 48).rotateX(-Math.PI / 2).translate(0, BIN.h - 0.0015, 0),
  }));
  // a ring on the cushion where a ball takes off, and round the rim as one drops in
  const ringsIM = useRef<InstancedMesh>(null);
  const rings = useMemo(() => Array.from({ length: RINGS }, () => ({ pos: new Vector3(), at: -99, r0: 0, r1: 0, life: 0.4, k: 0.9 })), []);
  const ringN = useRef(0);
  const flash = (x: number, y: number, z: number, r0: number, r1: number, now: number, life = 0.4, k = 0.9) => {
    const r = rings[ringN.current++ % RINGS];
    r.pos.set(x, y, z);
    r.at = now;
    r.r0 = r0;
    r.r1 = r1;
    r.life = life;
    r.k = k;
  };
  // A ball's shape: squashed into the cushion as it gathers, stretched along
  // its flight, squashed as it lands and springing back round, its bottom kept
  // on whatever it's sitting on while it's squashed.
  const shape = (b: Ball, sitting: boolean, now: number) => {
    const m = b.body;
    if (!m) return;
    let sy = 1;
    m.quaternion.identity();
    if (b.charge >= 0) sy = 1 - 0.38 * easeOut((now - b.charge) / SHOT_CHARGE);
    else if (!sitting) {
      const sp = b.vel.length();
      if (sp > 1e-3) m.quaternion.setFromUnitVectors(UP, _dir.copy(b.vel).divideScalar(sp));
      sy = 1 + Math.min(0.25, sp * 0.16);
    } else sy = 1 - 0.3 * b.impact * ring(now - b.landAt, 5, 10);
    const sxz = 1 / Math.sqrt(Math.max(0.4, sy));
    m.scale.set(sxz, sy, sxz);
    m.position.y = sitting ? -(1 - sy) * R : 0;
  };
  const ringGeo = useGeometry(() => new RingGeometry(0.72, 1, 32));
  const bitGeo = useGeometry(() => new PlaneGeometry(1, 1));
  const bitMat = useMemo(() => {
    const m = new MeshBasicMaterial({ color: '#ffffff', side: DoubleSide, toneMapped: false });
    m.userData.lifeSkip = true;
    return m;
  }, []);
  useEffect(() => () => bitMat.dispose(), [bitMat]);
  // the confetti's colours: the room's accent at its values, and the drawing's white
  const bitCols = useMemo(() => [accent, accentPale, accentDeep, NEUTRAL, '#ffffff'].map((c) => new Color(c)), [accent, accentPale, accentDeep]);
  const ringMat = useMemo(() => {
    const m = new MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    m.userData.lifeSkip = true;
    return m;
  }, []);
  useEffect(() => () => ringMat.dispose(), [ringMat]);
  const shown = useRef(false); // whether the screenshot is currently mapped on
  const tex = useOptionalTexture('/textures/room-phone.jpg');
  const spillTex = useMemo(glowTexture, []);

  // The screen: glass close to the edge the way a current phone's is, its
  // corners following the body's own curve rather than cutting across it.
  const screenGeo = useGeometry(() => roundedPlaneGeometry(PHONE_W * 0.93, PHONE_H * 0.955, PHONE_W * 0.19));

  useFrame((s, delta) => {
    const t = s.clock.elapsedTime;
    // the game holds still for a beat as the bin lands (HIT_STOP)
    const dt = Math.min(delta, 1 / 30) * (t < hitStop.current ? HIT_STOP.slow : 1);
    const now = (clock.current += dt);
    body(lit.litU.value, selected || visited);

    // --- lift and turn over toward the user on select; buzz on hover while resting ---
    const rig = rigRef.current;
    if (rig) {
      turn.current += ((selected ? 1 : 0) - turn.current) * 0.1;
      const tt = reduced ? (selected ? 1 : 0) : turn.current;
      // the lift leads and the turn follows (its square), so the phone is clear
      // of the cushion before its end swings down through where it was lying
      const tr = tt * tt;
      buzz.current += ((hovered || selected ? 1 : 0) - buzz.current) * 0.2;
      const a = reduced ? 0 : buzz.current * (1 - tt); // buzz fades as it stands up
      // turned a little toward the camera's side once up, so the screen faces
      // the view (the close-up looks from the couch's front-left: framing.ts)
      const YAW_OFFSET = -0.15;
      rig.rotation.set(mix(Math.PI / 2, -0.15, tr), mix(0, YAW_OFFSET, tr) + Math.sin(t * 45) * 0.022 * a, mix(0.3, 0.0, tr));
      rig.position.set(position[0] + Math.sin(t * 50) * 0.005 * a, position[1] + tt * 0.14, position[2] + Math.cos(t * 58) * 0.005 * a);
      rig.scale.setScalar(mix(1, 1.35, tt));
      // the screen it's lying on, buzzing: light leaking out round its edges
      if (spill.current) spill.current.opacity = (reduced ? buzz.current : a) * (1 - tt) * (0.45 + 0.15 * Math.sin(t * 9));
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
      // the round's payoff: the screen flashes as the bin lands
      const cheer = reduced ? 0 : Math.exp(-5 * Math.max(0, now - cheerAt.current)) * (now >= cheerAt.current ? 1 : 0);
      if (wantImg) {
        m.color.set('#000000');
        m.emissive.set('#ffffff');
        m.emissiveIntensity = 0.8 + 1.4 * cheer;
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
          const x = position[0] + Math.cos(ang) * 0.07;
          const z = position[2] + Math.sin(ang) * 0.05;
          b.mesh.position.set(x, seatAt(x, z), z);
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

    // --- the rings: off the cushion where a ball takes off, round the rim as one drops in ---
    const rim = ringsIM.current;
    if (rim) {
      rings.forEach((r, j) => {
        const age = (now - r.at) / r.life;
        const on = age >= 0 && age < 1;
        _v3.setScalar(on ? r.r0 + (r.r1 - r.r0) * easeOut(age) : 0);
        rim.setMatrixAt(j, _m4.compose(r.pos, FLAT, _v3));
        rim.setColorAt(j, _c3.setScalar(on ? r.k * (1 - age) : 0));
      });
      rim.instanceMatrix.needsUpdate = true;
      if (rim.instanceColor) rim.instanceColor.needsUpdate = true;
    }

    // --- the bin: full, it rocks, falls over, lies there a moment and gets back up ---
    const B = bin.current;
    const u = now - B.at;
    if (B.phase === 'up' && B.n >= PHONE_BALLS && balls.every((b) => b.slot >= 0 && b.vel.y === 0)) {
      B.phase = 'full';
      B.at = now;
    } else if (B.phase === 'full' && u > BIN_TIP.wait) {
      B.phase = 'tip';
      B.at = now;
    } else if (B.phase === 'tip' && u > BIN_TIP.fall) {
      B.phase = 'lying';
      B.at = now;
      play('bin-tip');
      // landed: a beat's stillness, a ring across the floor from its mouth (and
      // a second, wider, after it), the screen's flash, and the confetti
      binPoint(_to.set(0, BIN.h, 0), BIN_TIP.angle, _at);
      if (!reduced) {
        hitStop.current = t + HIT_STOP.len;
        flash(_at.x, FLOOR_Y + 0.003, _at.z, 0.03, 0.2, now, 0.55, 1.1);
        flash(_at.x, FLOOR_Y + 0.003, _at.z, 0.02, 0.32, now + 0.12, 0.8, 0.7);
        cheerAt.current = now;
        play('bin-cheer');
        // out of its mouth, the way it fell, and up, spread wide
        binPoint(UP, BIN_TIP.angle, _dir).sub(binPoint(ORIGIN, BIN_TIP.angle, _to)).normalize();
        bits.forEach((c, i) => {
          const sp = CONFETTI.speed[0] + Math.random() * (CONFETTI.speed[1] - CONFETTI.speed[0]);
          const a = (Math.random() - 0.5) * 2.2;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          c.pos.copy(_at);
          c.vel.set((_dir.x * ca - _dir.z * sa) * sp, 0.55 + Math.random() * 0.6, (_dir.x * sa + _dir.z * ca) * sp);
          c.spin.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
          c.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
          c.at = now + i * 0.004;
          c.down = false;
        });
      }
    } else if (B.phase === 'lying' && u > BIN_TIP.lie) {
      B.phase = 'righting';
      B.at = now;
    } else if (B.phase === 'righting' && u > BIN_TIP.up) {
      B.phase = 'up';
      B.at = now;
      B.n = 0;
      // and the balls it spilled hop back onto the seat, one after another
      balls.forEach((b, i) => {
        if (b.slot < 0) b.backAt = now + 0.15 + i * 0.16;
      });
    }
    const v = now - B.at;
    B.angle =
      B.phase === 'full'
        ? 0.085 * easeIn(v / BIN_TIP.wait, 1.6) * (0.5 - 0.5 * Math.cos(v * (26 + 22 * v)))
        : B.phase === 'tip'
          ? BIN_TIP.angle * easeIn(v / BIN_TIP.fall, 2.4)
          : B.phase === 'lying'
            ? BIN_TIP.angle - 0.12 * Math.exp(-6 * v) * Math.abs(Math.sin(v * 15)) // a bounce off its rim
            : B.phase === 'righting'
              ? BIN_TIP.angle * (1 - easeInOut(v / BIN_TIP.up))
              : 0.06 * Math.exp(-7 * v) * Math.abs(Math.sin(v * 14)); // up: settling, once it's back
    if (binPivot.current) binPivot.current.rotation.z = -B.angle;
    if (binBody.current) {
      // it gives as one drops in, and a little when one hits the rim; and it
      // squashes as it lands on its side
      const q = 0.07 * ring(now - B.inAt, 3.5, 9) + 0.03 * ring(now - B.rimAt, 5, 12) + (B.phase === 'lying' ? 0.09 * ring(v, 4, 7) : 0);
      binBody.current.scale.set(1 + q * 0.6, 1 - q, 1 + q * 0.6);
    }
    // its rim: a flick of light for each one in; full, lit and pulsing, until it lands
    if (rimGlow.current) {
      const each = Math.max(0, 1 - (now - B.inAt) / 0.35) * 0.6;
      const full = B.phase === 'full' ? easeOut(v / 0.3) * (0.7 + 0.3 * Math.sin(v * 24)) : B.phase === 'tip' ? 1 : B.phase === 'lying' ? Math.max(0, 1 - v / 0.45) : 0;
      rimGlow.current.opacity = reduced ? 0 : Math.max(each, full);
    }
    // the confetti: out and up, then fluttering down onto the rug, and gone
    const cf = bitsIM.current;
    if (cf) {
      let any = false;
      bits.forEach((c, i) => {
        const age = now - c.at;
        const on = age >= 0 && age < CONFETTI.life;
        if (on) {
          any = true;
          if (!c.down) {
            c.vel.y -= CONFETTI.g * dt;
            const d = Math.exp(-CONFETTI.drag * dt);
            c.vel.multiplyScalar(d);
            // a scrap of paper: it flutters as it falls
            c.vel.x += Math.sin(age * 11 + i) * 0.35 * dt;
            c.vel.z += Math.cos(age * 9 + i * 1.7) * 0.35 * dt;
            c.pos.addScaledVector(c.vel, dt);
            c.rot.x += c.spin.x * dt;
            c.rot.y += c.spin.y * dt;
            c.rot.z += c.spin.z * dt;
            if (c.pos.y <= FLOOR_Y + 0.002 && c.vel.y < 0) {
              c.pos.y = FLOOR_Y + 0.002;
              c.down = true;
              c.rot.set(-Math.PI / 2, 0, c.rot.z);
            }
          }
          const fade = Math.min(1, (CONFETTI.life - age) / 0.5);
          _q4.setFromEuler(c.rot);
          _v3.set(CONFETTI.size[0] * fade, CONFETTI.size[1] * fade, 1);
          cf.setMatrixAt(i, _m4.compose(c.pos, _q4, _v3));
          cf.setColorAt(i, bitCols[i % bitCols.length]);
        } else {
          _v3.setScalar(0);
          cf.setMatrixAt(i, _m4.compose(ORIGIN, _q4.identity(), _v3));
        }
      });
      cf.visible = any;
      cf.instanceMatrix.needsUpdate = true;
      if (cf.instanceColor) cf.instanceColor.needsUpdate = true;
    }

    // --- the balls: thrown, arcing under gravity, bouncing and rolling; in the bin or not ---
    if (fired.current && !reduced) {
      // the cursor over the couch, to find the ball it passes over
      const pointing = close && !!frame.current && !!cursorRay(s, frame.current, ray);
      const open = B.phase === 'up';
      balls.forEach((b) => {
        if (!b.mesh) return;
        if (b.delay > 0) {
          b.delay -= dt;
          return;
        }
        b.mesh.visible = true;
        const p = b.mesh.position;

        // in the bin: dropping into its place, or carried along as the bin goes over
        if (b.slot >= 0) {
          binPoint(BIN_SLOTS[b.slot], B.angle, _at);
          if (B.phase === 'up') {
            const k = Math.min(1, dt * 14);
            p.x += (_at.x - p.x) * k;
            p.z += (_at.z - p.z) * k;
            if (b.vel.y !== 0 || p.y > _at.y) {
              p.y += (b.vel.y - 0.5 * BALL_G * dt) * dt;
              b.vel.y -= BALL_G * dt;
              if (p.y <= _at.y) {
                p.y = _at.y;
                b.landAt = now;
                b.impact = Math.min(1, -b.vel.y / 0.7);
                b.vel.y = b.vel.y < -0.3 ? -b.vel.y * 0.25 : 0;
              }
            }
            shape(b, p.y <= _at.y + 1e-4, now);
            return;
          }
          p.copy(_at);
          if (B.phase !== 'tip' || B.angle < BIN_TIP.spill) {
            b.vel.set(0, 0, 0);
            shape(b, true, now);
            return;
          }
          // far enough over: out of its mouth, the way it's falling, and free
          binPoint(UP, B.angle, _dir).sub(binPoint(ORIGIN, B.angle, _to));
          b.vel.copy(_dir).multiplyScalar(0.34 + 0.26 * Math.random());
          b.vel.x += (Math.random() - 0.5) * 0.2;
          b.vel.z += (Math.random() - 0.5) * 0.2;
          b.vel.y += 0.12 + 0.12 * Math.random();
          b.slot = -1;
          b.rest = 0;
        }

        const g = restAt(p.x, p.z);
        const down = p.y <= g + 1e-4 && b.vel.y === 0;
        if (down) {
          b.rest += dt;
          const onSeat = surfaceAt(p.x, p.z) === 'seat';
          if (onSeat) b.backAt = -1;
          else if (b.backAt < 0) b.backAt = now + FLOOR_BACK;
          const near = pointing && b.charge < 0 && b.rest > SHOT_REST && ray.distanceSqToPoint(p) < (R * SHOT_REACH) ** 2;
          if (onSeat) {
            // hovered: it sinks into the cushion, gathering itself, then goes for
            // the bin, aimed at its rim and off by a little more from further away
            if (near && open) b.charge = now;
            if (b.charge >= 0 && now - b.charge >= SHOT_CHARGE) {
              b.charge = -1;
              b.rest = 0;
              const d = Math.hypot(BIN.x - p.x, BIN.z - p.z);
              const e = (SHOT_ERR[0] + SHOT_ERR[1] * d) * Math.sqrt(Math.random());
              const a = Math.random() * Math.PI * 2;
              throwTo(b, p, _to.set(BIN.x + Math.cos(a) * e, RIM.y, BIN.z + Math.sin(a) * e), 0.5 + 0.35 * d);
              flash(p.x, g - R + 0.002, p.z, 0.012, 0.052, now);
            }
          } else if (near || now > b.backAt) {
            // off the seat (a miss, a spill): back up onto it, somewhere free
            b.rest = 0;
            b.backAt = -1;
            _to.x = SEAT.x[0] + 0.03 + Math.random() * (SEAT.x[1] - SEAT.x[0] - 0.06);
            _to.z = SEAT.z[0] + 0.03 + Math.random() * (SEAT.z[1] - SEAT.z[0] - 0.06);
            _to.y = seatAt(_to.x, _to.z);
            throwTo(b, p, _to, 0.6 + 0.3 * Math.hypot(_to.x - p.x, _to.z - p.z));
            flash(p.x, g - R + 0.002, p.z, 0.012, 0.04, now);
          }
        }
        // gravity in the air (stepped exactly, so a throw follows the arc it
        // was aimed on at any frame rate); on a surface, friction, and on an
        // arm's crowned top a lean toward its nearer edge, so it rolls off
        const fall = b.vel.y !== 0 || !down ? BALL_G : 0;
        if (!fall) {
          const under = surfaceAt(p.x, p.z);
          const drag = Math.exp(-dt * (under === 'seat' ? DRAG.seat : DRAG.floor));
          b.vel.x *= drag;
          b.vel.z *= drag;
          if (under === 'arm') b.vel.x += Math.sign(p.x) * Math.sign(Math.abs(p.x) - (ARM.x[0] + ARM.x[1]) / 2 || 1) * 0.8 * dt;
        }
        const x0 = p.x;
        const y0 = p.y;
        const z0 = p.z;
        const vy0 = b.vel.y;
        p.addScaledVector(b.vel, dt);
        p.y -= 0.5 * fall * dt * dt;
        b.vel.y -= fall * dt;
        // something taller in the way (the arm, the couch's side, the seat's front): off it
        if (restAt(p.x, z0) > p.y + 0.012) {
          p.x = x0;
          b.vel.x *= -0.4;
        }
        if (restAt(p.x, p.z) > p.y + 0.012) {
          p.z = z0;
          b.vel.z *= -0.4;
        }
        // the back cushions' face: off it, the way it leans; behind the arms,
        // the frame's
        const zb = Math.abs(p.x) < BACK.x ? (p.y < BACK.top + R ? backAt(p.y) : -Infinity) : Math.abs(p.x) < FRAME_BACK.x + R && p.y < FRAME_BACK.top + R ? FRAME_BACK.z + R : -Infinity;
        if (p.z < zb) {
          p.z = zb;
          if (b.vel.z < 0) b.vel.z *= -0.35;
        }
        // the phone, lying face down on the seat: round it
        if (turn.current < 0.3 && p.y < seatAt(p.x, p.z) + 0.012) {
          const c = Math.cos(PHONE_LIE.turn);
          const sn = Math.sin(PHONE_LIE.turn);
          const dx = p.x - PHONE_LIE.x;
          const dz = p.z - PHONE_LIE.z;
          const lx = dx * c + dz * sn;
          const lz = -dx * sn + dz * c;
          const ox = PHONE_LIE.hw + R - Math.abs(lx);
          const oz = PHONE_LIE.hl + R - Math.abs(lz);
          if (ox > 0 && oz > 0) {
            // out the nearer side, and the speed into it turned back; one it's
            // coming down on (the phone set back down) is eased out from under
            // it and rolls away, rather than jumping clear
            const nx = ox < oz ? Math.sign(lx) || 1 : 0;
            const nz = ox < oz ? 0 : Math.sign(lz) || 1;
            const push = Math.min(ox, oz, 0.012);
            const wx = nx * c - nz * sn;
            const wz = nx * sn + nz * c;
            p.x += wx * push;
            p.z += wz * push;
            const vn = b.vel.x * wx + b.vel.z * wz;
            if (vn < 0.25) {
              b.vel.x += (0.25 - vn) * wx;
              b.vel.z += (0.25 - vn) * wz;
            }
          }
        }
        // down onto something: a bounce or two, then it rolls. It hits at the
        // speed it had as it reached the surface (not where the step left it,
        // below it), or a slow frame would keep it hopping.
        const floor = restAt(p.x, p.z);
        if (p.y <= floor) {
          if (!down && b.vel.y <= 0) {
            const hit = Math.sqrt(vy0 * vy0 + 2 * fall * Math.max(0, y0 - floor));
            b.landAt = now;
            b.impact = Math.min(1, hit / 0.7);
            if (hit > 0.3 && surfaceAt(p.x, p.z) === 'floor') flash(p.x, FLOOR_Y + 0.002, p.z, 0.008, 0.035, now, 0.35, 0.6);
            if (hit < 0.14) b.vel.y = 0;
            else {
              b.vel.y = hit * 0.5;
              b.vel.x *= 0.72;
              b.vel.z *= 0.72;
            }
          }
          p.y = floor;
        }

        // the bin, standing: down through its rim is in, the rim itself rattles
        // it in or bounces it out, and its outside wall turns a ball away
        if (B.phase === 'up' || B.phase === 'full') {
          if (b.vel.y < 0 && y0 > RIM.y && p.y <= RIM.y) {
            const f = (y0 - RIM.y) / (y0 - p.y);
            const cx = x0 + (p.x - x0) * f;
            const cz = z0 + (p.z - z0) * f;
            const dh = Math.hypot(cx - BIN.x, cz - BIN.z);
            if (B.n < PHONE_BALLS && (dh < RIM.r - R * 0.9 || (b.rattle && dh < RIM.r + R))) {
              b.slot = B.n++;
              b.rattle = false;
              b.vel.x = 0;
              b.vel.z = 0;
              p.set(cx, RIM.y, cz);
              B.inAt = now;
              flash(BIN.x, RIM.y + 0.003, BIN.z, RIM.r, RIM.r * 1.8, now);
              play('ball-in', { rate: 0.94 + 0.06 * B.n });
            } else if (dh < RIM.r + R * 0.9) {
              const up = 0.24 + 0.12 * Math.random();
              const T = (2 * up) / BALL_G;
              p.set(cx, RIM.y + 0.002, cz);
              if (dh < RIM.r) {
                // on the rim's inside: up, and down again into the middle
                b.vel.set(((BIN.x - cx) / T) * 0.9, up, ((BIN.z - cz) / T) * 0.9);
                b.rattle = true;
              } else {
                // on its outside: off and away
                const out = 0.2 + 0.15 * Math.random();
                b.vel.set(((cx - BIN.x) / dh) * out + b.vel.x * 0.15, up, ((cz - BIN.z) / dh) * out + b.vel.z * 0.15);
              }
              B.rimAt = now;
              play('ball-rim', { rate: 0.9 + 0.2 * Math.random() });
            }
          }
          if (b.slot < 0 && p.y < RIM.y) {
            const dx = p.x - BIN.x;
            const dz = p.z - BIN.z;
            const dh = Math.hypot(dx, dz);
            const wall = BIN.r0 + (BIN.r1 - BIN.r0) * Math.min(1, Math.max(0, (p.y - FLOOR_Y) / BIN.h)) + R;
            if (dh < wall && dh > 1e-6) {
              p.x = BIN.x + (dx / dh) * wall;
              p.z = BIN.z + (dz / dh) * wall;
              const vr = (b.vel.x * dx + b.vel.z * dz) / dh;
              if (vr < 0) {
                b.vel.x -= (1.4 * vr * dx) / dh;
                b.vel.z -= (1.4 * vr * dz) / dh;
              }
            }
          }
        }

        // the seat's edges hold a ball rolling (or coming down) on it; the
        // floor's keep one near the bin
        const on = restAt(p.x, p.z);
        if (b.slot < 0 && p.y <= on + 0.02 && b.vel.y <= 0) {
          const under = surfaceAt(p.x, p.z);
          const box = under === 'seat' ? SEAT : under === 'floor' ? FLOOR : null;
          if (box) {
            for (const [ax, [lo, hi]] of [['x', box.x], ['z', box.z]] as const) {
              if (p[ax] < lo || p[ax] > hi) {
                p[ax] = Math.min(hi, Math.max(lo, p[ax]));
                b.vel[ax] *= -0.5;
              }
            }
          }
        }
        shape(b, b.slot < 0 && p.y <= on + 1e-4, now);
      });
      // and each other: apart along the line between them, trading that speed
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i].mesh;
        if (!a?.visible || balls[i].slot >= 0) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const c = balls[j].mesh;
          if (!c?.visible || balls[j].slot >= 0) continue;
          const dx = c.position.x - a.position.x;
          const dz = c.position.z - a.position.z;
          const d = Math.hypot(dx, dz);
          if (d >= 2 * R || d < 1e-6 || Math.abs(c.position.y - a.position.y) > R) continue;
          const nx = dx / d;
          const nz = dz / d;
          const over = (2 * R - d) / 2;
          a.position.x -= nx * over;
          a.position.z -= nz * over;
          c.position.x += nx * over;
          c.position.z += nz * over;
          const va = balls[i].vel.x * nx + balls[i].vel.z * nz;
          const vc = balls[j].vel.x * nx + balls[j].vel.z * nz;
          if (va - vc > 0) {
            const swap = (va - vc) * 0.9;
            balls[i].vel.x -= nx * swap;
            balls[i].vel.z -= nz * swap;
            balls[j].vel.x += nx * swap;
            balls[j].vel.z += nz * swap;
          }
        }
      }
    }
  });

  return (
    <group ref={frame}>
      {/* the light the face-down screen leaks onto the cushion when it buzzes,
          lying under the phone at its resting turn */}
      <group position={[position[0], COUCH_SEAT_Y + 0.004, position[2]]} rotation={[0, -0.3, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <planeGeometry args={[PHONE_W * 2, PHONE_H * 1.5]} />
          <meshBasicMaterial ref={spill} userData={{ lifeSkip: true }} map={spillTex} color={accent} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      <group ref={rigRef} position={position} rotation={[Math.PI / 2, 0, 0.3]}>
        {kit && (
          <>
            {/* the body, in the project's colour; the life system greys it until opened */}
            <mesh geometry={kit.ph_body}>
              <meshStandardMaterial {...litMat(lit)} color={accent} emissive={accent} emissiveIntensity={0.28} roughness={0.4} toneMapped={false} />
            </mesh>
            {/* The keys and the camera island hold their own look, ghost or not
                (`lifeSkip`): face down, the island is the one detail that says
                what this is, so it can't fade with the rest. */}
            <mesh geometry={kit.ph_keys}>
              <meshStandardMaterial {...litMat(lit, { lifeSkip: true })} color={accent} emissive={accent} emissiveIntensity={0.16} roughness={0.3} metalness={0.25} toneMapped={false} />
            </mesh>
            <mesh geometry={kit.ph_island}>
              <meshStandardMaterial {...litMat(lit, { lifeSkip: true })} color={SURFACE.deep.color} roughness={0.3} metalness={0.3} toneMapped={false} />
            </mesh>
            <mesh geometry={kit.ph_lens}>
              <meshStandardMaterial {...litMat(lit, { lifeSkip: true })} color={SURFACE.pale.color} roughness={0.25} metalness={0.6} toneMapped={false} />
            </mesh>
            <mesh geometry={kit.ph_glass}>
              <meshStandardMaterial {...litMat(lit, { lifeSkip: true })} color="#05070c" emissive={accent} emissiveIntensity={0.08} roughness={0.08} metalness={0.4} toneMapped={false} />
            </mesh>
            <mesh geometry={kit.ph_flash}>
              <meshStandardMaterial {...litMat(lit, { lifeSkip: true })} color="#fff4dc" emissive="#fff4dc" emissiveIntensity={0.25} roughness={0.4} toneMapped={false} />
            </mesh>
          </>
        )}
        {/* screen face — a ghost glow until opened, then the screenshot. Just
            clear of the body's front face. */}
        <mesh geometry={screenGeo} position={[0, 0, PHONE_T / 2 + 0.0004]}>
          <meshStandardMaterial ref={mat} userData={{ lifeSkip: true }} color={accent} emissive={accent} emissiveIntensity={0.5} roughness={0.4} toneMapped={true} />
        </mesh>
      </group>
      {balls.map((b, i) => (
        <group
          key={i}
          ref={(g) => {
            b.mesh = g;
          }}
          position={position}
          visible={false}
        >
          <mesh
            ref={(m) => {
              b.body = m;
            }}
          >
            <sphereGeometry args={[R, 16, 12]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} roughness={0.45} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* the bin beside the couch: placed and turned toward the way it falls,
          the pivot on the edge it falls over, and the cup itself */}
      <group position={[BIN.x, FLOOR_Y, BIN.z]} rotation={[0, BIN.yaw, 0]}>
        <group ref={binPivot} position={[BIN.r0, 0, 0]}>
          <group ref={binBody} position={[-BIN.r0, 0, 0]}>
            {/* glass that stays clear when the exhibit wakes, so the balls in it show */}
            <mesh geometry={binGeo.cup}>
              <LiveGlassMat slug={slug} ghost={false} opacity={0.3} solid={0.34} />
              <LiveEdges slug={slug} threshold={35} />
            </mesh>
            <mesh geometry={binGeo.rim}>
              <LiveGlassMat slug={slug} ghost={false} tint="pale" />
            </mesh>
            {/* the rim's light: a flick for each ball in, lit and pulsing when it's full */}
            <mesh geometry={binGeo.glow} renderOrder={2}>
              <meshBasicMaterial ref={rimGlow} color={accent} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} userData={{ lifeSkip: true }} />
            </mesh>
          </group>
        </group>
      </group>
      {/* (drawn after the cushion, or its glass covers them) */}
      <instancedMesh ref={ringsIM} args={[ringGeo, ringMat, RINGS]} frustumCulled={false} renderOrder={2} />
      {/* the confetti, when the bin goes over */}
      <instancedMesh ref={bitsIM} args={[bitGeo, bitMat, CONFETTI.n]} frustumCulled={false} visible={false} />
    </group>
  );
}

/** The room monitor. At rest it's a dim screen that flickers on as you hover;
 *  once visited it switches to a real screenshot (drop a JPG at
 *  public/textures/room-screen.jpg). Until that file exists it falls back to the
 *  plain lit screen, so nothing breaks. In the close-up with a cursor the
 *  scenario's editor covers it (scenario.tsx). */
function RoomScreen({ slug, position, rotation, args }: { slug: string; position: V3; rotation?: V3; args: V3 }) {
  const { accent } = useAccent();
  const { hovered, selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const mat = useRef<MeshStandardMaterial>(null);
  const k = useRef(0);
  const shown = useRef(false);
  const tex = useOptionalTexture('/textures/room-screen.jpg');
  const live = useRef(0);
  const accentC = useMemo(() => new Color(accent), [accent]);
  useFrame((s) => {
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
      // wake, the colour itself only arrives when the visitor opens it. At rest
      // it keeps a faint standby shimmer — a monitor left on — that fades out as
      // it genuinely wakes.
      const idle = reduced ? 0 : (0.05 + 0.035 * Math.sin(t * 0.9) + 0.02 * Math.max(0, Math.sin(t * 5.3 + 2))) * (1 - live.current);
      m.color.copy(GHOST_FILL).lerp(accentC, live.current);
      m.emissive.copy(GHOST_FILL).lerp(accentC, live.current);
      m.emissiveIntensity = 0.08 + idle + 0.34 * live.current + k.current * 0.9 * n;
    }
  });
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial ref={mat} userData={{ lifeSkip: true }} color={accent} emissive={accent} emissiveIntensity={0.3} roughness={0.4} toneMapped={false} />
    </mesh>
  );
}

/** Drives the shared window material: hovering the town hall lights the whole
 *  skyline's windows (a calm blue). Once visited they stay softly lit, so the
 *  skyline keeps a quiet glow — toned down, never warm/orange. */
/* ---------- Room — games, apps & websites (middle) ---------- */

/* The Lightship Drive cars, after the game's own (scripts/models/build_car.py,
   loaded by kit.ts): a low, chunky wedge with a dark glass cabin, a neon stripe
   round its beltline running yellow at the nose through blue to magenta at the
   tail, and fat tyres with glowing rims. They point along their local +z. The
   colours are the game's: they show once the table has come alive, and until
   then the life system holds them to the ghost like the rest of the model. */
interface Livery {
  body: string;
  cabin: string;
  rim: string;
}
const STRIPE = ['#ff3ad0', '#3aa8ff', '#ffe23a'].map((c) => new Color(c)); // tail → nose

/** The stripe's gradient, written once into the shared geometry as vertex
 *  colours, by how far along the car each vertex sits. */
function paintStripe(g: BufferGeometry) {
  if (g.attributes.color) return;
  const pos = g.attributes.position;
  g.computeBoundingBox();
  const { min, max } = g.boundingBox!;
  const col = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getZ(i) - min.z) / Math.max(1e-6, max.z - min.z);
    const k = Math.min(0.999, t) * (STRIPE.length - 1);
    c.copy(STRIPE[Math.floor(k)]).lerp(STRIPE[Math.floor(k) + 1], k % 1);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
}

function RaceCar({ livery, boost }: { livery: Livery; boost?: { current: number } }) {
  const kit = useCarKit();
  const flash = useRef<Mesh>(null);
  // a boost flashes the car (CoffeeTableAR, BOOST_FLASH): a white shell over
  // the body, bright as it takes the boost and gone again in a third of a second
  useFrame(() => {
    const f = flash.current;
    if (!f) return;
    const k = boost ? Math.max(0, (boost.current - BOOST_FLASH) / (1 - BOOST_FLASH)) : 0;
    f.visible = k > 0;
    (f.material as MeshBasicMaterial).opacity = k * k;
  });
  if (!kit) return null;
  paintStripe(kit.car_stripe);
  return (
    <group>
      <mesh geometry={kit.car_body}>
        <meshStandardMaterial color={livery.body} emissive={livery.body} emissiveIntensity={0.35} roughness={0.42} metalness={0.1} />
        <Crease threshold={30} color={NEUTRAL} transparent opacity={0.3} />
      </mesh>
      <mesh geometry={kit.car_cabin}>
        <meshStandardMaterial color={livery.cabin} roughness={0.18} metalness={0.35} />
        <Crease threshold={30} color={NEUTRAL} transparent opacity={0.3} />
      </mesh>
      <mesh geometry={kit.car_stripe}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>
      <mesh geometry={kit.car_tyres}>
        <meshStandardMaterial color="#15121c" roughness={0.8} />
      </mesh>
      <mesh geometry={kit.car_rims}>
        <meshStandardMaterial color={livery.rim} emissive={livery.rim} emissiveIntensity={1.1} roughness={0.35} toneMapped={false} />
      </mesh>
      <mesh ref={flash} geometry={kit.car_body} scale={1.3} visible={false}>
        <meshBasicMaterial color="#ffffff" transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} userData={{ lifeSkip: true }} />
      </mesh>
    </group>
  );
}

/** The crown that floats over whichever car is winning, a flat cut-out like the
 *  game's. Gold, not a layer accent: it isn't a project colour, it's a trophy. */
const CROWN = GOLD;
function LeaderCrown() {
  const kit = useCarKit();
  if (!kit) return null;
  return (
    <mesh geometry={kit.crown}>
      <meshStandardMaterial color={CROWN} emissive={CROWN} emissiveIntensity={1.1} roughness={0.3} transparent opacity={0.88} toneMapped={false} />
    </mesh>
  );
}

/* ---------- The Lightship Drive table ----------
   After the show-floor setup in the project's film: a low table with a mat on
   it and two light-blue kickers set out on the mat. The cars
   follow a course over it instead of circling a ring: down the front straight
   and off a kicker, braking into the hairpin, a jog in toward the middle, off
   the second kicker on the back straight, and round the tighter sweeper home.
   The course is marked by neon arrows down its middle, with a chase of light
   running along them.

   The table and the kicker are Blender models (build_table.py, via kit.ts);
   the mat, the course and the race are laid out here. Table space: x
   along the table, y up, z across it, the front straight at +z. */
const MAT = 0.19 + 0.0012; // the mat on the table's top (TOP in build_table.py): everything below stands on it
const MAT_W = 0.7;
const MAT_D = 0.36;
const LANE = 0.0185; // each car's line off the course's middle: two abreast, and the kickers are built wide enough for both
const CAR_SCALE = 0.85; // the cars at this table's scale, so two fit abreast

// The course, as a turtle drives it from the start of the front straight,
// heading +x: straights and arcs, each (length, radians turned; right is
// negative). Round the near end in a wide hairpin; then the back steps in toward
// the middle (two 10 cm arcs); a short back straight; and a tighter sweeper
// home. It closes on itself: the jog takes up the difference between the two
// ends' radii.
const JOG_R = 0.1;
const JOG = Math.acos(1 - 0.05 / (2 * JOG_R)); // each arc of the 5 cm step in
const LEGS: [number, number][] = [
  [0.33, 0], // the front straight, with the first kicker on it
  [Math.PI * 0.12, -Math.PI], // the hairpin
  [0.06, 0],
  [JOG_R * JOG, -JOG], // the jog in toward the middle…
  [JOG_R * JOG, JOG], // …and out of it, straight again
  [0.19, 0], // the back straight, with the second kicker
  [Math.PI * 0.095, -Math.PI], // the sweeper
  [0.06 + 2 * JOG_R * Math.sin(JOG) + 0.19 - 0.33, 0], // home
];
const START: [number, number] = [-0.1515, 0.12]; // centres the course on the mat
const COURSE = (() => {
  const total = LEGS.reduce((n, [l]) => n + l, 0);
  const N = Math.round(total / 0.012);
  const pts: Vector3[] = [];
  let [x, z] = START;
  let h = 0; // heading, from +x toward +z
  let leg = 0;
  let into = 0; // how far along the current leg
  const step = total / N;
  for (let i = 0; i < N; i++) {
    pts.push(new Vector3(x, 0, z));
    // drive one step, across leg ends
    let left = step;
    while (left > 1e-9) {
      const [len, turn] = LEGS[leg];
      const go = Math.min(left, len - into);
      if (turn === 0) {
        x += Math.cos(h) * go;
        z += Math.sin(h) * go;
      } else {
        const r = len / Math.abs(turn);
        const dh = (turn / len) * go;
        // along the arc: the chord, at the mid heading
        const c = 2 * r * Math.sin(Math.abs(dh) / 2);
        x += Math.cos(h + dh / 2) * c;
        z += Math.sin(h + dh / 2) * c;
        h += dh;
      }
      into += go;
      left -= go;
      if (into >= len - 1e-9) {
        leg = (leg + 1) % LEGS.length;
        into = 0;
      }
    }
  }
  const curve = new CatmullRomCurve3(pts, true, 'centripetal');
  const L = curve.getLength();
  // a kicker on each straight, by its toe: the first late on the front
  // straight, landing just before the hairpin; the second as the back straight
  // begins, landing as the sweeper does
  const at = (n: number) => LEGS.slice(0, n).reduce((m, [l]) => m + l, 0);
  const toes = [0.085, at(5) + 0.004].map((s) => (s / total) * L);
  return { curve, L, toes };
})();
const wrapS = (s: number) => ((s % COURSE.L) + COURSE.L) % COURSE.L;

// The kicker (build_table.py): its length, its height at the lip, and its face as
// (distance from the toe, height), down its steep back to the mat. The course is
// draped over it; a car goes up the face and off the lip.
const RAMP_L = 0.08;
const RAMP_H = 0.03;
const LIP = RAMP_L - 0.004;
const RAMP_FACE: [number, number][] = [
  [0, 0.0016],
  [RAMP_L / 2 + 0.004, RAMP_H * 0.64],
  [LIP, RAMP_H],
  [RAMP_L, 0],
];
// Off the lip a car flies a parabola, launched along the face's last facet and
// landing FLIGHT beyond the lip, then a small bounce as it lands.
const LAUNCH = (RAMP_H * 0.36) / (LIP - RAMP_FACE[1][0]);
const FLIGHT = 0.12;
const FALL = (RAMP_H + LAUNCH * FLIGHT) / FLIGHT ** 2; // so it's back on the mat at FLIGHT
const BOUNCE = { h: 0.0025, len: 0.035 };

/** How high the course lies at `s` along it: on the mat, or draped over a kicker. */
function courseHeight(s: number): number {
  for (const toe of COURSE.toes) {
    const x = wrapS(s - toe);
    if (x > RAMP_L) continue;
    for (let i = 1; i < RAMP_FACE.length; i++) {
      const [x1, y1] = RAMP_FACE[i];
      if (x <= x1) {
        const [x0, y0] = RAMP_FACE[i - 1];
        return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      }
    }
  }
  return 0;
}

/** Where a car rides at `s`: its height off the mat, and the slope it's pitched to. */
function rideAt(s: number): [number, number] {
  for (const toe of COURSE.toes) {
    const x = wrapS(s - toe) - LIP; // past the lip
    if (x > 0 && x < FLIGHT) return [RAMP_H + LAUNCH * x - FALL * x * x, LAUNCH - 2 * FALL * x];
    if (x >= FLIGHT && x < FLIGHT + BOUNCE.len) {
      const k = (Math.PI * (x - FLIGHT)) / BOUNCE.len;
      return [BOUNCE.h * Math.sin(k), ((BOUNCE.h * Math.PI) / BOUNCE.len) * Math.cos(k)];
    }
  }
  const e = 0.003;
  return [courseHeight(s), (courseHeight(s + e) - courseHeight(s - e)) / (2 * e)];
}

// How hard a car brakes for the bend ahead: the course's curvature, averaged
// over the next few centimetres so it slows before the hairpin rather than in
// it, and picks up again on the way out.
const GRIP_N = 256;
const BRAKE = 0.32; // the speed shed in the tightest bend
const GRIP = (() => {
  const { curve } = COURSE;
  const ds = COURSE.L / GRIP_N;
  const k = new Float32Array(GRIP_N);
  const a = new Vector3();
  const b = new Vector3();
  for (let i = 0; i < GRIP_N; i++) {
    curve.getTangentAt(i / GRIP_N, a);
    curve.getTangentAt(((i + 1) % GRIP_N) / GRIP_N, b);
    k[i] = Math.abs(Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z)) / ds;
  }
  const AHEAD = Math.round(0.06 / ds);
  const out = new Float32Array(GRIP_N);
  for (let i = 0; i < GRIP_N; i++) {
    let sum = 0;
    for (let j = 0; j <= AHEAD; j++) sum += k[(i + j) % GRIP_N];
    out[i] = 1 - BRAKE * Math.min(1, sum / (AHEAD + 1) / 11);
  }
  return out;
})();
const gripAt = (s: number) => GRIP[Math.floor((wrapS(s) / COURSE.L) * GRIP_N) % GRIP_N];

/* The course: small arrows down its middle, pointing the way the race goes,
   and climbing the kickers with it. They're neon, in the cars' stripe colours,
   running round the lap from magenta through blue to yellow and back, and a
   chase of light runs along them the way the race goes, at the race's pace
   (ARROW_CHASE): a lit arrow every `every`, travelling `speed` arrows a second
   at full pace, the light falling off behind it by `tail`, and the arrows at
   `rest` between. One tile of the strip's texture is one arrow; the strip's
   length is a whole number of them, so it closes without a seam. */
const ARROW_W = 0.03; // the strip the arrows are drawn on: one arrow wide
const ARROWS = Math.round(COURSE.L / 0.09);
const ARROW_GAP = COURSE.L / ARROWS; // from one arrow to the next
const ARROW_CHASE = { every: 6, speed: 5, tail: 1.2, rest: 0.8 };
let arrowTex: CanvasTexture | null = null;
function arrowTexture(): CanvasTexture {
  if (arrowTex) return arrowTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = Math.round((64 * ARROW_GAP) / ARROW_W); // square texels
  const g = c.getContext('2d');
  if (g) {
    const { width: w } = c;
    // an arrowhead pointing up the texture, which the strip's v runs along
    // with the race, in white for the strip's colours to tint, with a soft
    // glow round it the way a neon tube has; the rest of the tile is clear
    g.strokeStyle = '#ffffff';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const [width, alpha] of [[20, 0.14], [13, 0.3], [7, 1]]) {
      g.globalAlpha = alpha;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(w * 0.18, w * 0.78);
      g.lineTo(w * 0.5, w * 0.36);
      g.lineTo(w * 0.82, w * 0.78);
      g.stroke();
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return (arrowTex = t);
}

/** The strip the arrows lie on: down the middle of the course, draped over the
 *  kickers, with v running along it, and a colour per vertex that the chase
 *  writes each frame (userData.arrow: which arrow each vertex pair is in). */
function arrowGeometry(): BufferGeometry {
  const N = 420;
  const pos = new Float32Array((N + 1) * 6);
  const uv = new Float32Array((N + 1) * 4);
  const arrow = new Uint8Array(N + 1);
  const idx: number[] = [];
  const p = new Vector3();
  const t = new Vector3();
  for (let i = 0; i <= N; i++) {
    const u = (i % N) / N;
    COURSE.curve.getPointAt(u, p);
    COURSE.curve.getTangentAt(u, t);
    const s = (i / N) * COURSE.L;
    const y = MAT + courseHeight(s) + 0.0012;
    const nx = t.z * (ARROW_W / 2);
    const nz = -t.x * (ARROW_W / 2);
    pos.set([p.x + nx, y, p.z + nz, p.x - nx, y, p.z - nz], i * 6);
    uv.set([0, s / ARROW_GAP, 1, s / ARROW_GAP], i * 4);
    arrow[i] = Math.floor(s / ARROW_GAP + 1e-6) % ARROWS;
  }
  // a quad per step, except down the steep back of a kicker: the strip stops at
  // the lip and picks up again on the mat behind it, rather than hanging a wall
  for (let i = 0; i < N; i++) {
    if (Math.abs(pos[i * 6 + 1] - pos[(i + 1) * 6 + 1]) > 0.004) continue;
    idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setAttribute('color', new BufferAttribute(new Float32Array((N + 1) * 6).fill(1), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.arrow = arrow;
  return g;
}
/** Each arrow's own neon, round the lap: magenta through blue to yellow and
 *  back (the cars' STRIPE); the chase's light runs whiter. */
const WHITE_NEON = new Color('#ffffff');
const ARROW_HUE = Array.from({ length: ARROWS }, (_, k) => {
  const h = (k / ARROWS) * 3;
  const a = Math.floor(h);
  return new Color().copy(STRIPE[a % 3]).lerp(STRIPE[(a + 1) % 3], h - a);
});

const PIECE = '#74b6ff'; // the kickers' light blue, as in the film

/* Two cars racing the course. Each runs its own lap, and three things make it a
   contest rather than a procession (simulated across wake phases: a pass every
   ~19s, a typical gap a sixth of a lap, and no car ever below half pace):

     · `wob`/`amp` — each car's pace rises and falls round the lap on its own
       rhythm, on top of the braking every car does for the bends.
     · `PACE` — a slow swing in outright pace, in antiphase between the two, so
       each is genuinely the quicker car for a spell: this is what opens a gap
       and closes it again.
     · `CATCH` — a push on whoever is behind, growing with the gap and worth
       nothing when they're level, so the gap centres on zero whenever you
       arrive and nothing holds them together through a pass.

   Progress is counted in laps (2π a lap), which is what decides the lead. They
   keep to their own lanes, so a pass happens alongside. */
const CARS: { livery: Livery; at: number; lane: number; wob: number; amp: number; phase: number; pace: number }[] = [
  // the game's purple car, magenta rims; its orange rival with a blue cabin
  { livery: { body: '#5b2a8f', cabin: '#1d1a3f', rim: '#ff4fd8' }, at: 0, lane: LANE, wob: 3, amp: 0.12, phase: 0, pace: 0 },
  { livery: { body: '#ff8a3c', cabin: '#3a2f9e', rim: '#b45cff' }, at: -1.8, lane: -LANE, wob: 2, amp: 0.15, phase: 1.9, pace: Math.PI },
];
const PACE = 0.17; // depth of the slow pace swing
const PACE_W = 0.175; // rad/s — a full swing every ~36s, so a pass is an event
const CATCH = 0.07; // how hard a dropped car pushes on, per radian of gap
const CATCH_CAP = 6; // never let the band become a rocket if the gap ever runs away
const LEAD_HYST = 0.07; // the crown won't change hands on a photo finish jitter
const LAP_SPEED = (2 * Math.PI * 0.2) / COURSE.L; // laps (in radians) per metre-per-second at 0.2 m/s top speed
/* In the table's close-up, point at a car and it gets a boost: it squats for
   a beat (BOOST_SQUAT: rear down, low and wide, braking), then launches,
   stretched along its line and flashing white, into a burst of speed that
   fades over BOOST_FADE with a neon trail in its stripe's colours streaming
   behind, its nose lifting and bobbing as it settles. So you can help one into
   the lead. One boost per car per BOOST_REST. */
const BOOST = 0.9; // extra speed at the burst's peak
const BOOST_FADE = 1.3; // s
const BOOST_FLASH = 0.7; // the flash lasts while the boost fades from 1 to here (~0.4 s)
const BOOST_REST = 1.6; // s before the same car takes another
const BOOST_REACH = 0.035; // how near the cursor's ray has to pass a car (m)
const BOOST_SQUAT = 0.14; // s it gathers itself before it goes
const TRAIL = { beads: 12, gap: 0.014, r: 0.0055 }; // the boost's neon trail, back along the car's line

function CoffeeTableAR({ position, hoverSlug }: { position: V3; hoverSlug?: string }) {
  const { hovered, selected, visited } = useActive(hoverSlug ?? '');
  const reduced = useReducedMotion();
  const kit = useTableKit();
  const cars = useRef<(Group | null)[]>([]);
  const crown = useRef<Group>(null);
  const speed = useRef(0.1);
  const live = useRef(0);
  // laps covered per car, seeded with each car's start so the lead is right from the first frame
  const dist = useRef(CARS.map((c) => c.at));
  const pitch = useRef(CARS.map(() => 0));
  const lead = useRef(0);
  const close = useCloseUp(hoverSlug ?? '');
  const table = useRef<Group>(null);
  const boost = useMemo(() => CARS.map(() => ({ current: 0, rest: 0, at: -99, launched: true })), []);
  const trailIM = useRef<InstancedMesh>(null);
  const trailMat = useMemo(() => {
    const m = new MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    m.userData.lifeSkip = true;
    return m;
  }, []);
  useEffect(() => () => trailMat.dispose(), [trailMat]);
  const tp = useMemo(() => new Vector3(), []);
  const tt = useMemo(() => new Vector3(), []);
  const ray = useMemo(() => new Ray(), []);
  const carAt = useMemo(() => new Vector3(), []);
  const arrows = useGeometry(arrowGeometry);
  const mat = useGeometry(() => roundedPlaneGeometry(MAT_W, MAT_D, 0.03));
  const arrowMap = useMemo(arrowTexture, []);
  // the chase along the arrows (ARROW_CHASE): where its lights are, in arrows
  // along the lap, and each arrow's colour this frame
  const chase = useRef(0);
  const arrowCol = useMemo(() => ARROW_HUE.map(() => new Color()), []);
  const ramps = useMemo(
    () =>
      COURSE.toes.map((toe) => {
        const u = wrapS(toe + RAMP_L / 2) / COURSE.L;
        const p = COURSE.curve.getPointAt(u);
        const t = COURSE.curve.getTangentAt(u);
        return { p: [p.x, MAT, p.z] as V3, yaw: Math.atan2(t.x, t.z) };
      }),
    [],
  );
  const p = useMemo(() => new Vector3(), []);
  const tan = useMemo(() => new Vector3(), []);
  useFrame((s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    // ghost table: the cars barely creep; the race only runs once it's alive
    const sT = selected || visited ? 1 : hovered ? 0.45 : 0.1;
    speed.current += (sT - speed.current) * 0.05;
    live.current += ((selected || visited ? 1 : 0) - live.current) * FX.engage;
    const t = s.clock.elapsedTime;

    // a car the cursor points at takes a boost
    const aiming = close && !!table.current && !!cursorRay(s, table.current, ray);
    for (let i = 0; i < CARS.length; i++) {
      const b = boost[i];
      b.current = Math.max(0, b.current - dt / BOOST_FADE);
      b.rest = Math.max(0, b.rest - dt);
      const g = cars.current[i];
      if (aiming && g && b.rest === 0) {
        carAt.copy(g.position).y += 0.015;
        if (ray.distanceSqToPoint(carAt) < BOOST_REACH * BOOST_REACH) {
          b.at = t; // it squats first; the burst comes as it launches
          b.launched = false;
          b.rest = BOOST_REST;
        }
      }
      if (!b.launched && t - b.at >= BOOST_SQUAT) {
        b.launched = true;
        b.current = 1;
      }
    }

    // the arrows: each in its neon, and the chase of light running along them
    // the way the race goes, at the race's pace (ARROW_CHASE); held still under
    // reduced motion
    if (!reduced) chase.current += dt * ARROW_CHASE.speed * speed.current;
    const E = ARROW_CHASE.every;
    for (let k = 0; k < ARROWS; k++) {
      const behind = (((chase.current - k) % E) + E) % E; // how far the light has gone on past it
      const pulse = reduced ? 0.25 : Math.exp(-behind * ARROW_CHASE.tail);
      arrowCol[k]
        .copy(ARROW_HUE[k])
        .multiplyScalar(ARROW_CHASE.rest + (1.3 - ARROW_CHASE.rest) * pulse)
        .lerp(WHITE_NEON, 0.3 * pulse);
    }
    const which = arrows.userData.arrow as Uint8Array;
    const col = arrows.attributes.color as BufferAttribute;
    for (let i = 0; i < which.length; i++) {
      const c = arrowCol[which[i]];
      col.setXYZ(2 * i, c.r, c.g, c.b);
      col.setXYZ(2 * i + 1, c.r, c.g, c.b);
    }
    col.needsUpdate = true;

    // who's ahead, by laps covered; the dead band stops the crown flickering through a pass
    const d = dist.current[0] - dist.current[1];
    if (d > LEAD_HYST) lead.current = 0;
    else if (d < -LEAD_HYST) lead.current = 1;
    for (let i = 0; i < CARS.length; i++) {
      const c = CARS[i];
      const at = (dist.current[i] / (2 * Math.PI)) * COURSE.L;
      if (!reduced) {
        let v = speed.current * gripAt(at) * (1 + c.amp * Math.sin(dist.current[i] * c.wob + c.phase) + PACE * Math.sin(t * PACE_W + c.pace));
        if (i !== lead.current) {
          // pushing on from behind, not towed along in front: zero at the pass,
          // so they're free to come apart again on the other side of it
          const gap = Math.min(CATCH_CAP, Math.max(0, dist.current[lead.current] - dist.current[i]));
          v *= 1 + CATCH * gap;
        }
        v *= 1 + BOOST * boost[i].current;
        if (!boost[i].launched) v *= 1 - 0.5 * easeOut((t - boost[i].at) / BOOST_SQUAT); // braking into the squat
        dist.current[i] += v * dt * LAP_SPEED;
      }
      const g = cars.current[i];
      if (!g) continue;
      const u = wrapS(at) / COURSE.L;
      COURSE.curve.getPointAt(u, p);
      COURSE.curve.getTangentAt(u, tan);
      const [y, slope] = rideAt(at);
      // the nose follows the slope, eased, so a landing settles rather than snaps
      const aim = -Math.atan(slope);
      pitch.current[i] = reduced ? aim : pitch.current[i] + (aim - pitch.current[i]) * (1 - Math.exp(-dt * 16));
      g.position.set(p.x + tan.z * c.lane, MAT + y, p.z - tan.x * c.lane);
      // the boost's body language: low and wide in the squat, rear down; then
      // stretched along its line as it goes, the nose bobbing as it settles
      const b = boost[i];
      const ph = t - b.at;
      let sx = 1;
      let sy = 1;
      let sz = 1;
      let nose = 0;
      if (!reduced && ph >= 0 && !b.launched) {
        const k = easeOut(ph / BOOST_SQUAT);
        sx = 1 + 0.08 * k;
        sy = 1 - 0.16 * k;
        sz = 1 - 0.05 * k;
        nose = -0.1 * k;
      } else if (!reduced && ph >= BOOST_SQUAT) {
        const e = Math.exp(-(ph - BOOST_SQUAT) * 7);
        sx = 1 - 0.06 * e;
        sy = 1 - 0.08 * e;
        sz = 1 + 0.3 * e;
        nose = -0.05 * ring(ph - BOOST_SQUAT, 2.4, 4);
      }
      g.scale.set(sx, sy, sz);
      g.rotation.set(pitch.current[i] - 0.07 * b.current + nose, Math.atan2(tan.x, tan.z), 0, 'YXZ');
      // the trail: back along the line it's driven, jumps and all, in its
      // stripe's colours (yellow at the car, through blue, to magenta), as
      // bright as the boost still is
      const trail = trailIM.current;
      if (trail) {
        for (let k = 0; k < TRAIL.beads; k++) {
          const j = i * TRAIL.beads + k;
          const f = k / (TRAIL.beads - 1);
          const glow = b.current * (1 - f) * 1.4;
          if (glow <= 0.01) {
            trail.setMatrixAt(j, _m4.makeScale(0, 0, 0));
            continue;
          }
          const back = at - (k + 1) * TRAIL.gap;
          const uk = wrapS(back) / COURSE.L;
          COURSE.curve.getPointAt(uk, tp);
          COURSE.curve.getTangentAt(uk, tt);
          _v3.set(tp.x + tt.z * c.lane, MAT + rideAt(back)[0] + 0.008, tp.z - tt.x * c.lane);
          trail.setMatrixAt(j, _m4.compose(_v3, _q4.identity(), tp.setScalar((1 - 0.55 * f) * TRAIL.r / 0.006)));
          const from = f < 0.5 ? STRIPE[2] : STRIPE[1];
          const to = f < 0.5 ? STRIPE[1] : STRIPE[0];
          trail.setColorAt(j, _c3.copy(from).lerp(to, (f % 0.5) * 2).multiplyScalar(glow));
        }
      }
    }
    if (trailIM.current) {
      trailIM.current.instanceMatrix.needsUpdate = true;
      if (trailIM.current.instanceColor) trailIM.current.instanceColor.needsUpdate = true;
    }

    // the crown rides whoever is ahead, and hops across the moment that changes
    const lc = cars.current[lead.current];
    if (crown.current && lc) {
      const bob = reduced ? 0 : t;
      crown.current.position.set(lc.position.x, lc.position.y + 0.034 + Math.sin(bob * 3) * 0.004, lc.position.z);
      crown.current.rotation.y = bob * 0.9;
      crown.current.scale.setScalar(live.current * CAR_SCALE); // only once the race is real
      crown.current.visible = live.current > 0.02;
    }
  });
  return (
    <group ref={table} position={position} rotation={[0, -0.16, 0]}>
      <BlobShadow position={[0, 0.004, 0]} radius={0.48} aspect={0.62} opacity={0.4} />
      {kit && (
        <mesh geometry={kit.tbl_frame}>
          <LiveGlassMat slug="lightship-drive" tint="pale" />
          <LiveEdges slug="lightship-drive" threshold={35} />
        </mesh>
      )}
      {/* the mat the game is played on: a plain sheet in the model's ground
          (GROUND, materials.tsx — it lies on the table rather than standing on
          it, like the rug), so the table reads as part of the maquette and the
          cars and kickers carry the colour */}
      <mesh geometry={mat} position={[0, MAT, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <GroundMat />
      </mesh>
      {/* neon, in the cars' colours, with the chase of light along them
          (ARROW_CHASE): solid, as the cars' stripes are, since light added
          onto the pale mat only washed out */}
      <mesh geometry={arrows} renderOrder={1}>
        <meshBasicMaterial map={arrowMap} vertexColors transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {kit &&
        ramps.map((r, i) => (
          <mesh key={i} geometry={kit.ramp} position={r.p} rotation={[0, r.yaw, 0]}>
            <LiveGlassMat slug="lightship-drive" tint="pale" color={PIECE} />
            <LiveEdges slug="lightship-drive" threshold={20} />
          </mesh>
        ))}
      {CARS.map((c, i) => (
        <group key={i} ref={(g) => (cars.current[i] = g)}>
          <group scale={CAR_SCALE}>
            <RaceCar livery={c.livery} boost={boost[i]} />
          </group>
        </group>
      ))}
      {/* the boosts' neon trails (drawn after the mat, or its film covers them) */}
      <instancedMesh ref={trailIM} args={[undefined, trailMat, CARS.length * TRAIL.beads]} frustumCulled={false} renderOrder={2}>
        <sphereGeometry args={[0.006, 8, 6]} />
      </instancedMesh>
      {/* the trophy over whoever is winning */}
      <group ref={crown} visible={false}>
        <LeaderCrown />
      </group>
    </group>
  );
}

/* ---- the workstation's desk set (Virtuele Brigade) ----
   Keyboard, mouse and coffee cup. All three take the desk's own treatment —
   LiveGlassMat with ghost={false} — so they rest as plain authored glass and
   solidify together with the desk when the monitor is engaged, rather than
   staying frosted on a woken desk the way the old static clutter did. */
const DESK_SLUG = 'virtuele-brigade';

/** A low-profile keyboard: a slim slab with four raised key rows. The rows are
 *  four thin boxes rather than individual keys — at this scale that's the detail
 *  that survives, and 60 little cubes would only read as noise. */
function Keyboard({ position, rotation }: { position: V3; rotation?: V3 }) {
  // Kept low: at 0.006 tall these stood a full 0.007 proud of a 0.016 body and
  // read as cooling fins rather than keys. They only need to catch a highlight.
  const rows: V3[] = [
    [0, 0.0095, -0.036],
    [0, 0.0095, -0.012],
    [0, 0.0095, 0.012],
    [0, 0.0095, 0.036],
  ];
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[0.3, 0.016, 0.115]} radius={0.006} smoothness={2}>
        <LiveGlassMat slug={DESK_SLUG} ghost={false} tint="glass" />
      </RoundedBox>
      {rows.map((p, i) => (
        <mesh key={i} position={p}>
          <boxGeometry args={[0.26, 0.0035, 0.015]} />
          <LiveGlassMat slug={DESK_SLUG} ghost={false} tint="glass" />
        </mesh>
      ))}
      <Line points={roundedRectPts(0.3, 0.115, 0.006)} position={[0, 0.009, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.4} />
    </group>
  );
}

/** A mouse: a pebble with the button split scored down its front half. */
function Mouse({ position, rotation }: { position: V3; rotation?: V3 }) {
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[0.046, 0.026, 0.072]} radius={0.012} smoothness={3}>
        <LiveGlassMat slug={DESK_SLUG} ghost={false} tint="glass" />
      </RoundedBox>
      <Line
        points={[[0, 0.014, 0.004], [0, 0.014, 0.034]]}
        color={NEUTRAL}
        lineWidth={1}
        transparent
        opacity={0.45}
      />
    </group>
  );
}

/* A VR headset put down on the desk, front to the room, after a Meta Quest: a
   soft white visor with three dark sensor pills down its front, the foam face
   pad behind it, and the fabric strap looped out the back. Modelled in Blender
   (scripts/models/build_headset.py). */
function Headset() {
  const kit = useHeadsetKit();
  if (!kit) return null;
  return (
    <>
      <mesh geometry={kit.hs_strap}>
        <LiveGlassMat slug={DESK_SLUG} ghost={false} tint="glass" />
      </mesh>
      <mesh geometry={kit.hs_shell}>
        <LiveGlassMat slug={DESK_SLUG} ghost={false} tint="pale" />
        <LiveEdges slug={DESK_SLUG} threshold={35} />
      </mesh>
      <mesh geometry={kit.hs_pods}>
        <LiveGlassMat slug={DESK_SLUG} ghost={false} tint="deep" />
      </mesh>
      <mesh geometry={kit.hs_face}>
        <LiveGlassMat slug={DESK_SLUG} ghost={false} tint="deep" />
      </mesh>
    </>
  );
}

/* The second player isn't in the room, so its headset is a remote player's:
   it logs in rather than being picked up (LOGIN). Its outline flickers on
   first, a scan sweeps up through it filling it in, and it stays see-through
   (REMOTE): there, and not quite there. */
const LOGIN = { outline: 0.55, scan: 0.9, settle: 0.45 }; // s: the outline flickering on, the scan filling it in, its light dying away
const LOGIN_LEN = LOGIN.outline + LOGIN.scan + LOGIN.settle;
const REMOTE = { fill: 0.4, edge: 0.4 }; // how solid the second's headset stays, logged in, and its outline
/** The remote player's headset. `login.since`: s since it began logging in
 *  (below 0: not yet); `login.out`: 1 while it's in, falling to 0 as it leaves. */
function RemoteHeadset({ login }: { login: { since: number; out: number } }) {
  const kit = useHeadsetKit();
  const root = useRef<Group>(null);
  const edges = useRef<ElementRef<typeof Crease>>(null);
  // the scan: its height in the world (everything above it not yet there), and its light
  const scan = useMemo(() => ({ y: { value: 1e3 }, band: { value: 0 }, width: { value: 0.01 } }), []);
  const mats = useMemo(() => {
    const make = (tint: Tint) => {
      const m = new MeshStandardMaterial({ color: SURFACE[tint].color, transparent: true, opacity: 0, roughness: 0.34, metalness: 0, emissive: SURFACE_GLOW, emissiveIntensity: 0.14, depthWrite: false });
      m.userData = { lifeSkip: true, presenceOwn: true };
      m.onBeforeCompile = function (this: MeshStandardMaterial, shader) {
        glassRim.call(this, shader);
        shader.uniforms.uScan = scan.y;
        shader.uniforms.uBand = scan.band;
        shader.uniforms.uBandW = scan.width;
        shader.vertexShader = shader.vertexShader
          .replace('void main() {', 'varying float vScanY;\nvoid main() {')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvScanY = (modelMatrix * vec4(transformed, 1.0)).y;');
        shader.fragmentShader = shader.fragmentShader
          .replace('void main() {', 'uniform float uScan;\nuniform float uBand;\nuniform float uBandW;\nvarying float vScanY;\nvoid main() {\nif (vScanY > uScan) discard;')
          .replace('#include <opaque_fragment>', '#include <opaque_fragment>\nfloat _sb = uBand * (1.0 - smoothstep(0.0, uBandW, uScan - vScanY));\ngl_FragColor.rgb += vec3(0.7, 0.9, 1.0) * _sb;\ngl_FragColor.a = max(gl_FragColor.a, _sb * 0.85);');
      };
      return m;
    };
    return { glass: make('glass'), pale: make('pale'), deep: make('deep') };
  }, [scan]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const at = useMemo(() => ({ p: new Vector3(), s: new Vector3() }), []);
  useFrame(() => {
    const g = root.current;
    if (!g) return;
    const { since, out } = login;
    // the scan, in world height through the headset
    g.getWorldPosition(at.p);
    const k = g.getWorldScale(at.s).y;
    const h = 0.075 * k;
    let fill = 0;
    let edge = 0;
    if (since < LOGIN.outline) {
      // its outline, flickering on as the connection's made
      edge = (Math.sin(since * 70) > -0.3 ? 1 : 0.15) * (0.3 + 0.6 * Math.max(0, since / LOGIN.outline));
      scan.y.value = at.p.y - 2 * h;
      scan.band.value = 0;
    } else if (since < LOGIN.outline + LOGIN.scan) {
      // the scan sweeping up through it, filling it in
      edge = 0.85;
      fill = REMOTE.fill * 1.4;
      scan.y.value = at.p.y - h + 2 * h * easeInOut((since - LOGIN.outline) / LOGIN.scan);
      scan.band.value = 1;
    } else {
      // in: its light dies away to the remote player's see-through
      const f = Math.min(1, (since - LOGIN.outline - LOGIN.scan) / LOGIN.settle);
      edge = 0.85 + (REMOTE.edge - 0.85) * f;
      fill = REMOTE.fill * (1.4 - 0.4 * f);
      scan.y.value = 1e3;
      scan.band.value = 0;
    }
    scan.width.value = 0.014 * k;
    mats.pale.opacity = fill * out;
    mats.glass.opacity = fill * out * 0.85;
    mats.deep.opacity = Math.min(1, fill * out * 1.3);
    const em = edges.current?.material;
    if (em) em.opacity = edge * out;
  });
  if (!kit) return null;
  return (
    <group ref={root}>
      <mesh geometry={kit.hs_strap} material={mats.glass} />
      <mesh geometry={kit.hs_shell} material={mats.pale}>
        <Crease ref={edges} threshold={35} color={NEUTRAL} transparent opacity={0} depthWrite={false} userData={{ lifeSkip: true, presenceOwn: true }} />
      </mesh>
      <mesh geometry={kit.hs_pods} material={mats.deep} />
      <mesh geometry={kit.hs_face} material={mats.deep} />
    </group>
  );
}

/* The Virtuele Brigade is played together, so open it and a session starts:
   the headset on the desk lifts to a standing player's head height, a second
   one logs in beside the screen (a remote player: RemoteHeadset), and the two
   play a scene only they can see — worn by no one.

   What makes it read as multiplayer is that they play it together, beat by
   beat (BEATS): both on the same thing; one turning to the other, who turns
   back, and a nod — talking it over; both leaning in over something on the
   ground; a sound, and the second follows the first's turn a moment later; one
   down behind cover while the other keeps watch above. Each beat gives each
   player a point to look at (in the desk's frame: SCENE, or the other player),
   which its head eases onto with the camera's spring (lib/spring.ts: a head
   gathers speed and settles, it doesn't snap). The heads tip into their turns,
   and a slow sway of breath and weight runs under all of it, out of step
   between the two. Close the project and the second leaves, and the first
   settles back where it was put down. Under reduced motion they take their
   places and hold still.

   In the close-up with a cursor you're the instructor in their chase, in the
   editor (scenario.tsx, the story itself in chase.ts): then that says where
   each stands and looks, along with the story rather than on its map (they
   turn the way the team goes, look about, set off, nod), and they tell it back
   whether the second's in yet. */
const HS_PIVOT: V3 = [0, 0.036, -0.1]; // the middle of the wearer's head, in the headset's own frame
const HS_LEVEL = 0.12; // pitched a little nose-down, which levels the strap round the head that isn't there
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
// (where the two heads stand to begin with: POSTS, in scenario.tsx)
const SCENE: Record<'ahead' | 'ground' | 'left' | 'right' | 'up', V3> = {
  ahead: [0.05, 0.75, 1.4],
  ground: [0.05, 0.3, 0.7],
  left: [-1.4, 0.85, 0.55],
  right: [1.3, 0.8, 0.7],
  up: [0.2, 1.7, 0.9],
};
type Aim = V3 | 'peer';
// (`glide`, the head's spring, is kept long: a head that whips round reads as
// a puppet, one that gathers speed and eases in as someone looking)
const BEATS: { hold: number; glide: number; look: [Aim, Aim]; duck?: [number, number]; lean?: [number, number]; nod?: boolean; lag?: number }[] = [
  { hold: 2.6, glide: 0.8, look: [SCENE.ahead, SCENE.ahead] }, // both on the same thing
  { hold: 2.0, glide: 0.65, look: ['peer', SCENE.ahead] }, // one turns to the other…
  { hold: 2.4, glide: 0.65, look: ['peer', 'peer'], nod: true }, // …who turns back: talking it over
  { hold: 2.4, glide: 0.75, look: [SCENE.ground, SCENE.ground], lean: [0.035, -0.035] }, // both lean in over something
  { hold: 1.9, glide: 0.45, look: [SCENE.left, SCENE.left], lag: 0.45 }, // a sound: one turns, the other a moment behind
  { hold: 2.2, glide: 0.55, look: [SCENE.left, SCENE.up], duck: [0.075, 0] }, // one into cover, the other keeping watch
  { hold: 1.8, glide: 0.65, look: ['peer', 'peer'], nod: true }, // a nod: clear
  { hold: 2.3, glide: 0.7, look: [SCENE.right, SCENE.right], lag: 0.3 }, // on, together
];
const BEAT_LEN = BEATS.reduce((n, b) => n + b.hold, 0);
const JOIN_DELAY = 0.7; // s after the first lifts that the second spawns in
/* In the close-up, now and then, the two notice you: between their beats they
   turn to look at the cursor, the first and then the second, as if a third
   player had just joined the session, and after a moment go back to their game.
   It's a double-take (DOUBLE_TAKE): a quick glance partway round, back to the
   game, then the real look round, the head tipped as if to say "who's that?".
   Only while the cursor's moving; never more often than every NOTICE_EVERY. */
const NOTICE_FIRST = 2.5; // s into the session before the first time
const NOTICE_LEN = 2.8; // how long they look, double-take and all
/** The double-take, in s into a player's notice: the glance (`of` the way
 *  round to you) until `glance`, back on the game until `back`, then the look;
 *  each on its own spring (`glides`, s: the glance and the snap back are
 *  quick, the look takes its time), the look's head tipped `tilt` (rad; the
 *  two tip opposite ways). */
const DOUBLE_TAKE = { glance: 0.3, back: 0.65, of: 0.6, glides: [0.1, 0.2, 0.4], tilt: 0.16 };
const NOTICE_EVERY = [6, 9]; // s from one time to the next, at random between
const NOTICE_LAG = 0.25; // the second looks round this long after the first
const NOTICE_AT: V3 = [0.05, 0.85, 0.6]; // the depth they look out to, desk frame: in front of them, toward you
/** Which beat is playing `t` seconds into the session, and how long it has been on. */
function beatAt(t: number): [number, number] {
  let u = ((t % BEAT_LEN) + BEAT_LEN) % BEAT_LEN;
  for (let i = 0; i < BEATS.length; i++) {
    if (u < BEATS[i].hold) return [i, u];
    u -= BEATS[i].hold;
  }
  return [0, 0];
}
function VRPlayers({ position, rotation, link }: { position: V3; rotation?: V3; link: MutableRefObject<SessionLink> }) {
  const { selected } = useActive(DESK_SLUG);
  const reduced = useReducedMotion();
  const close = useCloseUp(DESK_SLUG);
  const frame = useRef<Group>(null); // the desk's frame, to find the cursor in
  const notice = useRef({ t: -1, next: NOTICE_FIRST });
  const you = useMemo(() => new Vector3(), []);
  const depth = useMemo(() => new Vector3(...NOTICE_AT), []);
  const rigs = useRef<(Group | null)[]>([]);
  const lift = useRef(0); // 0 on the desk, 1 on the first player's head
  const session = useRef(0); // seconds the session has been running
  // each head: where it is (it can walk, in the scenario) and how it's turned
  const heads = useRef(POSTS.map(([x, y, z]) => ({ x, y, z, yaw: 0, pitch: 0, duck: 0, lean: 0, tilt: 0 })));
  const vels = useRef(POSTS.map(() => ({ x: { v: 0 }, y: { v: 0 }, z: { v: 0 }, yaw: { v: 0 }, pitch: { v: 0 }, duck: { v: 0 }, lean: { v: 0 }, tilt: { v: 0 } })));
  const post = useMemo(() => new Vector3(), []);
  const login = useMemo(() => ({ since: -1, out: 0 }), []); // the second's log-in (RemoteHeadset)
  const restYaw = rotation?.[1] ?? 0;
  // where the first head's middle is while its headset lies on the desk
  const rest = useMemo<V3>(() => {
    const c = Math.cos(restYaw);
    const sn = Math.sin(restYaw);
    return [position[0] + HS_PIVOT[0] * c + HS_PIVOT[2] * sn, position[1] + HS_PIVOT[1], position[2] - HS_PIVOT[0] * sn + HS_PIVOT[2] * c];
  }, [position, restYaw]);
  useFrame((s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const t = s.clock.elapsedTime;
    const on = selected ? 1 : 0;
    lift.current = reduced ? on : lift.current + (on - lift.current) * (1 - Math.exp(-dt * 2.2));
    session.current = selected ? session.current + dt : 0;
    const e = lift.current * lift.current * (3 - 2 * lift.current); // eased off the desk and back onto it
    // noticing you: when it's time, and only while the cursor's moving (not
    // while you're running the chase: then they're busy in it)
    const nt = notice.current;
    const L = link.current;
    const moving = close && cursorIdle() < 1.5 && !L.on;
    const seen = moving && !!frame.current && !!cursorAtDepth(s, frame.current, depth, you);
    // the scenario (scenario.tsx): a nod for each thing dealt with, and a full
    // row's huddle, turned to each other
    const huddle = L.roundAt >= 0 && t >= L.roundAt && t - L.roundAt < ROUND_LEN;
    if (!selected) Object.assign(nt, { t: -1, next: NOTICE_FIRST });
    else if (nt.t < 0 && seen && session.current >= nt.next) nt.t = 0;
    else if (nt.t >= 0) {
      nt.t += dt;
      if (nt.t > NOTICE_LEN + NOTICE_LAG) {
        nt.t = -1;
        nt.next = session.current + NOTICE_EVERY[0] + Math.random() * (NOTICE_EVERY[1] - NOTICE_EVERY[0]);
      }
    }
    // the second player: logging in once the session's begun (RemoteHeadset
    // draws it), gone again when it ends
    const since = session.current - JOIN_DELAY;
    if (selected && !reduced && since >= 0 && login.since < 0) play('vr-login', { volume: 0.4 });
    login.since = reduced ? (selected ? LOGIN_LEN : -1) : selected ? since : Math.max(login.since, LOGIN_LEN);
    login.out = reduced ? on : selected ? 1 : Math.max(0, Math.min(1, e * 1.4 - 0.4));
    const joined = reduced ? on : selected ? Math.min(1, Math.max(0, since / LOGIN_LEN)) : login.out;
    for (let p = 0; p < POSTS.length; p++) {
      const g = rigs.current[p];
      if (!g) continue;
      const hd = heads.current[p];
      const v = vels.current[p];
      // where it stands: where the scenario has it while it runs (it walks
      // there itself, so this only smooths it), otherwise its own place
      const W = L.on ? L.want[p] : null;
      const to0 = W ? W.at : post.set(...POSTS[p]);
      const pg = W ? 0.15 : 0.8;
      hd.x = spring(hd.x, to0.x, v.x, dt, pg);
      hd.y = spring(hd.y, to0.y, v.y, dt, pg);
      hd.z = spring(hd.z, to0.z, v.z, dt, pg);
      const at: V3 = [hd.x, hd.y, hd.z];
      const o = heads.current[1 - p];
      const peer: V3 = [o.x, o.y, o.z];
      // the beat this player is on: the second follows a beat's turn `lag` behind
      let [bi] = beatAt(session.current);
      if (p === 1) {
        const [b2, into] = beatAt(session.current);
        const lag = BEATS[b2].lag ?? 0;
        bi = into < lag ? (b2 + BEATS.length - 1) % BEATS.length : b2;
      }
      const B = BEATS[bi];
      const aim = B.look[p];
      const game: V3 = aim === 'peer' ? peer : aim;
      // noticing you overrides the beat while it lasts, as a double-take: the
      // glance (0), back to the game (1), the look (2)
      const into = nt.t - p * NOTICE_LAG;
      const noticing = nt.t >= 0 && into >= 0 && into <= NOTICE_LEN && seen;
      const take = !noticing ? -1 : into < DOUBLE_TAKE.glance ? 0 : into < DOUBLE_TAKE.back ? 1 : 2;
      const of = take === 0 ? DOUBLE_TAKE.of : take === 2 ? 1 : 0;
      const to: V3 = huddle
        ? peer
        : W
          ? [W.look.x, W.look.y, W.look.z]
          : [game[0] + (you.x - game[0]) * of, game[1] + (you.y - game[1]) * of, game[2] + (you.z - game[2]) * of];
      const dx = to[0] - at[0];
      const dz = to[2] - at[2];
      // (the short way round: a look over the shoulder crosses behind)
      const yaw = hd.yaw + wrapAngle(Math.atan2(dx, dz) - hd.yaw);
      const beatNod = B.nod && !noticing && !W && !huddle && !reduced ? 0.05 * (1 - Math.cos(session.current * 5 + p)) : 0;
      // one dealt with: a firm nod each, the second a beat after the first; a full row: nodding together
      const callNod = L.nodAt >= 0 ? 0.12 * bump((t - L.nodAt - p * 0.12) / 0.45) : 0;
      const rowNod = huddle ? 0.06 * (1 - Math.cos((t - L.roundAt) * 9 + p)) : 0;
      const pitch = -Math.atan2(to[1] - at[1], Math.hypot(dx, dz)) + beatNod + callNod + rowNod;
      const glide = huddle ? 0.45 : W ? W.glide : take < 0 ? B.glide : DOUBLE_TAKE.glides[take];
      if (reduced) Object.assign(hd, { yaw: Math.atan2(SCENE.ahead[0] - at[0], SCENE.ahead[2] - at[2]), pitch: 0, duck: 0, lean: 0, tilt: 0 });
      else {
        hd.yaw = spring(hd.yaw, yaw, v.yaw, dt, glide);
        hd.pitch = spring(hd.pitch, pitch, v.pitch, dt, glide);
        hd.duck = spring(hd.duck, (W ? W.duck : B.duck?.[p] ?? 0) * on, v.duck, dt, W ? 0.3 : B.glide);
        hd.lean = spring(hd.lean, W ? 0 : (B.lean?.[p] ?? 0) * on, v.lean, dt, B.glide);
        hd.tilt = spring(hd.tilt, take === 2 ? (p === 0 ? 1 : -1) * DOUBLE_TAKE.tilt : 0, v.tilt, dt, 0.35);
      }
      // breath and weight under it all, out of step between the two, the head
      // tipping into a turn, and tipped while it looks at you; a step's bob
      // while it walks
      const k = p === 0 ? e : joined;
      const sway = reduced ? 0 : k;
      const ph = p * 2.1;
      const pace = reduced ? 0 : Math.min(1, Math.hypot(v.x.v, v.z.v) / 0.25);
      const roll = 0.18 * Math.tanh((-v.yaw.v * 0.07) / 0.18) * sway + Math.sin(t * 0.8 + ph) * 0.03 * sway + hd.tilt * sway;
      const x = at[0] + hd.lean + Math.sin(t * 0.7 + ph) * 0.008 * sway;
      const y = at[1] - hd.duck + Math.sin(t * 1.6 + ph) * 0.005 * sway + Math.abs(Math.sin(t * 5.5 + ph)) * 0.006 * pace;
      const z = at[2] + Math.sin(t * 0.55 + 1 + ph) * 0.006 * sway;
      // told back to the scenario: where it is, which way it faces, whether it's in yet
      const hb = L.heads[p];
      hb.x = x;
      hb.z = z;
      hb.yaw = hd.yaw;
      hb.joined = k;
      const rx = HS_LEVEL + hd.pitch;
      const ry = hd.yaw + Math.sin(t * 0.9 + ph) * 0.03 * sway;
      if (p === 0) {
        // lifted off the desk and set back down on it
        const mix = (a: number, b: number) => a + (b - a) * e;
        g.position.set(mix(rest[0], x), mix(rest[1], y), mix(rest[2], z));
        g.rotation.set(mix(0, rx), mix(restYaw, ry), mix(0, roll), 'YXZ');
      } else {
        // logged in where it stands (RemoteHeadset draws the log-in)
        g.visible = login.since >= 0 && login.out > 0.001;
        g.position.set(x, y, z);
        g.rotation.set(rx, ry, roll, 'YXZ');
      }
    }
  });
  return (
    <group ref={frame}>
      <group ref={(g) => (rigs.current[0] = g)} position={rest} rotation={[0, restYaw, 0]}>
        <group position={[-HS_PIVOT[0], -HS_PIVOT[1], -HS_PIVOT[2]]}>
          <Headset />
        </group>
      </group>
      <group ref={(g) => (rigs.current[1] = g)} position={POSTS[1]} visible={false}>
        <group position={[-HS_PIVOT[0], -HS_PIVOT[1], -HS_PIVOT[2]]}>
          <RemoteHeadset login={login} />
        </group>
      </group>
    </group>
  );
}

/** A coffee cup, turned from a profile: a foot, a belly, a rolled lip and a D
 *  handle, with a dark disc of coffee just under the lip so it reads as full
 *  rather than as an empty tube. */
function CoffeeCup({ position, rotation, lit }: { position: V3; rotation?: V3; lit: LitLink }) {
  const cup = useGeometry(() =>
    merge([
      lathe([[0, 0], [0.021, 0], [0.0245, 0.003], [0.0285, 0.035], [0.0305, 0.066], [0.0311, 0.0703], [0.0301, 0.0724], [0.0287, 0.0708], [0.0279, 0.062], [0.018, 0.06], [0, 0.06]], 28),
      tube([[0.028, 0.059, 0], [0.043, 0.058, 0], [0.051, 0.045, 0], [0.047, 0.026, 0], [0.027, 0.02, 0]], 0.0042, 6, 24),
    ]),
  );
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={cup}>
        <LiveGlassMat slug={DESK_SLUG} ghost={false} tint="glass" />
      </mesh>
      <mesh position={[0, 0.066, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.0285, 24]} />
        <meshStandardMaterial {...litMat(lit)} color={SURFACE.deep.color} emissive={SURFACE.deep.color} emissiveIntensity={0.22} roughness={0.35} side={DoubleSide} />
      </mesh>
    </group>
  );
}

/** A tripod floor lamp: three splayed, tapered legs meeting at a turned hub,
 *  a stem on up to a drum shade with a real wall (outside and in), and a
 *  finial on top. */
function FloorLamp({ position }: { position: V3 }) {
  const g = useGeometry(() => {
    const frame: BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      // from the hub at 0.42 out and down to the floor at r 0.15
      const len = Math.hypot(0.15, 0.42);
      const tilt = Math.atan2(0.15, 0.42);
      frame.push(place(hang(softBox(0.012, len, 0.012, 0.004, { taper: 1.7 }), len, [0, 0, 0], [tilt, 0, 0]), [0, 0.42, 0], [0, a, 0]));
    }
    frame.push(place(lathe([[0, -0.03], [0.014, -0.03], [0.018, -0.012], [0.018, 0.012], [0.012, 0.03], [0, 0.03]], 16), [0, 0.42, 0]));
    frame.push(place(lathe([[0, 0], [0.006, 0], [0.006, 0.3], [0, 0.3]], 10), [0, 0.43, 0]));
    frame.push(place(lathe([[0, 0], [0.008, 0], [0.012, 0.012], [0.006, 0.024], [0, 0.028]], 12), [0, 0.81, 0])); // finial
    const shade = lathe([[0.132, 0.63], [0.136, 0.633], [0.12, 0.806], [0.116, 0.81], [0.113, 0.806], [0.129, 0.633], [0.126, 0.63]], 40);
    return { frame: merge(frame), shade };
  });
  return (
    <group position={position}>
      <BlobShadow position={[0, 0.003, 0]} radius={0.2} opacity={0.34} />
      <mesh geometry={g.frame}>
        <GlassMat tint="glass" />
      </mesh>
      <mesh geometry={g.shade}>
        <GlassMat tint="pale" />
      </mesh>
    </group>
  );
}

/** A leafy potted houseplant: a turned pot — foot, belly, a rolled rim — and
 *  fourteen arching strap leaves, each folded along its midrib and set on the
 *  golden angle so no two line up. It used to be nine squashed cones, which
 *  read as a bundle of spikes. With a `liveSlug` it solidifies alongside that
 *  hotspot (the workstation). */
function PottedPlant({ position, liveSlug }: { position: V3; liveSlug?: string }) {
  const g = useGeometry(() => {
    const pot = merge([
      lathe([[0, 0], [0.084, 0], [0.094, 0.006], [0.113, 0.06], [0.126, 0.128], [0.13, 0.152], [0.1335, 0.161], [0.128, 0.1665], [0.1215, 0.159], [0, 0.156]], 36),
      lathe([[0, 0.149], [0.121, 0.146], [0, 0.146]], 36), // the soil, a hair domed
    ]);
    const leaves: BufferGeometry[] = [];
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39996;
      const k = ((i * 9) % 14) / 13; // 0..1, scrambled
      const H = 0.3 + k * 0.2; // height the leaf reaches
      const R = 0.12 + (1 - k) * 0.11; // how far it arches out
      const dir = [Math.cos(a), 0, Math.sin(a)];
      const at = (r: number, y: number): [number, number, number] => [dir[0] * r, 0.15 + y, dir[2] * r];
      leaves.push(leaf([at(0, 0), at(R * 0.22, H * 0.55), at(R * 0.55, H * 0.92), at(R, H * 0.8)], 0.066 + (1 - k) * 0.016, [-dir[2], 0, dir[0]], { fold: 0.3, widest: 0.42 }));
    }
    return { pot, leaves: merge(leaves) };
  });
  return (
    <group position={position}>
      <BlobShadow position={[0, 0.003, 0]} radius={0.2} opacity={0.34} />
      <mesh geometry={g.pot}>{liveSlug ? <LiveGlassMat slug={liveSlug} ghost={false} tint="deep" /> : <GlassMat tint="deep" />}</mesh>
      <mesh geometry={g.leaves}>{liveSlug ? <LiveGlassMat slug={liveSlug} ghost={false} tint="pale" solid={0.5} /> : <GlassMat tint="pale" />}</mesh>
    </group>
  );
}

// Books on the shelves (local to the bookcase group), standing spine-out with
// real depth and varied size; a couple lean. Each shelf packed.
//
// The spines used to be six hand-mixed blues. They were already a value ramp —
// which is the right instinct — so they're now that ramp expressed in the three
// SURFACE cuts instead of its own private set. Books stay opaque: a stack of
// paper is the densest thing in the room, and the cut only supplies the value.
const BOOKS: { p: V3; s: V3; c: Tint; r?: V3 }[] = [
  // top shelf (y ≈ 0.78)
  { p: [-0.30, 0.78, 0.02], s: [0.05, 0.17, 0.18], c: 'deep' },
  { p: [-0.245, 0.785, 0.02], s: [0.045, 0.18, 0.18], c: 'glass' },
  { p: [-0.19, 0.778, 0.02], s: [0.052, 0.165, 0.18], c: 'glass' },
  { p: [-0.12, 0.79, 0.02], s: [0.06, 0.19, 0.18], c: 'deep' },
  { p: [-0.05, 0.775, 0.02], s: [0.046, 0.16, 0.18], c: 'glass' },
  { p: [0.02, 0.783, 0.02], s: [0.05, 0.175, 0.18], c: 'pale' },
  { p: [0.10, 0.78, 0.02], s: [0.055, 0.17, 0.18], c: 'deep' },
  { p: [0.185, 0.787, 0.02], s: [0.05, 0.185, 0.18], c: 'glass' },
  { p: [0.258, 0.742, 0.02], s: [0.05, 0.16, 0.18], c: 'glass', r: [0, 0, 0.17] }, // leaning
  // middle shelf (y ≈ 0.52) — gap at x ≈ 0.12 for the open Zwijsen book
  { p: [-0.30, 0.52, 0.02], s: [0.05, 0.17, 0.18], c: 'glass' },
  { p: [-0.245, 0.515, 0.02], s: [0.048, 0.16, 0.18], c: 'deep' },
  { p: [-0.185, 0.523, 0.02], s: [0.055, 0.18, 0.18], c: 'glass' },
  { p: [-0.11, 0.52, 0.02], s: [0.05, 0.17, 0.18], c: 'pale' },
  { p: [-0.04, 0.518, 0.02], s: [0.052, 0.165, 0.18], c: 'deep' },
  { p: [0.26, 0.52, 0.02], s: [0.05, 0.17, 0.18], c: 'glass' },
  { p: [0.214, 0.5, 0.02], s: [0.05, 0.15, 0.18], c: 'deep', r: [0, 0, -0.15] }, // leaning into the gap
  // bottom shelf (y ≈ 0.26) — books, then a horizontal stack fills the right
  { p: [-0.30, 0.26, 0.02], s: [0.052, 0.17, 0.18], c: 'glass' },
  { p: [-0.24, 0.265, 0.02], s: [0.05, 0.18, 0.18], c: 'glass' },
  { p: [-0.18, 0.258, 0.02], s: [0.055, 0.165, 0.18], c: 'deep' },
  { p: [-0.11, 0.262, 0.02], s: [0.048, 0.175, 0.18], c: 'deep' },
  { p: [-0.04, 0.26, 0.02], s: [0.05, 0.17, 0.18], c: 'glass' },
  { p: [0.03, 0.255, 0.02], s: [0.052, 0.16, 0.18], c: 'pale' },
];

/** The Zwijsen AR-books hotspot — a real little book. Two rigid halves (cover
 *  board + page block + printed page) hinge at the spine: it stands CLOSED in
 *  its shelf gap, and on select it lifts out, tilts toward the player and the
 *  front half swings open onto a spread of its picture book (bookPages.ts:
 *  four spreads of Mouse's day out, drawn in the model's stock).
 *
 *  In the close-up it's a seek-and-find, the way the real apps were. Mouse is
 *  on every spread, but not in the print: only in its AR layer, and wherever
 *  the cursor is on the page, a lens round it (a coral ring on the paper; the
 *  cursor itself stays the cursor) shows the page in AR. Rest it on Mouse and
 *  the ring fills round; full, Mouse is found and lifts off the page, and the
 *  right-hand page turns over onto the next spread. After the fourth, the book
 *  closes in your hands and opens again on the first. Only two spreads are
 *  drawn at a time: the one open and the one coming. With no cursor (a touch
 *  screen) the lens finds Mouse by itself, slowly; under reduced motion the
 *  book just opens on its page. */
const BOOK_W = 0.17; // full open width
const BOOK_H = 0.19; // page depth (spine length)
const BOOK_T = 0.011; // cover board thickness
const BOOK_PT = 0.009; // page block thickness per half
const BOOK_ANG = 0.14; // resting V of the halves once open: shallow, so both pages face you
const BOOK_HELD = 0.55; // how much bigger it's held up to be read than it stood on the shelf
const PAGE_W = BOOK_W / 2 - 0.016; // a printed page, across
const PAGE_H = BOOK_H - 0.02; // …and along the spine
const PAGE_Y = BOOK_T / 2 + BOOK_PT + 0.0008; // its face, above the hinge
const PAGE_X0 = BOOK_W / 4 - PAGE_W / 2; // its inner edge, out from the spine
const SPREAD_ASPECT = (2 * PAGE_W) / PAGE_H; // the spread's width against its height
/** The lens: its radius (of the page's height), s to fade in or out, s to rest
 *  on Mouse before Mouse counts as found (the ring fills round meanwhile). */
const LENS = { r: 0.11, fade: 0.12, dwell: 0.5 };
/** Mouse found: s before the page turns, and s Mouse takes to lift off it. */
const FOUND = { hold: 0.95, lift: 1.2 };
/** A page turning: s it takes, and how far its free edge lags (rad) at the middle. */
const TURN = { len: 0.85, curl: 0.6 };
/** The end: s to close the book, s held shut, s to open it again. */
const SHUT = { close: 0.55, hold: 0.35, open: 0.7 };
/** With no cursor: s before the lens comes out, and s it takes to reach Mouse. */
const AUTO = { wait: 0.9, glide: 1.8 };
const AR_SCALE = 0.75; // the AR layer's canvas against the print's (soft, and only ever seen through the lens)
const LEAF_N = 16; // segments across the turning page

type LensUniforms = { uAr: { value: Texture }; uLens: { value: Vector4 }; uLock: { value: number }; uRing: { value: Color } };
/** A printed page. On the two open pages, the lens: inside it the page shows
 *  its AR layer over the print (uAr, the whole spread's, sampled where the
 *  print is), a touch brighter, inside a ring that fills round (uLock) while
 *  Mouse is held in it. uLens: its centre (the spread's u, v), radius, and how
 *  far it's faded in. */
function pageMaterial(u: LensUniforms | null, side: Side = DoubleSide): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ emissive: '#ffffff', emissiveIntensity: 0.85, roughness: 0.75, toneMapped: false, side });
  if (!u) {
    // the turning page sits a hair over the open ones; this keeps it in front
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    return m;
  }
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uAr;\nuniform vec4 uLens;\nuniform float uLock;\nuniform vec3 uRing;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
#ifdef USE_MAP
  vec2 lensD = (vMapUv - uLens.xy) * vec2(${SPREAD_ASPECT.toFixed(4)}, 1.0);
  float lensR = length(lensD);
  float lensAA = fwidth(lensR) + 0.0006;
  float lensIn = (1.0 - smoothstep(uLens.z - lensAA, uLens.z + lensAA, lensR)) * uLens.w;
  vec4 arC = texture2D(uAr, vMapUv);
  float arA = arC.a * lensIn;
  diffuseColor.rgb = mix(diffuseColor.rgb, arC.rgb, arA);
  totalEmissiveRadiance = mix(totalEmissiveRadiance, arC.rgb * 1.1, arA) + uRing * 0.05 * lensIn;
  float ringW = 0.0032 + 0.0035 * uLock;
  float ringA = (1.0 - smoothstep(ringW * 0.5, ringW * 0.5 + lensAA, abs(lensR - uLens.z))) * uLens.w;
  float round = fract(atan(lensD.x, lensD.y) / 6.28318 + 1.0);
  float filled = step(round, uLock);
  ringA *= mix(0.7, 1.0, filled);
  diffuseColor.rgb = mix(diffuseColor.rgb, uRing, ringA);
  totalEmissiveRadiance = mix(totalEmissiveRadiance, uRing * (1.1 + 0.9 * filled), ringA);
#endif`,
      );
  };
  return m;
}

/** The page that turns: a strip from the spine out, bent along its width. */
function leafGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  const n = (LEAF_N + 1) * 2;
  g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(n * 3), 3));
  const uv = new Float32Array(n * 2);
  for (let i = 0; i <= LEAF_N; i++) uv.set([i / LEAF_N, 1, i / LEAF_N, 0], i * 4);
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  const idx: number[] = [];
  for (let i = 0; i < LEAF_N; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
  }
  g.setIndex(idx);
  return g;
}
/** Lays the turning page at `phi` round the spine (BOOK_ANG: on the right
 *  page; π − BOOK_ANG: on the left), its free edge lagging by `curl`: a bend
 *  of constant curvature, so each column's place is exact. */
function bendLeaf(g: BufferGeometry, phi: number, curl: number) {
  const pos = g.attributes.position as BufferAttribute;
  const nor = g.attributes.normal as BufferAttribute;
  const end = PAGE_X0 + PAGE_W;
  const k = -curl / end;
  for (let i = 0; i <= LEAF_N; i++) {
    const a = PAGE_X0 + (PAGE_W * i) / LEAF_N;
    const th = phi + k * a;
    const x = Math.abs(k) < 1e-5 ? a * Math.cos(phi) : (Math.sin(th) - Math.sin(phi)) / k;
    const y = Math.abs(k) < 1e-5 ? a * Math.sin(phi) : (Math.cos(phi) - Math.cos(th)) / k;
    pos.setXYZ(i * 2, x, y, -PAGE_H / 2);
    pos.setXYZ(i * 2 + 1, x, y, PAGE_H / 2);
    nor.setXYZ(i * 2, -Math.sin(th), Math.cos(th), 0);
    nor.setXYZ(i * 2 + 1, -Math.sin(th), Math.cos(th), 0);
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  g.computeBoundingSphere();
}

/** Two spreads at a time, each on a canvas (its print, and its AR layer at
 *  AR_SCALE), with the print cut into the page halves the book shows: the
 *  left page, the right, and the left mirrored for the back of a turning page
 *  (which lands face down). They're drawn as they're needed, and drawn again
 *  once the page's typeface has loaded. */
function useSpreads() {
  return useMemo(() => {
    const canvas = (w: number, h: number) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    };
    const slots = [0, 1].map(() => {
      const printC = canvas(SPREAD_W, SPREAD_H);
      const arC = canvas(Math.round(SPREAD_W * AR_SCALE), Math.round(SPREAD_H * AR_SCALE));
      const print = new CanvasTexture(printC);
      print.colorSpace = SRGBColorSpace;
      print.anisotropy = 4;
      const ar = new CanvasTexture(arC);
      ar.colorSpace = SRGBColorSpace;
      const half = (repeat: number, offset: number) => {
        const t = print.clone();
        t.repeat.set(repeat, 1);
        t.offset.set(offset, 0);
        return t;
      };
      return { printC, arC, print, ar, left: half(0.5, 0), right: half(0.5, 0.5), back: half(-0.5, 0.5), spread: -1 };
    });
    const draw = (k: number, i: number) => {
      const sl = slots[k];
      const p = sl.printC.getContext('2d');
      const a = sl.arC.getContext('2d');
      if (!p || !a) return;
      drawSpread(p, i, 'print');
      a.setTransform(AR_SCALE, 0, 0, AR_SCALE, 0, 0);
      drawSpread(a, i, 'ar');
      // every one of them: a texture's upload is set off by its own version,
      // though the halves share the print's canvas and upload it once
      for (const t of [sl.print, sl.left, sl.right, sl.back, sl.ar]) t.needsUpdate = true;
      sl.spread = i;
    };
    /** The slot spread `i` is in, drawn into the one `keep` isn't in if need be. */
    const slot = (i: number, keep: number) => {
      const has = slots.findIndex((sl) => sl.spread === i);
      if (has >= 0) return slots[has];
      const k = slots[0].spread === keep ? 1 : 0;
      draw(k, i);
      return slots[k];
    };
    draw(0, 0);
    // the words are set in the site's own face: once it's in, set them again
    if (typeof document !== 'undefined' && document.fonts) {
      Promise.all(['400 32px "Space Grotesk"', '500 44px "Space Grotesk"', '600 36px "Space Grotesk"', '400 24px "Space Mono"'].map((f) => document.fonts.load(f)))
        .then(() => slots.forEach((sl, k) => sl.spread >= 0 && draw(k, sl.spread)))
        .catch(() => {});
    }
    return { slots, slot };
  }, []);
}

function BookHalf({ side, page, pageRef, lit, kit }: { side: -1 | 1; page: MeshStandardMaterial; pageRef: MutableRefObject<Mesh | null>; lit: LitLink; kit: BooksKit }) {
  const { accentDeep } = useAccent();
  const x = (side * BOOK_W) / 4;
  return (
    <>
      {/* the cover board, its outer corners rounded, and the page block on it
          (build_books.py: one half, mirrored for the other) */}
      <group scale={[side, 1, 1]}>
        <mesh geometry={kit.zw_board}>
          <meshStandardMaterial {...litMat(lit)} color={accentDeep} emissive={accentDeep} emissiveIntensity={0.16} roughness={0.5} />
        </mesh>
        <mesh geometry={kit.zw_block}>
          <meshStandardMaterial {...litMat(lit)} color={SURFACE.pale.color} emissive={SURFACE.pale.color} emissiveIntensity={0.32} roughness={0.85} />
        </mesh>
      </group>
      {/* the printed page on top of the block */}
      <mesh ref={pageRef} position={[x, PAGE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={page}>
        <planeGeometry args={[PAGE_W, PAGE_H]} />
      </mesh>
    </>
  );
}

type BookPhase = 'look' | 'found' | 'turn' | 'shut';
function OpenBook({ slug, position }: { slug: string; position: V3 }) {
  const { accent } = useAccent();
  const kit = useBooksKit();
  const { selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const close = useCloseUp(slug); // the lens follows the cursor
  const coarse = useMemo(isTouch, []); // …or, with none, finds Mouse by itself
  const grp = useRef<Group>(null);
  // lit on hover (lit.tsx): the boards, the page blocks and the spine — the
  // printed spread keeps its picture
  const lit = useLitLink(slug);
  const body = useLitBody(grp);
  const frontHinge = useRef<Group>(null); // the half that swings open
  const backHinge = useRef<Group>(null);
  const sel = useRef(0); // 0 = closed in the gap, 1 = lifted + open + facing you
  const book = useSpreads();
  const lens = useMemo<LensUniforms>(
    () => ({ uAr: { value: book.slots[0].ar }, uLens: { value: new Vector4(0.5, 0.5, LENS.r, 0) }, uLock: { value: 0 }, uRing: { value: new Color(PALETTE.room.accent) } }),
    [book],
  );
  const mats = useMemo(() => {
    const left = pageMaterial(lens);
    const right = pageMaterial(lens);
    const front = pageMaterial(null, FrontSide);
    const back = pageMaterial(null, BackSide);
    const set = (m: MeshStandardMaterial, t: Texture) => {
      m.map = t;
      m.emissiveMap = t;
    };
    set(left, book.slots[0].left);
    set(right, book.slots[0].right);
    set(front, book.slots[0].right);
    set(back, book.slots[0].back);
    return { left, right, front, back, set };
  }, [book, lens]);
  useEffect(() => () => Object.values(mats).forEach((m) => typeof m !== 'function' && m.dispose()), [mats]);
  const leafGeo = useMemo(leafGeometry, []);
  useEffect(() => () => leafGeo.dispose(), [leafGeo]);
  const leftPage = useRef<Mesh | null>(null);
  const rightPage = useRef<Mesh | null>(null);
  const leaf = useRef<Group>(null);
  // Mouse lifting off the page when found
  const icon = useMemo(() => {
    const t = new CanvasTexture(mouseIcon(256));
    t.colorSpace = SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => icon.dispose(), [icon]);
  const lift = useRef<Sprite>(null);
  const game = useMemo(
    () => ({ spread: 0, next: 0, phase: 'look' as BookPhase, t: 0, lock: 0, fade: 0, at: new Vector2(0.5, 0.5), from: new Vector2(0.45, 0.4), shut: 0, liftAt: new Vector3(), liftT: -1 }),
    [],
  );
  const ndc = useMemo(() => new Vector2(), []);
  const v = useMemo(() => new Vector3(), []);
  const showSpread = (i: number) => {
    const sl = book.slot(i, game.spread);
    mats.set(mats.left, sl.left);
    mats.set(mats.right, sl.right);
    lens.uAr.value = sl.ar;
  };
  useFrame((s, delta) => {
    body(lit.litU.value, selected || visited);
    sel.current += ((selected ? 1 : 0) - sel.current) * 0.09;
    const open = reduced ? (selected ? 1 : 0) : sel.current;
    const dt = Math.min(delta, 1 / 20);
    const g = grp.current;
    if (g) {
      // stands closed in the gap (cover out); lifts forward + tilts back so
      // the opening spread reads face-on. Closed, both halves fold onto the
      // hinge's +x side, so the rest pose shifts −x to centre that mass in
      // the gap and keep clear of the leaning neighbour.
      g.rotation.x = (Math.PI / 2) * (1 - open) + 1.12 * open;
      g.rotation.y = 0.17 * open; // squared up to the camera, which looks from a little to the right
      g.scale.setScalar(1 + BOOK_HELD * open); // held up to be read: bigger than it stood on the shelf
      g.position.set(position[0] - 0.04 + 0.01 * open, position[1] + 0.01 + 0.15 * open, position[2] + 0.02 + 0.34 * open);
    }

    // ---- the game ----
    const playing = selected && !reduced && open > 0.97;
    if (!selected && game.phase !== 'look') {
      // put down mid-way: it's on the next spread when it's opened again
      game.spread = game.next;
      showSpread(game.spread);
      Object.assign(game, { phase: 'look', t: 0, lock: 0, shut: 0, liftT: -1 });
    }
    game.t += dt;
    let lensOn = false;
    if (playing && game.phase === 'look') {
      const hide = hideUv(game.spread);
      if (close) {
        // where the cursor is on the open pages
        const pages = [leftPage.current, rightPage.current].filter((m): m is Mesh => !!m);
        if (cursorNdc(s.size, ndc) && pages.length) {
          s.raycaster.setFromCamera(ndc, s.camera);
          const hit = s.raycaster.intersectObjects(pages, false)[0];
          if (hit?.uv) {
            game.at.set((hit.object === rightPage.current ? 0.5 : 0) + hit.uv.x * 0.5, hit.uv.y);
            lensOn = true;
          }
        }
      } else if (coarse && game.t > AUTO.wait) {
        // no cursor: it comes out and glides over to where Mouse is
        const k = easeInOut((game.t - AUTO.wait) / AUTO.glide);
        game.at.set(game.from.x + (hide.u - game.from.x) * k, game.from.y + (hide.v - game.from.y) * k);
        lensOn = true;
      }
      // held on Mouse, the ring fills round; full, Mouse is found
      const d = Math.hypot((game.at.x - hide.u) * SPREAD_ASPECT, game.at.y - hide.v);
      const on = lensOn && d < hide.r * 1.1;
      game.lock = Math.max(0, Math.min(1, game.lock + (on ? dt / LENS.dwell : -dt / (LENS.dwell * 0.4))));
      if (game.lock >= 1) {
        game.phase = 'found';
        game.t = 0;
        game.lock = 0;
        game.next = (game.spread + 1) % SPREADS.length;
        play('book-find');
        // Mouse lifts off the page from where Mouse was
        const page = hide.u >= 0.5 ? rightPage.current : leftPage.current;
        if (page && g) {
          const pu = hide.u >= 0.5 ? (hide.u - 0.5) * 2 : hide.u * 2;
          page.localToWorld(v.set((pu - 0.5) * PAGE_W, (hide.v - 0.5) * PAGE_H, 0));
          g.worldToLocal(game.liftAt.copy(v));
          game.liftT = 0;
        }
        // the next spread, drawn now, while Mouse has everyone's attention
        book.slot(game.next, game.spread);
      }
    }
    // the lens fades in and out; the ring's fill follows the lock
    const f = 1 - Math.exp(-dt / (LENS.fade / 3));
    game.fade += ((lensOn ? 1 : 0) - game.fade) * f;
    lens.uLens.value.set(game.at.x, game.at.y, LENS.r, game.fade);
    lens.uLock.value = game.lock;

    if (game.phase === 'found' && game.t >= FOUND.hold) {
      game.t = 0;
      if (game.next === 0) {
        // the last spread: the book closes, and opens again on the first
        game.phase = 'shut';
        play('book-close');
      } else {
        // the right-hand page turns over onto the next spread: underneath it
        // the next spread's right page, on its back the next's left
        game.phase = 'turn';
        const from = book.slot(game.spread, game.next);
        const to = book.slot(game.next, game.spread);
        mats.set(mats.right, to.right);
        mats.set(mats.front, from.right);
        mats.set(mats.back, to.back);
        play('page-turn');
      }
    }
    const lf = leaf.current;
    if (lf) lf.visible = game.phase === 'turn';
    if (game.phase === 'turn') {
      const p = Math.min(1, game.t / TURN.len);
      bendLeaf(leafGeo, BOOK_ANG + (Math.PI - 2 * BOOK_ANG) * easeInOut(p), TURN.curl * Math.sin(Math.PI * p));
      if (p >= 1) {
        game.spread = game.next;
        showSpread(game.spread);
        Object.assign(game, { phase: 'look', t: 0, lock: 0 });
        game.from.set(0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4);
        if (lf) lf.visible = false;
      }
    }
    if (game.phase === 'shut') {
      const c = SHUT.close;
      const h = SHUT.close + SHUT.hold;
      if (game.t < c) game.shut = easeInOut(game.t / c);
      else if (game.t < h) {
        game.shut = 1;
        if (game.spread !== 0) {
          // shut: it's on the first spread when it opens
          game.spread = 0;
          showSpread(0);
        }
      } else game.shut = 1 - easeInOut((game.t - h) / SHUT.open);
      if (game.t >= h + SHUT.open) Object.assign(game, { phase: 'look', t: 0, lock: 0, shut: 0 });
    }
    // Mouse lifting off the page, up out of the book, and gone
    const sp = lift.current;
    if (sp) {
      sp.visible = game.liftT >= 0;
      if (game.liftT >= 0) {
        game.liftT += dt;
        const u = game.liftT / FOUND.lift;
        sp.position.copy(game.liftAt).add(v.set(0, 0.012 + 0.07 * easeOut(u), 0));
        sp.scale.setScalar(0.036 * easeOutBack(Math.min(1, u * 2.5), 2.4));
        const m = sp.material as SpriteMaterial;
        m.opacity = u < 0.6 ? 1 : Math.max(0, 1 - (u - 0.6) / 0.4);
        m.rotation = 0.25 * Math.sin(u * Math.PI * 3) * (1 - u);
        if (u >= 1) game.liftT = -1;
      }
    }

    // the front cover swings 180° round the spine, from folded-shut to the open
    // V, out through the front of the book (the side that faces the room: the
    // other way it opened through the back, into the shelf, and the book
    // looked as if it were opening inside out). Its hinge also drops level
    // with the back half as it opens. At the end of the story it swings shut
    // and open again (game.shut) while the book is still held up.
    const fo = open * (1 - game.shut);
    if (frontHinge.current) {
      frontHinge.current.rotation.z = -Math.PI * (1 - fo) - BOOK_ANG * fo; // -π: out through the front, toward the room
      frontHinge.current.position.y = (BOOK_T + BOOK_PT * 2 + 0.001) * (1 - fo);
    }
    if (backHinge.current) backHinge.current.rotation.z = BOOK_ANG * open;
  });
  return (
    <group ref={grp} position={position}>
      {/* back half — stays put, tilting into its side of the V */}
      <group ref={backHinge}>{kit && <BookHalf side={1} page={mats.right} pageRef={rightPage} lit={lit} kit={kit} />}</group>
      {/* front half — folded over when closed, swings open on select */}
      <group ref={frontHinge}>{kit && <BookHalf side={-1} page={mats.left} pageRef={leftPage} lit={lit} kit={kit} />}</group>
      {/* the page turning over, from the right-hand page to the left, round the
          spine at the pages' height; its face and its back are two materials */}
      <group ref={leaf} position={[0, PAGE_Y + 0.0012, 0]} visible={false}>
        <mesh geometry={leafGeo} material={mats.front} />
        <mesh geometry={leafGeo} material={mats.back} />
      </group>
      {/* spine */}
      <mesh position={[0, -0.001, 0]}>
        <boxGeometry args={[0.015, BOOK_T + 0.003, BOOK_H]} />
        <meshStandardMaterial {...litMat(lit)} color={accent} emissive={accent} emissiveIntensity={0.14} roughness={0.5} />
      </mesh>
      {/* Mouse, found, lifting off the page */}
      <sprite ref={lift} visible={false} renderOrder={3}>
        <spriteMaterial map={icon} transparent depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  );
}

/** A little mouse that lives behind the Zwijsen book. When the book is first
 *  picked up it hops out of the gap it leaves and drops to the floor, and from
 *  then on it has the run of the room, the way a mouse does: in dashes, off
 *  fast and braking hard, with stops to sniff and look round and a freeze now
 *  and then mid-run. Out along the front of the couch, past the chair to under
 *  the desk (up on its hind legs there for a look about), round behind the
 *  lamp, and into hiding behind the couch for a while; then a peek out past
 *  the couch's arm and round again. The route (`route`, set from where the
 *  couch, the desk and the lamp stand, in RoomRig) is the room's own frame,
 *  so the mouse lives outside the bookcase. */
const MOUSE = {
  dash: 1.0, // its top speed (room units a second)
  accel: 7, // how hard it sets off…
  brake: 5, // …and stops
  freeze: 0.35, // the chance a second of a freeze mid-run (when there's room for one)
  belly: 0.03, // its height off the floor
  rug: 1.05, // the rug's radius…
  rugTop: 0.022, // …and its height: the mouse steps up onto it
};
type MouseStop = { at: V3; wait?: number; rear?: boolean };
function RoomMouse({ gap, route }: { gap: { at: V3; out: V3 }; route: MouseStop[] }) {
  const { accent, accentPale } = useAccent();
  const { selected } = useActive('zwijsen-ar-books');
  const reduced = useReducedMotion();
  const ref = useRef<Group>(null);
  const head = useRef<Group>(null);
  // the route as one closed path through its points, and how far along it each is
  const path = useMemo(() => {
    const curve = new CatmullRomCurve3(
      route.map((r) => new Vector3(r.at[0], 0, r.at[2])),
      true,
      'centripetal',
    );
    const lengths = curve.getLengths(route.length * 60);
    const at = route.map((_, i) => lengths[i * 60]);
    const stops = route.map((r, i) => (r.wait ? i : -1)).filter((i) => i >= 0);
    return { curve, len: lengths[lengths.length - 1], at, stops };
  }, [route]);
  const st = useMemo(
    () => ({
      mode: 'hidden' as 'hidden' | 'arming' | 'hop' | 'enter' | 'run' | 'stop' | 'freeze',
      t: 0, // s in this mode
      wait: 0, // s left stopped
      s: 0, // how far round the route
      v: 0, // its speed
      stop: 0, // the stop it's making for (index into path.stops)
      from: new Vector3(), // the run in, from where it lands to the route
      to: new Vector3(),
      run: 0,
      yaw: 0,
      look: 0,
      lookTo: 0,
      lookT: 0,
      rear: 0,
      pos: new Vector3(),
      vel: new Vector3(),
    }),
    [],
  );
  const tan = useMemo(() => new Vector3(), []);
  const ground = (x: number, z: number) => MOUSE.belly + MOUSE.rugTop * Math.min(1, Math.max(0, (MOUSE.rug + 0.015 - Math.hypot(x, z)) / 0.03));
  // turns the shorter way round
  const turnTo = (a: number, b: number, k: number) => a + (Math.atan2(Math.sin(b - a), Math.cos(b - a)) * Math.min(1, k));

  useFrame((s, delta) => {
    const g = ref.current;
    if (!g) return;
    const dt = Math.min(delta, 1 / 30);
    const t = s.clock.elapsedTime;
    st.t += dt;
    const first = route[path.stops[0]].at;

    if (selected && st.mode === 'hidden') Object.assign(st, { mode: 'arming', t: 0 });
    if (st.mode === 'hidden') {
      g.visible = false;
      return;
    }
    g.visible = true;
    if (st.mode === 'arming' && st.t >= (reduced ? 0 : 0.35)) {
      // (let the book clear the shelf first)
      if (reduced) {
        // no hop and no running about: it sits by the couch
        st.pos.set(first[0], ground(first[0], first[2]), first[2]);
        Object.assign(st, { mode: 'stop', t: 0, wait: Infinity, yaw: 0.6 });
      } else {
        st.pos.set(gap.at[0], gap.at[1], gap.at[2]);
        st.vel.set(gap.out[0], gap.out[1], gap.out[2]);
        Object.assign(st, { mode: 'hop', t: 0 });
      }
    }
    let speed = 0;
    if (st.mode === 'hop') {
      st.vel.y -= 3.0 * dt; // gravity
      st.pos.addScaledVector(st.vel, dt);
      st.yaw = Math.atan2(st.vel.x, st.vel.z);
      const y0 = ground(st.pos.x, st.pos.z);
      if (st.pos.y <= y0) {
        // landed: a dash over to the route, at the stop nearest
        st.pos.y = y0;
        st.from.copy(st.pos);
        let near = 0;
        path.stops.forEach((i, k) => {
          const a = route[i].at;
          const b = route[path.stops[near]].at;
          if (Math.hypot(a[0] - st.pos.x, a[2] - st.pos.z) < Math.hypot(b[0] - st.pos.x, b[2] - st.pos.z)) near = k;
        });
        const a = route[path.stops[near]].at;
        st.to.set(a[0], 0, a[2]);
        Object.assign(st, { mode: 'enter', t: 0, run: 0, v: 0.3, stop: near });
      }
    }
    // the dash: off fast, braking to arrive on the mark
    const dash = (dist: number) => {
      const top = Math.min(MOUSE.dash, Math.sqrt(2 * MOUSE.brake * Math.max(0, dist)));
      st.v = Math.min(top, st.v + MOUSE.accel * dt);
      return st.v * dt;
    };
    if (st.mode === 'enter') {
      const len = Math.hypot(st.to.x - st.from.x, st.to.z - st.from.z);
      st.run = Math.min(len, st.run + dash(len - st.run));
      const k = st.run / Math.max(1e-6, len);
      st.pos.set(st.from.x + (st.to.x - st.from.x) * k, 0, st.from.z + (st.to.z - st.from.z) * k);
      st.yaw = turnTo(st.yaw, Math.atan2(st.to.x - st.from.x, st.to.z - st.from.z), dt * 14);
      speed = st.v;
      if (len - st.run < 0.002) {
        const i = path.stops[st.stop];
        Object.assign(st, { mode: 'stop', t: 0, s: path.at[i], wait: route[i].wait ?? 0.5, v: 0 });
      }
    }
    if (st.mode === 'run') {
      const target = path.at[path.stops[st.stop]];
      const dist = (target - st.s + path.len) % path.len;
      const step = dash(dist);
      st.s = (st.s + step) % path.len;
      speed = st.v;
      if (dist - step < 0.002) {
        const i = path.stops[st.stop];
        Object.assign(st, { mode: 'stop', t: 0, s: target, wait: route[i].wait ?? 0, v: 0 });
      } else if (dist > 0.3 && st.v > MOUSE.dash * 0.7 && Math.random() < MOUSE.freeze * dt) {
        // a freeze, mid-run: still as a stone, then off again
        Object.assign(st, { mode: 'freeze', t: 0, wait: 0.15 + Math.random() * 0.25, v: 0 });
      }
    }
    if (st.mode === 'run' || st.mode === 'stop' || st.mode === 'freeze') {
      const u = st.s / path.len;
      path.curve.getPointAt(u, st.pos);
      path.curve.getTangentAt(u, tan);
      if (st.mode === 'run') {
        // a little zig-zag as it goes, and its head turned along the way
        const side = Math.sin(st.s * 34) * 0.006 * (st.v / MOUSE.dash);
        st.pos.x += tan.z * side;
        st.pos.z -= tan.x * side;
        st.yaw = turnTo(st.yaw, Math.atan2(tan.x, tan.z), dt * 16);
      }
    }
    if ((st.mode === 'stop' || st.mode === 'freeze') && st.wait !== Infinity) {
      st.wait -= dt;
      if (st.wait <= 0) {
        if (st.mode === 'stop') st.stop = (st.stop + 1) % path.stops.length;
        Object.assign(st, { mode: 'run', t: 0 });
      }
    }

    // stopped: a look round in quick turns of the head, and at the desk up on
    // its hind legs for a while
    const still = st.mode === 'stop' && !reduced;
    if (still) {
      st.lookT -= dt;
      if (st.lookT <= 0) {
        st.lookTo = (Math.random() - 0.5) * 1.8;
        st.lookT = 0.25 + Math.random() * 0.5;
      }
    } else st.lookTo = 0;
    st.look += (st.lookTo - st.look) * Math.min(1, dt * 18);
    const rearing = still && route[path.stops[st.stop]]?.rear && st.t > 0.3 && st.wait > 0.35;
    st.rear += ((rearing ? 1 : 0) - st.rear) * Math.min(1, dt * 9);

    const run = Math.min(1, speed / MOUSE.dash);
    const y = st.mode === 'hop' ? st.pos.y : ground(st.pos.x, st.pos.z);
    g.position.set(st.pos.x, y + Math.abs(Math.sin(t * 32)) * 0.005 * run + 0.012 * st.rear, st.pos.z);
    g.rotation.y = st.yaw + st.look * (1 - st.rear * 0.5);
    g.rotation.x = st.mode === 'hop' ? Math.max(-0.5, Math.min(0.5, -st.vel.y * 0.3)) : 0.08 * run - 0.75 * st.rear;
    // stretched out as it runs
    g.scale.set(1 - 0.06 * run, 1 - 0.06 * run, 1 + 0.14 * run);
    // and sniffing whenever it's stopped
    if (head.current) head.current.rotation.x = still || st.mode === 'freeze' ? (st.mode === 'freeze' ? 0 : Math.sin(t * 26) * 0.08) : 0.05 * run;
  });

  const GREY = SURFACE.pale.color;
  const PINK = PALETTE.room.accentPale;
  return (
    <group ref={ref} visible={false}>
      <mesh scale={[0.024, 0.02, 0.034]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color={GREY} emissive={SURFACE.deep.color} emissiveIntensity={0.25} roughness={0.7} flatShading />
      </mesh>
      {/* the head, on its own so it can sniff */}
      <group ref={head} position={[0, 0.004, 0.022]}>
        <mesh position={[0, 0, 0.008]} scale={[0.015, 0.014, 0.018]}>
          <sphereGeometry args={[1, 12, 10]} />
          <meshStandardMaterial color={SURFACE.pale.color} emissive={SURFACE.deep.color} emissiveIntensity={0.25} roughness={0.7} flatShading />
        </mesh>
        {[-1, 1].map((sx, i) => (
          <mesh key={`ear${i}`} position={[sx * 0.011, 0.012, 0.004]}>
            <sphereGeometry args={[0.008, 10, 8]} />
            <meshStandardMaterial color={PINK} emissive={SURFACE.deep.color} emissiveIntensity={0.2} roughness={0.7} />
          </mesh>
        ))}
        {[-1, 1].map((sx, i) => (
          <mesh key={`eye${i}`} position={[sx * 0.007, 0.002, 0.02]}>
            <sphereGeometry args={[0.0035, 8, 8]} />
            <meshStandardMaterial color={accentPale} emissive={accent} emissiveIntensity={1.2} toneMapped={false} />
          </mesh>
        ))}
        <mesh position={[0, -0.003, 0.028]}>
          <sphereGeometry args={[0.004, 8, 8]} />
          <meshStandardMaterial color={accentPale} emissive={accentPale} emissiveIntensity={0.5} toneMapped={false} />
        </mesh>
      </group>
      <mesh position={[0, 0.007, -0.03]} rotation={[-0.5, 0, 0]}>
        <cylinderGeometry args={[0.0015, 0.003, 0.05, 6]} />
        <meshStandardMaterial color={PINK} roughness={0.7} />
      </mesh>
    </group>
  );
}

/* The shelved books: one hardcover from the kit (build_books.py, a typical
   5 × 17 × 17 cm book), placed at each book's own size — its covers in the
   book's value, its page block paper, the two bands across its spine in the
   opposite value — and merged into one mesh per tone. */
const KIT_BOOK: V3 = [0.05, 0.17, 0.17]; // the kit book's thickness, height, depth
function ShelvedBooks({ kit, link, mats }: { kit: BooksKit; link: LitLink; mats: { current: (MeshStandardMaterial | null)[] } }) {
  const books = useGeometry(() => {
    const tone: Record<Tint, BufferGeometry[]> = { glass: [], deep: [], pale: [] };
    const paper: BufferGeometry[] = [];
    const light: BufferGeometry[] = [];
    const dark: BufferGeometry[] = [];
    const add = (c: Tint, at: V3, rot: V3, size: V3) => {
      const sc: V3 = [size[0] / KIT_BOOK[0], size[1] / KIT_BOOK[1], size[2] / KIT_BOOK[2]];
      tone[c].push(place(kit.book_cover.clone(), at, rot, sc));
      paper.push(place(kit.book_pages.clone(), at, rot, sc));
      (c === 'pale' ? dark : light).push(place(kit.book_bands.clone(), at, rot, sc));
    };
    BOOKS.forEach((bk, i) => {
      const [w, h] = bk.s;
      const d = 0.15 + ((i * 37) % 5) * 0.01; // 15–19 cm deep, spines flush
      const top = SHELF_TOPS.reduce((a, b) => (Math.abs(b - (bk.p[1] - h / 2)) < Math.abs(a - (bk.p[1] - h / 2)) ? b : a));
      // a leaning book keeps its place; an upright one stands on the shelf
      add(bk.c, bk.r ? bk.p : [bk.p[0], top + h / 2, SPINE_Z - d / 2], bk.r ?? [0, 0, 0], [w, h, d]);
    });
    // the stack on the bottom shelf, lying down (spines still out), each a little askew
    const stack: [number, number, number, number, Tint][] = [
      [0.2, 0.03, 0.16, 0.02, 'deep'],
      [0.19, 0.028, 0.152, -0.05, 'glass'],
      [0.176, 0.026, 0.148, 0.07, 'pale'],
    ];
    let y = SHELF_TOPS[0];
    for (const [len, thick, d, yaw, c] of stack) {
      add(c, [0.19, y + thick / 2, 0.035], [0, yaw, Math.PI / 2], [thick, len, d]);
      y += thick;
    }
    return { glass: merge(tone.glass), deep: merge(tone.deep), pale: merge(tone.pale), paper: merge(paper), light: merge(light), dark: merge(dark) };
  }, [kit]);
  return (
    <>
      {(['glass', 'deep', 'pale'] as const).map((c, i) => (
        <mesh key={c} geometry={books[c]}>
          <meshStandardMaterial ref={(m) => (mats.current[i] = m)} {...litMat(link)} color={SURFACE[c].color} emissive={SURFACE[c].color} emissiveIntensity={0.1} roughness={0.6} />
        </mesh>
      ))}
      <mesh geometry={books.paper}>
        <meshStandardMaterial {...litMat(link)} color={SURFACE.pale.color} emissive={SURFACE.pale.color} emissiveIntensity={0.2} roughness={0.85} />
      </mesh>
      <mesh geometry={books.light}>
        <meshStandardMaterial {...litMat(link)} color={SURFACE.pale.color} emissive={SURFACE.pale.color} emissiveIntensity={0.16} roughness={0.5} />
      </mesh>
      <mesh geometry={books.dark}>
        <meshStandardMaterial {...litMat(link)} color={SURFACE.deep.color} emissive={SURFACE.deep.color} emissiveIntensity={0.12} roughness={0.5} />
      </mesh>
    </>
  );
}

/** The bookcase. Engaging the Zwijsen book "turns it on": the book spines glow,
 *  alongside the open spread lifting out to face the player.
 *
 *  Built like furniture: sides with a softened front edge, a top that
 *  overhangs as a cornice, a plinth set back as a toe kick, a thin back let
 *  into the frame, and shelves with a front lip. The books are hardcovers
 *  (ShelvedBooks): they sit ON their shelves, run to different depths with
 *  their spines lined up at the front, a couple lean, and a stack lies a
 *  little askew on the bottom shelf. The plant on top is a succulent in a
 *  turned pot. */
const SHELF_TOPS = [0.171, 0.431, 0.691];
const SPINE_Z = 0.13; // where the spines line up, a little behind the lip
function Bookcase({ position, rotation }: { position: V3; rotation: [number, number, number] }) {
  const { hovered, selected, visited } = useActive('zwijsen-ar-books');
  const kit = useBooksKit();
  const bookMats = useRef<(MeshStandardMaterial | null)[]>([]);
  const lit = useRef(0);
  // the hover light (lit.tsx) for the shelved books and the plant; the books
  // are the body — the frame's glass brings its own
  const link = useLitLink('zwijsen-ar-books');
  const shelved = useRef<Group>(null);
  const body = useLitBody(shelved);
  useFrame(() => {
    const t = hovered || selected ? 1 : visited ? 0.3 : 0;
    lit.current += (t - lit.current) * 0.1;
    const e = 0.1 + lit.current * 0.7;
    for (const m of bookMats.current) if (m) m.emissiveIntensity = e;
    body(link.litU.value, selected || visited);
  });
  const frame = useGeometry(() => {
    const parts: BufferGeometry[] = [];
    for (const sx of [-1, 1]) parts.push(place(softBox(0.028, 0.92, 0.27, 0.007), [sx * 0.356, 0.46, 0.035]));
    parts.push(place(softBox(0.776, 0.028, 0.292, 0.009), [0, 0.934, 0.036])); // the cornice
    parts.push(place(softBox(0.66, 0.045, 0.2, 0.004), [0, 0.0225, 0.01])); // toe kick
    parts.push(place(softBox(0.686, 0.025, 0.25, 0.004), [0, 0.057, 0.035]));
    parts.push(place(softBox(0.686, 0.9, 0.012, 0.003), [0, 0.47, -0.092]));
    for (const top of SHELF_TOPS) {
      parts.push(place(softBox(0.686, 0.022, 0.235, 0.004), [0, top - 0.011, 0.028]));
      parts.push(place(softBox(0.686, 0.03, 0.016, 0.005), [0, top - 0.014, 0.146])); // the lip
    }
    return merge(parts);
  });
  const plant = useGeometry(() => {
    const pot = lathe([[0, 0], [0.022, 0], [0.024, 0.004], [0.027, 0.03], [0.032, 0.035], [0.0325, 0.04], [0.0275, 0.039], [0.026, 0.034], [0, 0.032]], 24);
    const leaves: BufferGeometry[] = [];
    const leafShape = [[0, 0], [0.0075, 0.006], [0.0085, 0.017], [0.0045, 0.031], [0, 0.037]] as [number, number][];
    for (let i = 0; i < 13; i++) {
      const a = i * 2.39996; // the golden angle, like the real thing
      const ring = i / 13;
      const k = 1 - ring * 0.35; // the outer leaves are the older, smaller ones
      // flattened along the tilt, so the broad face turns up and out
      leaves.push(place(lathe(leafShape, 8), [0, 0.034, 0], [0, a, 0.25 + ring * 0.9], [0.55 * k, 1 - ring * 0.3, k]));
    }
    return { pot, leaves: merge(leaves) };
  });
  return (
    <group position={position} rotation={rotation}>
      <BlobShadow position={[0, 0.004, 0.04]} radius={0.52} aspect={0.55} opacity={0.4} />
      <group>
        <mesh geometry={frame}>
          <LiveGlassMat slug="zwijsen-ar-books" ghost={false} opacity={0.22} />
        </mesh>
        <group ref={shelved}>{kit && <ShelvedBooks kit={kit} link={link} mats={bookMats} />}</group>
        <group position={[0.25, 0.948, 0.05]}>
          <mesh geometry={plant.pot}>
            <GlassMat tint="deep" lit={link} />
          </mesh>
          <mesh geometry={plant.leaves}>
            <GlassMat tint="pale" lit={link} />
          </mesh>
        </group>
        <LifeGroup slug="zwijsen-ar-books">
          <OpenBook slug="zwijsen-ar-books" position={[0.12, 0.52, 0.04]} />
        </LifeGroup>
      </group>
    </group>
  );
}

/* ---------- the workstation ---------- */

/** The Virtuele Brigade desk and everything on it, in the desk's own frame.
 *
 *  A Scandinavian writing desk: a thin top with an eased edge, an apron with
 *  one drawer, and square legs that taper to the floor and splay a little.
 *  The top's surface is at 0.395, which the keyboard, mouse and cup sit on.
 *  The monitor is a current slim one from Blender (build_monitor.py): the
 *  picture almost to the edge in a thin bezel, a shallow housing on its back,
 *  on an L stand — a flat base plate and one upright leaning up to a hinge.
 *  Engaging it solidifies the desk, chair and plant with it (the life
 *  spreads). Everything structural stays behind the screen's plane
 *  (z -0.125), so nothing crosses the picture. */
function Desk({ brigade }: { brigade: LitLink }) {
  const g = useGeometry(() => {
    const wood: BufferGeometry[] = [];
    const trim: BufferGeometry[] = [];
    wood.push(place(softBox(0.95, 0.032, 0.46, 0.008), [0, 0.379, 0]));
    // apron: back and sides plain, the front carrying a drawer on the right
    wood.push(place(softBox(0.84, 0.045, 0.02, 0.004), [0, 0.34, -0.19]));
    for (const sx of [-1, 1]) wood.push(place(softBox(0.02, 0.045, 0.36, 0.004), [sx * 0.42, 0.34, 0]));
    wood.push(place(softBox(0.48, 0.045, 0.02, 0.004), [-0.18, 0.34, 0.19]));
    wood.push(place(softBox(0.34, 0.045, 0.018, 0.005, { bulge: 0.002 }), [0.25, 0.34, 0.194]));
    trim.push(place(softBox(0.1, 0.008, 0.008, 0.0035), [0.25, 0.34, 0.206]));
    // legs: 36 mm at the joint, 22 at the foot, splayed out
    for (const [lx, lz] of [[-0.42, -0.19], [0.42, -0.19], [-0.42, 0.19], [0.42, 0.19]]) {
      wood.push(hang(softBox(0.022, 0.365, 0.022, 0.006, { taper: 1.64 }), 0.365, [lx, 0.364, lz], [Math.sign(lz) * 0.05, 0, -Math.sign(lx) * 0.05]));
    }
    return { wood: merge(wood), trim: merge(trim) };
  });
  const mon = useMonitorKit();
  // what the scenario and the two in VR tell each other (scenario.tsx)
  const session = useRef(newSessionLink());
  return (
    <>
      <mesh geometry={g.wood}>
        <LiveGlassMat slug="virtuele-brigade" ghost={false} opacity={0.2} />
      </mesh>
      <mesh geometry={g.trim}>
        <LiveGlassMat slug="virtuele-brigade" ghost={false} tint="pale" />
      </mesh>
      <LifeGroup slug="virtuele-brigade">
        {mon && (
          <>
            <mesh geometry={mon.mon_panel}>
              <LiveGlassMat slug="virtuele-brigade" opacity={0.2} />
              <LiveEdges slug="virtuele-brigade" threshold={35} />
            </mesh>
            <mesh geometry={mon.mon_stand}>
              <LiveGlassMat slug="virtuele-brigade" tint="pale" />
            </mesh>
          </>
        )}
        {/* the picture, edge to edge in the panel's thin bezel (build_monitor.py) */}
        <RoomScreen slug="virtuele-brigade" position={[0, 0.63, -0.1255]} args={[0.542, 0.302, 0.002]} />
      </LifeGroup>
      {/* keyboard square in front of the monitor, mouse to its right; to its left
          the headset the project is for, put down facing the room with its strap
          trailing back, and the cup in the far corner, where an elbow won't knock it */}
      <Keyboard position={[-0.02, 0.403, 0.06]} rotation={[0, 0.04, 0]} />
      <Mouse position={[0.235, 0.408, 0.055]} rotation={[0, -0.12, 0]} />
      <CoffeeCup position={[-0.4, 0.395, -0.13]} rotation={[0, -2.2, 0]} lit={brigade} />
      <VRPlayers position={[-0.28, 0.395, 0.06]} rotation={[0, -0.35, 0]} link={session} />
      {/* with a cursor, you run the scenario they're in, from the editor */}
      <Scenario slug="virtuele-brigade" link={session} />
    </>
  );
}

/** The office chair, facing the desk: a five-star base whose spokes taper out
 *  to twin-wheel castors, a sleeved gas lift and a mechanism under the seat, a
 *  seat with a crowned top and a waterfall front, a back shell curved round
 *  the sitter and carried on a single spine, so daylight shows between seat
 *  and back, and T arms. */
function OfficeChair() {
  const g = useGeometry(() => {
    const soft: BufferGeometry[] = [];
    const frame: BufferGeometry[] = [];
    // base: hub, five tapered spokes dipping to their castors
    frame.push(place(lathe([[0, 0], [0.03, 0], [0.032, 0.015], [0.026, 0.034], [0, 0.034]], 20), [0, 0.03, 0]));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const spoke = place(softBox(0.03, 0.125, 0.02, 0.007, { taper: 0.62 }), [0, 0.0625, 0]); // along +y from the hub
      frame.push(place(place(spoke, [0, 0, 0], [Math.PI / 2 + 0.14, 0, 0]), [0, 0.05, 0], [0, -a, 0]));
      // castor: a stem, a hood and twin wheels, turned to trail
      const cx = Math.sin(-a) * 0.123;
      const cz = Math.cos(-a) * 0.123;
      frame.push(place(lathe([[0, 0], [0.0045, 0], [0.0045, 0.014], [0, 0.014]], 8), [cx, 0.024, cz]));
      for (const side of [-1, 1]) {
        frame.push(place(lathe([[0, -0.004], [0.0125, -0.004], [0.014, -0.002], [0.014, 0.002], [0.0125, 0.004], [0, 0.004]], 14), [cx + Math.cos(a) * side * 0.006, 0.014, cz + Math.sin(a) * side * 0.006], [0, -a, Math.PI / 2]));
      }
    }
    // gas lift: sleeve, piston, mechanism
    frame.push(place(lathe([[0, 0.05], [0.022, 0.05], [0.021, 0.15], [0.014, 0.152], [0.013, 0.2], [0, 0.2]], 16), [0, 0, 0]));
    frame.push(place(softBox(0.13, 0.028, 0.15, 0.008), [0, 0.2, -0.01]));
    // the seat: crowned, with a waterfall front
    soft.push(place(softBox(0.34, 0.058, 0.33, 0.024, { crown: 0.008, bulge: 0.012, mid: 5 }), [0, 0.242, 0.005]));
    // the spine: out from under the seat, round and up behind the back
    frame.push(tube([[0, 0.205, -0.06], [0, 0.206, -0.13], [0, 0.228, -0.168], [0, 0.3, -0.18], [0, 0.39, -0.174]], 0.011, 8, 32));
    // the back shell, curved round the sitter, with a lumbar swell
    soft.push(place(softBox(0.3, 0.28, 0.034, 0.018, { bend: 0.03, bulge: 0.01, mid: 5 }), [0, 0.45, -0.152], [-0.1, 0, 0]));
    // T arms: a post from under the seat, a padded rest
    for (const sx of [-1, 1]) {
      frame.push(place(softBox(0.022, 0.13, 0.034, 0.008), [sx * 0.175, 0.29, -0.04]));
      frame.push(place(softBox(0.08, 0.018, 0.034, 0.008), [sx * 0.14, 0.205, -0.04]));
      soft.push(place(softBox(0.045, 0.022, 0.17, 0.01, { crown: 0.003 }), [sx * 0.175, 0.362, -0.025]));
    }
    return { soft: merge(soft), frame: merge(frame) };
  });
  return (
    <>
      <mesh geometry={g.soft}>
        <LiveGlassMat slug="virtuele-brigade" ghost={false} opacity={0.2} />
      </mesh>
      <mesh geometry={g.frame}>
        <LiveGlassMat slug="virtuele-brigade" ghost={false} tint="pale" />
      </mesh>
    </>
  );
}

/* ---------- the couch ---------- */

// A mid-century two-seater, 0.92 × 0.44, its seat cushions' flat top at
// 0.197 — the phone, its balls (COUCH_SEAT_Y) and the popcore hotspot are
// all placed against that. The arms rise from the floor line as their own
// padded pieces, the base sits between them on splayed, tapered legs, the
// seat cushions have a crowned top and a rounded front, the back cushions
// recline against a full-width back, a welt of piping runs round every
// cushion — the detail that says "upholstered" at a glance, and at rest it
// draws the seams into the ghost sketch. It used to be built with one corner radius on every part, which is
// what made it read as inflated blocks: here it is tight on the frame and
// soft on everything you would sit on.
const COUCH_SEAT: { w: number; h: number; d: number; r: number; o: Soft } = { w: 0.369, h: 0.066, d: 0.4, r: 0.026, o: { crown: 0.007, bulge: 0.006, mid: 5 } };
const COUCH_BACK: { w: number; h: number; d: number; r: number; o: Soft } = { w: 0.366, h: 0.2, d: 0.085, r: 0.04, o: { crown: 0.004, bulge: 0.013, mid: 4 } };
function Couch() {
  const g = useGeometry(() => {
    const body: BufferGeometry[] = [];
    const welt: BufferGeometry[] = [];
    const wood: BufferGeometry[] = [];
    // base between the arms, and a full-width back the cushions lean on
    body.push(place(softBox(0.75, 0.06, 0.44, 0.012), [0, 0.105, 0]));
    body.push(place(softBox(0.92, 0.255, 0.07, 0.02, { crown: 0.004 }), [0, 0.2025, -0.185]));
    // padded arms from the base line up, a touch wider at the top
    for (const sx of [-1, 1]) body.push(place(softBox(0.085, 0.187, 0.44, 0.03, { crown: 0.006, taper: 1.04, bulge: 0.004, mid: 3 }), [sx * 0.4175, 0.1685, 0]));
    // seat cushions: flat top at 0.197, crowned ~6 mm where the phone lies
    const S = COUCH_SEAT;
    for (const sx of [-1, 1]) {
      const at: [number, number, number] = [sx * 0.1885, 0.164, 0.02];
      body.push(place(softBox(S.w, S.h, S.d, S.r, S.o), at));
      welt.push(place(tube(softSeam(S.w, S.h, S.d, S.r, S.o, 'top'), 0.003, 5, 72, true), at));
    }
    // back cushions, reclined against the back, each set a hair differently
    const B = COUCH_BACK;
    for (const [sx, yaw] of [[-1, 0.025], [1, -0.018]] as const) {
      const at: [number, number, number] = [sx * 0.1875, 0.294, -0.1];
      const rot: [number, number, number] = [-0.19, yaw, 0];
      body.push(place(softBox(B.w, B.h, B.d, B.r, B.o), at, rot));
      welt.push(place(tube(softSeam(B.w, B.h, B.d, B.r, B.o, 'front'), 0.003, 5, 72, true), at, rot));
    }
    // splayed, tapered legs with a ferrule at the foot
    const leg = [[0, -0.08], [0.0095, -0.08], [0.0095, -0.069], [0.0086, -0.068], [0.0155, 0], [0, 0]] as [number, number][];
    for (const [lx, lz] of [[-0.4, 0.17], [0.4, 0.17], [-0.4, -0.17], [0.4, -0.17]]) {
      wood.push(place(lathe(leg, 12), [lx, 0.078, lz], [Math.sign(lz) * 0.12, 0, -Math.sign(lx) * 0.12]));
    }
    return { body: merge(body), welt: merge(welt), wood: merge(wood) };
  });
  return (
    <group>
      <mesh geometry={g.body}>
        <LiveGlassMat slug="popcore-games" ghost={false} opacity={0.2} />
      </mesh>
      <mesh geometry={g.welt}>
        <LiveGlassMat slug="popcore-games" ghost={false} tint="pale" />
      </mesh>
      <mesh geometry={g.wood}>
        <LiveGlassMat slug="popcore-games" ghost={false} tint="deep" opacity={0.26} />
      </mesh>
    </group>
  );
}

export function RoomRig() {
  const { accent } = useAccent();
  const brigade = useLitLink('virtuele-brigade'); // the coffee's light (lit.tsx)
  // placeable by eye from the dev tools in `npm run dev` (dev/tuning.ts).
  // The four exhibits run on a diagonal from the front-left to the back-right
  // — desk, table, couch, shelf — so from the overview each stands in its own
  // column and the names on the marker line keep apart (the table and the
  // couch used to stand one behind the other, their names running together).
  // Move one and its anchor in scene/framing.ts HOTSPOTS has to follow.
  const desk = usePlacement('Room.Desk', { position: [-1.0, 0, 0.18], rotationY: 1.76 });
  const couch = usePlacement('Room.Couch', { position: [0.12, 0, -0.42], rotationY: -0.16 });
  const table = usePlacement('Room.AR table', { position: [0, 0, 0.68] });
  const shelf = usePlacement('Room.Bookcase', { position: [0.9, 0, -1.0], rotationY: -0.27 });
  const plant = usePlacement('Room.Plant', { position: [-1.15, 0, -0.95] });
  const lamp = usePlacement('Room.Floor lamp', { position: [-0.5, 0, -0.6] });
  // the shelf mouse's run of the room (RoomMouse), from where the furniture
  // stands: a point in a piece's own frame, on the floor in the room's
  const mouse = useMemo(() => {
    const at = (p: { position: V3; rotationY?: number }, x: number, z: number): V3 => {
      const c = Math.cos(p.rotationY ?? 0);
      const s = Math.sin(p.rotationY ?? 0);
      return [p.position[0] + x * c + z * s, 0, p.position[2] - x * s + z * c];
    };
    const l = lamp.position;
    const route: MouseStop[] = [
      { at: at(couch, 0.48, 0.33), wait: 0.9 }, // the couch's front corner: a sniff
      { at: at(couch, 0.0, 0.34), wait: 0.3 }, // a stop half way along its front
      { at: at(couch, -0.55, 0.3) }, // its other corner
      { at: at(desk, -0.29, 0.23) }, // past the chair…
      { at: at(desk, -0.18, -0.32), wait: 1.8, rear: true }, // …and under the desk: up on its hind legs
      { at: at(desk, 0.26, -0.15) }, // out the desk's far end
      { at: [l[0] - 0.45, 0, l[2] + 0.18] }, // round behind the lamp
      { at: [l[0] - 0.25, 0, l[2] - 0.2] },
      { at: [l[0] + 0.25, 0, l[2] - 0.26] },
      { at: at(couch, 0, -0.36), wait: 3.2 }, // behind the couch: hiding
      { at: at(couch, 0.58, -0.26), wait: 0.6 }, // a peek out past its arm…
      { at: at(couch, 0.76, 0.0) }, // …and round the outside of Popcore's bin (BIN)
      { at: at(couch, 0.7, 0.26) },
    ];
    // the gap the book leaves on the shelf, and the hop out of it
    const g = at(shelf, 0.12, 0.04);
    const c = Math.cos(shelf.rotationY ?? 0);
    const s = Math.sin(shelf.rotationY ?? 0);
    const gap = { at: [g[0], 0.52, g[2]] as V3, out: [0.05 * c + 0.55 * s, 0.72, -0.05 * s + 0.55 * c] as V3 };
    return { route, gap };
  }, [couch, desk, lamp, shelf]);
  return (
    <group>
      {/* round rug centred on the scene — lined up with the chip die below it.
          GROUND, not SURFACE: it's a marking on the sheet, the same substance
          as the city's roads one layer up, so the two floors match. */}
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[1.05, 1.05, 0.02, 56]} />
        <GroundMat />
        {/* the hover light's shadows, printed on the rug (lit.tsx) */}
        <ShadowPrint />
      </mesh>
      <Line points={circlePts(1.05)} position={[0, 0.024, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.2} />
      <Line points={circlePts(0.78)} position={[0, 0.026, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.1} />

      {/* workstation (desk + monitor + chair) — on the left, angled toward the
          centre, the plant in the corner behind it; the monitor flickers on
          hover. Engaging the monitor solidifies the desk, chair + plant with it
          (the life spreads). */}
      <group position={desk.position} rotation={[0, desk.rotationY, 0]}>
        <BlobShadow position={[0, 0.004, -0.16]} radius={0.6} aspect={0.72} opacity={0.38} />
        <group position={[0, 0, -0.3]}>
          <Desk brigade={brigade} />
        </group>
        {/* the chair in front of the desk, facing the monitor */}
        <group position={[0, 0, 0.05]} rotation={[0, Math.PI, 0]}>
          <OfficeChair />
        </group>
      </group>

      {/* bookcase (back-right) — engaging the Zwijsen book lights its spine +
          lifts the open book out of its gap */}
      <Bookcase position={shelf.position} rotation={[0, shelf.rotationY, 0]} />
      {/* …and out of that gap the mouse that lives behind the book, which has
          the run of the room from then on */}
      <RoomMouse gap={mouse.gap} route={mouse.route} />

      {/* couch + phone — faces the coffee table / room front (+z). Opening the
          phone solidifies the couch it sits on. */}
      <group position={couch.position} rotation={[0, couch.rotationY, 0]}>
        <BlobShadow position={[0, 0.004, -0.02]} radius={0.6} aspect={0.58} opacity={0.4} />

        <Couch />

        {/* The phone. This is what the couch is here FOR — the popcore hotspot
            anchors to it, and a couch with nothing on it gives the marker
            nothing to point at. It lands face down on the right-hand cushion,
            whose top is at about 0.203 there, crown included: its centre half
            its thickness above that, and a hair more for the screen. */}
        <LifeGroup slug="popcore-games">
          <Phone slug="popcore-games" position={[0.12, 0.2075, 0.06]} liveColor={accent} />
        </LifeGroup>
      </group>

      {/* coffee table with AR racing (Lightship Drive), directly in front of the couch */}
      <LifeGroup slug="lightship-drive">
        <CoffeeTableAR position={table.position} hoverSlug="lightship-drive" />
      </LifeGroup>

      {/* the plant and the lamp fill the back-left, which stood empty; the
          plant belongs to the workstation corner, so it wakes with the monitor */}
      <PottedPlant position={plant.position} liveSlug="virtuele-brigade" />
      <FloorLamp position={lamp.position} />
    </group>
  );
}

