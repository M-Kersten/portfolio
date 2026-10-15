// A page per project, so a shared /work/<slug> link previews as that project
// (and the collection and the CV, as themselves):
// after the build, dist/index.html is copied to dist/work/<slug>.html with its
// title, description, canonical URL and share card (public/og/<slug>.jpg, see
// gen-og.mjs) swapped in. GitHub Pages serves it for /work/<slug> directly, so
// a deep link also skips the 404.html bounce. The app itself is the same
// bundle; it boots straight onto the project's label. Runs as the last step of
// `npm run build`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadExhibits } from './exhibits.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://portfolio.merijnkersten.nl'; // in step with index.html and gen-sitemap.mjs
const dist = join(root, 'dist');
const base = readFileSync(join(dist, 'index.html'), 'utf8');
const { cases, no } = loadExhibits(root);

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** Set a <meta>'s content, matched by its name/property (attributes on any lines). */
const meta = (html, key, value) =>
  html.replace(new RegExp(`(<meta\\s+(?:name|property)="${key}"\\s+content=")[^"]*(")`), `$1${esc(value)}$2`);

mkdirSync(join(dist, 'work'), { recursive: true });
let n = 0;
for (const c of cases) {
  const ex = no(c.slug);
  const mark = ex ? `Exhibit ${ex}` : 'From the collection';
  const title = `${c.title} · ${mark} · Merijn Kersten`;
  const year = c.year ? String(c.year).slice(0, 4) : '';
  const outcome = /[.!?…]$/.test(c.outcome) ? c.outcome : `${c.outcome}.`;
  const description = `${outcome} ${[c.client, year].filter(Boolean).join(', ')}.`;
  const url = `${SITE}/work/${c.slug}`;
  const image = existsSync(join(dist, 'og', `${c.slug}.jpg`)) ? `${SITE}/og/${c.slug}.jpg` : `${SITE}/og.png`;
  let html = base.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = meta(html, 'description', description);
  html = meta(html, 'og:url', url);
  html = meta(html, 'og:title', title);
  html = meta(html, 'og:description', description);
  html = meta(html, 'og:image', image);
  html = meta(html, 'og:image:alt', `${mark}: ${c.title}`);
  html = meta(html, 'twitter:title', title);
  html = meta(html, 'twitter:description', description);
  html = meta(html, 'twitter:image', image);
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
  writeFileSync(join(dist, 'work', `${c.slug}.html`), html);
  n++;
}
// …and the two pages of their own, so a link to them previews (and is
// indexed) as itself rather than as the home page
const PAGES = [
  { path: 'projects', title: 'The collection — Merijn Kersten', description: 'Every project in one place: the ten exhibits in the model and the rest of the collection.' },
  { path: 'cv', title: 'CV — Merijn Kersten', description: 'The CV of Merijn Kersten, creative technologist in Utrecht: AR, VR, games and digital twins.' },
];
for (const pg of PAGES) {
  const url = `${SITE}/${pg.path}`;
  let html = base.replace(/<title>[^<]*<\/title>/, `<title>${esc(pg.title)}</title>`);
  html = meta(html, 'description', pg.description);
  html = meta(html, 'og:url', url);
  html = meta(html, 'og:title', pg.title);
  html = meta(html, 'og:description', pg.description);
  html = meta(html, 'twitter:title', pg.title);
  html = meta(html, 'twitter:description', pg.description);
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
  writeFileSync(join(dist, `${pg.path}.html`), html);
}
console.log(`pages — ${n} project pages with their own share cards, plus ${PAGES.map((pg) => '/' + pg.path).join(' and ')}`);
