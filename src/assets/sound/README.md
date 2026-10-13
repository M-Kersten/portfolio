# Sound

Effects and ambient for the site. Drop a recording in this folder under one
of the names below and it plays at that moment; a name with no file stays
silent, so add them one at a time. `.mp3`, `.m4a`, `.ogg`, `.webm` and `.wav`
all work.

**Variants:** add `.2`, `.3`… before the extension (`game-shot.mp3`,
`game-shot.2.mp3`, `game-shot.3.mp3`) and one is picked at random each time,
so a repeated sound doesn't sound mechanical.

Sound is **off by default**. The switch appears in the header as soon as the
first file is in here; a visitor's choice is remembered.

## The signature

| File | When | Notes |
| --- | --- | --- |
| `wake-1` … `wake-10` | a project in the maquette wakes up (first visit) | the n-th visit plays `wake-n`: record ten notes rising up one scale, so the tour plays a melody |
| `complete` | all ten projects visited, the launch pad powers on | the chord the ten notes were building to |

## Interface

| File | When | Notes |
| --- | --- | --- |
| `select` | opening a project in the maquette you've already visited | one dry tick |
| `popup-open` | a project popup opens | a soft glass "breath", under 150 ms |
| `popup-close` | a project popup or the maquette dossier closes | the same, reversed |

## The launch

The film's countdown runs **9.6 s** from pressing LAUNCH to liftoff.

| File | When | Notes |
| --- | --- | --- |
| `launch-count` | pressing LAUNCH | your countdown, read out; "liftoff" lands at **9.6 s** into the file |
| `launch-release` | liftoff, as the clamps let go | one heavy metal clank |
| `launch-roar` | loops from engine start to the catch | follows the engines' thrust, quieter when the camera is far away; seamless loop |
| `launch-deluge` | loops while the water deluge runs | a shower or hose on full; seamless loop |
| `launch-catch` | the chopsticks catch the booster | heavy metal, a beat of ring |

## The game

| File | When | Notes |
| --- | --- | --- |
| `game-shot` | every shot | short and dry; give it variants |
| `game-break-big` / `-mid` / `-small` | a rock breaks, by size | crunch or snap; pitch each size apart |
| `game-shield` | the shield takes a hit | a short glass shatter |
| `game-stage` | a stage cleared | two notes of the signature |
| `game-crash` | the run ends in a crash | a low thud with a falling tone |
| `comms-open` / `comms-close` | ground control starts / finishes a line | a radio squelch |
| `comms-type` | as ground control's line types out | a soft blip, played every few characters |

## Ambient

One quiet bed per layer of the maquette, crossfading as you scroll; they
fade back while you read the rest of the page and go quiet for the launch.
60–90 s, stereo, seamless (cut at a zero crossing).

| File | Layer |
| --- | --- |
| `ambient-city` | the City: distant traffic, wind, the odd bird |
| `ambient-room` | the Room: room tone, a computer fan, a keyboard now and then |
| `ambient-chip` | the Chip: an electrical hum with a faint high shimmer |

## Levels and formats

- Effects: mono, peaking around −6 dBFS, most under 30 KB.
- Ambient: stereo, around −28 LUFS, under 1 MB each.
- While a voice note plays, everything else drops back on its own.
