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
const HAZARDS = [
  'SCOPE CREEP',
  'LEGACY CODE',
  'MERGE CONFLICT',
  'GPS DRIFT',
  'SHOW-FLOOR WIFI',
  'HOLOLENS BATTERY',
  '1★ STORE REVIEW',
  'ANOTHER MEETING',
  'TECH DEBT',
  'NullReferenceException',
];
// A couple of hazards split into bespoke children — the whole joke.
const SPLITS: Record<string, [string, string]> = {
  'SCOPE CREEP': ['MORE SCOPE CREEP', 'MORE SCOPE CREEP'],
  'MERGE CONFLICT': ['<<<<<<< YOURS', '>>>>>>> THEIRS'],
  'TECH DEBT': ['UNUSED SDK', 'SINGLETON SPAGHETTI'],
};
// Spoken over comms by the hologram, so they read as someone talking, not as
// terminal output (see GameComms).
const MILESTONES: [number, string][] = [
  [400, 'Design briefing done. What could possibly go wrong?'],
  [1200, "Architecture's mapped out. Feels good. It never lasts."],
  [2500, "Build is green, and QA is screaming. Both true at once."],
  [5000, "We're live. Brace for the first wave of support tickets."],
];

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

const EMBER = '#ffb46a'; // exhaust / damage heat (the palette's one warm note)

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
  const shieldRef = useRef<HTMLSpanElement>(null);
  const sayRef = useRef<(msg: string) => void>(() => {}); // set by GameComms
  const [phase, setPhase] = useState<'play' | 'over'>('play');
  const [finalScore, setFinalScore] = useState(0);
  const [debrief, setDebrief] = useState<Debrief | null>(null); // the RUD card's write-up
  const [runId, setRunId] = useState(0); // bumps per run — replays the title card
  const [best, setBest] = useState(() => Number(localStorage.getItem('mk-asteroids-best') ?? 0));
  const restartRef = useRef<() => void>(() => {});
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
    let muzzle = 0; // 1 on the shot, decays — drives the 3D nose flash
    // The 3D vehicle is ~150px long, so its nose tip sits about this far out
    // from centre: shots and their sparks leave from THERE, not from mid-hull.
    const NOSE = 56;
    let paused = false;
    let over = false;
    let shake = 0;
    let flash = 0; // white-out at the moment of disassembly
    let slomo = 0; // hit-stop: the world catches its breath on big hits
    let wavePulse = 0; // the stage numeral watermark breathes on each new wave
    let gridPulse = 0; // the paper brightens for a beat on milestones/clears
    let milestone = 0;
    // arrival: stage separation — stars rush past and settle as you take over.
    // Wall-clock deadline, not sim time: dt is clamped (1/30), so on a slow
    // device the sim runs under real time and a sim-timed intro would strand
    // the field empty for ages (same lesson as the ascent's staging fallback).
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

    // Every message the game has to give the player comes over comms, from the
    // hologram (GameComms). The old centre-screen toast is gone — a line is
    // something a person says to you now, not text that appears in the void.
    const say = (msg: string) => sayRef.current(msg);
    const hud = () => {
      const el = shieldRef.current;
      if (!el) return;
      el.textContent = shield ? 'SHIELD UP' : 'SHIELD DOWN';
      if (shield) el.setAttribute('data-up', 'true');
      else el.removeAttribute('data-up');
    };
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
      while (milestone < MILESTONES.length && score >= MILESTONES[milestone][0]) {
        say(MILESTONES[milestone][1]);
        gridPulse = 1;
        milestone += 1;
      }
      if (!recordBroken && bestAtStart > 0 && score > bestAtStart) {
        recordBroken = true;
        say("New record. That one goes in the portfolio.");
        gridPulse = 1;
        scoreRef.current?.classList.add('ast__score-rec');
      }
    };

    const spawnWave = () => {
      wave += 1;
      wavePulse = 1;
      const n = Math.min(2 + wave, 7);
      const labels = [...HAZARDS].sort(() => Math.random() - 0.5);
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
        popups.push({ x: ship.x, y: ship.y - 36, txt: '+150 STAGE BONUS', ttl: 1, max: 1, c: CYAN });
        if (!reduced) rings.push({ x: ship.x, y: ship.y, r: 12, v: 540, ttl: 0.5, max: 0.5, c: CYAN });
        gridPulse = 1;
        // clearing a stage re-earns the shield — the only way to get it back
        const regained = !shield;
        shield = true;
        hud();
        say(
          regained
            ? `Stage ${wave + 1} clear, and your shield is back. Try to keep it.`
            : `Stage ${wave + 1} clear. There is always another stage.`,
        );
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
        hud();
        bump(shieldRef.current, 'ast__shield-hit');
        shieldBreak = 1; // the 3D bubble flares and bursts
        boom(ship.x, ship.y, 12, CYAN);
        if (!reduced) {
          rings.push({ x: ship.x, y: ship.y, r: 26, v: 320, ttl: 0.4, max: 0.4, c: CYAN });
          flash = 0.4;
          shake = Math.min(shake + 5, 12);
        }
        ship.inv = 1.2; // a breath of grace so the same rock can't finish you
        say(killer ? `${killer} took the shield. Do not take another one.` : 'Shield is gone. Do not take another one.');
        return;
      }

      boom(ship.x, ship.y, 26, CYAN);
      if (!reduced) {
        flash = 1;
        slomo = Math.max(slomo, 0.3);
        shake = Math.min(shake + 10, 18);
      }
      over = true;
      setFinalScore(score);
      // The write-up: the three beats every case study on this site uses, built
      // from what the engine already knows.
      const acc = shots > 0 ? Math.round((hitsCount / shots) * 100) : 0;
      const mm = String(Math.floor(playTime / 60)).padStart(2, '0');
      const ss = String(Math.floor(playTime % 60)).padStart(2, '0');
      setDebrief({
        problem: `${killer ?? 'An unlabelled hazard'} got through at stage ${Math.max(1, wave)}, with the shield already down.`,
        approach: `${shots} ticket${shots === 1 ? '' : 's'} fired, ${shots > 0 ? `${acc}% resolved` : 'none resolved'}${
          bestChain >= 2 ? `, ${bestChain} cleared back-to-back at best` : ''
        }. ${score} problem${score === 1 ? '' : 's'} fixed in T+${mm}:${ss}.`,
        lesson: lessonFor({ acc, shots, wave, chain: bestChain }),
      });
      setBest((b) => {
        const nb = Math.max(b, score);
        localStorage.setItem('mk-asteroids-best', String(nb));
        return nb;
      });
      setPhase('over');
    };

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
      milestone = 0;
      over = false;
      paused = false;
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
      if (chainRef.current) chainRef.current.textContent = '';
      scoreRef.current?.classList.remove('ast__score-rec');
      if (scoreRef.current) scoreRef.current.textContent = '0000';
      hud();
      setRunId((n) => n + 1); // replays the arrival card
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
        hud();
        rocks.push({ x: W / 2, y: H / 2, vx: 0, vy: 0, r: 44, tier: 0, rot: 0, spin: 0.4, shape: rockShape(), label: 'SCOPE CREEP', age: 9, id: rockId++ });
      }
    };
    restartRef.current = () => {
      reset(true);
      setPhase('play');
    };

    // ---- input ----
    const key = (e: KeyboardEvent, down: boolean) => {
      if (e.repeat) return;
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': ship.left = down; break;
        case 'ArrowRight': case 'KeyD': ship.right = down; break;
        case 'ArrowUp': case 'KeyW': ship.thrust = down; break;
        case 'Space': ship.fire = down; e.preventDefault(); break;
        case 'KeyP': if (down && !over) paused = !paused; break;
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

    const onVis = () => {
      if (document.hidden && !over) paused = true;
    };
    document.addEventListener('visibilitychange', onVis);

    // ---- loop ----
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const raw = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      if (!paused && !over) {
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
      if (!firstWave && introLeft <= 0) {
        firstWave = true;
        spawnWave(); // the opening wave arrives as the rush settles
        // …and Merijn checks in, which is how you learn there's someone on comms
        say('You have the stick. Shoot the problems before they reach you.');
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
      // embers stream from the tail while the engine's spooled, under the 3D
      // plume — the rate follows the throttle, not the key
      if (!reduced && throttle > 0.12) {
        const n = Math.random() < throttle ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const ja = ship.a + Math.PI + (Math.random() - 0.5) * 0.55;
          const js = 70 + Math.random() * 110;
          parts.push({
            x: ship.x - Math.cos(ship.a) * 17, y: ship.y - Math.sin(ship.a) * 17,
            vx: Math.cos(ja) * js, vy: Math.sin(ja) * js,
            ttl: 0.2 + Math.random() * 0.22, max: 0.42,
            c: Math.random() < 0.5 ? EMBER : '#ffd9a0', streak: true,
          });
        }
      }
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
      // space — near-opaque fill leaves a 3% smear of the last frame (cheap
      // motion blur), then the site's dot-grid paper, drifting twinkle stars
      // and a corner vignette to pull the eye to the field
      ctx.fillStyle = 'rgba(10, 13, 16, 0.97)';
      ctx.fillRect(-20, -20, W + 40, H + 40);
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
      // a calm drift (starOff keeps a whisper of downward motion — we climb)
      for (const s of stars) {
        const x = (s.x * W + t * 4 * s.z) % W;
        const y = (s.y * H + starOff * s.z) % H;
        ctx.globalAlpha = (0.1 + 0.2 * (0.5 + 0.5 * Math.sin(t * 1.9 + s.ph))) * s.z;
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
      // the city below — a faint curved horizon; we are, after all, in orbit
      const hr = W * 1.5;
      ctx.strokeStyle = 'rgba(39, 232, 242, 0.13)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(W / 2, H + hr - 46, hr, Math.PI * 1.5 - 0.42, Math.PI * 1.5 + 0.42);
      ctx.stroke();
      if (horizonGrad) {
        ctx.fillStyle = horizonGrad;
        ctx.fillRect(0, H - 120, W, 120);
      }
      if (vig) {
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);
      }

      // stage numeral, ghosted bottom-left — the site's layer-index language
      // ("01 · CITY"); it breathes brighter for a beat when a wave spawns
      ctx.font = `700 ${Math.round(Math.min(150, H * 0.17))}px "Space Mono", monospace`;
      ctx.textAlign = 'left';
      ctx.fillStyle = CYAN;
      ctx.globalAlpha = 0.045 + 0.09 * wavePulse;
      ctx.fillText(String(wave).padStart(2, '0'), 26, H - 30);
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
      const wantShield = shield ? 'SHIELD UP' : 'SHIELD DOWN';
      if (shieldRef.current && shieldRef.current.textContent !== wantShield) hud();

      // (the shield itself is drawn in 3D — see GameRocket's bubble)

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

      if (paused && !over) {
        ctx.fillStyle = INK;
        ctx.font = '600 30px "Space Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('HOLD HOLD HOLD', W / 2, H / 2);
        ctx.font = '14px "Space Mono", monospace';
        ctx.globalAlpha = 0.6;
        ctx.fillText('press P to resume the count', W / 2, H / 2 + 30);
        ctx.globalAlpha = 1;
      }
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

  // Esc backs out (game over screen or mid-flight)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

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
          FIXED <span ref={scoreRef}>0000</span>
          <span className="ast__chain" ref={chainRef} /> · BEST {String(best).padStart(4, '0')}
        </span>
        <span className="ast__shield" ref={shieldRef} data-up="true" aria-label="shield status">
          SHIELD UP
        </span>
        <button type="button" className="ast__exit" onClick={onExit}>
          abort to pad <kbd>Esc</kbd>
        </button>
      </div>
      {phase === 'play' && (
        <p className="ast__objective">Fire your tickets at the problems that sink the project</p>
      )}
      {/* the arrival card — stage separation hands the visitor the stick */}
      {phase === 'play' && (
        <div key={runId} className="ast__title" aria-hidden="true">
          <span>STAGE 2 · SEPARATION CONFIRMED</span>
          <b>Let's try and land this project!</b>
        </div>
      )}
      {/* mission comms — the holographic bust that delivers every line */}
      <GameComms sayRef={sayRef} />
      <div className="ast__hint">← → rotate · ↑ thrust · space fire · P hold{' '}
        <span className="ast__hint-touch">— or steer left half, fire right half</span>
      </div>

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
