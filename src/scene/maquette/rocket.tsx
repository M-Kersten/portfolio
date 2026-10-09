// The launch vehicle: a Starship stack, modelled in Blender
// (scripts/models/build_rocket.py, loaded by kit.ts). The pad draws the whole
// stack (launchSite.tsx: a ghost until it flies, stacked part by part
// as projects wake, and split in two at staging); the asteroids easter egg
// (components/GameRocket) flies the ship alone, since the booster stays behind.
//
// Body local space: Super Heavy's skirt on the launch mount at y 0.09, the
// hot-staging ring 0.49–0.505, Starship from there to its nose at 0.795. The
// heat shield faces +Z; the flaps stand on ±X.
//
// `parts` lets the pad assemble the vehicle as projects come alive (all pieces
// default on — the game always flies a complete ship); with `assemble`, a piece
// that mounts rises in with a little overshoot.
import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import type { BufferGeometry, Group } from 'three';
import { NEUTRAL } from './shared';
import { GHOST_FILL, GHOST_LINE } from './life';
import { Crease } from './materials';
import { loadRocketKit, useRocketKit } from './kit';

// fetch the model with the scene, not when the first piece is stacked
loadRocketKit().catch(() => {});

/** Where the stack starts (the skirt, on the mount), where the ship sits on
 *  the booster, and the nose tip — in the body's local Y. */
export const STACK_BASE = 0.09;
export const STAGING_Y = 0.505;
export const STACK_TIP = 0.795;
/** The stack's middle: the pad camera aims here. */
export const ROCKET_MID = (STACK_BASE + STACK_TIP) / 2;
/** The ship's middle. Wrap ShipBody in `position={[0, -SHIP_MID, 0]}` to turn
 *  it about its centre (the game spins it there). */
export const SHIP_MID = (STAGING_Y + STACK_TIP) / 2;

/** Which components of the stack exist (pad assembly). Omitted = present. */
export interface RocketParts {
  /** the booster's 33 engines, set on the mount first */
  engines?: boolean;
  booster?: boolean;
  fins?: boolean;
  /** the hot-staging ring on the booster's top */
  ring?: boolean;
  /** Starship itself, lifted on in one piece */
  ship?: boolean;
}

type Mode = 'ghost' | 'lit';
type Role = 'steel' | 'tiles' | 'engines' | 'dark';

/** Scales its children in with a touch of ease-out-back overshoot on mount —
 *  the assembly animation for pieces arriving at the pad. With `animate`
 *  false it's a plain group (reduced motion, and the game's complete ship). */
export function Rise({ animate, children }: { animate: boolean; children: ReactNode }) {
  const g = useRef<Group>(null);
  const t0 = useRef<number>(animate ? -1 : 0); // -1 = armed, 0 = done
  useFrame((s) => {
    if (t0.current === 0) return;
    const grp = g.current;
    if (!grp) return;
    if (t0.current < 0) t0.current = s.clock.elapsedTime;
    const p = Math.min(1, (s.clock.elapsedTime - t0.current) / 0.55);
    const e = 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2);
    grp.scale.setScalar(Math.max(0.001, e));
    if (p >= 1) {
      grp.scale.setScalar(1);
      t0.current = 0;
    }
  });
  return (
    <group ref={g} scale={animate ? 0.001 : 1}>
      {children}
    </group>
  );
}

/** One piece of the model, dressed for the pad's ghost or for flight.
 *
 *  Lit, it's a real vehicle: stainless steel that takes the key light and the
 *  engines' warm bounce, the heat shield (and the flaps' windward faces) a
 *  dark slate rather than black (against a near-black field, anything darker
 *  stops reading as hardware and starts reading as a hole), the engines
 *  darker metal.
 *
 *  NOTE on metalness: the game canvas has no environment map, so metalness
 *  has nothing to reflect and only eats the diffuse term; anything above ~0.3
 *  renders near-black whatever colour it's given. Keep it low and let the key
 *  light do the work. */
function Part({ geo, mode, role, opacity }: { geo: BufferGeometry; mode: Mode; role: Role; opacity: number }) {
  const lit = mode === 'lit';
  return (
    <mesh geometry={geo}>
      {!lit ? (
        <meshStandardMaterial color={GHOST_FILL} transparent opacity={opacity} />
      ) : role === 'steel' ? (
        <meshStandardMaterial color="#c4ced8" metalness={0.28} roughness={0.38} />
      ) : role === 'tiles' ? (
        <meshStandardMaterial color="#2e353d" metalness={0.04} roughness={0.82} />
      ) : role === 'engines' ? (
        <meshStandardMaterial color="#59636e" metalness={0.22} roughness={0.5} />
      ) : (
        <meshStandardMaterial color="#20262c" metalness={0.05} roughness={0.7} />
      )}
      {/* lit: faint panel seams, not neon piping — the shading carries the form */}
      <Crease threshold={30} color={lit ? NEUTRAL : GHOST_LINE} transparent opacity={lit ? 0.35 : 1} />
    </mesh>
  );
}

/** Super Heavy: its engines, hull, grid fins and hot-staging ring. */
export function BoosterBody({ mode = 'ghost', parts, assemble = false }: { mode?: Mode; parts?: RocketParts; assemble?: boolean }) {
  const kit = useRocketKit();
  if (!kit) return null;
  const p = { engines: true, booster: true, fins: true, ring: true, ...parts };
  return (
    <group>
      {p.engines && (
        <Rise animate={assemble}>
          <Part geo={kit.sh_engines} mode={mode} role="engines" opacity={0.45} />
        </Rise>
      )}
      {p.booster && (
        <Rise animate={assemble}>
          <Part geo={kit.sh_body} mode={mode} role="steel" opacity={0.3} />
        </Rise>
      )}
      {p.fins && (
        <Rise animate={assemble}>
          <Part geo={kit.sh_fins} mode={mode} role="steel" opacity={0.5} />
        </Rise>
      )}
      {p.ring && (
        <Rise animate={assemble}>
          <Part geo={kit.sh_ring} mode={mode} role="steel" opacity={0.42} />
          <Part geo={kit.sh_ring_core} mode={mode} role="dark" opacity={0.3} />
        </Rise>
      )}
    </group>
  );
}

/** Starship: its hull, heat shield, flaps and engines, all in one piece. */
export function ShipBody({ mode = 'ghost', assemble = false }: { mode?: Mode; assemble?: boolean }) {
  const kit = useRocketKit();
  if (!kit) return null;
  return (
    <Rise animate={assemble}>
      <Part geo={kit.ss_body} mode={mode} role="steel" opacity={0.3} />
      <Part geo={kit.ss_tiles} mode={mode} role="tiles" opacity={0.4} />
      <Part geo={kit.ss_flaps} mode={mode} role="steel" opacity={0.5} />
      <Part geo={kit.ss_flaps_tiles} mode={mode} role="tiles" opacity={0.5} />
      <Part geo={kit.ss_engines} mode={mode} role="engines" opacity={0.45} />
    </Rise>
  );
}

/** The whole stack, booster under ship. */
export function RocketBody({ mode = 'ghost', parts, assemble = false }: { mode?: Mode; parts?: RocketParts; assemble?: boolean }) {
  const ship = parts?.ship ?? true;
  return (
    <group>
      <BoosterBody mode={mode} parts={parts} assemble={assemble} />
      {ship && <ShipBody mode={mode} assemble={assemble} />}
    </group>
  );
}
