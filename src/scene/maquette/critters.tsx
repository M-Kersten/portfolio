// ARCam's game, in the park (city.tsx Park). ARCam dropped characters into a
// show floor through a viewfinder, for a photo with them; here it's the
// animals of a Dutch park, dropped in by AR one at a time, somewhere in the
// park, for a few seconds each. In the close-up, point at one: the viewer locks
// on and swings to it, a ring round it fills while you hold it, and the
// shutter goes. Photographed, it's real: it stays in the park, solid, going
// about its business. All five, and they come together in front of the viewer
// for a group photo, the print rises out of it, and a while later the park
// lets them go and it starts again. Desktop only (a cursor to point with):
// phones and reduced motion keep the viewer's own sweep (city.tsx Binoculars).
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, CanvasTexture, CapsuleGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Euler, MeshBasicMaterial, MeshStandardMaterial, Quaternion, RingGeometry, SphereGeometry, SRGBColorSpace, Vector3, type BufferGeometry, type Group, type Mesh } from 'three';
import { play } from '../../lib/sound';
import { bump, easeIn, easeOut, easeOutBack } from '../../lib/ease';
import { cursorOnLevel, useCloseUp } from './closeup';
import { useAccent, type V3 } from './shared';
import { merge, place, tube, useGeometry } from './shapes';

/** Where the viewer stands in the park, and which way it faces (its lenses
 *  look down its −z). Park frame; the Park places the viewer from this too. */
export const VIEWER = { pos: [-0.1, 0, 0.34] as V3, yaw: -0.35 };

/** What the viewer and the animals tell each other, frame to frame (plain
 *  mutable data). The animals set `want`, a heading in the viewer's own frame
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
const SIZE = 1.35; // the animals are toys of themselves: bigger than to scale, so they read
const IN = 0.45; // s to drop in (or blink out: OUT)
const OUT = 0.35;
const STAY = 5.5; // s one stays out before it's gone again
const GAP = [1.1, 2.2]; // s between one going and the next coming (at random within)
const LOCK = { reach: 0.075, tol: 0.09, hold: 0.7 }; // the cursor within `reach` of it, the viewer within `tol` rad: held `hold` s, the shot
// the finale: they gather (a stagger each), pose, the group photo, the print, and the reset
const FINALE = { wait: 1.2, stagger: 0.14, pose: 1.1, print: 6 };

type Kind = 'rabbit' | 'hedgehog' | 'squirrel' | 'heron' | 'fox';
/** Each animal, the spots it turns up at (park frame: x, z, which way it
 *  faces; 0.7 and 3.9 turn it side-on to the close-up, so its outline reads),
 *  and its own colour once it's photographed and real. The spots are in the
 *  open, where the close-up sees past the trees, and within the viewer's turn. */
const ANIMALS: { kind: Kind; spots: [number, number, number][]; fur: string }[] = [
  { kind: 'rabbit', spots: [[0.08, 0.3, 3.9], [-0.33, -0.04, 0.7], [0.3, 0.33, 3.8]], fur: '#b9a68e' },
  { kind: 'hedgehog', spots: [[-0.3, -0.13, 0.8], [0.12, 0.25, 3.9]], fur: '#8c7058' },
  { kind: 'squirrel', spots: [[0.17, 0.28, 0.6], [-0.17, -0.19, 3.8], [-0.3, -0.24, 0.8]], fur: '#c4703c' },
  { kind: 'heron', spots: [[-0.2, 0.21, 0.7], [-0.06, 0.25, 3.9]], fur: '#cfd8e0' },
  { kind: 'fox', spots: [[0.38, 0.2, 0.7], [-0.1, -0.33, 0.7]], fur: '#d8793a' },
];
// the group photo: a row at the park's front edge, on the viewer's right, each facing it
const GROUP: [number, number][] = [[0.02, 0.43], [0.08, 0.41], [0.14, 0.39], [0.2, 0.36], [0.26, 0.33]];

/* ---------- the animals, from a few simple shapes each (facing +x, feet at 0) ---------- */

const sph = (r: number, w = 10, h = 8) => new SphereGeometry(r, w, h);
const cone = (r: number, h: number, seg = 7) => new ConeGeometry(r, h, seg);
const rod = (r0: number, r1: number, h: number) => new CylinderGeometry(r0, r1, h, 6);
const pill = (r: number, len: number) => new CapsuleGeometry(r, len, 3, 8);
const ALONG_X: V3 = [0, 0, -Math.PI / 2]; // a cone or a capsule laid along +x
const _q = new Quaternion();
const _e = new Euler();
const Y = new Vector3(0, 1, 0);

/** A turn that points a part's +y along `n`, as place() takes it. */
function toward(n: Vector3): V3 {
  _e.setFromQuaternion(_q.setFromUnitVectors(Y, n.normalize()));
  return [_e.x, _e.y, _e.z];
}

const BUILD: Record<Kind, () => BufferGeometry> = {
  // sitting up: a round body over its haunch, the head, two long ears laid back, the scut
  rabbit: () =>
    merge([
      place(sph(0.016), [0, 0.017, 0], [0, 0, 0], [1.2, 1.05, 0.95]),
      place(sph(0.013), [-0.008, 0.012, 0]),
      place(sph(0.0105), [0.017, 0.034, 0]),
      place(sph(0.005, 8, 6), [0.026, 0.031, 0]),
      place(pill(0.0028, 0.02), [0.011, 0.055, 0.0045], [0.15, 0, 0.3]),
      place(pill(0.0028, 0.02), [0.011, 0.055, -0.0045], [-0.15, 0, 0.3]),
      place(sph(0.0055, 8, 6), [-0.022, 0.021, 0]),
    ]),
  // a low dome bristling with spines all over the back, a pointed snout
  hedgehog: () => {
    const body = { c: [0, 0.013, 0], a: [0.027, 0.016, 0.022] };
    const parts = [place(sph(1, 12, 8), body.c as V3, [0, 0, 0], body.a as V3)];
    for (const [el, n, from] of [[0.25, 11, 0.75], [0.7, 9, 0.85], [1.1, 6, 1.1]] as const) {
      for (let i = 0; i < n; i++) {
        const az = from + (i / (n - 1)) * (Math.PI * 2 - 2 * from);
        const d = new Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
        const at: V3 = [body.c[0] + d.x * body.a[0], body.c[1] + d.y * body.a[1], body.c[2] + d.z * body.a[2]];
        const nrm = new Vector3(d.x / body.a[0], d.y / body.a[1], d.z / body.a[2]);
        // each one swept back a little, the way they lie
        parts.push(place(cone(0.0042, 0.013, 5), at, toward(nrm.normalize().add(new Vector3(-0.35, 0.2, 0)))));
      }
    }
    parts.push(place(cone(0.006, 0.016), [0.031, 0.01, 0], ALONG_X));
    parts.push(place(sph(0.0024, 6, 4), [0.039, 0.01, 0]));
    return merge(parts);
  },
  // sat up on its haunches, the tail a big curl up its back
  squirrel: () =>
    merge([
      place(sph(0.011), [0, 0.017, 0], [0, 0, -0.25], [0.9, 1.35, 0.85]),
      place(sph(0.0085), [0.008, 0.037, 0]),
      place(cone(0.0028, 0.008, 5), [0.006, 0.047, 0.0035]),
      place(cone(0.0028, 0.008, 5), [0.006, 0.047, -0.0035]),
      place(sph(0.0036, 6, 4), [0.016, 0.035, 0]),
      tube([[-0.006, 0.008, 0], [-0.019, 0.013, 0], [-0.025, 0.027, 0], [-0.021, 0.042, 0], [-0.011, 0.05, 0], [-0.006, 0.045, 0]], 0.0068, 8, 24),
    ]),
  // on its stilts in the shallows: the body tipped tail-down, the S of the neck, the dagger of a beak
  heron: () =>
    merge([
      place(rod(0.0015, 0.0013, 0.036), [0.002, 0.018, 0.004]),
      place(rod(0.0015, 0.0013, 0.036), [-0.002, 0.018, -0.004]),
      place(sph(0.012), [0, 0.046, 0], [0, 0, 0.35], [1.6, 0.85, 0.8]),
      tube([[0.012, 0.05, 0], [0.019, 0.06, 0], [0.013, 0.07, 0], [0.017, 0.079, 0]], 0.0029, 6, 16),
      place(sph(0.0049), [0.019, 0.082, 0]),
      place(cone(0.0018, 0.021, 5), [0.031, 0.081, 0], ALONG_X),
    ]),
  // on its toes: a long body, the pointed muzzle and ears, the brush held low
  fox: () =>
    merge([
      place(pill(0.009, 0.024), [0, 0.026, 0], ALONG_X),
      ...([[0.013, 0.005], [0.013, -0.005], [-0.012, 0.005], [-0.012, -0.005]] as const).map(([x, z]) => place(rod(0.0022, 0.0017, 0.022), [x, 0.011, z])),
      place(sph(0.0085), [0.027, 0.034, 0]),
      place(cone(0.0048, 0.015), [0.038, 0.031, 0], ALONG_X),
      place(cone(0.0037, 0.011, 5), [0.025, 0.045, 0.0045], [0.2, 0, 0]),
      place(cone(0.0037, 0.011, 5), [0.025, 0.045, -0.0045], [-0.2, 0, 0]),
      place(pill(0.0068, 0.022), [-0.031, 0.021, 0], [0, 0, -1.1]),
    ]),
};

/** The group photo as it comes out: the park's teal, the lawn, and the five
 *  of them in a row in their own colours, small and plain, a snapshot. */
function groupPhoto(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 96);
  sky.addColorStop(0, '#2f7f86');
  sky.addColorStop(1, '#1d4f57');
  g.fillStyle = sky;
  g.fillRect(0, 0, 96, 96);
  g.fillStyle = '#244a3c';
  g.fillRect(0, 62, 96, 34);
  const blob = (x: number, y: number, rx: number, ry: number, col: string) => {
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  };
  const [rabbit, hedgehog, squirrel, heron, fox] = ANIMALS.map((a) => a.fur);
  blob(13, 62, 6, 6, rabbit); // the rabbit and its ears
  blob(11, 51, 1.6, 6, rabbit);
  blob(15, 51, 1.6, 6, rabbit);
  blob(30, 65, 8, 5, hedgehog);
  blob(48, 60, 5, 7, squirrel); // the squirrel and its curl of a tail
  blob(43, 53, 4, 7, squirrel);
  blob(64, 49, 6, 4, heron); // the heron on its legs, neck up
  g.fillStyle = heron;
  g.fillRect(63, 52, 1.5, 14);
  g.fillRect(66, 52, 1.5, 14);
  g.fillRect(68, 38, 1.8, 11);
  blob(70, 37, 2.5, 2.5, heron);
  blob(84, 62, 8, 4.5, fox); // the fox and its brush
  blob(92, 58, 3.5, 3.5, fox);
  blob(76, 64, 5, 2.4, fox);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

type Phase = 'away' | 'in' | 'out' | 'leaving';
interface Animal {
  g: Group | null;
  mat: MeshStandardMaterial | null;
  phase: Phase;
  at: number; // when the phase began
  x: number;
  z: number;
  face: number; // which way it faces (rad about y; 0 is +x)
  spot: number; // the spot it's at (−1: the group photo)
  caught: boolean;
  real: number; // 0 an AR drop-in, 1 photographed (eased)
  seed: number;
}

const _pq = new Quaternion();
/** A ring's light: the accent, added onto what's under it. */
function glowMat(color: string) {
  const m = new MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide });
  m.userData.lifeSkip = true;
  return m;
}

export function ParkCritters({ slug }: { slug: string }) {
  const { accent } = useAccent();
  const close = useCloseUp(slug);
  const accentC = useMemo(() => new Color(accent), [accent]);
  const furs = useMemo(() => ANIMALS.map((a) => new Color(a.fur)), []);
  const geos = useGeometry(() => Object.fromEntries(ANIMALS.map((a) => [a.kind, BUILD[a.kind]()])) as Record<Kind, BufferGeometry>);
  const animals = useMemo<Animal[]>(() => ANIMALS.map((_, i) => ({ g: null, mat: null, phase: 'away', at: -99, x: 0, z: 0, face: 0, spot: 0, caught: false, real: 0, seed: i * 1.7 })), []);
  const frame = useRef<Group>(null); // the park's frame, to find the cursor in
  const clock = useRef(0);
  // who's out (or −1), when the next one comes, the lock's build-up, the shot
  // asked for and on whom, and the finale's stage and when it began
  const game = useRef({ out: -1, next: 2, last: -1, lock: 0, focus: 0, pending: -1, seen: 0, finale: 'none' as 'none' | 'gather' | 'pose' | 'shot' | 'print', finAt: 0, printAt: -99 });
  // the rings: the AR anchor under the one out, the lock filling round it, a burst as it's caught
  const anchor = useRef<Mesh>(null);
  const lockRing = useRef<Mesh>(null);
  const burst = useRef<Mesh>(null);
  const burstAt = useRef({ t: -99, x: 0, z: 0 });
  const ringGeo = useGeometry(() => new RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2));
  const LOCK_SEGS = 48;
  const lockGeo = useGeometry(() => new RingGeometry(0.62, 0.8, LOCK_SEGS, 1, Math.PI / 2, Math.PI * 2).rotateX(-Math.PI / 2));
  const mats = useMemo(() => ({ anchor: glowMat(accent), lock: glowMat(accent), burst: glowMat(accent) }), [accent]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
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
    const pointing = close && !!frame.current && !!cursorOnLevel(s, frame.current, GROUND + 0.02, cursor);

    // --- someone new turns up, now and then, while you're here to see it ---
    if (close && G.finale === 'none' && G.out < 0 && now > G.next) {
      const free = animals.map((_, i) => i).filter((i) => !animals[i].caught && animals[i].phase === 'away');
      const pick = free.filter((i) => i !== G.last);
      const i = (pick.length ? pick : free)[Math.floor(Math.random() * (pick.length || free.length))];
      if (i !== undefined) {
        const a = animals[i];
        const spots = ANIMALS[i].spots;
        a.spot = (a.spot + 1 + Math.floor(Math.random() * (spots.length - 1 || 1))) % spots.length;
        [a.x, a.z, a.face] = spots[a.spot];
        a.phase = 'in';
        a.at = now;
        G.out = i;
        G.last = i;
        play('critter-in', { volume: 0.5 });
      }
    }

    // --- each one: dropping in, out and about, blinking out ---
    animals.forEach((a, i) => {
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
    const o = G.out >= 0 ? animals[G.out] : null;
    let near = false;
    if (o && o.phase === 'out' && !o.caught) {
      near = pointing && Math.hypot(cursor.x - o.x, cursor.z - o.z) < LOCK.reach * SIZE;
      const head = bearing(o.x, o.z);
      if (near || G.pending === G.out) SAFARI.want = head;
      const on = near && SAFARI.aiming && Math.abs(SAFARI.yaw - head) < LOCK.tol;
      G.lock = on ? Math.min(LOCK.hold, G.lock + dt) : G.pending === G.out ? G.lock : Math.max(0, G.lock - dt * 1.5);
      if (G.lock >= LOCK.hold && G.pending < 0) {
        G.pending = G.out;
        G.seen = SAFARI.fired;
        SAFARI.shoot = 1;
      }
    }
    // pointed at, its ring opens out round it and brightens (the viewer's found it)
    G.focus += ((near ? 1 : 0) - G.focus) * (1 - Math.exp(-dt * 8));
    // the shutter went on it: caught, and real from now on
    if (G.pending >= 0 && G.finale === 'none' && SAFARI.fired > G.seen) {
      const a = animals[G.pending];
      a.caught = true;
      burstAt.current = { t: now, x: a.x, z: a.z };
      play('critter-snap', { volume: 0.7 });
      G.pending = -1;
      G.out = -1;
      G.lock = 0;
      G.next = now + GAP[1];
      if (animals.every((b) => b.caught)) {
        G.finale = 'gather';
        G.finAt = now + FINALE.wait;
      }
    }

    // --- all five: together in a row before the viewer, the group photo, the print ---
    if (G.finale === 'gather' && now > G.finAt) {
      animals.forEach((a, i) => {
        const t0 = G.finAt + i * FINALE.stagger;
        if (now > t0 && a.spot >= 0 && a.phase === 'out') {
          a.phase = 'leaving';
          a.at = now;
        } else if (a.spot >= 0 && a.phase === 'away') {
          // gone from its spot: in again at its place in the row, facing the viewer
          a.spot = -1;
          [a.x, a.z] = GROUP[i];
          a.face = Math.atan2(-(VIEWER.pos[2] - a.z), VIEWER.pos[0] - a.x);
          a.phase = 'in';
          a.at = now;
          if (i === 0) play('critter-in', { volume: 0.5 });
        }
      });
      if (animals.every((a) => a.spot < 0 && a.phase === 'out')) {
        G.finale = 'pose';
        G.finAt = now;
      }
    }
    if (G.finale === 'pose' || G.finale === 'shot') {
      SAFARI.want = bearing(GROUP[2][0], GROUP[2][1]);
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
      animals.forEach((a) => {
        a.caught = false;
        if (a.phase !== 'away') {
          a.phase = 'leaving';
          a.at = now;
        }
        a.spot = 0;
      });
      G.finale = 'none';
      G.next = now + 2.5;
    }

    // --- how each one looks and moves ---
    animals.forEach((a, i) => {
      const g = a.g;
      const m = a.mat;
      if (!g || !m) return;
      const u = now - a.at;
      const vis = a.phase === 'away' ? 0 : a.phase === 'in' ? easeOutBack(Math.min(1, u / IN), 2.2) : a.phase === 'leaving' ? 1 - easeIn(u / OUT) : 1;
      g.visible = vis > 0.002;
      if (!g.visible) return;
      a.real += ((a.caught ? 1 : 0) - a.real) * (1 - Math.exp(-dt * 4));
      // its own business, calmer once it's real (and still for the group photo)
      const t = now + a.seed * 3;
      const busy = a.spot < 0 ? 0.15 : 1 - 0.4 * a.real;
      let y = 0;
      let face = a.face;
      let tip = 0;
      let ahead = 0; // a step forward or back, along the way it faces
      let ox = 0; // or off its spot in the park's frame
      let oz = 0;
      switch (ANIMALS[i].kind) {
        case 'rabbit': // a hop every so often, landing turned a little
          y = 0.012 * bump(((t / 1.5) % 1) * 3) * busy;
          face += Math.sin(Math.floor(t / 1.5) * 2.1) * 0.5 * busy;
          break;
        case 'hedgehog': // shuffling to and fro, snuffling
          ahead = 0.01 * Math.sin(t * 0.9) * busy;
          y = 0.0008 * Math.abs(Math.sin(t * 13)) * busy;
          break;
        case 'squirrel': // twitchy: quick turns and little jumps
          face += Math.sin(Math.floor(t / 0.8) * 2.7) * 0.7 * busy;
          y = 0.004 * bump(((t / 0.8) % 1) * 4) * busy;
          break;
        case 'heron': // stock-still, then a stab at the water
          tip = -0.45 * bump(Math.max(0, ((t / 4) % 1) * 6 - 5)) * busy;
          y = 0.0015 * Math.sin(t * 1.3);
          break;
        case 'fox': // trotting a small round, nose along it (still for the photo)
          if (a.spot >= 0) {
            const w = t * 0.9;
            ox = Math.cos(w) * 0.035;
            oz = Math.sin(w) * 0.035;
            face = Math.atan2(-Math.cos(w), -Math.sin(w));
            y = 0.003 * Math.abs(Math.sin(t * 12));
          }
          break;
      }
      g.position.set(a.x + ox + ahead * Math.cos(a.face), GROUND + y, a.z + oz - ahead * Math.sin(a.face));
      g.rotation.set(0, face, tip);
      g.scale.setScalar(SIZE * Math.max(0, vis));
      // AR, it's the accent's light, a little unsteady; real, its own colours
      const flick = 0.85 + 0.15 * Math.sin(now * 23 + a.seed) * Math.sin(now * 7.3);
      m.color.copy(accentC).lerp(furs[i], a.real);
      m.emissive.copy(accentC).lerp(furs[i], a.real);
      m.emissiveIntensity = 0.75 * flick * (1 - a.real) + 0.22 * a.real;
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
        an.scale.setScalar(SIZE * (0.034 + 0.05 * drop + 0.003 * Math.sin(now * 5)) * (1 + 0.25 * G.focus));
        mats.anchor.opacity = 0.35 + 0.5 * drop + 0.1 * Math.sin(now * 5) + 0.45 * G.focus;
      }
    }
    const lr = lockRing.current;
    if (lr) {
      const p = G.lock / LOCK.hold;
      lr.visible = !!o && p > 0.01;
      if (o && lr.visible) {
        lr.position.set(o.x, GROUND + 0.003, o.z);
        lr.scale.setScalar(SIZE * 0.05);
        lockGeo.setDrawRange(0, 6 * Math.ceil(LOCK_SEGS * Math.min(1, p)));
        mats.lock.opacity = 0.55 + 0.45 * p;
      }
    }
    const bu = burst.current;
    if (bu) {
      const b = burstAt.current;
      const u = (now - b.t) / 0.6;
      bu.visible = u >= 0 && u < 1;
      if (bu.visible) {
        bu.position.set(b.x, GROUND + 0.003, b.z);
        bu.scale.setScalar(SIZE * (0.04 + 0.1 * easeOut(u)));
        mats.burst.opacity = 0.9 * (1 - u);
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
      {ANIMALS.map((def, i) => (
        <group
          key={def.kind}
          ref={(g) => {
            animals[i].g = g;
          }}
          visible={false}
        >
          <mesh geometry={geos[def.kind]}>
            <meshStandardMaterial
              ref={(m) => {
                animals[i].mat = m;
              }}
              userData={{ lifeSkip: true }}
              color={accent}
              emissive={accent}
              emissiveIntensity={0.7}
              roughness={0.5}
              transparent
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      <mesh ref={anchor} geometry={ringGeo} material={mats.anchor} visible={false} renderOrder={2} />
      <mesh ref={lockRing} geometry={lockGeo} material={mats.lock} visible={false} renderOrder={2} />
      <mesh ref={burst} geometry={ringGeo} material={mats.burst} visible={false} renderOrder={2} />
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
