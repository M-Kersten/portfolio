// ARCam's game, in the park (city.tsx Park). ARCam dropped characters into a
// show floor through a viewfinder, for a photo with them. Here the park has
// seven creatures of its own, each made out of one of the projects (modelled
// in Blender: scripts/models/build_creatures.py), and each with a home in the
// park: a molehill, a bollard, an old root, an anchor in the lawn, a dot on
// the map, a ramp on the path, the lake. In the close-up they come out one at
// a time, each at its own home and in its own way, and not for long: the home
// stirs, out it comes, glowing in the accent, and a few seconds later it's
// gone again (sooner, the more of them you've caught), so you have to keep an
// eye on the whole park. Point at it and the viewer swings to it, and a ring
// round it fills while you hold it there (it waits for you while you do);
// then the shutter goes. Photographed, it's captured, and a bubble over it
// says so: it's real from then on, in its own colours, and stays out at its
// home. All seven, and the viewer takes a picture of each in turn, then one
// of them all, and the print rises out of it; a while later the park lets
// them go and it starts again. Desktop only (a cursor to point with): phones
// and reduced motion keep the viewer's own sweep (city.tsx Binoculars).
import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { AdditiveBlending, CanvasTexture, Color, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, Plane, Quaternion, RingGeometry, SRGBColorSpace, Vector3, type Group, type Mesh } from 'three';
import { play } from '../../lib/sound';
import { bump, easeIn, easeOut, easeOutBack } from '../../lib/ease';
import { cursorAtDepth, useCloseUp } from './closeup';
import { useCreatureKit, type CreatureKit } from './kit';
import { useAccent, type V3 } from './shared';
import { useGeometry } from './shapes';

/** Where the viewer stands in the park, and which way it faces (its lenses
 *  look down its −z). Park frame; the Park places the viewer from this too. */
export const VIEWER = { pos: [-0.1, 0, 0.34] as V3, yaw: -0.35 };

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
const TELL = 0.6; // s a home stirs before its creature comes out
const UP = [3.2, 1.9]; // s one stays out: with none caught yet, and with all but one (in step between)
const GAP = [0.8, 1.8]; // s from one going back in to the next home stirring (at random within)
// the cursor within `reach` of it (or of its own size, if that's more), the
// viewer within `tol` rad of it: held `hold` s, the shot
const LOCK = { reach: 0.035, tol: 0.1, hold: 0.45 };
// all of them caught: a beat, the viewer's roll call (a picture of each, `each`
// s apart), a pose, the group photo, and the print, up for `print` s
const FINALE = { wait: 1.4, each: 0.62, pose: 0.8, print: 6 };
const SAID = 2.4; // s the bubble says one's been captured
const MOLE_RIM = 0.012; // the molehill's rim: what of the mole is lower than this is down the hole

type Id = 'orbitot' | 'pinboo' | 'cameleon' | 'moletage' | 'driftnot' | 'chatterkeet' | 'jerboost';
/** Each creature: its name, the side of it you see (how far it turns from
 *  facing the camera, as it was posed in its portrait), its home in the park
 *  (park frame: spots the close-up's camera sees past the trees and the
 *  viewer, clear of the path, the jetty and each other) and the piece of the
 *  kit that home is, and two of its colours for the group photo's print. */
const CREATURES: { id: Id; name: string; view: number; home: [number, number]; piece?: keyof CreatureKit; print: [string, string] }[] = [
  { id: 'orbitot', name: 'Orbitot', view: 0.25, home: [-0.14, 0.12], print: ['#ecc995', '#d4c09c'] }, // Sol.AR: a little Saturn, rising out of the lake
  { id: 'pinboo', name: 'Pinboo', view: 0.3, home: [0.27, 0.26], piece: 'pinboo_dot', print: ['#ff6a54', '#fffaf3'] }, // location AR: dropped on the map, never quite on its dot
  { id: 'cameleon', name: 'Cameleon', view: 0.9, home: [-0.05, -0.25], piece: 'cameleon_root', print: ['#27a898', '#8fd96a'] }, // ARCam: lenses for eyes, there all along
  { id: 'moletage', name: 'Moletage', view: 0.35, home: [0.37, 0.11], piece: 'moletage_hill', print: ['#4c4860', '#ff6a13'] }, // Amsterdam Underground: up out of its molehill
  { id: 'driftnot', name: 'Driftnot', view: 0.2, home: [0.1, 0.28], piece: 'driftnot_anchor', print: ['#ffffff', '#e0553a'] }, // the AR framework's cloud anchors
  { id: 'chatterkeet', name: 'Chatterkeet', view: 0.7, home: [0.21, -0.13], piece: 'chatterkeet_post', print: ['#2c9a46', '#5a2a24'] }, // the Amsterdam AI guides
  { id: 'jerboost', name: 'Jerboost', view: 1.15, home: [0.11, 0.03], piece: 'jerboost_ramp', print: ['#e2bd86', '#f3c443'] }, // Lightship Drive's crown, its ramp on the path
];

/** How a creature's body sits on its home, frame to frame: an offset (in its
 *  own frame, facing +X), a turn and a roll, a size (about its middle), how
 *  much of it shows (its camouflage coming off, pixel by pixel) and how solid. */
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
/** Each one's own way of coming out (`enter`, over `in` s) and going back in
 *  (`leave`, over `out` s), and what it gets up to while it's out (`idle`; its
 *  `busy` is how much, calmer once it's real). `top` is how tall it is, for
 *  the ones that come up from under. */
interface Moves {
  in: number;
  out: number;
  enter(p: Pose, t: number, top: number): void;
  leave(p: Pose, t: number, top: number): void;
  idle(p: Pose, t: number, busy: number): void;
}
const MOVES: Record<Id, Moves> = {
  // rises out of the lake, spinning, and sinks back into it
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
    idle: (p, t, busy) => {
      p.y = 0.004 * Math.sin(t * 1.5);
      p.yaw = 0.35 * Math.sin(t * 0.45) * busy;
    },
  },
  // dropped onto the map from above, a bounce, and off its dot it drifts;
  // gone like a ghost
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
    idle: (p, t, busy) => {
      p.x = 0.012 * Math.sin(t * 0.7) * busy;
      p.z = 0.009 * Math.sin(t * 1.1 + 1) * busy;
      p.y = 0.004 * Math.sin(t * 2);
      p.roll = 0.08 * Math.sin(t * 1.3) * busy;
    },
  },
  // there on its root all along: its camouflage comes off, pixel by pixel,
  // and goes back on
  cameleon: {
    in: 0.7,
    out: 0.6,
    enter: (p, t) => {
      p.show = easeOut(t);
    },
    leave: (p, t) => {
      p.show = 1 - easeIn(t);
    },
    idle: (p, t, busy) => {
      p.yaw = 0.15 * Math.sin(t * 0.6) * busy;
    },
  },
  // pops up out of its molehill, and ducks back down it
  moletage: {
    in: 0.4,
    out: 0.28,
    enter: (p, t, top) => {
      p.y = -top * (1 - easeOutBack(t, 1.8));
    },
    leave: (p, t, top) => {
      p.y = -top * easeIn(t);
    },
    idle: (p, t, busy) => {
      p.y = 0.0015 * bump(((t / 2.2) % 1) * 4) * busy;
      p.yaw = 0.18 * Math.sin(t * 0.9) * busy;
    },
  },
  // puffs up out of nothing over its anchor, and puffs away
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
    idle: (p, t, busy) => {
      p.yaw = 0.12 * Math.sin(t * 0.5) * busy;
      p.y = 0.003 * Math.sin(t * 1.1);
    },
  },
  // flies in and lands on its bollard, and flies off again
  chatterkeet: {
    in: 0.55,
    out: 0.5,
    enter: (p, t) => {
      const e = easeOut(t);
      p.x = -0.07 * (1 - e);
      p.y = 0.07 * (1 - e) * (1 - e) + 0.02 * bump(e);
      p.z = -0.03 * (1 - e);
      p.roll = 0.4 * (1 - t) * Math.sin(t * 18);
      p.fade = Math.min(1, t / 0.3);
    },
    leave: (p, t) => {
      const e = easeIn(t);
      p.x = 0.08 * e;
      p.y = 0.09 * e;
      p.z = 0.03 * e;
      p.roll = 0.3 * Math.sin(t * 16);
      p.fade = 1 - easeIn(t, 3);
    },
    idle: (p, t, busy) => {
      p.roll = 0.06 * Math.sin(t * 3.1) * busy;
      p.yaw = 0.2 * Math.sin(Math.floor(t / 1.4) * 2.3) * busy;
    },
  },
  // jumps in over its ramp, hops about on it, and jumps away
  jerboost: {
    in: 0.55,
    out: 0.5,
    enter: (p, t) => {
      p.x = -0.07 * (1 - t);
      p.y = 0.14 * t * (1 - t);
      p.fade = Math.min(1, t / 0.25);
    },
    leave: (p, t) => {
      p.x = 0.08 * t;
      p.y = 0.16 * t * (1 - t);
      p.fade = 1 - easeIn(t, 2);
    },
    idle: (p, t, busy) => {
      p.y = 0.01 * bump(((t / 0.9) % 1) * 1.6) * busy;
    },
  },
};

/** The group photo as it comes out: the park's teal, the lawn, and the seven
 *  of them in two rows, each a blob or two of its own colours, a snapshot. */
const PHOTO_ROWS: Id[][] = [
  ['driftnot', 'moletage', 'orbitot', 'pinboo'],
  ['cameleon', 'chatterkeet', 'jerboost'],
];
function groupPhoto(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 128);
  sky.addColorStop(0, '#2f7f86');
  sky.addColorStop(1, '#1d4f57');
  g.fillStyle = sky;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#244a3c';
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
      const [a, b] = CREATURES.find((d) => d.id === id)!.print;
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
          g.fillStyle = b;
          g.fillRect(x - 1.5 * k, y - 9 * k, 3 * k, 9 * k);
          blob(x, y - 13 * k, 3.6 * k, 5 * k, a);
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

// home: in it (its home stirring, if it's 'tell'); in: coming out; up: out
// and about; out: going back in
type Phase = 'home' | 'tell' | 'in' | 'up' | 'out';
interface Creature {
  g: Group | null; // at its home, turned to show you its side
  home: Group | null; // its home, which stirs
  body: Group | null; // and the creature itself
  phase: Phase;
  at: number; // when the phase began (or begins: a reset staggers their going)
  left: number; // s it has left out, counting down while you're not holding it
  face: number | null; // its turn, set while the close-up's open
  caught: boolean;
  caughtAt: number;
  cheerAt: number; // its picture taken in the roll call
  real: number; // 0 AR, 1 photographed (eased)
  seed: number;
}

const _pq = new Quaternion();
const _cam = new Vector3();
const _aim = new Vector3();
const _up = new Vector3();
const _pt = new Vector3();
const _p: Pose = rest({} as Pose);
const _q: Pose = rest({} as Pose);
/** A ring's light: the accent, added onto what's under it. */
function glowMat(color: string) {
  const m = new MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide });
  m.userData.lifeSkip = true;
  return m;
}

type CreatureMat = MeshStandardMaterial & { userData: { real: { value: number }; show: { value: number } } };
/** A creature's look (and its home's): the accent's light while it's AR, its
 *  own vertex colours once it's real (`real`, 0 → 1). The colours' alpha is
 *  how much a part glows (build_creatures.py). `show` below 1 drops pixels of
 *  it, in a fixed scatter: the chameleon's camouflage. */
function creatureMat(): CreatureMat {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, transparent: true, toneMapped: false });
  const real = { value: 0 };
  const show = { value: 1 };
  m.userData.lifeSkip = true;
  m.userData.real = real;
  m.userData.show = show;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uReal = real;
    sh.uniforms.uShow = show;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCrPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvCrPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uReal;\nuniform float uShow;\nvarying vec3 vCrPos;')
      .replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\n\tif ( uShow < 0.999 && fract( sin( dot( floor( vCrPos / 0.0035 ), vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ) > uShow ) discard;',
      )
      .replace('#include <color_fragment>', '#ifdef USE_COLOR_ALPHA\n\tdiffuseColor.rgb *= mix( vec3( 1.0 ), vColor.rgb, uReal );\n#endif')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR_ALPHA\n\ttotalEmissiveRadiance = mix( totalEmissiveRadiance, totalEmissiveRadiance * vColor.rgb * ( 1.0 + 6.0 * vColor.a ), uReal );\n#endif');
  };
  return m as CreatureMat;
}

export function ParkCritters({ slug }: { slug: string }) {
  const { accent } = useAccent();
  const close = useCloseUp(slug);
  const gl = useThree((s) => s.gl);
  // the creatures come up out of the ground and the lake: below it is cut away
  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);
  const accentC = useMemo(() => new Color(accent), [accent]);
  const white = useMemo(() => new Color('#ffffff'), []);
  // the models arrive the first time the close-up is opened
  const kit = useCreatureKit(close);
  // each one's middle (what you aim at, in its own frame), its top (where the
  // bubble goes, and how far down the ones that come up from under start), its
  // reach on the ground (its home's, if that's wider: the rings go round both),
  // and how near the cursor has to be
  const size = useMemo(
    () =>
      kit &&
      CREATURES.map((d) => {
        const flat = (g: (typeof kit)[keyof typeof kit]) => {
          g.computeBoundingBox();
          const b = g.boundingBox!;
          return Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2;
        };
        const g = kit[d.id];
        const foot = Math.max(0.022, flat(g), d.piece ? flat(kit[d.piece]) * 1.05 : 0);
        const b = g.boundingBox!;
        const half = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) / 2;
        return { c: b.getCenter(new Vector3()), top: b.max.y, foot, reach: Math.max(LOCK.reach, half * 0.8) };
      }),
    [kit],
  );
  // the roll call goes round them in the order the viewer sees them, left to right
  const roll = useMemo(() => {
    const heads = CREATURES.map((d) => bearing(d.home[0], d.home[1]));
    return { order: CREATURES.map((_, i) => i).sort((a, b) => heads[b] - heads[a]), mid: (Math.min(...heads) + Math.max(...heads)) / 2 };
  }, []);
  // each one's look and its home's; the creature is cut off at its home's ground (clip)
  const mats = useMemo(
    () =>
      CREATURES.map(() => {
        const clip = new Plane();
        const body = creatureMat();
        body.clippingPlanes = [clip];
        return { body, home: creatureMat(), clip };
      }),
    [],
  );
  useEffect(
    () => () =>
      mats.forEach((m) => {
        m.body.dispose();
        m.home.dispose();
      }),
    [mats],
  );
  const crs = useMemo<Creature[]>(() => CREATURES.map((_, i) => ({ g: null, home: null, body: null, phase: 'home', at: -99, left: 0, face: null, caught: false, caughtAt: -99, cheerAt: -99, real: 0, seed: i * 1.7 })), []);
  const frame = useRef<Group>(null); // the park's frame, to find the cursor in
  const clock = useRef(0);
  // who's out (or −1), when the next home stirs, the lock's build-up, the shot
  // asked for and on whom, when the homes first landed, and the finale's stage
  const game = useRef({ out: -1, next: 0, last: -1, lock: 0, focus: 0, pending: -1, seen: 0, wasClose: false, shownAt: -1, finale: 'none' as 'none' | 'roll' | 'pose' | 'shot' | 'print', finAt: 0, rolled: -1, printAt: -99 });
  // the rings: a home stirring, the AR anchor under the one out, the lock
  // filling round it, a burst as it's caught
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
    const paper = new MeshBasicMaterial({ color: '#f4f6f8', transparent: true, opacity: 0, toneMapped: false, side: DoubleSide });
    const photo = new MeshBasicMaterial({ map: groupPhoto(), transparent: true, opacity: 0, toneMapped: false, side: DoubleSide });
    paper.userData.lifeSkip = true;
    photo.userData.lifeSkip = true;
    return { paper, photo };
  }, []);
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
    // opening the close-up: the homes land (the first time), and someone comes out soon
    if (close && !G.wasClose) {
      if (G.shownAt < 0) G.shownAt = now;
      G.next = Math.max(G.next, now + 1.4);
    }
    G.wasClose = close;
    if (G.shownAt < 0) return;
    const caughtN = crs.filter((a) => a.caught).length;

    // --- a home stirs, now and then, while you're here to see it ---
    if (close && G.finale === 'none' && G.out < 0 && now > G.next) {
      const free = crs.map((_, i) => i).filter((i) => !crs[i].caught && crs[i].phase === 'home');
      const fresh = free.filter((i) => i !== G.last);
      const from = fresh.length ? fresh : free;
      const i = from[Math.floor(Math.random() * from.length)];
      if (i !== undefined) {
        crs[i].phase = 'tell';
        crs[i].at = now;
        G.out = i;
        G.last = i;
        play('critter-peek', { volume: 0.45 });
      } else G.next = now + 1;
    }

    // --- each one: its home stirring, coming out, out and about, going back in ---
    crs.forEach((a, i) => {
      const u = now - a.at;
      const mv = MOVES[CREATURES[i].id];
      const gone = () => {
        if (G.out !== i) return;
        G.out = -1;
        G.lock = 0;
        if (G.pending === i) G.pending = -1;
        G.next = now + GAP[0] + Math.random() * (GAP[1] - GAP[0]);
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
        a.left = UP[0] + (UP[1] - UP[0]) * Math.min(1, caughtN / (CREATURES.length - 1));
      } else if ((a.phase === 'in' || a.phase === 'up') && !a.caught && G.out === i) {
        // its time runs out, except while you're holding it in the viewer
        if (a.phase === 'up' && G.lock <= 0 && G.pending !== i) a.left -= dt;
        if ((a.phase === 'up' && a.left <= 0) || !close) {
          a.phase = 'out';
          a.at = now;
          if (G.pending === i) G.pending = -1;
          if (close) play('critter-away', { volume: 0.4 });
        }
      } else if (a.phase === 'out' && u > mv.out) {
        a.phase = 'home';
        a.at = now;
        gone();
      }
    });

    // --- the one out: point at it and the viewer locks on; hold, and it's photographed ---
    SAFARI.want = null;
    const oi = G.out;
    const o = oi >= 0 ? crs[oi] : null;
    let near = false;
    const live = !!o && !!o.body && (o.phase === 'in' || o.phase === 'up') && !o.caught;
    if (o && o.body && live) {
      // its middle, where it is now, in the park's frame; and the cursor at
      // that depth, so the ones up in the air are aimed at, not the lawn under them
      o.body.updateWorldMatrix(true, false);
      fr.worldToLocal(o.body.localToWorld(_aim.copy(size[oi].c)));
      near = close && !!cursorAtDepth(s, fr, _aim, cursor) && cursor.distanceTo(_aim) < size[oi].reach;
      const head = bearing(_aim.x, _aim.z);
      if (near || G.pending === oi) SAFARI.want = head;
      if (G.pending !== oi) G.lock = near ? Math.min(LOCK.hold, G.lock + dt) : Math.max(0, G.lock - dt * 2);
      if (G.lock >= LOCK.hold && G.pending < 0 && SAFARI.aiming && Math.abs(SAFARI.yaw - head) < LOCK.tol) {
        G.pending = oi;
        G.seen = SAFARI.fired;
        SAFARI.shoot = 1;
      }
    }
    // pointed at, its ring opens out round it and brightens (the viewer's found it)
    G.focus += ((near ? 1 : 0) - G.focus) * (1 - Math.exp(-dt * 8));
    // the shutter went on it: captured, and real from now on
    if (G.pending >= 0 && G.finale === 'none' && SAFARI.fired > G.seen) {
      const i = G.pending;
      const a = crs[i];
      a.caught = true;
      a.caughtAt = now;
      burstAt.current = { t: now, x: _aim.x, z: _aim.z, r: size[i].foot };
      play('critter-snap', { volume: 0.7 });
      // and over it, its name
      const el = saidEl.current;
      if (said.current && el && saidName.current) {
        said.current.position.set(_aim.x, GROUND + size[i].top + 0.008, _aim.z);
        saidName.current.textContent = CREATURES[i].name;
        el.removeAttribute('data-on');
        void el.offsetWidth; // start its animation over
        el.setAttribute('data-on', '');
      }
      G.pending = -1;
      G.out = -1;
      G.lock = 0;
      G.next = now + Math.max(GAP[1], 1.6);
      if (crs.every((b) => b.caught)) {
        G.finale = 'roll';
        G.finAt = now + Math.max(FINALE.wait, SAID);
        G.rolled = -1;
      }
    }

    // --- all seven: a picture of each, at home, then of them all, and the print ---
    if (G.finale === 'roll' && now > G.finAt) {
      const k = Math.floor((now - G.finAt) / FINALE.each);
      if (k < roll.order.length) {
        const j = roll.order[k];
        SAFARI.want = bearing(CREATURES[j].home[0], CREATURES[j].home[1]);
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
      SAFARI.want = roll.mid;
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
      // and the park lets them go: back into their homes, one after another,
      // AR again, and it starts over
      crs.forEach((a, k) => {
        a.caught = false;
        if (a.phase !== 'home') {
          a.phase = 'out';
          a.at = now + k * 0.15;
        }
      });
      G.finale = 'none';
      G.next = now + 3.5;
    }

    // --- how each one looks and moves ---
    fr.worldToLocal(s.camera.getWorldPosition(_cam));
    _up.set(0, 1, 0).transformDirection(fr.matrixWorld);
    crs.forEach((a, i) => {
      const g = a.g;
      const body = a.body;
      const d = CREATURES[i];
      const m = mats[i];
      if (!g || !body) return;
      // the homes land, one after another, the first time the close-up opens
      const land = easeOutBack(Math.min(1, Math.max(0, (now - G.shownAt - i * 0.08) / 0.45)), 2);
      g.visible = land > 0.002;
      if (!g.visible) return;
      // it shows you the side it was posed to show: turned from facing the
      // camera by its own `view` (set while you're in the close-up; it stays put after)
      if (close || a.face === null) a.face = d.view - Math.atan2(_cam.z - d.home[1], _cam.x - d.home[0]);
      g.rotation.y = a.face;
      a.real += ((a.caught ? 1 : 0) - a.real) * (1 - Math.exp(-dt * 4));
      const u = now - a.at;
      // its home stirs before it comes out
      const stir = a.phase === 'tell' ? bump(u / TELL) : 0;
      if (a.home) {
        a.home.scale.setScalar(land);
        a.home.rotation.set(0.03 * Math.sin(u * 37) * stir, 0, 0.05 * Math.sin(u * 45) * stir);
      }
      m.home.userData.real.value = a.real;
      m.home.color.copy(accentC).lerp(white, a.real);
      m.home.emissive.copy(accentC).lerp(white, a.real);
      m.home.emissiveIntensity = (0.5 + 0.7 * stir) * (1 - a.real) + 0.4 * a.real;
      m.home.opacity = Math.min(1, (0.62 + 0.3 * stir) * (1 - a.real) + a.real);
      const out = a.phase === 'in' || a.phase === 'up' || a.phase === 'out';
      body.visible = out;
      if (!out) return;
      // its own business, calmer once it's real, and how it comes and goes
      const mv = MOVES[d.id];
      const k = a.phase === 'in' ? Math.min(1, u / mv.in) : a.phase === 'out' ? Math.min(1, Math.max(0, u) / mv.out) : 1;
      rest(_p);
      rest(_q);
      mv.idle(_p, now + a.seed * 3, (1 - 0.4 * a.real) * (a.phase === 'in' ? k : a.phase === 'out' ? 1 - k : 1));
      if (a.phase === 'in') mv.enter(_q, k, size[i].top);
      else if (a.phase === 'out' && u > 0) mv.leave(_q, k, size[i].top);
      // a hop when its picture's taken in the roll call
      const cheer = bump((now - a.cheerAt) / 0.45);
      const sc = Math.max(0.0001, _p.scale * _q.scale * (1 + 0.08 * cheer));
      const c = size[i].c;
      body.position.set(_p.x + _q.x + (1 - sc) * c.x, _p.y + _q.y + 0.012 * cheer + (1 - sc) * c.y, _p.z + _q.z + (1 - sc) * c.z);
      body.rotation.set(0, _p.yaw + _q.yaw, _p.roll + _q.roll);
      body.scale.setScalar(sc);
      // anything of it below its home's ground (the molehill's rim, the lake) is cut away
      m.clip.setFromNormalAndCoplanarPoint(_up, fr.localToWorld(_pt.set(d.home[0], GROUND + (d.id === 'moletage' ? MOLE_RIM : 0), d.home[1])));
      // AR, it's the accent's light, a little unsteady; real, its own colours
      // (and the camera chameleon flashes back at the shutter)
      const flick = 0.85 + 0.15 * Math.sin(now * 23 + a.seed) * Math.sin(now * 7.3);
      const flash = d.id === 'cameleon' ? Math.max(0, 1 - (now - a.caughtAt) / 0.35) : 0;
      const b = m.body;
      b.userData.real.value = a.real;
      b.userData.show.value = _p.show * _q.show;
      b.color.copy(accentC).lerp(white, a.real);
      b.emissive.copy(accentC).lerp(white, a.real);
      b.emissiveIntensity = 0.75 * flick * (1 - a.real) + 0.45 * a.real + 2.5 * flash;
      b.opacity = _p.fade * _q.fade * (0.8 + 0.2 * a.real);
    });

    // --- the rings ---
    const pg = ping.current;
    if (pg) {
      // a home stirring: two AR pings spreading out from it
      const st = o && o.phase === 'tell' ? o : null;
      pg.visible = !!st;
      if (st) {
        const kk = (((now - st.at) / TELL) * 2) % 1;
        pg.position.set(CREATURES[oi].home[0], GROUND + 0.002, CREATURES[oi].home[1]);
        pg.scale.setScalar(size[oi].foot * (0.5 + 1.6 * easeOut(kk)));
        rings.ping.opacity = 0.85 * (1 - kk);
      }
    }
    const an = anchor.current;
    if (an) {
      an.visible = live;
      if (o && live) {
        const drop = o.phase === 'in' ? 1 - easeOut((now - o.at) / MOVES[CREATURES[oi].id].in) : 0; // spreading out as it comes
        an.position.set(_aim.x, GROUND + 0.002, _aim.z);
        an.scale.setScalar(size[oi].foot * (1.05 + 1.5 * drop + 0.08 * Math.sin(now * 5)) * (1 + 0.25 * G.focus));
        rings.anchor.opacity = 0.35 + 0.5 * drop + 0.1 * Math.sin(now * 5) + 0.45 * G.focus;
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
        rings.lock.opacity = 0.55 + 0.45 * p;
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
        rings.burst.opacity = 0.9 * (1 - u);
      }
    }

    // --- the print: out of the top of the viewer, up, turning to you, and away ---
    const pr = print.current;
    if (pr) {
      const u = now - G.printAt;
      const on = G.finale === 'print' && u < FINALE.print;
      pr.visible = on;
      if (on) {
        const rise = easeOutBack(Math.min(1, u / 1.1), 1.4);
        pr.position.set(VIEWER.pos[0], 0.36 + 0.16 * rise + 0.008 * Math.sin(u * 2), VIEWER.pos[2]);
        // face the camera: its turn in the park's frame
        const parent = pr.parent;
        if (parent) pr.quaternion.copy(parent.getWorldQuaternion(_pq).invert().multiply(s.camera.quaternion));
        pr.scale.setScalar(Math.min(1, u / 0.25));
        const fade = 1 - easeIn(Math.max(0, (u - (FINALE.print - 0.8)) / 0.8));
        printMats.paper.opacity = fade;
        // the picture develops, out of the dark
        printMats.photo.opacity = fade;
        printMats.photo.color.setScalar(0.12 + 0.88 * easeOut(Math.min(1, u / 2.2)));
      }
    }
  });

  return (
    <group ref={frame}>
      {kit &&
        CREATURES.map((d, i) => (
          <group
            key={d.id}
            position={[d.home[0], GROUND, d.home[1]]}
            ref={(g) => {
              crs[i].g = g;
            }}
            visible={false}
          >
            {/* its home, which stays put */}
            {d.piece && (
              <group
                ref={(g) => {
                  crs[i].home = g;
                }}
              >
                <mesh geometry={kit[d.piece]} material={mats[i].home} />
              </group>
            )}
            <group
              ref={(g) => {
                crs[i].body = g;
              }}
              visible={false}
            >
              <mesh geometry={kit[d.id]} material={mats[i].body} />
            </group>
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
      {/* the print: a white card, the picture on it */}
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
