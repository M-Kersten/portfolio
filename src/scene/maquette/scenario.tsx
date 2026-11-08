// The Virtuele Brigade, played: a chase through a terminal, room by room. The
// project was made multiplayer so instructors could run a scenario together,
// in VR, on desktop or in the editor, for training the Marechaussee, the Dutch
// military police. In its close-up you're the instructor in the editor, at
// the desk, and the two headsets above it are a patrol of two in VR. The
// monitor is the editor: one room of a terminal at a time, from above, the two
// of them in it, and a line along the top that tells the story (terminal.ts)
// and says what to do. A traveller bolts from passport control: rest the
// cursor on the door and the two go after them, out of the frame, and the view
// pans to the next room, where they are. In the baggage hall and the staff
// corridor the suspect's hiding: rest the cursor on a hiding place and one of
// the two goes to look, until they're found and run for the next door. On the
// loading dock they're cornered, and you send one round the back. It's all
// resting the cursor, never a click. Everything happens on the screen
// (terminalArt.ts draws it); the two in VR act along with the story, loosely:
// they look about, turn the way the team goes, set off, nod. Not on a touch
// screen, where there's no cursor, nor under reduced motion (useCloseUp):
// there the session plays as it always has, and the monitor shows the app.
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, CircleGeometry, MeshBasicMaterial, Ray, SRGBColorSpace, Vector3, type Group } from 'three';
import { SURFACE, useAccent, type V3 } from './shared';
import { cursorRay, useCloseUp } from './closeup';
import { useGeometry } from './shapes';
import { play } from '../../lib/sound';
import { bump } from '../../lib/ease';
import { DOOR_RING, FRAME, ROOMS, STORIES, act, aim, doorPoint, frameOf, lines, newChase, onPlan, place, step, targets, walking, wayRound, type Chase, type Pt, type Target } from './terminal';
import { PLAN, PRINT_FADE, SCALE, cpuCanvas, drawPlan, paint, type Accent, type Frame, type Print } from './terminalArt';

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
const DROP = 0.6; // s the cursor rests on something to send the team there
const STEP = 34; // plan units between the suspect's footprints

/* The editor, on the monitor's screen (RoomScreen in room.tsx: centred at
   [0, 0.63], 0.542 × 0.302, its face at z −0.1245): the story's line along the
   top, who's in at its right end (the two in VR, you), the view of the room
   under it, and along the foot a pip for each room of the story. */
const SCREEN = { x: 0, y: 0.63, w: 0.542, h: 0.302 };
const FACE = -0.1245;
const STATUS = { x: -0.06, y: 0.121, w: 0.4, h: 0.056 }; // the line's strip (centre, size)
const ROSTER = { x: 0.178, y: 0.121, pitch: 0.03 };
const VIEW = { x: 0, y: 0.093 - 0.2202 / 2, w: 0.542, h: 0.2202 }; // the room's view, under the strip (centre, size: 1280 × 520 px)
const PIPS = { y: -0.137, pitch: 0.024, size: 0.011 };

/** The screen round the view, drawn once: its dark, the story's strip along
 *  the top and who's in at its right end (two headsets and a desktop). */
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
  // the story's strip along the top
  g.fillStyle = '#101c24';
  g.fillRect(0, 0, W, py(STATUS.y - STATUS.h / 2));
  g.strokeStyle = '#22394a';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, py(STATUS.y - STATUS.h / 2));
  g.lineTo(W, py(STATUS.y - STATUS.h / 2));
  g.stroke();
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

/** What a target is on the plan: where its ring goes, and the box the cursor
 *  has to be in to rest on it. */
function targetBox(c: Chase, t: Target): [number, number, number, number] {
  const rm = ROOMS[c.room];
  if (t.kind === 'spot') {
    const b = rm.spots[t.i].box;
    const o = onPlan(c.room, [b[0], b[1]]);
    return [o[0], o[1], b[2], b[3]];
  }
  const p = t.kind === 'door' ? onPlan(c.room, doorPoint(rm.doors[rm.exit], DOOR_RING)) : onPlan(c.room, STORIES[c.story].corner.far);
  const r = t.kind === 'door' ? 72 : 64;
  return [p[0] - r, p[1] - r, 2 * r, 2 * r];
}
const same = (a: Target | null, b: Target | null) => !!a && !!b && a.kind === b.kind && (a.kind !== 'spot' || (b.kind === 'spot' && a.i === b.i));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function Scenario({ slug, link }: { slug: string; link: MutableRefObject<SessionLink> }) {
  const close = useCloseUp(slug);
  const { accent, accentPale, accentDeep } = useAccent();
  const ink = useMemo<Accent>(() => ({ accent, pale: accentPale, deep: accentDeep }), [accent, accentPale, accentDeep]);
  const frame = useRef<Group>(null); // the desk's frame
  const ray = useMemo(() => new Ray(), []);
  const geo = useGeometry(() => ({ dot: new CircleGeometry(1, 24) }));
  // the terminal, drawn once onto its plan (and again once the face for the rooms' names is in)
  const plan = useMemo(() => {
    const [c] = cpuCanvas(Math.ceil(PLAN.w * SCALE), Math.ceil(PLAN.h * SCALE));
    drawPlan(c, ink);
    return c;
  }, [ink]);
  useEffect(() => {
    let live = true;
    document.fonts
      ?.load('700 24px "Space Mono"')
      .then(() => live && drawPlan(plan, ink))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [plan, ink]);
  const mats = useMemo(() => {
    const ink = (color: string, map?: CanvasTexture) => {
      const m = new MeshBasicMaterial({ color, map, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false });
      m.userData = { lifeSkip: true, presenceOwn: true };
      return m;
    };
    const ground = ink('#ffffff', editorTexture());
    const line = document.createElement('canvas');
    line.width = 1024;
    line.height = Math.round((1024 * STATUS.h) / STATUS.w);
    const statusTex = new CanvasTexture(line);
    statusTex.colorSpace = SRGBColorSpace;
    statusTex.anisotropy = 4;
    // the room's view, drawn every frame while it shows (mipmapped: the
    // monitor's small in the close-up, and its hairlines would shimmer)
    const [viewCanvas, viewCtx] = cpuCanvas(Math.round(FRAME.w * SCALE), Math.round(FRAME.h * SCALE));
    const viewTex = new CanvasTexture(viewCanvas);
    viewTex.colorSpace = SRGBColorSpace;
    viewTex.anisotropy = 4;
    return {
      ground,
      statusTex,
      status: ink('#ffffff', statusTex),
      viewTex,
      viewCtx,
      view: ink('#ffffff', viewTex),
      roster: [0, 1, 2].map(() => ink(accent)),
      pips: ROOMS.map(() => ink(accent)),
    };
  }, [accent]);
  useEffect(
    () => () => {
      mats.ground.map?.dispose();
      mats.statusTex.dispose();
      mats.viewTex.dispose();
      for (const m of [mats.ground, mats.status, mats.view, ...mats.roster, ...mats.pips]) m.dispose();
    },
    [mats],
  );
  const game = useRef({
    on: 0, // the editor, faded in
    in: 0, // s since the second logged in
    c: null as Chase | null,
    rest: 0, // s the cursor has rested on what it's on
    over: null as Target | null,
    status: '',
    clock: 0,
    face: [0, 0] as [number, number], // which way each of the two faces (on the plan)
    step: [0, 0] as [number, number], // and how far they've walked, for their step
    suspectFace: 0,
    prints: [] as Print[],
    trail: 0, // how far the suspect's run since their last footprint
    side: 1,
    spots: 0, // the hiding places' outlines, faded in
    preview: null as Pt[] | null,
    doneAt: -1, // when a pip last lit
    done: 0,
  });
  const v = useMemo(() => ({ pos: [[0, 0], [0, 0]] as Pt[], dir: [[0, 0], [0, 0]] as Pt[], sp: [0, 0] as Pt, sd: [0, 0] as Pt }), []);

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
    // opened: the story set out at passport control, the two at their posts
    // (it starts once the second's logged in); closed (or a touch screen), it's
    // put away once the editor's faded, to start afresh next time
    if (close && !g.c) {
      g.c = newChase(0);
      Object.assign(g, { rest: 0, over: null, prints: [], spots: 0, preview: null, done: 0, doneAt: -1, suspectFace: STORIES[0].facing });
      g.face = [-0.9, -1.1];
      L.want.forEach((W, i) => {
        W.at.set(...POSTS[i]);
        W.look.set(POSTS[i][0], POSTS[i][1], 1.4);
        W.duck = 0;
      });
    }
    if (!close && g.on <= 0 && g.c) g.c = null;
    const c = g.c;
    if (!c) return;

    // ---- the story (terminal.ts): it runs once the second's in ----
    if (close && g.in > READY) {
      const beat = step(c, dt);
      if (beat === 'bolt' || beat === 'found') play('chase-clue', { volume: 0.45 });
      else if (beat === 'arrived') play('chase-clue', { volume: 0.3 });
      else if (beat === 'caught') {
        // a nod each, and the story done, they turn to each other
        L.nodAt = now + 0.4;
        L.roundAt = now + 1.5;
        play('chase-caught', { volume: 0.45 });
      } else if (beat === 'brief') g.prints = [];
      if (beat === 'found') L.nodAt = now + 0.2;
    }
    if (c.done !== g.done) {
      if (c.done > g.done) g.doneAt = now;
      g.done = c.done;
    }

    // ---- the view: on the room, or panning to the next ----
    const f0 = frameOf(c.room);
    const f1 = frameOf(c.to);
    const k = c.pan < 0 ? 0 : c.pan < 0.5 ? 4 * c.pan ** 3 : 1 - (-2 * c.pan + 2) ** 3 / 2;
    const cam: Pt = [f0[0] + (f1[0] - f0[0]) * k, f0[1] + (f1[1] - f0[1]) * k];

    // ---- the cursor on the view: resting on something sends the team there ----
    const tg = close ? targets(c) : [];
    let over: Target | null = null;
    if (tg.length && cursorRay(st, fr, ray) && ray.direction.z < -1e-4) {
      const d = (FACE - ray.origin.z) / ray.direction.z;
      const sx = ray.origin.x + ray.direction.x * d - SCREEN.x;
      const sy = ray.origin.y + ray.direction.y * d - SCREEN.y;
      const vx = ((sx - (VIEW.x - VIEW.w / 2)) / VIEW.w) * FRAME.w;
      const vy = ((VIEW.y + VIEW.h / 2 - sy) / VIEW.h) * FRAME.h;
      if (d > 0 && vx >= 0 && vx <= FRAME.w && vy >= 0 && vy <= FRAME.h) {
        const px = cam[0] + vx;
        const py = cam[1] + vy;
        over =
          tg.find((t) => {
            const b = targetBox(c, t);
            return px >= b[0] && px <= b[0] + b[2] && py >= b[1] && py <= b[1] + b[3];
          }) ?? null;
      }
    }
    g.rest = same(over, g.over) ? g.rest + dt : 0;
    g.over = over;
    if (over && g.rest > DROP && act(c, over)) {
      g.rest = 0;
      g.over = null;
      play('chase-send', { volume: 0.45 });
    }
    // the way round, while you point at the far side
    if (c.phase === 'corner' && g.over?.kind === 'far') g.preview ??= wayRound(c).far;
    else g.preview = null;

    // ---- the two: where they are, and which way they face ----
    const [pos, dirs] = [v.pos, v.dir];
    c.team.forEach((w, i) => {
      place(w, pos[i], v.sd);
      if (walking(w)) g.step[i] += w.speed * dt;
      const to = aim(c, i);
      let want = g.face[i];
      if (to) want = Math.atan2(to[1] - pos[i][1], to[0] - pos[i][0]);
      else if (v.sd[0] || v.sd[1]) want = Math.atan2(v.sd[1], v.sd[0]);
      // looking about: in their posts, and searching the room or a place in it
      const lookAbout = (c.phase === 'brief' || c.phase === 'search' || (c.phase === 'look' && i === c.lead)) && !walking(w);
      if (lookAbout) want += (c.phase === 'look' ? 0.4 : 0.3) * Math.sin(g.clock * (c.phase === 'look' ? 2.4 : 0.8) + i * 2);
      g.face[i] += wrap(want - g.face[i]) * (1 - Math.exp(-dt * (walking(w) ? 10 : 6)));
      dirs[i][0] = Math.cos(g.face[i]);
      dirs[i][1] = Math.sin(g.face[i]);
    });
    // the suspect: which way they face, and their footprints as they run
    place(c.suspect, v.sp, v.sd);
    {
      let want = g.suspectFace;
      if (c.phase === 'brief') want = STORIES[c.story].facing;
      else if (v.sd[0] || v.sd[1]) want = Math.atan2(v.sd[1], v.sd[0]);
      else if (c.phase === 'corner' || c.phase === 'round' || c.phase === 'close' || c.phase === 'caught' || c.phase === 'found') {
        const p = pos[c.phase === 'found' ? c.lead : 1 - c.lead];
        want = Math.atan2(p[1] - v.sp[1], p[0] - v.sp[0]);
      }
      g.suspectFace += wrap(want - g.suspectFace) * (1 - Math.exp(-dt * 12));
      if (c.phase === 'bolt' && c.suspect.shown && walking(c.suspect)) {
        g.trail += c.suspect.speed * dt;
        if (g.trail > STEP) {
          g.trail = 0;
          g.side = -g.side;
          g.prints.push({ x: v.sp[0], y: v.sp[1], a: Math.atan2(v.sd[1], v.sd[0]), side: g.side, at: g.clock });
          if (g.prints.length > 80) g.prints.shift();
        }
      }
      while (g.prints.length && g.clock - g.prints[0].at > PRINT_FADE) g.prints.shift();
    }

    // ---- what the two in VR do: along with the story, not on its map ----
    for (let i = 0; i < 2 && close && g.in > READY; i++) {
      const W = L.want[i];
      const [px0, py0, pz0] = POSTS[i];
      const peer = L.want[1 - i].at;
      // a step or two the way they go, while they go
      const stride = walking(c.team[i]) ? 0.05 : 0;
      W.at.set(px0 + dirs[i][0] * stride, py0, pz0 + dirs[i][1] * stride);
      W.duck = 0;
      const look = (dx: number, dy: number, dz: number, glide: number) => {
        W.look.set(W.at.x + dx, W.at.y + dy, W.at.z + dz);
        W.glide = glide;
      };
      const atPeer = (glide: number) => look(peer.x - W.at.x, peer.y - W.at.y, peer.z - W.at.z, glide);
      // the way they face, as a direction in the room
      const ahead = (dy = -0.05, glide = 0.6) => look(dirs[i][0], dy, dirs[i][1], glide);
      const waiting = c.phase === 'door' || c.phase === 'search' || c.phase === 'corner';
      if (c.phase === 'brief') {
        if (c.t < 0.9) atPeer(0.6);
        else look(0, -0.08, 1, 0.7);
      } else if (waiting && c.t < 0.8) {
        // a look about on getting somewhere
        look(Math.sin(c.t * 2 + i * 2) * 0.6, -0.3, 0.8, 0.5);
      } else if (waiting) {
        // waiting on the editor: now and then one turns to the other
        const b = (c.t + i * 1.7) % 6;
        if (b > 4.2 && b < 5.4) atPeer(0.6);
        else ahead(-0.03);
      } else if (c.phase === 'look' && i === c.lead && !walking(c.team[i])) ahead(-0.3, 0.4);
      else if (c.phase === 'bolt' || c.phase === 'found') ahead(-0.05, 0.4);
      else if (c.phase === 'caught') {
        if (c.t > 1.6) atPeer(0.5);
        else look(dirs[i][0] * 0.5, -0.35, dirs[i][1] * 0.5 + 0.2, 0.4);
        if (i === 0) W.duck = 0.05 * Math.min(1, c.t / 0.3) * (c.t > 1.6 ? Math.max(0, 1 - (c.t - 1.6) / 0.4) : 1);
      } else ahead();
    }

    // ---- the editor ----
    const on = g.on;
    // solid once it's up (see-through, the app's picture under it shows more
    // than its opacity says); see-through only while it fades in and out
    const solid = on > 0.98;
    for (const m of [mats.ground, mats.view]) {
      if (m.transparent === solid) {
        m.transparent = !solid;
        m.depthWrite = solid;
        m.needsUpdate = true;
      }
      m.opacity = solid ? 1 : on;
    }
    // the story's line
    let [head, sub] = lines(c);
    if (close && joined < 0.99) {
      head = 'PLAYER 2 LOGGING IN';
      sub = 'TWO IN VR, YOU IN THE EDITOR';
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
    // the room's view
    if (on > 0) {
      const searching = c.phase === 'search' || c.phase === 'look';
      g.spots += ((searching ? 1 : 0) - g.spots) * (1 - Math.exp(-dt * (searching ? 6 : 9)));
      const fr2: Frame = {
        cam,
        clock: g.clock,
        face: g.face,
        sway: [0, 1].map((i) => (walking(c.team[i]) ? 0.09 * Math.sin((g.step[i] / 46) * Math.PI) : 0)) as [number, number],
        suspectFace: g.suspectFace,
        suspectAlpha: c.phase === 'caught' ? Math.max(0, 1 - Math.max(0, c.t - 1.6) / 0.6) : 1,
        prints: g.prints,
        over: g.over,
        fill: Math.min(1, g.rest / DROP),
        preview: g.preview,
        spots: g.spots,
      };
      paint(mats.viewCtx, plan, c, fr2, ink);
      mats.viewTex.needsUpdate = true;
    }
    // the pips: a room each, lit as it's done (the newest flashing as it
    // lights), the one they're in paler; a story done flashes them all
    const round = L.roundAt >= 0 && now >= L.roundAt && now - L.roundAt < ROUND_LEN;
    const here = c.pan >= 0 ? c.to : c.room;
    mats.pips.forEach((m, i) => {
      const fresh = i === c.done - 1 && g.doneAt >= 0 ? 1 + 1.4 * bump((now - g.doneAt) / 0.6) : 1;
      if (round) m.color.set(accent).multiplyScalar(Math.floor((now - L.roundAt) * 6) % 2 ? 1.7 : 0.35);
      else if (i < c.done) m.color.set(accent).multiplyScalar(1.25 * fresh);
      else if (i === here) m.color.set(accentPale).multiplyScalar(0.8);
      else m.color.set(accent).multiplyScalar(0.16);
      m.opacity = on;
    });
  });

  return (
    <group ref={frame}>
      <mesh material={mats.ground} position={[SCREEN.x, SCREEN.y, FACE + 0.0004]} renderOrder={3}>
        <planeGeometry args={[SCREEN.w, SCREEN.h]} />
      </mesh>
      <mesh material={mats.view} position={[SCREEN.x + VIEW.x, SCREEN.y + VIEW.y, FACE + 0.0006]} renderOrder={4}>
        <planeGeometry args={[VIEW.w, VIEW.h]} />
      </mesh>
      <mesh material={mats.status} position={[SCREEN.x + STATUS.x, SCREEN.y + STATUS.y, FACE + 0.0008]} renderOrder={5}>
        <planeGeometry args={[STATUS.w, STATUS.h]} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} geometry={geo.dot} material={mats.roster[i]} position={[SCREEN.x + ROSTER.x + (i - 1) * ROSTER.pitch, SCREEN.y + ROSTER.y - 0.012, FACE + 0.001]} scale={0.0032} renderOrder={5} />
      ))}
      {mats.pips.map((m, i) => (
        <mesh key={i} material={m} position={[SCREEN.x + (i - (ROOMS.length - 1) / 2) * PIPS.pitch, SCREEN.y + PIPS.y, FACE + 0.0012]} renderOrder={5}>
          <planeGeometry args={[PIPS.size, PIPS.size]} />
        </mesh>
      ))}
    </group>
  );
}
