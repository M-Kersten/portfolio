// The launch complex the vehicle is stacked on (launchSite.tsx places it and
// drives its moving parts from the flight plan):
//
//   LaunchMount  the orbital launch mount: a ring table on six legs that the
//                booster's skirt sits on (its engines fire down through the
//                hole), the water-cooled steel deflector plate under it, and
//                the booster's quick-disconnect hood, which drops away at
//                liftoff
//   LaunchTower  the tower: a square steel lattice, the "chopsticks" — two
//                long arms on a carriage that rides up and down its face (they
//                stacked the vehicle, they're parked high and open for the
//                launch, and they catch the booster when it comes home) — and
//                the ship's quick-disconnect arm, which swings back to the
//                tower in the terminal count
//
// Both are built in the same pieces the site assembles as projects wake, and
// in the same two dresses as the vehicle: a ghost while it's being built,
// steel once the site is complete.
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { BoxGeometry, BufferGeometry, CylinderGeometry, Matrix4, Quaternion, Vector3, type Group } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GHOST_LINE } from './life';
import { Crease } from './materials';
import { NEUTRAL } from './shared';
import { Rise } from './rocket';

type Mode = 'ghost' | 'lit';

/** A thin square strut from a to b, baked into its own geometry. */
function strut(a: Vector3, b: Vector3, t: number): BufferGeometry {
  const d = new Vector3().subVectors(b, a);
  const g = new BoxGeometry(t, d.length(), t);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
  g.applyMatrix4(new Matrix4().compose(new Vector3().addVectors(a, b).multiplyScalar(0.5), q, new Vector3(1, 1, 1)));
  return g;
}
/** A box at a point, baked. */
function block(w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry {
  return new BoxGeometry(w, h, d).translate(x, y, z);
}

function Steel({ geo, mode, tone = 'steel', ghost = 0.45, edges = false }: { geo: BufferGeometry; mode: Mode; tone?: 'steel' | 'dark' | 'concrete'; ghost?: number; edges?: boolean }) {
  const lit = mode === 'lit';
  return (
    <mesh geometry={geo}>
      {!lit ? (
        <meshStandardMaterial color={GHOST_LINE} transparent opacity={ghost} />
      ) : tone === 'steel' ? (
        <meshStandardMaterial color="#6d7883" metalness={0.3} roughness={0.5} />
      ) : tone === 'dark' ? (
        <meshStandardMaterial color="#3b434c" metalness={0.25} roughness={0.6} />
      ) : (
        <meshStandardMaterial color="#454c54" metalness={0.02} roughness={0.9} />
      )}
      {edges && <Crease threshold={30} color={lit ? NEUTRAL : GHOST_LINE} transparent opacity={lit ? 0.3 : 0.8} />}
    </mesh>
  );
}

/* ---------- the mount ---------- */

/** The mount's ring: its top is where the booster's skirt sits. */
export const MOUNT_TOP = 0.09;

export interface MountApi {
  /** The booster quick-disconnect: 0 attached, 1 dropped away. */
  set(bqd: number): void;
}

export const LaunchMount = forwardRef<MountApi, { mode: Mode; animate: boolean; towerDir: number }>(function LaunchMount({ mode, animate, towerDir }, ref) {
  const hood = useRef<Group>(null);
  const geo = useMemo(() => {
    // the ring table: a thick annulus the engines fire down through
    const ring = new CylinderGeometry(0.05, 0.05, 0.022, 40, 1, true).translate(0, MOUNT_TOP - 0.011, 0);
    const inner = new CylinderGeometry(0.033, 0.033, 0.022, 40, 1, true).translate(0, MOUNT_TOP - 0.011, 0);
    const top = new CylinderGeometry(0.05, 0.05, 0.002, 40).translate(0, MOUNT_TOP - 0.001, 0);
    // six legs splayed a touch outward, and a band joining them low down
    const legs: BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * (i + 0.5)) / 6;
      const r0 = 0.044;
      const r1 = 0.056;
      legs.push(strut(new Vector3(Math.sin(a) * r0, MOUNT_TOP - 0.02, Math.cos(a) * r0), new Vector3(Math.sin(a) * r1, 0, Math.cos(a) * r1), 0.011));
    }
    // twenty hold-down clamps round the skirt
    const clamps: BufferGeometry[] = [];
    for (let i = 0; i < 20; i++) {
      const a = (Math.PI * 2 * i) / 20;
      clamps.push(block(0.004, 0.006, 0.006, 0, MOUNT_TOP + 0.003, 0.034).applyMatrix4(new Matrix4().makeRotationY(a)));
    }
    const frame = mergeGeometries([ring, inner, top, ...legs])!;
    // the steel deflector plate under it, and the slab
    const plate = new CylinderGeometry(0.062, 0.066, 0.01, 40).translate(0, 0.006, 0);
    return { frame, clamps: mergeGeometries(clamps)!, plate };
  }, []);
  useImperativeHandle(
    ref,
    () => ({
      set(bqd) {
        const h = hood.current;
        if (!h) return;
        // hinged at its outer edge: it swings down and away, and drops
        h.rotation.x = bqd * 1.25;
        h.position.y = -bqd * 0.012;
      },
    }),
    [],
  );
  return (
    <Rise animate={animate}>
      <Steel geo={geo.frame} mode={mode} tone="dark" ghost={0.55} edges />
      <Steel geo={geo.clamps} mode={mode} tone="steel" ghost={0.4} />
      <Steel geo={geo.plate} mode={mode} tone="concrete" ghost={0.3} />
      {/* the booster quick-disconnect hood, on the tower's side of the ring */}
      <group rotation={[0, towerDir, 0]}>
        <group position={[0, MOUNT_TOP + 0.002, 0.038]}>
          <group ref={hood}>
            <mesh position={[0, 0.009, 0.004]}>
              <boxGeometry args={[0.018, 0.018, 0.012]} />
              {mode === 'lit' ? <meshStandardMaterial color="#59636e" metalness={0.25} roughness={0.55} /> : <meshStandardMaterial color={GHOST_LINE} transparent opacity={0.5} />}
            </mesh>
          </group>
        </group>
      </group>
    </Rise>
  );
});

/* ---------- the tower ---------- */

/** The tower's square, its height, and the face the chopsticks ride on. */
const W = 0.058;
export const TOWER_H = 0.86;
const LEVEL = 0.0625;

export interface TowerApi {
  /** The chopsticks' carriage height and how far each arm is swung open
   *  (radians), and the ship QD arm: 0 on the ship, 1 swung back. */
  set(arms: { y: number; open: number }, qd: number): void;
}

/** `reach` is how far the stack's axis is from the tower's centre; the tower
 *  is turned so its +z face looks at it. */
export const LaunchTower = forwardRef<
  TowerApi,
  { mode: Mode; animate: boolean; lower: boolean; upper: boolean; arms: boolean; reach: number; beacon: React.ReactNode }
>(function LaunchTower({ mode, animate, lower, upper, arms, reach, beacon }, ref) {
  const carriage = useRef<Group>(null);
  const left = useRef<Group>(null);
  const right = useRef<Group>(null);
  const qd = useRef<Group>(null);
  const geo = useMemo(() => {
    const h = W / 2;
    const lo: BufferGeometry[] = [];
    const hi: BufferGeometry[] = [];
    const base = 0.03;
    const levels = Math.round((TOWER_H - base) / LEVEL);
    const corners: [number, number][] = [[-h, -h], [h, -h], [h, h], [-h, h]];
    for (let i = 0; i < levels; i++) {
      const y0 = base + i * LEVEL;
      const y1 = y0 + LEVEL;
      const into = y1 <= base + (TOWER_H - base) * 0.42 ? lo : hi;
      // the four legs, a section at a time
      for (const [x, z] of corners) into.push(strut(new Vector3(x, y0, z), new Vector3(x, y1, z), 0.0085));
      // a girder ring at the top of the section
      for (let k = 0; k < 4; k++) {
        const [ax, az] = corners[k];
        const [bx, bz] = corners[(k + 1) % 4];
        into.push(strut(new Vector3(ax, y1, az), new Vector3(bx, y1, bz), 0.0045));
        // and an X across each face
        into.push(strut(new Vector3(ax, y0, az), new Vector3(bx, y1, bz), 0.0028));
        into.push(strut(new Vector3(bx, y0, bz), new Vector3(ax, y1, az), 0.0028));
      }
    }
    // the crown: a deck on top and the lightning mast
    hi.push(block(W + 0.012, 0.012, W + 0.012, 0, TOWER_H + 0.006, 0));
    hi.push(strut(new Vector3(0, TOWER_H + 0.012, 0), new Vector3(0, TOWER_H + 0.1, 0), 0.0035));
    // the slab it stands on
    const slab = block(0.15, base, 0.15, 0, base / 2, 0);
    // the chopsticks: a carriage wrapping the tower, two long arms
    const carriageGeo = mergeGeometries([
      block(W + 0.03, 0.05, 0.016, 0, 0, h + 0.008),
      block(0.008, 0.05, W + 0.02, -h - 0.012, 0, 0),
      block(0.008, 0.05, W + 0.02, h + 0.012, 0, 0),
    ])!;
    const ARM = reach + 0.035;
    const arm = mergeGeometries([
      // a deep box beam, its root at the pivot, running out along +z
      block(0.0075, 0.02, ARM, 0, 0, ARM / 2),
      // the rail along its top the grid fins land on, and the bumper at its tip
      block(0.011, 0.003, ARM * 0.6, 0, 0.0115, ARM * 0.62),
      block(0.012, 0.024, 0.008, 0, 0, ARM - 0.004),
    ])!;
    // the ship QD arm: a truss out to the ship's skirt with a hood at its end
    const QD = reach - W / 2 - 0.03;
    const qdArm = mergeGeometries([
      block(0.012, 0.016, QD, 0, 0, QD / 2),
      block(0.02, 0.026, 0.012, 0, 0, QD - 0.004),
    ])!;
    return { lo: mergeGeometries(lo)!, hi: mergeGeometries(hi)!, slab, carriageGeo, arm, qdArm, armLen: ARM };
  }, [reach]);

  useImperativeHandle(
    ref,
    () => ({
      set(a, q) {
        if (carriage.current) carriage.current.position.y = a.y;
        if (left.current) left.current.rotation.y = -a.open;
        if (right.current) right.current.rotation.y = a.open;
        // swung back round its hinge, flat against the tower's face
        if (qd.current) qd.current.rotation.y = q * 1.45;
      },
    }),
    [],
  );

  const h = W / 2;
  return (
    <group>
      {lower && (
        <Rise animate={animate}>
          <Steel geo={geo.slab} mode={mode} tone="concrete" ghost={0.3} />
          <Steel geo={geo.lo} mode={mode} ghost={0.5} />
        </Rise>
      )}
      {upper && (
        <Rise animate={animate}>
          <Steel geo={geo.hi} mode={mode} ghost={0.5} />
          {beacon}
        </Rise>
      )}
      {arms && (
        <Rise animate={animate}>
          {/* the chopsticks on their carriage, pivoting at its front corners */}
          <group ref={carriage} position={[0, 0.73, 0]}>
            <Steel geo={geo.carriageGeo} mode={mode} tone="dark" ghost={0.55} edges />
            <group ref={left} position={[-0.038, 0, h + 0.012]}>
              <Steel geo={geo.arm} mode={mode} ghost={0.55} edges />
            </group>
            <group ref={right} position={[0.038, 0, h + 0.012]}>
              <Steel geo={geo.arm} mode={mode} ghost={0.55} edges />
            </group>
          </group>
          {/* the ship QD arm, hinged at the face's left edge at the ship's skirt */}
          <group ref={qd} position={[-h + 0.004, 0.535, h]}>
            <Steel geo={geo.qdArm} mode={mode} tone="dark" ghost={0.5} edges />
          </group>
        </Rise>
      )}
    </group>
  );
});
