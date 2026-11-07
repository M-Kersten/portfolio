// The Virtuele Brigade, played: the chase, in stages. The project was made
// multiplayer so instructors could run a scenario together, in VR, on desktop
// or in the editor, for training the Marechaussee, the Dutch military police.
// In its close-up you're the instructor in the editor, at the desk, and the
// two headsets above it are a patrol of two in VR. The monitor is the editor:
// a map of a small district, the two of them on it, and a line along the top
// that tells the story (chase.ts) and says what to do. A suspect runs from
// the checkpoint, and each stage shows a clue on the map (where it ran, a
// witness pointing the way, footprints, the suspect hiding) and then waits for
// you: rest the cursor on the place the clue points to and the team walks
// there, and the next clue comes. At the last, you send one of them round the
// back to cut the suspect off, and they have it. Everything happens on the
// screen; the two in VR act along with the story, loosely: they look about,
// turn the way the team goes, set off, nod. Not on a touch screen, where
// there's no cursor, nor under reduced motion (useCloseUp): there the session
// plays as it always has, and the monitor shows the app.
import { useEffect, useMemo, useRef, type ElementRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, CircleGeometry, MeshBasicMaterial, Matrix4, Ray, SRGBColorSpace, Vector2, Vector3, type Group, type InstancedMesh } from 'three';
import { Line, NEUTRAL, SURFACE, useAccent, type V3 } from './shared';
import { cursorRay, useCloseUp } from './closeup';
import { useGeometry } from './shapes';
import { play } from '../../lib/sound';
import { bump, easeOut, easeOutBack } from '../../lib/ease';
import { BRIDGES, CANAL, CLUE_LEN, COLS, LOOK, NODES, PLACES, ROWS, STORIES, STREETS, length, newStory, place, route, send, stageOf, step, teamAt, type Icon, type Story } from './chase';

/** Where the two in VR stand (their heads, desk frame): over the desk's left
 *  end and to the right of the screen, both clear above it. The camera looks
 *  on from the front left, so a look out into the room shows it their visors,
 *  and a look at each other shows them in profile. */
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
  /** a story done: they turn to each other and nod */
  roundAt: number;
  /** told back by room.tsx VRPlayers every frame: where each head is, which
   *  way it faces (atan2 of the x and z of its view) and whether it's in the
   *  session yet (0 → 1: the second logs in) */
  heads: { x: number; z: number; yaw: number; joined: number }[];
}
export const newSessionLink = (): SessionLink => ({
  on: false,
  want: POSTS.map((p) => ({ at: new Vector3(...p), look: new Vector3(p[0], p[1], 1.4), duck: 0, glide: 0.6 })),
  nodAt: -1,
  roundAt: -1,
  heads: POSTS.map((p) => ({ x: p[0], z: p[2], yaw: 0, joined: 0 })),
});
/** How long the two take over a story done, turned to each other. */
export const ROUND_LEN = 1.8;

const READY = 0.6; // s after the second's logged in before the first story
const DROP = 0.6; // s the cursor rests on the place to send the team there
const PICK = 0.026; // how near the place the cursor has to come on the map (screen units: ~14 px at 1280)
const SIDE = 0.026; // the second drawn this far beside the first while they walk together (map units)
const TRAIL = 24; // points along the running suspect's trail
const PRINTS = 10; // footprints

/* The editor, on the monitor's screen (RoomScreen in room.tsx: centred at
   [0, 0.63], 0.542 × 0.302, its face at z −0.1245): the story's line along the
   top, who's in at its right end (the two in VR, you), the map under it, and
   along the foot a pip for each stage of the story. */
const SCREEN = { x: 0, y: 0.63, w: 0.542, h: 0.302 };
const FACE = -0.1245;
const MAP = { cx: 0, cy: -0.016, kx: 0.47, kz: 0.29, x0: 0.04, z0: -0.03 };
const plan = (x: number, z: number, out: Vector2) => out.set(MAP.cx + (x - MAP.x0) * MAP.kx, MAP.cy - (z - MAP.z0) * MAP.kz);
const STATUS = { x: -0.06, y: 0.121, w: 0.4, h: 0.056 }; // the line's strip (centre, size)
const ROSTER = { x: 0.178, y: 0.121, pitch: 0.03 };
const PIPS = { y: -0.137, pitch: 0.024, size: 0.011 };

/* The marks on the map, in hairlines (the site's Line: its width in px at any
   distance), in their own units. */
const BRACKETS: V3[] = [-1, 1].flatMap((sx) =>
  [-1, 1].flatMap((sy): V3[] => [
    [sx, sy, 0], [sx * 0.45, sy, 0],
    [sx, sy, 0], [sx, sy * 0.45, 0],
  ]),
);
const CIRCLE: V3[] = Array.from({ length: 49 }, (_, k): V3 => [Math.cos((k / 48) * Math.PI * 2), Math.sin((k / 48) * Math.PI * 2), 0]);
/** A witness: a head and shoulders. */
const PERSON: V3[] = [
  ...Array.from({ length: 16 }, (_, k): V3[] => {
    const a = (k / 16) * Math.PI * 2;
    const b = ((k + 1) / 16) * Math.PI * 2;
    return [[0.42 * Math.cos(a), 0.55 + 0.42 * Math.sin(a), 0], [0.42 * Math.cos(b), 0.55 + 0.42 * Math.sin(b), 0]];
  }).flat(),
  [-0.8, -1, 0], [-0.8, -0.35, 0], [-0.8, -0.35, 0], [-0.45, 0.02, 0], [-0.45, 0.02, 0], [0.45, 0.02, 0], [0.45, 0.02, 0], [0.8, -0.35, 0], [0.8, -0.35, 0], [0.8, -1, 0],
];
/** An arrowhead, pointing along +x. */
const HEAD: V3[] = [[-1, -0.7, 0], [0, 0, 0], [0, 0, 0], [-1, 0.7, 0]];

type Hairline = ElementRef<typeof Line>;
/** A hairline on the screen: the site's Line, shown by setting its opacity. */
function Hair({ at, points, segments, color, width = 1.2, dashed = false }: { at: (l: Hairline | null) => void; points: V3[]; segments?: boolean; color: string; width?: number; dashed?: boolean }) {
  return <Line ref={at} points={points} segments={segments} color={color} lineWidth={width} dashed={dashed} dashSize={0.005} gapSize={0.004} transparent opacity={0} depthWrite={false} fog={false} renderOrder={5} userData={{ lifeSkip: true, presenceOwn: true }} />;
}

const _a = new Vector2();
const _b = new Vector2();
const _p = new Vector2();
const _q = new Vector2();
const _m = new Matrix4();
/** A point on the screen's face, from map units. */
const onScreen = (x: number, z: number, lift = 0.001): V3 => {
  plan(x, z, _p);
  return [SCREEN.x + _p.x, SCREEN.y + _p.y, FACE + lift];
};
/** The point `f` of the way along a path of junctions. */
const along = (path: number[], f: number, out: Vector2) => place({ path, s: f * length(path) }, out);

/** A place's mark, drawn into the map: a barrier (the checkpoint), a market
 *  stall, a tree (the park), a train (the station), an anchor (the harbour), a
 *  shed. Centred on (x, y), `r` px from the middle, in the current stroke. */
function icon(g: CanvasRenderingContext2D, kind: Icon, x: number, y: number, r: number) {
  g.beginPath();
  switch (kind) {
    case 'barrier':
      g.rect(x - r, y - r * 0.45, 2 * r, r * 0.55);
      for (let k = -1; k <= 1; k++) {
        g.moveTo(x + k * r * 0.55 - r * 0.2, y + r * 0.1);
        g.lineTo(x + k * r * 0.55 + r * 0.2, y - r * 0.45);
      }
      g.moveTo(x - r * 0.75, y + r * 0.1);
      g.lineTo(x - r * 0.75, y + r * 0.8);
      g.moveTo(x + r * 0.75, y + r * 0.1);
      g.lineTo(x + r * 0.75, y + r * 0.8);
      break;
    case 'stall':
      g.moveTo(x - r, y - r * 0.2);
      for (let k = 0; k < 4; k++) g.quadraticCurveTo(x - r + (k + 0.5) * r * 0.5, y + r * 0.15, x - r + (k + 1) * r * 0.5, y - r * 0.2);
      g.lineTo(x + r * 0.8, y - r * 0.75);
      g.lineTo(x - r * 0.8, y - r * 0.75);
      g.closePath();
      g.moveTo(x - r * 0.8, y);
      g.lineTo(x - r * 0.8, y + r * 0.85);
      g.moveTo(x + r * 0.8, y);
      g.lineTo(x + r * 0.8, y + r * 0.85);
      break;
    case 'tree':
      g.arc(x, y - r * 0.25, r * 0.6, 0, Math.PI * 2);
      g.moveTo(x, y + r * 0.35);
      g.lineTo(x, y + r * 0.9);
      break;
    case 'train':
      g.roundRect(x - r * 0.75, y - r * 0.85, r * 1.5, r * 1.35, r * 0.3);
      g.moveTo(x - r * 0.75, y - r * 0.15);
      g.lineTo(x + r * 0.75, y - r * 0.15);
      g.moveTo(x - r * 0.27, y + r * 0.85);
      g.arc(x - r * 0.45, y + r * 0.85, r * 0.18, 0, Math.PI * 2);
      g.moveTo(x + r * 0.63, y + r * 0.85);
      g.arc(x + r * 0.45, y + r * 0.85, r * 0.18, 0, Math.PI * 2);
      break;
    case 'anchor':
      g.arc(x, y - r * 0.75, r * 0.2, 0, Math.PI * 2);
      g.moveTo(x, y - r * 0.55);
      g.lineTo(x, y + r * 0.85);
      g.moveTo(x - r * 0.45, y - r * 0.3);
      g.lineTo(x + r * 0.45, y - r * 0.3);
      g.moveTo(x - r * 0.75, y + r * 0.3);
      g.quadraticCurveTo(x - r * 0.6, y + r * 0.95, x, y + r * 0.85);
      g.quadraticCurveTo(x + r * 0.6, y + r * 0.95, x + r * 0.75, y + r * 0.3);
      break;
    case 'shed':
      g.moveTo(x - r * 0.85, y + r * 0.8);
      g.lineTo(x - r * 0.85, y - r * 0.2);
      g.lineTo(x, y - r * 0.85);
      g.lineTo(x + r * 0.85, y - r * 0.2);
      g.lineTo(x + r * 0.85, y + r * 0.8);
      g.closePath();
      g.rect(x - r * 0.3, y + r * 0.15, r * 0.6, r * 0.65);
      break;
  }
  g.stroke();
}

/** The district, drawn once: its blocks, the canal and its bridges, the
 *  streets, the places the stories go, and who's in at the top right (two
 *  headsets and a desktop). */
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
  const [gx0, gz0] = at(COLS[0] - 0.06, ROWS[0] - 0.06);
  const [gx1, gz1] = at(COLS[COLS.length - 1] + 0.06, ROWS[ROWS.length - 1] + 0.06);
  g.fillStyle = '#0f1b23';
  g.strokeStyle = '#22394a';
  g.beginPath();
  g.roundRect(gx0, gz0, gx1 - gx0, gz1 - gz0, 12);
  g.fill();
  g.stroke();
  // the blocks between the streets (the quays either side of the canal)
  const street = 0.03; // a street's width, map units
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
  const [cx0] = at(COLS[0] - 0.06, 0);
  const [cx1] = at(COLS[COLS.length - 1] + 0.06, 0);
  g.fillStyle = '#0d2838';
  g.fillRect(cx0, canalTop, cx1 - cx0, canalFoot - canalTop);
  g.strokeStyle = '#1d4a62';
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
  // the streets and the bridges over the canal
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
  // the places, each in the block beside its junction
  g.strokeStyle = '#4b6e82';
  g.lineWidth = 3;
  g.lineJoin = 'round';
  for (const p of PLACES) {
    const n = NODES[p.at];
    icon(g, p.icon, ...at(n.x + p.dx, n.z + p.dz), 15);
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

/** The story's line: what's happening, and under it what to do. Each line as
 *  large as the strip lets it be. */
function drawStatus(t: CanvasTexture, head: string, sub: string, ink: string) {
  const c = t.image as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  const H = c.height;
  const room = c.width - 20;
  g.clearRect(0, 0, c.width, H);
  const mono = '"Space Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  const spaced = g as CanvasRenderingContext2D & { letterSpacing?: string };
  const fit = (text: string, weight: number, size: number, spacing: number) => {
    let px = size;
    for (;;) {
      g.font = `${weight} ${Math.round(px)}px ${mono}`;
      spaced.letterSpacing = `${spacing}px`;
      if (g.measureText(text).width <= room || px < 18) return;
      px -= 2;
    }
  };
  g.textBaseline = 'alphabetic';
  g.fillStyle = ink;
  fit(head, 700, H * 0.34, 3);
  g.fillText(head, 10, H * 0.47);
  g.fillStyle = 'rgba(211, 228, 246, 0.66)';
  fit(sub, 400, H * 0.25, 2);
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
  const mats = useMemo(() => {
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
    const statusTex = new CanvasTexture(line);
    statusTex.colorSpace = SRGBColorSpace;
    statusTex.anisotropy = 4;
    return {
      ground,
      statusTex,
      status: ink('#ffffff', statusTex),
      team: ink(accentPale),
      cone: ink(accentPale),
      suspect: ink(accent),
      prints: ink(accentPale),
      roster: [0, 1, 2].map(() => ink(accent)),
      pips: Array.from({ length: 4 }, () => ink(accent)),
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
    team: useRef<(Group | null)[]>([]),
    suspect: useRef<Group>(null),
    ring: useRef<Group>(null),
    witness: useRef<Group>(null),
    arrowHead: useRef<Group>(null),
    target: useRef<Group>(null),
    targetRing: useRef<Group>(null),
    brackets: useRef<Group>(null),
    prints: useRef<InstancedMesh>(null),
  };
  const hl = useRef<Record<string, Hairline | null>>({});
  const hold = (k: string) => (l: Hairline | null) => {
    hl.current[k] = l;
  };
  const trailPts = useMemo<V3[]>(() => Array.from({ length: TRAIL }, (_, k): V3 => [0, k * 1e-5, 0]), []);
  const arrowPts = useMemo<V3[]>(() => [
    [0, 0, 0],
    [0, 0.001, 0],
  ], []);
  const game = useRef({
    on: 0, // the editor, faded in
    in: 0, // s since the second logged in
    s: null as Story | null,
    rest: 0, // s the cursor has rested on the place
    status: '',
    clock: 0,
  });
  const v = useMemo(() => ({ pos: [new Vector2(), new Vector2()], dir: [new Vector2(), new Vector2()], hide: new Vector2() }), []);

  useFrame((st, delta) => {
    const fr = frame.current;
    if (!fr) return;
    const dt = Math.min(delta, 1 / 30);
    const now = st.clock.elapsedTime; // the scene's clock: what the two in VR nod and huddle by
    const g = game.current;
    g.clock += dt;
    const L = link.current;
    L.on = close;
    g.on = close ? Math.min(1, g.on + dt / 0.4) : Math.max(0, g.on - dt / 0.3);
    const joined = L.heads[1].joined;
    g.in = close && joined > 0.99 ? g.in + dt : 0;
    // closed (or a touch screen): the story put away; it starts afresh next time
    if (!close && g.s) Object.assign(g, { s: null, rest: 0 });

    // ---- the story (chase.ts): it starts once the second has logged in ----
    if (close && !g.s && g.in > READY) g.s = newStory();
    const s = g.s;
    const stage = s ? stageOf(s) : null;
    if (s) {
      const beat = step(s, dt);
      if (beat === 'clue' || beat === 'arrived') play('chase-clue', { volume: 0.4 });
      else if (beat === 'caught') {
        // a nod each, and the story done, they turn to each other
        L.nodAt = now + 0.4;
        L.roundAt = now + 1.5;
        play('chase-caught', { volume: 0.45 });
      }
    }

    // ---- the cursor on the map: resting on the place sends the team there ----
    const waiting = !!s && s.phase === 'wait' && !!stage;
    let onIt = false;
    if (waiting && stage && cursorRay(st, fr, ray) && ray.direction.z < -1e-4) {
      const k = (FACE - ray.origin.z) / ray.direction.z;
      const sx = ray.origin.x + ray.direction.x * k - SCREEN.x;
      const sy = ray.origin.y + ray.direction.y * k - SCREEN.y;
      const n = NODES[stage.target];
      plan(n.x, n.z, _a);
      onIt = k > 0 && Math.hypot(sx - _a.x, sy - _a.y) < PICK;
    }
    g.rest = onIt ? g.rest + dt : 0;
    if (s && onIt && g.rest > DROP && send(s)) {
      g.rest = 0;
      play('chase-send', { volume: 0.45 });
    }

    // ---- the two on the map: where they are, and which way they're headed ----
    const [pos, dirs] = [v.pos, v.dir];
    if (s) {
      s.team.forEach((w, i) => {
        place(w, pos[i]);
        // along its path, or, standing, toward what's happening
        place({ path: w.path, s: Math.min(length(w.path), w.s + 0.02) }, dirs[i]).sub(pos[i]);
        if (dirs[i].lengthSq() < 1e-8 && stage) {
          const c = stage.clue;
          const to = c.kind === 'run' ? c.to : c.kind === 'prints' ? stage.target : c.at;
          dirs[i].set(NODES[to].x - pos[i].x, NODES[to].z - pos[i].y);
        }
        if (dirs[i].lengthSq() > 1e-8) dirs[i].normalize();
      });
      // walking together, the second beside the first rather than on top of it
      const d = pos[0].distanceTo(pos[1]);
      if (d < SIDE) {
        const k = 1 - d / SIDE;
        pos[1].x -= SIDE * 0.7 * k;
        pos[1].y += SIDE * 0.7 * k;
      }
    }

    // ---- what the two in VR do: along with the story, not on its map ----
    for (let i = 0; i < 2 && s; i++) {
      const W = L.want[i];
      const [px0, py0, pz0] = POSTS[i];
      const peer = L.want[1 - i].at;
      const going = s.phase === 'go' || s.phase === 'home' || s.phase === 'close' || (s.phase === 'round' && i === 1);
      // a step or two the way the team goes, while it goes
      const stride = going ? Math.min(1, s.t / 0.8) * 0.05 : 0;
      W.at.set(px0 + dirs[i].x * stride, py0, pz0 + dirs[i].y * stride);
      W.duck = 0;
      const look = (dx: number, dy: number, dz: number, glide: number) => {
        W.look.set(W.at.x + dx, W.at.y + dy, W.at.z + dz);
        W.glide = glide;
      };
      const atPeer = (glide: number) => look(peer.x - W.at.x, peer.y - W.at.y, peer.z - W.at.z, glide);
      // the way the team's headed, as a direction in the room
      const ahead = (dy = -0.05) => look(dirs[i].x, dy, dirs[i].y, 0.6);
      if (s.phase === 'brief') {
        if (s.t < 0.9) atPeer(0.6);
        else look(0, -0.08, 1, 0.7);
      } else if (s.phase === 'clue') {
        // a look about on getting there, then at what's happened
        if (s.t < LOOK) look(Math.sin(s.t * 2 + i * 2) * 0.6, -0.3, 0.8, 0.5);
        else ahead();
      } else if (s.phase === 'wait') {
        // waiting on the editor: now and then one turns to the other
        const b = (s.t + i * 1.7) % 6;
        if (b > 4.2 && b < 5.4) atPeer(0.6);
        else ahead(-0.03);
      } else if (s.phase === 'caught') {
        if (s.t > 1.6) atPeer(0.5);
        else look(dirs[i].x * 0.5, -0.35, dirs[i].y * 0.5 + 0.2, 0.4);
        if (i === 0) W.duck = 0.05 * Math.min(1, s.t / 0.3) * (s.t > 1.6 ? Math.max(0, 1 - (s.t - 1.6) / 0.4) : 1);
      } else ahead();
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
    // the story's line
    let head = 'ON PATROL';
    let sub = 'TWO IN VR, YOU IN THE EDITOR';
    if (close && joined < 0.99) {
      head = 'PLAYER 2 LOGGING IN';
      sub = 'TWO IN VR, YOU IN THE EDITOR';
    } else if (s && stage && (s.phase === 'clue' || s.phase === 'wait' || s.phase === 'go')) {
      head = stage.head;
      sub = s.phase === 'go' ? 'ON THEIR WAY' : s.phase === 'wait' ? stage.sub : '';
    } else if (s && (s.phase === 'round' || s.phase === 'close')) {
      head = s.phase === 'round' ? 'ONE GOES ROUND THE BACK' : 'CLOSING IN';
      sub = 'FROM BOTH SIDES';
    } else if (s?.phase === 'caught') {
      head = 'CAUGHT';
      sub = 'WELL DONE';
    } else if (s?.phase === 'home') {
      head = 'BACK TO THE CHECKPOINT';
      sub = '';
    } else if (s?.phase === 'brief') {
      head = 'AT THE CHECKPOINT';
    }
    if (g.status !== head + sub) {
      g.status = head + sub;
      drawStatus(mats.statusTex, head, sub, accentPale);
    }
    mats.status.opacity = on;
    // who's in: the second's light blinks while it logs in
    mats.roster.forEach((m, i) => {
      const logging = i === 1 && close && joined < 0.99;
      m.opacity = on * (i === 1 ? (logging ? (Math.floor(g.clock * 4) % 2 ? 0.2 : 0.9) : 0.25 + 0.75 * joined) : 1);
    });
    // the two on the map
    for (let i = 0; i < 2; i++) {
      const tg = r.team.current[i];
      if (!tg) continue;
      tg.visible = !!s;
      if (!s) continue;
      plan(pos[i].x, pos[i].y, _p);
      tg.position.set(SCREEN.x + _p.x, SCREEN.y + _p.y, FACE + 0.0009);
      // (on the map, far is up and it's wider than deep)
      tg.rotation.z = Math.atan2(-dirs[i].y * MAP.kz, dirs[i].x * MAP.kx);
    }
    mats.team.opacity = on;
    mats.cone.opacity = 0.22 * on;

    // ---- the clue ----
    const clue = stage?.clue;
    const showing = !!s && !!clue && s.phase !== 'brief' && s.phase !== 'home';
    const k = s && s.phase === 'clue' ? Math.max(0, Math.min(1, (s.t - LOOK) / (clue ? CLUE_LEN[clue.kind] : 1))) : 1;
    const shown = !showing || (s?.phase === 'clue' && s.t < LOOK) ? 0 : on;
    // the suspect: running off (and out of sight), or hiding
    const sg = r.suspect.current;
    let suspectOn = 0;
    if (sg && clue && (clue.kind === 'run' || clue.kind === 'hiding')) {
      if (clue.kind === 'run') {
        const path = route(clue.from, clue.to);
        const f = Math.min(1, k * 1.25);
        along(path, f, v.hide);
        // it runs off, and is gone
        suspectOn = k < 0.8 ? 1 : Math.max(0, 1 - (k - 0.8) / 0.2) * (Math.floor(g.clock * 10) % 2 ? 0.3 : 1);
        // its trail, from the checkpoint to where it was last seen
        const tl = hl.current.trail;
        if (tl && shown > 0) {
          const pts: number[] = [];
          for (let n = 0; n < TRAIL; n++) {
            along(path, (f * n) / (TRAIL - 1), _q);
            pts.push(...onScreen(_q.x, _q.y));
          }
          tl.geometry.setPositions(pts);
        }
      } else {
        v.hide.set(NODES[clue.at].x, NODES[clue.at].z);
        suspectOn = s?.phase === 'caught' ? Math.max(0, 1 - (s.t - 1) / 0.6) : 1;
      }
      plan(v.hide.x, v.hide.y, _p);
      sg.position.set(SCREEN.x + _p.x, SCREEN.y + _p.y, FACE + 0.0012);
      sg.scale.setScalar(0.0044 * Math.max(0.001, clue.kind === 'hiding' ? easeOutBack(Math.min(1, k)) : 1));
    }
    if (sg) sg.visible = suspectOn * shown > 0.01;
    mats.suspect.opacity = suspectOn * shown;
    const beat = (g.clock * 1.3) % 1;
    r.ring.current?.scale.setScalar(1.6 + 2.2 * beat);
    hair('ring', clue?.kind === 'hiding' && s?.phase !== 'caught' ? 0.6 * (1 - beat) * suspectOn * shown : 0, accent);
    hair('trail', clue?.kind === 'run' ? 0.5 * shown : 0, accent);
    // a witness, pointing the way
    if (clue?.kind === 'witness') {
      r.witness.current?.position.set(...onScreen(NODES[clue.at].x + 0.035, NODES[clue.at].z - 0.04, 0.0012));
      r.witness.current?.scale.setScalar(0.0062 * Math.max(0.001, easeOutBack(Math.min(1, k * 2))));
      // the way they point: a dashed line growing toward the place, and its head
      const from = onScreen(NODES[clue.at].x, NODES[clue.at].z);
      const to = onScreen(NODES[clue.to].x, NODES[clue.to].z);
      const f = easeOut(Math.min(1, Math.max(0, k * 1.4 - 0.3))) * 0.82;
      const tip: V3 = [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f, from[2]];
      const al = hl.current.arrow;
      if (al) {
        al.geometry.setPositions([...from, ...tip]);
        al.computeLineDistances();
      }
      r.arrowHead.current?.position.set(...tip);
      r.arrowHead.current?.rotation.set(0, 0, Math.atan2(to[1] - from[1], to[0] - from[0]));
    }
    hair('witness', clue?.kind === 'witness' ? 0.9 * shown : 0);
    hair('arrow', clue?.kind === 'witness' ? 0.8 * shown : 0, accent);
    hair('arrowHead', clue?.kind === 'witness' && k > 0.25 ? 0.9 * shown : 0, accent);
    // footprints, off toward the place, in pairs
    const pr = r.prints.current;
    if (pr) {
      const fp = clue?.kind === 'prints' && s && stage ? shown : 0;
      pr.visible = fp > 0.01;
      if (pr.visible && s && stage) {
        const path = route(s.phase === 'go' ? s.team[0].path[0] : teamAt(s), stage.target);
        const n = Math.round(PRINTS * k);
        for (let j = 0; j < PRINTS; j++) {
          const f = 0.12 + (0.7 * j) / PRINTS;
          along(path, f, _q);
          along(path, f + 0.02, _b);
          const sx = -(_b.y - _q.y);
          const sz = _b.x - _q.x;
          const l = Math.hypot(sx, sz) || 1;
          const side = j % 2 ? 1 : -1;
          plan(_q.x + (sx / l) * 0.009 * side, _q.y + (sz / l) * 0.009 * side, _p);
          const sc = j < n ? 0.0022 : 0;
          _m.makeScale(sc, sc, 1).setPosition(SCREEN.x + _p.x, SCREEN.y + _p.y, FACE + 0.0011);
          pr.setMatrixAt(j, _m);
        }
        pr.instanceMatrix.needsUpdate = true;
      }
      mats.prints.opacity = 0.85 * fp;
    }
    // the place to send them: a ring beating round it, and brackets closing in
    // while the cursor rests there
    if (stage) r.target.current?.position.set(...onScreen(NODES[stage.target].x, NODES[stage.target].z, 0.0013));
    const pulse = (g.clock * 1.1) % 1;
    r.targetRing.current?.scale.setScalar(0.009 + 0.012 * pulse);
    hair('targetRing', waiting ? (0.25 + 0.6 * (1 - pulse)) * on : 0, accentPale);
    const fill = Math.min(1, g.rest / DROP);
    r.brackets.current?.scale.setScalar(0.0105 * (1.6 - 0.6 * easeOut(fill)));
    hair('brackets', waiting ? (onIt ? 0.95 : 0.5) * on : 0, onIt ? accentPale : NEUTRAL);
    // the pips: a stage each, the newest flashing as it lights; a story done flashes them all
    const done = s?.done ?? 0;
    const stages = s ? STORIES[s.story].length : 4;
    const round = L.roundAt >= 0 && now >= L.roundAt && now - L.roundAt < ROUND_LEN;
    mats.pips.forEach((m, i) => {
      const fresh = s && i === done - 1 && (s.phase === 'clue' || s.phase === 'caught') ? 1 + 1.4 * bump(s.t / 0.6) : 1;
      const level = round ? (Math.floor((now - L.roundAt) * 6) % 2 ? 1.7 : 0.35) : i < done ? 1.25 * fresh : 0.16;
      m.color.set(accent).multiplyScalar(level);
      m.opacity = i < stages ? on : 0;
    });
  });

  return (
    <group ref={frame}>
      <mesh material={mats.ground} position={[SCREEN.x, SCREEN.y, FACE + 0.0004]} renderOrder={3}>
        <planeGeometry args={[SCREEN.w, SCREEN.h]} />
      </mesh>
      <mesh material={mats.status} position={[SCREEN.x + STATUS.x, SCREEN.y + STATUS.y, FACE + 0.0008]} renderOrder={5}>
        <planeGeometry args={[STATUS.w, STATUS.h]} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} geometry={geo.dot} material={mats.roster[i]} position={[SCREEN.x + ROSTER.x + (i - 1) * ROSTER.pitch, SCREEN.y + ROSTER.y - 0.012, FACE + 0.001]} scale={0.0032} renderOrder={5} />
      ))}
      <Hair at={hold('trail')} points={trailPts} color={accent} width={1.5} />
      <instancedMesh ref={r.prints} args={[geo.dot, mats.prints, PRINTS]} frustumCulled={false} visible={false} renderOrder={5} />
      <group ref={r.witness}>
        <Hair at={hold('witness')} points={PERSON} segments color={accentPale} width={1.2} />
      </group>
      <Hair at={hold('arrow')} points={arrowPts} color={accent} width={1.2} dashed />
      <group ref={r.arrowHead}>
        <group scale={0.006}>
          <Hair at={hold('arrowHead')} points={HEAD} segments color={accent} width={1.2} />
        </group>
      </group>
      <group ref={r.suspect} visible={false}>
        <mesh geometry={geo.dot} material={mats.suspect} renderOrder={7} />
        <group ref={r.ring}>
          <Hair at={hold('ring')} points={CIRCLE} color={accent} width={1} />
        </group>
      </group>
      <group ref={r.target}>
        <group ref={r.targetRing}>
          <Hair at={hold('targetRing')} points={CIRCLE} color={accentPale} width={1.2} />
        </group>
        <group ref={r.brackets}>
          <Hair at={hold('brackets')} points={BRACKETS} segments color={accentPale} width={1} />
        </group>
      </group>
      {[0, 1].map((i) => (
        <group key={i} ref={(gr) => (r.team.current[i] = gr)} visible={false}>
          <mesh geometry={geo.cone} material={mats.cone} scale={0.03} renderOrder={4} />
          <mesh geometry={geo.dot} material={mats.team} scale={0.0046} renderOrder={6} />
        </group>
      ))}
      {mats.pips.map((m, i) => (
        <mesh key={i} material={m} position={[SCREEN.x + (i - 1.5) * PIPS.pitch, SCREEN.y + PIPS.y, FACE + 0.0012]} renderOrder={5}>
          <planeGeometry args={[PIPS.size, PIPS.size]} />
        </mesh>
      ))}
    </group>
  );
}
