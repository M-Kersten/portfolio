// ARCam's game, in the park (city.tsx Park). ARCam dropped characters into a
// show floor through a viewfinder, for a photo with them; here it's the park's
// own creatures, each made out of one of the projects (modelled in Blender:
// scripts/models/build_creatures.py), dropped in by AR one at a time, somewhere
// in the park, for a few seconds each. In the close-up, point at one: the
// viewer locks on and swings to it, a ring round it fills while you hold it,
// and the shutter goes. Photographed, it's captured, and a bubble over it says
// so: it's real from then on, in its own colours, staying in the park and going
// about its business. All ten, and they come together in front of the viewer
// for a group photo, the print rises out of it, and a while later the park lets
// them go and it starts again. Desktop only (a cursor to point with): phones
// and reduced motion keep the viewer's own sweep (city.tsx Binoculars).
import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { AdditiveBlending, CanvasTexture, Color, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, Quaternion, RingGeometry, SRGBColorSpace, Vector3, type Group, type Mesh } from 'three';
import { play } from '../../lib/sound';
import { bump, easeIn, easeOut, easeOutBack } from '../../lib/ease';
import { cursorAtDepth, useCloseUp } from './closeup';
import { useCreatureKit } from './kit';
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
const IN = 0.45; // s to drop in (or blink out: OUT)
const OUT = 0.35;
const STAY = 6; // s one stays out before it's gone again
const GAP = [1.1, 2.2]; // s between one going and the next coming (at random within)
// the cursor within `reach` of it (or of its own size, if that's more), the
// viewer within `tol` rad of it: held `hold` s, the shot
const LOCK = { reach: 0.035, tol: 0.09, hold: 0.7 };
// the finale: they gather (a stagger each), pose, the group photo, the print, and the reset
const FINALE = { wait: 1.2, stagger: 0.12, pose: 1.2, print: 6 };
const SAID = 2.4; // s the bubble says one's been captured

type Id = 'doodlefly' | 'ampeel' | 'pingpillar' | 'orbitot' | 'pinboo' | 'cameleon' | 'moletage' | 'driftnot' | 'chatterkeet' | 'jerboost';
/** Each creature: its name, the side of it you see (how far it turns from
 *  facing the camera, as it was posed in its portrait), whether it lives in the
 *  lake, and two of its colours for the group photo's print. */
const CREATURES: { id: Id; name: string; view: number; water?: boolean; print: [string, string] }[] = [
  { id: 'doodlefly', name: 'Doodlefly', view: 1.25, print: ['#f2b98a', '#a99ae0'] }, // Kastwezens: a child's crayon butterfly
  { id: 'ampeel', name: 'Ampeel', view: 0.97, water: true, print: ['#2f6f7a', '#27e8f2'] }, // Alliander: the grid's eel
  { id: 'pingpillar', name: 'Pingpillar', view: 1.0, print: ['#f2f1ea', '#ff8b3d'] }, // Popcore: ping-pong balls
  { id: 'orbitot', name: 'Orbitot', view: 0.25, print: ['#ecc995', '#d4c09c'] }, // Sol.AR: a little Saturn
  { id: 'pinboo', name: 'Pinboo', view: 0.3, print: ['#ff6a54', '#fffaf3'] }, // location AR: GPS drifts
  { id: 'cameleon', name: 'Cameleon', view: 0.9, print: ['#27a898', '#8fd96a'] }, // ARCam: lenses for eyes
  { id: 'moletage', name: 'Moletage', view: 0.35, print: ['#4c4860', '#ff6a13'] }, // Amsterdam Underground
  { id: 'driftnot', name: 'Driftnot', view: 0.2, print: ['#ffffff', '#e0553a'] }, // the AR framework's cloud anchors
  { id: 'chatterkeet', name: 'Chatterkeet', view: 0.7, print: ['#2c9a46', '#5a2a24'] }, // the Amsterdam AI guides
  { id: 'jerboost', name: 'Jerboost', view: 1.15, print: ['#e2bd86', '#f3c443'] }, // Lightship Drive's crown
];
// Where they turn up (park frame): lawn the close-up's camera sees past the
// trees (measured from its view), clear of the lake, the trees and the viewer,
// each at least ROOM from the next, since the ones photographed stay; and the
// eel in the lake. A new one keeps ROOM clear of any already in the park.
const LAWN: [number, number][] = [[-0.34, -0.14], [-0.23, -0.09], [-0.1, -0.3], [-0.08, -0.18], [0.02, -0.09], [0.06, 0.37], [0.13, 0.27], [0.22, 0.33], [0.28, -0.02], [0.34, 0.14]];
const LAKE: [number, number][] = [[-0.2, 0.21], [-0.11, 0.16], [-0.17, 0.12]];
const ROOM = 0.1;
// the group photo: each one's place, in two rows across the open lawn
// between the trees and the lake, the tall and the flying ones at the back,
// the eel in the lake in front; across the water from the viewer
const GROUP: [number, number][] = [
  [-0.32, -0.135], [-0.14, 0.07], [0.06, -0.05], [-0.15, -0.135], [-0.12, -0.05],
  [0.02, -0.135], [-0.3, -0.05], [-0.235, -0.135], [-0.065, -0.135], [-0.03, -0.05],
];
const CENTRE = 4; // the one the viewer aims the group photo at
/** The butterfly's wings hinge on its body's line, this high (build_creatures.py:
 *  it flies 4 toy units up, at 0.0125 park units each). */
const WING_HINGE = 0.05;

/** The group photo as it comes out: the park's teal, the lawn, and the ten of
 *  them in two rows, each a blob or two of its own colours, a snapshot. */
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
  CREATURES.forEach((d, i) => {
    const back = i >= 5;
    const x = 14 + (i % 5) * 25 + (back ? 12 : 0);
    const y = back ? 66 : 96;
    const k = back ? 0.8 : 1;
    const [a, b] = d.print;
    switch (d.id) {
      case 'doodlefly':
        blob(x - 4 * k, y - 16 * k, 5 * k, 6 * k, a);
        blob(x + 4 * k, y - 16 * k, 5 * k, 6 * k, b);
        break;
      case 'ampeel':
        blob(x, y - 6 * k, 3 * k, 9 * k, a);
        blob(x + 1 * k, y - 13 * k, 3.5 * k, 3 * k, a);
        break;
      case 'pingpillar':
        for (let j = 0; j < 4; j++) blob(x - 7 * k + j * 4 * k, y - 4 * k - (j === 1 || j === 2 ? 4 * k : 0), 3 * k, 3 * k, a);
        blob(x + 9 * k, y - 4 * k, 3.6 * k, 3.6 * k, b);
        break;
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
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

type Phase = 'away' | 'in' | 'out' | 'leaving';
interface Creature {
  g: Group | null; // its spot, its turn, its drop-in
  body: Group | null; // and inside that, its own business
  wings: (Group | null)[];
  phase: Phase;
  at: number; // when the phase began
  x: number;
  z: number;
  spot: number; // the spot it's at in its pool (−1: the group photo)
  caught: boolean;
  caughtAt: number;
  real: number; // 0 an AR drop-in, 1 photographed (eased)
  seed: number;
}

const _pq = new Quaternion();
const _cam = new Vector3();
const _aim = new Vector3();
/** A ring's light: the accent, added onto what's under it. */
function glowMat(color: string) {
  const m = new MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide });
  m.userData.lifeSkip = true;
  return m;
}

/** A creature's look: the accent's light while it's an AR drop-in, its own
 *  vertex colours once it's real (`real`, 0 → 1). The colours' alpha is how
 *  much a part glows of its own colour (build_creatures.py). */
function creatureMat() {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, transparent: true, toneMapped: false });
  const real = { value: 0 };
  m.userData.lifeSkip = true;
  m.userData.real = real;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uReal = real;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uReal;')
      .replace('#include <color_fragment>', '#ifdef USE_COLOR_ALPHA\n\tdiffuseColor.rgb *= mix( vec3( 1.0 ), vColor.rgb, uReal );\n#endif')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR_ALPHA\n\ttotalEmissiveRadiance = mix( totalEmissiveRadiance, totalEmissiveRadiance * vColor.rgb * ( 1.0 + 6.0 * vColor.a ), uReal );\n#endif');
  };
  return m as MeshStandardMaterial & { userData: { real: { value: number } } };
}

export function ParkCritters({ slug }: { slug: string }) {
  const { accent } = useAccent();
  const close = useCloseUp(slug);
  const accentC = useMemo(() => new Color(accent), [accent]);
  const white = useMemo(() => new Color('#ffffff'), []);
  // the models arrive the first time the close-up is opened
  const kit = useCreatureKit(close);
  // each one's middle (what you aim at), its top (where the bubble goes) and its reach on the ground
  const size = useMemo(
    () =>
      kit &&
      CREATURES.map((d) => {
        const g = kit[d.id];
        g.computeBoundingBox();
        const b = g.boundingBox!;
        return { mid: (b.min.y + b.max.y) / 2, top: b.max.y, foot: Math.max(0.022, Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2) };
      }),
    [kit],
  );
  const mats = useMemo(() => CREATURES.map(() => creatureMat()), []);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  const crs = useMemo<Creature[]>(() => CREATURES.map((_, i) => ({ g: null, body: null, wings: [null, null], phase: 'away', at: -99, x: 0, z: 0, spot: -1, caught: false, caughtAt: -99, real: 0, seed: i * 1.7 })), []);
  const frame = useRef<Group>(null); // the park's frame, to find the cursor in
  const clock = useRef(0);
  // who's out (or −1), when the next one comes, the lock's build-up, the shot
  // asked for and on whom, and the finale's stage and when it began
  const game = useRef({ out: -1, next: 2, last: -1, lock: 0, focus: 0, pending: -1, seen: 0, finale: 'none' as 'none' | 'gather' | 'pose' | 'shot' | 'print', finAt: 0, printAt: -99 });
  // the rings: the AR anchor under the one out, the lock filling round it, a burst as it's caught
  const anchor = useRef<Mesh>(null);
  const lockRing = useRef<Mesh>(null);
  const burst = useRef<Mesh>(null);
  const burstAt = useRef({ t: -99, x: 0, z: 0, r: 0.03 });
  const ringGeo = useGeometry(() => new RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2));
  const LOCK_SEGS = 48;
  const lockGeo = useGeometry(() => new RingGeometry(0.62, 0.8, LOCK_SEGS, 1, Math.PI / 2, Math.PI * 2).rotateX(-Math.PI / 2));
  const rings = useMemo(() => ({ anchor: glowMat(accent), lock: glowMat(accent), burst: glowMat(accent) }), [accent]);
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
    const pool = (i: number) => (CREATURES[i].water ? LAKE : LAWN);

    // --- someone new turns up, now and then, while you're here to see it ---
    if (close && G.finale === 'none' && G.out < 0 && now > G.next) {
      // a creature not yet caught, at a spot of its kind clear of everyone in
      // the park (somewhere new, if it can be)
      const room = (i: number) => {
        const clear = pool(i).map((_, k) => k).filter((k) => crs.every((b, j) => j === i || b.phase === 'away' || Math.hypot(b.x - pool(i)[k][0], b.z - pool(i)[k][1]) > ROOM));
        const fresh = clear.filter((k) => k !== crs[i].spot);
        return fresh.length ? fresh : clear;
      };
      const free = crs.map((_, i) => i).filter((i) => !crs[i].caught && crs[i].phase === 'away' && room(i).length > 0);
      const pick = free.filter((i) => i !== G.last);
      const i = (pick.length ? pick : free)[Math.floor(Math.random() * (pick.length || free.length))];
      if (i !== undefined) {
        const a = crs[i];
        const spots = room(i);
        a.spot = spots[Math.floor(Math.random() * spots.length)];
        [a.x, a.z] = pool(i)[a.spot];
        a.phase = 'in';
        a.at = now;
        G.out = i;
        G.last = i;
        play('critter-in', { volume: 0.5 });
      } else G.next = now + 1;
    }

    // --- each one: dropping in, out and about, blinking out ---
    crs.forEach((a, i) => {
      const u = now - a.at;
      if (a.phase === 'in' && u > IN) {
        a.phase = 'out';
        a.at = now;
      } else if (a.phase === 'out' && !a.caught && G.out === i && (u > STAY || !close) && G.pending !== i) {
        a.phase = 'leaving';
        a.at = now;
      } else if (a.phase === 'leaving' && u > OUT) {
        a.phase = 'away';
        a.at = now;
        if (G.out === i) {
          G.out = -1;
          G.lock = 0;
          G.next = now + GAP[0] + Math.random() * (GAP[1] - GAP[0]);
        }
      }
    });

    // --- the one out: point at it and the viewer locks on; hold, and it's photographed ---
    SAFARI.want = null;
    const oi = G.out;
    const o = oi >= 0 ? crs[oi] : null;
    let near = false;
    if (o && o.phase === 'out' && !o.caught) {
      // where the cursor is at its depth, against its middle: so the ones up in the air are aimed at, not the lawn under them
      _aim.set(o.x, GROUND + size[oi].mid, o.z);
      near = close && !!cursorAtDepth(s, fr, _aim, cursor) && cursor.distanceTo(_aim) < Math.max(LOCK.reach, size[oi].foot * 0.85);
      const head = bearing(o.x, o.z);
      if (near || G.pending === oi) SAFARI.want = head;
      const on = near && SAFARI.aiming && Math.abs(SAFARI.yaw - head) < LOCK.tol;
      G.lock = on ? Math.min(LOCK.hold, G.lock + dt) : G.pending === oi ? G.lock : Math.max(0, G.lock - dt * 1.5);
      if (G.lock >= LOCK.hold && G.pending < 0) {
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
      burstAt.current = { t: now, x: a.x, z: a.z, r: size[i].foot };
      play('critter-snap', { volume: 0.7 });
      // and over it, its name
      const el = saidEl.current;
      if (said.current && el && saidName.current) {
        said.current.position.set(a.x, GROUND + size[i].top + 0.01, a.z);
        saidName.current.textContent = CREATURES[i].name;
        el.removeAttribute('data-on');
        void el.offsetWidth; // start its animation over
        el.setAttribute('data-on', '');
      }
      G.pending = -1;
      G.out = -1;
      G.lock = 0;
      G.next = now + GAP[1];
      if (crs.every((b) => b.caught)) {
        G.finale = 'gather';
        G.finAt = now + Math.max(FINALE.wait, SAID);
      }
    }

    // --- all ten: together in two rows before the viewer, the group photo, the print ---
    if (G.finale === 'gather' && now > G.finAt) {
      crs.forEach((a, i) => {
        const t0 = G.finAt + i * FINALE.stagger;
        if (now > t0 && a.spot >= 0 && a.phase === 'out') {
          a.phase = 'leaving';
          a.at = now;
        } else if (a.spot >= 0 && a.phase === 'away') {
          // gone from its spot: in again at its place in the rows
          a.spot = -1;
          [a.x, a.z] = GROUP[i];
          a.phase = 'in';
          a.at = now;
          if (i === 0) play('critter-in', { volume: 0.5 });
        }
      });
      if (crs.every((a) => a.spot < 0 && a.phase === 'out')) {
        G.finale = 'pose';
        G.finAt = now;
      }
    }
    if (G.finale === 'pose' || G.finale === 'shot') {
      SAFARI.want = bearing(GROUP[CENTRE][0], GROUP[CENTRE][1]);
      if (G.finale === 'pose' && now - G.finAt > FINALE.pose) {
        G.finale = 'shot';
        G.seen = SAFARI.fired;
        SAFARI.shoot = 2;
      } else if (G.finale === 'shot' && SAFARI.fired > G.seen) {
        G.finale = 'print';
        G.printAt = now;
        play('critter-group', { volume: 0.8 });
      }
    }
    if (G.finale === 'print' && now - G.printAt > FINALE.print) {
      // and the park lets them go: back to AR, and it starts over
      crs.forEach((a) => {
        a.caught = false;
        if (a.phase !== 'away') {
          a.phase = 'leaving';
          a.at = now;
        }
      });
      G.finale = 'none';
      G.next = now + 2.5;
    }

    // --- how each one looks and moves ---
    fr.worldToLocal(s.camera.getWorldPosition(_cam));
    crs.forEach((a, i) => {
      const g = a.g;
      const body = a.body;
      const m = mats[i];
      if (!g || !body) return;
      const u = now - a.at;
      const vis = a.phase === 'away' ? 0 : a.phase === 'in' ? easeOutBack(Math.min(1, u / IN), 2.2) : a.phase === 'leaving' ? 1 - easeIn(u / OUT) : 1;
      g.visible = vis > 0.002;
      if (!g.visible) return;
      a.real += ((a.caught ? 1 : 0) - a.real) * (1 - Math.exp(-dt * 4));
      // it shows you the side it was posed to show: turned from facing the
      // camera by its own `view` (for the group photo too: it's you they pose for)
      g.position.set(a.x, GROUND, a.z);
      g.rotation.set(0, CREATURES[i].view - Math.atan2(_cam.z - a.z, _cam.x - a.x), 0);
      g.scale.setScalar(Math.max(0, vis));
      // its own business, calmer once it's real (and still for the group photo)
      const t = now + a.seed * 3;
      const busy = a.spot < 0 ? 0.15 : 1 - 0.4 * a.real;
      let bx = 0;
      let by = 0;
      let bz = 0;
      let yaw = 0;
      let roll = 0;
      let stretch = 1;
      switch (CREATURES[i].id) {
        case 'doodlefly': {
          // fluttering in a small round, wings beating
          bx = Math.cos(t * 0.8) * 0.02 * busy;
          bz = Math.sin(t * 0.8) * 0.02 * busy;
          by = 0.007 * Math.sin(t * 2.3);
          yaw = 0.3 * Math.sin(t * 0.8) * busy;
          const flap = 0.15 + 0.5 * (0.5 + 0.5 * Math.sin(t * 15));
          if (a.wings[0]) a.wings[0].rotation.x = flap;
          if (a.wings[1]) a.wings[1].rotation.x = -flap;
          break;
        }
        case 'ampeel': // rising and sinking a little, swaying
          by = -0.004 + 0.004 * Math.sin(t * 1.2);
          yaw = 0.25 * Math.sin(t * 0.5) * busy;
          break;
        case 'pingpillar': // inching: a stretch and a gather
          stretch = 1 + 0.07 * Math.sin(t * 3) * busy;
          bx = 0.008 * Math.sin(t * 0.6) * busy;
          break;
        case 'orbitot': // bobbing in the air, turning on its axis to and fro
          by = 0.006 * Math.sin(t * 1.5);
          yaw = 0.35 * Math.sin(t * 0.45) * busy;
          break;
        case 'pinboo': // never quite where its dot is: drifting off it and back
          bx = 0.016 * Math.sin(t * 0.7) * busy;
          bz = 0.012 * Math.sin(t * 1.1 + 1) * busy;
          by = 0.005 * Math.sin(t * 2);
          roll = 0.08 * Math.sin(t * 1.3) * busy;
          break;
        case 'cameleon': // slow, a turn of the head now and then
          yaw = 0.15 * Math.sin(t * 0.6) * busy;
          break;
        case 'moletage': // a little hop now and then, the cable held up
          by = 0.002 * bump(((t / 2.2) % 1) * 4) * busy;
          break;
        case 'driftnot': // the cloud tugging round on its chain
          yaw = 0.12 * Math.sin(t * 0.5) * busy;
          break;
        case 'chatterkeet': // bobbing as it talks, a look round now and then
          roll = 0.06 * Math.sin(t * 3.1) * busy;
          yaw = 0.2 * Math.sin(Math.floor(t / 1.4) * 2.3) * busy;
          break;
        case 'jerboost': // the leap, over and over, off the ramp
          by = 0.012 * bump(((t / 1.3) % 1) * 2) * busy;
          bx = 0.004 * Math.sin((t / 1.3) * Math.PI * 2) * busy;
          break;
      }
      body.position.set(bx, by, bz);
      body.rotation.set(0, yaw, roll);
      body.scale.set(stretch, 1, 1);
      // AR, it's the accent's light, a little unsteady; real, its own colours
      // (and the camera chameleon flashes back at the shutter)
      const flick = 0.85 + 0.15 * Math.sin(now * 23 + a.seed) * Math.sin(now * 7.3);
      const flash = CREATURES[i].id === 'cameleon' ? Math.max(0, 1 - (now - a.caughtAt) / 0.35) : 0;
      m.userData.real.value = a.real;
      m.color.copy(accentC).lerp(white, a.real);
      m.emissive.copy(accentC).lerp(white, a.real);
      m.emissiveIntensity = 0.75 * flick * (1 - a.real) + 0.2 * a.real + 2.5 * flash;
      m.opacity = Math.min(1, vis) * (0.78 + 0.22 * a.real);
    });

    // --- the rings ---
    const an = anchor.current;
    if (an) {
      const show = o && (o.phase === 'in' || o.phase === 'out') && !o.caught;
      an.visible = !!show;
      if (o && show) {
        const u = now - o.at;
        const drop = o.phase === 'in' ? 1 - easeOut(u / IN) : 0; // spreading out as it lands
        an.position.set(o.x, GROUND + 0.002, o.z);
        an.scale.setScalar(size[oi].foot * (1.05 + 1.5 * drop + 0.08 * Math.sin(now * 5)) * (1 + 0.25 * G.focus));
        rings.anchor.opacity = 0.35 + 0.5 * drop + 0.1 * Math.sin(now * 5) + 0.45 * G.focus;
      }
    }
    const lr = lockRing.current;
    if (lr) {
      const p = G.lock / LOCK.hold;
      lr.visible = !!o && p > 0.01;
      if (o && lr.visible) {
        lr.position.set(o.x, GROUND + 0.003, o.z);
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
            ref={(g) => {
              crs[i].g = g;
            }}
            visible={false}
          >
            {/* what stays put while it moves: the pin's map dot, the jerboa's ramp */}
            {d.id === 'pinboo' && <mesh geometry={kit.pinboo_dot} material={mats[i]} />}
            {d.id === 'jerboost' && <mesh geometry={kit.jerboost_ramp} material={mats[i]} />}
            <group
              ref={(g) => {
                crs[i].body = g;
              }}
            >
              <mesh geometry={kit[d.id]} material={mats[i]} />
              {/* the butterfly's wings beat about the line of its body */}
              {d.id === 'doodlefly' &&
                ([kit.doodlefly_wing0, kit.doodlefly_wing1] as const).map((w, k) => (
                  <group
                    key={k}
                    position={[0, WING_HINGE, 0]}
                    ref={(g) => {
                      crs[i].wings[k] = g;
                    }}
                  >
                    <mesh geometry={w} material={mats[i]} position={[0, -WING_HINGE, 0]} />
                  </group>
                ))}
            </group>
          </group>
        ))}
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
