import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';

// The project films, on YouTube: any of the usual link shapes turned into an
// embeddable player, and the player's position followed so a film can carry on
// from one player to the next.

/** The 11-char video id from a watch / youtu.be / embed / shorts / live URL. */
function youtubeId(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/);
  return m ? m[1] : null;
}

/** The moment a link asks to start at: `?t=95`, `?t=1m35s` or `?start=95`, the
 *  way YouTube's own "Start at" share link writes it (so a long film can open
 *  on the part that matters just by pasting that link into cases.json).
 *  Seconds; 0 if the link names no time. */
export function youtubeStart(url?: string): number {
  if (!url) return 0;
  let raw: string | null = null;
  try {
    const u = new URL(url);
    raw = u.searchParams.get('t') ?? u.searchParams.get('start') ?? new URLSearchParams(u.hash.replace(/^#/, '')).get('t');
  } catch {
    return 0;
  }
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

/** A privacy-friendly (no-cookie) embed URL, or null if it isn't a YouTube link. */
export function youtubeEmbed(url?: string): string | null {
  const id = youtubeId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null;
}

/** Where a YouTube player is: its position in seconds, and whether it's playing. */
export type FilmClock = { t: number; playing: boolean };

type Info = { currentTime?: unknown; playerState?: unknown };

// An embed with enablejsapi=1 reports on itself over postMessage once the page
// has said it's listening: 'infoDelivery' messages carrying currentTime and
// playerState, and takes commands the same way. That handshake is all this
// uses of the player API, and nothing extra loads for it.
function useYouTubeMessages(frame: RefObject<HTMLIFrameElement>, on: boolean, onInfo: (info: Info, send: (func: string, args?: unknown[]) => void) => void) {
  const handler = useRef(onInfo);
  handler.current = onInfo;
  useEffect(() => {
    const el = frame.current;
    if (!on || !el) return;
    let heard = false;
    const send = (func: string, args: unknown[] = []) => el.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    const onMessage = (e: MessageEvent) => {
      if (e.source !== el.contentWindow) return;
      let data: unknown = e.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      const msg = data as { event?: string; info?: Info } | null;
      if (!msg?.info || (msg.event !== 'infoDelivery' && msg.event !== 'initialDelivery')) return;
      heard = true;
      handler.current(msg.info, send);
    };
    const hello = () => el.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
    window.addEventListener('message', onMessage);
    el.addEventListener('load', hello);
    // the player may not be up yet when the frame loads: say it again until it answers
    let tries = 0;
    const again = window.setInterval(() => {
      if (heard || ++tries > 20) window.clearInterval(again);
      else hello();
    }, 500);
    return () => {
      window.removeEventListener('message', onMessage);
      el.removeEventListener('load', hello);
      window.clearInterval(again);
    };
  }, [frame, on]);
}

/** Follows an embedded player's position, so a film can carry on where it was
 *  when it moves to another player (from the label's into the book's). */
export function useYouTubeClock(frame: RefObject<HTMLIFrameElement>, clock: MutableRefObject<FilmClock>, on: boolean) {
  useYouTubeMessages(frame, on, (info) => {
    if (typeof info.currentTime === 'number') clock.current.t = info.currentTime;
    // 1 playing, 3 buffering (still on its way to playing)
    if (typeof info.playerState === 'number') clock.current.playing = info.playerState === 1 || info.playerState === 3;
  });
}

/** Keeps a silent preview on a stretch of its film: from `start`, `length`
 *  seconds, and round again (the film's own end too). The label's film plays
 *  like this behind the poster, so a long film shows its best moment, not its
 *  first. */
export function useYouTubePreviewLoop(frame: RefObject<HTMLIFrameElement>, on: boolean, start: number, length: number) {
  useYouTubeMessages(frame, on, (info, send) => {
    const t = typeof info.currentTime === 'number' ? info.currentTime : 0;
    if (info.playerState === 0) {
      send('seekTo', [start, true]);
      send('playVideo');
    } else if (t > start + length) send('seekTo', [start, true]);
  });
}

/** "1:23", for a position in seconds. */
export const clockLabel = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
