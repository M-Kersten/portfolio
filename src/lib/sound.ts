// The site's sound: effects and ambient beds, from recordings dropped into
// src/assets/sound/ (see the README there for the list of events and how to
// name the files). Nothing here makes a sound of its own: an event plays its
// file if one exists and is silent if not, so recordings can be added one at
// a time with no code change.
//
// Off by default: a visitor turns it on with the switch in the header (the
// choice is remembered), which is also the gesture browsers want before a page
// may make sound. While a voice note plays, everything else drops back
// (duck); while the tab is hidden, it's all silent.
//
// Three buses into one master: effects, ambient (the per-layer beds, crossfaded
// by the scroll journey) and the launch (the film's roar and water, which also
// sit under the duck). Files decode on first use and stay cached.

import { remember, remembered } from './page';

const files = import.meta.glob('../assets/sound/*.{mp3,m4a,ogg,webm,wav}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Every event the site can sound, and the file name it plays (any of the
 *  extensions above). Variants: `shot.mp3`, `shot.2.mp3`, `shot.3.mp3`… are
 *  picked at random, so a repeated sound doesn't sound mechanical. */
export type SoundName =
  // the signature: a project wakes (the n-th, each the next note), and the chord when all ten have
  | `wake-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`
  | 'complete'
  // the interface
  | 'select'
  | 'popup-open'
  | 'popup-close'
  // the launch
  | 'launch-count'
  | 'launch-release'
  | 'launch-roar'
  | 'launch-deluge'
  | 'launch-catch'
  // the game
  | 'game-shot'
  | 'game-break-big'
  | 'game-break-mid'
  | 'game-break-small'
  | 'game-shield'
  | 'game-stage'
  | 'game-crash'
  | 'comms-open'
  | 'comms-close'
  | 'comms-type'
  // the ambient beds, one per layer of the maquette
  | 'ambient-city'
  | 'ambient-room'
  | 'ambient-chip';

const VARIANTS: Record<string, string[]> = {};
for (const [path, url] of Object.entries(files)) {
  const name = path.split('/').pop()!.split('.')[0];
  (VARIANTS[name] ??= []).push(url);
}

/** Whether there's anything to hear at all (the header switch hides itself
 *  until the first recording is in). */
export const hasSounds = Object.keys(VARIANTS).length > 0;

/* ---------- on / off ---------- */

const KEY = 'mk-sound';
let enabled = remembered(KEY) === 'on';
const listeners = new Set<() => void>();

export const soundOn = () => enabled;
export function subscribeSound(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
/** Turn sound on or off. Call it from the click itself: that click is what
 *  lets the page make sound. */
export function setSound(on: boolean) {
  enabled = on;
  remember(KEY, on ? 'on' : 'off');
  if (on) wake();
  if (graph && ctx) graph.master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.15);
  listeners.forEach((l) => l());
}

// Remembered as on from an earlier visit: browsers still hold a new page's
// audio until the visitor's first click or key, so that's when it wakes.
if (typeof window !== 'undefined') {
  const unlock = () => {
    if (enabled) wake();
    if (ctx?.state === 'running') {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    }
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

/* ---------- the graph ---------- */

let ctx: AudioContext | null = null;
let graph: { master: GainNode; sfx: GainNode; ambient: GainNode; launch: GainNode } | null = null;

/** Make the context (needs a gesture the first time) and resume it. */
function wake(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = enabled ? 1 : 0;
      master.connect(ctx.destination);
      const bus = (v: number) => {
        const g = ctx!.createGain();
        g.gain.value = v;
        g.connect(master);
        return g;
      };
      graph = { master, sfx: bus(0.8), ambient: bus(0.5), launch: bus(0.9) };
      document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (document.hidden) void ctx.suspend();
        else if (enabled) void ctx.resume();
      });
    }
    if (ctx.state === 'suspended' && !document.hidden) void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

const buffers = new Map<string, Promise<AudioBuffer | null>>();
function load(url: string): Promise<AudioBuffer | null> {
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx!.decodeAudioData(b))
      .catch(() => null);
    buffers.set(url, p);
  }
  return p;
}
const pick = (name: SoundName) => {
  const v = VARIANTS[name];
  return v ? v[Math.floor(Math.random() * v.length)] : undefined;
};

/** Decode some sounds ahead of when they're needed (the first play of a file
 *  otherwise waits for it). */
export function preload(names: SoundName[]) {
  if (!enabled || !wake()) return;
  for (const n of names) for (const url of VARIANTS[n] ?? []) void load(url);
}

/* ---------- playing ---------- */

/** Play a one-shot effect. `volume` 0–1, `rate` its speed (and pitch), `pan`
 *  −1 (left) to 1 (right). Silent when sound is off or there's no file. */
export function play(name: SoundName, o: { volume?: number; rate?: number; pan?: number; bus?: 'sfx' | 'launch' } = {}) {
  if (!enabled || document.hidden) return;
  const url = pick(name);
  if (!url) return;
  const c = wake();
  if (!c || !graph) return;
  const out = graph[o.bus ?? 'sfx'];
  void load(url).then((buf) => {
    if (!buf || !enabled) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1;
    const g = c.createGain();
    g.gain.value = o.volume ?? 1;
    let node: AudioNode = src.connect(g);
    if (o.pan) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      node = node.connect(p);
    }
    node.connect(out);
    src.start();
  });
}

/** A looping sound whose level you steer: the ambient beds, the launch's
 *  roar and water. Starts silent; `set` glides it to a level, `stop` fades it
 *  out and lets it go. */
export interface Loop {
  set(volume: number, glide?: number): void;
  stop(fade?: number): void;
}
const NO_LOOP: Loop = { set() {}, stop() {} };

export function loop(name: SoundName, bus: 'ambient' | 'launch' = 'ambient'): Loop {
  const url = pick(name);
  const c = url && enabled ? wake() : null;
  if (!url || !c || !graph) return NO_LOOP;
  const g = c.createGain();
  g.gain.value = 0;
  g.connect(graph[bus]);
  let src: AudioBufferSourceNode | null = null;
  let stopped = false;
  void load(url).then((buf) => {
    if (!buf || stopped) return;
    src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(g);
    // start somewhere into the loop, so two visits don't open identically
    src.start(0, Math.random() * buf.duration);
  });
  return {
    set(volume, glide = 0.3) {
      if (!stopped) g.gain.setTargetAtTime(Math.max(0, volume), c.currentTime, glide / 3);
    },
    stop(fade = 0.8) {
      if (stopped) return;
      stopped = true;
      g.gain.setTargetAtTime(0, c.currentTime, fade / 3);
      window.setTimeout(() => {
        try {
          src?.stop();
        } catch {
          /* never started */
        }
        g.disconnect();
      }, fade * 1000 + 200);
    },
  };
}

/** Drop everything back while a voice note plays, and bring it up after. */
export function duck(on: boolean) {
  if (!ctx || !graph) return;
  const t = ctx.currentTime;
  graph.ambient.gain.setTargetAtTime(on ? 0.12 : 0.5, t, 0.2);
  graph.sfx.gain.setTargetAtTime(on ? 0.3 : 0.8, t, 0.2);
  graph.launch.gain.setTargetAtTime(on ? 0.2 : 0.9, t, 0.2);
}
