/* ---------- The completion reward: the next launch ----------
   "Let's build it together", literally. The quiet lot between the city blocks
   and the park starts as a bare surveyed apron, and every project the visitor
   wakes adds a piece: the launch mount, the tower (lower, then upper), then
   the vehicle itself, stacked the way Starship is (the booster's engines, the
   booster, its grid fins, the hot-staging ring), the chopsticks and the ship's
   arm, and the ship itself last, in one piece. The 10th project powers the
   site on: the beacon starts blinking, the celebration fires (NodeHud pulls
   the journey home so it plays in view) and the invitation appears; the
   complex turns to steel, the vehicle stays the only ghost-free thing that
   hasn't flown. Clicking it moves the camera to the pad and offers a LAUNCH
   button (components/LaunchOverlay).

   Then the film (launchPlan.ts for when, maquette/launch.ts for where): the
   terminal count with the ship's arm swinging back and the deluge coming on,
   the Raptors starting ring by ring into a steam cloud the engines light from
   inside, the slow climb past the tower, Max-Q, MECO and hot staging through
   the vented ring, the booster's boostback, and the booster coming home onto
   the chopsticks — while the ship flies on into the asteroids easter egg. */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { AdditiveBlending, Color, DoubleSide, MeshBasicMaterial, Quaternion, Vector3, type Group, type Mesh, type MeshStandardMaterial, type PointLight } from 'three';
import { sceneStore, useSceneSelector } from '../store';
import { HOTSPOTS } from '../framing';
import { launchShot, launchTrack } from '../views';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { recordLaunch, useLaunchCount } from '../../lib/launches';
import { FIRE, useAccent, type V3 } from './shared';
import { GHOST_FILL, GHOST_LINE } from './life';
import { BoosterBody, ROCKET_MID, ShipBody, STACK_BASE, STAGING_Y } from './rocket';
import { BOOSTER_MID, T, bqd, chopsticks, plumeAir, qdArm, shake as flightShake, shot as flightShot, smoke as flightSmoke, stages as flightStages, staging } from './launch';
import { BOOSTER_ENGINES, BOOSTER_RINGS, COUNT, SHIP_ENGINES, SHIP_RINGS, boosterEngines, boosterTelemetry, film, missionTime, shipEngines, shipTelemetry, smooth } from '../launchPlan';
import { LaunchSmoke, type SmokeApi } from './smoke';
import { Frost, Nozzles, Plume, RingJets, VaporCone, glowMat, type LevelApi, type NozzlesApi, type PlumeApi } from './engineFire';
import { LaunchMount, LaunchTower, type MountApi, type TowerApi } from './launchComplex';

/** The launch site. Moved back from [0.85, 0, -0.52], where the apron overlapped
 *  the park's lawn — the pad was literally standing in the grass, which is what
 *  made the two read as one muddled corner. Out here it has its own plot in the
 *  gap behind the city, joined to the grid by the service lane. */
export const SITE_POS: V3 = [0.86, 0, -0.9];

/* Assembly order: how many woken projects each piece needs (visited.length ≥ n). */
const BUILD = { mount: 1, towerLo: 2, towerHi: 3, engines: 4, booster: 5, fins: 6, ring: 7, arm: 8, ship: 9 };

// Dev only: a handle for the capture tooling (it steps the film with
// `film.fixed` and finishes the build through the store).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __film: unknown }).__film = { film, store: sceneStore, hotspots: HOTSPOTS };
}

/** Where the stack stands on the site, and the tower. */
const PAD: V3 = [-0.02, 0, 0.03];
const TOWER: V3 = [0.13, 0, -0.07];
const TO_STACK = new Vector3(PAD[0] - TOWER[0], 0, PAD[2] - TOWER[2]);
const REACH = TO_STACK.length();
/** The tower turned to face the stack with its chopsticks; the mount's
 *  quick-disconnect on the tower's side. */
const TOWER_YAW = Math.atan2(TO_STACK.x, TO_STACK.z);
const MOUNT_YAW = Math.atan2(-TO_STACK.x, -TO_STACK.z);

// The flight's frame (launch.ts) on the pad's axes: x across the camera's view
// (screen right, the way the climb leans), z toward the camera. The pad camera
// sits off +x/+z in world (LAUNCH.padOffset) and the site is turned 0.25 rad,
// so both are turned back by that much.
const FLIGHT_X = new Vector3(0.856, 0, -0.518).applyAxisAngle(new Vector3(0, 1, 0), -0.25);
const FLIGHT_Z = new Vector3(0.518, 0, 0.856).applyAxisAngle(new Vector3(0, 1, 0), -0.25);
const UP = new Vector3(0, 1, 0);
// The stack turned on the mount so its heat shield faces away from the
// cameras (the pad's and the flight's, all on that side), a little off
// square: they see the steel, the tiles' edge down one side, and the flaps
// standing out at both edges.
const SHIELD_DIR = FLIGHT_Z.clone().multiplyScalar(-Math.cos(0.6)).addScaledVector(FLIGHT_X, Math.sin(0.6));
const STACK_YAW = Math.atan2(SHIELD_DIR.x, SHIELD_DIR.z);
const tmp = { v: new Vector3(), w: new Vector3(), q: new Quaternion(), mid: new Vector3() };
/** A point of the flight's frame, on the pad's axes. */
function onPad(out: Vector3, x: number, y: number, z: number): Vector3 {
  return out.set(0, 0, 0).addScaledVector(FLIGHT_X, x).addScaledVector(UP, y).addScaledVector(FLIGHT_Z, z);
}
/** Pose a stage group from the flight: lean it over about its base, then turn
 *  it about its own middle (the booster's flip). */
function poseStage(g: Group, p: { x: number; y: number; z: number; tilt: number; turn: number }, pivot: number) {
  const { v, w, q, mid } = tmp;
  onPad(v, p.x, p.y, p.z);
  // the middle, where it would be leaning on its path…
  q.setFromAxisAngle(FLIGHT_Z, -p.tilt);
  mid.set(0, pivot, 0).applyQuaternion(q).add(v);
  // …and the whole turn about it
  g.quaternion.setFromAxisAngle(FLIGHT_Z, -(p.tilt + p.turn));
  w.set(0, pivot, 0).applyQuaternion(g.quaternion);
  g.position.copy(mid).sub(w);
}

/** Every nozzle exit: where it is (in the model's frame) and its bell's radius. */
const BOOSTER_NOZZLES = BOOSTER_RINGS.flatMap(({ n, r, ph }) =>
  Array.from({ length: n }, (_, i) => ({ x: r * Math.sin((Math.PI * 2 * i) / n + ph), z: r * Math.cos((Math.PI * 2 * i) / n + ph), r: 0.0033 })),
);
const SHIP_NOZZLES = SHIP_RINGS.flatMap(({ n, r, ph }, k) =>
  Array.from({ length: n }, (_, i) => ({ x: r * Math.sin((Math.PI * 2 * i) / n + ph), z: r * Math.cos((Math.PI * 2 * i) / n + ph), r: k === 0 ? 0.0034 : 0.0072 })),
);

export function NextProjectSite() {
  const { accent } = useAccent();
  const celebrateAt = useSceneSelector((s) => s.celebrateAt);
  const built = useSceneSelector((s) => s.visited.length); // assembly progress
  const launch = useSceneSelector((s) => s.launch);
  const flights = useLaunchCount(); // global odometer, null until known
  const reduced = useReducedMotion();
  const pad = useRef<Group>(null); // the stack's own frame: its base at the origin
  const rocket = useRef<Group>(null); // the clickable stack (hums through the count)
  const booster = useRef<Group>(null);
  const ship = useRef<Group>(null);
  const boosterPlume = useRef<PlumeApi>(null);
  const shipPlume = useRef<PlumeApi>(null);
  const boosterNozzles = useRef<NozzlesApi>(null);
  const shipNozzles = useRef<NozzlesApi>(null);
  const jets = useRef<LevelApi>(null);
  const vapor = useRef<LevelApi>(null);
  const flash = useRef<Mesh>(null);
  const ventGlow = useRef<Mesh>(null);
  const engineLight = useRef<PointLight>(null);
  const tower = useRef<TowerApi>(null);
  const mount = useRef<MountApi>(null);
  const smokeApi = useRef<SmokeApi>(null);
  type FrostApi = { set(level: number, opacity: number): void };
  const frostLox = useRef<FrostApi>(null);
  const frostCh4 = useRef<FrostApi>(null);
  const frostShip = useRef<FrostApi>(null);
  const beaconMat = useRef<MeshStandardMaterial>(null);
  const t0 = useRef(0); // wall clock when the count began
  const flown = useRef(false); // something to put back once the pad is idle again
  // puffs owed between frames (rates are per second; frames are not), and
  // where the booster's tail was last frame, so the trail has no gaps
  const owed = useRef({ vent: 0, spray: 0, steam: 0, trail: 0, rcs: 0, landing: 0, after: 0 });
  const lastTail = useRef(new Vector3());
  const levels = useMemo(() => ({ booster: new Float32Array(BOOSTER_ENGINES), ship: new Float32Array(SHIP_ENGINES) }), []);
  const flashMat = useMemo(() => glowMat(new Color('#ffe2bd').multiplyScalar(2.4), 0), []);

  useFrame((s, delta) => {
    const realDt = Math.min(delta, 1 / 30);
    // the beacon powers on with the 10th project (the site is complete) — a
    // faint standby ember while the vehicle is still being assembled
    if (beaconMat.current) {
      beaconMat.current.emissiveIntensity =
        celebrateAt === null ? 0.06 : reduced ? 0.8 : 0.3 + (Math.sin(s.clock.elapsedTime * 2.4) > 0.7 ? 1.6 : 0);
    }

    const r = rocket.current;
    const bo = booster.current;
    const sh = ship.current;
    const padG = pad.current;
    if (!r || !bo || !sh || !padG) return;
    const puffs = smokeApi.current;
    const { v, w } = tmp;
    const o = owed.current;

    // ---- back on the pad ----
    if ((launch === 'idle' || launch === 'pad') && flown.current) {
      // back from the game (or an abort): the stack is quietly on the mount
      // again (the booster was caught, the ship came home) and the sky is clear
      flown.current = false;
      film.running = false;
      film.time = -COUNT;
      for (const g of [r, bo, sh]) {
        g.position.set(0, 0, 0);
        g.quaternion.identity();
      }
      sh.visible = true;
      levels.booster.fill(0);
      levels.ship.fill(0);
      boosterNozzles.current?.set(levels.booster);
      shipNozzles.current?.set(levels.ship);
      boosterPlume.current?.set(0, 1, 1, 1, 0);
      shipPlume.current?.set(0, 1, 1, 1, 0);
      jets.current?.set(0, 0);
      vapor.current?.set(0, 0);
      for (const m of [flash.current, ventGlow.current]) if (m) m.visible = false;
      if (engineLight.current) engineLight.current.intensity = 0;
      tower.current?.set(chopsticks(-COUNT), 0);
      mount.current?.set(0);
      puffs?.clear();
      puffs?.light(0, 0, 0, 0);
      launchShot.active = false;
    }

    // ---- on the pad: fuelled, frosted, breathing vapour off its tanks ----
    if (launch === 'pad') {
      frostLox.current?.set(1, 0.8);
      frostCh4.current?.set(1, 0.8);
      frostShip.current?.set(1, 0.8);
      if (!reduced && puffs) vent(puffs, realDt * 4, o);
    }

    // ---- the film ----
    if (launch === 'countdown' || launch === 'ascend') {
      if (reduced) {
        // nothing to watch: count it and straight to the game
        if (!flown.current) recordLaunch();
        flown.current = true;
        sceneStore.setLaunch('game');
        return;
      }
      if (!film.running) {
        film.running = true;
        film.time = -COUNT;
        t0.current = performance.now();
        flown.current = true;
        launchShot.startedAt = t0.current;
        r.position.set(0, 0, 0);
        lastTail.current.set(0, STACK_BASE, 0);
      }
      // wall clock, not the frame sum: dt is clamped, and the film has a set
      // running time (the capture tooling steps it instead)
      film.time = film.fixed ? film.time + film.fixed : (performance.now() - t0.current) / 1000 - COUNT;
      const t = film.time;
      const dt = film.fixed || realDt;

      // ---- the two stages ----
      const st = flightStages(t);
      poseStage(bo, st.booster, BOOSTER_MID);
      poseStage(sh, st.ship, 0);
      // on the mount, the engines shake the whole stack
      if (t < T.release + 0.4 && t > T.startup) {
        const amp = 0.0005 * smooth(T.startup, T.outer + 0.3, t);
        r.position.set(Math.sin(t * 61) * amp, 0, Math.cos(t * 53) * amp);
      } else r.position.set(0, 0, 0);
      // after the cut back to the tower the ship is far off, out of the picture
      sh.visible = t < T.ret;

      // ---- engines ----
      boosterEngines(t, levels.booster);
      shipEngines(t, levels.ship);
      boosterNozzles.current?.set(levels.booster);
      shipNozzles.current?.set(levels.ship);
      let bThrust = 0;
      for (const x of levels.booster) bThrust += x;
      bThrust /= BOOSTER_ENGINES;
      let sThrust = 0;
      for (const x of levels.ship) sThrust += x;
      sThrust /= SHIP_ENGINES;
      const air = plumeAir(t);
      boosterPlume.current?.set(bThrust, air.wide, air.long, air.flare, t);
      const since = Math.max(0, t - T.hotstage);
      shipPlume.current?.set(sThrust, 1 + Math.min(0.7, since * 0.35), 1 + Math.min(1.8, since * 0.75), 2.6, t);

      // ---- hot staging, Max-Q ----
      const sg = staging(t);
      const fl = flash.current;
      if (fl) {
        fl.visible = sg.flash > 0.01;
        fl.scale.setScalar(0.05 + (1 - sg.flash) * 0.14);
        flashMat.uniforms.uOpacity.value = sg.flash;
      }
      const vg = ventGlow.current;
      if (vg) {
        vg.visible = sg.vents > 0.01;
        (vg.material as MeshBasicMaterial).opacity = sg.vents;
      }
      jets.current?.set(sg.jets, t);
      vapor.current?.set(smooth(T.maxq - 0.8, T.maxq - 0.35, t) * (1 - smooth(T.maxq + 0.35, T.maxq + 0.9, t)), t);

      // ---- frost: down to the propellant left in each tank ----
      const mt = Math.max(0, missionTime(t));
      const bp = boosterTelemetry(mt);
      const sp = shipTelemetry(mt);
      frostLox.current?.set(bp.lox, 0.8);
      frostCh4.current?.set(bp.ch4, 0.8);
      frostShip.current?.set(sp.lox, 0.8);

      // ---- the tower ----
      tower.current?.set(chopsticks(t), qdArm(t));
      mount.current?.set(bqd(t));

      // ---- the fire's light: on the stack, the tower and the cloud ----
      const staged = t >= T.hotstage && t < T.ret;
      const fire = staged ? Math.max(sThrust, bThrust) : bThrust;
      const src = staged && sThrust > bThrust ? sh : bo;
      v.set(0, (src === sh ? STAGING_Y : STACK_BASE) - 0.05, 0).applyQuaternion(src.quaternion).add(src.position);
      const el = engineLight.current;
      if (el) {
        el.position.copy(v);
        el.intensity = (fire * 0.9 + sg.flash * 1.2) * (0.92 + Math.random() * 0.16);
      }
      puffs?.light(v.x, v.y - 0.04, v.z, fire * 1.6 + sg.flash);

      // ---- smoke ----
      if (puffs) {
        const sm = flightSmoke(t);
        if (t < T.startup + 0.5) vent(puffs, dt * (t < T.startup ? 10 : 4), o);
        // the deluge: water thrown up off the deflector plate round the mount
        o.spray += sm.spray * dt;
        while (o.spray >= 1) {
          o.spray -= 1;
          const a = Math.random() * Math.PI * 2;
          const rr = 0.02 + Math.random() * 0.045;
          puffs.puff(Math.sin(a) * rr, 0.012, Math.cos(a) * rr, Math.sin(a) * 0.06, 0.32 + Math.random() * 0.34, Math.cos(a) * 0.06, {
            size0: 0.008, size1: 0.03 + Math.random() * 0.02, life: 0.7 + Math.random() * 0.4, alpha: 0.5, warm: 0, drag: 0.6, rise: -0.9,
          });
        }
        // the steam: the deluge flashed off by the engines, thrown out all
        // round the mount and billowing up; the stack climbs out of it
        o.steam += sm.steam * dt;
        while (o.steam >= 1) {
          o.steam -= 1;
          const a = Math.random() * Math.PI * 2;
          const ca = Math.sin(a);
          const sa = Math.cos(a);
          const hot = t < T.release + 1.5 ? 0.55 : 0.2;
          if (Math.random() < 0.3) {
            // billowing up round the base
            puffs.puff(ca * 0.05, 0.03 + Math.random() * 0.1, sa * 0.05, ca * 0.07, 0.12 + Math.random() * 0.24, sa * 0.07, {
              size0: 0.07, size1: 0.3 + Math.random() * 0.16, life: 4.5 + Math.random() * 2.5, alpha: 0.4, warm: hot, drag: 0.85,
            });
          } else {
            // rolling out across the ground, a long way
            const sp = 0.3 + Math.random() * 0.55;
            puffs.puff(ca * 0.06, 0.02 + Math.random() * 0.03, sa * 0.06, ca * sp, 0.03 + Math.random() * 0.08, sa * sp, {
              size0: 0.06, size1: 0.34 + Math.random() * 0.2, life: 5 + Math.random() * 3, alpha: 0.42, warm: hot, drag: 0.95,
            });
          }
        }
        // the trail up the sky, from where the flame burns out into smoke
        o.trail += sm.trail * dt;
        if (o.trail >= 1) {
          v.set(0, STACK_BASE - 0.26 * bThrust * air.long, 0).applyQuaternion(bo.quaternion).add(bo.position);
          const n = Math.floor(o.trail);
          o.trail -= n;
          for (let i = 0; i < n; i++) {
            const k = (i + Math.random()) / n;
            puffs.puff(
              lastTail.current.x + (v.x - lastTail.current.x) * k + (Math.random() - 0.5) * 0.02,
              lastTail.current.y + (v.y - lastTail.current.y) * k,
              lastTail.current.z + (v.z - lastTail.current.z) * k + (Math.random() - 0.5) * 0.02,
              (Math.random() - 0.5) * 0.08, -0.06 - Math.random() * 0.1, (Math.random() - 0.5) * 0.08,
              { size0: 0.05, size1: 0.2 + Math.min(0.2, bo.position.y * 0.02), life: 2.4 + Math.random() * 1.2, alpha: 0.34, warm: 0.45, drag: 0.7 },
            );
          }
          lastTail.current.copy(v);
        }
        // the booster's cold-gas thrusters turning it over
        o.rcs += sm.rcs * dt;
        while (o.rcs >= 1) {
          o.rcs -= 1;
          const side = Math.random() < 0.5 ? 1 : -1;
          v.set(side * 0.032, 0.47, 0).applyQuaternion(bo.quaternion).add(bo.position);
          w.set(side * 0.14, 0, (Math.random() - 0.5) * 0.04).applyQuaternion(bo.quaternion);
          puffs.puff(v.x, v.y, v.z, w.x, w.y, w.z, { size0: 0.006, size1: 0.045, life: 0.7, alpha: 0.45, warm: 0, drag: 1.4, rise: 0 });
        }
        // the landing burn on the mount: its exhaust hits the plate and rolls out
        o.landing += sm.landing * dt;
        while (o.landing >= 1) {
          o.landing -= 1;
          const a = Math.random() * Math.PI * 2;
          const sp = 0.2 + Math.random() * 0.35;
          puffs.puff(Math.sin(a) * 0.04, 0.03, Math.cos(a) * 0.04, Math.sin(a) * sp, 0.05 + Math.random() * 0.1, Math.cos(a) * sp, {
            size0: 0.04, size1: 0.18 + Math.random() * 0.1, life: 2.6 + Math.random() * 1.5, alpha: 0.38, warm: 0.6, drag: 1.0,
          });
        }
        // caught, the booster vents what's left in its tanks
        o.after += sm.vent * dt;
        while (o.after >= 1) {
          o.after -= 1;
          const a = Math.random() * Math.PI * 2;
          v.set(Math.sin(a) * 0.03, 0.42 + Math.random() * 0.06, Math.cos(a) * 0.03).applyQuaternion(bo.quaternion).add(bo.position);
          puffs.puff(v.x, v.y, v.z, Math.sin(a) * 0.05, 0.04, Math.cos(a) * 0.05, { size0: 0.012, size1: 0.08, life: 1.6 + Math.random(), alpha: 0.32, warm: 0, drag: 1.4 });
        }
      }

      // ---- the camera's shot, from the flight's frame into world space ----
      let sht = flightShot(t);
      // dev only: the capture tooling can try out a camera
      if (import.meta.env.DEV) sht = (window as unknown as { __film: { shot?: (t: number) => typeof sht | undefined } }).__film.shot?.(t) ?? sht;
      padG.localToWorld(onPad(launchShot.pos, sht.pos[0], sht.pos[1], sht.pos[2]));
      padG.localToWorld(onPad(launchShot.target, sht.target[0], sht.target[1], sht.target[2]));
      launchShot.fov = sht.fov;
      launchShot.pull = sht.pull;
      launchShot.cut = sht.cut;
      launchShot.shake = flightShake(t);
      launchShot.since = t + COUNT;
      launchShot.active = true;

      // ---- the stages of the story ----
      if (t >= T.release && launch === 'countdown') {
        recordLaunch(); // liftoff: one tick on the global odometer
        sceneStore.setLaunch('ascend');
      }
      // the ship flies on into the game
      if (t > T.end) sceneStore.setLaunch('game');
    }
    // the pad camera aims at the stack's middle
    r.localToWorld(launchTrack.set(0, ROCKET_MID, 0));
  });

  const complete = celebrateAt !== null;
  const mode = complete ? 'lit' : 'ghost';
  const engage = () => {
    // the launch is the 10/10 reward — while the vehicle is still being
    // assembled the pad stays quiet
    if (!complete) return;
    if (sceneStore.snapshot().launch === 'idle') sceneStore.setLaunch('pad');
  };
  const anim = !reduced; // assembly pieces rise in (Rise) unless reduced
  const flying = launch !== 'idle';
  return (
    <group position={SITE_POS} rotation={[0, 0.25, 0]}>
      {/* ---- the apron: surveyed from the very first scroll ---- */}
      <mesh position={[-0.02, 0.003, 0.03]}>
        <cylinderGeometry args={[0.2, 0.21, 0.006, 32]} />
        <meshStandardMaterial color={GHOST_FILL} transparent opacity={0.28} />
      </mesh>
      {/* surveyor's corner brackets — the plot is marked out until the build
          is complete, then the marks come up */}
      {built < 10 && (
        <group position={[-0.02, 0.008, 0.03]}>
          {([[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]).map(([sx, sz], i) => (
            <group key={i} position={[sx * 0.17, 0, sz * 0.17]}>
              <mesh position={[sx * -0.022, 0, 0]}>
                <boxGeometry args={[0.052, 0.004, 0.007]} />
                <meshStandardMaterial color={GHOST_LINE} transparent opacity={0.5} />
              </mesh>
              <mesh position={[0, 0, sz * -0.022]}>
                <boxGeometry args={[0.007, 0.004, 0.052]} />
                <meshStandardMaterial color={GHOST_LINE} transparent opacity={0.5} />
              </mesh>
            </group>
          ))}
        </group>
      )}
      <group ref={pad} position={PAD}>
        {/* ---- piece 1: the launch mount ---- */}
        {built >= BUILD.mount && <LaunchMount ref={mount} mode={mode} animate={anim} towerDir={MOUNT_YAW} />}

        {/* ---- the vehicle, stacked piece by piece (clickable once whole) ---- */}
        <group
          ref={rocket}
          onClick={(e) => {
            e.stopPropagation();
            engage();
          }}
          onPointerOver={() => {
            if (complete) document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          {/* Booster and ship in their own groups: the flight separates them
              at staging. Each carries its own fire, turned with it. */}
          <group ref={booster}>
            <group rotation={[0, STACK_YAW, 0]}>
              <BoosterBody
                mode={mode}
                assemble={anim}
                parts={{
                  engines: built >= BUILD.engines,
                  booster: built >= BUILD.booster,
                  fins: built >= BUILD.fins,
                  ring: built >= BUILD.ring,
                }}
              />
              {flying && (
                <>
                  <Nozzles ref={boosterNozzles} at={BOOSTER_NOZZLES} y={STACK_BASE + 0.0006} length={0.05} />
                  {/* frost on the liquid-oxygen tank (the lower two-thirds)
                      and the methane tank above it */}
                  <Frost ref={frostLox} r={0.0304} y0={0.1} y1={0.335} />
                  <Frost ref={frostCh4} r={0.0304} y0={0.352} y1={0.47} />
                </>
              )}
            </group>
            {flying && (
              <>
                <group position={[0, STACK_BASE + 0.003, 0]}>
                  <Plume ref={boosterPlume} radius={0.029} length={0.36} />
                </group>
                {/* the ring's vents, lit from inside as the ship's engines light at staging */}
                <mesh ref={ventGlow} position={[0, (STAGING_Y + 0.49) / 2, 0]} visible={false} renderOrder={3}>
                  <cylinderGeometry args={[0.0268, 0.0268, 0.012, 24, 1, true]} />
                  <meshBasicMaterial color={FIRE} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
                </mesh>
                <RingJets ref={jets} y={(STAGING_Y + 0.49) / 2} r={0.029} />
              </>
            )}
          </group>
          <group ref={ship}>
            <group rotation={[0, STACK_YAW, 0]}>
              {built >= BUILD.ship && <ShipBody mode={mode} assemble={anim} />}
              {flying && (
                <>
                  <Nozzles ref={shipNozzles} at={SHIP_NOZZLES} y={STAGING_Y + 0.0006} length={0.04} />
                  <Frost ref={frostShip} r={0.0304} y0={0.52} y1={0.655} />
                </>
              )}
            </group>
            {flying && (
              <>
                <group position={[0, STAGING_Y + 0.003, 0]}>
                  <Plume ref={shipPlume} radius={0.021} length={0.26} diamonds={0} />
                </group>
                {/* the hot-staging bloom, between the stages as they part */}
                <mesh ref={flash} position={[0, STAGING_Y, 0]} visible={false} material={flashMat} renderOrder={3}>
                  <sphereGeometry args={[1, 20, 14]} />
                </mesh>
                {/* Max-Q's vapour collar, round the ship's forward section */}
                <VaporCone ref={vapor} y={0.71} r={0.03} />
              </>
            )}
          </group>
        </group>
        {/* the engines' light on the stack, the tower and the ground */}
        {flying && <pointLight ref={engineLight} color="#ffae6e" intensity={0} distance={3} decay={1.4} />}
        {/* the launch's smoke and steam, in the stack's frame */}
        <LaunchSmoke ref={smokeApi} />
      </group>

      {/* ---- the tower, raised in two pours, then its arms ---- */}
      <group position={TOWER} rotation={[0, TOWER_YAW, 0]}>
        <LaunchTower
          ref={tower}
          mode={mode}
          animate={anim}
          lower={built >= BUILD.towerLo}
          upper={built >= BUILD.towerHi}
          arms={built >= BUILD.arm}
          reach={REACH}
          beacon={
            // a standby ember until the site powers on at 10/10
            <mesh position={[0, 0.97, 0]}>
              <sphereGeometry args={[0.011, 10, 10]} />
              <meshStandardMaterial ref={beaconMat} color={accent} emissive={accent} emissiveIntensity={0.06} toneMapped={false} userData={{ lifeSkip: true }} />
            </mesh>
          }
        />
      </group>

      {/* the invitation — the completed site's reward; engages the pad camera */}
      {complete && launch === 'idle' && (
        <Html position={[-0.12, 1.08, 0]} center zIndexRange={[18, 0]} className="hotspot-wrap">
          <button type="button" className="nextsite" onClick={engage}>
            <b>my next launch</b> — let's build it together
            {flights != null && (
              <span className="nextsite__tally">
                <b>{String(flights).padStart(4, '0')}</b> launches by visitors so far
              </span>
            )}
          </button>
        </Html>
      )}
    </group>
  );
}

/** Vapour boiling off the cryogenic tanks: wisps off the ship's tanks and the
 *  booster's skirt, falling as they go (cold vapour sinks). */
function vent(puffs: SmokeApi, n: number, o: { vent: number }) {
  o.vent += n;
  while (o.vent >= 1) {
    o.vent -= 1;
    const a = Math.random() * Math.PI * 2;
    const high = Math.random() < 0.45;
    const y = high ? STAGING_Y + (Math.random() - 0.3) * 0.06 : STACK_BASE + 0.015 + Math.random() * 0.05;
    puffs.puff(Math.sin(a) * 0.033, y, Math.cos(a) * 0.033, Math.sin(a) * 0.045, -0.025, Math.cos(a) * 0.045, {
      size0: 0.012, size1: 0.07, life: 1.3 + Math.random(), alpha: 0.3, warm: 0, drag: 1.6, rise: -0.01,
    });
  }
}
