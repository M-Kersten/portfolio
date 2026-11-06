// ARCam's game, in the park (city.tsx Park). ARCam dropped characters into a
// show floor through a viewfinder, for a photo with them. Here the park has
// seven creatures of its own, each made out of one of the projects (modelled
// in Blender: scripts/models/build_creatures.py). In the close-up they turn up
// one at a time, anywhere on the lawn, and don't keep still: Orbitot orbits,
// Pinboo drifts off its own dot on the map, Cameleon creeps about with its
// camouflage coming and going, Moletage tunnels from molehill to molehill,
// Driftnot drags its anchor along in the wind, Chatterkeet hops and flies,
// Jerboost bounds. A ping where one's about to turn up, then a few seconds
// before it's gone again (fewer, the more of them you've caught). Point at it
// and the viewer swings to it, and a ring round it fills while you keep on it
// (it stays while you do); then the shutter goes. Captured, a bubble over it
// says so, and it's part of the model from then on: frosted like the rest of
// it, still going about its business. All seven, and the viewer takes a
// picture of each in turn, then one of them all, and the print rises out of
// it; a while later the park lets them go and it starts again. Desktop only (a
// cursor to point with): phones and reduced motion keep the viewer's own
// sweep (city.tsx Binoculars).
//
// The one out is a mark (shared.tsx): the layer's accent, by value. The ones
// caught are the model's own stock, also by value; their own colours only
// ever show as light and dark.
import { useContext, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { AdditiveBlending, CanvasTexture, Color, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, Plane, Quaternion, RingGeometry, SRGBColorSpace, Vector3, type BufferGeometry, type Group, type Mesh } from 'three';
import { play } from '../../lib/sound';
import { bump, easeIn, easeInOut, easeOut, easeOutBack } from '../../lib/ease';
import { cursorAtDepth, useCloseUp } from './closeup';
import { useCreatureKit } from './kit';
import { glassRim } from './materials';
import { PresenceCtx } from './presence';
import { useLitLink, type LitLink } from './lit';
import { NEUTRAL, SURFACE, SURFACE_AWAKE, SURFACE_GLOW, useAccent, type V3 } from './shared';
import { useGeometry } from './shapes';

/** Where the viewer stands in the park, and which way it faces (its lenses
 *  look down its −z). Park frame; the Park places the viewer from this too. */
export const VIEWER = { pos: [-0.1, 0, 0.34] as V3, yaw: -0.35 };

/** The pines along the park's far edge (park frame): where each stands, its
 *  height and its turn. The Park plants them from this; the creatures keep
 *  clear of them, and of the far side of them, which the close-up can't see. */
export const PINES: { pos: V3; h: number; yaw: number }[] = [
  { pos: [0.17, 0, -0.37], h: 0.46, yaw: 0.4 },
  { pos: [0.33, 0, -0.25], h: 0.34, yaw: 2.1 },
  { pos: [-0.22, 0, -0.24], h: 0.4, yaw: 1.2 },
  { pos: [0.43, 0, -0.07], h: 0.3, yaw: 3.6 },
  { pos: [-0.04, 0, -0.42], h: 0.36, yaw: 5.1 },
];

/** What the viewer and the creatures tell each other, frame to frame (plain
 *  mutable data). The creatures set `want`, a heading in the viewer's own frame
 *  to swing to (null: it aims where you point, or sweeps), and `shoot` to press
 *  the shutter (2: the group photo, a bigger flash). The viewer counts each
 *  time its shutter goes in `fired`, and says where its head points (`yaw`)
 *  and whether it's aiming rather than sweeping. */
export const SAFARI = { want: null as number | null, shoot: 0, fired: 0, yaw: 0, aiming: false };

/** A spot's heading from the viewer, in its frame: what its head turns to. */
export function bearing(x: number, z: number) {
  const dx = x - VIEWER.pos[0];
  const dz = z - VIEWER.pos[2];
  const c = Math.cos(VIEWER.yaw);
  const s = Math.sin(VIEWER.yaw);
  return Math.atan2(-(dx * c - dz * s), -(dx * s + dz * c));
}

const GROUND = 0.024; // the park's lawn (its plot's top, a hair over)
const TELL = 0.6; // s the ping where one's about to turn up
const UP = [3.8, 2.4]; // s one stays out: with none caught yet, and with all but one (in step between)
const GAP = [0.8, 1.6]; // s from one going to the next ping (at random within)
// the cursor within `reach` of it (or of its own size, if that's more), the
// viewer within `tol` rad of it: held `hold` s, the shot
const LOCK = { reach: 0.04, tol: 0.25, hold: 0.45 };
// all of them caught: a beat, the viewer's roll call (a picture of each, `each`
// s apart), a pose, the group photo, and the print, up for `print` s
const FINALE = { wait: 1.4, each: 0.62, pose: 0.8, print: 6 };
const SAID = 2.4; // s the bubble says one's been captured
const CALM = 0.55; // how briskly the caught ones go about, against the one that's out
const MOLE_RIM = 0.012; // the molehill's rim: what of the mole is lower than this is down the hole

/** The lawn they have: on the plot, clear of its rim, the pines (and what's
 *  behind them), the viewer, and, except for the ones that fly, the lake. */
const PARK_R = 0.4;
const LAKE = { x: -0.11, z: 0.17, rx: 0.21, rz: 0.19 }; // its reach (city.tsx Park draws it), and a margin
function lawn(x: number, z: number, fly = false) {
  if (Math.hypot(x, z) > PARK_R) return false;
  if (PINES.some((p) => Math.hypot(x - p.pos[0], z - p.pos[2]) < p.h * 0.36 + 0.025)) return false;
  if (Math.hypot(x - VIEWER.pos[0], z - VIEWER.pos[2]) < 0.07) return false;
  return fly || Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) > 1;
}
/** Room for something this wide here, and a clear run to it from (fx, fz). */
function clear(x: number, z: number, r: number, fly: boolean, fx = x, fz = z) {
  for (let k = 0; k <= 4; k++) if (!lawn(fx + ((x - fx) * k) / 4, fz + ((z - fz) * k) / 4, fly)) return false;
  return [0, 1, 2, 3].every((k) => lawn(x + r * Math.cos((k * Math.PI) / 2), z + r * Math.sin((k * Math.PI) / 2), fly));
}

type Id = 'orbitot' | 'pinboo' | 'cameleon' | 'moletage' | 'driftnot' | 'chatterkeet' | 'jerboost';
type Prop = 'pinboo_dot' | 'moletage_hill' | 'driftnot_anchor' | 'jerboost_ramp';
/** Each creature: its name, whether it flies (it can go over the lake), which
 *  way it turns (`you`: the side it was posed to show, `view` off facing the
 *  camera; `way`: where it's going), the prop it brings, and how light its
 *  two marks are on the group photo's print. */
const CREATURES: { id: Id; name: string; view: number; fly?: boolean; turn: 'you' | 'way'; prop?: Prop; tone: [number, number] }[] = [
  { id: 'orbitot', name: 'Orbitot', view: 0.25, fly: true, turn: 'you', tone: [0.9, 0.55] }, // Sol.AR: a little Saturn
  { id: 'pinboo', name: 'Pinboo', view: 0.3, turn: 'you', prop: 'pinboo_dot', tone: [0.6, 1] }, // location AR: never on its own dot
  { id: 'cameleon', name: 'Cameleon', view: 0.9, turn: 'way', tone: [0.55, 0.85] }, // ARCam: lenses for eyes
  { id: 'moletage', name: 'Moletage', view: 0.35, turn: 'you', prop: 'moletage_hill', tone: [0.25, 0.75] }, // Amsterdam Underground
  { id: 'driftnot', name: 'Driftnot', view: 0.2, turn: 'you', prop: 'driftnot_anchor', tone: [1, 0.45] }, // the AR framework's cloud anchors
  { id: 'chatterkeet', name: 'Chatterkeet', view: 0.7, turn: 'way', tone: [0.6, 0.3] }, // the Amsterdam AI guides
  { id: 'jerboost', name: 'Jerboost', view: 1.15, turn: 'way', prop: 'jerboost_ramp', tone: [0.8, 0.95] }, // Lightship Drive's crown
];

/** How a creature's body sits, frame to frame, on top of where it is on the
 *  lawn: an offset (in its own frame, facing +X), a turn and a roll, a size
 *  (about its middle), how much of it shows (its camouflage, pixel by pixel)
 *  and how solid it is. */
interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  roll: number;
  scale: number;
  show: number;
  fade: number;
}
const rest = (p: Pose) => Object.assign(p, { x: 0, y: 0, z: 0, yaw: 0, roll: 0, scale: 1, show: 1, fade: 1 });
/** Each one's own way of turning up (`enter`, over `in` s) and of going
 *  (`leave`, over `out` s). `top` is how tall it is. */
interface Moves {
  in: number;
  out: number;
  enter(p: Pose, t: number, top: number): void;
  leave(p: Pose, t: number, top: number): void;
}
const MOVES: Record<Id, Moves> = {
  // pops into being, spinning, and spins away to nothing
  orbitot: {
    in: 0.5,
    out: 0.45,
    enter: (p, t) => {
      p.scale = easeOutBack(t, 2);
      p.yaw = (1 - t) * 4;
      p.fade = Math.min(1, t / 0.3);
    },
    leave: (p, t) => {
      p.scale = 1 - easeIn(t);
      p.yaw = t * 4;
      p.y = 0.02 * t;
    },
  },
  // dropped onto the map from above, onto its dot, with a bounce; gone like a ghost
  pinboo: {
    in: 0.75,
    out: 0.45,
    enter: (p, t) => {
      const f = Math.min(1, t / 0.6);
      p.y = t < 0.6 ? 0.09 * (1 - f * f) : 0.007 * bump((t - 0.6) / 0.4);
      p.fade = Math.min(1, t / 0.25);
    },
    leave: (p, t) => {
      p.y = 0.025 * t;
      p.roll = 0.3 * t;
      p.fade = 1 - t;
    },
  },
  // there all along: its camouflage comes off, pixel by pixel, and goes back on
  cameleon: {
    in: 0.7,
    out: 0.6,
    enter: (p, t) => {
      p.show = easeOut(t);
    },
    leave: (p, t) => {
      p.show = 1 - easeIn(t);
    },
  },
  // up out of its molehill with a bounce, and back down it
  moletage: {
    in: 0.4,
    out: 0.28,
    enter: (p, t, top) => {
      p.y = -top * (1 - easeOutBack(t, 1.8));
    },
    leave: (p, t, top) => {
      p.y = -top * easeIn(t);
    },
  },
  // puffs up over its anchor, and puffs away
  driftnot: {
    in: 0.5,
    out: 0.45,
    enter: (p, t) => {
      p.scale = easeOutBack(t, 2.4);
      p.fade = Math.min(1, t / 0.3);
    },
    leave: (p, t) => {
      p.scale = 1 - easeIn(t);
      p.y = 0.02 * t;
      p.fade = 1 - easeIn(t);
    },
  },
  // flies in from behind and lands, and flies off ahead
  chatterkeet: {
    in: 0.55,
    out: 0.5,
    enter: (p, t) => {
      const e = easeOut(t);
      p.x = -0.07 * (1 - e);
      p.y = 0.07 * (1 - e) * (1 - e) + 0.02 * bump(e);
      p.roll = 0.4 * (1 - t) * Math.sin(t * 18);
      p.fade = Math.min(1, t / 0.3);
    },
    leave: (p, t) => {
      const e = easeIn(t);
      p.x = 0.08 * e;
      p.y = 0.09 * e;
      p.roll = 0.3 * Math.sin(t * 16);
      p.fade = 1 - easeIn(t, 3);
    },
  },
  // jumps off its ramp, and away in one long leap
  jerboost: {
    in: 0.5,
    out: 0.5,
    enter: (p, t) => {
      p.x = -0.035 * (1 - t);
      p.y = 0.12 * t * (1 - t);
      p.fade = Math.min(1, t / 0.25);
    },
    leave: (p, t) => {
      p.x = 0.09 * t;
      p.y = 0.16 * t * (1 - t);
      p.fade = 1 - easeIn(t, 2);
    },
  },
};

// home: not out; tell: the ping where it's about to turn up; in: turning up;
// up: out and about; out: going
type Phase = 'home' | 'tell' | 'in' | 'up' | 'out';
interface Creature {
  g: Group | null; // where it is on the lawn, turned
  body: Group | null; // the creature itself, and what it's doing
  prop: Group | null; // its prop (the dot, the molehill, the ramp; the anchor goes with it)
  prop2: Group | null; // the molehill it's just left
  bubble: Group | null; // the parakeet's speech bubble, kept turned to you
  phase: Phase;
  at: number; // when the phase began (or begins: a reset staggers their going)
  left: number; // s it has left out, counting down while you're not holding it
  caught: boolean;
  caughtAt: number;
  cheerAt: number; // its picture taken in the roll call
  real: number; // 0 the accent's mark, 1 the model's stock (eased)
  seed: number;
  x: number; // where it is on the lawn (park frame)
  z: number;
  yaw: number; // its turn
  head: number; // which way it's going (rad, park frame, from +x toward +z)
  hx: number; // where it's making for
  hz: number;
  vx: number; // the wind it drifts on
  vz: number;
  stage: number; // its own comings and goings: a hop, a flight, a dive
  stageAt: number;
  stageLen: number;
  fx: number; // where this leg began
  fz: number;
  ox: number; // the centre it circles; the dot it drifts off
  oz: number;
  th: number; // round its circle
  px: number; // its prop: where, its turn, when it came, when it goes
  pz: number;
  pyaw: number;
  pAt: number;
  pOut: number;
  qx: number; // the molehill it left, and when
  qz: number;
  qAt: number;
  hide: boolean; // down the hole: nothing to photograph
}

const _pq = new Quaternion();
const _cam = new Vector3();
const _aim = new Vector3();
const _up = new Vector3();
const _pt = new Vector3();
const _v = new Vector3();
const _p: Pose = rest({} as Pose);
const _q: Pose = rest({} as Pose);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** A ring's light: the accent, added onto what's under it. */
function glowMat(color: string) {
  const m = new MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide });
  m.userData.lifeSkip = true;
  return m;
}

type CreatureMat = MeshStandardMaterial & { userData: { real: { value: number }; show: { value: number } } };
/** A creature's look (and its prop's), in the model's own material language
 *  (materials.tsx: the glass's rim, its halftone, the park's hover light).
 *  Out and not yet photographed, it's a mark: the accent, from its deep to its
 *  pale value. Photographed (`real` 0 → 1), it's the model's stock, from the
 *  deep cut to the pale one. Either way its own colours only say which: light
 *  or dark (their alpha still lights a part up, in the accent). `show` below 1
 *  drops pixels of it, in a fixed scatter: the chameleon's camouflage. */
function creatureMat(pal: { accent: string; accentPale: string; accentDeep: string }, lit: LitLink): CreatureMat {
  const m = new MeshStandardMaterial({ vertexColors: true, color: '#ffffff', roughness: 0.34, metalness: 0, transparent: true, emissive: SURFACE_GLOW, emissiveIntensity: 0.14, depthWrite: false });
  const real = { value: 0 };
  const show = { value: 1 };
  // three values each: the darks (eyes, a collar), the body, the light parts
  const tones = {
    uArLo: { value: new Color(pal.accentDeep) },
    uArMid: { value: new Color(pal.accent) },
    uArHi: { value: new Color(pal.accentPale) },
    uStLo: { value: new Color(SURFACE.deep.color) },
    uStMid: { value: new Color(SURFACE.glass.color) },
    uStHi: { value: new Color(NEUTRAL) },
    uMark: { value: new Color(pal.accent) },
  };
  Object.assign(m.userData, { lifeSkip: true, presenceOwn: true, real, show }, lit);
  m.onBeforeCompile = function (this: unknown, sh) {
    glassRim.call(this, sh);
    Object.assign(sh.uniforms, tones, { uReal: real, uShow: show });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCrPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvCrPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uReal;\nuniform float uShow;\nuniform vec3 uArLo, uArMid, uArHi, uStLo, uStMid, uStHi, uMark;\nvarying vec3 vCrPos;')
      .replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\n\tif ( uShow < 0.999 && fract( sin( dot( floor( vCrPos / 0.0035 ), vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ) > uShow ) discard;',
      )
      .replace(
        '#include <color_fragment>',
        [
          '#ifdef USE_COLOR_ALPHA',
          '\tfloat crV = smoothstep( 0.05, 0.85, sqrt( dot( vColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ) );',
          '\tfloat crA = smoothstep( 0.0, 0.25, crV ), crB = smoothstep( 0.25, 1.0, crV );',
          '\tvec3 crAr = mix( mix( uArLo, uArMid, crA ), uArHi, crB );',
          '\tvec3 crSt = mix( mix( uStLo, uStMid, crA ), uStHi, crB );',
          '\tdiffuseColor.rgb *= mix( crAr, crSt, uReal );',
          '\tvec3 crLift = diffuseColor.rgb;', // what it gives off of its own, below
          '#endif',
        ].join('\n'),
      )
      // lit a little from within, the light parts most (it's small, against a
      // dark lawn); its glowing parts in the accent
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR_ALPHA\n\ttotalEmissiveRadiance += crLift * 0.3 + uMark * vColor.a * mix( 0.7, 0.3, uReal );\n#endif');
  };
  return m as CreatureMat;
}

/** The group photo as it comes out: a duotone in the accent, the lawn, and the
 *  seven of them in two rows, each a blob or two at its own values. */
const PHOTO_ROWS: Id[][] = [
  ['driftnot', 'moletage', 'orbitot', 'pinboo'],
  ['cameleon', 'chatterkeet', 'jerboost'],
];
function groupPhoto(pal: { accentPale: string; accentDeep: string }): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const lo = new Color(pal.accentDeep).multiplyScalar(0.35);
  const hi = new Color(pal.accentPale);
  const tone = (v: number) => '#' + new Color().lerpColors(lo, hi, v).getHexString();
  const sky = g.createLinearGradient(0, 0, 0, 128);
  sky.addColorStop(0, tone(0.32));
  sky.addColorStop(1, tone(0.16));
  g.fillStyle = sky;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = tone(0.1);
  g.fillRect(0, 70, 128, 58);
  const blob = (x: number, y: number, rx: number, ry: number, col: string) => {
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  };
  PHOTO_ROWS.forEach((row, r) => {
    const back = r === 0;
    const k = back ? 0.8 : 1;
    const y = back ? 66 : 98;
    row.forEach((id, n) => {
      const x = (back ? 22 : 36) + n * 28;
      const [va, vb] = CREATURES.find((d) => d.id === id)!.tone;
      const a = tone(va);
      const b = tone(vb);
      switch (id) {
        case 'orbitot':
          blob(x, y - 12 * k, 7 * k, 2 * k, b);
          blob(x, y - 12 * k, 5 * k, 5 * k, a);
          break;
        case 'pinboo':
          blob(x, y - 13 * k, 5 * k, 5 * k, a);
          blob(x, y - 7 * k, 2.4 * k, 4 * k, a);
          blob(x, y - 13 * k, 2.2 * k, 2.2 * k, b);
          break;
        case 'cameleon':
          blob(x, y - 6 * k, 7 * k, 4 * k, a);
          blob(x + 6 * k, y - 8 * k, 3 * k, 3 * k, b);
          break;
        case 'moletage':
          blob(x, y - 9 * k, 5 * k, 8 * k, a);
          blob(x, y - 6 * k, 5.2 * k, 3 * k, b);
          break;
        case 'driftnot':
          blob(x, y - 18 * k, 7 * k, 4 * k, a);
          g.fillStyle = b;
          g.fillRect(x - 0.6 * k, y - 15 * k, 1.2 * k, 14 * k);
          blob(x, y - 1.5 * k, 3 * k, 1.6 * k, b);
          break;
        case 'chatterkeet':
          blob(x, y - 6 * k, 3.6 * k, 5 * k, a);
          blob(x - 5 * k, y - 3 * k, 4 * k, 1.2 * k, b);
          break;
        case 'jerboost':
          blob(x, y - 10 * k, 4.5 * k, 3.6 * k, a);
          blob(x - 2 * k, y - 16 * k, 1.4 * k, 4 * k, a);
          blob(x + 2 * k, y - 16 * k, 1.4 * k, 4 * k, a);
          blob(x, y - 14 * k, 1.6 * k, 1.2 * k, b);
          break;
      }
    });
  });
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function ParkCritters({ slug }: { slug: string }) {
  const pal = useAccent();
  const { accent } = pal;
  const close = useCloseUp(slug);
  const presence = useContext(PresenceCtx); // a layer that isn't the subject recedes
  const lit = useLitLink(slug); // and the park's hover light falls on them too
  const gl = useThree((s) => s.gl);
  // the ones that come up out of the ground: what's below it is cut away
  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);
  const accentC = useMemo(() => new Color(accent), [accent]);
  const glowC = useMemo(() => new Color(SURFACE_GLOW), []);
  // the models arrive the first time the close-up is opened
  const kit = useCreatureKit(close);
  // each one's middle (what you aim at, in its own frame), its top (where the
  // bubble goes, and how far down the ones that come up from under start), its
  // reach on the ground (its prop's, if that's wider: the rings go round both),
  // how near the cursor has to be, and where its props sit
  const size = useMemo(() => {
    if (!kit) return null;
    const box = (g: BufferGeometry) => {
      g.computeBoundingBox();
      return g.boundingBox!;
    };
    return CREATURES.map((d) => {
      const b = box(kit[d.id]);
      const pb = d.prop ? box(kit[d.prop]) : null;
      const flat = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2;
      const half = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) / 2;
      return {
        c: b.getCenter(new Vector3()),
        top: b.max.y,
        foot: Math.max(0.022, flat, pb && d.id !== 'jerboost' ? (Math.max(pb.max.x - pb.min.x, pb.max.z - pb.min.z) / 2) * 1.05 : 0),
        reach: Math.max(LOCK.reach, half * 0.8),
        // the dot and the molehill sit centred where they're put down
        propAt: pb ? pb.getCenter(new Vector3()).setY(0) : new Vector3(),
        // the cloud sways from the foot of its chain, the top of its anchor
        pivot: pb && d.id === 'driftnot' ? new Vector3((pb.min.x + pb.max.x) / 2, pb.max.y, (pb.min.z + pb.max.z) / 2) : new Vector3(),
      };
    });
  }, [kit]);
  const mats = useMemo(
    () =>
      CREATURES.map(() => {
        const clip = new Plane();
        const body = creatureMat(pal, lit);
        body.clippingPlanes = [clip];
        return { body, prop: creatureMat(pal, lit), clip };
      }),
    [pal, lit],
  );
  useEffect(
    () => () =>
      mats.forEach((m) => {
        m.body.dispose();
        m.prop.dispose();
      }),
    [mats],
  );
  const crs = useMemo<Creature[]>(
    () =>
      CREATURES.map((_, i) => ({
        g: null,
        body: null,
        prop: null,
        prop2: null,
        bubble: null,
        phase: 'home',
        at: -99,
        left: 0,
        caught: false,
        caughtAt: -99,
        cheerAt: -99,
        real: 0,
        seed: i * 1.7,
        x: 0,
        z: 0,
        yaw: 0,
        head: 0,
        hx: 0,
        hz: 0,
        vx: 0,
        vz: 0,
        stage: 0,
        stageAt: 0,
        stageLen: 1,
        fx: 0,
        fz: 0,
        ox: 0,
        oz: 0,
        th: 0,
        px: 0,
        pz: 0,
        pyaw: 0,
        pAt: -99,
        pOut: -1,
        qx: 0,
        qz: 0,
        qAt: -99,
        hide: false,
      })),
    [],
  );
  const frame = useRef<Group>(null); // the park's frame, to find the cursor in
  const clock = useRef(0);
  // who's out (or −1), when the next one comes, where the last turned up, the
  // lock's build-up, the shot asked for and on whom, the bubble's creature and
  // when, and the finale's stage
  const game = useRef({ out: -1, next: 0, last: -1, lx: 9, lz: 9, lock: 0, focus: 0, pending: -1, seen: 0, wasClose: false, said: -1, saidAt: -99, finale: 'none' as 'none' | 'roll' | 'pose' | 'shot' | 'print', finAt: 0, order: [] as number[], rolled: -1, printAt: -99 });
  // the rings: the ping where one's about to turn up, the AR anchor under the
  // one out, the lock filling round it, a burst as it's caught
  const ping = useRef<Mesh>(null);
  const anchor = useRef<Mesh>(null);
  const lockRing = useRef<Mesh>(null);
  const burst = useRef<Mesh>(null);
  const burstAt = useRef({ t: -99, x: 0, z: 0, r: 0.03 });
  const ringGeo = useGeometry(() => new RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2));
  const LOCK_SEGS = 48;
  const lockGeo = useGeometry(() => new RingGeometry(0.62, 0.8, LOCK_SEGS, 1, Math.PI / 2, Math.PI * 2).rotateX(-Math.PI / 2));
  const rings = useMemo(() => ({ ping: glowMat(accent), anchor: glowMat(accent), lock: glowMat(accent), burst: glowMat(accent) }), [accent]);
  useEffect(() => () => Object.values(rings).forEach((m) => m.dispose()), [rings]);
  // the bubble that says one's been captured
  const said = useRef<Group>(null);
  const saidEl = useRef<HTMLSpanElement>(null);
  const saidName = useRef<HTMLElement>(null);
  // the print the group photo comes out as
  const print = useRef<Group>(null);
  const printMats = useMemo(() => {
    const paper = new MeshBasicMaterial({ color: SURFACE.pale.color, transparent: true, opacity: 0, toneMapped: false, side: DoubleSide });
    const photo = new MeshBasicMaterial({ map: groupPhoto(pal), transparent: true, opacity: 0, toneMapped: false, side: DoubleSide });
    paper.userData.lifeSkip = true;
    photo.userData.lifeSkip = true;
    return { paper, photo };
  }, [pal]);
  useEffect(
    () => () => {
      printMats.photo.map?.dispose();
      Object.values(printMats).forEach((m) => m.dispose());
    },
    [printMats],
  );
  const cursor = useMemo(() => new Vector3(), []);

  useFrame((s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const now = (clock.current += dt);
    const G = game.current;
    const fr = frame.current;
    if (!size || !fr) return;
    // opening the close-up: someone turns up soon
    if (close && !G.wasClose) G.next = Math.max(G.next, now + 1.4);
    G.wasClose = close;
    const caughtN = crs.filter((a) => a.caught).length;
    const out = (b: Creature) => b.phase !== 'home';
    // somewhere for creature i to go: [near, far] from (fx, fz), with room for
    // it and a clear run there, and not on top of anyone else
    const somewhere = (i: number, fx: number, fz: number, near: number, far: number): [number, number] | null => {
      const d = CREATURES[i];
      for (let k = 0; k < 24; k++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = near + Math.random() * (far - near);
        const x = fx + Math.cos(ang) * dist;
        const z = fz + Math.sin(ang) * dist;
        if (!clear(x, z, 0.02, !!d.fly, fx, fz)) continue;
        if (crs.some((b, j) => j !== i && out(b) && Math.hypot(b.x - x, b.z - z) < 0.07)) continue;
        return [x, z];
      }
      return null;
    };

    // --- someone turns up, now and then, while you're here to see it ---
    if (close && G.finale === 'none' && G.out < 0 && now > G.next) {
      const free = crs.map((_, i) => i).filter((i) => !crs[i].caught && crs[i].phase === 'home');
      const fresh = free.filter((i) => i !== G.last);
      const from = fresh.length ? fresh : free;
      const i = from[Math.floor(Math.random() * from.length)];
      // a spot on the lawn with room for it, away from where the last one was and from everyone out
      let spot: [number, number] | null = null;
      for (let k = 0; i !== undefined && k < 40 && !spot; k++) {
        const x = (Math.random() * 2 - 1) * PARK_R;
        const z = (Math.random() * 2 - 1) * PARK_R;
        if (clear(x, z, size[i].foot, !!CREATURES[i].fly) && Math.hypot(x - G.lx, z - G.lz) > 0.15 && crs.every((b) => !out(b) || Math.hypot(b.x - x, b.z - z) > 0.12)) spot = [x, z];
      }
      if (i !== undefined && spot) {
        const a = crs[i];
        const d = CREATURES[i];
        [a.x, a.z] = spot;
        [G.lx, G.lz] = spot;
        // its first heading: the side it was posed to show, to the camera
        fr.worldToLocal(s.camera.getWorldPosition(_cam));
        const you = d.view - Math.atan2(_cam.z - a.z, _cam.x - a.x);
        a.yaw = you;
        a.head = -you;
        a.phase = 'tell';
        a.at = now;
        a.stage = 0;
        a.stageAt = now;
        a.stageLen = 1.1 + Math.random() * 0.6; // the mole's first look round, the parakeet's first hops
        a.hide = false;
        a.ox = a.x;
        a.oz = a.z;
        a.hx = a.x;
        a.hz = a.z;
        a.vx = 0;
        a.vz = 0;
        a.th = 0;
        if (d.id === 'orbitot') a.ox -= 0.05; // it circles a spot beside where it turns up
        // its prop comes first: the dot, the molehill, the ramp, the anchor dropping in
        a.px = a.x;
        a.pz = a.z;
        a.pyaw = a.yaw;
        a.pAt = now;
        a.pOut = -1;
        a.qAt = -99;
        G.out = i;
        G.last = i;
        play('critter-peek', { volume: 0.45 });
      } else G.next = now + 0.5;
    }

    // --- each one: the ping, turning up, out and about, going ---
    crs.forEach((a, i) => {
      const u = now - a.at;
      const d = CREATURES[i];
      const mv = MOVES[d.id];
      const gone = () => {
        if (G.out !== i) return;
        G.out = -1;
        G.lock = 0;
        if (G.pending === i) G.pending = -1;
        G.next = now + GAP[0] + Math.random() * (GAP[1] - GAP[0]);
      };
      const leave = (sound: boolean) => {
        a.phase = 'out';
        a.at = now;
        if (a.pOut < 0 || a.pOut > now) a.pOut = now + mv.out; // its prop goes once it has (if it hasn't)
        if (G.pending === i) G.pending = -1;
        if (sound) play('critter-away', { volume: 0.4 });
      };
      if (a.phase === 'tell' && !close) {
        a.phase = 'home';
        gone();
      } else if (a.phase === 'tell' && u > TELL) {
        a.phase = 'in';
        a.at = now;
        play('critter-in', { volume: 0.5 });
      } else if (a.phase === 'in' && u > mv.in) {
        a.phase = 'up';
        a.at = now;
        a.stageAt = now;
        a.left = UP[0] + (UP[1] - UP[0]) * Math.min(1, caughtN / (CREATURES.length - 1));
        if (d.id === 'jerboost') a.pOut = now + 1.4; // its ramp's done with
      } else if ((a.phase === 'in' || a.phase === 'up') && !a.caught && G.out === i) {
        // its time runs out, except while you're holding it in the viewer
        if (a.phase === 'up' && G.lock <= 0 && G.pending !== i) a.left -= dt;
        if ((a.phase === 'up' && a.left <= 0) || !close) leave(close);
      } else if (a.phase === 'out' && u > mv.out) {
        a.phase = 'home';
        a.at = now;
        gone();
      }
    });

    // --- out and about: each its own way, the caught ones calmer ---
    fr.worldToLocal(s.camera.getWorldPosition(_cam));
    crs.forEach((a, i) => {
      if (a.phase !== 'up') return;
      const d = CREATURES[i];
      const pace = a.caught ? CALM : 1;
      const t = now - a.stageAt;
      // make for (hx, hz) at speed v; true once there
      const go = (v: number) => {
        const dx = a.hx - a.x;
        const dz = a.hz - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.004) return true;
        const k = Math.min(dist, v * dt) / dist;
        a.x += dx * k;
        a.z += dz * k;
        a.head = Math.atan2(dz, dx);
        return false;
      };
      const next = (s: number, len: number) => {
        a.stage = s;
        a.stageAt = now;
        a.stageLen = len;
      };
      switch (d.id) {
        case 'orbitot': {
          // round and round a spot that wanders off over the park, the lake too
          a.th += dt * 1.2 * pace;
          const dx = a.hx - a.ox;
          const dz = a.hz - a.oz;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.005) {
            const to = somewhere(i, a.ox, a.oz, 0.1, 0.22);
            if (to && [0, 1, 2, 3].every((k) => lawn(to[0] + 0.06 * Math.cos(k * 1.57), to[1] + 0.06 * Math.sin(k * 1.57), true))) [a.hx, a.hz] = to;
          } else {
            const k = Math.min(dist, 0.03 * pace * dt) / dist;
            a.ox += dx * k;
            a.oz += dz * k;
          }
          a.x = a.ox + 0.05 * Math.cos(a.th);
          a.z = a.oz + 0.05 * Math.sin(a.th);
          break;
        }
        case 'pinboo':
          // drifting off its dot, a wobble at a time, and wandering back towards it
          if (a.stage === 0 && go(0.036 * pace)) next(1, 0.3 + Math.random() * 0.5);
          else if (a.stage === 1 && t > a.stageLen) {
            const to = somewhere(i, a.ox, a.oz, 0.04, 0.12);
            if (to) [a.hx, a.hz] = to;
            next(0, 0);
          }
          break;
        case 'cameleon':
          // a slow creep somewhere near, a stop to look about, on again
          if (a.stage === 0 && go(0.028 * pace)) next(1, 0.6 + Math.random() * 0.6);
          else if (a.stage === 1 && t > a.stageLen) {
            const to = somewhere(i, a.x, a.z, 0.07, 0.15);
            if (to) [a.hx, a.hz] = to;
            next(0, 0);
          }
          break;
        case 'moletage':
          // up a moment, down the hole, along under the lawn, up out of a new molehill
          if (a.stage === 0 && t > a.stageLen) next(1, 0.28);
          else if (a.stage === 1 && t > a.stageLen) {
            a.hide = true;
            const to = somewhere(i, a.x, a.z, 0.1, 0.17);
            [a.hx, a.hz] = to ?? [a.x, a.z];
            // it leaves its molehill behind, and the new one pushes up
            a.qx = a.px;
            a.qz = a.pz;
            a.qAt = now;
            a.px = a.hx;
            a.pz = a.hz;
            a.pyaw = a.yaw;
            a.pAt = now + 0.15;
            next(2, 0.45);
          } else if (a.stage === 2 && t > a.stageLen) {
            a.x = a.hx;
            a.z = a.hz;
            a.hide = false;
            next(3, 0.35);
          } else if (a.stage === 3 && t > a.stageLen) next(0, (1 + Math.random() * 0.6) / pace);
          break;
        case 'driftnot': {
          // the wind drags it along, anchor and all; near an edge, the wind turns
          if (Math.hypot(a.vx, a.vz) < 1e-4 || !lawn(a.x + a.vx * 3, a.z + a.vz * 3) || !clear(a.x + a.vx * 3, a.z + a.vz * 3, size[i].foot * 0.6, false)) {
            const to = somewhere(i, a.x, a.z, 0.12, 0.22);
            if (to) {
              const dx = to[0] - a.x;
              const dz = to[1] - a.z;
              const n = Math.hypot(dx, dz);
              a.vx = (dx / n) * 0.02;
              a.vz = (dz / n) * 0.02;
            } else {
              a.vx = 0;
              a.vz = 0;
            }
          }
          a.x += a.vx * dt * pace;
          a.z += a.vz * dt * pace;
          break;
        }
        case 'chatterkeet':
          // a few hops about on the grass, then off it flies to somewhere else
          if (a.stage === 0) {
            if (go(0.03 * pace) && t > a.stageLen) {
              const to = somewhere(i, a.x, a.z, 0.14, 0.26);
              if (to) {
                a.fx = a.x;
                a.fz = a.z;
                [a.hx, a.hz] = to;
                a.head = Math.atan2(a.hz - a.z, a.hx - a.x);
                next(1, 0.8 / pace);
              } else next(0, 1);
            } else if (Math.hypot(a.hx - a.x, a.hz - a.z) < 0.004) {
              const to = somewhere(i, a.x, a.z, 0.03, 0.06);
              if (to) [a.hx, a.hz] = to;
            }
          } else if (a.stage === 1) {
            const k = Math.min(1, t / a.stageLen);
            const e = easeInOut(k);
            a.x = a.fx + (a.hx - a.fx) * e;
            a.z = a.fz + (a.hz - a.fz) * e;
            if (k >= 1) next(0, 1.2 + Math.random());
          }
          break;
        case 'jerboost': {
          // bounding: a hop at a time, each a little off the line of the last,
          // away from anything it would land in
          const len = 0.42 / pace;
          if (a.stage === 0 || t > len + 0.1) {
            a.fx = a.x;
            a.fz = a.z;
            let ok = false;
            for (const turn of [(Math.random() - 0.5) * 0.9, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1, Math.PI]) {
              const h = a.head + turn;
              const x = a.x + Math.cos(h) * 0.055 * pace;
              const z = a.z + Math.sin(h) * 0.055 * pace;
              if (clear(x, z, 0.02, false, a.x, a.z) && crs.every((b, j) => j === i || !out(b) || Math.hypot(b.x - x, b.z - z) > 0.07)) {
                a.head = h;
                a.hx = x;
                a.hz = z;
                ok = true;
                break;
              }
            }
            if (!ok) {
              a.hx = a.x;
              a.hz = a.z;
            }
            next(1, len);
          } else {
            const k = Math.min(1, t / len);
            a.x = a.fx + (a.hx - a.fx) * k;
            a.z = a.fz + (a.hz - a.fz) * k;
          }
          break;
        }
      }
    });

    // --- the one out: point at it and the viewer locks on; hold, and it's photographed ---
    SAFARI.want = null;
    const oi = G.out;
    const o = oi >= 0 ? crs[oi] : null;
    let near = false;
    const live = !!o && !!o.body && (o.phase === 'in' || o.phase === 'up') && !o.caught && !o.hide;
    // where a creature's middle is now, in the park's frame
    const middle = (i: number, to: Vector3) => {
      const b = crs[i].body!;
      b.updateWorldMatrix(true, false);
      return fr.worldToLocal(b.localToWorld(to.copy(size[i].c)));
    };
    if (o && live) {
      // and the cursor at its depth, so the ones up in the air are aimed at, not the lawn under them
      middle(oi, _aim);
      near = close && !!cursorAtDepth(s, fr, _aim, cursor) && cursor.distanceTo(_aim) < size[oi].reach;
      const head = bearing(_aim.x, _aim.z);
      if (near || G.pending === oi) SAFARI.want = head;
      if (G.pending !== oi) G.lock = near ? Math.min(LOCK.hold, G.lock + dt) : Math.max(0, G.lock - dt * 2);
      if (G.lock >= LOCK.hold && G.pending < 0 && SAFARI.aiming && Math.abs(SAFARI.yaw - head) < LOCK.tol) {
        G.pending = oi;
        G.seen = SAFARI.fired;
        SAFARI.shoot = 1;
      }
    } else if (G.pending < 0) G.lock = Math.max(0, G.lock - dt * 2);
    // pointed at, its ring opens out round it and brightens (the viewer's found it)
    G.focus += ((near ? 1 : 0) - G.focus) * (1 - Math.exp(-dt * 8));
    // the shutter went on it: captured, and part of the model from now on
    if (G.pending >= 0 && G.finale === 'none' && SAFARI.fired > G.seen) {
      const i = G.pending;
      const a = crs[i];
      a.caught = true;
      a.caughtAt = now;
      burstAt.current = { t: now, x: _aim.x, z: _aim.z, r: size[i].foot };
      play('critter-snap', { volume: 0.7 });
      // and over it, its name
      const el = saidEl.current;
      if (el && saidName.current) {
        saidName.current.textContent = CREATURES[i].name;
        el.removeAttribute('data-on');
        void el.offsetWidth; // start its animation over
        el.setAttribute('data-on', '');
        G.said = i;
        G.saidAt = now;
      }
      G.pending = -1;
      G.out = -1;
      G.lock = 0;
      G.next = now + Math.max(GAP[1], 1.6);
      if (crs.every((b) => b.caught)) {
        G.finale = 'roll';
        G.finAt = now + Math.max(FINALE.wait, SAID);
        G.rolled = -1;
        // round them in the order the viewer sees them, left to right
        G.order = crs.map((_, j) => j).sort((p, q) => bearing(crs[q].x, crs[q].z) - bearing(crs[p].x, crs[p].z));
      }
    }

    // --- all seven: a picture of each, wherever it's got to, then of them all, and the print ---
    if (G.finale === 'roll' && now > G.finAt) {
      const k = Math.floor((now - G.finAt) / FINALE.each);
      if (k < G.order.length) {
        const j = G.order[k];
        SAFARI.want = bearing(crs[j].x, crs[j].z);
        // the viewer's had a moment to find it: the shutter, and it does a little hop
        if (k > G.rolled && now - G.finAt - k * FINALE.each > FINALE.each * 0.55) {
          G.rolled = k;
          SAFARI.shoot = 1;
          crs[j].cheerAt = now;
          play('critter-snap', { volume: 0.35 });
        }
      } else {
        G.finale = 'pose';
        G.finAt = now;
      }
    }
    if (G.finale === 'pose' || G.finale === 'shot') {
      // the middle of them all
      SAFARI.want = bearing(crs.reduce((m, a) => m + a.x, 0) / crs.length, crs.reduce((m, a) => m + a.z, 0) / crs.length);
      if (G.finale === 'pose' && now - G.finAt > FINALE.pose) {
        G.finale = 'shot';
        G.seen = SAFARI.fired;
        SAFARI.shoot = 2;
      } else if (G.finale === 'shot' && SAFARI.fired > G.seen) {
        G.finale = 'print';
        G.printAt = now;
        play('critter-group', { volume: 0.8 });
        crs.forEach((a) => (a.cheerAt = now));
      }
    }
    if (G.finale === 'print' && now - G.printAt > FINALE.print) {
      // and the park lets them go, one after another, and it starts over
      crs.forEach((a, k) => {
        a.caught = false;
        if (a.phase !== 'home') {
          a.phase = 'out';
          a.at = now + k * 0.15;
          if (a.pOut < 0 || a.pOut > now) a.pOut = a.at + MOVES[CREATURES[k].id].out;
        }
      });
      G.finale = 'none';
      G.next = now + 3.5;
    }

    // --- how each one looks and moves ---
    _up.set(0, 1, 0).transformDirection(fr.matrixWorld);
    const pres = presence.current;
    crs.forEach((a, i) => {
      const g = a.g;
      const body = a.body;
      const d = CREATURES[i];
      const m = mats[i];
      const sz = size[i];
      if (!g || !body) return;
      const u = now - a.at;
      const shown = a.phase !== 'home';
      g.visible = shown;
      a.real += ((a.caught ? 1 : 0) - a.real) * (1 - Math.exp(-dt * 4));
      // its props: put down as it turns up, gone after it
      const propK = (from: number, dur: number) => (a.pOut >= 0 && now > a.pOut ? Math.max(0, 1 - easeIn((now - a.pOut) / 0.45)) : easeOutBack(Math.min(1, Math.max(0, (now - from) / dur)), 1.6));
      const pr = a.prop;
      if (pr) {
        const k = shown ? propK(a.pAt, d.id === 'moletage' ? 0.35 : 0.3) : 0;
        if (d.id === 'driftnot') {
          // the anchor drops in from above, and digs in
          const fall = Math.min(1, Math.max(0, (now - a.pAt) / 0.45));
          pr.position.set(0, 0.07 * (1 - easeIn(fall)) - (a.pOut >= 0 && now > a.pOut ? 0.03 * easeIn((now - a.pOut) / 0.45) : 0), 0);
          pr.scale.setScalar(shown ? (a.pOut >= 0 && now > a.pOut ? k : 1) : 0);
        } else {
          pr.position.set(a.px, GROUND, a.pz);
          pr.rotation.y = a.pyaw;
          if (d.id === 'moletage') pr.scale.set(1, Math.max(0.0001, k), 1);
          else pr.scale.setScalar(Math.max(0.0001, k));
        }
        pr.visible = shown && k > 0.002;
      }
      const p2 = a.prop2;
      if (p2) {
        const k = Math.max(0, 1 - easeIn((now - a.qAt) / 0.6));
        p2.visible = shown && k > 0.002;
        p2.position.set(a.qx, GROUND, a.qz);
        p2.scale.set(1, Math.max(0.0001, k), 1);
      }
      if (!shown) return;
      // where it is, and which way it's turned: to show you its side, or the way it's going
      g.position.set(a.x, GROUND, a.z);
      const you = d.view - Math.atan2(_cam.z - a.z, _cam.x - a.x);
      const want = d.turn === 'you' ? you : -a.head;
      a.yaw += wrap(want - a.yaw) * (1 - Math.exp(-dt * 7));
      g.rotation.y = a.yaw;
      // the creature itself: turning up, out and about, or going
      const mv = MOVES[d.id];
      const k = a.phase === 'in' ? Math.min(1, u / mv.in) : a.phase === 'out' ? Math.min(1, Math.max(0, u) / mv.out) : 1;
      rest(_p);
      rest(_q);
      body.visible = a.phase !== 'tell' && !(a.hide && a.phase === 'up');
      const T = now + a.seed * 3;
      const busy = (1 - 0.4 * a.real) * (a.phase === 'in' ? k : a.phase === 'out' ? 1 - k : 1);
      const st = now - a.stageAt;
      switch (d.id) {
        case 'orbitot': // bobbing, turning on its axis to and fro
          _p.y = 0.004 * Math.sin(T * 1.5);
          _p.yaw = 0.35 * Math.sin(T * 0.45) * busy;
          break;
        case 'pinboo': // a wobble as it drifts, never quite steady
          _p.y = 0.004 * Math.sin(T * 2);
          _p.z = 0.006 * Math.sin(T * 2.1) * busy;
          _p.roll = 0.08 * Math.sin(T * 1.3) * busy;
          break;
        case 'cameleon': // a look about when it stops; its camouflage coming and going
          if (a.stage === 1) _p.yaw = 0.3 * Math.sin(st * 2.2) * busy;
          _p.show = 1 - (a.caught ? 0.4 : 0.7) * bump((T % 2.6) / 1.1) * busy; // fading most of the way out, a second in every few
          break;
        case 'moletage':
          if (a.phase === 'up') {
            if (a.stage === 0) _p.yaw = 0.25 * Math.sin(st * 2.4) * busy;
            else if (a.stage === 1) _p.y = -sz.top * easeIn(st / 0.28);
            else if (a.stage === 2) _p.y = -sz.top;
            else _p.y = -sz.top * (1 - easeOutBack(Math.min(1, st / 0.35), 1.8));
          }
          break;
        case 'driftnot': // swaying on its chain in the wind
          _p.yaw = 0.25 * Math.sin(T * 0.6) * busy;
          _p.roll = 0.07 * Math.sin(T * 0.9) * busy;
          _p.y = 0.002 * Math.sin(T * 1.1);
          break;
        case 'chatterkeet':
          if (a.phase === 'up' && a.stage === 1) {
            // in flight: up and over, its wings a blur
            const fk = Math.min(1, st / a.stageLen);
            _p.y = 0.06 * bump(fk);
            _p.roll = 0.25 * Math.sin(st * 30) * bump(fk);
          } else {
            // hopping about, bobbing as it talks
            _p.y = 0.006 * Math.abs(Math.sin(T * 6.3)) * (Math.hypot(a.hx - a.x, a.hz - a.z) > 0.004 ? 1 : 0);
            _p.roll = 0.06 * Math.sin(T * 3.1) * busy;
          }
          break;
        case 'jerboost':
          if (a.phase === 'up' && a.stage === 1) {
            // each hop's arc
            const hk = Math.min(1, st / (0.42 / (a.caught ? CALM : 1)));
            _p.y = 0.112 * hk * (1 - hk);
          }
          break;
      }
      if (a.phase === 'in') mv.enter(_q, k, sz.top);
      else if (a.phase === 'out' && u > 0) mv.leave(_q, k, sz.top);
      // a hop when its picture's taken in the roll call
      const cheer = bump((now - a.cheerAt) / 0.45);
      const sc = Math.max(0.0001, _p.scale * _q.scale * (1 + 0.08 * cheer));
      body.rotation.set(0, _p.yaw + _q.yaw, _p.roll + _q.roll);
      body.scale.setScalar(sc);
      // sized about its middle, turned about its pivot (the cloud: the foot of its chain)
      _v.copy(sz.c).multiplyScalar(1 - sc).sub(sz.pivot).applyEuler(body.rotation);
      body.position.set(_p.x + _q.x, _p.y + _q.y + 0.012 * cheer, _p.z + _q.z).add(sz.pivot).add(_v);
      // the parakeet's bubble, turned to you whichever way it's going
      if (a.bubble) a.bubble.rotation.y = you - a.yaw - body.rotation.y;
      // anything of it below the ground (the molehill's rim) is cut away
      m.clip.setFromNormalAndCoplanarPoint(_up, fr.localToWorld(_pt.set(a.x, GROUND + (d.id === 'moletage' ? MOLE_RIM : 0), a.z)));
      // a mark while it's out (the accent, a little unsteady); the model's own
      // stock once caught (the camera chameleon flashes back at the shutter)
      const flick = 0.85 + 0.15 * Math.sin(now * 23 + a.seed) * Math.sin(now * 7.3);
      const flash = d.id === 'cameleon' ? Math.max(0, 1 - (now - a.caughtAt) / 0.35) : 0;
      const b = m.body;
      b.userData.real.value = a.real;
      b.userData.show.value = _p.show * _q.show;
      b.emissive.copy(accentC).lerp(glowC, a.real);
      b.emissiveIntensity = 0.32 * flick * (1 - a.real) + 0.14 * a.real + 1.2 * flash;
      b.opacity = _p.fade * _q.fade * (0.72 + (SURFACE_AWAKE - 0.72) * a.real) * pres;
      b.roughness = 0.34 - 0.08 * a.real;
      b.depthWrite = a.real > 0.5;
      const pm = m.prop;
      pm.userData.real.value = a.real;
      pm.emissive.copy(accentC).lerp(glowC, a.real);
      pm.emissiveIntensity = 0.22 * (1 - a.real) + 0.14 * a.real;
      pm.opacity = (0.6 + (SURFACE_AWAKE - 0.6) * a.real) * pres;
      pm.depthWrite = a.real > 0.5;
    });

    // --- the rings ---
    const pg = ping.current;
    if (pg) {
      // where one's about to turn up: two AR pings spreading out from the spot
      const st = o && o.phase === 'tell' ? o : null;
      pg.visible = !!st;
      if (st) {
        const kk = (((now - st.at) / TELL) * 2) % 1;
        pg.position.set(st.x, GROUND + 0.002, st.z);
        pg.scale.setScalar(size[oi].foot * (0.5 + 1.6 * easeOut(kk)));
        rings.ping.opacity = 0.6 * (1 - kk) * pres;
      }
    }
    const an = anchor.current;
    if (an) {
      an.visible = live;
      if (o && live) {
        const drop = o.phase === 'in' ? 1 - easeOut((now - o.at) / MOVES[CREATURES[oi].id].in) : 0; // spreading out as it comes
        an.position.set(_aim.x, GROUND + 0.002, _aim.z);
        an.scale.setScalar(size[oi].foot * (1.05 + 1.5 * drop + 0.08 * Math.sin(now * 5)) * (1 + 0.25 * G.focus));
        rings.anchor.opacity = (0.25 + 0.4 * drop + 0.08 * Math.sin(now * 5) + 0.35 * G.focus) * pres;
      }
    }
    const lr = lockRing.current;
    if (lr) {
      const p = G.lock / LOCK.hold;
      lr.visible = live && p > 0.01;
      if (lr.visible) {
        lr.position.set(_aim.x, GROUND + 0.003, _aim.z);
        lr.scale.setScalar(size[oi].foot * 1.5);
        lockGeo.setDrawRange(0, 6 * Math.ceil(LOCK_SEGS * Math.min(1, p)));
        rings.lock.opacity = (0.45 + 0.4 * p) * pres;
      }
    }
    const bu = burst.current;
    if (bu) {
      const b = burstAt.current;
      const u = (now - b.t) / 0.6;
      bu.visible = u >= 0 && u < 1;
      if (bu.visible) {
        bu.position.set(b.x, GROUND + 0.003, b.z);
        bu.scale.setScalar(b.r * (1.2 + 2.2 * easeOut(u)));
        rings.burst.opacity = 0.7 * (1 - u) * pres;
      }
    }
    // the bubble keeps over the one it's about while it says so
    const sd = said.current;
    if (sd && G.said >= 0 && now - G.saidAt < SAID && crs[G.said].body) {
      middle(G.said, _pt);
      sd.position.set(_pt.x, _pt.y + (size[G.said].top - size[G.said].c.y) + 0.008, _pt.z);
    }

    // --- the print: out of the top of the viewer, up, turning to you, and away ---
    const prt = print.current;
    if (prt) {
      const u = now - G.printAt;
      const on = G.finale === 'print' && u < FINALE.print;
      prt.visible = on;
      if (on) {
        const rise = easeOutBack(Math.min(1, u / 1.1), 1.4);
        prt.position.set(VIEWER.pos[0], 0.36 + 0.16 * rise + 0.008 * Math.sin(u * 2), VIEWER.pos[2]);
        // face the camera: its turn in the park's frame
        const parent = prt.parent;
        if (parent) prt.quaternion.copy(parent.getWorldQuaternion(_pq).invert().multiply(s.camera.quaternion));
        prt.scale.setScalar(Math.min(1, u / 0.25));
        const fade = 1 - easeIn(Math.max(0, (u - (FINALE.print - 0.8)) / 0.8));
        printMats.paper.opacity = fade * pres;
        // the picture develops, out of the dark
        printMats.photo.opacity = fade * pres;
        printMats.photo.color.setScalar(0.12 + 0.88 * easeOut(Math.min(1, u / 2.2)));
      }
    }
  });

  return (
    <group ref={frame}>
      {kit &&
        size &&
        CREATURES.map((d, i) => (
          <group key={d.id}>
            <group
              ref={(g) => {
                crs[i].g = g;
              }}
              visible={false}
            >
              {/* the cloud's anchor goes along with it */}
              {d.prop === 'driftnot_anchor' && (
                <group
                  ref={(g) => {
                    crs[i].prop = g;
                  }}
                >
                  <mesh geometry={kit.driftnot_anchor} material={mats[i].prop} />
                </group>
              )}
              <group
                ref={(g) => {
                  crs[i].body = g;
                }}
                visible={false}
              >
                <mesh geometry={kit[d.id]} material={mats[i].body} />
                {d.id === 'chatterkeet' && (
                  <group
                    ref={(g) => {
                      crs[i].bubble = g;
                    }}
                  >
                    <mesh geometry={kit.chatterkeet_bubble} material={mats[i].body} />
                  </group>
                )}
              </group>
            </group>
            {/* the props it puts down: the dot and the molehill centred on the
                spot, the ramp where it jumped from (and the molehill it left) */}
            {d.prop && d.prop !== 'driftnot_anchor' && (
              <group
                ref={(g) => {
                  crs[i].prop = g;
                }}
                visible={false}
              >
                <mesh geometry={kit[d.prop]} material={mats[i].prop} position={d.prop === 'jerboost_ramp' ? undefined : [-size[i].propAt.x, 0, -size[i].propAt.z]} />
              </group>
            )}
            {d.prop === 'moletage_hill' && (
              <group
                ref={(g) => {
                  crs[i].prop2 = g;
                }}
                visible={false}
              >
                <mesh geometry={kit.moletage_hill} material={mats[i].prop} position={[-size[i].propAt.x, 0, -size[i].propAt.z]} />
              </group>
            )}
          </group>
        ))}
      <mesh ref={ping} geometry={ringGeo} material={rings.ping} visible={false} renderOrder={2} />
      <mesh ref={anchor} geometry={ringGeo} material={rings.anchor} visible={false} renderOrder={2} />
      <mesh ref={lockRing} geometry={lockGeo} material={rings.lock} visible={false} renderOrder={2} />
      <mesh ref={burst} geometry={ringGeo} material={rings.burst} visible={false} renderOrder={2} />
      {/* "<name> captured", over the one the shutter caught */}
      {close && (
        <group ref={said}>
          <Html center zIndexRange={[14, 0]} className="critter-said-wrap" style={{ pointerEvents: 'none' }}>
            <span ref={saidEl} className="critter-said" style={{ '--sig': accent } as CSSProperties}>
              <b ref={saidName} /> captured
            </span>
          </Html>
        </group>
      )}
      {/* the print: a pale card, the picture on it */}
      <group ref={print} visible={false}>
        <mesh material={printMats.paper}>
          <planeGeometry args={[0.1, 0.12]} />
        </mesh>
        <mesh material={printMats.photo} position={[0, 0.009, 0.0008]}>
          <planeGeometry args={[0.084, 0.084]} />
        </mesh>
      </group>
    </group>
  );
}
