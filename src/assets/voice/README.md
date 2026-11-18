# Voice notes: the audio tour

One short recording per project, of me talking about it. Name the file after
the project's slug (its `slug` in `src/content/cases.json`), for example:

    alliander-hololens.mp3
    virtuele-brigade.m4a

`.mp3`, `.m4a`, `.ogg` and `.webm` all work. Drop the file in this folder and
the audio tour appears on that project's label and in its book ("Audio tour ·
in my own words", keyed with the exhibit number). A project without a file
shows no button.

Exhibit 11, the next launch on the pad, has one too: name it `next-launch.mp3`
and it plays as that label's audio tour ("Audio tour · the countdown").

`npm run voice -- <folder with recordings>` makes them from raw recordings: the
audio-guide sound, then a frame round each: a button and a short tone as the handset starts the track,
an announcer saying which stop it is ("Exhibit 3. ARCam."), the recording, and
a tone and a click as it ends. `npm run voice -- --frame` puts the frame on files
already here (once: a framed file is marked, and left alone after that). The
two bookends are in `scripts/voice-kit/`, and so are the announcer's lines once
they're made (`announcer/<slug>.mp3`): a line that's there is used as it is, so
you can record one yourself or swap one. A missing line is made by ElevenLabs
if `.env.local` has an `ELEVENLABS_API_KEY` (it's sent the line's text, nothing
else), and otherwise by the computer's own voice. `--say-again` makes them all
anew; `--frame --from=<commit>` frames files again from how they were at a
commit, before they were framed. How a name is said is `SAY` in
`scripts/voice-tour.mjs`.

Keep them short (a minute or two) and small: mono, around 64–96 kbps is plenty
for a voice.
