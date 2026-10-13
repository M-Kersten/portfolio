import { useSyncExternalStore } from 'react';
import { hasSounds, setSound, soundOn, subscribeSound } from '../lib/sound';

// The site's sound switch, in the header beside Find. Off until a visitor
// turns it on (remembered); hidden altogether until there's a recording in
// src/assets/sound/ to hear.
export function SoundToggle() {
  const on = useSyncExternalStore(subscribeSound, soundOn, () => false);
  if (!hasSounds) return null;
  return (
    <button
      type="button"
      className="sound-toggle"
      aria-pressed={on}
      aria-label={on ? 'Sound on' : 'Sound off'}
      title={on ? 'Sound on' : 'Sound off'}
      onClick={() => setSound(!on)}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" stroke="none" />
        {on ? (
          <>
            <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
            <path d="M18 6.8a7.5 7.5 0 0 1 0 10.4" />
          </>
        ) : (
          <path d="m15.5 9.5 5 5m0-5-5 5" />
        )}
      </svg>
    </button>
  );
}
