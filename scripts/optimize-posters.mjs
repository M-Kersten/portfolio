// Shrink the site's photographs to what they can actually display at.
//
// Cards render posters at ~250 CSS px wide and the focus dialog at ~760, so
// anything past ~1024px (retina headroom included) is dead weight — camera
// originals easily weigh 1-2MB each. A gallery frame opens full-screen, so it
// gets a larger ceiling, but the same treatment. Run this after dropping new
// images in:
//
//   npm run posters
//
// It resizes anything wider than the folder's ceiling down (never up), strips
// metadata and recompresses in place. Already-small files it leaves alone.
//
// Galleries are the reason this matters more than it used to: a picture-led
// project ships a dozen frames at once, and a dozen unprocessed camera files is
// twenty megabytes on a page that used to cost one.
import { readdirSync, statSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const PUBLIC = new URL('../public', import.meta.url).pathname;
const QUALITY = 78;

/** Every folder of photographs, with the width each one is ever displayed at.
 *  Gallery frames get more because the lightbox fills the viewport. */
function targets() {
  const out = [{ dir: join(PUBLIC, 'posters'), maxW: 1024, label: 'posters' }];
  const galleries = join(PUBLIC, 'gallery');
  if (existsSync(galleries))
    for (const slug of readdirSync(galleries).sort()) {
      const dir = join(galleries, slug);
      if (statSync(dir).isDirectory()) out.push({ dir, maxW: 1800, label: `gallery/${slug}` });
    }
  return out;
}

let saved = 0;
let touched = 0;
for (const { dir, maxW, label } of targets()) {
  if (!existsSync(dir)) continue;
  const files = readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
  if (files.length === 0) continue;
  console.log(`${label} (≤${maxW}px)`);
  for (const file of files) {
    const path = join(dir, file);
    const before = statSync(path).size;
    const img = sharp(path).rotate(); // bake EXIF orientation before stripping it
    const meta = await img.metadata();
    const isJpeg = /\.jpe?g$/i.test(file);
    const out = img
      .resize({ width: maxW, withoutEnlargement: true })
      [isJpeg ? 'jpeg' : 'png']({ quality: QUALITY, mozjpeg: isJpeg });
    const tmp = path + '.tmp';
    await out.toFile(tmp);
    const after = statSync(tmp).size;
    if (after < before * 0.92) {
      renameSync(tmp, path);
      saved += before - after;
      touched++;
      console.log(`  ${file}: ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB (${meta.width}→≤${maxW}px)`);
    } else {
      // Not meaningfully smaller (already optimised) — keep the original bytes.
      unlinkSync(tmp);
      console.log(`  ${file}: already tight (${(before / 1024).toFixed(0)}KB), kept as-is`);
    }
  }
}
console.log(`Saved ${(saved / 1024 / 1024).toFixed(2)}MB across ${touched} file${touched === 1 ? '' : 's'}.`);
