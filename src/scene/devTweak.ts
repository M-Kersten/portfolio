import { useControls } from 'leva';

type V3 = [number, number, number];

export interface TweakInit {
  position: V3;
  /** also add a Y-rotation slider (radians) */
  rotationY?: number;
  /** slider half-range around the seed position, world units (default 3) */
  range?: number;
}

export interface Tweaked {
  position: V3;
  rotationY: number;
}

/**
 * DEV-ONLY transform scrubber for placing maquette objects by eye.
 *
 * In `vite dev` this adds x / y / z (and an optional rotationY) slider group to
 * the leva panel — nested by the dotted `name`, e.g. 'Room.Desk' renders as
 * Room ▸ Desk — seeded at the object's current transform, and returns the live
 * values. Drag an object around in the browser, then copy the numbers from the
 * panel back into the source as the new literals.
 *
 * In a production build `import.meta.env.DEV` is statically replaced with
 * `false`, so this returns the seed immediately and Vite tree-shakes the leva
 * import out of the bundle — leva never ships to production (asserted by the
 * build-size check in the repo notes).
 *
 * Caveats:
 * - Sliders seed from the FIRST render's values; editing the source under HMR
 *   for the same live instance won't reseed them — do a full page refresh.
 * - Objects anchored to a hotspot (desk monitor, AR table, bookcase, park,
 *   town hall) also need their `anchor` in framing.ts updated by hand once you
 *   settle on a new position, or the leader line will point at the old spot.
 */
export function useTweak(name: string, init: TweakInit): Tweaked {
  const rot0 = init.rotationY ?? 0;
  // The leva path lives inside `if (import.meta.env.DEV) { ... }` rather than
  // behind an early-return guard ON PURPOSE: Vite replaces the flag with a
  // literal at build time, and Rollup drops a whole `if (false) {}` block (and
  // with it the only `useControls` reference, so leva tree-shakes away). It does
  // NOT treat statements after an early `return` as dead, which would keep leva
  // in the bundle. Rules-of-hooks is satisfied because the flag is constant
  // within any single build: in dev the branch is always taken, in prod the
  // whole function is eliminated.
  if (import.meta.env.DEV) {
    const [x, y, z] = init.position;
    const r = init.range ?? 3;
    const schema: Record<string, { value: number; min: number; max: number; step: number }> = {
      x: { value: x, min: x - r, max: x + r, step: 0.01 },
      y: { value: y, min: y - r, max: y + r, step: 0.01 },
      z: { value: z, min: z - r, max: z + r, step: 0.01 },
    };
    if (init.rotationY !== undefined) {
      schema.rotationY = { value: rot0, min: rot0 - Math.PI, max: rot0 + Math.PI, step: 0.01 };
    }
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const v = useControls(name, schema) as Record<string, number>;
    return { position: [v.x, v.y, v.z], rotationY: v.rotationY ?? rot0 };
  }
  return { position: init.position, rotationY: rot0 };
}
