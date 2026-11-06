// ARCam's game, in the park (city.tsx Park). ARCam dropped characters into a
// show floor through a viewfinder, for a photo with them. Here the park has
// seven creatures of its own, each made out of one of the projects (modelled
// in Blender: scripts/models/build_creatures.py), and they're hiding: a
// scavenger hunt. In the close-up, every so often one shows itself, somewhere
// different each time. A pine rustles, and out from behind it peeks Cameleon
// (its camouflage coming and going), Moletage (up out of a fresh molehill),
// Driftnot (dragging its anchor) or Jerboost (hopping out, and sometimes
// bounding off to another pine); a typing bubble over a pine, and Chatterkeet
// flies out of it and off to another; ripples on the lake, and up comes
// Orbitot to swim about, or Pinboo drops onto its dot on the water. Only ever
// where the camera can see it, clear of the label. A few seconds, and it's
// hidden again (fewer, the more you've found). Point at it and the viewer
// swings to it, and a ring round it fills while you keep on it (it stays while
// you do); then the shutter goes. Found, a bubble over it says so, and it goes
// to sit in the clearing at the front, part of the model from then on. All
// seven there, and the viewer takes their group photo, the print rises out of
// it, and a while later they go back into hiding and it starts again. Desktop
// only (a cursor to point with): phones and reduced motion keep the viewer's
// own sweep (city.tsx Binoculars).
//
// The one out is a mark (shared.tsx): the layer's accent, by value. The ones
// found are the model's own stock, also by value; their own colours only ever
// show as light and dark.
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

/** The park's pines (park frame): where each stands, its height and its turn.
 *  Scattered, clear of the lake, the path and the viewer, with a clearing at
 *  the front (where the found ones gather) and one in the middle. The Park
 *  plants them from this; the creatures hide behind them. */
export const PINES: { pos: V3; h: number; yaw: number }[] = [
  { pos: [-0.41, 0, 0.17], h: 0.19, yaw: 1.2 },
  { pos: [-0.36, 0, -0.22], h: 0.2, yaw: 4.3 },
  { pos: [-0.2, 0, -0.32], h: 0.3, yaw: 0.4 },
  { pos: [-0.04, 0, -0.24], h: 0.18, yaw: 2.6 },
  { pos: [0.2, 0, -0.31], h: 0.28, yaw: 2.1 },
  { pos: [0.38, 0, -0.17], h: 0.22, yaw: 3.6 },
  { pos: [0.27, 0, -0.09], h: 0.19, yaw: 0.9 },
  { pos: [0.42, 0, 0.08], h: 0.21, yaw: 5.6 },
  { pos: [0.12, 0, 0.0], h: 0.19, yaw: 3.2 },
];
/** How hard each pine is rustling (0 → 1): set here, shaken by city.tsx ParkTree. */
export const PINE_RUSTLE = PINES.map(() => 0);
const canopy = (h: number) => h * 0.36; // how far a pine's lowest tier reaches (city.tsx PINE_TIERS)

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

const GROUND = 0.024; // the park's lawn (its plot's top, a hair over), and the lake's surface
const TELL = 0.7; // s a pine rustles, or the lake ripples, before one shows itself
const UP = [3.2, 2.0]; // s one stays out: with none found yet, and with all but one (in step between)
const GAP = [1.2, 2.4]; // s from one hiding to the next showing itself (at random within)
// the cursor within `reach` of it (or of its own size, if that's more), the
// viewer within `tol` rad of it: held `hold` s, the shot
const LOCK = { reach: 0.04, tol: 0.25, hold: 0.45 };
const SAID = 2.4; // s the bubble says one's been found, before it goes to sit in the clearing
// all seven sat: a beat, the viewer finds the clearing, the group photo, and the print, up for `print` s
const FINALE = { wait: 0.8, pose: 1.2, print: 6 };
const MOLE_RIM = 0.012; // the molehill's rim: what of the mole is lower than this is down the hole
const SWIM = 0.035; // how fast Orbitot swims across the lake while it's out (park units a second)

/** The plot, the lake and the jetty, as the creatures need them. */
const PARK_R = 0.46; // the plot's 0.5 across: kept a little in from its rim
const LAKE = { x: -0.11, z: 0.17, rx: 0.21, rz: 0.19 }; // its reach (city.tsx Park draws it), and a margin: the ground ones keep out
const POND = { x: -0.13, z: 0.17, rx: 0.11, rz: 0.09 }; // where on it the swimmers come up: well inside its shore
const JETTY: [number, number] = [-0.01, 0.11];
const onPlot = (x: number, z: number) => Math.hypot(x, z) < PARK_R && Math.hypot(x - VIEWER.pos[0], z - VIEWER.pos[2]) > 0.07;
const inLake = (x: number, z: number) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) < 1;
/** Grass a creature can stand on: on the plot, off the lake, not under a pine (but `own`). */
const grass = (x: number, z: number, own = -1) => onPlot(x, z) && !inLake(x, z) && PINES.every((p, j) => j === own || Math.hypot(x - p.pos[0], z - p.pos[2]) > canopy(p.h) + 0.01);

type Id = 'orbitot' | 'pinboo' | 'cameleon' | 'moletage' | 'driftnot' | 'chatterkeet' | 'jerboost';
type Prop = 'pinboo_dot' | 'moletage_hill' | 'driftnot_anchor';
/** Where it hides: behind a pine (`tree`), in a pine's crown (`crown`), under the lake (`lake`). */
type Kind = 'tree' | 'crown' | 'lake';
/** Each creature: its name, the side of it you see (how far it turns from
 *  facing the camera, as it was posed in its portrait), where it hides, which
 *  way it turns (`you`: that side to the camera; `way`: where it's going, while
 *  it goes), the prop it brings, and how light its two marks are on the group
 *  photo's print. */
const CREATURES: { id: Id; name: string; view: number; kind: Kind; turn: 'you' | 'way'; prop?: Prop; tone: [number, number] }[] = [
  { id: 'orbitot', name: 'Orbitot', view: 0.25, kind: 'lake', turn: 'you', tone: [0.9, 0.55] }, // Sol.AR: a little Saturn
  { id: 'pinboo', name: 'Pinboo', view: 0.3, kind: 'lake', turn: 'you', prop: 'pinboo_dot', tone: [0.6, 1] }, // location AR: its dot says it's in the lake
  { id: 'cameleon', name: 'Cameleon', view: 0.9, kind: 'tree', turn: 'way', tone: [0.55, 0.85] }, // ARCam: lenses for eyes
  { id: 'moletage', name: 'Moletage', view: 0.35, kind: 'tree', turn: 'you', prop: 'moletage_hill', tone: [0.25, 0.75] }, // Amsterdam Underground
  { id: 'driftnot', name: 'Driftnot', view: 0.2, kind: 'tree', turn: 'you', prop: 'driftnot_anchor', tone: [1, 0.45] }, // the AR framework's cloud anchors
  { id: 'chatterkeet', name: 'Chatterkeet', view: 0.7, kind: 'crown', turn: 'way', tone: [0.6, 0.3] }, // the Amsterdam AI guides
  { id: 'jerboost', name: 'Jerboost', view: 1.15, kind: 'tree', turn: 'way', tone: [0.8, 0.95] }, // Lightship Drive's crown
];
/** Where the found ones sit: the clearing at the front, two rows to the camera
 *  (the tall and the floating ones behind), for the group photo. */
const SEATS: Record<Id, [number, number]> = {
  driftnot: [0.106, 0.254],
  orbitot: [0.169, 0.224],
  moletage: [0.233, 0.194],
  chatterkeet: [0.296, 0.164],
  pinboo: [0.174, 0.316],
  cameleon: [0.237, 0.286],
  jerboost: [0.3, 0.256],
};
const CLEARING: [number, number] = [0.21, 0.24]; // its middle: where the viewer takes the group photo
/** How the ones that come out from behind a pine get about: a creep, a drag
 *  (anchor and all), a hop at a time, a flight. The rest come up where they are. */
type Style = 'creep' | 'drag' | 'hop' | 'fly';
const STYLE: Partial<Record<Id, Style>> = { cameleon: 'creep', driftnot: 'drag', jerboost: 'hop', chatterkeet: 'fly' };
/** Where round its pine one comes out to, in the order it tries them: how far
 *  round from straight in front of it (rad; π/2 is right out to the side), and
 *  for the parakeet, where it perches in front of it. */
const PEEK = [1.65, 1.3, 2.0, 0.95];
const PERCH = [0.4, 0, 0.9];

/** How a creature's body sits, frame to frame, on top of where it is: an
 *  offset (in its own frame, facing +X), a turn and a roll, a size (about its
 *  middle), how much of it shows (its camouflage, pixel by pixel) and how solid. */
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
/** The ones that come up where they are: how (`enter`, over `in` s) and how
 *  they go (`leave`, over `out` s). `top` is how tall it is. */
interface Moves {
  in: number;
  out: number;
  enter(p: Pose, t: number, top: number): void;
  leave(p: Pose, t: number, top: number): void;
}
const MOVES: Partial<Record<Id, Moves>> = {
  // up out of the lake, turning, and back down into it
  orbitot: {
    in: 0.6,
    out: 0.5,
    enter: (p, t, top) => {
      p.y = -top * (1 - easeOutBack(t, 1.4));
      p.yaw = (1 - t) * 3;
    },
    leave: (p, t, top) => {
      p.y = -top * easeIn(t);
      p.yaw = t * 2;
    },
  },
  // dropped from above onto its dot on the water, a bounce; gone like a ghost
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
};

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


// home: hiding; tell: a pine rustling (or the lake rippling) where it's about
// to show itself; in: coming out; up: out; out: off back into hiding; kept: found
type Phase = 'home' | 'tell' | 'in' | 'up' | 'out' | 'kept';
interface Creature {
  g: Group | null; // where it is, turned
  body: Group | null; // the creature itself (and the cloud's anchor)
  prop: Group | null; // the dot it's meant to be on, the molehill it comes up out of
  bubble: Group | null; // the parakeet's speech bubble, kept turned to you
  phase: Phase;
  at: number; // when the phase began
  dur: number; // and how long it takes (coming out, going back)
  left: number; // s it has left out, counting down while you're not holding it
  caught: boolean;
  caughtAt: number;
  cheerAt: number; // a hop for the group photo
  kept: number; // found: saying so (0), off (1), arriving at its seat (2), sat (3), back into hiding (4)
  keptAt: number;
  real: number; // 0 the accent's mark, 1 the model's stock (eased)
  seed: number;
  tree: number; // the pine it's at (−1: the lake)
  x: number; // where it is (park frame), and how high
  y: number;
  z: number;
  yaw: number;
  head: number; // which way it's going (rad, park frame, from +x toward +z)
  hx: number; // where it hides, and how high (a crown)
  hz: number;
  hy: number;
  sx: number; // where it shows itself
  sz: number;
  fx: number; // its leg: from (fx, fy, fz) to (tx, ty, tz), over legLen s from legAt
  fy: number;
  fz: number;
  tx: number;
  ty: number;
  tz: number;
  legAt: number;
  legLen: number;
  hops: number;
  bound: boolean; // off across the open to another pine
  px: number; // its prop: where, when it came, when it goes (−1: not yet)
  pz: number;
  pAt: number;
  pOut: number;
}

const _pq = new Quaternion();
const _cam = new Vector3();
const _aim = new Vector3();
const _up = new Vector3();
const _pt = new Vector3();
const _v = new Vector3();
const _sc = new Vector3();
const _p: Pose = rest({} as Pose);
const _q: Pose = rest({} as Pose);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const shuffled = (n: number) => {
  const o = Array.from({ length: n }, (_, k) => k);
  for (let k = n - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [o[k], o[j]] = [o[j], o[k]];
  }
  return o;
};

/** A ring's light: the accent, added onto what's under it. */
function glowMat(color: string) {
  const m = new MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide });
  m.userData.lifeSkip = true;
  return m;
}

export function ParkCritters({ slug }: { slug: string }) {
  const pal = useAccent();
  const { accent } = pal;
  const close = useCloseUp(slug);
  const presence = useContext(PresenceCtx); // a layer that isn't the subject recedes
  const lit = useLitLink(slug); // and the park's hover light falls on them too
  const gl = useThree((s) => s.gl);
  // the ones that come up out of the ground and the lake: what's below it is cut away
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
        foot: Math.max(0.022, flat, pb && d.prop !== 'driftnot_anchor' ? (Math.max(pb.max.x - pb.min.x, pb.max.z - pb.min.z) / 2) * 1.05 : 0),
        reach: Math.max(LOCK.reach, half * 0.8),
        // the dot and the molehill sit centred where they're put down
        propAt: pb ? pb.getCenter(new Vector3()).setY(0) : new Vector3(),
        // the cloud sways from the foot of its chain, the top of its anchor
        pivot: pb && d.prop === 'driftnot_anchor' ? new Vector3((pb.min.x + pb.max.x) / 2, pb.max.y, (pb.min.z + pb.max.z) / 2) : new Vector3(),
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
        bubble: null,
        phase: 'home',
        at: -99,
        dur: 0,
        left: 0,
        caught: false,
        caughtAt: -99,
        cheerAt: -99,
        kept: 0,
        keptAt: -99,
        real: 0,
        seed: i * 1.7,
        tree: -1,
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        head: 0,
        hx: 0,
        hz: 0,
        hy: 0,
        sx: 9,
        sz: 9,
        fx: 0,
        fy: 0,
        fz: 0,
        tx: 0,
        ty: 0,
        tz: 0,
        legAt: 0,
        legLen: 0,
        hops: 1,
        bound: false,
        px: 0,
        pz: 0,
        pAt: -99,
        pOut: -1,
      })),
    [],
  );
  const frame = useRef<Group>(null); // the park's frame, to find the cursor in
  const clock = useRef(0);
  // who's out (or −1), when the next one shows itself, the lock's build-up,
  // the shot asked for and on whom, and the group photo's stage
  const game = useRef({ out: -1, next: 0, last: -1, lock: 0, focus: 0, pending: -1, seen: 0, wasClose: false, finale: 'none' as 'none' | 'pose' | 'shot' | 'print', finAt: 0, printAt: -99 });
  // the rings: ripples where one's about to come up out of the lake, the AR
  // anchor under the one out, the lock filling round it, a burst as it's found
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
  // the bubble that says one's been found
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
    // opening the close-up: one shows itself soon
    if (close && !G.wasClose) G.next = Math.max(G.next, now + 1.4);
    G.wasClose = close;
    fr.worldToLocal(s.camera.getWorldPosition(_cam));
    const foundN = crs.filter((a) => a.caught).length;
    // the pines settle down again
    for (let k = 0; k < PINE_RUSTLE.length; k++) PINE_RUSTLE[k] *= Math.exp(-dt * 6);
    const rustle = (k: number, v: number) => {
      if (k >= 0) PINE_RUSTLE[k] = Math.max(PINE_RUSTLE[k], Math.min(1, v));
    };
    // can the close-up's camera see a creature standing here? Not if a pine (or
    // the viewer's post, with room to spare) stands between, near enough its
    // line of sight to hide it
    const seen = (x: number, z: number) => {
      const L = Math.hypot(_cam.x - x, _cam.z - z);
      const ux = (_cam.x - x) / L;
      const uz = (_cam.z - z) / L;
      const tan = _cam.y / L;
      const blocks = (px: number, pz: number, h: number, r: number) => {
        const ox = px - x;
        const oz = pz - z;
        const along = ox * ux + oz * uz;
        return along > 0 && along < (h - 0.03) / tan && Math.abs(ox * uz - oz * ux) < r;
      };
      return !PINES.some((p) => blocks(p.pos[0], p.pos[2], p.h, canopy(p.h) * 0.85)) && !blocks(VIEWER.pos[0], VIEWER.pos[2], 0.3, 0.05);
    };
    // somebody else there already (out, or sat in the clearing)
    const taken = (x: number, z: number, i: number) => crs.some((b, j) => j !== i && b.phase !== 'home' && Math.hypot(b.x - x, b.z - z) < 0.08);
    // a pine's way away from the camera, and the spot just behind it
    const away = (t: number) => {
      const p = PINES[t];
      const L = Math.hypot(p.pos[0] - _cam.x, p.pos[2] - _cam.z);
      return [(p.pos[0] - _cam.x) / L, (p.pos[2] - _cam.z) / L] as const;
    };
    const behind = (t: number): [number, number] => {
      const p = PINES[t];
      const [dx, dz] = away(t);
      return [p.pos[0] + dx * canopy(p.h) * 0.45, p.pos[2] + dz * canopy(p.h) * 0.45];
    };
    // a leg for creature a: from where it is to (tx, ty, tz), over len s
    const leg = (a: Creature, tx: number, ty: number, tz: number, len: number) => {
      a.fx = a.x;
      a.fy = a.y;
      a.fz = a.z;
      a.tx = tx;
      a.ty = ty;
      a.tz = tz;
      a.legAt = now;
      a.legLen = len;
      const dist = Math.hypot(tx - a.x, tz - a.z);
      a.hops = Math.max(1, Math.round(dist / 0.045));
      if (dist > 0.002) a.head = Math.atan2(tz - a.z, tx - a.x);
    };

    // does a spot (park frame, `y` up off the lawn) land in the picture, clear
    // of its edges and of the label over it?
    let label: DOMRect | undefined;
    const inPicture = (x: number, y: number, z: number) => {
      fr.localToWorld(_sc.set(x, GROUND + y, z)).project(s.camera);
      if (_sc.z > 1) return false;
      const { left, top, width, height } = s.size;
      const px = ((_sc.x + 1) / 2) * width + left;
      const py = ((1 - _sc.y) / 2) * height + top;
      const m = 40; // px kept from the edges (and the header's height more at the top)
      if (px < left + m || px > left + width - m || py < top + m + 64 || py > top + height - m) return false;
      return !label || px < label.left - 30 || px > label.right + 30 || py < label.top - 30 || py > label.bottom + 30;
    };

    // where creature i shows itself this time: somewhere new, that you can see
    const plan = (i: number) => {
      label = document.querySelector('.exhibit .xl')?.getBoundingClientRect();
      const d = CREATURES[i];
      const a = crs[i];
      const w = size[i].foot;
      if (d.kind === 'lake') {
        for (let k = 0; k < 30; k++) {
          const ang = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random());
          const x = POND.x + Math.cos(ang) * POND.rx * r;
          const z = POND.z + Math.sin(ang) * POND.rz * r;
          if (Math.hypot(x - JETTY[0], z - JETTY[1]) < 0.06 || !seen(x, z) || taken(x, z, i) || !inPicture(x, 0.02, z) || Math.hypot(x - a.sx, z - a.sz) < 0.05) continue;
          a.tree = -1;
          a.sx = a.hx = x;
          a.sz = a.hz = z;
          a.hy = 0;
          return true;
        }
        return false;
      }
      // somewhere to come out to: grass, in view, and nobody there already
      const open = (x: number, z: number, t: number) => grass(x, z, t) && seen(x, z) && !taken(x, z, i) && inPicture(x, 0.02, z);
      for (const t of shuffled(PINES.length)) {
        if (t === a.tree) continue;
        const p = PINES[t];
        const r = canopy(p.h);
        const [dx, dz] = away(t);
        // the pine's in the picture too: it's what rustles
        if (!inPicture(p.pos[0], p.h * 0.7, p.pos[2])) continue;
        // a spot round it, `th` from straight in front (its side to the
        // camera) out to one side (`sd`), `D` from its trunk
        const round = (th: number, sd: number, D: number) => [p.pos[0] + (-dx * Math.cos(th) - dz * sd * Math.sin(th)) * D, p.pos[2] + (-dz * Math.cos(th) + dx * sd * Math.sin(th)) * D] as const;
        const sides = Math.random() < 0.5 ? [1, -1] : [-1, 1];
        if (d.kind === 'crown') {
          // in its crown, and a perch on the grass in front of it
          for (const th of PERCH)
            for (const sd of sides) {
              const [x, z] = round(th, sd, r + 0.035);
              if (!open(x, z, t)) continue;
              a.tree = t;
              a.hx = p.pos[0];
              a.hz = p.pos[2];
              a.hy = p.h * 0.8;
              a.sx = x;
              a.sz = z;
              return true;
            }
          continue;
        }
        // behind it, and out from behind it, to one side or the other
        const [hx, hz] = behind(t);
        if (!onPlot(hx, hz) || inLake(hx, hz)) continue;
        for (const sd of sides)
          for (const th of PEEK)
            for (const D of [r * 0.9 + w, r + w + 0.02]) {
              const [x, z] = round(th, sd, D);
              if (!open(x, z, t)) continue;
              a.tree = t;
              // the mole doesn't slip out: it comes up where it shows itself
              [a.hx, a.hz] = d.id === 'moletage' ? [x, z] : [hx, hz];
              a.hy = 0;
              a.sx = x;
              a.sz = z;
              return true;
            }
      }
      return false;
    };
    // Orbitot, out on the lake, swims off across it: a little way, staying in view
    const swim = (a: Creature) => {
      label = document.querySelector('.exhibit .xl')?.getBoundingClientRect();
      for (let k = 0; k < 20; k++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 0.05 + Math.random() * 0.05;
        const x = a.x + Math.cos(ang) * r;
        const z = a.z + Math.sin(ang) * r;
        if (Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz) > 1 || Math.hypot(x - JETTY[0], z - JETTY[1]) < 0.06 || !seen(x, z) || !inPicture(x, 0.02, z)) continue;
        leg(a, x, 0, z, r / SWIM);
        return;
      }
    };

    // --- one shows itself, now and then, while you're here to see it ---
    if (close && G.finale === 'none' && G.out < 0 && now > G.next) {
      const free = crs.map((_, i) => i).filter((i) => !crs[i].caught && crs[i].phase === 'home');
      const fresh = free.filter((i) => i !== G.last);
      const from = fresh.length ? fresh : free;
      const i = from[Math.floor(Math.random() * from.length)];
      if (i !== undefined && plan(i)) {
        const a = crs[i];
        a.x = a.hx;
        a.y = a.hy;
        a.z = a.hz;
        a.legLen = 0;
        a.bound = false;
        a.phase = 'tell';
        a.at = now;
        // its first turn: the side it was posed to show, to the camera
        a.yaw = CREATURES[i].view - Math.atan2(_cam.z - a.sz, _cam.x - a.sx);
        a.head = -a.yaw;
        // its prop comes first: the dot on the water, the molehill pushing up
        a.px = a.sx;
        a.pz = a.sz;
        a.pAt = now;
        a.pOut = -1;
        G.out = i;
        G.last = i;
        play('critter-peek', { volume: 0.4 });
      } else G.next = now + 0.5;
    }

    // --- each one: the rustle, coming out, out, back into hiding ---
    crs.forEach((a, i) => {
      const d = CREATURES[i];
      const mv = MOVES[d.id];
      const u = now - a.at;
      const gone = () => {
        if (G.out !== i) return;
        G.out = -1;
        G.lock = 0;
        if (G.pending === i) G.pending = -1;
        G.next = now + GAP[0] + Math.random() * (GAP[1] - GAP[0]);
      };
      // back into hiding: behind its pine (or the jerboa off across the open to
      // another, the parakeet into another's crown), down its hole, under the lake
      const hide = (sound: boolean) => {
        a.phase = 'out';
        a.at = now;
        if (G.pending === i) G.pending = -1;
        if (sound) play('critter-away', { volume: 0.35 });
        if (d.kind === 'crown') {
          const near = PINES.map((p, k) => [k, Math.hypot(p.pos[0] - a.x, p.pos[2] - a.z)] as const)
            .filter(([k]) => k !== a.tree)
            .sort((p, q) => p[1] - q[1])
            .slice(0, 4);
          const t2 = near[Math.floor(Math.random() * near.length)][0];
          a.tree = t2;
          a.bound = true;
          leg(a, PINES[t2].pos[0], PINES[t2].h * 0.8, PINES[t2].pos[2], 0.9);
        } else if (d.id === 'jerboost' && Math.random() < 0.5) {
          for (const t2 of shuffled(PINES.length)) {
            if (t2 === a.tree) continue;
            const [x, z] = behind(t2);
            const dist = Math.hypot(x - a.x, z - a.z);
            if (dist < 0.12 || dist > 0.32 || !onPlot(x, z) || inLake(x, z)) continue;
            if (![0.25, 0.5, 0.75].every((k) => onPlot(a.x + (x - a.x) * k, a.z + (z - a.z) * k) && !inLake(a.x + (x - a.x) * k, a.z + (z - a.z) * k))) continue;
            a.tree = t2;
            a.bound = true;
            leg(a, x, 0, z, dist / 0.14);
            break;
          }
          if (!a.bound) leg(a, a.hx, 0, a.hz, 0.5);
        } else if (STYLE[d.id]) leg(a, a.hx, 0, a.hz, d.id === 'cameleon' ? 0.75 : 0.6);
        a.dur = mv ? mv.out : a.legLen;
        a.pOut = now + a.dur; // its prop goes once it has
      };
      if (a.phase === 'tell') {
        if (d.kind !== 'lake') rustle(a.tree, bump(u / TELL));
        if (!close) {
          a.phase = 'home';
          gone();
        } else if (u > TELL) {
          a.phase = 'in';
          a.at = now;
          play('critter-in', { volume: 0.45 });
          if (STYLE[d.id]) leg(a, a.sx, 0, a.sz, d.kind === 'crown' ? 0.75 : d.id === 'jerboost' ? 0.55 : 0.9);
          a.dur = mv ? mv.in : a.legLen;
        }
      } else if (a.phase === 'in') {
        if (d.kind === 'tree') rustle(a.tree, 0.35 * (1 - Math.min(1, u / 0.3)));
        if (!close) hide(false);
        else if (u > a.dur) {
          a.phase = 'up';
          a.at = now;
          a.left = UP[0] + (UP[1] - UP[0]) * Math.min(1, foundN / (CREATURES.length - 1));
          if (d.id === 'orbitot') swim(a);
        }
      } else if (a.phase === 'up') {
        // its time runs out, except while you're holding it in the viewer
        if (G.lock <= 0 && G.pending !== i) a.left -= dt;
        if (a.left <= 0 || !close) hide(close);
      } else if (a.phase === 'out') {
        if (d.kind !== 'lake') rustle(a.tree, 0.4 * Math.max(0, (u - a.dur * 0.6) / (a.dur * 0.4 + 1e-3)));
        if (u > a.dur) {
          a.phase = 'home';
          a.at = now;
          gone();
        }
      }
    });

    // --- their legs: out from behind a pine, back, across the open, out of a crown and into another ---
    crs.forEach((a, i) => {
      if (a.phase === 'kept' || a.legLen <= 0) return;
      const k = Math.min(1, (now - a.legAt) / a.legLen);
      const e = STYLE[CREATURES[i].id] === 'hop' ? k : easeInOut(k);
      a.x = a.fx + (a.tx - a.fx) * e;
      a.z = a.fz + (a.tz - a.fz) * e;
      a.y = a.fy + (a.ty - a.fy) * e;
      if (k >= 1) a.legLen = 0;
    });

    // --- the one out: point at it and the viewer locks on; hold, and it's photographed ---
    SAFARI.want = null;
    const oi = G.out;
    const o = oi >= 0 ? crs[oi] : null;
    let near = false;
    const live = !!o && !!o.body && !o.caught && (o.phase === 'in' || o.phase === 'up' || (o.phase === 'out' && o.bound));
    if (o && live) {
      // its middle, where it is now, in the park's frame; and the cursor at that
      // depth, so the ones up in the air are aimed at, not the lawn under them
      o.body!.updateWorldMatrix(true, false);
      fr.worldToLocal(o.body!.localToWorld(_aim.copy(size[oi].c)));
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
    // the shutter went on it: found, and part of the model from now on
    if (G.pending >= 0 && G.finale === 'none' && SAFARI.fired > G.seen) {
      const i = G.pending;
      const a = crs[i];
      a.caught = true;
      a.caughtAt = now;
      a.phase = 'kept';
      a.kept = 0;
      a.keptAt = now;
      a.legLen = 0;
      burstAt.current = { t: now, x: _aim.x, z: _aim.z, r: size[i].foot };
      play('critter-snap', { volume: 0.7 });
      // and over it, its name
      const el = saidEl.current;
      if (said.current && el && saidName.current) {
        said.current.position.set(_aim.x, _aim.y + (size[i].top - size[i].c.y) + 0.008, _aim.z);
        saidName.current.textContent = CREATURES[i].name;
        el.removeAttribute('data-on');
        void el.offsetWidth; // start its animation over
        el.setAttribute('data-on', '');
      }
      G.pending = -1;
      G.out = -1;
      G.lock = 0;
      G.next = now + SAID + 0.9 + GAP[0];
    }

    // --- the found ones: a moment where they were, then off to sit in the clearing ---
    crs.forEach((a, i) => {
      if (a.phase !== 'kept') return;
      const u = now - a.keptAt;
      if (a.kept === 0 && u > SAID) {
        a.kept = 1;
        a.keptAt = now;
      } else if (a.kept === 1 && u > 0.3) {
        [a.x, a.z] = SEATS[CREATURES[i].id];
        a.y = 0;
        a.px = a.x;
        a.pz = a.z;
        a.pAt = now;
        a.pOut = -1;
        a.kept = 2;
        a.keptAt = now;
      } else if (a.kept === 2 && u > 0.35) {
        a.kept = 3;
        a.keptAt = now;
      } else if (a.kept === 4 && u > 0.35) {
        a.phase = 'home';
        a.at = now;
      }
    });

    // --- all seven sat: the group photo, and the print ---
    if (G.finale === 'none' && crs.every((a) => a.phase === 'kept' && a.kept === 3)) {
      G.finale = 'pose';
      G.finAt = now + FINALE.wait;
    }
    if ((G.finale === 'pose' || G.finale === 'shot') && now > G.finAt) {
      SAFARI.want = bearing(CLEARING[0], CLEARING[1]);
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
      // and they go back into hiding, one after another, and it starts over
      crs.forEach((a, k) => {
        a.caught = false;
        a.kept = 4;
        a.keptAt = now + k * 0.15;
        a.pOut = a.keptAt + 0.3;
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
      // its prop: put down as it's about to show itself, gone after it
      const pr = a.prop;
      if (pr) {
        const off = a.pOut >= 0 && now > a.pOut;
        const k = !shown ? 0 : off ? Math.max(0, 1 - easeIn((now - a.pOut) / 0.4)) : easeOutBack(Math.min(1, Math.max(0, (now - a.pAt) / 0.35)), 1.6);
        pr.visible = k > 0.002;
        pr.position.set(a.px, GROUND, a.pz);
        if (d.prop === 'moletage_hill') pr.scale.set(1, Math.max(0.0001, k), 1);
        else pr.scale.setScalar(Math.max(0.0001, k));
      }
      if (!shown) return;
      g.position.set(a.x, GROUND + a.y, a.z);
      // which way it's turned: the side it was posed to show, to the camera; or,
      // for the ones that go about, the way it's going while it goes
      const you = d.view - Math.atan2(_cam.z - a.z, _cam.x - a.x);
      const moving = a.legLen > 0;
      a.yaw += wrap((d.turn === 'way' && moving ? -a.head : you) - a.yaw) * (1 - Math.exp(-dt * 7));
      g.rotation.y = a.yaw;
      // the creature itself
      rest(_p);
      rest(_q);
      const mv = MOVES[d.id];
      const sat = a.phase === 'kept';
      body.visible = a.phase !== 'tell';
      const T = now + a.seed * 3;
      const calm = sat ? 0.45 : 1;
      const legK = moving ? Math.min(1, (now - a.legAt) / a.legLen) : 1;
      switch (d.id) {
        case 'orbitot': // bobbing, turning on its axis to and fro; round in small circles as it swims
          _p.y = 0.004 * Math.sin(T * 1.5);
          _p.yaw = 0.35 * Math.sin(T * 0.45) * calm;
          if (!sat) {
            _p.x = 0.012 * Math.cos(T * 0.8);
            _p.z = 0.012 * Math.sin(T * 0.8);
          }
          break;
        case 'pinboo': // never quite steady, never quite on its dot
          _p.y = 0.004 * Math.sin(T * 2);
          _p.roll = 0.08 * Math.sin(T * 1.3) * calm;
          if (!sat) {
            _p.x = 0.012 * Math.sin(T * 0.7);
            _p.z = 0.009 * Math.sin(T * 1.1 + 1);
          }
          break;
        case 'cameleon': // a look about when it stops; its camouflage coming and going while it's out
          if (!moving) _p.yaw = 0.25 * Math.sin(T * 0.9) * calm;
          if (!a.caught) _p.show = 1 - 0.65 * bump((T % 2.6) / 1.1);
          break;
        case 'moletage': // a look about
          _p.yaw = 0.22 * Math.sin(T * 0.9) * calm;
          break;
        case 'driftnot': // swaying on its chain
          _p.yaw = 0.25 * Math.sin(T * 0.6) * calm;
          _p.roll = 0.07 * Math.sin(T * 0.9) * calm;
          _p.y = 0.002 * Math.sin(T * 1.1);
          break;
        case 'chatterkeet':
          if (moving) {
            // in flight: up and over, its wings a blur
            _p.y = 0.05 * bump(legK);
            _p.roll = 0.25 * Math.sin(T * 30) * bump(legK);
          } else {
            // bobbing as it talks
            _p.roll = 0.06 * Math.sin(T * 3.1) * calm;
            _p.y = 0.004 * Math.abs(Math.sin(T * 2.2)) * calm;
          }
          break;
        case 'jerboost':
          if (moving) _p.y = 0.022 * Math.abs(Math.sin(legK * a.hops * Math.PI));
          else _p.y = 0.012 * bump(((T / 1.6) % 1) * 3) * calm; // a hop on the spot now and then
          break;
      }
      // the ones that come up where they are: up out of the lake, down onto its dot, up out of the molehill
      if (mv && a.phase === 'in') mv.enter(_q, Math.min(1, u / mv.in), sz.top);
      else if (mv && a.phase === 'out') mv.leave(_q, Math.min(1, u / mv.out), sz.top);
      // the parakeet out of a crown and into another; the chameleon shedding its camouflage as it comes out
      if (d.id === 'chatterkeet' && moving) _q.fade = a.phase === 'in' ? Math.min(1, legK / 0.25) : a.phase === 'out' ? Math.min(1, (1 - legK) / 0.25) : 1;
      if (d.id === 'cameleon' && a.phase === 'in') _q.show = 0.35 + 0.65 * legK;
      else if (d.id === 'cameleon' && a.phase === 'out') _q.show = 1 - 0.65 * legK;
      // found: off where it was, and on again at its seat; and at the end, back into hiding
      if (sat) {
        const ku = now - a.keptAt;
        if (a.kept === 1) _q.scale = 1 - easeIn(ku / 0.3);
        else if (a.kept === 2) _q.scale = easeOutBack(Math.min(1, ku / 0.35), 2);
        else if (a.kept === 4) _q.scale = ku < 0 ? 1 : Math.max(0, 1 - easeIn(ku / 0.35));
      }
      // a hop for the group photo
      const cheer = bump((now - a.cheerAt) / 0.45);
      const sc = Math.max(0.0001, _p.scale * _q.scale * (1 + 0.08 * cheer));
      body.rotation.set(0, _p.yaw + _q.yaw, _p.roll + _q.roll);
      body.scale.setScalar(sc);
      // sized about its middle, turned about its pivot (the cloud: the foot of its chain)
      _v.copy(sz.c).multiplyScalar(1 - sc).sub(sz.pivot).applyEuler(body.rotation);
      body.position.set(_p.x + _q.x, _p.y + _q.y + 0.012 * cheer, _p.z + _q.z).add(sz.pivot).add(_v);
      // the parakeet's bubble: over the pine it's in before it comes out, and with it after; turned to you
      if (a.bubble) {
        a.bubble.visible = a.phase === 'tell' || a.phase === 'in' || a.phase === 'up' || (sat && (a.kept === 0 || a.kept === 3));
        a.bubble.rotation.y = you - a.yaw;
      }
      // anything of it below the ground (the water, the molehill's rim) is cut away
      m.clip.setFromNormalAndCoplanarPoint(_up, fr.localToWorld(_pt.set(a.x, GROUND + (d.id === 'moletage' ? MOLE_RIM : 0), a.z)));
      // a mark while it's out (the accent, a little unsteady); the model's own
      // stock once found (the camera chameleon flashes back at the shutter)
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
      pm.opacity = _q.fade * (0.6 + (SURFACE_AWAKE - 0.6) * a.real) * pres;
      pm.depthWrite = a.real > 0.5;
    });

    // --- the rings ---
    const pg = ping.current;
    if (pg) {
      // ripples where one's about to come up out of the lake
      const st = o && o.phase === 'tell' && CREATURES[oi].kind === 'lake' ? o : null;
      pg.visible = !!st;
      if (st) {
        const kk = (((now - st.at) / TELL) * 2) % 1;
        pg.position.set(st.sx, GROUND + 0.002, st.sz);
        pg.scale.setScalar(size[oi].foot * (0.5 + 1.6 * easeOut(kk)));
        rings.ping.opacity = 0.55 * (1 - kk) * pres;
      }
    }
    const an = anchor.current;
    if (an) {
      an.visible = live;
      if (o && live) {
        an.position.set(_aim.x, GROUND + 0.002, _aim.z);
        an.scale.setScalar(size[oi].foot * (1.05 + 0.08 * Math.sin(now * 5)) * (1 + 0.25 * G.focus));
        rings.anchor.opacity = (0.2 + 0.06 * Math.sin(now * 5) + 0.35 * G.focus) * pres;
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
              <group
                ref={(g) => {
                  crs[i].body = g;
                }}
                visible={false}
              >
                <mesh geometry={kit[d.id]} material={mats[i].body} />
                {/* the cloud's anchor comes along with it */}
                {d.prop === 'driftnot_anchor' && <mesh geometry={kit.driftnot_anchor} material={mats[i].prop} />}
              </group>
              {d.id === 'chatterkeet' && (
                <group
                  ref={(g) => {
                    crs[i].bubble = g;
                  }}
                  visible={false}
                >
                  <mesh geometry={kit.chatterkeet_bubble} material={mats[i].body} />
                </group>
              )}
            </group>
            {/* the dot it's meant to be on, the molehill it comes up out of: centred on the spot */}
            {(d.prop === 'pinboo_dot' || d.prop === 'moletage_hill') && (
              <group
                ref={(g) => {
                  crs[i].prop = g;
                }}
                visible={false}
              >
                <mesh geometry={kit[d.prop]} material={mats[i].prop} position={[-size[i].propAt.x, 0, -size[i].propAt.z]} />
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
