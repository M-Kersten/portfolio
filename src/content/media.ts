// The files dropped in per project, named after its slug: the silent film loop
// at the top of its label (src/assets/loops/<slug>.mp4) and the voice note of
// me talking about it (src/assets/voice/<slug>.mp3). See the README in each
// folder. Vite finds every file there at build time and gives each its hashed
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

const LOOPS = bySlug(loops);
const VOICES = bySlug(voices);

/** The URL of a project's silent film loop, if it has one. */
export const loopFor = (slug: string): string | undefined => LOOPS[slug];
/** The URL of a project's voice note, if it has one. */
export const voiceFor = (slug: string): string | undefined => VOICES[slug];
