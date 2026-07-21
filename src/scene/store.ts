import { useSyncExternalStore } from 'react';
import { Vector3 } from 'three';
import { HOTSPOTS } from './framing';

/** Wall-clock moment the app first loaded. The boot sequence sequences off this
 *  one shared clock so the DOM beats (header → name → subhead) and the 3D beat
 *  (the maquette powering on) stay in order across the two React reconcilers. */
export const bootAt = typeof performance !== 'undefined' ? performance.now() : 0;
/** ms after boot that the maquette powers on — its beat, after the hero text
 *  (header ~0.1s · name decode ~0.4–0.9s · subhead ~1.05–1.4s · then this). */
export const MAQUETTE_BOOT = 1450;

/** The launch easter egg's stage machine (see city.tsx LaunchSite +
 *  components/LaunchOverlay). 'pad' = camera on the rocket, LAUNCH shown;
 *  'countdown' = T-minus running; 'ascend' = rocket flying, camera chasing;
 *  'game' = the asteroids overlay is up. */
export type LaunchStage = 'idle' | 'pad' | 'countdown' | 'ascend' | 'game';

/** Where the rocket is RIGHT NOW, in world space — written by the rocket every
 *  frame, read by the CameraRig to aim at the pad and chase the ascent. Plain
 *  mutable vector (per-frame data, deliberately not reactive state). */
export const launchTrack = new Vector3(0, 0, 0);

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
  /** Set (once, to performance.now()) the moment every hotspot has been
   *  visited — "all systems live". Drives the 10/10 tally state. */
  completedAt: number | null;
  /** True between waking the 10th project and closing its HUD — the close
   *  handler consumes it to run the homecoming (scroll to the City layer). */
  celebrationPending: boolean;
  /** The homecoming moment: set when the 10th node is deselected. Anchors the
   *  celebration — the particle burst, the bloom surge and the ghost
   *  "next launch" pad materialising — so it all happens in full view. */
  celebrateAt: number | null;
  /** The launch easter egg's current stage (idle when not engaged). */
  launch: LaunchStage;
}

let state: SceneState = {
  journeyStep: 0,
  selectedSlug: null,
  hoveredSlug: null,
  visited: [],
  completedAt: null,
  celebrationPending: false,
  celebrateAt: null,
  launch: 'idle',
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
    if (selectedSlug !== state.selectedSlug) set({ selectedSlug });
  },
  setHovered(hoveredSlug: string | null) {
    if (hoveredSlug !== state.hoveredSlug) set({ hoveredSlug });
  },
  markVisited(slug: string) {
    if (state.visited.includes(slug)) return;
    const visited = [...state.visited, slug];
    const complete = state.completedAt === null && HOTSPOTS.every((h) => visited.includes(h.slug));
    set(complete ? { visited, completedAt: performance.now(), celebrationPending: true } : { visited });
  },
  /** Consume the pending celebration (called when the 10th node's HUD closes). */
  celebrate() {
    if (state.celebrationPending) set({ celebrationPending: false, celebrateAt: performance.now() });
  },
  setLaunch(launch: LaunchStage) {
    if (launch !== state.launch) set({ launch });
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
