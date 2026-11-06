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
| `popup-open` | a project's label or book opens | a soft glass "breath", under 150 ms |
| `popup-close` | the label or book closes | the same, reversed |

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

## The city's grid

Pointing at the transformer house in the Alliander close-up sends power from
the station (the tower) through the house to the next block.

| File | When | Notes |
| --- | --- | --- |
| `grid-charge` | the station gathers charge, the moment you point | a rising whine, about 0.3 s |
| `grid-zap` | the pulse passes through the transformer house | a short electric crackle; give it variants |
| `grid-on` | a block's lights come on | a soft thunk of a big switch, with a low hum tail |

## The heart

In the Philips close-up you steer a catheter into the heart's arteries and
open the two narrowed ones.

| File | When | Notes |
| --- | --- | --- |
| `cath-inflate` | the balloon goes up in a narrowing | a soft rising squeeze, about 0.5 s |
| `cath-clear` | the narrowing opens and the blood rushes through | a whoosh with a bright tail, two notes of the signature |

## Snake

In the Amsterdam AI close-up the die plays Snake; these sound only while the
visitor steers (not while the chip plays itself).

| File | When | Notes |
| --- | --- | --- |
| `snake-eat` | the snake eats | a short bright blip, under 0.1 s; give it variants |
| `snake-crash` | the snake runs out of room | a low buzz falling away, about 0.4 s |

## Call-outs

In the Virtuele Brigade close-up you call out what the two players should
look at.

| File | When | Notes |
| --- | --- | --- |
| `call-out` | a marker is called out and the players turn | a short radio click |
| `call-clear` | they've looked: it's cleared | a soft two-note confirm |
| `call-miss` | a marker slips away before it's called | a muted low blip |

## The windmill

In the DTT close-up, blowing on the mill hard enough powers the tower in the
middle of the city.

| File | When | Notes |
| --- | --- | --- |
| `mill-power` | the tower is full and powers on | a big switch thrown, with a rising hum |

## Anchors

In the Custom AR Framework close-up the camera asks for its cubes in order.

| File | When | Notes |
| --- | --- | --- |
| `cube-anchor` | the cube asked for is anchored | a short glass tap, pitched up a step each time |
| `cube-merge` | all of them fly together into one | a soft rising shimmer, about 1 s |

## The bin

In the Popcore close-up the ping-pong balls go for the bin beside the couch.

| File | When | Notes |
| --- | --- | --- |
| `ball-in` | a ball drops into the bin | a light hollow plonk; played a little higher for each ball in |
| `ball-rim` | a ball hits the rim | a short bright tick; give it variants |
| `bin-tip` | the full bin falls over | a hollow clatter of the bin and the balls |

## Scavenger hunt

In the ARCam close-up the park's creatures hide behind its pines and under its
lake. One at a time, one shows itself for a few seconds, and you photograph it.

| File | When | Notes |
| --- | --- | --- |
| `critter-peek` | a pine rustles, or the lake ripples, where one's about to come out | a tiny rustle or blip, very short, so you look |
| `critter-in` | it comes out | a soft digital shimmer, short |
| `critter-away` | it hides again before you've photographed it | a short falling blip, light, not a fail sound |
| `critter-snap` | the shutter goes on one: it's found | a camera shutter with a small bright chime |
| `critter-group` | all seven together: the group photo is taken and the print comes out | a bigger shutter, then a printer's whirr |

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
