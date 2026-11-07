// The Virtuele Brigade, played: run the scenario. The project was made
// multiplayer so instructors could run a scenario together, in VR, on desktop
// or in the editor. In its close-up you're the one in the editor, at the desk,
// and the two in VR (room.tsx VRPlayers: two headsets, worn by no one) are in
// the scenario. The monitor is the editor: the scenario from above, the two of
// them on it, each with the view its headset has, turning as their heads turn,
// and the places something can be put. Rest the cursor on one and the next
// thing goes there: something to check, a sound to follow or somewhere to go
// (the corner of the map shows which). It's in VR the moment it's on the map.
// They only see what's in front of them, so one of them has to spot it (a
// sound they both hear); that one tells the other, and they deal with it as a
// pair: one goes to check while the other covers, or both go, one leading and
// the other watching their backs. Each one dealt with lights a pip along the
// foot of the monitor; one they don't spot before the ring closes on it slips
// away, and the row goes dark. A full row and the two turn to each other and
// nod, and it starts over, with less time each round. Not on a touch screen,
// where there's no cursor, nor under reduced motion (useCloseUp): there the
// session plays as it always has, and the monitor shows the app.
import { useEffect, useMemo, useRef, type ElementRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, CanvasTexture, CircleGeometry, DoubleSide, MeshBasicMaterial, PlaneGeometry, Ray, SRGBColorSpace, Vector2, Vector3, type Group, type Mesh, type Object3D, type PerspectiveCamera } from 'three';
import { Line, NEUTRAL, SURFACE, useAccent, type V3 } from './shared';
import { cursorRay, useCloseUp } from './closeup';
import { useGeometry } from './shapes';
import { play } from '../../lib/sound';
import { bump, easeInOut, easeOut, easeOutBack } from '../../lib/ease';

/** Where the two in VR stand to begin with (their heads, desk frame): over the
 *  desk's left end and to the right of the screen, both clear above it. The
 *  camera looks on from the front left, so a look out into the room shows it
 *  their visors, and a look at each other shows them in profile. */
export const POSTS: V3[] = [
  [-0.32, 0.9, 0.1],
  [0.42, 0.86, 0.14],
];

/** What the game and the two in VR tell each other, frame to frame. */
export interface SessionLink {
  /** the game's running: where they stand and look comes from `want` */
  on: boolean;
  /** what each is asked to do: stand at `at` (desk frame, a head's height),
   *  look at `look`, crouch by `duck`, turning in about `glide` s */
  want: { at: Vector3; look: Vector3; duck: number; glide: number }[];
  /** a nod each from this time on the scene's clock (the second a beat after) */
  nodAt: number;
  /** a full row: they turn to each other and nod */
  roundAt: number;
  /** told back by room.tsx VRPlayers every frame: where each head is, which
   *  way it faces (atan2 of the x and z of its view) and whether it's in the
   *  session yet (0 → 1) */
  heads: { x: number; z: number; yaw: number; joined: number }[];
}
export const newSessionLink = (): SessionLink => ({
  on: false,
  want: POSTS.map((p) => ({ at: new Vector3(...p), look: new Vector3(p[0], p[1], 1.4), duck: 0, glide: 0.6 })),
  nodAt: -1,
  roundAt: -1,
  heads: POSTS.map((p) => ({ x: p[0], z: p[2], yaw: 0, joined: 0 })),
});
/** How long the two take over a full row, turned to each other. */
export const ROUND_LEN = 1.8;

/* The places something can be put, desk frame. The close-up sees about
   −0.6…0.75 across and 0.2…1.15 up from in front and to the left, about at
   their heads' height, so it can't tell near from far up there: the ones at
   the back are up high, the ones in front low down, and seen from the camera
   they lie the way they do on the map, clear of the screen, the two heads and
   the label. The map shows them from above, as they are. */
const SPOTS: V3[] = [
  [-0.5, 1.02, -0.25], // back left
  [0.0, 1.08, -0.35], // back, over the screen
  [0.4, 1.05, -0.3], // back right
  [-0.55, 0.72, 0.2], // left
  [0.62, 0.75, 0.0], // right
  [-0.45, 0.5, 0.45], // front left
  [0.05, 0.62, 0.5], // front
  [0.3, 0.62, 0.3], // front right
];
type Kind = 'check' | 'sound' | 'go';
/** What comes next, round and round: the corner of the map shows it. */
const LESSON: Kind[] = ['check', 'sound', 'go', 'check', 'check', 'sound', 'go', 'check', 'sound', 'check'];
const READY = 1.6; // s into the session before anything can be put down (the second one's joining)
const DROP = 0.5; // s the cursor rests on a place to put the next thing there
const PICK = 0.03; // how near the cursor has to come to a place on the map (screen units: ~15 px at 1280)
const LIFE = 4.4; // s a new one has to be spotted in, at the start of a row…
const LIFE_STEP = 0.12; // …shorter by this for each one in the row…
const LIFE_ROUND = 0.35; // …and by this each round…
const LIFE_MIN = 1.8; // …down to this
const CONE = 0.62; // rad either side of where a head faces: what it sees
const HEAR = 0.3; // s before a sound has them turning
const TELL = [0.35, 0.85]; // s after it's spotted: turned to it until the first, telling the other until the second
const REACH = 0.16; // how near the one checking goes (from above)
const WALK = 0.34; // units a second, walking
const CHECK = 0.9; // s it takes a look, crouched over it
const DUCK = 0.05; // how far down it crouches
const BACK = 0.22; // how far behind the leader the other walks, going somewhere
const STAND = { x: [-0.4, 0.46], z: [-0.35, 0.28] }; // where the two can stand (all of it in the picture, at 1280 across)
const APART = 0.2; // and never nearer each other than this
/** Idle, each keeps watch on its own side (rad, the way it faces: 0 is out
 *  into the room, toward the camera, π/2 its right), now and then over its
 *  shoulder; a new look every SCAN s. */
const SECTOR = [
  [-2.3, 0.6],
  [-0.6, 2.3],
];
const SCAN = [1.3, 2.2];
const SHOULDER = 0.3; // the share of looks that go over the shoulder
const ROW = 10; // pips along the foot of the monitor: a full row is a round
const BURST = 0.45; // s for a dealt-with one's ring to run out
const SLIP = 0.5; // s for a missed one to blink out
const BEAM = 0.5; // s the line from the map to VR shows, as it's put down
const OPEN_EVERY = 0.5; // s between looks at which places are in the picture

/* The editor, on the monitor's screen (RoomScreen in room.tsx: centred at
   [0, 0.63], 0.542 × 0.302, its face at z −0.1245). The scenario from above
   (far side up, at one scale both ways, so a view's angle is true on it), and
   down the left the next thing to put down and who's in the session: the two
   in VR and you. The pips run along the foot. */
const SCREEN = { x: 0, y: 0.63, w: 0.542, h: 0.302 };
const FACE = -0.1245;
const PLAN = { cx: 0.05, cy: 0.022, k: 0.245, x0: 0.03 };
const plan = (x: number, z: number, out: Vector2) => out.set(PLAN.cx + (x - PLAN.x0) * PLAN.k, PLAN.cy - z * PLAN.k);
const PLACES = SPOTS.map(([x, , z]) => plan(x, z, new Vector2()));
const NEXT = new Vector2(-0.205, 0.092); // the next thing, in its frame
const ROSTER = [-0.004, -0.044, -0.084]; // the two in VR, and you, down the left (y)
const PIPS = { y: -0.134, pitch: 0.021, size: 0.012 };

/* The marks are the site's reticle (hotspots.css .hotspot__mark): two
   hairlines with a gap at the centre, a small core, and brackets at the
   corners that lock in once something's on it; drawn in hairlines (the site's
   Line: its width in px at any distance), in units of the reticle's
   half-width. In VR it keeps one size on screen, like the crosshairs do. */
const CROSS: V3[] = [
  [0.36, 0, 0], [0.86, 0, 0],
  [-0.36, 0, 0], [-0.86, 0, 0],
  [0, 0.36, 0], [0, 0.86, 0],
  [0, -0.36, 0], [0, -0.86, 0],
];
const BRACKETS: V3[] = [-1, 1].flatMap((sx) =>
  [-1, 1].flatMap((sy): V3[] => [
    [sx, sy, 0], [sx * 0.45, sy, 0],
    [sx, sy, 0], [sx, sy * 0.45, 0],
  ]),
);
const arc = (r: number, a0: number, a1: number, n: number): V3[] =>
  Array.from({ length: n }, (_, k) => k).flatMap((k): V3[] => {
    const a = a0 + ((a1 - a0) * k) / n;
    const b = a0 + ((a1 - a0) * (k + 1)) / n;
    return [[r * Math.cos(a), r * Math.sin(a), 0], [r * Math.cos(b), r * Math.sin(b), 0]];
  });
/** Each kind's glyph, round the reticle's core: a diamond for something to
 *  check, a sound's arcs either side, a triangle pointing down for somewhere
 *  to go. Hairline segments; the map and its corner draw them too. */
const GLYPH: Record<Kind, V3[]> = {
  check: [[0, 1, 0], [1, 0, 0], [1, 0, 0], [0, -1, 0], [0, -1, 0], [-1, 0, 0], [-1, 0, 0], [0, 1, 0]],
  sound: [...arc(0.62, -0.7, 0.7, 4), ...arc(0.62, Math.PI - 0.7, Math.PI + 0.7, 4), ...arc(1.05, -0.55, 0.55, 4), ...arc(1.05, Math.PI - 0.55, Math.PI + 0.55, 4)],
  go: [[-0.95, 0.6, 0], [0.95, 0.6, 0], [0.95, 0.6, 0], [0, -1, 0], [0, -1, 0], [-0.95, 0.6, 0]],
};
const KINDS: Kind[] = ['check', 'sound', 'go'];
const CIRCLE: V3[] = Array.from({ length: 65 }, (_, k): V3 => [Math.cos((k / 64) * Math.PI * 2), Math.sin((k / 64) * Math.PI * 2), 0]);
const RETICLE = 13; // px: half the reticle's width in VR (the site's crosshair is 24 across)
/** The places on the map: a small cross each. */
const MARK = 0.005;
const crosses = (open: boolean[]) =>
  PLACES.flatMap((p, i): number[] => {
    if (!open[i]) return [];
    const x = SCREEN.x + p.x;
    const y = SCREEN.y + p.y;
    const z = FACE + 0.0008;
    return [x - MARK, y, z, x + MARK, y, z, x, y - MARK, z, x, y + MARK, z];
  });
const CROSSES: V3[] = (() => {
  const f = crosses(SPOTS.map(() => true));
  return Array.from({ length: f.length / 3 }, (_, k): V3 => [f[3 * k], f[3 * k + 1], f[3 * k + 2]]);
})();

type Hairline = ElementRef<typeof Line>;
/** A hairline: the site's Line, drawn plain on the screen, or over
 *  everything (`over`), as VR's marks are. Shown by setting its opacity. */
function Hair({ at, points, segments, color, width = 1.2, over = false }: { at: (l: Hairline | null) => void; points: V3[]; segments?: boolean; color: string; width?: number; over?: boolean }) {
  return <Line ref={at} points={points} segments={segments} color={color} lineWidth={width} transparent opacity={0} depthTest={!over} depthWrite={false} fog={false} renderOrder={over ? 9 : 5} userData={{ lifeSkip: true, presenceOwn: true }} />;
}

type Phase = 'live' | 'seen' | 'go' | 'done' | 'missed';
interface Cue {
  spot: number;
  kind: Kind;
  phase: Phase;
  t: number; // s in this phase
  life: number; // s it has to be spotted in
  by: number; // who spotted it: it's the one that goes to check it, or leads
  arrive: number; // s into `go` that they're there
}
interface Leg {
  from: Vector3;
  to: Vector3;
  at: number;
  len: number;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const _v = new Vector3();
const _w = new Vector3();
const _p = new Vector2();
const _q = new Vector2();

/** The editor's still parts, drawn once: the ground, the plan with its grid,
 *  the frame the next thing sits in, and the roster's glyphs. */
function editorTexture(): CanvasTexture {
  const W = 1024;
  const H = Math.round((W * SCREEN.h) / SCREEN.w);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const px = (sx: number) => ((sx + SCREEN.w / 2) / SCREEN.w) * W;
  const py = (sy: number) => ((SCREEN.h / 2 - sy) / SCREEN.h) * H;
  const u = W / SCREEN.w; // px per screen unit
  g.fillStyle = '#0d151c';
  g.fillRect(0, 0, W, H);
  // the plan: the reach of the scenario the two can be in, and a grid every 0.1
  const x0 = px(PLAN.cx + (-0.66 - PLAN.x0) * PLAN.k);
  const x1 = px(PLAN.cx + (0.72 - PLAN.x0) * PLAN.k);
  const y0 = py(PLAN.cy + 0.47 * PLAN.k);
  const y1 = py(PLAN.cy - 0.56 * PLAN.k);
  g.fillStyle = '#122029';
  g.strokeStyle = '#294352';
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(x0, y0, x1 - x0, y1 - y0, 10);
  g.fill();
  g.stroke();
  g.fillStyle = '#2b4655';
  for (let x = -0.6; x <= 0.7; x += 0.1)
    for (let z = -0.4; z <= 0.5; z += 0.1) {
      g.beginPath();
      g.arc(px(PLAN.cx + (x - PLAN.x0) * PLAN.k), py(PLAN.cy - z * PLAN.k), 2, 0, Math.PI * 2);
      g.fill();
    }
  // down the left: the next thing's frame, then the roster
  g.strokeStyle = '#3c5b6e';
  g.lineWidth = 2;
  const f = 0.026 * u;
  g.beginPath();
  g.roundRect(px(NEXT.x) - f, py(NEXT.y) - f, 2 * f, 2 * f, 8);
  g.stroke();
  g.strokeStyle = SURFACE.glass.color;
  g.fillStyle = SURFACE.glass.color;
  g.lineWidth = 3;
  ROSTER.forEach((ry, i) => {
    const cx = px(-0.228);
    const cy = py(ry);
    if (i < 2) {
      // a headset: the visor, its two lenses
      g.beginPath();
      g.roundRect(cx - 0.016 * u, cy - 0.008 * u, 0.032 * u, 0.016 * u, 0.006 * u);
      g.stroke();
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(cx + s * 0.0075 * u, cy + 0.001 * u, 0.0035 * u, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      // a desktop: the screen, its stand
      g.beginPath();
      g.roundRect(cx - 0.015 * u, cy - 0.011 * u, 0.03 * u, 0.017 * u, 0.003 * u);
      g.stroke();
      g.fillRect(cx - 0.006 * u, cy + 0.009 * u, 0.012 * u, 0.0025 * u);
    }
  });
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function Scenario({ slug, link }: { slug: string; link: MutableRefObject<SessionLink> }) {
  const close = useCloseUp(slug);
  const { accent, accentPale } = useAccent();
  const frame = useRef<Group>(null); // the desk's frame
  const ray = useMemo(() => new Ray(), []);
  const geo = useGeometry(() => ({
    dot: new CircleGeometry(1, 24),
    cone: new CircleGeometry(1, 20, -CONE, 2 * CONE),
    strip: new PlaneGeometry(1, 1),
  }));
  // in VR: added on, always in front (it's what the two see, not part of the room)
  // on the screen: drawn on it, plain
  const mats = useMemo(() => {
    const glow = (color: string) => {
      const m = new MeshBasicMaterial({ color, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: AdditiveBlending, toneMapped: false, fog: false, side: DoubleSide });
      m.userData = { lifeSkip: true, presenceOwn: true };
      return m;
    };
    const ink = (color: string) => {
      const m = new MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false });
      m.userData = { lifeSkip: true, presenceOwn: true };
      return m;
    };
    const ground = new MeshBasicMaterial({ map: editorTexture(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false });
    ground.userData = { lifeSkip: true, presenceOwn: true };
    return {
      ground,
      // the map
      head: ink(accentPale),
      cone: ink(accentPale),
      talk: ink(accentPale),
      cueCore: ink(accent),
      nextCore: ink(accentPale),
      roster: ROSTER.map(() => ink(accent)),
      pips: Array.from({ length: ROW }, () => ink(accent)),
      // in VR: the reticle's core
      vrCore: glow(accent),
    };
  }, [accent, accentPale]);
  useEffect(
    () => () => {
      mats.ground.map?.dispose();
      for (const m of Object.values(mats)) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
    },
    [mats],
  );
  // what's moved about each frame
  const r = {
    vr: useRef<Group>(null),
    vrBrackets: useRef<Group>(null),
    vrCloser: useRef<Group>(null),
    vrBurst: useRef<Group>(null),
    vrPings: useRef<(Group | null)[]>([]),
    ghost: useRef<Group>(null),
    pick: useRef<Group>(null),
    heads: useRef<(Group | null)[]>([]),
    talk: useRef<Mesh>(null),
    cue: useRef<Group>(null),
    cueCloser: useRef<Group>(null),
  };
  const hl = useRef<Record<string, Hairline | null>>({});
  const hold = (k: string) => (l: Hairline | null) => {
    hl.current[k] = l;
  };
  const beam = useRef<ElementRef<typeof Line>>(null);
  const talk3 = useRef<ElementRef<typeof Line>>(null);
  const flat = useMemo<V3[]>(() => [
    [0, 0, 0],
    [0, 0.001, 0],
  ], []);
  const game = useRef({
    clock: 0,
    on: 0, // the editor, faded in
    session: 0, // s in the close-up
    cue: null as Cue | null,
    hover: -1,
    rest: 0, // s the cursor has rested on the place it's on
    open: SPOTS.map(() => true), // which places land in the picture, clear of the label (looked at every OPEN_EVERY s)
    openAt: -99,
    next: 0, // into LESSON
    row: 0,
    rounds: 0,
    dropAt: -99,
    talkAt: -99, // one telling the other: the line between them
    posts: POSTS.map((p) => new Vector3(...p)),
    legs: POSTS.map((p): Leg => ({ from: new Vector3(...p), to: new Vector3(...p), at: -99, len: 1 })),
    scan: POSTS.map(() => ({ yaw: 0, pitch: 0, at: 0 })),
  });

  useFrame((st, delta) => {
    const fr = frame.current;
    if (!fr) return;
    const dt = Math.min(delta, 1 / 30);
    const now = st.clock.elapsedTime; // the scene's clock: what the two in VR nod and huddle by
    const s = game.current;
    const T = (s.clock += dt); // the game's own, by the frame: what its walks, looks and lines go by
    const L = link.current;
    L.on = close;
    s.on = close ? Math.min(1, s.on + dt / 0.4) : Math.max(0, s.on - dt / 0.3);
    s.session = close ? s.session + dt : 0;
    if (!close && (s.cue || s.row || s.next || s.legs[0].at > -99 || s.legs[1].at > -99)) {
      // closed (or a touch screen): nothing out, the row cleared, the two back where they began
      Object.assign(s, { cue: null, hover: -1, rest: 0, next: 0, row: 0, rounds: 0 });
      s.posts.forEach((p, i) => p.set(...POSTS[i]));
      s.legs.forEach((l, i) => {
        l.from.set(...POSTS[i]);
        l.to.set(...POSTS[i]);
        l.at = -99;
      });
    }

    // where each is on its legs (eased from one place to the next)
    const pos = (i: number, out: Vector3) => {
      const l = s.legs[i];
      const k = Math.min(1, Math.max(0, (T - l.at) / l.len));
      return out.copy(l.from).lerp(l.to, easeInOut(k));
    };
    const walk = (i: number, to: Vector3) => {
      const l = s.legs[i];
      pos(i, l.from);
      l.to.copy(to);
      l.at = T;
      l.len = Math.max(0.35, l.from.distanceTo(to) / WALK);
      return l.len;
    };
    /** Somewhere the two can stand: in reach, at a head's height. */
    const stand = (x: number, z: number, y: number, out: Vector3) =>
      out.set(Math.min(STAND.x[1], Math.max(STAND.x[0], x)), y, Math.min(STAND.z[1], Math.max(STAND.z[0], z)));

    // ---- which places are in the picture: on another screen's framing the
    // label can cover some, and those aren't offered ----
    if (close && T - s.openAt > OPEN_EVERY) {
      s.openAt = T;
      const label = document.querySelector('.exhibit .xl')?.getBoundingClientRect();
      const { left, top, width, height } = st.size;
      SPOTS.forEach((p, i) => {
        fr.localToWorld(_v.set(...p)).project(st.camera);
        const x = ((_v.x + 1) / 2) * width + left;
        const y = ((1 - _v.y) / 2) * height + top;
        const m = 48; // px kept from the edges (and the header's height more at the top)
        const inside = _v.z < 1 && x > left + m && x < left + width - m && y > top + m + 64 && y < top + height - m;
        s.open[i] = inside && !(label && x > label.left - 40 && x < label.right + 40 && y > label.top - 40 && y < label.bottom + 40);
      });
    }

    // ---- the cursor on the map: which place, and resting there puts the next thing down ----
    let hover = -1;
    if (close && cursorRay(st, fr, ray) && ray.direction.z < -1e-4) {
      const k = (FACE - ray.origin.z) / ray.direction.z;
      const sx = ray.origin.x + ray.direction.x * k - SCREEN.x;
      const sy = ray.origin.y + ray.direction.y * k - SCREEN.y;
      if (k > 0 && Math.abs(sx) < SCREEN.w / 2 && Math.abs(sy) < SCREEN.h / 2) {
        let best = PICK;
        PLACES.forEach((p, i) => {
          const d = Math.hypot(p.x - sx, p.y - sy);
          if (s.open[i] && d < best) {
            best = d;
            hover = i;
          }
        });
      }
    }
    const ready = close && s.session > READY && !s.cue;
    s.rest = hover >= 0 && hover === s.hover && ready ? s.rest + dt : 0;
    s.hover = hover;
    if (s.rest > DROP) {
      const kind = LESSON[s.next % LESSON.length];
      s.next++;
      s.rest = 0;
      s.cue = { spot: hover, kind, phase: 'live', t: 0, life: Math.max(LIFE_MIN, LIFE - LIFE_STEP * s.row - LIFE_ROUND * s.rounds), by: -1, arrive: 0 };
      s.dropAt = T;
      // the line from where it went on the map to where it is in VR
      beam.current?.geometry.setPositions([SCREEN.x + PLACES[hover].x, SCREEN.y + PLACES[hover].y, FACE + 0.002, ...SPOTS[hover]]);
      play('cue-drop', { volume: 0.45 });
    }

    // ---- the one out: spotted, told, dealt with ----
    const c = s.cue;
    if (c) {
      c.t += dt;
      const [sx, , sz] = SPOTS[c.spot];
      const far = (i: number) => Math.hypot(sx - L.heads[i].x, sz - L.heads[i].z);
      if (c.phase === 'live') {
        // only what's in front of them; a sound, both hear
        let by = -1;
        if (c.kind === 'sound') by = c.t > HEAR ? (far(0) <= far(1) ? 0 : 1) : -1;
        else
          for (let i = 0; i < 2; i++) {
            const h = L.heads[i];
            if (h.joined < 0.99 || Math.abs(wrap(Math.atan2(sx - h.x, sz - h.z) - h.yaw)) > CONE) continue;
            if (by < 0 || far(i) < far(by)) by = i;
          }
        if (by >= 0) {
          Object.assign(c, { phase: 'seen', t: 0, by });
          s.talkAt = T + TELL[0];
          play('cue-seen', { volume: 0.4 });
        } else if (c.t > c.life) {
          Object.assign(c, { phase: 'missed', t: 0 });
          s.row = 0;
          play('cue-miss', { volume: 0.4 });
        }
      } else if (c.phase === 'seen' && c.t > TELL[1]) {
        // off they go: one to check it while the other covers, or both, the
        // other a step behind the first
        const a = c.by;
        const b = 1 - a;
        pos(a, _v);
        pos(b, _w);
        const dx = sx - _v.x;
        const dz = sz - _v.z;
        const d = Math.max(1e-3, Math.hypot(dx, dz));
        const near = c.kind === 'go' ? 0 : Math.min(REACH, d); // (already that near, it stays)
        const lead = stand(sx - (dx / d) * near, sz - (dz / d) * near, POSTS[a][1], new Vector3());
        if (c.kind !== 'go') {
          // and not on top of the other
          const ox = lead.x - _w.x;
          const oz = lead.z - _w.z;
          const o = Math.hypot(ox, oz);
          if (o < APART) stand(_w.x + (ox / Math.max(1e-3, o)) * APART, _w.z + (oz / Math.max(1e-3, o)) * APART, lead.y, lead);
        }
        let arrive = walk(a, lead);
        if (c.kind === 'go') {
          // the other behind the first, back along the way they came
          const tail = stand(lead.x - (dx / d) * BACK, lead.z - (dz / d) * BACK, POSTS[b][1], new Vector3());
          if (Math.hypot(tail.x - lead.x, tail.z - lead.z) < APART) stand(lead.x - (dz / d) * APART, lead.z + (dx / d) * APART, tail.y, tail);
          arrive = Math.max(arrive, walk(b, tail));
        }
        Object.assign(c, { phase: 'go', t: 0, arrive });
      } else if (c.phase === 'go' && c.t > c.arrive + (c.kind === 'go' ? 0.3 : CHECK)) {
        // dealt with: a nod each, a pip
        Object.assign(c, { phase: 'done', t: 0 });
        s.row++;
        L.nodAt = now;
        play('cue-clear', { volume: 0.45 });
        if (s.row >= ROW) {
          L.roundAt = now + 0.35;
          s.rounds++;
        }
        if (c.kind === 'go') s.legs.forEach((l, i) => s.posts[i].copy(l.to)); // and that's where they are now
        else walk(c.by, s.posts[c.by]); // back to its place
      } else if (c.phase === 'done' && c.t > BURST) {
        if (s.row >= ROW) s.row = 0;
        s.cue = null;
      } else if (c.phase === 'missed' && c.t > SLIP) s.cue = null;
    }

    // ---- what each is asked to do ----
    for (let i = 0; i < 2; i++) {
      const W = L.want[i];
      pos(i, W.at);
      W.duck = 0;
      const peer = pos(1 - i, _w);
      const sc = s.scan[i];
      const watch = () => {
        // keeping watch on its own side, now and then over its shoulder
        if (T > sc.at) {
          const [lo, hi] = SECTOR[i];
          sc.yaw = Math.random() < SHOULDER ? (i === 0 ? -1 : 1) * (2.5 + Math.random() * 0.6) : lo + Math.random() * (hi - lo);
          sc.pitch = (Math.random() - 0.5) * 0.25;
          sc.at = T + SCAN[0] + Math.random() * (SCAN[1] - SCAN[0]);
        }
        W.look.set(W.at.x + Math.sin(sc.yaw), W.at.y + sc.pitch, W.at.z + Math.cos(sc.yaw));
        W.glide = 0.55;
      };
      const at = (x: number, y: number, z: number, glide: number) => {
        W.look.set(x, y, z);
        W.glide = glide;
      };
      const cover = (from: V3) => {
        // its back to it, looking about the other way
        const a = Math.atan2(W.at.x - from[0], W.at.z - from[2]) + 0.45 * Math.sin(T * 0.8 + i);
        at(W.at.x + Math.sin(a), W.at.y, W.at.z + Math.cos(a), 0.5);
      };
      if (!c || c.phase === 'live' || c.phase === 'missed') {
        watch();
        continue;
      }
      const sp = SPOTS[c.spot];
      if (c.phase === 'seen') {
        if (i === c.by) {
          // turned to it, then to the other, telling it, then back to it
          if (c.t < TELL[0] || c.t > TELL[1] - 0.12) at(sp[0], sp[1], sp[2], 0.25);
          else at(peer.x, peer.y, peer.z, 0.22);
        } else if (c.kind === 'sound' && c.t < TELL[0]) at(sp[0], sp[1], sp[2], 0.35); // it heard it too, a beat behind
        else if (c.t > TELL[0] + 0.08) at(peer.x, peer.y, peer.z, 0.28); // told
        else watch();
      } else if (c.kind === 'go') {
        // the first on ahead, the other behind, watching their backs
        if (i === c.by) at(sp[0], W.at.y, sp[2], 0.4);
        else {
          const l = s.legs[i];
          const a = Math.atan2(l.from.x - l.to.x, l.from.z - l.to.z) + 0.35 * Math.sin(T * 0.9);
          at(W.at.x + Math.sin(a), W.at.y, W.at.z + Math.cos(a), 0.45);
        }
      } else if (i === c.by) {
        // there: crouched over it, having a look
        at(sp[0], sp[1], sp[2], 0.35);
        if (c.phase === 'go' && c.t > c.arrive) W.duck = DUCK * Math.min(1, (c.t - c.arrive) / 0.3);
      } else cover(sp);
    }

    // ---- the editor ----
    const on = s.on;
    // solid once it's up (see-through, the app's picture under it shows more
    // than its opacity says); see-through only while it fades in and out
    const solid = on > 0.98;
    if (mats.ground.transparent === solid) {
      mats.ground.transparent = !solid;
      mats.ground.depthWrite = solid;
      mats.ground.needsUpdate = true;
    }
    mats.ground.opacity = solid ? 1 : on;
    /** A hairline's strength (and colour): hidden at nothing. */
    const hair = (k: string, o: number, color?: string) => {
      const l = hl.current[k];
      if (!l) return;
      l.visible = o > 0.003;
      l.material.opacity = o;
      if (color) l.material.color.set(color);
    };
    // world units a pixel spans where `o` stands (o: a child of the desk's frame)
    const cam = st.camera as PerspectiveCamera;
    const px = (o: Object3D) => {
      const d = cam.position.distanceTo(fr.localToWorld(_v.copy(o.position)));
      return (2 * d * Math.tan((cam.fov * Math.PI) / 360)) / (cam.zoom * st.size.height) / fr.getWorldScale(_w).x;
    };
    // the places: a small cross each, the ones in the picture
    const pl = hl.current.places;
    const key = s.open.map((o) => (o ? 1 : 0)).join('');
    if (pl && pl.userData.key !== key) {
      pl.userData.key = key;
      if (key.includes('1')) pl.geometry.setPositions(crosses(s.open));
    }
    hair('places', key.includes('1') ? 0.55 * on : 0);
    // the one the cursor's on: brackets round it, closing in while it rests there
    const fill = Math.min(1, s.rest / DROP);
    const pk = r.pick.current;
    if (pk) {
      pk.visible = hover >= 0;
      if (hover >= 0) {
        pk.position.set(SCREEN.x + PLACES[hover].x, SCREEN.y + PLACES[hover].y, FACE + 0.001);
        pk.scale.setScalar(0.0105 * (1.7 - 0.7 * easeOut(fill)));
      }
    }
    hair('pick', hover >= 0 ? (ready ? 0.95 : 0.35) * on : 0, ready ? accentPale : NEUTRAL);
    // the two, where they are and the way they face
    for (let i = 0; i < 2; i++) {
      const g = r.heads.current[i];
      const h = L.heads[i];
      if (!g) continue;
      plan(h.x, h.z, _p);
      g.position.set(SCREEN.x + _p.x, SCREEN.y + _p.y, FACE + 0.0009);
      // (on the map, far is up: a view along +z points down it)
      g.rotation.z = Math.atan2(-Math.cos(h.yaw), Math.sin(h.yaw));
      g.visible = h.joined > 0.01;
      g.scale.setScalar(Math.max(0.001, h.joined));
    }
    mats.head.opacity = on;
    mats.cone.opacity = 0.16 * on;
    // one telling the other: a line between them, on the map and in VR
    const told = Math.max(0, 1 - Math.abs(T - s.talkAt - 0.22) / 0.3);
    if (r.talk.current) {
      plan(L.heads[0].x, L.heads[0].z, _p);
      plan(L.heads[1].x, L.heads[1].z, _q);
      r.talk.current.visible = told > 0.01;
      r.talk.current.position.set(SCREEN.x + (_p.x + _q.x) / 2, SCREEN.y + (_p.y + _q.y) / 2, FACE + 0.0007);
      r.talk.current.rotation.z = Math.atan2(_q.y - _p.y, _q.x - _p.x);
      r.talk.current.scale.set(_p.distanceTo(_q), 0.0018, 1);
    }
    mats.talk.opacity = 0.8 * told * on;
    const t3 = talk3.current;
    if (t3) {
      t3.visible = told > 0.01;
      if (t3.visible) {
        pos(0, _v);
        pos(1, _w);
        t3.geometry.setPositions([_v.x, _v.y, _v.z, _w.x, _w.y, _w.z]);
      }
      t3.material.opacity = 0.7 * told * on;
    }
    // the next thing, in its frame (dim while one's out)
    const nk = LESSON[s.next % LESSON.length];
    const nextOn = on * (s.cue ? 0.3 : 0.9);
    KINDS.forEach((k) => hair('next-' + k, k === nk ? nextOn : 0));
    mats.nextCore.opacity = nextOn;
    // the roster: who's in
    mats.roster.forEach((m, i) => (m.opacity = on * (i < 2 ? 0.25 + 0.75 * L.heads[i].joined : 1)));
    // the one out, on the map: its glyph, and the time it has closing in on it
    const live = c && c.phase === 'live' ? 1 - c.t / c.life : 0;
    const pop = c ? easeOutBack(Math.min(1, (c.phase === 'live' ? c.t : 1) / 0.25)) : 0;
    const slip = c && c.phase === 'missed' ? (Math.floor(c.t * 12) % 2 ? 0 : 1) * (1 - c.t / SLIP) : 1;
    const gone = c && c.phase === 'done' ? 1 - c.t / BURST : 1;
    const seen = !!c && c.phase !== 'live' && c.phase !== 'missed';
    const ink = seen ? accentPale : accent;
    const shown = c ? on * slip * gone : 0;
    const cg = r.cue.current;
    if (cg) {
      cg.visible = !!c;
      if (c) {
        cg.position.set(SCREEN.x + PLACES[c.spot].x, SCREEN.y + PLACES[c.spot].y, FACE + 0.0011);
        cg.scale.setScalar(0.0085 * Math.max(0.001, pop));
      }
    }
    KINDS.forEach((k) => hair('cue-' + k, c && c.kind === k ? shown : 0, ink));
    mats.cueCore.color.set(ink);
    mats.cueCore.opacity = shown;
    r.cueCloser.current?.scale.setScalar(1.3 + 2 * live);
    const ticking = live > 0 ? on * Math.min(1, (c?.t ?? 0) / 0.3) : 0;
    hair('cueCloser', 0.6 * ticking);
    // the pips: the newest flashes as it lights, and a full row flashes all together
    const round = L.roundAt >= 0 && now >= L.roundAt && now - L.roundAt < ROUND_LEN;
    mats.pips.forEach((m, i) => {
      const fresh = c && c.phase === 'done' && i === s.row - 1 ? 1 + 1.4 * bump(c.t / BURST) : 1;
      const level = round ? (Math.floor((now - L.roundAt) * 6) % 2 ? 1.7 : 0.35) : i < s.row ? 1.25 * fresh : 0.16;
      m.color.set(accent).multiplyScalar(level);
      m.opacity = on;
    });

    // ---- in VR: the reticle ----
    const vg = r.vr.current;
    if (vg) {
      vg.visible = !!c && on > 0.01;
      if (c) {
        vg.position.set(...SPOTS[c.spot]);
        vg.lookAt(st.camera.position);
        vg.scale.setScalar(px(vg) * RETICLE * Math.max(0.001, pop));
        // its brackets: put down locked (you're on it), loose while it waits,
        // locking in again once one of them is on it
        const k = c.phase === 'live' ? 1 + 0.35 * easeOut(Math.min(1, c.t / 0.4)) : c.phase === 'seen' ? 1 + 0.35 * (1 - easeOut(Math.min(1, c.t / 0.25))) : c.phase === 'missed' ? 1.35 : 1;
        r.vrBrackets.current?.scale.setScalar(k);
        r.vrCloser.current?.scale.setScalar(1.25 + 2.2 * live);
        const b = c.phase === 'done' ? Math.min(1, c.t / BURST) : 0;
        r.vrBurst.current?.scale.setScalar(1.25 + 2.4 * (1 - (1 - b) * (1 - b)));
        hair('vrBurst', c.phase === 'done' ? 0.8 * (1 - b) * on : 0);
        // a sound rings out from it, the way the crosshairs ping
        r.vrPings.current.forEach((g, n) => {
          if (!g) return;
          const e = (now * 0.9 + n * 0.5) % 1;
          g.scale.setScalar(0.45 + 1.8 * e);
          hair('vrPing' + n, c.kind === 'sound' && c.phase !== 'missed' ? 0.5 * (1 - e) * shown : 0);
        });
      } else hair('vrBurst', 0);
    }
    hair('vrCross', 0.95 * shown, ink);
    hair('vrBrackets', (seen ? 1 : 0.45) * shown, ink);
    KINDS.forEach((k) => hair('vr-' + k, c && c.kind === k ? shown : 0, ink));
    mats.vrCore.color.set(ink).multiplyScalar(1.4);
    mats.vrCore.opacity = shown;
    hair('vrCloser', 0.5 * ticking);
    // the place the cursor's on, there in VR too: brackets where it'll go,
    // closing in with the ones on the map
    const gg = r.ghost.current;
    if (gg) {
      gg.visible = hover >= 0 && on > 0.01 && (!c || c.spot !== hover);
      if (gg.visible) {
        gg.position.set(...SPOTS[hover]);
        gg.lookAt(st.camera.position);
        gg.scale.setScalar(px(gg) * RETICLE * (1.7 - 0.7 * easeOut(fill)));
      }
    }
    hair('ghost', gg?.visible ? (ready ? 0.75 : 0.3) * on : 0, ready ? accentPale : NEUTRAL);
    // as it's put down: the line from the map to VR
    const bl = beam.current;
    if (bl) {
      const k = (T - s.dropAt) / BEAM;
      bl.visible = k >= 0 && k < 1 && on > 0.01;
      bl.material.opacity = 0.8 * (1 - k) * on;
    }
  });

  return (
    <group ref={frame}>
      {/* ---- the editor, on the monitor ---- */}
      <mesh material={mats.ground} position={[SCREEN.x, SCREEN.y, FACE + 0.0004]} renderOrder={3}>
        <planeGeometry args={[SCREEN.w, SCREEN.h]} />
      </mesh>
      <Hair at={hold('places')} points={CROSSES} segments color={NEUTRAL} width={1} />
      <group ref={r.pick} visible={false}>
        <Hair at={hold('pick')} points={BRACKETS} segments color={accentPale} width={1} />
      </group>
      {[0, 1].map((i) => (
        <group key={i} ref={(g) => (r.heads.current[i] = g)} visible={false}>
          <mesh geometry={geo.cone} material={mats.cone} scale={0.068} renderOrder={4} />
          <mesh geometry={geo.dot} material={mats.head} scale={0.0055} renderOrder={6} />
        </group>
      ))}
      <mesh ref={r.talk} geometry={geo.strip} material={mats.talk} visible={false} renderOrder={5} />
      <group ref={r.cue} visible={false}>
        {KINDS.map((k) => (
          <Hair key={k} at={hold('cue-' + k)} points={GLYPH[k]} segments color={accent} width={1} />
        ))}
        <mesh geometry={geo.dot} material={mats.cueCore} scale={0.28} renderOrder={6} />
        <group ref={r.cueCloser}>
          <Hair at={hold('cueCloser')} points={CIRCLE} color={accent} width={1} />
        </group>
      </group>
      <group position={[SCREEN.x + NEXT.x, SCREEN.y + NEXT.y, FACE + 0.001]} scale={0.012}>
        {KINDS.map((k) => (
          <Hair key={k} at={hold('next-' + k)} points={GLYPH[k]} segments color={accentPale} width={1} />
        ))}
        <mesh geometry={geo.dot} material={mats.nextCore} scale={0.22} renderOrder={6} />
      </group>
      {ROSTER.map((y, i) => (
        <mesh key={i} geometry={geo.dot} material={mats.roster[i]} position={[SCREEN.x - 0.188, SCREEN.y + y, FACE + 0.001]} scale={0.0045} renderOrder={5} />
      ))}
      {mats.pips.map((m, i) => (
        <mesh key={i} material={m} position={[SCREEN.x + (i - (ROW - 1) / 2) * PIPS.pitch, SCREEN.y + PIPS.y, FACE + 0.0012]} renderOrder={5}>
          <planeGeometry args={[PIPS.size, PIPS.size]} />
        </mesh>
      ))}
      {/* ---- in VR: the reticle on the one out, and brackets where the cursor's resting ---- */}
      <group ref={r.vr} visible={false}>
        <Hair at={hold('vrCross')} points={CROSS} segments color={accent} width={1.5} over />
        <group ref={r.vrBrackets}>
          <Hair at={hold('vrBrackets')} points={BRACKETS} segments color={accent} width={1.5} over />
        </group>
        <group scale={0.34}>
          {KINDS.map((k) => (
            <Hair key={k} at={hold('vr-' + k)} points={GLYPH[k]} segments color={accent} width={1.2} over />
          ))}
          <mesh geometry={geo.dot} material={mats.vrCore} scale={0.42} renderOrder={9} />
        </group>
        <group ref={r.vrCloser}>
          <Hair at={hold('vrCloser')} points={CIRCLE} color={accent} width={1.2} over />
        </group>
        <group ref={r.vrBurst}>
          <Hair at={hold('vrBurst')} points={CIRCLE} color={accentPale} width={1.2} over />
        </group>
        {[0, 1].map((n) => (
          <group key={n} ref={(g) => (r.vrPings.current[n] = g)}>
            <Hair at={hold('vrPing' + n)} points={CIRCLE} color={accent} width={1.2} over />
          </group>
        ))}
      </group>
      <group ref={r.ghost} visible={false}>
        <Hair at={hold('ghost')} points={BRACKETS} segments color={accentPale} width={1.5} over />
      </group>
      {/* (no `visible` here: drei hands its props to the line's material too) */}
      <Line ref={beam} points={flat} color={accent} lineWidth={1.2} transparent opacity={0} depthTest={false} renderOrder={9} userData={{ lifeSkip: true, presenceOwn: true }} />
      <Line ref={talk3} points={flat} color={accentPale} lineWidth={1.2} transparent opacity={0} depthTest={false} renderOrder={9} userData={{ lifeSkip: true, presenceOwn: true }} />
    </group>
  );
}
