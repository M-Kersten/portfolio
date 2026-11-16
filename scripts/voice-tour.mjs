// The audio tour: your recordings, made to sound the way a museum's audio
// guide does, through a small earpiece or a phone held to the ear.
//
//   npm run voice -- <folder with recordings>           all of them
//   npm run voice -- <folder> --plain                   no effect, just tidied
//
// Name each recording after its project: the slug (arcam.m4a), or the title
// (ARCam.wav, "Lightship Drive.mp3"). `next-launch` is exhibit 11's. Anything
// ffmpeg reads will do. Each comes out as src/assets/voice/<slug>.mp3, mono,
// which is where the site looks for a project's audio tour.
//
// The effect, in order: the narrow band a small speaker carries (about 500 Hz
// to 3 kHz, the low end well gone), squeezed hard so quiet words don't drop
// away, driven into the grit a cheap amplifier and line add, set a little way
// off in the speaker's own small box, and brought back up to a steady level.
// It needs ffmpeg on the path.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'src/assets/voice');
const args = process.argv.slice(2);
const plain = args.includes('--plain');
const dir = args.find((a) => !a.startsWith('--'));
if (!dir || !existsSync(dir)) {
  console.error('Give the folder with the recordings: npm run voice -- ~/Downloads/project-recordings');
  process.exit(1);
}

const GUIDE = [
  'highpass=f=520', // twice over, so the low end really goes
  'highpass=f=520',
  'lowpass=f=3000',
  'acompressor=threshold=-26dB:ratio=6:attack=4:release=110:makeup=8',
  'volume=7dB', // pushed into the clip: the grit
  'asoftclip=type=tanh:threshold=0.55',
  'acrusher=bits=9:mode=log:mix=0.22:samples=2', // the coarseness of a cheap line
  'equalizer=f=1900:t=q:w=1.1:g=4', // the honk of a small speaker
  'aecho=0.85:0.5:21|43:0.22|0.12', // a little way off: the speaker's own small box
  'highpass=f=420',
  'lowpass=f=3200',
  'loudnorm=I=-18:TP=-2:LRA=6',
  'aresample=44100',
  'apad=pad_dur=0.25',
].join(',');
const PLAIN = 'highpass=f=80,loudnorm=I=-18:TP=-2:LRA=9,aresample=44100,apad=pad_dur=0.25';

const cases = JSON.parse(readFileSync(join(ROOT, 'src/content/cases.json'), 'utf8'));
const key = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
const known = new Map([['nextlaunch', 'next-launch']]);
for (const c of cases) {
  known.set(key(c.slug), c.slug);
  known.set(key(c.title), c.slug);
}

mkdirSync(OUT, { recursive: true });
let done = 0;
const unmatched = [];
for (const file of readdirSync(dir).sort()) {
  if (!/\.(mp3|m4a|aac|wav|aif|aiff|flac|ogg|opus|webm|mp4|mov|caf|amr|3gp)$/i.test(file)) continue;
  const name = key(basename(file, extname(file)));
  // its own name, or the project whose name it starts with ("arcam take 2")
  const slug = known.get(name) ?? [...known].filter(([k]) => name.startsWith(k) || k.startsWith(name)).sort((a, b) => b[0].length - a[0].length)[0]?.[1];
  if (!slug) {
    unmatched.push(file);
    continue;
  }
  const out = join(OUT, `${slug}.mp3`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(dir, file), '-vn', '-ac', '1', '-ar', '44100', '-af', plain ? PLAIN : GUIDE, '-c:a', 'libmp3lame', '-b:a', '80k', out]);
  console.log(`${file} → src/assets/voice/${slug}.mp3`);
  done++;
}
console.log(`\n${done} recording${done === 1 ? '' : 's'} in the audio tour${plain ? ' (plain)' : ''}.`);
if (unmatched.length) console.log(`No project for: ${unmatched.join(', ')}\nName a recording after its project's title or slug.`);
