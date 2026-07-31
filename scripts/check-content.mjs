// Content sanity check — runs first in `npm run build` (and via `npm run check`).
//
// The site is edited by hand in src/content/*.json, and several things point
// at each other by typed-out slug: the 3D hotspots (src/scene/framing.ts),
// the cross-layer relation cables (src/scene/maquette/signals.tsx) and the
// poster images (public/posters/<slug>.jpg). A typo in any of them fails
// silently in the browser — a hotspot that opens nothing, a cable to nowhere,
// a card without artwork. This script fails the build instead, with a message
// that says exactly what to fix. Warnings (⚠) don't fail the build.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, '..');
const errors = [];
const warnings = [];

function readJson(rel) {
  const text = readFileSync(join(root, rel), 'utf8');
  try {
    return JSON.parse(text);
  } catch (e) {
    errors.push(`${rel}: invalid JSON — ${e.message}`);
    return null;
  }
}

const site = readJson('src/content/site.json');
const cases = readJson('src/content/cases.json');
const capabilities = readJson('src/content/capabilities.json');
const cv = readJson('src/content/cv.json');
const cvNl = readJson('src/content/cv.nl.json');
if (errors.length) fail(); // JSON that doesn't parse blocks every other check

const LAYERS = new Set(['city', 'room', 'chip']);
const slugs = new Set();

// ---- cases.json ------------------------------------------------------------
for (const c of cases) {
  const who = `cases.json → "${c.slug ?? c.title ?? '??'}"`;
  if (!c.slug) errors.push(`${who}: missing "slug"`);
  else if (slugs.has(c.slug)) errors.push(`${who}: duplicate slug`);
  else slugs.add(c.slug);
  if (!LAYERS.has(c.layer)) errors.push(`${who}: layer must be city | room | chip (got "${c.layer}")`);
  // `year` and a poster are what the curated wall tile is built from — the date
  // stamp and the artwork — and the year also places the tile on the timeline.
  // An `archive` case reaches neither: it only ever appears as a node in the
  // /projects cloud (which already degrades a missing poster to a styled empty
  // node) and as a row in the find popup. So for those two they're optional —
  // still validated when present, so a typo can't slip through, and a missing
  // poster is reported as a warning rather than being passed over in silence.
  if (c.year === undefined && c.archive) {
    // fine — a long-tail entry may not have a date worth pinning
  } else if (!/^\d{4}(-(0[1-9]|1[0-2]))?$/.test(c.year ?? '')) {
    errors.push(`${who}: year must be "YYYY" or "YYYY-MM" (got "${c.year}")`);
  }
  for (const field of ['title', 'problem', 'approach', 'outcome'])
    if (!c[field]) errors.push(`${who}: missing "${field}"`);
  if (!existsSync(join(root, 'public', 'posters', `${c.slug}.jpg`)))
    (c.archive ? warnings : errors).push(`${who}: no poster at public/posters/${c.slug}.jpg`);
  if (c.video && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(c.video))
    warnings.push(`${who}: video isn't a YouTube URL — the embed only understands YouTube`);
}
// `follows` storyline links must point at real cases (checked after the slug
// set is complete, so forward references work too).
for (const c of cases)
  if (c.follows && !slugs.has(c.follows))
    errors.push(`cases.json → "${c.slug}": follows "${c.follows}", which isn't a case slug`);

// ---- hotspots + relations reference real cases ------------------------------
// These live in TypeScript, so pull the slugs out with targeted regexes.
const framing = readFileSync(join(root, 'src/scene/framing.ts'), 'utf8');
for (const m of framing.matchAll(/\{\s*slug:\s*'([^']+)'/g))
  if (!slugs.has(m[1])) errors.push(`framing.ts: hotspot slug "${m[1]}" has no case in cases.json`);

const signals = readFileSync(join(root, 'src/scene/maquette/signals.tsx'), 'utf8');
for (const m of signals.matchAll(/(?:from|to):\s*'([^']+)'/g))
  if (!slugs.has(m[1])) errors.push(`signals.tsx: relation endpoint "${m[1]}" has no case in cases.json`);

// ---- site.json ---------------------------------------------------------------
for (const j of site.career ?? []) {
  const who = `site.json → career "${j.company}"`;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(j.from ?? '')) errors.push(`${who}: "from" must be YYYY-MM (got "${j.from}")`);
  if (j.to !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(j.to ?? ''))
    errors.push(`${who}: "to" must be YYYY-MM or null for the current role (got "${j.to}")`);
  if (j.url && !/^https?:\/\//.test(j.url)) errors.push(`${who}: url should start with https://`);
  if (j.logo && !existsSync(join(root,'public',j.logo)))
    warnings.push(`${who}: logo ${j.logo} not found — the tooltip falls back to the site favicon`);
}
for (const l of site.contact?.links ?? [])
  if (!/^https?:\/\//.test(l.href)) errors.push(`site.json → contact link "${l.label}": href should be a full URL`);

// ---- capabilities.json -------------------------------------------------------
if ((capabilities ?? []).length !== 3)
  errors.push(`capabilities.json: expected exactly 3 entries (the three band columns), got ${capabilities?.length}`);
for (const cap of capabilities ?? [])
  if (!LAYERS.has(cap.layer)) errors.push(`capabilities.json → "${cap.title}": layer must be city | room | chip`);

// ---- cv.json + cv.nl.json ----------------------------------------------------
const nCareer = (site.career ?? []).length;
for (const [name, pack, isNl] of [['cv.json', cv, false], ['cv.nl.json', cvNl, true]]) {
  for (const field of ['ui', 'tagline', 'profile', 'location', 'links', 'stack', 'education', 'languages', 'offTheClock'])
    if (!pack[field] || pack[field].length === 0) errors.push(`${name}: missing "${field}"`);
  for (const u of ['profile', 'experience', 'education', 'stack', 'languages', 'now', 'back', 'download'])
    if (!pack.ui?.[u]) errors.push(`${name} → ui: missing "${u}"`);
  for (const e of pack.education ?? [])
    if (!e.school || !e.degree) errors.push(`${name}: every education entry needs "school" and "degree"`);
  for (const c of pack.links ?? [])
    if (c.href && !/^(https?:\/\/|mailto:)/.test(c.href))
      errors.push(`${name} → link "${c.label}": href should be a full URL or mailto:`);
  // a non-English pack must translate every career entry, in site.json's order
  if (isNl) {
    if ((pack.career ?? []).length !== nCareer)
      errors.push(`${name}: career has ${pack.career?.length ?? 0} entries but site.json has ${nCareer} (same order required)`);
    (pack.career ?? []).forEach((c, i) => {
      if (!c.detail) errors.push(`${name} → career[${i}]: missing "detail"`);
    });
  }
}
if (cv.photo && !existsSync(join(root,'public',cv.photo)))
  errors.push(`cv.json: photo ${cv.photo} not found in public/`);
// every career stint should carry a black logo on the CV — warn on the gaps
for (const j of site.career ?? [])
  if (!j.logo) warnings.push(`site.json → career "${j.company}": no logo — the CV entry will have no mark`);
  else if (!existsSync(join(root,'public',j.logo))) warnings.push(`site.json → career "${j.company}": logo ${j.logo} not found`);
for (const f of ['cv.pdf', 'cv-nl.pdf'])
  if (!existsSync(join(root ,'public', f)))
    warnings.push(`public/${f} missing — run \`npm run cv\` to generate the downloadable CVs`);

// ---- report ------------------------------------------------------------------
for (const w of warnings) console.warn('  ⚠ ' + w);
if (errors.length) fail();
console.log(`✓ content ok — ${cases.length} cases, ${slugs.size} slugs, ${site.career?.length ?? 0} career stints` +
  (warnings.length ? ` (${warnings.length} warning${warnings.length > 1 ? 's' : ''})` : ''));

function fail() {
  for (const e of errors) console.error('  ✗ ' + e);
  console.error(`\n${errors.length} content problem${errors.length > 1 ? 's' : ''} — fix the above and rebuild.`);
  process.exit(1);
}
