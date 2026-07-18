// The launch vehicle, shared by the pad (city.tsx NextProjectSite, ghost until
// it flies) and the asteroids easter egg (components/GameRocket, lit — it IS
// the player's ship in 3D). Body local space: tail at y≈0.09, nose tip at
// y≈0.72, so its visual centre is ≈0.4 (the game offsets by that to spin it
// about the middle). Just the vehicle — the pad keeps its own exhaust + click.
//
// `parts` lets the pad assemble the vehicle piece by piece as signals come
// alive (all pieces default on — the game always flies a complete rocket);
// with `assemble`, a piece that mounts rises in with a little overshoot.
import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import type { Group } from 'three';
import { GHOST_FILL, GHOST_LINE } from './life';

const FINS: [number, number][] = [[-0.042, 0], [0.042, 0], [0, -0.042], [0, 0.042]];
const LEGS: [number, number][] = [[-0.03, 0.03], [0.03, 0.03], [-0.03, -0.03], [0.03, -0.03]];

/** The rocket's visual centre in local Y — wrap it in `position={[0,-ROCKET_MID,0]}`
 *  to pivot about the middle (the game spins it there). */
export const ROCKET_MID = 0.4;

/** Which components of the stack exist (pad assembly). Omitted = present. */
export interface RocketParts {
  legs?: boolean;
  booster?: boolean;
  fins?: boolean;
  interstage?: boolean;
  nose?: boolean;
}

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

export function RocketBody({ mode = 'ghost', parts, assemble = false }: { mode?: 'ghost' | 'lit'; parts?: RocketParts; assemble?: boolean }) {
  const lit = mode === 'lit';
  const line = lit ? '#27e8f2' : GHOST_LINE;
  const p = { legs: true, booster: true, fins: true, interstage: true, nose: true, ...parts };
  // hull: ghost = faint frosted glass; lit = a lit teal solid that reads on
  // black (bright enough to catch light, with cyan edges drawing the outline)
  const Hull = ({ opacity }: { opacity: number }) =>
    lit ? (
      <meshStandardMaterial color="#173d47" metalness={0.3} roughness={0.45} emissive="#1c7183" emissiveIntensity={0.8} />
    ) : (
      <meshStandardMaterial color={GHOST_FILL} transparent opacity={opacity} />
    );
  // struts (fins + legs)
  const Strut = ({ opacity }: { opacity: number }) =>
    lit ? (
      <meshStandardMaterial color="#2fd4e6" emissive="#27e8f2" emissiveIntensity={0.5} roughness={0.4} toneMapped={false} />
    ) : (
      <meshStandardMaterial color={GHOST_LINE} transparent opacity={opacity} />
    );
  return (
    <group>
      {p.booster && (
        <Rise animate={assemble}>
          <mesh position={[0, 0.09 + 0.21, 0]}>
            <cylinderGeometry args={[0.034, 0.036, 0.42, 14]} />
            <Hull opacity={0.32} />
            <Edges threshold={30} color={line} />
          </mesh>
        </Rise>
      )}
      {p.interstage && (
        <Rise animate={assemble}>
          {/* interstage / upper stage */}
          <mesh position={[0, 0.09 + 0.42 + 0.055, 0]}>
            <cylinderGeometry args={[0.03, 0.034, 0.11, 14]} />
            <Hull opacity={0.36} />
            <Edges threshold={30} color={line} />
          </mesh>
        </Rise>
      )}
      {p.nose && (
        <Rise animate={assemble}>
          {/* nose cone — the crowning piece */}
          <mesh position={[0, 0.09 + 0.53 + 0.05, 0]}>
            <coneGeometry args={[0.03, 0.1, 14]} />
            <Hull opacity={0.4} />
            <Edges threshold={30} color={line} />
          </mesh>
        </Rise>
      )}
      {p.fins && (
        <Rise animate={assemble}>
          {/* grid fins, folded */}
          {FINS.map(([x, z], i) => (
            <mesh key={`f${i}`} position={[x, 0.475, z]} rotation={[0, i < 2 ? 0 : Math.PI / 2, 0]}>
              <boxGeometry args={[0.008, 0.034, 0.026]} />
              <Strut opacity={0.55} />
            </mesh>
          ))}
        </Rise>
      )}
      {p.legs && (
        <Rise animate={assemble}>
          {/* landing legs against the tail */}
          {LEGS.map(([x, z], i) => (
            <mesh key={`l${i}`} position={[x * 1.15, 0.15, z * 1.15]} rotation={[z === 0 ? 0 : z > 0 ? -0.12 : 0.12, 0, x === 0 ? 0 : x > 0 ? 0.12 : -0.12]}>
              <boxGeometry args={[0.008, 0.13, 0.008]} />
              <Strut opacity={0.5} />
            </mesh>
          ))}
        </Rise>
      )}
    </group>
  );
}
