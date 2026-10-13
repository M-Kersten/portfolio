// The exhibition's numbering, for the build scripts (the app's own copy is
// src/content/exhibits.ts): the ten projects standing in the maquette are
// exhibits 01–10, city then room then chip, each layer in the model's order.
// Read straight out of src/scene/framing.ts, as check-content does.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadExhibits(root) {
  const framing = readFileSync(join(root, 'src/scene/framing.ts'), 'utf8');
  const spots = [...framing.matchAll(/\{\s*slug:\s*'([^']+)',\s*layer:\s*'([^']+)'/g)].map((m) => ({ slug: m[1], layer: m[2] }));
  const order = ['city', 'room', 'chip'].flatMap((layer) => spots.filter((s) => s.layer === layer).map((s) => s.slug));
  const raw = JSON.parse(readFileSync(join(root, 'src/content/cases.json'), 'utf8'));
  const cases = (Array.isArray(raw) ? raw : (raw.cases ?? [])).filter((c) => !c.draft);
  const no = (slug) => {
    const i = order.indexOf(slug);
    return i < 0 ? null : String(i + 1).padStart(2, '0');
  };
  return { cases, no };
}
