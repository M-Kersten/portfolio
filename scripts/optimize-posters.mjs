// Shrink the project posters to what they can actually display at.
//
// Cards render posters at ~250 CSS px wide and the focus dialog at ~760, so
// anything past ~1024px (retina headroom included) is dead weight — camera
// originals easily weigh 1-2MB each. Run this after dropping new posters in:
//
//   npm run posters
//
// It resizes anything wider than MAX_W down (never up), strips metadata and
// recompresses in place. Already-small files it leaves alone.
import { readdirSync, statSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const DIR = new URL('../public/posters', import.meta.url).pathname;
const MAX_W = 1024;
const QUALITY = 78;

let saved = 0;
for (const file of readdirSync(DIR).sort()) {
  if (!/\.(jpe?g|png)$/i.test(file)) continue;
  const path = join(DIR, file);
  const before = statSync(path).size;
  const img = sharp(path).rotate(); // bake EXIF orientation before stripping it
  const meta = await img.metadata();
  const isJpeg = /\.jpe?g$/i.test(file);
  const out = img
    .resize({ width: MAX_W, withoutEnlargement: true })
    [isJpeg ? 'jpeg' : 'png']({ quality: QUALITY, mozjpeg: isJpeg });
  const tmp = path + '.tmp';
  await out.toFile(tmp);
  const after = statSync(tmp).size;
  if (after < before * 0.92) {
    renameSync(tmp, path);
    saved += before - after;
    console.log(`  ${file}: ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB (${meta.width}→≤${MAX_W}px)`);
  } else {
    // Not meaningfully smaller (already optimised) — keep the original bytes.
    renameSync(tmp, path + '.skip');
    const { unlinkSync } = await import('node:fs');
    unlinkSync(path + '.skip');
    console.log(`  ${file}: already tight (${(before / 1024).toFixed(0)}KB), kept as-is`);
  }
}
console.log(`Saved ${(saved / 1024 / 1024).toFixed(2)}MB total.`);
