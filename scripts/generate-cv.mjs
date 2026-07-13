// CV PDF generator — prints the /cv route into public/cv.pdf (as many A4
// pages as the content needs) and mirrors it into dist/ so the build you
// just made is complete too.
//
//   npm run cv        (= full build, then this script)
//
// The page is plain DOM + the site's own CSS, so the PDF is vector text —
// selectable, searchable, ATS-parseable. Rendering uses whatever Chrome is
// around, tried in this order:
//   1. $CHROME_PATH                    (explicit override)
//   2. your installed Google Chrome    (channel: 'chrome' — the usual case)
//   3. a Playwright-managed chromium   (if you've ever run `playwright install`)
// Nothing is downloaded by this script.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium } from 'playwright-core';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('✗ dist/index.html missing — run `npm run build` first (or use `npm run cv`).');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

// A tiny static server over dist/ with the SPA fallback (/cv → index.html).
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(dist, path);
  const target = existsSync(file) && statSync(file).isFile() ? file : join(dist, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' });
  res.end(readFileSync(target));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;

async function launch() {
  const tries = [
    process.env.CHROME_PATH && { executablePath: process.env.CHROME_PATH },
    { channel: 'chrome' },
    {},
    existsSync('/opt/pw-browsers/chromium') && { executablePath: '/opt/pw-browsers/chromium' },
  ].filter(Boolean);
  const seen = [];
  for (const opts of tries) {
    try {
      return await chromium.launch(opts);
    } catch (e) {
      seen.push(e.message.split('\n')[0]);
    }
  }
  console.error('✗ no Chrome found. Install Google Chrome, or point CHROME_PATH at a Chromium binary.');
  for (const s of seen) console.error('  · ' + s);
  process.exit(1);
}

const browser = await launch();
const page = await browser.newPage();

await page.goto(`http://127.0.0.1:${port}/cv`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(150);
// Explicit page margins (not left to CSS @page / viewer defaults) so every
// page gets the same top/bottom breathing room and nothing is clipped. The
// header bleeds to the sheet's left/right edges, so those margins are 0.
const pdf = await page.pdf({
  format: 'A4',
  printBackground: true,
  margin: { top: '12mm', bottom: '14mm', left: '0mm', right: '0mm' },
});
writeFileSync(join(root, 'public', 'cv.pdf'), pdf);
copyFileSync(join(root, 'public', 'cv.pdf'), join(dist, 'cv.pdf'));
console.log(`✓ cv.pdf — ${(pdf.length / 1024).toFixed(0)} kB`);

await browser.close();
server.close();
