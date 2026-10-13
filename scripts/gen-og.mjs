// The share previews: one 1200×630 card per project, in public/og/<slug>.jpg,
// for when someone posts a /work/<slug> link. The project's poster, full
// bleed, under its exhibit number ("Exhibit 02 · Merijn Kersten", or "From
// the collection"), its title and what it achieved, in the site's own type and
// the layer's colour. scripts/gen-pages.mjs points each project's page at its
// card. Run this after a poster or a title changes, and commit the results:
//
//   npm run og
//
// It draws the cards in a browser, so it needs one: it uses the Chrome you
// have installed, or the one at CHROME_PATH.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { loadExhibits } from './exhibits.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public/og');
mkdirSync(out, { recursive: true });
const { cases, no } = loadExhibits(root);

const COLOR = { city: '#27e8f2', room: '#ff9068', chip: '#a9f75c' };
const font = (pkg, file) => `data:font/woff2;base64,${readFileSync(join(root, 'node_modules', pkg, 'files', file)).toString('base64')}`;
const FONTS = `
@font-face { font-family: Oxanium; src: url(${font('@fontsource-variable/oxanium', 'oxanium-latin-wght-normal.woff2')}) format('woff2'); font-weight: 200 800; }
@font-face { font-family: Grotesk; src: url(${font('@fontsource/space-grotesk', 'space-grotesk-latin-400-normal.woff2')}) format('woff2'); }
@font-face { font-family: Mono; src: url(${font('@fontsource/space-mono', 'space-mono-latin-400-normal.woff2')}) format('woff2'); }
@font-face { font-family: Mono; src: url(${font('@fontsource/space-mono', 'space-mono-latin-700-normal.woff2')}) format('woff2'); font-weight: 700; }`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function card(c) {
  const n = no(c.slug);
  const accent = COLOR[c.layer] ?? COLOR.city;
  const poster = join(root, 'public/posters', `${c.slug}.jpg`);
  const bg = existsSync(poster) ? `url(data:image/jpeg;base64,${readFileSync(poster).toString('base64')})` : 'none';
  const kicker = n ? `<b>Exhibit ${n}</b> · Merijn Kersten` : `From the collection · Merijn Kersten`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; background: #0a0d10; color: #eaeaea; }
  .bg { position: absolute; inset: 0; background: ${bg} center / cover; filter: saturate(0.9); }
  .shade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(10,13,16,.97) 0%, rgba(10,13,16,.82) 34%, rgba(10,13,16,.25) 70%, rgba(10,13,16,.05) 100%); }
  .frame i { position: absolute; width: 34px; height: 34px; border: 0 solid ${accent}; }
  .frame i:nth-child(1) { top: 28px; left: 28px; border-top-width: 3px; border-left-width: 3px; }
  .frame i:nth-child(2) { top: 28px; right: 28px; border-top-width: 3px; border-right-width: 3px; }
  .frame i:nth-child(3) { bottom: 28px; left: 28px; border-bottom-width: 3px; border-left-width: 3px; }
  .frame i:nth-child(4) { bottom: 28px; right: 28px; border-bottom-width: 3px; border-right-width: 3px; }
  .text { position: absolute; left: 72px; right: 72px; bottom: 68px; display: grid; gap: 16px; }
  .kicker { font: 400 22px/1 Mono, monospace; letter-spacing: .16em; text-transform: uppercase; color: rgba(234,234,234,.75); }
  .kicker b { color: ${accent}; font-weight: 700; }
  h1 { font: 650 76px/1.02 Oxanium, sans-serif; letter-spacing: -.005em; text-wrap: balance; max-width: 1000px; }
  p { font: 400 30px/1.3 Grotesk, sans-serif; color: ${accent}; max-width: 980px; }
  </style></head><body>
  <div class="bg"></div><div class="shade"></div>
  <div class="frame"><i></i><i></i><i></i><i></i></div>
  <div class="text"><span class="kicker">${kicker}</span><h1>${esc(c.title)}</h1><p>${esc(c.outcome)}</p></div>
  </body></html>`;
}

const exe = process.env.CHROME_PATH;
const browser = await chromium.launch(exe ? { executablePath: exe } : { channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const c of cases) {
  await page.setContent(card(c), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(out, `${c.slug}.jpg`), type: 'jpeg', quality: 84 });
  console.log(`og/${c.slug}.jpg`);
}
await browser.close();
