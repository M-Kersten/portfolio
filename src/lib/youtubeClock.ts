import { useEffect, type MutableRefObject, type RefObject } from 'react';

/** Where a YouTube player is: its position in seconds, and whether it's playing. */
export type FilmClock = { t: number; playing: boolean };

// Follows an embedded YouTube player's position, so a film can carry on where it
// was when it moves to another player (from the label's into the book's). An
// embed with enablejsapi=1 reports on itself over postMessage once the page has
// said it's listening: 'infoDelivery' messages carrying currentTime and
// playerState. That handshake is all this uses of the player API, and nothing
// extra loads for it.
export function useYouTubeClock(frame: RefObject<HTMLIFrameElement>, clock: MutableRefObject<FilmClock>, on: boolean) {
  useEffect(() => {
    const el = frame.current;
    if (!on || !el) return;
    let heard = false;
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
      const msg = data as { event?: string; info?: { currentTime?: unknown; playerState?: unknown } } | null;
      if (!msg?.info || (msg.event !== 'infoDelivery' && msg.event !== 'initialDelivery')) return;
      heard = true;
      if (typeof msg.info.currentTime === 'number') clock.current.t = msg.info.currentTime;
      // 1 playing, 3 buffering (still on its way to playing)
      if (typeof msg.info.playerState === 'number') clock.current.playing = msg.info.playerState === 1 || msg.info.playerState === 3;
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
  }, [frame, clock, on]);
}

/** "1:23", for a position in seconds. */
export const clockLabel = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
