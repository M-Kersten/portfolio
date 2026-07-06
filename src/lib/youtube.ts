// Turn any of the usual YouTube link shapes into an embeddable player URL.

/** The 11-char video id from a watch / youtu.be / embed / shorts / live URL. */
export function youtubeId(url?: string): string | null {
  if (!url) return null;
  const m = url.match(
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/,
  );
  return m ? m[1] : null;
}

/** A privacy-friendly (no-cookie) embed URL, or null if it isn't a YouTube link. */
export function youtubeEmbed(url?: string): string | null {
  const id = youtubeId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null;
}
