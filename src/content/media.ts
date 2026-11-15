import { asset } from '../lib/asset';
// The files dropped in per project, named after its slug: the silent film loop
// at the top of its label (src/assets/loops/<slug>.mp4), the voice note of me
// talking about it (src/assets/voice/<slug>.mp3) and its stills, a folder of
// pictures (src/assets/stills/<slug>/). See the README in each folder. Vite finds every file there at build time and gives each its hashed
// URL, so adding one is just dropping it in; a project without one shows none.

const loops = import.meta.glob('../assets/loops/*.{mp4,webm}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const voices = import.meta.glob('../assets/voice/*.{mp3,m4a,ogg,webm}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** A folder's files as slug → URL ("../assets/voice/arcam.mp3" is "arcam"). */
const bySlug = (files: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(files).map(([path, url]) => [
      path
        .split('/')
        .pop()!
        .replace(/\.[^.]+$/, ''),
      url,
    ]),
  );

// A project's stills: the pictures that float behind its story when it's opened
// from a page (src/assets/stills/<slug>/, in file-name order). `npm run stills`
// brings in three frames of each film; anything dropped in beside them counts.
const stills = import.meta.glob('../assets/stills/*/*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const STILLS: Record<string, string[]> = {};
for (const path of Object.keys(stills).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
  const slug = path.split('/').slice(-2)[0];
  (STILLS[slug] ??= []).push(stills[path]);
}

const LOOPS = bySlug(loops);
const VOICES = bySlug(voices);

/** The URL of a project's silent film loop, if it has one. */
export const loopFor = (slug: string): string | undefined => LOOPS[slug];
/** The URL of a project's voice note, if it has one. */
export const voiceFor = (slug: string): string | undefined => VOICES[slug];
/** The URLs of a project's stills (none, for a project without any). */
export const stillsFor = (slug: string): string[] => STILLS[slug] ?? [];

/** A project's picture, wherever it comes from. */
export type Picture = { src: string; caption?: string };
/** Every picture of a project, in the order they're shown: its gallery first
 *  (with its captions), then its stills. */
export const picturesFor = (study: { slug: string; gallery?: { file: string; caption?: string }[] }): Picture[] => [
  ...(study.gallery ?? []).map((g) => ({ src: asset(`/gallery/${study.slug}/${g.file}`), caption: g.caption })),
  ...stillsFor(study.slug).map((src) => ({ src })),
];
