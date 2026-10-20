// What each project's film shows, printed under it in the book. A line in my
// own voice about what you're looking at, rather than a catalogue number.
//
// These live here rather than in cases.json: the CMS round-trips that file
// against a fixed model, and a key it doesn't know would be dropped on the
// next publish. Each one was drafted from the film's own title on YouTube and
// its poster: worth a rewrite once you've watched them back.
const FILMS: Record<string, string> = {
  preekstof: 'The Preekstof film: a sermon clip going from a wide shot to a vertical reel, with the crop following the speaker and the subtitles in place.',
  'virtuele-brigade': 'A look inside the Virtuele Brigade training sim, the shared scenarios I brought multiplayer and VR to.',
  'alliander-hololens':
    "A break-out session on AR in the energy transition, from The Future Group's Innovation Event 2023, with the suite seen through the HoloLens (in Dutch).",
  arcam: 'ARCam on location: visitors posing with the characters in front of the camera on its pedestal.',
  'wonderment-location': 'A demo of the Airborne tour: AR pinned to the places of Operation Market Garden with VPS.',
  'dtt-amsterdam': 'A reel of the DTT projects: the reading games, the space experience and the AR showcase app.',
  'lightship-drive': 'Lightship Drive: little AR cars racing across a real table, and the crown changing hands.',
  'zwijsen-ar-books': 'The app for De droomreis van neef Karel, shown by a speech-therapy practice: seek-and-find on the pages, then the audiobook.',
  'popcore-games': 'A showreel of the Popcore games I worked on.',
  'philips-medical-xr': 'A Unity webinar with Philips on XR in minimally invasive care, the field this research was for.',
  'amsterdam-ai': 'The Step into Amsterdam demo: conversations with the AI locals.',
  'custom-ar-framework': 'AR samples built on the framework, one of them shared between an Android phone and an iPhone through cloud anchors.',
  kastwezens: 'Wonderkasten in the woods: a drawn butterfly, scanned, flying off between the cabinets.',
  'land-of-the-midnight-sun': 'Land of the Midnight Sun: the girl and her owl crossing the northern wilderness.',
  'sol-ar': 'SOL.AR gameplay: the solar system at scale in a room, and the trips down to the planets.',
  'amsterdam-underground': 'The trailer for UnderAmsterdam, the multiplayer VR game about the world under the city’s streets.',
  'nieuwe-kerk-utrecht': 'Nieuwe Kerk Utrecht’s own introduction video: the community the visuals are made for.',
};

/** What a project's film shows, if it has a line. */
export const filmCaption = (slug: string): string | undefined => FILMS[slug];
