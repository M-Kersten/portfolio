import { useSyncExternalStore } from 'react';
import type { TwinAttribute } from '../data/places';

// One renderer, two scenes (§6). DOM components (hotspots, routes, overlay) and
// the in-Canvas components (CameraRig, scenes) live in different React
// reconcilers, so they coordinate through this tiny module-level store rather
// than React context — no context bridging into <Canvas> required.

export type SceneMode = 'maquette' | 'twin';

interface SceneState {
  mode: SceneMode;
  /** Which maquette layer the camera is focused on (0..2), or null = establishing shot. */
  focusLayer: number | null;
  /** Active place id for the twin (allowlist-resolved elsewhere). */
  placeId: string;
  /** Flips true once the twin establishing move has settled and orbit is live. */
  twinSettled: boolean;
  /** Increment to request a one-shot "reset view" back to the establishing shot. */
  resetNonce: number;
  /** Attribute the twin buildings are coloured by (§5.5). */
  twinAttribute: TwinAttribute;
  /** True when the twin is showing the synthetic placeholder, not a baked 3DBAG
   *  model — drives the honest caption so attribution never claims fake data. */
  twinPlaceholder: boolean;
}

let state: SceneState = {
  mode: 'maquette',
  focusLayer: null,
  placeId: '',
  twinSettled: false,
  resetNonce: 0,
  twinAttribute: 'bouwjaar',
  twinPlaceholder: false,
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
  setMode(mode: SceneMode) {
    if (mode !== state.mode) set({ mode, twinSettled: false, focusLayer: null });
  },
  setPlace(placeId: string) {
    if (placeId !== state.placeId) set({ placeId, twinSettled: false });
  },
  focus(focusLayer: number | null) {
    set({ focusLayer });
  },
  markTwinSettled() {
    if (!state.twinSettled) set({ twinSettled: true });
  },
  resetTwinView() {
    set({ resetNonce: state.resetNonce + 1, twinSettled: false });
  },
  setTwinAttribute(twinAttribute: TwinAttribute) {
    if (twinAttribute !== state.twinAttribute) set({ twinAttribute });
  },
  setTwinPlaceholder(twinPlaceholder: boolean) {
    if (twinPlaceholder !== state.twinPlaceholder) set({ twinPlaceholder });
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
