// A project's pictures: the ones that float behind its story when it's opened
// from the chronology, the collection or search (components/exhibit/Story.tsx).
//
// A project with pictures of its own shows those (its gallery, and anything
// dropped into src/assets/stills/<slug>/). Most have only their film, so this
// takes three frames from it: the ones YouTube keeps for every video, from
// about a quarter, a half and three quarters of the way through. Each is
// trimmed of the black bars a cinema-format film carries, sized for the page
// and saved as src/assets/stills/<slug>/1.jpg … 3.jpg.
//
//   npm run stills              every project that has a film and no stills yet
//   npm run stills -- arcam     only that project
//   npm run stills -- --force   fetch again, over what's there
//
// A folder that already holds pictures is left alone, so a frame swapped for a
// better picture stays swapped, and one deleted stays gone. A project with a
// gallery has pictures already and gets none. Empty frames (a fade to black, a
// blank title card) are skipped, and so are the ones listed in LEAVE_OUT
// below. Look at what a run brings in before committing it: a frame is
// whatever was on screen at that moment, and a film can show people and
// things that have nothing to do with the work. It needs the network
// (i.ytimg.com); behind a proxy, run it with NODE_USE_ENV_PROXY=1.
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'src/assets/stills');
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

const WIDTH = 800; // shown at up to ~270 CSS px, twice that on a dense screen, and a little more when it comes forward
const QUALITY = 74;
const IMAGE = /\.(jpe?g|png|webp)$/i;

/** Frames that aren't about the work, by project and number, so a later run
 *  doesn't bring them back. */
const LEAVE_OUT = {
  'alliander-hololens': [3], // the announcement card of the event the film was made for, with its speakers
  'philips-medical-xr': [1, 2], // the hosts and the speaker of the webinar the film is a recording of
  'custom-ar-framework': [1], // the demo app's title card
  'dtt-amsterdam': [3], // the AR framework's demo, which has an entry of its own
  kastwezens: [3], // a title card
  'amsterdam-underground': [3], // the end card
  preekstof: [3], // caught mid-fade
};

/** The 11-char video id (as lib/youtube.ts reads it). */
const youtubeId = (url) => url?.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/)?.[1] ?? null;

/** A frame, at the best size YouTube has it in. */
async function frame(id, n) {
  for (const size of ['maxres', 'sd', 'hq']) {
    const res = await fetch(`https://i.ytimg.com/vi/${id}/${size}${n}.jpg`, { headers: { 'user-agent': 'stills-fetch' } });
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    // (a video with no frame at that size answers with a tiny grey placeholder)
    const meta = await sharp(buf).metadata();
    if ((meta.width ?? 0) >= 320) return buf;
  }
  return null;
}

/** The picture inside its black bars: how much to take off each side. A side
 *  is only trimmed if what comes off is properly black all the way along it,
 *  and never by more than a quarter. */
async function bars(buf) {
  const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const dark = (mean, peak) => mean < 14 && peak < 60;
  const row = (y) => {
    let sum = 0;
    let peak = 0;
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x];
      sum += v;
      if (v > peak) peak = v;
    }
    return dark(sum / w, peak);
  };
  const col = (x) => {
    let sum = 0;
    let peak = 0;
    for (let y = 0; y < h; y++) {
      const v = data[y * w + x];
      sum += v;
      if (v > peak) peak = v;
    }
    return dark(sum / h, peak);
  };
  const run = (test, len, from, step) => {
    let n = 0;
    while (n < len * 0.25 && test(from + n * step)) n++;
    return n >= len * 0.02 ? n + 2 : 0; // (a couple of pixels more: the bar's edge is soft)
  };
  return { top: run(row, h, 0, 1), bottom: run(row, h, h - 1, -1), left: run(col, w, 0, 1), right: run(col, w, w - 1, -1), w, h };
}

async function still(buf) {
  const b = await bars(buf);
  const box = { left: b.left, top: b.top, width: b.w - b.left - b.right, height: b.h - b.top - b.bottom };
  const cut = sharp(buf).extract(box);
  // nothing to look at: a fade to black, a flat title card
  const stats = await cut.clone().greyscale().stats();
  const { mean, stdev } = stats.channels[0];
  if (mean < 16 || stdev < 12) return null;
  return cut.resize({ width: WIDTH, withoutEnlargement: true }).jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
}

const cases = JSON.parse(readFileSync(join(ROOT, 'src/content/cases.json'), 'utf8'));
let saved = 0;
for (const c of cases) {
  if (only.length && !only.includes(c.slug)) continue;
  const id = youtubeId(c.video);
  if (!id) {
    if (only.length) console.log(`${c.slug}: no film`);
    continue;
  }
  if (c.gallery?.length) {
    console.log(`${c.slug}: has a gallery`);
    continue;
  }
  const dir = join(OUT, c.slug);
  if (!force && existsSync(dir) && readdirSync(dir).some((f) => IMAGE.test(f))) {
    console.log(`${c.slug}: has pictures already`);
    continue;
  }
  const kept = [];
  for (const n of [1, 2, 3]) {
    if (LEAVE_OUT[c.slug]?.includes(n)) continue;
    try {
      const buf = await frame(id, n);
      const out = buf && (await still(buf));
      if (!out) continue;
      mkdirSync(dir, { recursive: true });
      await sharp(out).toFile(join(dir, `${n}.jpg`));
      kept.push(`${n}.jpg ${Math.round(out.length / 1024)} kB`);
      saved++;
    } catch (err) {
      console.log(`${c.slug}: frame ${n} failed (${err.message})`);
    }
  }
  console.log(`${c.slug}: ${kept.length ? kept.join(', ') : 'no usable frames'}`);
}
console.log(`\n${saved} still${saved === 1 ? '' : 's'} saved to src/assets/stills/`);
