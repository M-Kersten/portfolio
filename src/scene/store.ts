import { useSyncExternalStore } from 'react';
import { HOTSPOTS } from './framing';

/** Wall-clock moment the app first loaded. The boot sequence sequences off this
 *  one shared clock so the DOM beats (header → name → subhead) and the 3D beat
 *  (the maquette powering on) stay in order across the two React reconcilers. */
export const bootAt = typeof performance !== 'undefined' ? performance.now() : 0;
/** ms after boot that the maquette powers on — its beat, after the hero text
 *  (header ~0.1s · name decode ~0.4–0.9s · subhead ~1.05–1.4s · then this). */
export const MAQUETTE_BOOT = 1450;
/** The opening dolly, shared between the camera that runs it (CameraRig) and
 *  what holds still for it: the model's power-on scale and its pointer
 *  parallax would each read as the camera changing speed mid-move. A plain
 *  value rather than store state: it's read every frame, and set by the rig. */
export const opening = { dollying: false };
/** Whether this browser has seen the opening before (the intro card marks it
 *  once it has played). A returning visitor gets a shorter way in: no premise
 *  card, a quicker dolly. Read once, at load. */
const INTRO_KEY = 'mk-intro-seen';
export const returning = (() => {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
})();
export function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_KEY, '1');
  } catch {
    /* storage blocked: the card just plays again next time */
  }
}

/** The launch easter egg's stage machine (see maquette/launchSite.tsx +
 *  components/LaunchOverlay). 'pad' = camera on the rocket, LAUNCH shown;
 *  'countdown' = the film's terminal count; 'ascend' = the film from liftoff
 *  on (the scene moves it along, on the flight plan's clock); 'game' = the
 *  asteroids overlay is up. */
export type LaunchStage = 'idle' | 'pad' | 'countdown' | 'ascend' | 'game';

// One renderer, one scene. DOM components (hotspots, routes, overlay) and the
// in-Canvas components (CameraRig, scene) live in different React reconcilers,
// so they coordinate through this tiny module-level store rather than React
// context — no context bridging into <Canvas> required.

interface SceneState {
  /** Which layer the scroll journey has centred: 0 = City (top), 1 = Room, 2 = Chip. */
  journeyStep: number;
  /** The inspected node's case slug, or null in the overview. Drives the zoom +
   *  the bottom HUD + hiding the title. */
  selectedSlug: string | null;
  /** The hovered project dot's slug, or null. Drives the hover highlight on the
   *  object that project is attached to. */
  hoveredSlug: string | null;
  /** Slugs the visitor has opened at least once. Their objects stay "alive"
   *  (lifelike colour + a gentle idle), so exploring brings the scene to life. */
  visited: string[];
  /** How many woken projects the model SHOWS: it trails `visited` and steps
   *  only once a project's dossier has closed and the camera has zoomed back
   *  out (HeroStage sets it), so the tally ticks and the rocket's next piece
   *  rises on the pad at the same moment, in view, rather than while the
   *  visitor is still looking at a close-up. */
  settled: number;
  /** Set (once, to performance.now()) the moment every hotspot has been
   *  visited — "all systems live". Drives the 10/10 tally state. */
  completedAt: number | null;
  /** True between waking the 10th project and closing its HUD — the close
   *  handler consumes it to run the homecoming (scroll to the City layer). */
  celebrationPending: boolean;
  /** The homecoming moment: set when the 10th node is deselected. Anchors the
   *  celebration — the particle burst and the ghost "next launch" pad
   *  materialising — so it all happens in full view. */
  celebrateAt: number | null;
  /** The launch easter egg's current stage (idle when not engaged). */
  launch: LaunchStage;
  /** True once the load intro (the movie-intro title card) has finished or been
   *  dismissed. Held false during the intro so the hero title + subtitle + the
   *  bottom instrument line reveal *after* the premise card, never on top of it. */
  introOver: boolean;
  /** Where the just-selected object sits on screen at the moment of selection
   *  (viewport %), tagged with its slug — the porthole reticle snaps onto this
   *  point and then flies to the ring centre as the camera zooms in. `pos` is null
   *  when the target is off-screen or motion is reduced (reticle opens centred);
   *  the whole field is null in the overview. Written once per selection by the
   *  CameraRig (it has the camera); read by the DOM FocusReticle. */
  reticleStart: { slug: string; pos: { x: number; y: number } | null } | null;
  /** False for the moment right after picking a node, while CameraRig's push-in
   *  is still travelling; true once it's arrived (or immediately, under reduced
   *  motion / in the overview). useActive ANDs this into `selected`, so every
   *  in-scene "coming alive" reaction — the life system, the bounce-on-select,
   *  the bespoke per-object wake-ups — waits for the zoom rather than firing
   *  mid-swoop. Written by CameraRig every frame; read via useActive. */
  zoomSettled: boolean;
  /** The first-visit cue: until the visitor opens a first project, the hero
   *  states the premise and one crosshair per layer asks to be clicked. Starts
   *  false for a returning visitor who has already opened one (CUE_KEY), and
   *  retires for good on the first open. */
  cue: boolean;
  /** True once the hero's load sequence has played (the title decoded, the
   *  bottom instrument line up). The cue waits for it, so it arrives as the
   *  last beat of the boot rather than on top of the others. Set by HeroStage. */
  booted: boolean;
}

/** The woken projects, remembered in a cookie so a returning visitor finds
 *  the model as they left it (a functional first-party cookie: it holds the
 *  slugs and nothing else, and never leaves this browser for anywhere but this
 *  site). Only slugs that are still hotspots count. */
const WOKEN_COOKIE = 'mk-woken';
const YEAR = 60 * 60 * 24 * 365;
function readWoken(): string[] {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${WOKEN_COOKIE}=([^;]*)`));
    if (!m) return [];
    const slugs = decodeURIComponent(m[1]).split(',');
    return HOTSPOTS.map((h) => h.slug).filter((slug) => slugs.includes(slug));
  } catch {
    return [];
  }
}
function writeWoken(visited: string[]) {
  try {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    const value = encodeURIComponent(visited.join(','));
    document.cookie = visited.length
      ? `${WOKEN_COOKIE}=${value}; Max-Age=${YEAR}; Path=/; SameSite=Lax${secure}`
      : `${WOKEN_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
  } catch {
    /* cookies blocked: the model just starts dark next time */
  }
}
const woken = typeof document !== 'undefined' ? readWoken() : [];
const wokenAll = woken.length === HOTSPOTS.length;
/** A moment long past, for a model that was already complete when the page
 *  loaded: everything that plays out from the celebration (the burst, the pad
 *  lighting) reads as long finished, and the launch is simply there. */
const LONG_AGO = -1e7;

/** localStorage flag: this browser has opened a project, so the cue is done. */
const CUE_KEY = 'mk-model-hint';
function cueDone(): boolean {
  try {
    return localStorage.getItem(CUE_KEY) === '1';
  } catch {
    return true; // storage blocked: skip the cue rather than risk nagging on every visit
  }
}

let state: SceneState = {
  journeyStep: 0,
  selectedSlug: null,
  hoveredSlug: null,
  visited: woken,
  settled: woken.length,
  completedAt: wokenAll ? LONG_AGO : null,
  celebrationPending: false,
  celebrateAt: wokenAll ? LONG_AGO : null,
  launch: 'idle',
  introOver: false,
  reticleStart: null,
  zoomSettled: true,
  cue: typeof window !== 'undefined' && woken.length === 0 && !cueDone(),
  booted: false,
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function set(patch: Partial<SceneState>) {
  state = { ...state, ...patch };
  emit();
}

export const sceneStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  snapshot: () => state,
  setJourneyStep(journeyStep: number) {
    if (journeyStep !== state.journeyStep) set({ journeyStep });
  },
  setSelected(selectedSlug: string | null) {
    if (selectedSlug === state.selectedSlug) return;
    // zoomSettled is latched here, in the SAME update as the selection — never a
    // frame later by the CameraRig. When the rig owned both edges there was a
    // one-frame window where consumers saw selected=true against a settled flag
    // still left true by the overview, so every wake animation fired at once,
    // got yanked back when the rig caught up, then fired AGAIN after the delay.
    // The rig now only ever releases it (see ZOOM_SETTLE there).
    const patch: Partial<SceneState> = { selectedSlug, zoomSettled: selectedSlug === null };
    // the first open is the moment the cue has done its job
    if (selectedSlug && state.cue) {
      patch.cue = false;
      try {
        localStorage.setItem(CUE_KEY, '1');
      } catch {
        /* fine: it shows again next visit */
      }
    }
    set(patch);
  },
  setHovered(hoveredSlug: string | null) {
    if (hoveredSlug !== state.hoveredSlug) set({ hoveredSlug });
  },
  markVisited(slug: string) {
    if (state.visited.includes(slug)) return;
    const visited = [...state.visited, slug];
    const complete = state.completedAt === null && HOTSPOTS.every((h) => visited.includes(h.slug));
    if (HOTSPOTS.some((h) => h.slug === slug)) writeWoken(visited.filter((v) => HOTSPOTS.some((h) => h.slug === v)));
    set(complete ? { visited, completedAt: performance.now(), celebrationPending: true } : { visited });
  },
  /** The model catches up with the visits (see `settled`). */
  settle(settled: number) {
    if (settled !== state.settled) set({ settled });
  },
  /** Start the tour over: every project dark again, the pad back to a survey
   *  plot, and the cookie cleared. */
  resetVisited() {
    writeWoken([]);
    set({ visited: [], settled: 0, completedAt: null, celebrationPending: false, celebrateAt: null });
  },
  /** Consume the pending celebration (called when the 10th node's HUD closes). */
  celebrate() {
    if (state.celebrationPending) set({ celebrationPending: false, celebrateAt: performance.now() });
  },
  setLaunch(launch: LaunchStage) {
    if (launch !== state.launch) set({ launch });
  },
  /** Mark the load intro finished — releases the hero chrome (idempotent). */
  endIntro() {
    if (!state.introOver) set({ introOver: true });
  },
  /** Mark the hero's load sequence played out (idempotent). */
  setBooted() {
    if (!state.booted) set({ booted: true });
  },
  /** Record where the reticle should acquire the target (see reticleStart). */
  setReticleStart(reticleStart: SceneState['reticleStart']) {
    set({ reticleStart });
  },
  setZoomSettled(zoomSettled: boolean) {
    if (zoomSettled !== state.zoomSettled) set({ zoomSettled });
  },
};

/** Subscribe to a primitive slice of scene state (keep selectors primitive). */
export function useSceneSelector<T>(selector: (s: SceneState) => T): T {
  return useSyncExternalStore(
    sceneStore.subscribe,
    () => selector(state),
    () => selector(state),
  );
}
