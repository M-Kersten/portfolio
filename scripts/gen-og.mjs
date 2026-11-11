// The share previews, 1200×630, for when someone posts a link:
//
// · the site's own (public/og.jpg, index.html): the hero as it opens, rendered
//   live: "Work in miniature", the name and the line under it, beside the
//   model, lit as if every exhibit but one had been seen (all ten would put
//   the launch's invitation over the city). What's only there to be used on a
//   live page is left out: the nav, the ticket, the markers' names.
// · one per project (public/og/<slug>.jpg, for a /work/<slug> link): the
//   project's poster, full bleed, under its exhibit number ("Exhibit 02 ·
//   Merijn Kersten", or "From the collection"), its title and what it
//   achieved, in the site's own type and the layer's colour.
//   scripts/gen-pages.mjs points each project's page at its card.
//
// Run it after the hero, the model, a poster or a title changes, and commit
// the results:
//
//   npm run og              both
//   npm run og -- site      only the site's card
//   npm run og -- projects  only the projects'
//
// It draws them in a browser, so it needs one: it uses the Chrome you have
// installed, or the one at CHROME_PATH. The site's card runs the site itself
// (a Vite dev server of its own) and needs WebGL.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { loadExhibits } from './exhibits.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public/og');
mkdirSync(out, { recursive: true });
const { cases, no, order } = loadExhibits(root);

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

/* ---------- the site's card ---------- */

/** Seen, for the render: every exhibit but the last (the chip's), so the model
 *  is lit and the next launch is one away (fuelling), without the invitation
 *  that all ten bring out over the city. */
const SEEN = order.slice(0, -1);
/** What's only there to be used, on a live page: left out of the picture. The
 *  logo stays, on the hero rather than on the header's bar. */
const LEAVE_OUT = `
  .header__right, .hero__signals, .hotspot__label, .nextsite-wrap, .scene-loading,
  button[title="Open the dev tools"] { visibility: hidden !important; }
  .header { background: none !important; border-color: transparent !important; box-shadow: none !important;
    -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
  html { scrollbar-width: none !important; }
  ::-webkit-scrollbar { display: none !important; }`;
/** How long the model gets to wake and settle before it's taken (ms). */
const SETTLE = 12000;

async function siteCard(browser) {
  const { createServer } = await import('vite');
  const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 5189 } });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  try {
    // twice the pixels, then down to size: the type stays crisp and the model
    // gets a little supersampling
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('mk-intro-seen', '1'); // straight to the model, no opening card
        localStorage.setItem('mk-model-hint', '1'); // and no cue to scroll
      } catch {
        /* no storage: the opening card would show, and the render with it */
      }
    });
    await ctx.addCookies([{ name: 'mk-woken', value: encodeURIComponent(SEEN.join(',')), url }]);
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.addStyleTag({ content: LEAVE_OUT });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(SETTLE);
    const shot = await page.screenshot({ type: 'png' });
    // down to 1200×630 in the browser's own resampler, and out as a JPEG
    await page.setContent('<canvas width="1200" height="630"></canvas>');
    const jpeg = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.querySelector('canvas');
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.86).split(',')[1];
    }, `data:image/png;base64,${shot.toString('base64')}`);
    writeFileSync(join(root, 'public/og.jpg'), Buffer.from(jpeg, 'base64'));
    console.log('og.jpg');
    await ctx.close();
  } finally {
    await server.close();
  }
}

/* ---------- the run ---------- */

const only = process.argv[2];
const exe = process.env.CHROME_PATH;
const browser = await chromium.launch(exe ? { executablePath: exe } : { channel: 'chrome' });
if (only !== 'projects') await siteCard(browser);
if (only !== 'site') {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const c of cases) {
    await page.setContent(card(c), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(out, `${c.slug}.jpg`), type: 'jpeg', quality: 84 });
    console.log(`og/${c.slug}.jpg`);
  }
}
await browser.close();
