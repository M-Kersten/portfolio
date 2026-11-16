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
// The effect, in order: the band a small speaker carries (300 Hz to 3.4 kHz),
// evened out so quiet words don't drop away, a little of the grit a cheap
// amplifier adds, brought back up to a steady level, with a breath of silence
// at each end. It needs ffmpeg on the path.
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
  'highpass=f=300',
  'lowpass=f=3400',
  'acompressor=threshold=-24dB:ratio=4:attack=5:release=120:makeup=6',
  'asoftclip=type=tanh:threshold=0.8', // the grit
  'equalizer=f=1800:t=q:w=1.2:g=3', // the honk of a small speaker
  'loudnorm=I=-18:TP=-2:LRA=7',
  'aresample=44100',
  'adelay=150:all=1',
  'apad=pad_dur=0.25',
].join(',');
const PLAIN = 'highpass=f=80,loudnorm=I=-18:TP=-2:LRA=9,aresample=44100,adelay=150:all=1,apad=pad_dur=0.25';

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
