// The Virtuele Brigade, played: the chase. The project was made multiplayer
// so instructors could run a scenario together, in VR, on desktop or in the
// editor, for training the Marechaussee, the Dutch military police. In its
// close-up you're the instructor in the editor, at the desk, and the two in
// VR (room.tsx VRPlayers: two headsets, worn by no one) are a patrol of two.
// The monitor is the editor: a map of a small district, a canal across it
// with a bridge at each end and a way out at each corner, the two of them on
// it, and, each round, a suspect. It gets out at a checkpoint and runs for a
// way out, and the two give chase: one on its heels, the other cutting round
// to head it off. On foot they're no faster than it is, so that's up to you:
// rest the cursor on a street and it's closed (three a round), and the
// suspect has to turn and find another way. Cut it off and the two run it
// down: caught, and a pip lights along the foot of the monitor. Let it get
// away and the row goes dark. A full row and the two turn to each other and
// nod. A line along the top of the map tells the story as it goes. What's on
// the map is in VR too: the suspect is a reticle the two chase round over the
// desk, and a closed street a barrier. They only ever move with the story:
// they stand and watch, set off, run, turn at the corners. Not on a touch
// screen, where there's no cursor, nor under reduced motion (useCloseUp):
// there the session plays as it always has, and the monitor shows the app.
import { useEffect, useMemo, useRef, type ElementRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, CanvasTexture, CircleGeometry, DoubleSide, MeshBasicMaterial, Ray, SRGBColorSpace, Vector2, Vector3, type Group, type Mesh, type Object3D, type PerspectiveCamera } from 'three';
import { Line, NEUTRAL, SURFACE, useAccent, type V3 } from './shared';
import { cursorRay, useCloseUp } from './closeup';
import { useGeometry } from './shapes';
import { play } from '../../lib/sound';
import { bump, easeOut, easeOutBack } from '../../lib/ease';
import { BLOCKS, BRIDGES, CANAL, COLS, NODES, ROUNDS, ROW, ROWS, STILL, STREETS, REACT, WAYS, closeStreet, heading, nearestNode, newChase, spot, step, still, type Chase } from './chase';

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

/* What the chase looks like in VR (the district, in the desk's frame, is in
   chase.ts). The close-up looks along the district's depth at about the two's
   height, so it can't tell near from far up there: its far side is lifted
   (LIFT a unit back), so the two, the suspect and the barriers lie in the air
   the way they do on the map, far side up. */
const LIFT = 0.55;
const lift = (z: number) => (ROWS[ROWS.length - 1] - z) * LIFT;
const HEAD_Y = 0.85; // the two's eyes, at the district's near side…
const SUSPECT_Y = 0.81; // …and the suspect's: a touch under them
const DROP = 0.5; // s the cursor rests on a street to close it
const PICK = 0.014; // how near a street the cursor has to come on the map (screen units: ~8 px at 1280)
const SEP = { x: 0.34, y: 0.14 }; // how far apart the two heads keep, across and up, as the close-up sees them (a head turned side-on is as wide as its strap)…
const ACROSS = [-0.5, 0.56]; // …and how far out to either side that can take them, still in the picture
const BEAM = 0.5; // s the line from the map to VR shows, as a street's closed
const TRAIL = 22; // points along the suspect's trail on the map…
const TRAIL_EVERY = 0.07; // …one every this many s
const READY = 1.6; // s into the session before the first round (the second one's joining)

/* The editor, on the monitor's screen (RoomScreen in room.tsx: centred at
   [0, 0.63], 0.542 × 0.302, its face at z −0.1245): the story's line along the
   top, who's in at its right end (the two in VR, you), the map under it, and
   the pips along the foot. */
const SCREEN = { x: 0, y: 0.63, w: 0.542, h: 0.302 };
const FACE = -0.1245;
const MAP = { cx: 0, cy: -0.016, kx: 0.47, kz: 0.29, x0: 0.04, z0: -0.03 };
const plan = (x: number, z: number, out: Vector2) => out.set(MAP.cx + (x - MAP.x0) * MAP.kx, MAP.cy - (z - MAP.z0) * MAP.kz);
const STATUS = { x: -0.06, y: 0.121, w: 0.4, h: 0.056 }; // the line's strip (centre, size)
const ROSTER = { x: 0.178, y: 0.121, pitch: 0.03 };
const PIPS = { y: -0.137, pitch: 0.021, size: 0.011 };

/* The marks are the site's reticle (hotspots.css .hotspot__mark): two
   hairlines with a gap at the centre, a small core, and brackets at the
   corners that lock in once something's on it; drawn in hairlines (the site's
   Line: its width in px at any distance), in units of the reticle's
   half-width. In VR they keep one size on screen, like the crosshairs do. */
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
const CIRCLE: V3[] = Array.from({ length: 65 }, (_, k): V3 => [Math.cos((k / 64) * Math.PI * 2), Math.sin((k / 64) * Math.PI * 2), 0]);
/** A road barrier: the board, its stripes, its legs. */
const BARRIER: V3[] = [
  [-1, 0.3, 0], [1, 0.3, 0], [1, 0.3, 0], [1, -0.25, 0], [1, -0.25, 0], [-1, -0.25, 0], [-1, -0.25, 0], [-1, 0.3, 0],
  [-0.62, 0.3, 0], [-0.3, -0.25, 0], [-0.02, 0.3, 0], [0.3, -0.25, 0], [0.58, 0.3, 0], [0.86, -0.25, 0],
  [-0.75, -0.25, 0], [-0.75, -0.95, 0], [0.75, -0.25, 0], [0.75, -0.95, 0],
];
/** A way out's chevron, pointing along +x. */
const CHEVRON: V3[] = [[-0.5, -0.9, 0], [0.4, 0, 0], [0.4, 0, 0], [-0.5, 0.9, 0], [-1.2, -0.9, 0], [-0.3, 0, 0], [-0.3, 0, 0], [-1.2, 0.9, 0]];
const RETICLE = 13; // px: half the reticle's width in VR (the site's crosshair is 24 across)

type Hairline = ElementRef<typeof Line>;
/** A hairline: the site's Line, drawn plain on the screen, or over
 *  everything (`over`), as VR's marks are. Shown by setting its opacity. */
function Hair({ at, points, segments, color, width = 1.2, over = false }: { at: (l: Hairline | null) => void; points: V3[]; segments?: boolean; color: string; width?: number; over?: boolean }) {
  return <Line ref={at} points={points} segments={segments} color={color} lineWidth={width} transparent opacity={0} depthTest={!over} depthWrite={false} fog={false} renderOrder={over ? 9 : 5} userData={{ lifeSkip: true, presenceOwn: true }} />;
}

const _a = new Vector2();
const _b = new Vector2();
const _d = new Vector2();
const _p = new Vector2();
const _q = new Vector2();
const _v = new Vector3();
const _w = new Vector3();

/** The district, drawn once: its blocks, the canal and its bridges, the
 *  streets, the ways out, and who's in at the top right (two headsets and a
 *  desktop). */
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
  const at = (x: number, z: number): [number, number] => {
    plan(x, z, _a);
    return [px(_a.x), py(_a.y)];
  };
  g.fillStyle = '#0d151c';
  g.fillRect(0, 0, W, H);
  // the story's strip along the top
  g.fillStyle = '#101c24';
  g.fillRect(0, 0, W, py(STATUS.y - STATUS.h / 2));
  g.strokeStyle = '#22394a';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, py(STATUS.y - STATUS.h / 2));
  g.lineTo(W, py(STATUS.y - STATUS.h / 2));
  g.stroke();
  // the district's ground, a margin round the grid
  const [gx0, gz0] = at(COLS[0] - 0.05, ROWS[0] - 0.05);
  const [gx1, gz1] = at(COLS[COLS.length - 1] + 0.05, ROWS[ROWS.length - 1] + 0.05);
  g.fillStyle = '#0f1b23';
  g.strokeStyle = '#22394a';
  g.beginPath();
  g.roundRect(gx0, gz0, gx1 - gx0, gz1 - gz0, 12);
  g.fill();
  g.stroke();
  // the blocks between the streets (the quays either side of the canal)
  const street = 0.03; // a street's width, desk units
  const [, canalTop] = at(0, CANAL.z - CANAL.w / 2);
  const [, canalFoot] = at(0, CANAL.z + CANAL.w / 2);
  g.fillStyle = '#152833';
  g.strokeStyle = '#1f3846';
  g.lineWidth = 2;
  const block = (x0: number, y0: number, x1: number, y1: number) => {
    if (x1 - x0 < 4 || y1 - y0 < 4) return;
    g.beginPath();
    g.roundRect(x0, y0, x1 - x0, y1 - y0, 6);
    g.fill();
    g.stroke();
  };
  for (let r = 0; r + 1 < ROWS.length; r++)
    for (let k = 0; k + 1 < COLS.length; k++) {
      const [x0, y0] = at(COLS[k] + street / 2, ROWS[r] + street / 2);
      const [x1, y1] = at(COLS[k + 1] - street / 2, ROWS[r + 1] - street / 2);
      if (r === 1) {
        block(x0, y0, x1, canalTop - 3);
        block(x0, canalFoot + 3, x1, y1);
      } else block(x0, y0, x1, y1);
    }
  // the canal, right across, rippled
  const [cx0] = at(COLS[0] - 0.05, 0);
  const [cx1] = at(COLS[COLS.length - 1] + 0.05, 0);
  g.fillStyle = '#0d2838';
  g.fillRect(cx0, canalTop, cx1 - cx0, canalFoot - canalTop);
  g.strokeStyle = '#1d4a62';
  g.lineWidth = 2;
  for (const y of [canalTop, canalFoot]) {
    g.beginPath();
    g.moveTo(cx0, y);
    g.lineTo(cx1, y);
    g.stroke();
  }
  g.strokeStyle = '#16384b';
  for (let x = cx0 + 18; x < cx1 - 18; x += 46) {
    const y = (canalTop + canalFoot) / 2 + ((x / 46) % 2 ? -4 : 4);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 16, y);
    g.stroke();
  }
  // the streets, the bridges over the canal, and the ways out
  g.strokeStyle = '#26404f';
  g.lineCap = 'round';
  g.lineWidth = street * MAP.kx * u * 0.62;
  for (const [a, b] of STREETS) {
    g.beginPath();
    g.moveTo(...at(NODES[a].x, NODES[a].z));
    g.lineTo(...at(NODES[b].x, NODES[b].z));
    g.stroke();
  }
  g.strokeStyle = '#3c5b6e';
  g.lineWidth = 2;
  for (const k of BRIDGES) {
    const [x] = at(COLS[k], 0);
    const w = street * MAP.kx * u * 0.55;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(x + s * w, canalTop - 2);
      g.lineTo(x + s * w, canalFoot + 2);
      g.stroke();
    }
  }
  g.strokeStyle = '#3c5b6e';
  g.lineWidth = 3;
  for (const w of WAYS) {
    const [ex, ey] = at(w.x, w.z);
    const [fx, fy] = at(NODES[w.from].x, NODES[w.from].z);
    const a = Math.atan2(ey - fy, ex - fx);
    const s = 9;
    for (const back of [0, 9]) {
      const bx = ex - Math.cos(a) * back;
      const by = ey - Math.sin(a) * back;
      g.beginPath();
      g.moveTo(bx - Math.cos(a) * s - Math.sin(a) * s, by - Math.sin(a) * s + Math.cos(a) * s);
      g.lineTo(bx, by);
      g.lineTo(bx - Math.cos(a) * s + Math.sin(a) * s, by - Math.sin(a) * s - Math.cos(a) * s);
      g.stroke();
    }
  }
  // who's in: the two in VR (a headset each) and you (a desktop)
  g.strokeStyle = SURFACE.glass.color;
  g.fillStyle = SURFACE.glass.color;
  g.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const cx = px(ROSTER.x + (i - 1) * ROSTER.pitch);
    const cy = py(ROSTER.y + 0.006);
    if (i < 2) {
      g.beginPath();
      g.roundRect(cx - 0.011 * u, cy - 0.0055 * u, 0.022 * u, 0.011 * u, 0.004 * u);
      g.stroke();
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(cx + s * 0.005 * u, cy + 0.0007 * u, 0.0024 * u, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      g.beginPath();
      g.roundRect(cx - 0.01 * u, cy - 0.0075 * u, 0.02 * u, 0.0115 * u, 0.002 * u);
      g.stroke();
      g.fillRect(cx - 0.004 * u, cy + 0.006 * u, 0.008 * u, 0.0018 * u);
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The story's line: what's happening, and under it what you can do. */
function drawStatus(t: CanvasTexture, head: string, sub: string, ink: string) {
  const c = t.image as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  const H = c.height;
  g.clearRect(0, 0, c.width, H);
  const mono = '"Space Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  const spaced = g as CanvasRenderingContext2D & { letterSpacing?: string };
  g.textBaseline = 'alphabetic';
  g.fillStyle = ink;
  g.font = `700 ${Math.round(H * 0.36)}px ${mono}`;
  spaced.letterSpacing = '3px';
  g.fillText(head, 10, H * 0.47);
  g.fillStyle = 'rgba(211, 228, 246, 0.62)';
  g.font = `400 ${Math.round(H * 0.25)}px ${mono}`;
  spaced.letterSpacing = '2px';
  g.fillText(sub, 10, H * 0.86);
  t.needsUpdate = true;
}

export function Scenario({ slug, link }: { slug: string; link: MutableRefObject<SessionLink> }) {
  const close = useCloseUp(slug);
  const { accent, accentPale } = useAccent();
  const frame = useRef<Group>(null); // the desk's frame
  const ray = useMemo(() => new Ray(), []);
  const geo = useGeometry(() => ({
    dot: new CircleGeometry(1, 24),
    cone: new CircleGeometry(1, 20, -0.55, 1.1),
  }));
  // in VR: added on, always in front (it's what the two see, not part of the room)
  // on the screen: drawn on it, plain
  const mats = useMemo(() => {
    const glow = (color: string) => {
      const m = new MeshBasicMaterial({ color, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: AdditiveBlending, toneMapped: false, fog: false, side: DoubleSide });
      m.userData = { lifeSkip: true, presenceOwn: true };
      return m;
    };
    const ink = (color: string, map?: CanvasTexture) => {
      const m = new MeshBasicMaterial({ color, map, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false });
      m.userData = { lifeSkip: true, presenceOwn: true };
      return m;
    };
    const ground = new MeshBasicMaterial({ map: editorTexture(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false });
    ground.userData = { lifeSkip: true, presenceOwn: true };
    const line = document.createElement('canvas');
    line.width = 1024;
    line.height = Math.round((1024 * STATUS.h) / STATUS.w);
    const status = new CanvasTexture(line);
    status.colorSpace = SRGBColorSpace;
    status.anisotropy = 4;
    return {
      ground,
      statusTex: status,
      status: ink('#ffffff', status),
      head: ink(accentPale),
      cone: ink(accentPale),
      talk: ink(accentPale),
      suspect: ink(accent),
      blocks: Array.from({ length: BLOCKS }, () => ink(accentPale)),
      roster: [0, 1, 2].map(() => ink(accent)),
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
    suspect: useRef<Group>(null),
    ring: useRef<Group>(null),
    heads: useRef<(Group | null)[]>([]),
    talk: useRef<Mesh>(null),
    pick: useRef<Group>(null),
    way: useRef<Group>(null),
    blocks: useRef<(Group | null)[]>([]),
    checkpoint: useRef<Group>(null),
    vr: useRef<Group>(null),
    vrBrackets: useRef<Group>(null),
    vrBurst: useRef<Group>(null),
    vrBlocks: useRef<(Group | null)[]>([]),
    ghost: useRef<Group>(null),
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
  const trailPts = useMemo<V3[]>(() => Array.from({ length: TRAIL }, (_, k): V3 => [0, k * 1e-5, 0]), []);
  const routePts = useMemo<V3[]>(() => Array.from({ length: 12 }, (_, k): V3 => [0, k * 1e-5, 0]), []);
  const game = useRef({
    clock: 0,
    on: 0, // the editor, faded in
    session: 0, // s in the close-up
    c: null as Chase | null,
    hover: -1,
    rest: 0, // s the cursor has rested on the street it's on
    lock: null as Vector2 | null, // where a street was just closed: the cursor moves off it before it can close another
    side: 0, // which side of the first the second keeps, while they'd cover each other
    dropAt: -99,
    talkAt: -99, // the two on the radio: the line between them
    trail: Array.from({ length: TRAIL }, () => new Vector2()),
    trailAt: -99,
    status: '',
  });

  useFrame((st, delta) => {
    const fr = frame.current;
    if (!fr) return;
    const dt = Math.min(delta, 1 / 30);
    const now = st.clock.elapsedTime; // the scene's clock: what the two in VR nod and huddle by
    const g = game.current;
    const T = (g.clock += dt); // the game's own, by the frame
    const L = link.current;
    L.on = close;
    g.on = close ? Math.min(1, g.on + dt / 0.4) : Math.max(0, g.on - dt / 0.3);
    g.session = close ? g.session + dt : 0;
    // closed (or a touch screen): the chase called off, the row with it
    if (!close && g.c) Object.assign(g, { c: null, hover: -1, rest: 0, lock: null });

    // ---- the chase (chase.ts): it starts once the second one's in ----
    if (close && !g.c && g.session > READY) g.c = newChase(L.heads.map((h) => nearestNode(h.x, h.z)));
    const c = g.c;
    if (c) {
      const beat = step(c, dt);
      if (beat === 'out') {
        g.trail.forEach((p) => p.set(NODES[c.sus.at].x, NODES[c.sus.at].z));
        play('chase-out', { volume: 0.4 });
      } else if (beat === 'run') {
        g.talkAt = T + 0.15; // on the radio: you go round
        play('chase-run', { volume: 0.4 });
      } else if (beat === 'caught') {
        // a nod each, and a word; a full row and they turn to each other
        L.nodAt = now + 0.55;
        g.talkAt = T + 1.2;
        if (c.row >= ROW) L.roundAt = now + 1.3;
        play('chase-caught', { volume: 0.45 });
      } else if (beat === 'gone') play('chase-gone', { volume: 0.45 });
    }

    // ---- the cursor on the map: which street, and resting there closes it ----
    let hover = -1;
    const open = !!c && c.phase === 'chase' && c.closed.length < BLOCKS;
    let sx = 0;
    let sy = 0;
    let onScreen = false;
    if (close && c && cursorRay(st, fr, ray) && ray.direction.z < -1e-4) {
      const k = (FACE - ray.origin.z) / ray.direction.z;
      sx = ray.origin.x + ray.direction.x * k - SCREEN.x;
      sy = ray.origin.y + ray.direction.y * k - SCREEN.y;
      onScreen = k > 0 && Math.abs(sx) < SCREEN.w / 2 && Math.abs(sy) < SCREEN.h / 2;
    }
    // (one just closed under the cursor: it moves off before it closes another)
    if (g.lock && (!onScreen || Math.hypot(sx - g.lock.x, sy - g.lock.y) > PICK * 1.6)) g.lock = null;
    if (c && onScreen && !g.lock) {
      let best = PICK;
      STREETS.forEach(([a, b], i) => {
        if (c.closed.includes(i)) return;
        plan(NODES[a].x, NODES[a].z, _a);
        plan(NODES[b].x, NODES[b].z, _b);
        // the nearest point on the street to the cursor
        _d.copy(_b).sub(_a);
        const f = Math.max(0, Math.min(1, ((sx - _a.x) * _d.x + (sy - _a.y) * _d.y) / Math.max(1e-9, _d.lengthSq())));
        const d = Math.hypot(_a.x + _d.x * f - sx, _a.y + _d.y * f - sy);
        if (d < best) {
          best = d;
          hover = i;
        }
      });
    }
    g.rest = hover >= 0 && hover === g.hover && open ? g.rest + dt : 0;
    g.hover = hover;
    if (c && open && g.rest > DROP && closeStreet(c, hover)) {
      g.rest = 0;
      g.dropAt = T;
      g.lock = new Vector2(sx, sy);
      // the line from the map to its barrier in VR
      const [a, b] = STREETS[hover];
      const x = (NODES[a].x + NODES[b].x) / 2;
      const z = (NODES[a].z + NODES[b].z) / 2;
      plan(x, z, _a);
      beam.current?.geometry.setPositions([SCREEN.x + _a.x, SCREEN.y + _a.y, FACE + 0.002, x, SUSPECT_Y + lift(z), z]);
      play('chase-block', { volume: 0.45 });
    }

    // ---- what each of the two is asked to do: only ever what the story has
    // them do (stand and watch, set off, run, turn at a corner, close in) ----
    const sus = c ? spot(c.sus, new Vector2()) : null;
    const lookAt = (W: SessionLink['want'][number], x: number, y: number, z: number, glide: number) => {
      W.look.set(x, y, z);
      W.glide = glide;
    };
    for (let i = 0; i < 2 && c; i++) {
      const W = L.want[i];
      const m = c.cops[i];
      spot(m, _a);
      W.at.set(_a.x, HEAD_Y + lift(_a.y), _a.y);
      W.duck = 0;
      const peer = L.want[1 - i].at;
      heading(m, _d);
      const ahead = () => {
        const x = _a.x + _d.x * 0.6;
        const z = _a.y + _d.y * 0.6;
        lookAt(W, x, HEAD_Y + lift(z) - 0.04, z, 0.55);
      };
      if (c.phase === 'gather') {
        const n = NODES[ROUNDS[c.round].suspect];
        if (!still(m)) ahead();
        else lookAt(W, n.x, SUSPECT_Y + lift(n.z), n.z, 0.6);
      } else if (c.phase === 'chase' && sus) {
        const radio = c.t > STILL + 0.1 + i * 0.12 && c.t < STILL + 0.45 + i * 0.12;
        if (radio) lookAt(W, peer.x, peer.y, peer.z, 0.28); // on the radio to the other: you go round
        else if (still(m) || c.t < STILL + REACT[i] || _a.distanceTo(sus) < 0.4) lookAt(W, sus.x, SUSPECT_Y + lift(sus.y), sus.y, 0.45);
        else ahead();
      } else if (c.phase === 'caught' && sus) {
        if (c.t > 1.5) lookAt(W, peer.x, peer.y, peer.z, 0.5);
        else lookAt(W, sus.x, SUSPECT_Y + lift(sus.y) - (i === c.by ? 0.1 : 0), sus.y, 0.35);
        if (i === c.by) W.duck = 0.05 * Math.min(1, c.t / 0.3) * (c.t > 1.5 ? Math.max(0, 1 - (c.t - 1.5) / 0.4) : 1);
      } else if (c.phase === 'gone') {
        const w = WAYS[NODES[c.sus.at].way] ?? WAYS[0];
        if (c.t > 1.2) lookAt(W, peer.x, peer.y, peer.z, 0.5);
        else lookAt(W, w.x, SUSPECT_Y + lift(w.z), w.z, 0.5);
      }
    }
    if (c) {
      // never in each other's way as the close-up sees them: one behind the
      // other on the map would be one in front of the other here, so where
      // they'd cover each other they stand apart across it, each keeping the
      // side it came in on until they're clear
      const A = L.want[0].at;
      const B = L.want[1].at;
      const dx = B.x - A.x;
      if (Math.abs(dx) < SEP.x && Math.abs(B.y - A.y) < SEP.y) {
        if (!g.side) g.side = dx < 0 ? -1 : 1;
        const push = (SEP.x - g.side * dx) / 2;
        if (push > 0) {
          A.x -= g.side * push;
          B.x += g.side * push;
          const shift = Math.max(0, ACROSS[0] - Math.min(A.x, B.x)) - Math.max(0, Math.max(A.x, B.x) - ACROSS[1]);
          A.x += shift;
          B.x += shift;
        }
      } else g.side = 0;
    }

    // ---- the editor ----
    const on = g.on;
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
    // the story's line
    let head = 'ON PATROL';
    let sub = 'TWO IN VR, YOU IN THE EDITOR';
    if (c?.phase === 'chase') {
      head = c.t < STILL ? 'A SUSPECT AT THE CHECKPOINT' : c.way >= 0 ? `RUNNING FOR ${WAYS[c.way].name.toUpperCase()}` : 'CORNERED';
      sub = c.closed.length < BLOCKS ? `REST ON A STREET TO CLOSE IT · ${BLOCKS - c.closed.length} LEFT` : 'NO ROADBLOCKS LEFT';
    } else if (c?.phase === 'caught') {
      head = 'CAUGHT';
      sub = c.row >= ROW ? 'A FULL ROW' : `${c.row} IN A ROW`;
    } else if (c?.phase === 'gone') {
      head = `GOT AWAY BY ${(WAYS[NODES[c.sus.at].way]?.name ?? 'a way out').toUpperCase()}`;
      sub = 'THE ROW STARTS OVER';
    }
    const ink = c?.phase === 'gone' ? NEUTRAL : accentPale;
    if (g.status !== head + sub + ink) {
      g.status = head + sub + ink;
      drawStatus(mats.statusTex, head, sub, ink);
    }
    mats.status.opacity = on;
    // who's in
    mats.roster.forEach((m, i) => (m.opacity = on * (i < 2 ? 0.25 + 0.75 * L.heads[i].joined : 1)));
    // the two, where they are and the way they face
    for (let i = 0; i < 2; i++) {
      const hg = r.heads.current[i];
      const h = L.heads[i];
      if (!hg) continue;
      plan(h.x, h.z, _p);
      hg.position.set(SCREEN.x + _p.x, SCREEN.y + _p.y, FACE + 0.0009);
      // (on the map, far is up and it's wider than deep: a view along +z points down it)
      hg.rotation.z = Math.atan2(-Math.cos(h.yaw) * MAP.kz, Math.sin(h.yaw) * MAP.kx);
      hg.visible = h.joined > 0.01;
      hg.scale.setScalar(Math.max(0.001, h.joined));
    }
    mats.head.opacity = on;
    mats.cone.opacity = 0.2 * on;
    // the two on the radio: a line between them, on the map and in VR
    const told = Math.max(0, 1 - Math.abs(T - g.talkAt - 0.22) / 0.32);
    if (r.talk.current) {
      plan(L.heads[0].x, L.heads[0].z, _p);
      plan(L.heads[1].x, L.heads[1].z, _q);
      r.talk.current.visible = told > 0.01;
      r.talk.current.position.set(SCREEN.x + (_p.x + _q.x) / 2, SCREEN.y + (_p.y + _q.y) / 2, FACE + 0.0007);
      r.talk.current.rotation.z = Math.atan2(_q.y - _p.y, _q.x - _p.x);
      r.talk.current.scale.set(_p.distanceTo(_q), 0.0016, 1);
    }
    mats.talk.opacity = 0.8 * told * on;
    const t3 = talk3.current;
    if (t3) {
      t3.visible = told > 0.01;
      if (t3.visible) {
        const A = L.want[0].at;
        const B = L.want[1].at;
        t3.geometry.setPositions([A.x, A.y, A.z, B.x, B.y, B.z]);
      }
      t3.material.opacity = 0.7 * told * on;
    }
    // the checkpoint, while they make for it and the suspect gets out
    const cp = r.checkpoint.current;
    const atCheck = !!c && (c.phase === 'gather' || (c.phase === 'chase' && c.t < STILL + 0.6));
    if (cp && c) {
      plan(NODES[ROUNDS[c.round].suspect].x, NODES[ROUNDS[c.round].suspect].z, _p);
      cp.position.set(SCREEN.x + _p.x, SCREEN.y + _p.y, FACE + 0.0008);
    }
    hair('checkpoint', atCheck ? 0.6 * on : 0);
    // the suspect: a dot with a ring beating round it, its trail behind it, and
    // where it's running for ahead of it
    const seen = !!c && c.phase !== 'gather' && !!sus;
    const blink = c?.phase === 'gone' ? (Math.floor(c.t * 10) % 2 ? 0 : 1) * Math.max(0, 1 - c.t / 0.9) : 1;
    const pop = c && c.phase === 'chase' ? easeOutBack(Math.min(1, c.t / 0.3)) : 1;
    const sg = r.suspect.current;
    if (sg && sus) {
      plan(sus.x, sus.y, _p);
      sg.position.set(SCREEN.x + _p.x, SCREEN.y + _p.y, FACE + 0.0012);
      sg.scale.setScalar(0.0042 * Math.max(0.001, pop));
      sg.visible = seen;
    } else if (sg) sg.visible = false;
    mats.suspect.opacity = seen ? on * blink : 0;
    const beat = (T * 1.4) % 1;
    r.ring.current?.scale.setScalar(1.6 + 2.2 * beat);
    hair('ring', seen && c?.phase === 'chase' ? 0.6 * (1 - beat) * on : 0);
    // the trail: where it's been this last second and a half
    if (c && sus && seen && T - g.trailAt > TRAIL_EVERY) {
      g.trailAt = T;
      const p = g.trail.pop()!;
      g.trail.unshift(p.copy(sus));
    }
    const tl = hl.current.trail;
    if (tl && seen) {
      const f: number[] = [];
      g.trail.forEach((p) => {
        plan(p.x, p.y, _p);
        f.push(SCREEN.x + _p.x, SCREEN.y + _p.y, FACE + 0.001);
      });
      tl.geometry.setPositions(f);
    }
    hair('trail', seen ? 0.45 * on * blink : 0);
    // its way out, dashed, from where it is
    const rl = hl.current.route;
    const showRoute = !!c && c.phase === 'chase' && c.plan.length > 0 && !!sus;
    if (rl && showRoute && sus) {
      const f: number[] = [];
      plan(sus.x, sus.y, _p);
      f.push(SCREEN.x + _p.x, SCREEN.y + _p.y, FACE + 0.001);
      for (let k = 0; k < 11; k++) {
        const n = c.plan[Math.min(k, c.plan.length - 1)];
        plan(NODES[n].x, NODES[n].z, _p);
        f.push(SCREEN.x + _p.x, SCREEN.y + _p.y, FACE + 0.001);
      }
      rl.geometry.setPositions(f);
      rl.computeLineDistances();
    }
    hair('route', showRoute ? 0.5 * on : 0);
    // the way out it's running for, beating
    const wg = r.way.current;
    const running = !!c && c.phase === 'chase' && c.way >= 0;
    if (wg && running && c) {
      const w = WAYS[c.way];
      plan(w.x, w.z, _p);
      plan(NODES[w.from].x, NODES[w.from].z, _q);
      wg.position.set(SCREEN.x + _p.x, SCREEN.y + _p.y, FACE + 0.0011);
      wg.rotation.z = Math.atan2(_p.y - _q.y, _p.x - _q.x);
    }
    hair('way', running ? (0.55 + 0.45 * Math.sin(T * 6)) * on : 0, accent);
    // the streets closed: a barrier on each, on the map and in VR
    for (let k = 0; k < BLOCKS; k++) {
      const st2 = c?.closed[k];
      const bg = r.blocks.current[k];
      const vb = r.vrBlocks.current[k];
      const shown = st2 !== undefined;
      if (shown && c) {
        const [a, b] = STREETS[st2];
        const x = (NODES[a].x + NODES[b].x) / 2;
        const z = (NODES[a].z + NODES[b].z) / 2;
        plan(x, z, _p);
        bg?.position.set(SCREEN.x + _p.x, SCREEN.y + _p.y, FACE + 0.0013);
        if (vb) {
          vb.position.set(x, SUSPECT_Y + lift(z), z);
          vb.lookAt(st.camera.position);
          vb.scale.setScalar(px(vb) * RETICLE * 0.85);
        }
      }
      const fresh = shown && k === (c?.closed.length ?? 0) - 1 ? easeOutBack(Math.min(1, (T - g.dropAt) / 0.3)) : 1;
      if (bg) bg.scale.setScalar(0.0062 * Math.max(0.001, fresh));
      hair('block' + k, shown ? 0.95 * on : 0);
      hair('vrBlock' + k, shown ? 0.85 * on : 0);
    }
    // the street the cursor's on: lit, with brackets round its middle closing in
    // while it rests there
    const fill = Math.min(1, g.rest / DROP);
    const pk = r.pick.current;
    const hs = hl.current.hoverStreet;
    if (hover >= 0) {
      const [a, b] = STREETS[hover];
      plan((NODES[a].x + NODES[b].x) / 2, (NODES[a].z + NODES[b].z) / 2, _p);
      if (pk) {
        pk.position.set(SCREEN.x + _p.x, SCREEN.y + _p.y, FACE + 0.0012);
        pk.scale.setScalar(0.0105 * (1.7 - 0.7 * easeOut(fill)));
      }
      if (hs) {
        plan(NODES[a].x, NODES[a].z, _p);
        plan(NODES[b].x, NODES[b].z, _q);
        hs.geometry.setPositions([SCREEN.x + _p.x, SCREEN.y + _p.y, FACE + 0.0011, SCREEN.x + _q.x, SCREEN.y + _q.y, FACE + 0.0011]);
      }
    }
    if (pk) pk.visible = hover >= 0;
    hair('pick', hover >= 0 ? (open ? 0.95 : 0.35) * on : 0, open ? accentPale : NEUTRAL);
    hair('hoverStreet', hover >= 0 ? (open ? 0.75 : 0.3) * on : 0, open ? accentPale : NEUTRAL);
    // the pips: the newest flashes as it lights, and a full row flashes all together
    const round = L.roundAt >= 0 && now >= L.roundAt && now - L.roundAt < ROUND_LEN;
    const row = c?.row ?? 0;
    mats.pips.forEach((m, i) => {
      const fresh = c && c.phase === 'caught' && i === row - 1 ? 1 + 1.4 * bump(c.t / 0.6) : 1;
      const level = round ? (Math.floor((now - L.roundAt) * 6) % 2 ? 1.7 : 0.35) : i < row ? 1.25 * fresh : 0.16;
      m.color.set(accent).multiplyScalar(level);
      m.opacity = on;
    });

    // ---- in VR: the suspect's reticle, which the two chase ----
    const vg = r.vr.current;
    if (vg) {
      vg.visible = seen && on > 0.01;
      if (vg.visible && sus) {
        vg.position.set(sus.x, SUSPECT_Y + lift(sus.y), sus.y);
        vg.lookAt(st.camera.position);
        vg.scale.setScalar(px(vg) * RETICLE * Math.max(0.001, pop));
        // its brackets loose while it runs, locked in once it's caught
        const k = c?.phase === 'caught' ? 1 + 0.4 * (1 - easeOut(Math.min(1, c.t / 0.25))) : 1.4;
        r.vrBrackets.current?.scale.setScalar(k);
        const b = c?.phase === 'caught' ? Math.min(1, c.t / 0.5) : 0;
        r.vrBurst.current?.scale.setScalar(1.25 + 2.4 * (1 - (1 - b) * (1 - b)));
        hair('vrBurst', c?.phase === 'caught' ? 0.8 * (1 - b) * on : 0);
      } else hair('vrBurst', 0);
    }
    const vInk = c?.phase === 'caught' ? accentPale : accent;
    const vShown = seen ? on * blink : 0;
    hair('vrCross', 0.95 * vShown, vInk);
    hair('vrBrackets', (c?.phase === 'caught' ? 1 : 0.5) * vShown, vInk);
    mats.vrCore.color.set(vInk).multiplyScalar(1.4);
    mats.vrCore.opacity = vShown;
    // the street the cursor's on, there in VR too: brackets where its barrier
    // will go, closing in with the ones on the map
    const gg = r.ghost.current;
    if (gg) {
      gg.visible = hover >= 0 && on > 0.01;
      if (gg.visible) {
        const [a, b] = STREETS[hover];
        const z = (NODES[a].z + NODES[b].z) / 2;
        gg.position.set((NODES[a].x + NODES[b].x) / 2, SUSPECT_Y + lift(z), z);
        gg.lookAt(st.camera.position);
        gg.scale.setScalar(px(gg) * RETICLE * (1.7 - 0.7 * easeOut(fill)));
      }
    }
    hair('ghost', gg?.visible ? (open ? 0.75 : 0.3) * on : 0, open ? accentPale : NEUTRAL);
    // as a street's closed: the line from the map to VR
    const bl = beam.current;
    if (bl) {
      const k = (T - g.dropAt) / BEAM;
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
      <mesh material={mats.status} position={[SCREEN.x + STATUS.x, SCREEN.y + STATUS.y, FACE + 0.0008]} renderOrder={5}>
        <planeGeometry args={[STATUS.w, STATUS.h]} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} geometry={geo.dot} material={mats.roster[i]} position={[SCREEN.x + ROSTER.x + (i - 1) * ROSTER.pitch, SCREEN.y + ROSTER.y - 0.012, FACE + 0.001]} scale={0.0032} renderOrder={5} />
      ))}
      <group ref={r.checkpoint}>
        <group scale={0.0085}>
          <Hair at={hold('checkpoint')} points={BRACKETS} segments color={accentPale} width={1} />
        </group>
      </group>
      <Hair at={hold('trail')} points={trailPts} color={accent} width={1.5} />
      <Line ref={hold('route')} points={routePts} color={accent} lineWidth={1} dashed dashSize={0.006} gapSize={0.004} transparent opacity={0} depthWrite={false} fog={false} renderOrder={5} userData={{ lifeSkip: true, presenceOwn: true }} />
      <group ref={r.way}>
        <group scale={0.007}>
          <Hair at={hold('way')} points={CHEVRON} segments color={accent} width={1.2} />
        </group>
      </group>
      {Array.from({ length: BLOCKS }, (_, k) => (
        <group key={k} ref={(gr) => (r.blocks.current[k] = gr)}>
          <Hair at={hold('block' + k)} points={BARRIER} segments color={accentPale} width={1.2} />
        </group>
      ))}
      <Hair at={hold('hoverStreet')} points={flat} color={accentPale} width={2} />
      <group ref={r.pick} visible={false}>
        <Hair at={hold('pick')} points={BRACKETS} segments color={accentPale} width={1} />
      </group>
      {[0, 1].map((i) => (
        <group key={i} ref={(gr) => (r.heads.current[i] = gr)} visible={false}>
          <mesh geometry={geo.cone} material={mats.cone} scale={0.042} renderOrder={4} />
          <mesh geometry={geo.dot} material={mats.head} scale={0.0048} renderOrder={6} />
        </group>
      ))}
      <mesh ref={r.talk} material={mats.talk} visible={false} renderOrder={5}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <group ref={r.suspect} visible={false}>
        <mesh geometry={geo.dot} material={mats.suspect} renderOrder={7} />
        <group ref={r.ring}>
          <Hair at={hold('ring')} points={CIRCLE} color={accent} width={1} />
        </group>
      </group>
      {mats.pips.map((m, i) => (
        <mesh key={i} material={m} position={[SCREEN.x + (i - (ROW - 1) / 2) * PIPS.pitch, SCREEN.y + PIPS.y, FACE + 0.0012]} renderOrder={5}>
          <planeGeometry args={[PIPS.size, PIPS.size]} />
        </mesh>
      ))}
      {/* ---- in VR: the suspect's reticle, the barriers, and brackets where the cursor's resting ---- */}
      <group ref={r.vr} visible={false}>
        <Hair at={hold('vrCross')} points={CROSS} segments color={accent} width={1.5} over />
        <group ref={r.vrBrackets}>
          <Hair at={hold('vrBrackets')} points={BRACKETS} segments color={accent} width={1.5} over />
        </group>
        <mesh geometry={geo.dot} material={mats.vrCore} scale={0.16} renderOrder={9} />
        <group ref={r.vrBurst}>
          <Hair at={hold('vrBurst')} points={CIRCLE} color={accentPale} width={1.2} over />
        </group>
      </group>
      {Array.from({ length: BLOCKS }, (_, k) => (
        <group key={k} ref={(gr) => (r.vrBlocks.current[k] = gr)}>
          <Hair at={hold('vrBlock' + k)} points={BARRIER} segments color={accentPale} width={1.2} over />
        </group>
      ))}
      <group ref={r.ghost} visible={false}>
        <Hair at={hold('ghost')} points={BRACKETS} segments color={accentPale} width={1.5} over />
      </group>
      {/* (no `visible` here: drei hands its props to the line's material too) */}
      <Line ref={beam} points={flat} color={accent} lineWidth={1.2} transparent opacity={0} depthTest={false} renderOrder={9} userData={{ lifeSkip: true, presenceOwn: true }} />
      <Line ref={talk3} points={flat} color={accentPale} lineWidth={1.2} transparent opacity={0} depthTest={false} renderOrder={9} userData={{ lifeSkip: true, presenceOwn: true }} />
    </group>
  );
}

