import { useEffect, useMemo, useRef, useState } from 'react';
import { voiceFor } from '../content/voice';

// "Hear about this project": a short recording of me talking about the
// project, as a button with a waveform. The waveform is a drawing, not the
// clip's real one (that would mean downloading the clip just to show the
// button): a fixed shape per project, seeded from its slug, that fills from
// the left as the clip plays. Only the clip's length loads up front
// (preload="metadata"); the rest when it's pressed. One plays at a time, and
// it stops when the popup or dossier closes.

const BARS = 28;
let current: HTMLAudioElement | null = null; // the one clip playing, site-wide

/** A waveform-ish row of bar heights (0.2–1), the same every time for a slug. */
function shape(slug: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) h = Math.imul(h ^ slug.charCodeAt(i), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 13), 1274126177)) >>> 0) / 4294967296;
  return Array.from({ length: BARS }, (_, i) => {
    // speech: phrases that swell and fall, with a ragged edge
    const phrase = 0.55 + 0.45 * Math.sin((i / BARS) * Math.PI * 3 + rnd() * 0.8) ** 2;
    return Math.max(0.2, Math.min(1, phrase * (0.55 + rnd() * 0.5)));
  });
}

const clock = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

export function VoiceNote({ slug, title }: { slug: string; title: string }) {
  const src = voiceFor(slug);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(NaN);
  const bars = useMemo(() => shape(slug), [slug]);

  // stop when the project changes or the popup closes
  useEffect(() => {
    const a = audio.current;
    return () => {
      if (!a) return;
      a.pause();
      if (current === a) current = null;
    };
  }, [slug]);

  if (!src) return null;

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      if (current && current !== a) current.pause();
      current = a;
      void a.play().catch(() => setPlaying(false));
    } else a.pause();
  };
  const progress = length > 0 ? time / length : 0;

  return (
    <div className="voice" data-playing={playing || undefined}>
      <button
        type="button"
        className="voice__btn"
        onClick={toggle}
        aria-pressed={playing}
        aria-label={playing ? `Pause: ${title}, in my own words` : `Hear about this project: ${title}, in my own words`}
      >
        <span className="voice__wave" aria-hidden="true">
          {bars.map((b, i) => (
            <i key={i} style={{ '--b': b } as React.CSSProperties} data-on={(i + 0.5) / BARS <= progress || undefined} />
          ))}
        </span>
        <span className="voice__text">
          <span className="voice__label">{playing ? 'Playing' : time > 0 && time < length ? 'Paused' : 'Hear about this project'}</span>
          <span className="voice__time">{time > 0 ? `${clock(time)} / ${clock(length)}` : clock(length)}</span>
        </span>
      </button>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setLength(e.currentTarget.duration)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={(e) => {
          setPlaying(false);
          setTime(0);
          e.currentTarget.currentTime = 0;
        }}
      />
    </div>
  );
}
