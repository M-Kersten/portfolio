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
// to 3 kHz, the low end well gone), evened out so quiet words don't drop away,
// then made lo-fi rather than gritty: the slow wow and quick flutter of a tape
// that doesn't run true, a low sample rate, a breath of hiss under the voice.
// It sits a little way off, in the speaker's own small box, at a steady level.
// It needs ffmpeg on the path.
//
// Each one is then framed the way a guide's handset plays a stop: the click of
// the mechanism starting (scripts/voice-kit/intro.wav), the announcer saying
// which stop this is ("Exhibit 3. ARCam."), the recording, and the mechanism
// stopping (outro.wav). The announcer is the computer's own female voice
// (Windows: Microsoft Zira; macOS: Samantha), made on the spot, nothing sent
// anywhere; where there's neither, the frame has no announcer. SAY below is
// how she's to pronounce a name she'd otherwise get wrong.
//
//   npm run voice -- --frame            frame the ones already in src/assets/voice
//   npm run voice -- <folder> --bare    no frame
//
// A framed file is marked as one (its comment tag), so framing twice does nothing.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadExhibits } from './exhibits.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'src/assets/voice');
const KIT = join(ROOT, 'scripts/voice-kit');
const args = process.argv.slice(2);
const plain = args.includes('--plain');
const bare = args.includes('--bare');
const frameOnly = args.includes('--frame');
const dir = args.find((a) => !a.startsWith('--'));
if (!frameOnly && (!dir || !existsSync(dir))) {
  console.error('Give the folder with the recordings: npm run voice -- ~/Downloads/project-recordings\n(or --frame, to frame the ones already in src/assets/voice)');
  process.exit(1);
}

/* ---------- the frame ---------- */

/** How the announcer says a project's name, where its title would come out wrong. */
const SAY = {
  arcam: 'A R Cam',
  'zwijsen-ar-books': 'Zwy-sen A R books',
  'virtuele-brigade': 'Veer-too-ay-luh Brigade',
  'alliander-hololens': 'Alliander HoloLens suite',
  'dtt-amsterdam': 'D T T projects',
  'philips-medical-xr': 'Philips medical X R and A I',
  'amsterdam-ai': 'Amsterdam A I guides',
  'custom-ar-framework': 'Custom A R framework',
  'next-launch': 'The next launch',
};
// the announcer through the same small speaker, but clean: she's the device, not a tape
const ANNOUNCER = 'highpass=f=300,lowpass=f=3400,acompressor=threshold=-22dB:ratio=3:attack=5:release=120:makeup=4,equalizer=f=1700:t=q:w=1.0:g=2,loudnorm=I=-19:TP=-2:LRA=6,aresample=44100';
const FRAMED = 'framed';
const TMP = mkdtempSync(join(tmpdir(), 'voice-'));
const exhibits = loadExhibits(ROOT);

/** The announcer's line as a WAV, or null where this computer has no voice for it. */
function announce(slug, title) {
  const no = slug === 'next-launch' ? 11 : Number(exhibits.no(slug));
  const text = `${no ? `Exhibit ${no}. ` : ''}${SAY[slug] ?? title}.`;
  const wav = join(TMP, `${slug}-say.wav`);
  const env = { ...process.env, SAY_TEXT: text, SAY_OUT: wav };
  const r =
    process.platform === 'win32'
      ? spawnSync(
          'powershell',
          ['-NoProfile', '-Command', "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SelectVoiceByHints('Female'); $s.Rate = -1; $s.SetOutputToWaveFile($env:SAY_OUT); $s.Speak($env:SAY_TEXT); $s.Dispose()"],
          { env },
        )
      : process.platform === 'darwin'
        ? spawnSync('say', ['-v', 'Samantha', '-o', wav, '--data-format=LEI16@44100', text])
        : { status: 1 };
  return r.status === 0 && existsSync(wav) ? { wav, text } : null;
}

const isFramed = (file) => spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags=comment', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim() === FRAMED;

/** intro, announcer, the recording, outro: `voice` (any audio file) to `out` (an MP3). */
function frame(slug, title, voice, out) {
  const said = announce(slug, title);
  const mono = 'aresample=44100,aformat=channel_layouts=mono';
  const parts = [
    { file: join(KIT, 'intro.wav'), chain: `${mono},volume=-8dB,apad=pad_dur=0.3` },
    // (the silence the voice leaves after her last word comes off, so the pause is the one set here)
    ...(said ? [{ file: said.wav, chain: `${mono},areverse,silenceremove=start_periods=1:start_threshold=-50dB:detection=peak,areverse,${ANNOUNCER},apad=pad_dur=0.45` }] : []),
    // (and most of a recording's own run-in: a quarter second of the tape's hiss, then the voice)
    { file: voice, chain: `${mono},silenceremove=start_periods=1:start_threshold=-35dB:start_silence=0.25:detection=peak,apad=pad_dur=0.2` },
    { file: join(KIT, 'outro.wav'), chain: `${mono},volume=-8dB` },
  ];
  const graph = parts.map((p, i) => `[${i}:a]${p.chain}[p${i}]`).join(';') + ';' + parts.map((_, i) => `[p${i}]`).join('') + `concat=n=${parts.length}:v=0:a=1[out]`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...parts.flatMap((p) => ['-i', p.file]), '-filter_complex', graph, '-map', '[out]', '-metadata', `comment=${FRAMED}`, '-c:a', 'libmp3lame', '-b:a', '80k', out]);
  return said?.text ?? '(no announcer on this computer)';
}

if (frameOnly) {
  let n = 0;
  for (const file of readdirSync(OUT).sort()) {
    if (!/\.(mp3|m4a|ogg|webm)$/i.test(file)) continue;
    const slug = basename(file, extname(file));
    const at = join(OUT, file);
    if (isFramed(at)) {
      console.log(`${file}: framed already`);
      continue;
    }
    const title = exhibits.cases.find((c) => c.slug === slug)?.title ?? slug;
    const next = join(TMP, `${slug}.mp3`);
    const said = frame(slug, title, at, next);
    rmSync(at);
    renameSync(next, join(OUT, `${slug}.mp3`));
    console.log(`${file}: ${said}`);
    n++;
  }
  rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${n} framed.`);
  process.exit(0);
}

// (the voice, then a breath of hiss under it, then levelled)
const GUIDE =
  '[0:a]' +
  [
    'highpass=f=480',
    'highpass=f=480',
    'lowpass=f=3000',
    'acompressor=threshold=-24dB:ratio=4:attack=5:release=120:makeup=6',
    'asoftclip=type=tanh:threshold=0.85', // only a touch of grit
    'vibrato=f=0.6:d=0.07', // wow: a tape that doesn't quite run true
    'vibrato=f=5.5:d=0.02', // and flutter
    'aresample=11025', // a low sample rate, and back
    'aresample=44100',
    'equalizer=f=1700:t=q:w=1.0:g=3', // the honk of a small speaker
    'aecho=0.85:0.5:21|43:0.2|0.1', // a little way off: the speaker's own small box
    'lowpass=f=3200',
  ].join(',') +
  '[voice];anoisesrc=c=pink:a=0.006:r=44100,highpass=f=900,lowpass=f=4500[hiss];' +
  '[voice][hiss]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-18:TP=-2:LRA=6,aresample=44100,apad=pad_dur=0.25[out]';
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
  const sound = ['-v', 'error', '-y', '-i', join(dir, file), '-vn', '-ac', '1', '-ar', '44100', ...(plain ? ['-af', PLAIN] : ['-filter_complex', GUIDE, '-map', '[out]'])];
  let said = '';
  if (bare) execFileSync('ffmpeg', [...sound, '-c:a', 'libmp3lame', '-b:a', '80k', out]);
  else {
    // (uncompressed until it's framed, so the voice is only ever made an MP3 once)
    const voice = join(TMP, `${slug}.wav`);
    execFileSync('ffmpeg', [...sound, '-c:a', 'pcm_s16le', voice]);
    said = `: ${frame(slug, cases.find((c) => c.slug === slug)?.title ?? slug, voice, out)}`;
  }
  console.log(`${file} → src/assets/voice/${slug}.mp3${said}`);
  done++;
}
rmSync(TMP, { recursive: true, force: true });
console.log(`\n${done} recording${done === 1 ? '' : 's'} in the audio tour${plain ? ' (plain)' : ''}.`);
if (unmatched.length) console.log(`No project for: ${unmatched.join(', ')}\nName a recording after its project's title or slug.`);
