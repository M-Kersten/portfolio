// The site's sounds, cut from the bought sound library.
//
//   npm run sounds -- <library folder>                  all of them
//   npm run sounds -- <library folder> wake page-turn   only the events that start so
//
// PICKS below says which recording each event plays (the events and what they
// should sound like are in src/assets/sound/README.md). Every pick is made mono,
// has the silence taken off both ends (a click that starts late feels late),
// and is set to peak at -6 dBFS. Anything under about a third of a second stays
// a WAV: that small it's under 30 KB, and it starts on the first sample, where
// an MP3 can open with a few tens of milliseconds of nothing. Longer ones
// become MP3s. The ambient beds are made to loop (the end faded over the
// start), levelled to -28 LUFS and written as M4A.
//
// An event's old files are removed before its new ones are written, so a pick
// that changes format doesn't leave a second variant behind. The library itself
// stays where it is; only the cuts come into the repo. It needs ffmpeg on the path.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../src/assets/sound/', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VOICE_KIT = join(ROOT, 'scripts/voice-kit');
const MADE_DIR = join(ROOT, 'scripts/sound-kit/made');
const [lib, ...only] = process.argv.slice(2);
if (!lib || !existsSync(lib)) {
  console.error('Give the folder with the sound library: npm run sounds -- ~/Downloads/Website-audio');
  process.exit(1);
}

/* ---------- the signature ---------- */

// A project waking is a low, soft click, not a note: the same recording each
// time, a little higher with every project seen (WAKE_STEP semitones a visit),
// so the tour tightens as it goes without playing a tune.
const WAKE_SOURCE = 'Click/Tonal Click 02'; // a deep click, about 0.27 s
const WAKE_STEP = 0.6;

// The two bright notes that end a small win (a stage cleared, an artery open,
// the bin going over): one marimba hit at two pitches, a sixth apart.
const NOTE_SOURCE = 'Pop-Up/Marimba Dampened Hit'; // sounds B5, about 0.2 s
const note = (semitones, o = {}) => ({ from: NOTE_SOURCE, rate: 2 ** (semitones / 12), fadeOut: 0.03, ...o });
const twoNotes = (at = 0, gain = -4) => [note(-1, { at, gain }), note(7, { at: at + 0.12, gain })];

/* ---------- the picks ---------- */

// A recording is named by its folder and the plain part of its file name. A
// layer may take: start / dur (seconds into it, after the silence is off),
// rate (speed and pitch), reverse, fadeOut (seconds), gain (dB, against the
// other layers) and at (seconds into the event it comes in).
// An event is one recording, a list of layers mixed into one sound, or
// { variants: [...] } for a few takes to pick from at random.
const VECTOR_MOVE = 'Movement/Full Screen Transition';
const DESK = 'Objects on Desk Foley';
const CAMERA = 'Aperture - Singular';

const PICKS = {
  // the interface
  // the launch: the clamps letting go
  'launch-release': 'made/launch-release',

  select: 'Click/Keyboard Click 01',
  // the reticle finding a project: fine adjustments, the zoom, the lock
  focus: { from: 'made/focus', dur: 1.3, fadeOut: 0.15 },
  hover: 'Hover/Simple Hover 03',
  // a breath of air as the label opens, and the same drawn back in as it closes
  'popup-open': { from: `${VECTOR_MOVE}/Airy Transition Fast`, dur: 0.3, fadeOut: 0.1 },
  'popup-close': { from: `${VECTOR_MOVE}/Airy Transition Fast`, dur: 0.3, fadeOut: 0.1, reverse: true },
  complete: `${VECTOR_MOVE}/Resonant Big Transition`,

  // the admission ticket: slid up out of the edge and turned over, pushed
  // back in, and the validator's stamp coming down on it
  'ticket-open': ['Movement/Whoosh/Paper Fast Whoosh', { from: 'Foley/Paper Flap 01', at: 0.4, gain: -2 }],
  'ticket-close': 'Books and Notes/Flip 15',
  stamp: { variants: [6, 2, 9].map((n) => `${DESK}/Object With Rubber Feet Put Down On Desk ${String(n).padStart(2, '0')}`) },

  // the game
  // (all made: a library of interface sounds has no rock, no cannon and no radio in it)
  'game-shot': { variants: [{ from: 'made/game-shot', dur: 0.45, fadeOut: 0.12 }, { from: 'made/game-shot-2', dur: 0.45, fadeOut: 0.12 }] },
  'game-break-big': { from: 'made/game-break-big', dur: 1.1, fadeOut: 0.3 },
  'game-break-mid': { from: 'made/game-break-mid', dur: 0.7, fadeOut: 0.2 },
  'game-break-small': { from: 'made/game-break-small', dur: 0.4, fadeOut: 0.12 },
  'game-shield': { from: 'made/game-shield', dur: 0.9, fadeOut: 0.25 },
  'game-crash': { from: 'made/game-crash', dur: 1.8, fadeOut: 0.5 },
  'game-stage': { from: 'made/game-stage', dur: 0.9, fadeOut: 0.15 },
  'comms-open': { from: 'made/comms-open', dur: 0.35, fadeOut: 0.05 },
  'comms-close': { from: 'made/comms-close', dur: 0.35, fadeOut: 0.08 },
  'comms-type': { from: 'made/comms-type', dur: 0.05, fadeOut: 0.02 },

  // the city's grid, and the windmill
  'grid-charge': { from: `${CAMERA}/Charge/Camera Electronic Flash Charge 02`, dur: 0.45, fadeOut: 0.08 },
  'grid-zap': { variants: [1, 2, 3].map((n) => `${VECTOR_MOVE}/Chaos Data Transition 0${n}`) },
  'grid-on': 'Switches and Peripherals/Switches Cables Plugin Peripherals 44',
  'mill-power': `${VECTOR_MOVE}/Tonal Synth Rise`,
  'star-pop': 'Hover/Simple Hover 04',
  'star-trace': 'Text/Pen Writing Single Stroke 01',

  // the picture book
  'book-find': 'Pop-Up/Cute PopUp 01',
  'page-turn': { variants: ['Books and Notes/Page Turn 03', 'Books and Notes/Page Turn 01', 'Books and Notes/Page Turn 09'] },
  'book-close': `${DESK}/Product Box Put Down On Desk 08`,

  // the heart
  'cath-inflate': { from: 'Foley/Stretched Leather 01', dur: 0.6, fadeOut: 0.12 },
  'cath-clear': ['Foley/Water Whoosh', ...twoNotes(0.25)],

  // Snake
  'snake-eat': { variants: ['Hover/Simple Hover 01', 'Hover/Simple Hover 05', 'Hover/Simple Hover 06'] },
  'snake-crash': 'Click/Deny Click',

  // the AR framework's cubes
  'cube-anchor': 'Tiles/Glass Tap Tiles 01',
  'cube-merge': 'Movement/Whoosh/Crystal Whoosh 01',

  // the Virtuele Brigade's chase
  'vr-login': 'Pop-Up/Tonal PopUp 01',
  'chase-clue': 'Click/Button Switch 01',
  'chase-send': 'Bleep/Digital Bleep 01',
  'chase-caught': 'Bleep/Bleep 02',

  // Popcore's bin
  'ball-in': 'Foley/Plastic Drop 01',
  'ball-rim': { variants: ['Tiles/Plastic Tiles 01', 'Tiles/Plastic Tiles 02', 'Tiles/Plastic Tiles 04'] },
  'bin-tip': 'Foley/Dropping Object',
  'bin-cheer': ['Pop-Up/Particles PopUp 01', ...twoNotes(0.08)],

  // ARCam's park
  'critter-peek': 'Tiles/Paper Tiles 02',
  'critter-in': 'Movement/Whoosh/Digital Light Whoosh',
  'critter-away': 'Bleep/Bleep 03',
  'critter-snap': `${CAMERA}/Digital Camera/Canon EOS T7i Auto Focus Beeps And Shutter Sequence 01`,
  // the bigger shutter, then the print winding out
  // the shelf mouse dropping to the floor and making off: small quick feet
  'mouse-patter': { from: 'Phone or Touchscreen Typing/Typing On Cell Phone Sequence 05', dur: 1.6, rate: 2, fadeOut: 0.08 },
  // the crown changing hands on the race table
  'crown-tag': 'Click/Click 02',
  'critter-group': [`${CAMERA}/Vintage Camera/Konica Shutter 01`, { from: `${CAMERA}/Vintage Camera/Konica Film Advance 02`, at: 0.7, gain: -3 }],
};

for (let i = 0; i < 10; i++) PICKS[`wake-${i + 1}`] = { from: WAKE_SOURCE, rate: 2 ** ((i * WAKE_STEP) / 12) };

// The beds: `len` seconds, the end faded over the start for `xfade` seconds
// so it loops. Each is one plain thing, with nothing in it to notice: a bed
// that has events in it (a door, a keyboard, a drive seeking) gets listened to.
// `from` and `start` cut it from a recording; `make` has ffmpeg make it (a
// lavfi source), for the tones no recording is plain enough for. `tone` is a
// filter over either. `curve` is tri where the two ends are the same sound
// (the city file is a loop played twice; the chip's hum is whole periods
// long), qsin where they aren't. `sprinkle` lays short stretches of another
// recording over it.
const noise = (colour) => `anoisesrc=c=${colour}:r=44100:seed=11[a];anoisesrc=c=${colour}:r=44100:seed=12[b];[a][b]amerge=inputs=2`;
const BEDS = {
  // the city from a long way off: the traffic's rumble, none of its detail
  'ambient-city': { from: 'city-background', len: 60, curve: 'tri', tone: 'lowpass=f=900,lowpass=f=900' },
  // the room: its air and nothing else
  'ambient-room': { make: noise('pink'), len: 30, tone: 'highpass=f=70,lowpass=f=450,lowpass=f=450' },
  // the chip: mains hum (100 Hz and two harmonics) under a faint high hiss
  'ambient-chip': {
    make:
      'sine=f=100:r=44100,volume=0.5[h1];sine=f=200:r=44100,volume=0.16[h2];sine=f=300:r=44100,volume=0.06[h3];' +
      'anoisesrc=c=pink:r=44100:a=0.04:seed=13,highpass=f=5000[hiss];[h1][h2][h3][hiss]amix=inputs=4:normalize=0',
    len: 40.96, // whole frames and whole periods of the hum, so the ends meet in phase
    curve: 'tri',
  },
  // the launch's two loops, on its own bus at an effect's level: the engines, and the water under them
  'launch-roar': { from: 'made/launch-roar', start: 1.5, len: 8, xfade: 2, lufs: -18 },
  'launch-deluge': { from: 'made/launch-deluge', start: 1.5, len: 8, xfade: 2, lufs: -20 },
  // Not a bed but made the same way: a little car's motor, the steady middle
  // of a desk's servo, looped; the site plays it faster and slower with the
  // car's speed. An effect, so at an effect's level (`lufs`, where a bed is -28).
  'car-engine': { from: 'Standing Desk Motor/Motor Servo Up And Down 04', start: 1.5, len: 3, xfade: 0.5, lufs: -18 },
};

// What the library has nothing for is made: described to ElevenLabs' sound
// generator, once, and kept in scripts/sound-kit/made/ (so it isn't made, or
// paid for, again; delete a file there to have it made anew, or put your own
// in its place). A pick names one as 'made/<name>'. It needs ELEVENLABS_API_KEY
// in .env.local, and is sent the description and nothing else.
const MADE = {
  'launch-release': { seconds: 1.5, say: 'Heavy steel launch clamps releasing a rocket: one deep, hard metallic clank with a short mechanical thud. Dry, close, no music.' },
  'launch-roar': { seconds: 14, say: 'Continuous roar of many large rocket engines at full thrust, heard from nearby: deep steady rumble with crackle, constant intensity from start to end, no fade in, no fade out, no music.' },
  'launch-deluge': { seconds: 14, say: 'Continuous heavy torrent of water from a launch pad deluge system: a dense rushing spray and hiss of water on steel, constant intensity, no fade in, no fade out, no music.' },
  // the audio tour's frame (scripts/voice-kit, which voice-tour.mjs plays round a recording): the handset starting a track, and ending it
  'voice-intro': { seconds: 1, say: 'Audio guide device start sound: a clear button press click followed by one short bright electronic confirmation tone. Clean and dry, clearly audible.' },
  'voice-outro': { seconds: 1, say: 'A museum audio guide handset ending a track: a single short soft low electronic tone, then one soft button click. Simple, clean, gentle, dry. Nothing else.' },
  // the reticle (FocusReticle) acquiring an exhibit as the camera goes in
  focus: { seconds: 1.5, say: 'A precision camera reticle calibrating and locking on to a target: a few quick fine servo adjustments and tiny focus ticks, a soft smooth zoom whirr rising, then one subtle lock-on click. Quiet, precise, modern, dry, no music, no beeps.' },
  // the game on the pad: flown in space, but heard the way a cockpit would carry it
  'game-shot': { seconds: 0.5, say: 'One shot from a spacecraft cannon heard from inside the cockpit: a short punchy thump with a brief hiss of gas. Realistic, dry, not a cartoon laser.' },
  'game-shot-2': { seconds: 0.5, say: 'One shot from a spacecraft cannon heard from inside the cockpit: a short hard thump with a brief metallic recoil. Realistic, dry, not a cartoon laser.' },
  'game-break-big': { seconds: 1.5, say: 'A large boulder cracking apart and crumbling into heavy chunks: a deep crack and tumbling rock debris. Realistic, dry, close.' },
  'game-break-mid': { seconds: 1, say: 'A medium rock splitting into pieces: a sharp crack and a short scatter of stones. Realistic, dry, close.' },
  'game-break-small': { seconds: 0.5, say: 'A small stone snapping and shattering into gravel: one short crisp crack. Realistic, dry, close.' },
  'game-shield': { seconds: 1, say: 'A spacecraft hull shield taking a hard hit: a heavy thud on metal with a short electrical crackle and stressed metal ring. Realistic, dry.' },
  'game-crash': { seconds: 2, say: 'A spacecraft colliding with a rock: one heavy low impact with crunching, tearing metal, then systems powering down. Realistic, dry, no music.' },
  'game-stage': { seconds: 1, say: 'Mission control radio confirmation: two short clean rising electronic beeps heard over a radio headset, slightly band-limited. Realistic, no voice.' },
  'comms-open': { seconds: 0.5, say: 'A two-way radio channel opening: one short squelch burst of static with a click. Realistic, dry, no voice.' },
  'comms-close': { seconds: 0.5, say: 'A two-way radio channel closing: a click and a very short tail of static cutting off. Realistic, dry, no voice.' },
  'comms-type': { seconds: 0.5, say: 'A single tiny soft teleprinter tick, one character printing. Very short, dry, quiet.' },
};
/** The audio tour's two bookends, written as WAVs into scripts/voice-kit. */
const KIT = {
  intro: { from: 'made/voice-intro', fadeOut: 0.05 },
  outro: { from: 'made/voice-outro', fadeOut: 0.08 },
};

/* ---------- the library ---------- */

const library = new Map();
(function walk(dir, rel) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(join(dir, e.name), rel ? `${rel}/${e.name}` : e.name);
    else if (/\.wav$/i.test(e.name)) {
      // "UIClick_CLICK-Keyboard Click 01_Ocular_Vector.wav" is "Keyboard Click 01"
      const plain = e.name.replace(/\.wav$/i, '').replace(/^[A-Za-z]+_[A-Z ]+-/, '').replace(/_Ocul.*$/, '').replace(/\s+/g, ' ').trim();
      library.set(rel ? `${rel}/${plain}` : plain, join(dir, e.name));
    }
  }
})(lib, '');

function source(name) {
  const file = library.get(name);
  if (!file) throw new Error(name.startsWith('made/') ? `not made yet: ${name} (it needs ELEVENLABS_API_KEY in .env.local)` : `not in the library: ${name}`);
  return file;
}

/** The made ones: those already kept, and, with a key, the ones that aren't yet. */
async function makeMissing() {
  const key = [...(existsSync(join(ROOT, '.env.local')) ? readFileSync(join(ROOT, '.env.local'), 'utf8') : '').matchAll(/^\s*ELEVENLABS_API_KEY\s*=\s*"?([^"\r\n]*)"?\s*$/gm)].pop()?.[1] ?? process.env.ELEVENLABS_API_KEY;
  for (const [name, m] of Object.entries(MADE)) {
    const file = join(MADE_DIR, `${name}.mp3`);
    if (!existsSync(file)) {
      if (!key) continue;
      const r = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
        method: 'POST',
        headers: { 'xi-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({ text: m.say, duration_seconds: m.seconds, prompt_influence: 0.5 }),
      });
      if (!r.ok) {
        // (the key is never printed)
        console.error(`ElevenLabs didn't make ${name} (${r.status}: ${(await r.text()).slice(0, 200)})`);
        continue;
      }
      mkdirSync(MADE_DIR, { recursive: true });
      writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      console.log(`  made ${name} (${m.seconds} s)`);
    }
    library.set(`made/${name}`, file);
  }
}
await makeMissing();

/* ---------- ffmpeg ---------- */

const TMP = mkdtempSync(join(tmpdir(), 'sounds-'));
let made = 0;
const temp = (ext = 'wav') => join(TMP, `${made++}.${ext}`);

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-y', ...args.map(String)], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error((r.stderr ?? String(r.error)).trim().split('\n').slice(-4).join('\n'));
  return r.stderr;
}
// (astats, not volumedetect: that one reads 16-bit, so a mix that runs over full scale would measure as exactly full)
const peakOf = (file) => Number([...ffmpeg(['-i', file, '-af', 'astats=measure_perchannel=none:measure_overall=Peak_level', '-f', 'null', '-']).matchAll(/Peak level dB: (-?[\d.]+)/g)].pop()?.[1]);
const loudnessOf = (file) => Number([...ffmpeg(['-i', file, '-af', 'ebur128', '-f', 'null', '-']).matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop()?.[1]);
const FLOAT = ['-c:a', 'pcm_f32le'];
const BARE = ['-map_metadata', '-1', '-fflags', '+bitexact'];

/* ---------- an effect ---------- */

const SILENCE = 'silenceremove=start_periods=1:start_threshold=-48dB:detection=peak';

/** One layer on its own: mono, trimmed, cut, pitched, faded. Returns the file and its peak. */
function layer(l) {
  const f = ['aresample=48000', 'aformat=channel_layouts=mono', SILENCE, 'areverse', SILENCE, 'areverse'];
  if (l.start || l.dur) f.push(`atrim=start=${l.start ?? 0}${l.dur ? `:duration=${l.dur}` : ''}`, 'asetpts=PTS-STARTPTS');
  if (l.rate && l.rate !== 1) f.push(`asetrate=${Math.round(48000 * l.rate)}`, 'aresample=48000');
  if (l.reverse) f.push('areverse');
  // a hair of fade at each end, so a cut never clicks
  f.push('afade=t=in:d=0.002', 'areverse', `afade=t=in:d=${l.fadeOut ?? 0.012}`, 'areverse');
  const file = temp();
  ffmpeg(['-i', source(l.from), '-af', f.join(','), ...FLOAT, file]);
  const peak = peakOf(file);
  if (!Number.isFinite(peak) || peak < -80) throw new Error(`nothing left of ${l.from}`);
  return { file, peak };
}

/** Layers into one sound at `OUT/<file>.<wav|mp3>` (or, given `dir`, a WAV there whatever its size). */
function effect(file, layers, dir) {
  const parts = layers.map((l) => ({ ...l, ...layer(l) }));
  // each layer brought to the same peak, then set against the others
  const graph =
    parts.map((p, i) => `[${i}:a]volume=${(-p.peak + (p.gain ?? 0)).toFixed(2)}dB,adelay=${Math.round((p.at ?? 0) * 1000)}:all=1[l${i}]`).join(';') +
    ';' +
    parts.map((_, i) => `[l${i}]`).join('') +
    (parts.length > 1 ? `amix=inputs=${parts.length}:normalize=0:duration=longest[m]` : 'anull[m]');
  const mix = temp();
  ffmpeg([...parts.flatMap((p) => ['-i', p.file]), '-filter_complex', graph, '-map', '[m]', ...FLOAT, mix]);
  const wav = temp();
  ffmpeg(['-i', mix, '-af', `volume=${(-6 - peakOf(mix)).toFixed(2)}dB,aresample=44100`, ...BARE, '-c:a', 'pcm_s16le', wav]);
  const size = statSync(wav).size;
  if (dir || size <= 30 * 1024) {
    copyFileSync(wav, join(dir ?? OUT, `${file}.wav`));
    return { ext: 'wav', kb: size / 1024, s: (size - 44) / 88200 };
  }
  const mp3 = join(OUT, `${file}.mp3`);
  ffmpeg(['-i', wav, ...BARE, '-c:a', 'libmp3lame', '-b:a', '64k', mp3]);
  return { ext: 'mp3', kb: statSync(mp3).size / 1024, s: (size - 44) / 88200 };
}

/* ---------- a bed ---------- */

function bed(file, b) {
  const { from, make, tone, start = 0, len: seconds, xfade = 3, curve = 'qsin', repeat = 1, sprinkle = [] } = b;
  // Counted in samples, and the length rounded to whole AAC frames (1024
  // samples): a last frame that's only part full is padded with silence, and
  // that silence would be a hole in the loop every time round.
  const len = Math.round((seconds * 44100) / 1024) * 1024;
  const X = Math.round(xfade * 44100);
  const cut = (a, z, label) => `atrim=start_sample=${a}:end_sample=${z},asetpts=PTS-STARTPTS[${label}]`;
  const loop = temp();
  ffmpeg([
    ...(make ? ['-f', 'lavfi', '-t', seconds + xfade + 1, '-i', make] : ['-ss', start, '-t', seconds + xfade + 1, '-i', source(from)]),
    '-filter_complex',
    `[0:a]aresample=44100,aformat=channel_layouts=stereo${tone ? `,${tone}` : ''},asplit=3[a][b][c];[a]${cut(0, X, 'head')};[b]${cut(X, len, 'body')};[c]${cut(len, len + X, 'tail')};` +
      `[tail][head]acrossfade=ns=${X}:c1=${curve}:c2=${curve}[blend];[body][blend]concat=n=2:v=0:a=1[o]`,
    '-map', '[o]', ...FLOAT, loop,
  ]);
  const base = loudnessOf(loop);
  const over = sprinkle.map((s) => {
    const f = temp();
    ffmpeg(['-ss', s.start, '-t', s.dur, '-i', source(s.from), '-af', 'aresample=44100,aformat=channel_layouts=stereo,afade=t=in:d=0.15,areverse,afade=t=in:d=0.3,areverse', ...FLOAT, f]);
    // set against the bed's own level, so `gain` means "this much over (or under) it"
    return { ...s, file: f, lift: base - 14 - loudnessOf(f) + (s.gain ?? 0) };
  });
  const mix = temp();
  ffmpeg([
    '-stream_loop', repeat - 1, '-i', loop,
    ...over.flatMap((s) => ['-i', s.file]),
    '-filter_complex',
    over.map((s, i) => `[${i + 1}:a]volume=${s.lift.toFixed(2)}dB,adelay=${Math.round(s.at * 1000)}:all=1[s${i}]`).join(';') +
      (over.length ? ';' : '') +
      `[0:a]${over.map((_, i) => `[s${i}]`).join('')}amix=inputs=${over.length + 1}:normalize=0:duration=first[m]`,
    '-map', '[m]', ...FLOAT, mix,
  ]);
  const out = join(OUT, `${file}.m4a`);
  ffmpeg(['-i', mix, '-af', `volume=${((b.lufs ?? -28) - loudnessOf(mix)).toFixed(2)}dB`, ...BARE, '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-movie_timescale', 44100, out]);
  return { ext: 'm4a', kb: statSync(out).size / 1024, s: (len * repeat) / 44100 };
}

/* ---------- all of them ---------- */

const wanted = (name) => !only.length || only.some((o) => name.startsWith(o));
const asLayers = (pick) => (Array.isArray(pick) ? pick : [pick]).map((l) => (typeof l === 'string' ? { from: l } : l));
/** Take an event's earlier files away (select.wav, select.2.mp3…), whatever their format. */
function clear(name) {
  for (const f of readdirSync(OUT)) if (f !== 'README.md' && f.split('.')[0] === name) rmSync(join(OUT, f));
}
const report = (file, r) => console.log(`  ${file.padEnd(20)} ${r.ext}  ${r.s.toFixed(2).padStart(6)} s  ${r.kb.toFixed(0).padStart(4)} KB`);

mkdirSync(OUT, { recursive: true });
let count = 0;
const failed = [];
try {
  for (const [name, pick] of Object.entries(PICKS)) {
    if (!wanted(name)) continue;
    const takes = pick?.variants ?? [pick];
    try {
      clear(name);
      takes.forEach((take, i) => {
        const file = i ? `${name}.${i + 1}` : name;
        report(file, effect(file, asLayers(take)));
        count++;
      });
    } catch (e) {
      failed.push(`${name}: ${e.message}`);
    }
  }
  for (const [name, pick] of Object.entries(KIT)) {
    if (!wanted(`voice-${name}`)) continue;
    try {
      report(`voice-kit/${name}`, effect(name, asLayers(pick), VOICE_KIT));
      count++;
    } catch (e) {
      failed.push(`voice-kit/${name}: ${e.message}`);
    }
  }
  for (const [name, b] of Object.entries(BEDS)) {
    if (!wanted(name)) continue;
    try {
      clear(name);
      report(name, bed(name, b));
      count++;
    } catch (e) {
      failed.push(`${name}: ${e.message}`);
    }
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(`\n${count} sound${count === 1 ? '' : 's'} made.`);
if (failed.length) {
  console.log(`\nDidn't make:\n  ${failed.join('\n  ')}`);
  process.exitCode = 1;
}
