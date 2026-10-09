// The launch's sound, synthesised (no files): the roar of the engines — a
// deep rumble and the crackle that rides on it, both following the engines'
// thrust — muffled once the camera is far off or riding a time-lapse, the
// landing burn coming in over the tower, and a heavy clank as the chopsticks
// take the booster. It starts from the LAUNCH press (browsers only let a page
// make sound after a gesture) and can be switched off from the telemetry; the
// choice is remembered.
//
// The film's clock drives it: LaunchHud calls update() every frame with the
// film time, from the same flight plan the picture uses.
import { BOOSTER_ENGINES, SHIP_ENGINES, T, boosterEngines, shipEngines, smooth, timeLapse } from '../scene/launchPlan';

const KEY = 'mk-launch-sound';
let ctx: AudioContext | null = null;
let nodes: {
  master: GainNode;
  rumble: GainNode;
  rumbleLp: BiquadFilterNode;
  crackle: GainNode;
  crackleBp: BiquadFilterNode;
  srcs: AudioBufferSourceNode[];
} | null = null;
let caught = false;
const b = new Float32Array(BOOSTER_ENGINES);
const s = new Float32Array(SHIP_ENGINES);

export function soundWanted(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setSoundWanted(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* a private window: it just isn't remembered */
  }
  if (nodes && ctx) nodes.master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.08);
}

/** Two seconds of noise, white or brown (white, integrated and leaking). */
function noise(c: AudioContext, brown: boolean): AudioBuffer {
  const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

/** Make the sound graph. Call from the LAUNCH press itself. */
export function armSound() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    void ctx.resume();
    if (nodes) return;
    const c = ctx;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.connect(c.destination);
    const master = c.createGain();
    master.gain.value = soundWanted() ? 1 : 0;
    master.connect(comp);
    // the rumble: brown noise, low-passed
    const rumble = c.createGain();
    rumble.gain.value = 0;
    const rumbleLp = c.createBiquadFilter();
    rumbleLp.type = 'lowpass';
    rumbleLp.frequency.value = 180;
    rumbleLp.Q.value = 0.7;
    rumbleLp.connect(rumble).connect(master);
    const r = c.createBufferSource();
    r.buffer = noise(c, true);
    r.loop = true;
    r.connect(rumbleLp);
    // the crackle: white noise through a band, gated in rough bursts below
    const crackle = c.createGain();
    crackle.gain.value = 0;
    const crackleBp = c.createBiquadFilter();
    crackleBp.type = 'bandpass';
    crackleBp.frequency.value = 900;
    crackleBp.Q.value = 0.6;
    crackleBp.connect(crackle).connect(master);
    const w = c.createBufferSource();
    w.buffer = noise(c, false);
    w.loop = true;
    w.connect(crackleBp);
    r.start();
    w.start();
    nodes = { master, rumble, rumbleLp, crackle, crackleBp, srcs: [r, w] };
    caught = false;
  } catch {
    nodes = null;
  }
}

/** One frame of the film: set the roar from the engines and where the camera is. */
export function updateSound(t: number) {
  if (!ctx || !nodes) return;
  const now = ctx.currentTime;
  boosterEngines(t, b);
  shipEngines(t, s);
  let bt = 0;
  for (const x of b) bt += x;
  bt /= BOOSTER_ENGINES;
  let st = 0;
  for (const x of s) st += x;
  st /= SHIP_ENGINES;
  // how close the microphone is: on the ground through liftoff, far once the
  // film turns into a time-lapse (a muffled distant roar), close again at the
  // tower for the catch
  const lapse = timeLapse(t) > 1.5;
  const home = t >= T.ret;
  const near = home ? 0.75 : t < T.clear ? 1 : 0.35;
  const loud = Math.min(1, (home ? bt : Math.max(bt, st * 0.6)) * 1.15) * near * (lapse && !home ? 0.7 : 1);
  // the ground shakes hardest just after release, when the exhaust hits the plate
  const kick = 1 + 0.35 * smooth(T.release - 0.2, T.release + 0.4, t) * (1 - smooth(T.release + 1.5, T.release + 5, t));
  nodes.rumble.gain.setTargetAtTime(0.9 * loud * kick, now, 0.06);
  nodes.rumbleLp.frequency.setTargetAtTime(lapse && !home ? 110 : 190, now, 0.2);
  // the crackle flutters: a new level every frame
  const crack = loud * (0.18 + 0.32 * Math.random()) * (lapse && !home ? 0.4 : 1);
  nodes.crackle.gain.setTargetAtTime(crack, now, 0.015);
  nodes.crackleBp.frequency.setTargetAtTime(700 + Math.random() * 500, now, 0.03);
  // caught: the clank of the arms taking the weight
  if (!caught && t >= T.catch) {
    caught = true;
    clank(ctx, nodes.master);
  }
}

/** A heavy steel clank: a low thump and a short metallic ring. */
function clank(c: AudioContext, out: AudioNode) {
  const now = c.currentTime;
  const thump = c.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(90, now);
  thump.frequency.exponentialRampToValueAtTime(38, now + 0.35);
  const tg = c.createGain();
  tg.gain.setValueAtTime(0.0001, now);
  tg.gain.exponentialRampToValueAtTime(0.9, now + 0.01);
  tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  thump.connect(tg).connect(out);
  thump.start(now);
  thump.stop(now + 0.65);
  for (const f of [310, 467, 733]) {
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.12, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    o.connect(g).connect(out);
    o.start(now);
    o.stop(now + 1.2);
  }
}

/** The film's over (or skipped): fade it out and stop. */
export function stopSound() {
  if (!ctx || !nodes) return;
  const c = ctx;
  const n = nodes;
  nodes = null;
  n.master.gain.setTargetAtTime(0, c.currentTime, 0.25);
  window.setTimeout(() => {
    for (const src of n.srcs) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    n.master.disconnect();
  }, 1500);
}
