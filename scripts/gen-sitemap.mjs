// Regenerate public/sitemap.xml from the case list so it never goes stale.
// Runs as the first step of `npm run build`. Update SITE if the domain moves
// (keep it in step with the absolute URLs in index.html).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://portfolio.merijnkersten.nl';

const raw = JSON.parse(readFileSync(resolve(root, 'src/content/cases.json'), 'utf8'));
const cases = Array.isArray(raw) ? raw : (raw.cases ?? []);
const urls = [`${SITE}/`, ...cases.filter((c) => !c.draft).map((c) => `${SITE}/work/${c.slug}`)];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
writeFileSync(resolve(root, 'public/sitemap.xml'), xml);
console.log(`sitemap.xml — ${urls.length} urls`);
