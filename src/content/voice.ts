// The voice notes: a short recording per project of me talking about it, in
// src/assets/voice/<slug>.<ext> (see the README there). Vite picks up every
// file in that folder at build time and gives each its hashed URL, so adding
// a clip is just dropping in the file; a project without one has no entry and
// shows no button.
const files = import.meta.glob('../assets/voice/*.{mp3,m4a,ogg,webm}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const VOICE: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.split('/').pop()!.replace(/\.[^.]+$/, ''), url]),
);

/** The URL of a project's voice note, if it has one. */
export const voiceFor = (slug: string): string | undefined => VOICE[slug];
