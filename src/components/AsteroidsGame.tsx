import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../lib/useReducedMotion';
import { GameComms } from './GameComms';
import { GameRocket, type Burst, type RockView, type ShipView } from './GameRocket';

// ASTEROIDS — the launch easter egg's payload. Everyone's first Unity game,
// rebuilt in the site's own language: the ship is the actual 3D launch vehicle
// and the hazards are real tumbling rocks (both in the GameRocket layer over
// this canvas), labelled with the real hazards of a decade in XR (SCOPE CREEP
// splits into MORE SCOPE CREEP; MERGE CONFLICT splits into YOURS and THEIRS),
// and death is a Rapid Unscheduled Disassembly with an [ITERATE] button.
// Simulation, effects and HUD are hand-rolled canvas 2D — no engine, obviously.

const CYAN = '#27e8f2';
const NEUTRAL = '#9fb6c6';
const INK = '#eaeaea';

// The big rocks carry these; shooting one is therefore productive.
/* ---- the hazards ----
 *
 *  ONE entry per hazard: which stages it can show up in, what Merijn says about
 *  it, and what it breaks into. This is the place to edit the roster —
 *  HAZARD_LINES and SPLITS are both derived from it, so a hazard is only ever
 *  described once.
 *
 *  `from`/`to` are STAGE numbers (1-based, inclusive) — the same stages
 *  PHASE_TITLES names, so `from: 4` means "not before RELEASE". `to` is optional
 *  and means "and every stage after". The window is what stops a hazard turning up
 *  before the project could plausibly have produced it: a 1★ store review can't
 *  land during KICKOFF because nothing has shipped yet, and a merge conflict needs
 *  a team that's already writing code.
 *
 *    1 KICKOFF · 2 ARCHITECTURE · 3 THE DEMO · 4 RELEASE · 5+ POST-LAUNCH
 *
 *  Keep at least three open at stage 1 — that's how many rocks the first wave
 *  spawns (Math.min(2 + wave, 7)), and fewer than that starts repeating labels. */
interface Hazard {
  label: string;
  from: number;
  to?: number;
  /** Said when you first clear it, and again — harder — if it takes your shield. */
  line: string;
  /** A big rock of this hazard breaks into these two instead of copies of itself. */
  splits?: [string, string];
}

const HAZARDS: Hazard[] = [
  // Stage 1 — nothing is built yet, so the hazards are people and inheritance.
  { label: 'ANOTHER MEETING', from: 1, line: "The well known 'we'll just have a quick meeting' that takes 1-2 hours." },
  {
    label: 'SCOPE CREEP',
    from: 1,
    line: "It's never one big decision. It's always 'could it maybe also just…'",
    splits: ['MORE SCOPE CREEP', 'MORE SCOPE CREEP'],
  },
  {
    label: 'CAN WE PUT AI IN THIS?',
    from: 1,
    line: 'A client asked if we could train an LLM to answer a simple question, why not right?',
    splits: ['EXPLAIN TRADE OFFS', 'SHOW THE COSTS'],
  },
  {
    label: 'LEGACY CODE',
    from: 1,
    line: 'I tend to explain this as a Jenga tower to clients where every unused feature is a block that makes the tower unstable.',
  },
  {
    label: 'TECH DEBT',
    from: 1,
    line: "Someone's clever shortcut, now it belongs to you.",
    splits: ['UNUSED SDK', 'SINGLETON SPAGHETTI'],
  },
  // Stage 2 — there's a codebase now, so it can fight you and it can conflict.
  {
    label: 'MERGE CONFLICT',
    from: 2,
    line: 'Two of us refactored the same manager script that week. Nobody enjoyed the Friday.',
    splits: ['<<<<<<< YOURS', '>>>>>>> THEIRS'],
  },
  { label: 'NullReferenceException', from: 2, line: 'Almost 10 years in, and this is still how some of my days end.' },
  {
    label: 'BROKEN BUILD',
    from: 2,
    line: 'The build failed. The log is 2,000 lines long. Good luck.',
    splits: ['BUILD LOG', 'WRITE TESTS'],
  },
  {
    label: 'LOST SDK KEYS',
    from: 2,
    line: 'We decided on storing keys on a shared drive, can you guess what happened when the senior dev left?',
    splits: ['RECOVER KEYS', 'ACTUALLY STORE THEM'],
  },
  { label: 'GPS DRIFT', from: 2, line: 'At Alliander the hologram had to be perfectly placed but GPS had other plans that day.' },
  // Stage 3 — it's on someone else's hardware, in someone else's room, now.
  {
    label: 'WORKS ON MY MACHINE',
    from: 3,
    line: "It works on my machine, just not on the client's machine.",
    splits: ['EMULATE', 'TEST AGAIN'],
  },
  { label: 'BAD CONNECTION', from: 3, line: "The demo works fine on my machine. The client's wifi is another story." },
  { label: 'HOLOLENS BATTERY', from: 3, line: 'Dies at the moment someone important finally puts it on.' },
  // Stage 4 — it's live, so strangers can finally have opinions.
  { label: '1★ STORE REVIEW', from: 4, line: "'Doesn't work.' reviews do tend to stick in your head if you're proud of what you made." },
];

/** Lines for the bespoke split children. They're never spawned on their own, so
 *  they carry no stage window — they inherit their parent's. */
const CHILD_LINES: Record<string, string> = {
  'MORE SCOPE CREEP': 'See? It multiplies. That is the entire joke.',
  '<<<<<<< YOURS': 'Yours or theirs, someone still has to sit down and merge it.',
  '>>>>>>> THEIRS': 'Yours or theirs, someone still has to sit down and merge it.',
  'UNUSED SDK': 'Integrated for one demo years ago and still in the project today.',
  'SINGLETON SPAGHETTI': 'Quick to write, forever to untangle. Ask me how I know.',
  'BUILD LOG': 'The build failed. The log is 2,000 lines long. Good luck.',
  EMULATE: "Let's see how we can actually test this on the users' machine without shipping it to them.",
  'RECOVER KEYS': 'The SDK vendor emailed me a new key. I had to email them back to get it.',
  'ACTUALLY STORE THEM': 'The SDK vendor emailed me a new key. I had to email them back to get it.',
  // These two split children had no line at all, so clearing them said nothing.
  // Placeholders in your voice — reword or delete them as you like.
  'WRITE TESTS': 'The tests I skipped to save an afternoon cost me the whole week.',
  'TEST AGAIN': 'On the real device this time. It is never the same as the editor.',
  'EXPLAIN TRADE OFFS': "It's never as simple as 'just add AI'. I have to explain the trade-offs and the risks.",
  'SHOW THE COSTS': "AI is not magic, it's expensive!",
};

const SPLITS: Record<string, [string, string]> = Object.fromEntries(
  HAZARDS.filter((h) => h.splits).map((h) => [h.label, h.splits as [string, string]]),
);

/** The labels that may spawn in stage `n` (1-based). Falls back to the whole
 *  roster if a window edit ever leaves a stage empty, so a bad table costs you
 *  realism and never blank rocks. */
function hazardsForStage(n: number): string[] {
  const open = HAZARDS.filter((h) => n >= h.from && (h.to === undefined || n <= h.to));
  return (open.length ? open : HAZARDS).map((h) => h.label);
}
// Spoken over comms by the hologram (see GameComms), so everything below reads as
// someone talking to you — not as terminal output.
//
// A stage IS a project phase. These used to be score thresholds, which meant the
// whole arc was spent inside the first three waves (one cleared wave is already
// ~1,700 points) and then the story simply stopped while the game carried on.
// Tying them to the stage you just cleared makes the run and the project the same
// shape, and means the stage-clear line and the phase beat are one message rather
// than two competing ones.
const PHASES: string[] = [
  "Kickoff survived. Now we find out what we actually agreed to.",
  "Architecture's holding... Now let's actually build something.",
  "That's the demo done! Nothing broke while anyone important was watching.",
  "We're live! Just when we thought it's done the support tickets start rolling in.",
  "Post-launch... Another update to ship, another wave of bugs.",
];
// Past the arc, it's maintenance — which does not end, so these just alternate.
const PHASES_TAIL: string[] = [
  "Another one closed. This is maintenance now. It doesn't finish, you just get quicker.",
  "Still shipping. How long can we keep going?",
];
// The stage's name, shown as a slate the moment it begins — the short form of the
// same beat PHASES speaks when you finish it. Titles announce, sentences close.
const PHASE_TITLES: string[] = ['KICKOFF', 'ARCHITECTURE', 'THE DEMO', 'RELEASE', 'POST-LAUNCH'];
const PHASE_TITLE_TAIL = 'MAINTENANCE';
/** The title for entering stage `n` (1-based). */
function phaseTitle(n: number): string {
  return n - 1 < PHASE_TITLES.length ? PHASE_TITLES[n - 1] : PHASE_TITLE_TAIL;
}

/** The line for having just cleared stage `n` (1-based). */
function phaseLine(n: number): string {
  const i = n - 1;
  return i < PHASES.length ? PHASES[i] : PHASES_TAIL[(i - PHASES.length) % PHASES_TAIL.length];
}

/** Every label's line, parents and split children together — derived, so a hazard
 *  is only ever described in one place (its entry in HAZARDS / CHILD_LINES). */
const HAZARD_LINES: Record<string, string> = {
  ...CHILD_LINES,
  ...Object.fromEntries(HAZARDS.map((h) => [h.label, h.line])),
};

interface Rock {
  x: number; y: number; vx: number; vy: number;
  r: number; tier: 0 | 1 | 2; // 0 big → 2 small
  rot: number; spin: number;
  shape: number[]; // radius multiplier per vertex (the 2D hit flash still uses it)
  label?: string;
  age: number; // seconds alive — rim spawns fade/scale in over the first beat
  id: number; // stable for life — picks the 3D shape + tumble in the GameRocket layer
}
let rockId = 0; // monotonic, so a rock keeps its look however the array shifts
interface Bullet { x: number; y: number; vx: number; vy: number; ttl: number }
interface Particle { x: number; y: number; vx: number; vy: number; ttl: number; max: number; c: string; streak?: boolean }
interface Ring { x: number; y: number; r: number; v: number; ttl: number; max: number; c: string } // shockwave
interface Popup { x: number; y: number; txt: string; ttl: number; max: number; c: string } // floating score
interface RockFlash { x: number; y: number; rot: number; r: number; shape: number[]; ttl: number; max: number } // 2-frame hit flash

function rockShape(n = 11): number[] {
  return Array.from({ length: n }, () => 0.72 + Math.random() * 0.45);
}

/** The post-flight debrief, written up the way every case study on this site is
 *  written up: the problem, the approach, the lesson. */
interface Debrief {
  problem: string;
  approach: string;
  lesson: string;
}

/** The lesson is the one line that isn't just stats: it reads the run and makes
 *  the joke. Kept plain-spoken and specific — same register as the milestone
 *  toasts, not fortune cookies. First match wins, so order is the priority. */
function lessonFor(o: { acc: number; shots: number; wave: number; chain: number }): string {
  if (o.wave <= 1 && o.shots < 14) return 'One stage in and already a delay. Somewhere a project manager is quietly moving the deadline.';
  if (o.acc >= 60 && o.shots >= 12) return 'Almost every ticket landed. Turns out the problem was how many problems there were.';
  if (o.acc < 25 && o.shots >= 24) return "Plenty of tickets, not many fixes. We've all had that sprint.";
  if (o.chain >= 4) return 'You were on a roll, and then you flew straight into a rock. Very realistic.';
  if (o.wave >= 4) return "Four stages cleared and the backlog still got longer. That's software.";
  return "That's one way to end a sprint. Write it up, blame the show-floor wifi, try again.";
}

export function AsteroidsGame({ onExit }: { onExit: () => void }) {
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const chainRef = useRef<HTMLSpanElement>(null);
  const hintRef = useRef<HTMLDivElement>(null); // the control legend, retired once used
  const sayRef = useRef<(msg: string) => void>(() => {}); // set by GameComms
  const commsBusy = useRef(false); // ditto — true while a line is on screen
  const [phase, setPhase] = useState<'play' | 'over'>('play');
  const [finalScore, setFinalScore] = useState(0);
  const [debrief, setDebrief] = useState<Debrief | null>(null); // the RUD card's write-up
  // The slate: the run's arrival card, then each stage's title. One element, so a
  // new one always replaces the last rather than stacking on it.
  const [slate, setSlate] = useState<{ text: string; kind: 'mission' | 'phase'; id: number } | null>(null);
  const slateId = useRef(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem('mk-asteroids-best') ?? 0));
  const restartRef = useRef<() => void>(() => {});
  // The pause menu. Esc opens it instead of dumping you back to the pad — quitting
  // a run by accident on the key you'd reach for to pause was the whole problem.
  // `menuRef` mirrors the state for the engine, which reads it inside its own frame
  // loop and can't see React state; `giveUpRef` is the engine handing back the one
  // way to end a run deliberately.
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(false);
  const giveUpRef = useRef<() => void>(() => {});
  useEffect(() => {
    menuRef.current = menu;
  }, [menu]);
  // the ship's live pose, handed to the 3D rocket overlay every frame
  const shipView = useRef<ShipView>({ x: 0, y: 0, a: 0, throttle: 0, turn: 0, visible: true, pop: 1, muzzle: 0, shield: 1, shieldBreak: 0 });
  const rocksView = useRef<RockView[]>([]); // per-frame view of the rocks for the 3D layer
  const burstsView = useRef<Burst[]>([]); // breakages queued for the 3D debris pool

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0;
    let H = 0;
    let gridPat: CanvasPattern | null = null; // the site's dot-grid paper
    let vig: CanvasGradient | null = null; // corner vignette, focuses the field
    let horizonGrad: CanvasGradient | null = null; // the city's glow, far below
    // Per-stage backdrops — what's out the window changes with the stage, not
    // just its colour (see horizonT in draw() below). Stage 1 keeps the city
    // horizon above; these four are ARCHITECTURE/THE DEMO/RELEASE/POST-LAUNCH,
    // built from the same primitives (gradients + arcs) rather than a new
    // visual language. Cached here on the SAME discipline as vig/horizonGrad —
    // recreating a gradient every frame is the one thing this background has
    // always avoided, and four more of them would be worth noticing.
    let laneGrad: CanvasGradient | null = null; // ARCHITECTURE — the debris lane
    let nebGrads: CanvasGradient[] = []; // THE DEMO — the nebula's three glows
    let limbGrad: CanvasGradient | null = null; // RELEASE — the ringed world's limb
    let galGrad: CanvasGradient | null = null; // POST-LAUNCH — the deep-field galaxy
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0.5px';
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // viewport-sized paint caches — rebuilt on resize, drawn once per frame
      const pc = document.createElement('canvas');
      pc.width = pc.height = 44;
      const pctx = pc.getContext('2d');
      if (pctx) {
        pctx.fillStyle = 'rgba(159, 182, 198, 0.12)';
        pctx.fillRect(21, 21, 2, 2);
      }
      gridPat = ctx.createPattern(pc, 'repeat');
      vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.46, W / 2, H / 2, Math.hypot(W, H) * 0.58);
      vig.addColorStop(0, 'rgba(5, 7, 9, 0)');
      vig.addColorStop(1, 'rgba(5, 7, 9, 0.55)');
      horizonGrad = ctx.createLinearGradient(0, H - 120, 0, H);
      horizonGrad.addColorStop(0, 'rgba(39, 232, 242, 0)');
      horizonGrad.addColorStop(1, 'rgba(39, 232, 242, 0.06)');

      // ARCHITECTURE — a soft diagonal band (no rotation needed: the gradient
      // axis runs perpendicular to the band itself). The debris flecks that
      // drift through it track the same diagonal — see `debris` below.
      laneGrad = ctx.createLinearGradient(0, H * 0.78, W, H * 0.22);
      laneGrad.addColorStop(0, 'rgba(159, 182, 198, 0)');
      laneGrad.addColorStop(0.5, 'rgba(159, 182, 198, 0.055)');
      laneGrad.addColorStop(1, 'rgba(159, 182, 198, 0)');

      // THE DEMO — three soft, low overlapping glows, two of them mixed toward
      // NEUTRAL rather than pure accent, so the whole thing reads as a distant
      // backdrop instead of a lit hotspot (an early pass at full accent alone
      // measured nearly 40% brighter and over 2x the chroma of the other three
      // stages' vistas put together).
      nebGrads = [
        { x: W * 0.74, y: H * 0.34, r: W * 0.34, a: 0.045, c: '39, 232, 242' },
        { x: W * 0.88, y: H * 0.5, r: W * 0.22, a: 0.035, c: '159, 182, 198' },
        { x: W * 0.6, y: H * 0.6, r: W * 0.18, a: 0.03, c: '159, 182, 198' },
      ].map((b) => {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, `rgba(${b.c}, ${b.a})`);
        g.addColorStop(1, `rgba(${b.c}, 0)`);
        return g;
      });

      // RELEASE — a ringed world glimpsed edge-on, low in the frame: a soft
      // dark limb plus two thin concentric arcs (drawn live, in `draw()`,
      // since a stroke costs nothing to recompute — only the limb's fill
      // needs a cached gradient).
      const ringCx = W * 0.14;
      const ringCy = H * 1.04;
      const ringR = H * 0.5;
      limbGrad = ctx.createRadialGradient(ringCx, ringCy, ringR * 0.8, ringCx, ringCy, ringR);
      limbGrad.addColorStop(0, 'rgba(159, 182, 198, 0)');
      limbGrad.addColorStop(1, 'rgba(159, 182, 198, 0.1)');

      // POST-LAUNCH — a small, faint elongated smudge: a distant galaxy the
      // way Andromeda actually reads to the naked eye (barely an oval haze,
      // not a spiral illustration). The densest stars are the rest of this
      // stage's vista — see the star loop in draw().
      galGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.22);
      galGrad.addColorStop(0, 'rgba(234, 234, 234, 0.09)');
      galGrad.addColorStop(0.4, 'rgba(159, 182, 198, 0.04)');
      galGrad.addColorStop(1, 'rgba(159, 182, 198, 0)');
    };
    fit();
    window.addEventListener('resize', fit);

    // ---- state ----
    const ship = { x: 0, y: 0, a: -Math.PI / 2, vx: 0, vy: 0, thrust: false, left: false, right: false, fire: false, inv: 0, dead: 0, spawnAge: 9 };
    let rocks: Rock[] = [];
    let bullets: Bullet[] = [];
    let parts: Particle[] = [];
    let rings: Ring[] = [];
    let popups: Popup[] = [];
    let rockFlashes: RockFlash[] = [];
    let score = 0;
    // No lives, no respawn queue: the vehicle carries a shield that eats exactly
    // one hit and comes back when you clear a stage. Two states, nothing to count.
    let shield = true;
    let shieldBreak = 0; // 1 on the burst, decays — drives the 3D bubble's flare
    let wave = 0;
    let waveGap = 0; // countdown to the next wave while the field is clear
    let cooldown = 0;
    // The control legend is onboarding: once you've turned, burned and fired, you
    // know them, and it stops taking up the bottom of the screen (where comms is).
    let usedTurn = false;
    let usedThrust = false;
    let usedFire = false;
    let hintDone = false;
    let muzzle = 0; // 1 on the shot, decays — drives the 3D nose flash
    // The 3D vehicle is ~150px long, so its nose tip sits about this far out
    // from centre: shots and their sparks leave from THERE, not from mid-hull.
    const NOSE = 56;
    // The star-rush that plays on arrival is "stage separation" by name in the
    // comment below but only ever played once, at the very start — a new stage
    // got a slate and a numeral tick, nothing that actually looked like ground
    // falling away. Retriggered on every later wave (STAGE_ADVANCE_RUSH_MS,
    // spawnWave below); shorter than the opening one since the field's already
    // live and rocks are about to spawn into it, not settling into an empty sky.
    const STAGE_ADVANCE_RUSH_MS = 900;
    let over = false;
    let shake = 0;
    let flash = 0; // white-out at the moment of disassembly
    let slomo = 0; // hit-stop: the world catches its breath on big hits
    let wavePulse = 0; // the stage numeral watermark breathes on each new wave
    let gridPulse = 0; // the paper brightens for a beat on milestones/clears
    // stage separation: stars rush past and settle as you take over — on
    // arrival, and again (STAGE_ADVANCE_RUSH_MS) every time spawnWave moves you
    // into the next one. Wall-clock deadline, not sim time: dt is clamped
    // (1/30), so on a slow device the sim runs under real time and a sim-timed
    // intro would strand the field empty for ages (same lesson as the ascent's
    // staging fallback).
    let introUntil = 0;
    let firstWave = false; // the opening wave arrives when the rush settles
    let introV = 0; // star streak velocity, decays through the intro
    let starOff = 0;
    // engine feel: the throttle spools, the hull banks into turns
    let throttle = 0;
    let turnIn = 0;
    let turnEase = 0;
    // the rewarding loop: chains, records, and the post-flight debrief
    let chain = 0;
    let chainT = 0;
    let bestChain = 1;
    let shots = 0;
    let hitsCount = 0;
    let playTime = 0;
    let recordBroken = false;
    let bestAtStart = 0;
    let dispScore = 0; // the odometer eases toward the real score
    const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7, ph: Math.random() * 6.28 }));
    // ARCHITECTURE's debris — larger, slower, sparser than the stars, and it
    // only ever draws in that one stage. Positions are fractions of W/H (same
    // trick as `stars`), so a resize doesn't strand them; `jitter` is fixed per
    // fleck and combines with the live `x` to find `y`, which is what keeps a
    // fleck sitting inside laneGrad's diagonal band through every wrap rather
    // than drifting out of it after the first lap.
    const DEBRIS_N = 22;
    const debris = Array.from({ length: DEBRIS_N }, () => ({
      x: Math.random(),
      jitter: (Math.random() - 0.5) * 0.18,
      v: 0.02 + Math.random() * 0.035,
      a: 0.3 + Math.random() * 0.35,
      r: 1 + Math.random() * 2,
    }));

    // Every message the game has to give the player comes over comms, from the
    // hologram (GameComms). The old centre-screen toast is gone — a line is
    // something a person says to you now, not text that appears in the void.
    const say = (msg: string) => sayRef.current(msg);
    const showSlate = (text: string, kind: 'mission' | 'phase') => {
      slateId.current += 1;
      setSlate({ text, kind, id: slateId.current });
    };
    // Asides (the hazard stories) only land if he isn't already mid-sentence —
    // better to skip one than to cut him off. The important lines just say().
    const aside = (msg: string) => {
      if (!commsBusy.current) say(msg);
    };
    const told = new Set<string>(); // hazard stories already heard this run
    // restart a one-shot CSS animation on a HUD element (score tick, life lost)
    const bump = (el: HTMLElement | null, cls: string) => {
      if (!el) return;
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
    };
    // every score change funnels through here: milestone toasts + the moment
    // the fleet record falls mid-run
    const scored = () => {
      bump(scoreRef.current, 'ast__score-bump');
      if (!recordBroken && bestAtStart > 0 && score > bestAtStart) {
        recordBroken = true;
        say("New record. Genuinely better than I manage most days.");
        gridPulse = 1;
        scoreRef.current?.classList.add('ast__score-rec');
      }
    };

    const spawnWave = () => {
      wave += 1;
      wavePulse = 1;
      // stage 1's own rush is the arrival intro (reset() below) — this is every
      // stage AFTER it, which otherwise had no visual "we just travelled" beat
      if (wave > 1) introUntil = reduced ? 0 : performance.now() + STAGE_ADVANCE_RUSH_MS;
      showSlate(phaseTitle(wave), 'phase');
      const n = Math.min(2 + wave, 7);
      // only what this stage of the project could plausibly have produced
      const labels = hazardsForStage(wave).sort(() => Math.random() - 0.5);
      for (let i = 0; i < n; i++) {
        // spawn on the rim, never on top of the ship
        const edge = Math.floor(Math.random() * 4);
        const x = edge === 0 ? 0 : edge === 1 ? W : Math.random() * W;
        const y = edge < 2 ? Math.random() * H : edge === 2 ? 0 : H;
        // aimed to actually cross the play area — an idle pilot should be in
        // trouble within the first pass, not watching rocks orbit the rim
        const a = Math.atan2(H / 2 - y, W / 2 - x) + (Math.random() - 0.5) * 0.7;
        const sp = 46 + Math.random() * 38 + wave * 6;
        rocks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 44, tier: 0, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.8, shape: rockShape(), label: labels[i % labels.length], age: 0, id: rockId++ });
      }
    };

    // dirX/dirY bias the debris along the shot that caused it
    const boom = (x: number, y: number, n: number, c: string, dirX = 0, dirY = 0) => {
      const N = reduced ? Math.min(n, 8) : n;
      for (let i = 0; i < N; i++) {
        const a = Math.random() * 6.28;
        const sp = 40 + Math.random() * 160;
        // half the debris streaks along its velocity — sparks, not confetti
        parts.push({ x, y, vx: Math.cos(a) * sp + dirX * 120, vy: Math.sin(a) * sp + dirY * 120, ttl: 0.5 + Math.random() * 0.5, max: 1, c, streak: !reduced && i % 2 === 0 });
      }
      if (!reduced) {
        rings.push({ x, y, r: 5, v: n > 20 ? 430 : 260, ttl: 0.38, max: 0.38, c });
        shake = Math.min(shake + 6, 12);
      }
    };

    // imp = where the bullet actually struck, and the shot's direction — the
    // debris, the popup and the children all take their cue from it
    const splitRock = (rk: Rock, idx: number, imp: { x: number; y: number; dx: number; dy: number }) => {
      rocks.splice(idx, 1);
      // chain: kills within 2s multiply (×2, ×3… capped ×5)
      chain = chainT > 0 ? chain + 1 : 1;
      chainT = 2;
      bestChain = Math.max(bestChain, chain);
      const mult = Math.min(chain, 5);
      if (chainRef.current) {
        chainRef.current.textContent = mult > 1 ? `×${mult}` : '';
        if (mult > 1) bump(chainRef.current, 'ast__chain-pop');
      }
      const pts = (rk.tier === 0 ? 20 : rk.tier === 1 ? 50 : 100) * mult;
      score += pts;
      popups.push({ x: imp.x, y: imp.y, txt: mult > 1 ? `+${pts} ×${mult}` : `+${pts}`, ttl: 0.7, max: 0.7, c: rk.tier === 2 || mult > 1 ? CYAN : INK });
      boom(imp.x, imp.y, rk.tier === 2 ? 8 : 14, NEUTRAL, imp.dx, imp.dy);
      // the rock itself flashes white-hot for a beat as it breaks
      if (!reduced) rockFlashes.push({ x: rk.x, y: rk.y, rot: rk.rot, r: rk.r, shape: rk.shape, ttl: 0.09, max: 0.09 });
      // …and throws real 3D chunks, some of them straight at the camera
      if (!reduced) burstsView.current.push({ x: rk.x, y: rk.y, r: rk.r, tier: rk.tier });
      // first time this hazard goes down, Merijn tells you why it's on the list
      if (rk.label && HAZARD_LINES[rk.label] && !told.has(rk.label)) {
        told.add(rk.label);
        aside(HAZARD_LINES[rk.label]);
      }
      // a breath of hit-stop on the big ones — the punch reads
      if (!reduced && rk.tier === 0) slomo = Math.max(slomo, 0.05);
      if (rk.tier < 2) {
        const childLabels = rk.label ? SPLITS[rk.label] : undefined;
        // children fork away from the shot and keep most of the parent's
        // momentum — splits read physical, not random
        const shotA = Math.atan2(imp.dy, imp.dx);
        for (let i = 0; i < 2; i++) {
          const a = shotA + (i === 0 ? 1 : -1) * (0.55 + Math.random() * 0.5);
          const sp = (rk.tier === 0 ? 55 : 90) + Math.random() * 40;
          rocks.push({
            x: rk.x, y: rk.y,
            vx: rk.vx * 0.6 + Math.cos(a) * sp, vy: rk.vy * 0.6 + Math.sin(a) * sp,
            r: rk.tier === 0 ? 25 : 13,
            tier: (rk.tier + 1) as 1 | 2,
            rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 1.6,
            shape: rockShape(9),
            label: rk.tier === 0 ? childLabels?.[i] : undefined,
            age: 9, // children pop out of the parent — no fade-in
            id: rockId++,
          });
        }
      }
      if (rocks.length === 0) {
        // stage clear: a bonus, a clean ring off the hull, and a longer breath
        // before the next wave rolls in
        score += 150;
        popups.push({ x: ship.x, y: ship.y - 36, txt: '+150', ttl: 1, max: 1, c: CYAN });
        if (!reduced) rings.push({ x: ship.x, y: ship.y, r: 12, v: 540, ttl: 0.5, max: 0.5, c: CYAN });
        gridPulse = 1;
        // clearing a stage re-earns the shield — the only way to get it back
        const regained = !shield;
        shield = true;
        // the phase beat and the stage-clear acknowledgement, as one line
        const line = phaseLine(wave);
        say(regained ? `${line} Shield's back.` : line);
        waveGap = 2.2;
      }
      scored();
    };

    // Contact with a hazard. With the shield up it takes the hit and drops; with
    // it down, that's the flight. `killer` is the hazard's own label, which the
    // debrief names — the thing that got through is the point of the story.
    const impact = (killer?: string) => {
      chain = 0;
      chainT = 0;
      if (chainRef.current) chainRef.current.textContent = '';

      if (shield) {
        shield = false;
        shieldBreak = 1; // the 3D bubble flares and bursts
        boom(ship.x, ship.y, 12, CYAN);
        if (!reduced) {
          rings.push({ x: ship.x, y: ship.y, r: 26, v: 320, ttl: 0.4, max: 0.4, c: CYAN });
          flash = 0.4;
          shake = Math.min(shake + 5, 12);
        }
        ship.inv = 1.2; // a breath of grace so the same rock can't finish you
        const story = killer ? HAZARD_LINES[killer] : undefined;
        say(
          killer && story
            ? `${killer} took the shield. ${story}`
            : "Shield's gone. One more of those and we're writing a delay report.",
        );
        return;
      }

      boom(ship.x, ship.y, 26, CYAN);
      if (!reduced) {
        flash = 1;
        slomo = Math.max(slomo, 0.3);
        shake = Math.min(shake + 10, 18);
      }
      endRun(killer);
    };

    // Close out the run and raise the debrief. Split out of `impact` so giving up
    // from the pause menu lands on the same screen with the same stats — the only
    // difference is the write-up, since nothing actually hit you.
    const endRun = (killer?: string, gaveUp = false) => {
      if (over) return; // idempotent: a give-up during the death frame can't double-fire
      over = true;
      setFinalScore(score);
      // The write-up: the three beats every case study on this site uses, built
      // from what the engine already knows.
      const acc = shots > 0 ? Math.round((hitsCount / shots) * 100) : 0;
      const mm = String(Math.floor(playTime / 60)).padStart(2, '0');
      const ss = String(Math.floor(playTime % 60)).padStart(2, '0');
      const stage = Math.max(1, wave);
      setDebrief({
        problem: gaveUp
          ? `Called off at stage ${stage} (${phaseTitle(stage)}). Nothing hit us — the plug got pulled.`
          : `${killer ?? 'An unlabelled hazard'} got through at stage ${stage}, with the shield already down.`,
        approach: `${shots} ticket${shots === 1 ? '' : 's'} fired, ${shots > 0 ? `${acc}% resolved` : 'none resolved'}${
          bestChain >= 2 ? `, ${bestChain} cleared back-to-back at best` : ''
        }. ${score} problem${score === 1 ? '' : 's'} fixed in T+${mm}:${ss}.`,
        lesson: gaveUp
          ? 'Cancelling it yourself is a real decision, and it never feels like one. Some of the best calls I have made looked exactly like this.'
          : lessonFor({ acc, shots, wave, chain: bestChain }),
      });
      setBest((b) => {
        const nb = Math.max(b, score);
        localStorage.setItem('mk-asteroids-best', String(nb));
        return nb;
      });
      setPhase('over');
    };
    giveUpRef.current = () => endRun(undefined, true);

    const reset = (restart = false) => {
      rocks = [];
      bullets = [];
      parts = [];
      rings = [];
      popups = [];
      rockFlashes = [];
      flash = restart && !reduced ? 0.55 : 0; // ITERATE gets a fresh-start flash
      slomo = 0;
      score = 0;
      dispScore = 0;
      wave = 0;
      over = false;
      shots = 0;
      hitsCount = 0;
      playTime = 0;
      chain = 0;
      chainT = 0;
      bestChain = 1;
      recordBroken = false;
      bestAtStart = Number(localStorage.getItem('mk-asteroids-best') ?? 0);
      gridPulse = 0;
      throttle = 0;
      turnIn = 0;
      turnEase = 0;
      starOff = 0;
      ship.x = W / 2;
      ship.y = H / 2;
      ship.vx = ship.vy = 0;
      ship.a = -Math.PI / 2;
      ship.inv = 0; // no spawn grace needed — you start with the shield up
      ship.dead = 0;
      ship.spawnAge = 0;
      shield = true;
      shieldBreak = 0;
      told.clear();
      if (chainRef.current) chainRef.current.textContent = '';
      scoreRef.current?.classList.remove('ast__score-rec');
      if (scoreRef.current) scoreRef.current.textContent = '0000';
      // stage separation: stars rush past for a beat before the first wave
      introUntil = reduced ? 0 : performance.now() + 2200;
      firstWave = false;
      waveGap = 0;
      // e2e playtest hook (sessionStorage 'mk-ast-test' = 'rud'): shield already
      // down + a rock dead ahead, so automation can reach the RUD screen determin-
      // istically. Unreachable in normal play — nothing sets the flag.
      if (sessionStorage.getItem('mk-ast-test') === 'rud') {
        shield = false;
        ship.inv = 0;
        rocks.push({ x: W / 2, y: H / 2, vx: 0, vy: 0, r: 44, tier: 0, rot: 0, spin: 0.4, shape: rockShape(), label: 'SCOPE CREEP', age: 9, id: rockId++ });
      }
    };
    restartRef.current = () => {
      reset(true);
      setMenu(false); // never start a fresh run already held
      setPhase('play');
    };

    // ---- input ----
    const key = (e: KeyboardEvent, down: boolean) => {
      if (e.repeat) return;
      // While the pause menu is up the flight controls are off. This matters for
      // Space in particular: it fires AND preventDefaults, which would otherwise
      // stop it activating the focused menu button for a keyboard player.
      if (menuRef.current) {
        ship.left = ship.right = ship.thrust = ship.fire = false;
        return;
      }
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': ship.left = down; break;
        case 'ArrowRight': case 'KeyD': ship.right = down; break;
        case 'ArrowUp': case 'KeyW': ship.thrust = down; break;
        case 'Space': ship.fire = down; e.preventDefault(); break;
        default: return;
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(e.code)) e.preventDefault();
    };
    const kd = (e: KeyboardEvent) => key(e, true);
    const ku = (e: KeyboardEvent) => key(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    // touch: left half steers (rotate toward the finger + thrust), right half fires
    let steerId: number | null = null;
    let steerX = 0;
    let steerY = 0;
    const pd = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      if (e.clientX < W / 2 && steerId === null) {
        steerId = e.pointerId;
        steerX = e.clientX;
        steerY = e.clientY;
        ship.thrust = true;
      } else {
        ship.fire = true;
      }
    };
    const pm = (e: PointerEvent) => {
      if (e.pointerId === steerId) {
        steerX = e.clientX;
        steerY = e.clientY;
      }
    };
    const pu = (e: PointerEvent) => {
      if (e.pointerId === steerId) {
        steerId = null;
        ship.thrust = false;
      } else if (e.pointerType !== 'mouse') {
        ship.fire = false;
      }
    };
    canvas.addEventListener('pointerdown', pd);
    canvas.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    window.addEventListener('pointercancel', pu);

    // Losing the tab used to freeze the sim through a silent P-key hold — its own
    // flag, no UI, easy to forget you'd left it on. That mechanic is gone; the
    // menu is the only pause now, so tabbing away opens it, same as reaching
    // for Esc — a visitor coming back always finds an actionable card, not a
    // frozen field with no explanation.
    const onVis = () => {
      if (document.hidden && !over) setMenu(true);
    };
    document.addEventListener('visibilitychange', onVis);

    // ---- loop ----
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const raw = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      // the pause menu is the only thing that freezes the sim now
      if (!menuRef.current && !over) {
        let dt = raw;
        if (slomo > 0) {
          // hit-stop: a beat of 30% speed on big hits, then straight back
          slomo -= raw;
          dt *= 0.3;
        }
        update(dt);
      }
      draw(now / 1000);
    };

    const update = (dt: number) => {
      playTime += dt;
      const introLeft = Math.max(0, introUntil - performance.now()) / 1000;
      // star field: a rush during stage separation, then a whisper of drift
      introV = introLeft > 0 ? 60 + 520 * Math.pow(introLeft / 2.2, 2) : 8;
      starOff += introV * dt;
      // ARCHITECTURE's debris — ticks every frame regardless of stage (same
      // as the star field above), it just only ever gets DRAWN in stage 2
      for (const d of debris) {
        d.x -= d.v * dt;
        if (d.x < -0.05) d.x += 1.1;
      }
      if (!firstWave && introLeft <= 0) {
        firstWave = true;
        spawnWave(); // the opening wave arrives as the rush settles
        // …and Merijn checks in, which is how you learn there's someone on comms
        say("And we're off! The kickoff's can be a bit rough, but the hazards are all labelled.");
      }
      // ship
      ship.spawnAge += dt;
      if (steerId !== null) {
        const want = Math.atan2(steerY - ship.y, steerX - ship.x);
        let d = want - ship.a;
        while (d > Math.PI) d -= 6.283;
        while (d < -Math.PI) d += 6.283;
        ship.a += Math.max(-4.4 * dt, Math.min(4.4 * dt, d));
        turnIn = Math.max(-1, Math.min(1, d * 4));
      } else {
        if (ship.left) ship.a -= 3.8 * dt;
        if (ship.right) ship.a += 3.8 * dt;
        turnIn = (ship.right ? 1 : 0) - (ship.left ? 1 : 0);
      }
      if (ship.thrust) {
        ship.vx += Math.cos(ship.a) * 240 * dt;
        ship.vy += Math.sin(ship.a) * 240 * dt;
      }
      // (No 2D ember stream: it predated the 3D exhaust plume and spawned only
      // 17px behind the ship's centre — the tail is ~59px back — so it read as a
      // second, wrong thruster firing out of the middle of the hull. The plume in
      // GameRocket comes off the nozzle and is the only exhaust now.)
      const damp = Math.exp(-0.45 * dt);
      ship.vx *= damp;
      ship.vy *= damp;
      ship.x = (ship.x + ship.vx * dt + W) % W;
      ship.y = (ship.y + ship.vy * dt + H) % H;
      if (ship.inv > 0) ship.inv -= dt;
      cooldown -= dt;
      muzzle = Math.max(0, muzzle - dt * 9); // a couple of frames of nose flash
      shieldBreak = Math.max(0, shieldBreak - dt * 2.2); // the bubble's burst, fading
      if (ship.fire && cooldown <= 0) {
        cooldown = 0.17;
        shots += 1;
        muzzle = 1; // the 3D nose flash
        bullets.push({ x: ship.x + Math.cos(ship.a) * NOSE, y: ship.y + Math.sin(ship.a) * NOSE, vx: ship.vx + Math.cos(ship.a) * 430, vy: ship.vy + Math.sin(ship.a) * 430, ttl: 1.05 });
        // muzzle sparks off the nose
        const mn = reduced ? 1 : 3;
        for (let i = 0; i < mn; i++) {
          const ja = ship.a + (Math.random() - 0.5) * 0.8;
          const js = 90 + Math.random() * 120;
          parts.push({ x: ship.x + Math.cos(ship.a) * (NOSE + 2), y: ship.y + Math.sin(ship.a) * (NOSE + 2), vx: ship.vx + Math.cos(ja) * js, vy: ship.vy + Math.sin(ja) * js, ttl: 0.14, max: 0.14, c: CYAN, streak: true });
        }
      }
      if (!hintDone) {
        if (ship.left || ship.right || steerId !== null) usedTurn = true;
        if (ship.thrust) usedThrust = true;
        if (ship.fire) usedFire = true;
        if (usedTurn && usedThrust && usedFire) {
          hintDone = true;
          hintRef.current?.classList.add('ast__hint--done');
        }
      }
      // engine feel: the throttle spools toward the key, the hull leans into
      // the stick — both eased so nothing snaps
      const tw = ship.thrust && ship.dead <= 0 ? 1 : 0;
      throttle += (tw - throttle) * Math.min(1, dt * (tw ? 7 : 10));
      turnEase += (turnIn - turnEase) * Math.min(1, dt * 8);
      // bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.ttl -= dt;
        if (b.ttl <= 0) {
          bullets.splice(i, 1);
          continue;
        }
        b.x = (b.x + b.vx * dt + W) % W;
        b.y = (b.y + b.vy * dt + H) % H;
      }
      // rocks
      for (const rk of rocks) {
        rk.x = (rk.x + rk.vx * dt + W) % W;
        rk.y = (rk.y + rk.vy * dt + H) % H;
        rk.rot += rk.spin * dt;
        rk.age += dt;
      }
      // collisions: bullets ↔ rocks
      outer: for (let i = rocks.length - 1; i >= 0; i--) {
        const rk = rocks[i];
        for (let j = bullets.length - 1; j >= 0; j--) {
          const b = bullets[j];
          const dx = rk.x - b.x;
          const dy = rk.y - b.y;
          if (dx * dx + dy * dy < rk.r * rk.r) {
            const sp = Math.hypot(b.vx, b.vy) || 1;
            hitsCount += 1;
            bullets.splice(j, 1);
            splitRock(rk, i, { x: b.x, y: b.y, dx: b.vx / sp, dy: b.vy / sp });
            continue outer;
          }
        }
        // ship ↔ rock
        if (ship.dead <= 0 && ship.inv <= 0) {
          const dx = rk.x - ship.x;
          const dy = rk.y - ship.y;
          const rr = rk.r + 13; // the 3D vehicle is bigger in frame — meet it partway
          // (still forgiving: the hull is ~120px long, so only its core collides)
          if (dx * dx + dy * dy < rr * rr) impact(rk.label);
        }
      }
      // particles
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.ttl -= dt;
        if (p.ttl <= 0) parts.splice(i, 1);
        else {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
      }
      // shockwaves + score popups
      for (let i = rings.length - 1; i >= 0; i--) {
        const g = rings[i];
        g.ttl -= dt;
        g.r += g.v * dt;
        if (g.ttl <= 0) rings.splice(i, 1);
      }
      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        p.ttl -= dt;
        p.y -= 26 * dt;
        if (p.ttl <= 0) popups.splice(i, 1);
      }
      // hit flashes (a rock's last two frames)
      for (let i = rockFlashes.length - 1; i >= 0; i--) {
        rockFlashes[i].ttl -= dt;
        if (rockFlashes[i].ttl <= 0) rockFlashes.splice(i, 1);
      }
      // the chain window closes quietly
      if (chainT > 0) {
        chainT -= dt;
        if (chainT <= 0) {
          chain = 0;
          if (chainRef.current) chainRef.current.textContent = '';
        }
      }
      // the odometer rolls toward the real score
      dispScore = reduced ? score : Math.min(score, dispScore + Math.max(1, (score - dispScore) * Math.min(1, dt * 9)));
      // next wave once the field clears
      if (waveGap > 0) {
        waveGap -= dt;
        if (waveGap <= 0) spawnWave();
      }
      if (shake > 0) shake = Math.max(0, shake - dt * 18);
      if (flash > 0) flash = Math.max(0, flash - dt * 2.4);
      if (wavePulse > 0) wavePulse = Math.max(0, wavePulse - dt * 1.1);
      if (gridPulse > 0) gridPulse = Math.max(0, gridPulse - dt * 1.4);
    };

    const draw = (t: number) => {
      ctx.save();
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      // How far from the city the run has climbed: 0 at KICKOFF, 1 by RELEASE
      // (stage 4) and held there through POST-LAUNCH/MAINTENANCE — a run doesn't
      // keep travelling forever, it arrives and then it's just deep space. Drives
      // three things below: the void's own tint, how bright/dense the stars read,
      // and how far the city's horizon has faded and drawn in. A new stage on its
      // own (the slate, the numeral) said "further along"; nothing actually LOOKED
      // further away, so it read as one field with a scoreboard rather than a trip.
      const horizonT = Math.min(1, Math.max(0, (wave - 1) / 3));
      // space — near-opaque fill leaves a 3% smear of the last frame (cheap
      // motion blur), then the site's dot-grid paper, drifting twinkle stars
      // and a corner vignette to pull the eye to the field. The fill itself
      // cools a few RGB steps deeper as horizonT climbs — too small a shift to
      // clock frame to frame, enough that KICKOFF and POST-LAUNCH read distinct.
      const bgR = Math.round(10 - 3 * horizonT);
      const bgG = Math.round(13 - 4 * horizonT);
      const bgB = Math.round(16 - 1 * horizonT);
      ctx.fillStyle = `rgba(${bgR}, ${bgG}, ${bgB}, 0.97)`;
      ctx.fillRect(-20, -20, W + 40, H + 40);

      // the stage's own vista — drawn UNDER the paper (gridPat) so the site's
      // own texture still reads on top, and under the stars so nothing here
      // ever competes with the field you're actually flying in
      const vstage = Math.min(wave, 5);
      if (vstage === 2) {
        // ARCHITECTURE — a debris lane: we're building, and there's scattered
        // material drifting past. The band itself sits still (it's the SIZE of
        // the frame); the flecks drifting through it are what reads as motion.
        if (laneGrad) {
          ctx.fillStyle = laneGrad;
          ctx.fillRect(0, 0, W, H);
        }
        for (const d of debris) {
          const y = 0.78 - d.x * 0.56 + d.jitter;
          if (y < -0.1 || y > 1.1) continue;
          ctx.globalAlpha = d.a;
          ctx.fillStyle = NEUTRAL;
          ctx.fillRect(d.x * W, y * H, d.r, d.r);
        }
        ctx.globalAlpha = 1;
      } else if (vstage === 3) {
        // THE DEMO — a distant nebula. A gentle sway (independent of the star
        // drift) is what keeps three static gradients from reading as painted
        // wallpaper.
        ctx.save();
        ctx.translate(Math.sin(t * 0.025) * W * 0.02, Math.cos(t * 0.018) * H * 0.02);
        for (const g of nebGrads) {
          ctx.fillStyle = g;
          ctx.fillRect(-40, -40, W + 80, H + 80);
        }
        ctx.restore();
      } else if (vstage === 4) {
        // RELEASE — a ringed world, edge-on: a soft dark limb and two thin
        // concentric arcs (the site's own hairline language), not a rendered
        // sphere. Barely tilts — a body this size doesn't hurry past.
        const ringCx = W * 0.14;
        const ringCy = H * 1.04;
        const ringR = H * 0.5;
        if (limbGrad) {
          ctx.fillStyle = limbGrad;
          ctx.beginPath();
          ctx.arc(ringCx, ringCy, ringR, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(39, 232, 242, 0.16)';
        ctx.lineWidth = 1;
        const tilt = -0.36 + Math.sin(t * 0.015) * 0.02;
        for (const k of [1.35, 1.55]) {
          ctx.beginPath();
          ctx.ellipse(ringCx, ringCy, ringR * k, ringR * k * 0.28, tilt, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (vstage === 5 && galGrad) {
        // POST-LAUNCH — deep field: a faint elongated smudge, the way a
        // distant galaxy actually reads to the naked eye. The densest stars
        // (below) are the rest of this stage's vista.
        ctx.save();
        ctx.translate(W * 0.32 + Math.sin(t * 0.012) * W * 0.015, H * 0.28);
        ctx.rotate(0.5);
        ctx.scale(1, 0.4);
        ctx.fillStyle = galGrad;
        ctx.beginPath();
        ctx.arc(0, 0, W * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (gridPat) {
        ctx.fillStyle = gridPat;
        ctx.fillRect(0, 0, W, H);
        if (gridPulse > 0) {
          // the paper brightens for a beat on milestones and stage clears
          ctx.globalAlpha = gridPulse * 0.9;
          ctx.fillRect(0, 0, W, H);
          ctx.globalAlpha = 1;
        }
      }
      // stars: streaks while stage separation rushes past, then settling into
      // a calm drift (starOff keeps a whisper of downward motion — we climb).
      // Denser/brighter deep space the further the run has come (horizonT) —
      // away from the city's light, more of the field actually shows.
      for (const s of stars) {
        const x = (s.x * W + t * 4 * s.z) % W;
        const y = (s.y * H + starOff * s.z) % H;
        ctx.globalAlpha = (0.1 + 0.2 * (0.5 + 0.5 * Math.sin(t * 1.9 + s.ph)) + 0.14 * horizonT) * s.z;
        const len = introV * s.z * 0.055;
        if (len > 4) {
          ctx.strokeStyle = INK;
          ctx.lineWidth = s.z > 0.75 ? 1.4 : 1;
          ctx.beginPath();
          ctx.moveTo(x, y - len);
          ctx.lineTo(x, y);
          ctx.stroke();
        } else {
          ctx.fillStyle = INK;
          ctx.fillRect(x, y, s.z > 0.75 ? 2 : 1, s.z > 0.75 ? 2 : 1);
        }
      }
      ctx.globalAlpha = 1;
      // the city below — a faint curved horizon; we are, after all, in orbit.
      // It's also the one place the run visibly gets further from home: it
      // fades and draws in tighter (a smaller, more distant limb) the deeper
      // the project gets, gone entirely by RELEASE — you've left orbit, not
      // just moved to the next wave of the same field.
      if (horizonT > 0.01) {
        const hr = W * 1.5 * (1 - 0.25 * horizonT);
        ctx.globalAlpha = horizonT;
        ctx.strokeStyle = 'rgba(39, 232, 242, 0.13)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(W / 2, H + hr - 46, hr, Math.PI * 1.5 - 0.42, Math.PI * 1.5 + 0.42);
        ctx.stroke();
        if (horizonGrad) {
          ctx.fillStyle = horizonGrad;
          ctx.fillRect(0, H - 120, W, 120);
        }
        ctx.globalAlpha = 1;
      }
      if (vig) {
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);
      }

      // stage numeral, ghosted bottom-right — the site's layer-index language
      // ("01 · CITY"); it breathes brighter for a beat when a wave spawns.
      // Bottom-LEFT used to double as ground control's own corner (.comms in
      // launch.css), so the transmission panel sat right over the numeral
      // every time Merijn had a line — which is often. Opposite corner, same
      // margin, nothing left to fight over.
      ctx.font = `700 ${Math.round(Math.min(150, H * 0.17))}px "Space Mono", monospace`;
      ctx.textAlign = 'right';
      ctx.fillStyle = CYAN;
      ctx.globalAlpha = 0.045 + 0.09 * wavePulse;
      ctx.fillText(String(wave).padStart(2, '0'), W - 26, H - 30);
      ctx.globalAlpha = 1;

      // rocks — the bodies themselves are 3D now (the GameRocket layer above),
      // so here we only hand over their live poses and keep the labels, which
      // read through the translucent stone.
      const rv = rocksView.current;
      rv.length = rocks.length;
      for (let i = 0; i < rocks.length; i++) {
        const rk = rocks[i];
        const born = Math.min(1, rk.age / 0.45);
        rv[i] = { x: rk.x, y: rk.y, r: rk.r, rot: rk.rot, id: rk.id, born };
        if (rk.label) {
          ctx.globalAlpha = 0.85 * born;
          ctx.fillStyle = INK;
          ctx.font = `${rk.tier === 0 ? 13 : 11}px "Space Mono", monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(rk.label, rk.x, rk.y + 4);
        }
      }
      ctx.globalAlpha = 1;

      // bullets + sparks + shockwaves, additively — they glow against the dark
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const b of bullets) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        ctx.strokeStyle = 'rgba(39, 232, 242, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x - (b.vx / sp) * 11, b.y - (b.vy / sp) * 11);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.fillStyle = '#c8fbff';
        ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
      }
      for (const p of parts) {
        ctx.globalAlpha = Math.max(0, p.ttl / p.max) * 0.9;
        if (p.streak) {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const L = Math.min(13, 3 + sp * 0.045);
          ctx.strokeStyle = p.c;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(p.x - (p.vx / sp) * L, p.y - (p.vy / sp) * L);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        } else {
          ctx.fillStyle = p.c;
          ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
        }
      }
      for (const g of rings) {
        ctx.globalAlpha = Math.max(0, g.ttl / g.max) * 0.55;
        ctx.strokeStyle = g.c;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r, 0, 6.283);
        ctx.stroke();
      }
      // the breaking rock's white-hot outline, two frames of it
      for (const f of rockFlashes) {
        ctx.globalAlpha = Math.max(0, f.ttl / f.max) * 0.85;
        ctx.strokeStyle = '#d9fbff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const fn = f.shape.length;
        for (let i = 0; i <= fn; i++) {
          const a = f.rot + (i / fn) * 6.283;
          const r = f.r * f.shape[i % fn];
          const px = f.x + Math.cos(a) * r;
          const py = f.y + Math.sin(a) * r;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;

      // floating score
      ctx.font = '12px "Space Mono", monospace';
      ctx.textAlign = 'center';
      for (const p of popups) {
        ctx.globalAlpha = Math.max(0, p.ttl / p.max) * 0.9;
        ctx.fillStyle = p.c;
        ctx.fillText(p.txt, p.x, p.y);
      }
      ctx.globalAlpha = 1;

      // the odometer rolls; writing through the DOM here also self-heals the
      // HUD after React re-renders (a phase flip restores the JSX's children)
      const odo = String(Math.round(dispScore)).padStart(4, '0');
      if (scoreRef.current && scoreRef.current.textContent !== odo) scoreRef.current.textContent = odo;
      // the shield reads from the faint shell around the vehicle (GameRocket)

      // white-out at the moment of disassembly, fading fast
      if (flash > 0) {
        ctx.globalAlpha = flash * 0.2;
        ctx.fillStyle = '#cdf6ff';
        ctx.fillRect(-20, -20, W + 40, H + 40);
        ctx.globalAlpha = 1;
      }

      // the ship is a real 3D rocket (the GameRocket overlay); hand it the live
      // pose, its shield state, and the shield's burst.
      const sv = shipView.current;
      sv.x = ship.x;
      sv.y = ship.y;
      sv.a = ship.a;
      sv.throttle = throttle;
      sv.turn = turnEase;
      sv.pop = Math.min(1, ship.spawnAge / 0.4); // scale-in on spawn
      sv.muzzle = muzzle;
      sv.shield = shield ? 1 : 0;
      sv.shieldBreak = shieldBreak;
      // once the vehicle has RUD'd it's particles — don't leave it intact over
      // the game-over card
      sv.visible = !over;

      ctx.restore();
    };

    reset();
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      canvas.removeEventListener('pointerdown', pd);
      canvas.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      window.removeEventListener('pointercancel', pu);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  // Esc mid-flight opens the pause menu rather than quitting outright — it used to
  // call onExit, so the reflex key for "hold on a second" threw the run away. On the
  // debrief there's nothing left to pause, so there it still backs out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (phase === 'over') onExit();
      else setMenu((m) => !m); // Esc toggles: open to pause, again to resume
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit, phase]);

  const contact = () => {
    onExit();
    setTimeout(() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }), 80);
  };

  return (
    <div className="ast" role="dialog" aria-label="Asteroids">
      <canvas ref={canvasRef} className="ast__canvas" />
      <GameRocket view={shipView} rocks={rocksView} bursts={burstsView} reduced={reduced} />
      {/* scanner-frame corners — the site's bracket language on the viewport */}
      <div className="ast__frame" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="ast__hud">
        <span className="ast__score">
          <span ref={scoreRef}>0000</span>
          <span className="ast__chain" ref={chainRef} /> · BEST {String(best).padStart(4, '0')}
        </span>
        {/* Was "abort to pad" wired straight to onExit. Esc no longer quits, so the
            key hint next to it would have been a lie — and leaving the run is now
            one of the choices inside the menu rather than a thing on the HUD. */}
        <button type="button" className="ast__exit" onClick={() => setMenu(true)} disabled={phase === 'over'}>
          pause <kbd>Esc</kbd>
        </button>
      </div>
      {/* The slate: separation on arrival, then the name of each stage as it
          opens. A title card, not a voice — the sentence for the same beat is
          Merijn's, and it lands when the stage is finished. */}
      {phase === 'play' && slate && (
        <div key={slate.id} className="ast__title" data-kind={slate.kind} aria-hidden="true">
          <span>{slate.text}</span>
        </div>
      )}
      {/* mission comms — the one narrative voice; every line comes through here */}
      <GameComms sayRef={sayRef} busyRef={commsBusy} />
      {/* the controls: onboarding, so it retires itself once all three are used */}
      <div className="ast__hint" ref={hintRef}>← → rotate · ↑ thrust · space fire{' '}
        <span className="ast__hint-touch">— or steer left half, fire right half</span>
      </div>

      {/* The pause menu. Only while flying — on the debrief the run is already over
          and that card owns the screen. */}
      {phase === 'play' && menu && (
        <div className="ast__pause" role="dialog" aria-modal="true" aria-label="Flight held">
          <div className="ast__pause-card">
            <span className="ast__pause-eyebrow">MK-01 · HOLDING</span>
            <h2 className="ast__pause-title">HOLD</h2>
            <p className="ast__pause-sub">The count is stopped. Nothing moves until you say so.</p>
            <div className="ast__pause-actions">
              {/* autoFocus so Enter resumes straight away and a keyboard player
                  lands inside the menu instead of somewhere behind it */}
              <button type="button" className="btn" autoFocus onClick={() => setMenu(false)}>
                RESUME
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setMenu(false);
                  giveUpRef.current(); // ends the run properly → the debrief card
                }}
              >
                GIVE UP
              </button>
            </div>
            <button type="button" className="ast__pause-quit" onClick={onExit}>
              abort to pad — leave without a write-up
            </button>
          </div>
        </div>
      )}

      {phase === 'over' && (
        <div className="rud">
          <div className="rud__card">
            <span className="rud__eyebrow">MK-01 · FLIGHT {String(Math.max(1, Math.round(finalScore / 100))).padStart(2, '0')}</span>
            <h2 className="rud__title">UNEXPECTED PROJECT DELAY</h2>
            <p className="rud__sub">the project experienced an anomaly...</p>
            <p className="rud__score">
              {String(finalScore).padStart(4, '0')} problems fixed · best {String(best).padStart(4, '0')}
            </p>
            {/* Written up the way every project on this site is written up. */}
            {debrief && (
              <div className="rud__story">
                <section>
                  <h3 className="rud__h">The problem</h3>
                  <p>{debrief.problem}</p>
                </section>
                <section>
                  <h3 className="rud__h">The approach</h3>
                  <p>{debrief.approach}</p>
                </section>
                <section>
                  <h3 className="rud__h">The lesson</h3>
                  <p>{debrief.lesson}</p>
                </section>
              </div>
            )}
            <div className="rud__actions">
              <button type="button" className="btn" onClick={() => restartRef.current()}>
                ITERATE
              </button>
              <button type="button" className="btn btn--ghost" onClick={onExit}>
                RETURN TO PAD
              </button>
            </div>
            <p className="rud__foot">
              Crew applications open{' '}
              <button type="button" className="rud__link" onClick={contact}>
                let's build the next one together
              </button>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
