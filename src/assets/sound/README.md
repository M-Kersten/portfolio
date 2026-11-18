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
| `wake-1` … `wake-10` | a project in the maquette wakes up (first visit) | the n-th visit plays `wake-n`: a low, soft click, each a little higher than the last. Not notes: a chime here reads as a notification |
| `complete` | all ten projects visited, the launch pad powers on | something large coming on: a low swell, a second or so |

## Interface

| File | When | Notes |
| --- | --- | --- |
| `focus` | the reticle locks on to a project, in the 0.4 s before the camera goes in; fainter and lower as it comes back out | a camera's dial clicking: a few small dry clicks, 0.4 s at most; give it variants. No whoosh, no beeps |
| `select` | any link or button is pressed (but not a hotspot or the ticket, which have their own) | one dry tick |
| `hover` | the pointer comes onto a hotspot (or the keyboard's focus does), or, quieter, onto any link or button | the smallest tick there is, low and soft; it's heard a lot |
| `hover-fill` | the pointer comes onto a button that fills with colour (`.btn`) | something sliding across, soft, about 0.3 s: the fill, heard |
| `hover-card` | the pointer comes onto a project's card on the timeline | a short dull whir, under 0.3 s, the quietest hover on the site; nothing bright, rising or sparkling (it becomes a firework), nothing that taps or pops |
| `year-tick` | the timeline's year rolls over as it's scrolled (played lower going back) | one tooth of a small gear, 0.1 s; it's heard in runs |

## The admission ticket

| File | When | Notes |
| --- | --- | --- |
| `ticket-open` | the ticket is pulled out of the edge and turns over | card sliding, then a flap as it turns: about 1.2 s, the turn starting 0.35 s in |
| `ticket-close` | it's pushed back in | one quick flip |
| `ticket-tear` | at ten, the stub is torn off down its perforation (0.5 s after the click, as the tear starts) | card tearing, one pull, about 0.4 s |
| `stamp` | a stamp comes down: on the cover's strip as the count steps, on the back for each exhibit seen since it was last out, and the all-ten one | a rubber stamp's thud, short and dull; give it variants. Played lighter and higher for the cover's small cell, heavier for the all-ten one |

## The launch

The film's countdown runs **9.6 s** from pressing LAUNCH to liftoff.

| File | When | Notes |
| --- | --- | --- |
| `launch-count` | pressing LAUNCH | your countdown, read out; "liftoff" lands at **9.6 s** into the file |
| `launch-release` | liftoff, as the clamps let go | one heavy metal clank |
| `launch-roar` | loops from engine start to the catch | follows the engines' thrust, quieter when the camera is far away; seamless loop |
| `launch-deluge` | loops while the water deluge runs | a shower or hose on full; seamless loop |

## The game

| File | When | Notes |
| --- | --- | --- |
| `game-shot` | every shot | short and dry; give it variants |
| `game-break-big` / `-mid` / `-small` | a rock breaks, by size | crunch or snap; pitch each size apart |
| `game-shield` | the shield takes a hit | a short glass shatter |
| `game-stage` | a stage cleared | two bright rising notes |
| `game-crash` | the run ends in a crash | a low thud with a falling tone |
| `comms-open` / `comms-close` | ground control starts / finishes a line | a radio squelch |
| `comms-type` | as ground control's line types out | a soft blip, played every few characters |

## The city's grid

Pointing at the transformer house in the Alliander close-up sends power from
the station (the tower) through the house to the next block.

| File | When | Notes |
| --- | --- | --- |
| `grid-charge` | the station gathers charge, the moment you point | a transformer's low hum swelling, about 0.6 s; nothing high, it squeals |
| `grid-zap` | the pulse passes through the transformer house | a short low electric buzz; give it variants |
| `grid-on` | a block's lights come on | a soft thunk of a big switch, with a low hum tail |

## The heart

In the Philips close-up you steer a catheter into the heart's arteries and
open the two narrowed ones.

| File | When | Notes |
| --- | --- | --- |
| `cath-inflate` | the balloon goes up in a narrowing | a soft rising squeeze, about 0.5 s |
| `cath-clear` | the narrowing opens and the blood rushes through | a whoosh with a bright tail, two bright rising notes |

## Snake

In the Amsterdam AI close-up the die plays Snake; these sound fainter while
the chip plays itself than while the visitor steers.

| File | When | Notes |
| --- | --- | --- |
| `snake-eat` | the snake eats (played a step higher for each one eaten) | a short bright bleep, under 0.25 s; give it variants |
| `snake-crash` | the snake runs out of room | a bloop: two low notes, the second lower, about 0.4 s |

## The chase

In the Virtuele Brigade close-up you're the instructor in the editor: the two
in VR follow a suspect through a terminal, room by room, and at each door and
hiding place you point them on.

| File | When | Notes |
| --- | --- | --- |
| `vr-login` | the second player logs in | a soft rising chime, a connection made, about 1 s |
| `chase-clue` | the suspect bolts, or is found; quieter, the two get to the next room | a short radio click |
| `chase-send` | you send the team on | a short sync blip, digital |
| `chase-caught` | they catch the suspect: the story done | a soft two-note confirm |

## The windmill

In the DTT close-up, blowing on the mill hard enough powers the tower in the
middle of the city. As the close-up opens, the Big Dipper comes out beside the
mill one star at a time, and a line is drawn through it.

| File | When | Notes |
| --- | --- | --- |
| `mill-power` | the tower is full and powers on | a big switch thrown, with a rising hum |
| `star-pop` | a star comes out (seven in a row, each played a little higher) | a tiny glassy ping, very short |
| `star-trace` | the line reaches the next star | softer than the pop: a faint chime or a brushed tick |

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
| `ball-pop` | a ball pops out onto the couch | a tiny soft pop |
| `ball-flick` | a ball is flicked: at the bin, or back up onto the couch | a fingernail on hollow plastic, one quick snap |
| `ball-bounce` | a ball lands on the floor or the couch (quieter and duller on the cushion, louder the harder it lands) | a ping-pong ball's tick: light, hollow, high; give it variants. Nothing with weight in it |
| `ball-in` | a ball drops into the bin | a light hollow plonk; played a little higher for each ball in |
| `ball-rim` | a ball hits the rim | a short bright tick; give it variants |
| `bin-tip` | the full bin falls over | a hollow clatter of the bin and the balls |
| `bin-cheer` | the bin lands and the confetti bursts out of it | a party popper's pop with a bright tail, two bright rising notes |

## The race table and the mouse

| File | When | Notes |
| --- | --- | --- |
| `crown-tag` | in the Lightship Drive close-up, the crown changes hands | one firm click; played higher when you take it, lower when the rival does |
| `car-engine` | loops for each car while crown tag is on, a little faster and louder with the car's speed | a small electric motor's low whirr, 2–3 s, seamless; no revs in the recording itself and no high whine (it's heard twice over, for as long as the game runs) |
| `mouse-patter` | the shelf mouse drops to the floor (the first time the Zwijsen book is picked up), and, quieter, each time it sets off on a run while the Room is on screen | small quick feet, under a second; a run of taps, not one |

## The picture book

In the Zwijsen close-up the book is a seek-and-find: Mouse hides on every
spread, and only shows through the lens round the cursor.

| File | When | Notes |
| --- | --- | --- |
| `book-find` | Mouse is found and lifts off the page | a small bright "there you are": a squeak-like chirp or two rising notes |
| `page-turn` | the page turns over onto the next spread | a paper page turning, soft and quick |
| `book-close` | after the last spread the book closes, to open again on the first | a hardcover closing softly, a gentle thump |

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
stop once the maquette is scrolled off the screen, and for the launch.
60–90 s, stereo, seamless (cut at a zero crossing).

| File | Layer |
| --- | --- |
| `ambient-city` | the City: traffic from a long way off, only its rumble |
| `ambient-room` | the Room: the desk's computer, its fan turning over, close and low |
| `ambient-rain` | the Room as well, played with its bed and at half its level: light rain on the window |

In the Room the site also plays `clock-tick` once a second, every other one a
little lower (tick, tock): one soft tick of a wall clock, about 0.1 s.

On the Chip's layer the site also plays `chip-bleep` every few seconds, at a
pitch and a place of its own each time: short machine bleeps, given as many
variants as there are. They're played, not part of the bed, so they never
come round the same.
| `ambient-chip` | the Chip: an electrical hum with a faint high hiss |

Nothing in a bed should be an event close by (a door, a keyboard, a bird at
the window): an event gets listened to, and then it's heard coming round again.

## Levels and formats

- Effects: mono, peaking around −6 dBFS, most under 30 KB.
- Ambient: stereo, around −28 LUFS, under 1 MB each. They play well under the effects (`AMBIENT` in `src/lib/sound.ts`).
- While a voice note plays, everything else drops back on its own.

## Where they come from

What the library has nothing for (the launch's clamps, catch, roar and water,
and the audio tour's two bookends) is made by ElevenLabs' sound generator from
a description (`MADE` in the script), once, and kept in `scripts/sound-kit/made/`.

Most are cut from a bought sound library with `npm run sounds -- <library folder>`.
`PICKS` in `scripts/sound-library.mjs` says which recording each event plays; change
a pick there and run it again (name events to redo only those:
`npm run sounds -- <folder> page-turn star`). It replaces every file of the events
it makes and leaves the others alone, so a sound it has no pick for (the launch's)
can still be dropped in by hand.
