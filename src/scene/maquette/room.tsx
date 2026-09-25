// The ROOM layer (middle) — games, apps & the web. The desk with the monitor
// (Virtuele Brigade) and its keyboard / mouse / coffee cup, the couch with the
// phone (Popcore), the AR race table (Lightship Drive) and the bookcase with the
// openable Zwijsen book, plus lamp and plant props. RoomRig composes and places
// everything.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { AdditiveBlending, Color, DoubleSide, ExtrudeGeometry, MeshStandardMaterial, Vector3, type BufferGeometry, type Group, type Mesh, type Texture } from 'three';
import { useTweak } from '../devTweak';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { FIRE, GOLD, PALETTE, SURFACE, NEUTRAL, useAccent, type Tint, circlePts, roundedRectPts, roundedRectShape, roundedPlaneGeometry, Line, useActive, useOptionalTexture, FX, fxEnv, type V3 } from './shared';
import { GHOST_FILL, LifeGroup } from './life';
import { GlassMat, GroundMat, LiveGlassMat } from './materials';
import { BlobShadow } from './backdrop';
import { litMat, ShadowPrint, useLitBody, useLitLink, type LitLink } from './lit';
import { hang, lathe, leaf, merge, place, softBox, softSeam, tube, useGeometry, type Soft } from './shapes';

const PHONE_BALLS = 6;
const COUCH_SEAT_Y = 0.2; // top of the couch cushion, in couch-local space
function Phone({ slug, position, args, liveColor }: { slug: string; position: V3; args: V3; liveColor: string }) {
  const { accent } = useAccent();
  const { hovered, selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const rigRef = useRef<Group>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  // lit on hover (lit.tsx): the handset, not its screen
  const lit = useLitLink(slug);
  const body = useLitBody(rigRef);
  const k = useRef(0); // emissive hover/select level
  const glow = useRef(0); // 0 → 1 shift toward the lifelike colour
  const turn = useRef(0); // 0 = lying flat, 1 = lifted + facing the user
  const buzz = useRef(0); // hover buzz envelope
  const base = useMemo(() => new Color(accent), [accent]);
  const lifelike = useMemo(() => new Color(liveColor), [liveColor]);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;

  // Ping-pong balls — each carries its own little bit of physics, fired once on
  // the first open. Held as plain objects (mutated in useFrame, not React state).
  const balls = useMemo(
    () => Array.from({ length: PHONE_BALLS }, () => ({ mesh: null as Mesh | null, vel: new Vector3(), delay: 0 })),
    [],
  );
  const R = 0.015; // ball radius
  const fired = useRef(false);
  const shown = useRef(false); // whether the screenshot is currently mapped on
  const tex = useOptionalTexture('/textures/room-phone.jpg');

  // Rounded body (extruded rounded-rect with a soft bevelled edge) + rounded
  // screen, so the handset reads as a real phone rather than a flat slab.
  const bodyGeo = useMemo(() => {
    const [w, h, d] = args;
    const g = new ExtrudeGeometry(roundedRectShape(w, h, Math.min(w, h) * 0.22), {
      depth: d,
      bevelEnabled: true,
      bevelThickness: d * 0.4,
      bevelSize: d * 0.4,
      bevelSegments: 2,
      curveSegments: 10,
    });
    g.translate(0, 0, -d / 2);
    return g;
  }, [args]);
  // Bezels: 0.84 × 0.90 of the body left a chin and forehead wide enough to date
  // the handset to about 2016. 0.93 × 0.955 puts the glass close to the edge the
  // way a current phone does, and the corner radius rises with it so the screen
  // still follows the body's own curve rather than cutting across it.
  const screenGeo = useMemo(() => roundedPlaneGeometry(args[0] * 0.93, args[1] * 0.955, Math.min(args[0], args[1]) * 0.19), [args]);
  useEffect(() => {
    return () => {
      bodyGeo.dispose();
      screenGeo.dispose();
    };
  }, [bodyGeo, screenGeo]);

  useFrame((s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const t = s.clock.elapsedTime;
    body(lit.litU.value, selected || visited);

    // --- lift, scale, and rotate toward the user on select; buzz on hover while resting ---
    const rig = rigRef.current;
    if (rig) {
      turn.current += ((selected ? 1 : 0) - turn.current) * 0.1;
      const tt = reduced ? (selected ? 1 : 0) : turn.current;
      buzz.current += ((hovered || selected ? 1 : 0) - buzz.current) * 0.2;
      const a = reduced ? 0 : buzz.current * (1 - tt); // buzz fades as it stands up
      
      // Tweak this value to match your scene's camera angle:
      // Positive values (e.g., 0.35) rotate it right; negative values (e.g., -0.35) rotate it left.
      const YAW_OFFSET = 0.38; 

      rig.rotation.set(
        mix(-Math.PI / 2, -0.15, tt), 
        mix(0, YAW_OFFSET, tt) + (Math.sin(t * 45) * 0.022 * a), 
        mix(0.3, 0.0, tt)
      );
      
      rig.position.set(
        position[0] + Math.sin(t * 50) * 0.005 * a,
        position[1] + tt * 0.14, 
        position[2] + Math.cos(t * 58) * 0.005 * a,
      );

      const sLvl = mix(1, 1.35, tt);
      rig.scale.set(sLvl, sLvl, sLvl);
    }

    // --- emissive screen: glows on hover/visit, and swaps to a screenshot once
    // the texture is loaded and the node is opened/visited (else the plain glow) ---
    if (mat.current) {
      const m = mat.current;
      k.current += ((hovered || selected ? 1 : visited ? 0.42 : 0) - k.current) * 0.12;
      glow.current += ((selected || visited ? 1 : 0) - glow.current) * 0.07;
      const wantImg = (selected || visited) && !!tex;
      if (wantImg !== shown.current) {
        shown.current = wantImg;
        m.map = null;
        m.emissiveMap = wantImg ? tex : null;
        m.needsUpdate = true;
      }
      const breathe = reduced ? 0 : Math.sin(t * 2.2) * 0.07;
      // ghost screen until it's opened: grey and dim; hover only brightens it a
      // touch ("trying to wake"), colour floods in on click and stays
      m.emissiveIntensity = (wantImg ? 0.62 : 0.14 + 0.38 * glow.current) + k.current * (0.3 + breathe);
      if (wantImg) {
        m.color.set('#000000');
        m.emissive.set('#ffffff');
        m.emissiveIntensity = 0.8;
      } else {
        m.color.copy(GHOST_FILL).lerp(base, Math.max(glow.current, k.current * 0.3)).lerp(lifelike, glow.current);
        m.emissive.copy(GHOST_FILL).lerp(base, Math.max(glow.current, k.current * 0.3)).lerp(lifelike, glow.current);
      }
    }

    // --- fire the balls once, on the first open ---
    if (selected && !fired.current) {
      fired.current = true;
      balls.forEach((b, i) => {
        if (!b.mesh) return;
        if (reduced) {
          // no launch — just scatter them at rest on the cushion around the phone
          const ang = (i / PHONE_BALLS) * Math.PI * 2;
          b.mesh.position.set(position[0] + Math.cos(ang) * 0.07, COUCH_SEAT_Y + R, position[2] + Math.sin(ang) * 0.05);
          b.mesh.visible = true;
        } else {
          const ang = (i / PHONE_BALLS) * Math.PI * 2 + 0.6;
          b.delay = i * 0.045; // slight stagger → a little spray
          b.vel.set(Math.cos(ang) * (0.1 + Math.random() * 0.1), 0.62 + Math.random() * 0.3, Math.sin(ang) * (0.1 + Math.random() * 0.1));
          b.mesh.position.set(position[0], position[1] + 0.03, position[2]);
          b.mesh.visible = false; // shown once its stagger delay elapses
        }
      });
    }

    // --- integrate the balls: launch, arc under gravity, bounce, settle ---
    if (fired.current && !reduced) {
      const restY = COUCH_SEAT_Y + R;
      for (const b of balls) {
        if (!b.mesh) continue;
        if (b.delay > 0) {
          b.delay -= dt;
          continue;
        }
        b.mesh.visible = true;
        b.vel.y -= 2.6 * dt; // gravity
        b.mesh.position.addScaledVector(b.vel, dt);
        if (b.mesh.position.y <= restY) {
          b.mesh.position.y = restY;
          if (Math.abs(b.vel.y) < 0.14) b.vel.set(0, 0, 0); // settled
          else {
            b.vel.y = -b.vel.y * 0.5; // bounce
            b.vel.x *= 0.72;
            b.vel.z *= 0.72;
          }
        }
      }
    }
  });

  return (
    <>
      <group ref={rigRef} position={position} rotation={[-Math.PI / 2, 0, 0.3]}>
        {/* body / bezel — rounded corners + a soft bevelled edge */}
        <mesh geometry={bodyGeo}>
          <meshStandardMaterial {...litMat(lit)} color={accent} emissive={accent} emissiveIntensity={0.28} roughness={0.4} toneMapped={false} />
        </mesh>
        {/* screen face — a ghost glow until opened, then the screenshot. Sits
            clear of the body's bevelled front cap (extrude depth d/2 + bevel
            d·0.4 = d·0.9) or the opaque body would bury it. */}
        <mesh geometry={screenGeo} position={[0, 0, args[2] * 0.9 + 0.0006]}>
          <meshStandardMaterial ref={mat} userData={{ lifeSkip: true }} color={accent} emissive={accent} emissiveIntensity={0.5} roughness={0.4} toneMapped={true} side={DoubleSide} />
        </mesh>
        {/* Side hardware — a volume rocker and a longer power key opposite it.
            They sit a hair proud of the body's bevel so they catch their own
            highlight; without them the handset is a blank lozenge from every
            angle but straight on. `lifeSkip` keeps them off the life system's
            ghost lerp, matching the screen. */}
        {([
          [-1, args[1] * 0.20, args[1] * 0.17], // volume rocker, upper left
          [-1, args[1] * -0.03, args[1] * 0.09], // second volume key
          [1, args[1] * 0.10, args[1] * 0.20], // power, upper right and longer
        ] as [number, number, number][]).map(([side, y, len], i) => (
          <mesh key={i} position={[side * (args[0] / 2 + args[2] * 0.28), y, 0]}>
            <boxGeometry args={[args[2] * 0.7, len, args[2] * 1.5]} />
            <meshStandardMaterial
              {...litMat(lit, { lifeSkip: true })}
              color={accent}
              emissive={accent}
              emissiveIntensity={0.16}
              roughness={0.3}
              metalness={0.25}
              toneMapped={false}
            />
          </mesh>
        ))}
        {/* camera bump — the other thing that dates a phone, on the back */}
        <mesh position={[args[0] * 0.26, args[1] * 0.3, -args[2] * 1.1]}>
          <boxGeometry args={[args[0] * 0.34, args[1] * 0.17, args[2] * 0.5]} />
          <meshStandardMaterial {...litMat(lit, { lifeSkip: true })} color={SURFACE.deep.color} roughness={0.35} metalness={0.3} toneMapped={false} />
        </mesh>
      </group>
      {balls.map((b, i) => (
        <mesh
          key={i}
          ref={(m) => {
            b.mesh = m;
          }}
          position={position}
          visible={false}
        >
          <sphereGeometry args={[R, 16, 12]} />
          <meshStandardMaterial color={SURFACE.pale.color} emissive={FIRE} emissiveIntensity={0.2} roughness={0.55} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/** The room monitor. At rest it's a dim screen that flickers on as you hover;
 *  once visited it switches to a real screenshot (drop a JPG at
 *  public/textures/room-screen.jpg). Until that file exists it falls back to the
 *  plain lit screen, so nothing breaks. */
function RoomScreen({ slug, position, rotation, args }: { slug: string; position: V3; rotation?: V3; args: V3 }) {
  const { accent } = useAccent();
  const { hovered, selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const mat = useRef<MeshStandardMaterial>(null);
  const k = useRef(0);
  const shown = useRef(false);
  const tex = useOptionalTexture('/textures/room-screen.jpg');
  const live = useRef(0);
  const accentC = useMemo(() => new Color(accent), [accent]);
  useFrame((s) => {
    const m = mat.current;
    if (!m) return;
    k.current += ((hovered || selected ? 1 : visited ? 0.42 : 0) - k.current) * 0.3;
    live.current += ((selected || visited ? 1 : 0) - live.current) * 0.08;
    const wantImg = (selected || visited) && !!tex;
    if (wantImg !== shown.current) {
      shown.current = wantImg;
      m.map = wantImg ? tex : null;
      m.emissiveMap = wantImg ? tex : null;
      m.needsUpdate = true;
    }
    const t = s.clock.elapsedTime;
    const n = reduced ? 1 : Math.max(0.2, 0.6 + 0.45 * Math.sin(t * 46) * Math.sin(t * 8.7));
    if (shown.current) {
      m.color.set('#ffffff');
      m.emissive.set('#ffffff');
      m.emissiveIntensity = 0.6 + k.current * 0.5;
    } else {
      // ghost screen: grey + dim; hovering makes it flicker like it's trying to
      // wake, the colour itself only arrives when the visitor opens it. At rest
      // it keeps a faint standby shimmer — a monitor left on — that fades out as
      // it genuinely wakes.
      const idle = reduced ? 0 : (0.05 + 0.035 * Math.sin(t * 0.9) + 0.02 * Math.max(0, Math.sin(t * 5.3 + 2))) * (1 - live.current);
      m.color.copy(GHOST_FILL).lerp(accentC, live.current);
      m.emissive.copy(GHOST_FILL).lerp(accentC, live.current);
      m.emissiveIntensity = 0.08 + idle + 0.34 * live.current + k.current * 0.9 * n;
    }
  });
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial ref={mat} userData={{ lifeSkip: true }} color={accent} emissive={accent} emissiveIntensity={0.3} roughness={0.4} toneMapped={false} />
    </mesh>
  );
}

/** Drives the shared window material: hovering the town hall lights the whole
 *  skyline's windows (a calm blue). Once visited they stay softly lit, so the
 *  skyline keeps a quiet glow — toned down, never warm/orange. */
/* ---------- Room — games, apps & websites (middle) ---------- */

// A tiny race car for the Lightship Drive AR table — chassis, nose, cabin, a
// rear wing and four wheels — pointing along its local +z (its heading).
/** An open-wheel racer. This is the object under the tightest camera in the whole
 *  maquette (lightship-drive frames at fovZoom 30), so it carries the detail
 *  that zoom asks for: a tapered nose, a raised airbox behind the cockpit, a
 *  rear wing on endplates, and wheels with a visible rim face. It used to be
 *  four axis-aligned boxes, which at that framing read as a doorstop. */
function RaceCar({ color }: { color: string }) {
  const body = (
    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.35} metalness={0.15} toneMapped={false} />
  );
  return (
    <group>
      {/* floor pan — the widest part, sitting low between the wheels */}
      <mesh position={[0, 0.004, -0.002]}>
        <boxGeometry args={[0.03, 0.005, 0.062]} />
        {body}
      </mesh>
      {/* central tub, narrower than the floor so the pan shows as a lip */}
      <mesh position={[0, 0.01, -0.004]}>
        <boxGeometry args={[0.022, 0.011, 0.05]} />
        {body}
      </mesh>
      {/* nose cone — tapers to a point ahead of the front axle */}
      <mesh position={[0, 0.0085, 0.038]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.004, 0.011, 0.03, 4]} />
        {body}
      </mesh>
      {/* front wing on the deck, spanning the front axle */}
      <mesh position={[0, 0.0045, 0.05]}>
        <boxGeometry args={[0.036, 0.0022, 0.011]} />
        {body}
      </mesh>
      {/* sidepods flanking the tub, angled inward toward the rear */}
      {([-1, 1] as const).map((s, i) => (
        <mesh key={i} position={[s * 0.016, 0.0105, -0.008]} rotation={[0, s * 0.11, 0]}>
          <boxGeometry args={[0.009, 0.011, 0.032]} />
          {body}
        </mesh>
      ))}
      {/* cockpit opening — dark, set into the tub */}
      <mesh position={[0, 0.0165, 0.006]}>
        <boxGeometry args={[0.015, 0.004, 0.018]} />
        <meshStandardMaterial color={SURFACE.deep.color} roughness={0.3} toneMapped={false} />
      </mesh>
      {/* airbox / roll hoop rising behind the driver */}
      <mesh position={[0, 0.021, -0.012]}>
        <boxGeometry args={[0.013, 0.014, 0.02]} />
        {body}
      </mesh>
      {/* engine cover tapering back to the wing */}
      <mesh position={[0, 0.0165, -0.026]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0035, 0.008, 0.022, 5]} />
        {body}
      </mesh>
      {/* rear wing, carried on two endplates rather than floating */}
      {([-1, 1] as const).map((s, i) => (
        <mesh key={i} position={[s * 0.014, 0.019, -0.032]}>
          <boxGeometry args={[0.0025, 0.011, 0.01]} />
          {body}
        </mesh>
      ))}
      <mesh position={[0, 0.0235, -0.032]} rotation={[0.18, 0, 0]}>
        <boxGeometry args={[0.031, 0.0022, 0.011]} />
        {body}
      </mesh>
      {/* wheels: a tyre plus a brighter rim face, so they read as wheels rather
          than plain cylinders at close range */}
      {([[-0.019, 0.024], [0.019, 0.024], [-0.019, -0.024], [0.019, -0.024]] as [number, number][]).map(([wx, wz], i) => (
        <group key={i} position={[wx, 0.0065, wz]} rotation={[0, 0, Math.PI / 2]}>
          <mesh>
            <cylinderGeometry args={[0.0065, 0.0065, 0.007, 14]} />
            <meshStandardMaterial color={SURFACE.deep.color} roughness={0.75} />
          </mesh>
          <mesh position={[0, Math.sign(wx) * 0.0038, 0]}>
            <cylinderGeometry args={[0.0037, 0.0037, 0.0012, 12]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.4} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** The little gold crown that floats over whichever car is winning. Deliberately
 *  not one of the layer accents — it isn't a project colour, it's a trophy. */
const CROWN = GOLD;
function LeaderCrown() {
  const pts = useMemo(() => Array.from({ length: 5 }, (_, i) => (i / 5) * Math.PI * 2), []);
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.012, 0.0022, 6, 16]} />
        <meshStandardMaterial color={CROWN} emissive={CROWN} emissiveIntensity={1.2} roughness={0.35} toneMapped={false} />
      </mesh>
      {pts.map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 0.012, 0.007, Math.sin(a) * 0.012]}>
          <coneGeometry args={[0.003, 0.011, 5]} />
          <meshStandardMaterial color={CROWN} emissive={CROWN} emissiveIntensity={1.2} roughness={0.35} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/* Two cars actually racing, rather than two cars bolted to one turntable.
   They used to be children of a single rotating group, which is why they held a
   perfect 180° apart at identical speed forever — a carousel, not a race.
   Each one now runs its own lap, and three things stack up to make it a contest:

     · `wob`/`amp` — speed rises and falls around the circuit on each car's own
       rhythm, so they're quick and slow in different places and the gap breathes.
       On its own this is NOT a race: the modulation averages out over a lap, so
       whoever starts ahead stays ahead forever.
     · `PACE` — a slow swing in outright pace, in antiphase between the two, so
       each is genuinely the quicker car for a spell. This is what opens a gap and
       then closes it again; the wobble only decides where on the lap they meet.
     · `CATCH` — a catch-up band on whoever is behind, growing with the gap and
       worth nothing at all when they're level.

   That last one used to be a slipstream — a tow that peaked just off the leader's
   tail — and it was wrong twice over. It parked the chaser on the leader's bumper
   (simulated: half the time inside a third of a radian, a pass every 7 seconds),
   and being open-loop it left the race at the mercy of the clock: the pace swing
   runs off `elapsedTime`, so depending on when the table was woken the gap could
   settle anywhere, and at four of eight wake phases the cars never traded places
   at all. Pushing from behind instead of pulling from the front fixes both — the
   band is a restoring force, so the gap is centred on zero no matter when you
   arrive, and nothing holds them together through the pass.

   Simulated across wake phases: a pass every ~19s, typical separation a fifth of
   the lap and up to a third at the peaks, only ~12% of the time nose-to-tail, and
   the speed factor never below 0.59 so neither car stalls or reverses.

   They also run marginally different lines, in and out, so a pass happens
   alongside instead of straight through the other car. */
const R = 0.2; // track radius — the drawn loop
const CARS = [
  { color: PALETTE.room.accent, at: 0, dr: 0.016, wob: 3, amp: 0.2, phase: 0, pace: 0 },
  { color: NEUTRAL, at: -1.8, dr: -0.016, wob: 2, amp: 0.26, phase: 1.9, pace: Math.PI },
];
const PACE = 0.17; // depth of the slow pace swing
const PACE_W = 0.175; // rad/s — a full swing every ~36s, so a pass is an event
const CATCH = 0.07; // how hard a dropped car pushes on, per radian of gap
const CATCH_CAP = 6; // never let the band become a rocket if the gap ever runs away
const LEAD_HYST = 0.07; // the crown won't change hands on a photo finish jitter

function CoffeeTableAR({ position, hoverSlug }: { position: V3; hoverSlug?: string }) {
  const { accent } = useAccent();
  const { hovered, selected, visited } = useActive(hoverSlug ?? '');
  const reduced = useReducedMotion();
  const cars = useRef<(Group | null)[]>([]);
  const crown = useRef<Group>(null);
  const speed = useRef(0.1);
  const live = useRef(0);
  // Distance covered, per car — this is what decides the lead, not where they
  // happen to be on the circle. Seeded with each car's starting offset so the
  // comparison is right from the first frame.
  const dist = useRef(CARS.map((c) => c.at));
  const lead = useRef(0);
  useFrame((s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    // ghost table: the cars barely creep; the race only runs once it's alive
    const sT = selected || visited ? 1 : hovered ? 0.45 : 0.1;
    speed.current += (sT - speed.current) * 0.05;
    live.current += ((selected || visited ? 1 : 0) - live.current) * FX.engage;
    const t = s.clock.elapsedTime;

    // who's ahead, by distance covered rather than where they sit on the circle.
    // The dead band stops the crown flickering between them through a pass.
    const d = dist.current[0] - dist.current[1];
    if (d > LEAD_HYST) lead.current = 0;
    else if (d < -LEAD_HYST) lead.current = 1;
    for (let i = 0; i < CARS.length; i++) {
      const c = CARS[i];
      if (!reduced) {
        let v = speed.current * (1 + c.amp * Math.sin(dist.current[i] * c.wob + c.phase) + PACE * Math.sin(t * PACE_W + c.pace));
        if (i !== lead.current) {
          // pushing on from behind, not being towed along in front: zero at the
          // pass, so they're free to come apart again on the other side of it
          const gap = Math.min(CATCH_CAP, Math.max(0, dist.current[lead.current] - dist.current[i]));
          v *= 1 + CATCH * gap;
        }
        dist.current[i] += v * dt;
      }
      const g = cars.current[i];
      if (g) g.rotation.y = dist.current[i];
    }

    // the crown rides whoever is ahead, and hops across the moment that changes
    if (crown.current) {
      const bob = reduced ? 0 : t;
      const a = dist.current[lead.current];
      const rad = R + CARS[lead.current].dr;
      crown.current.position.set(rad * Math.cos(a), 0.036 + Math.sin(bob * 3) * 0.004, -rad * Math.sin(a));
      crown.current.rotation.y = bob * 0.9;
      crown.current.scale.setScalar(live.current); // only once the race is real
      crown.current.visible = live.current > 0.02;
    }
  });
  return (
    <group position={position}>
      <BlobShadow position={[0, 0.004, 0]} radius={0.42} opacity={0.4} />
      <group>
        {/* The top is filleted rather than a hard-edged disc, so it catches the
            light the way the desk's SoftBox does instead of showing one bright
            cut line around the rim. A slightly inset core plus a torus round the
            edge is the round-table equivalent of SoftBox's radius. Edges are
            kept off the torus — a threshold outline on a curved band draws a
            ring on every segment. */}
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.32, 0.32, 0.019, 44]} />
          <LiveGlassMat slug="lightship-drive" tint="pale" />
        </mesh>
        <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.3145, 0.0095, 8, 44]} />
          <LiveGlassMat slug="lightship-drive" tint="pale" />
        </mesh>
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.3145, 0.3145, 0.0295, 44]} />
          <LiveGlassMat slug="lightship-drive" tint="pale" />
        </mesh>
        {/* the silhouette line, drawn once on the widest circle */}
        <Line points={circlePts(0.32)} position={[0, 0.18, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.32} />
        {/* legs taper toward the floor and toe in, so the table stands rather
            than resting on four identical dowels */}
        {([[0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]] as [number, number][]).map(([lx, lz], i) => (
          <mesh key={i} position={[lx * 0.94, 0.088, lz * 0.94]} rotation={[lz * 0.09, 0, -lx * 0.09]}>
            <cylinderGeometry args={[0.011, 0.017, 0.176, 10]} />
            <LiveGlassMat slug="lightship-drive" tint="pale" />
          </mesh>
        ))}
        {/* the AR race loop — a circle */}
        <Line points={circlePts(R)} position={[0, 0.2, 0]} color={accent} lineWidth={1.5} transparent opacity={0.7} />
        {/* Two cars racing the loop, each facing its direction of travel — one
            wears the room's coral, its rival the neutral white-blue. One carrier
            group per car, each turned by its own distance, so they're free to
            close on each other and swap places. */}
        {CARS.map((c, i) => (
          <group key={i} ref={(g) => (cars.current[i] = g)} position={[0, 0.202, 0]}>
            <group position={[R + c.dr, 0, 0]} rotation={[0, Math.PI, 0]}>
              <RaceCar color={c.color} />
            </group>
          </group>
        ))}
        {/* The trophy, floating over whoever is winning. Nested inside the table's
            own plane so the per-frame position below is purely the lap position —
            setting it directly on this group would overwrite the table height. */}
        <group position={[0, 0.202, 0]}>
          <group ref={crown} visible={false}>
            <LeaderCrown />
          </group>
        </group>
      </group>
    </group>
  );
}

// The Virtuele Brigade monitor's link: an antenna telescopes up out of the case
// when it's engaged and then tries to raise a connection — three arcs radiate off
// the tip in sequence, go quiet, and try again. It never quite succeeds, which is
// the joke and also how field kit actually behaves. Holds still under reduced
// motion (mast deployed, no search).
const ARCS = 3;
const SEARCH_PERIOD = 2.3; // seconds per attempt: a burst of arcs, then a wait
const ARC_STAGGER = 0.17; // seconds between one arc lighting and the next
const ARC_LIFE = 0.5; // how long a single arc takes to swell and fade
function BrigadeAntenna() {
  const reduced = useReducedMotion();
  const camera = useThree((st) => st.camera);
  const { accent } = useAccent();
  const { selected, visited } = useActive('virtuele-brigade');
  const grp = useRef<Group>(null);
  const mast = useRef<Group>(null);
  const hail = useRef<Group>(null);
  const tipMat = useRef<MeshStandardMaterial>(null);
  const arcMats = useRef<(MeshStandardMaterial | null)[]>([]);
  const glow = useRef(0);
  useFrame((s) => {
    glow.current += ((selected || visited ? 1 : 0) - glow.current) * FX.engage;
    const g = glow.current;
    const t = reduced ? 0 : s.clock.elapsedTime;
    if (grp.current) grp.current.visible = g > 0.02;
    // the mast telescopes up — length follows the engage ease, so it deploys
    if (mast.current) {
      mast.current.scale.y = Math.max(0.001, g);
      mast.current.rotation.z = reduced ? 0 : Math.sin(t * 1.3) * 0.03; // a slight sway
    }
    // The arcs live outside the mast (which is scaled in Y as it deploys, and would
    // squash them) and turn to face the camera. Flat rings read as a bare line from
    // this node's viewing angle, which is where they were disappearing.
    if (hail.current) {
      hail.current.position.y = 0.19 * g;
      hail.current.quaternion.copy(camera.quaternion);
    }
    const cycle = (t / SEARCH_PERIOD) % 1;
    const elapsed = cycle * SEARCH_PERIOD;
    for (let i = 0; i < ARCS; i++) {
      const m = arcMats.current[i];
      if (!m) continue;
      const local = (elapsed - i * ARC_STAGGER) / ARC_LIFE;
      m.opacity = local > 0 && local < 1 ? fxEnv(local) * FX.peak * g : 0;
    }
    // the tip pips once per attempt, brightest as the burst goes out
    if (tipMat.current) {
      tipMat.current.emissiveIntensity = (0.5 + (elapsed < 0.5 ? fxEnv(elapsed / 0.5) * 2.2 : 0)) * g;
    }
  });
  // Sits on the monitor's top edge: the case is centred at y 0.62 and is 0.34
  // tall, so its lid is at 0.79, and it stands at the screen's depth (z -0.13).
  return (
    <group ref={grp} position={[0, 0.78, -0.13]} visible={false}>
      {/* the mast, scaled up from its base so it grows out of the case */}
      <group ref={mast}>
        <mesh position={[0, 0.09, 0]}>
          <cylinderGeometry args={[0.0035, 0.005, 0.18, 6]} />
          <meshStandardMaterial color={NEUTRAL} emissive={NEUTRAL} emissiveIntensity={0.25} roughness={0.5} />
        </mesh>
        {/* the emitter on top */}
        <mesh position={[0, 0.19, 0]}>
          <sphereGeometry args={[0.011, 10, 10]} />
          <meshStandardMaterial ref={tipMat} color={accent} emissive={accent} emissiveIntensity={0.5} toneMapped={false} />
        </mesh>
      </group>
      {/* the hail: arcs opening off the tip, lighting in sequence, camera-facing */}
      <group ref={hail}>
        {Array.from({ length: ARCS }, (_, i) => (
          <mesh key={i}>
            <ringGeometry args={[0.03 + i * 0.026, 0.036 + i * 0.026, 26, 1, Math.PI * 0.28, Math.PI * 0.44]} />
            <meshStandardMaterial
              ref={(m) => { arcMats.current[i] = m; }}
              color={accent}
              emissive={accent}
              emissiveIntensity={1.3}
              transparent
              opacity={0}
              blending={AdditiveBlending}
              side={DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ---- the workstation's desk set (Virtuele Brigade) ----
   Keyboard, mouse and coffee cup. All three take the desk's own treatment —
   LiveGlassMat with ghost={false} — so they rest as plain authored glass and
   solidify together with the desk when the monitor is engaged, rather than
   staying frosted on a woken desk the way the old static clutter did. */
const DESK_SLUG = 'virtuele-brigade';

/** A low-profile keyboard: a slim slab with four raised key rows. The rows are
 *  four thin boxes rather than individual keys — at this scale that's the detail
 *  that survives, and 60 little cubes would only read as noise. */
function Keyboard({ position, rotation }: { position: V3; rotation?: V3 }) {
  // Kept low: at 0.006 tall these stood a full 0.007 proud of a 0.016 body and
  // read as cooling fins rather than keys. They only need to catch a highlight.
  const rows: V3[] = [
    [0, 0.0095, -0.036],
    [0, 0.0095, -0.012],
    [0, 0.0095, 0.012],
    [0, 0.0095, 0.036],
  ];
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[0.3, 0.016, 0.115]} radius={0.006} smoothness={2}>
        <LiveGlassMat slug={DESK_SLUG} ghost={false} tint="glass" />
      </RoundedBox>
      {rows.map((p, i) => (
        <mesh key={i} position={p}>
          <boxGeometry args={[0.26, 0.0035, 0.015]} />
          <LiveGlassMat slug={DESK_SLUG} ghost={false} tint="glass" />
        </mesh>
      ))}
      <Line points={roundedRectPts(0.3, 0.115, 0.006)} position={[0, 0.009, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.4} />
    </group>
  );
}

/** A mouse: a pebble with the button split scored down its front half. */
function Mouse({ position, rotation }: { position: V3; rotation?: V3 }) {
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[0.046, 0.026, 0.072]} radius={0.012} smoothness={3}>
        <LiveGlassMat slug={DESK_SLUG} ghost={false} tint="glass" />
      </RoundedBox>
      <Line
        points={[[0, 0.014, 0.004], [0, 0.014, 0.034]]}
        color={NEUTRAL}
        lineWidth={1}
        transparent
        opacity={0.45}
      />
    </group>
  );
}

/** A coffee cup, turned from a profile: a foot, a belly, a rolled lip and a D
 *  handle, with a dark disc of coffee just under the lip so it reads as full
 *  rather than as an empty tube. */
function CoffeeCup({ position, rotation, lit }: { position: V3; rotation?: V3; lit: LitLink }) {
  const cup = useGeometry(() =>
    merge([
      lathe([[0, 0], [0.021, 0], [0.0245, 0.003], [0.0285, 0.035], [0.0305, 0.066], [0.0311, 0.0703], [0.0301, 0.0724], [0.0287, 0.0708], [0.0279, 0.062], [0.018, 0.06], [0, 0.06]], 28),
      tube([[0.028, 0.059, 0], [0.043, 0.058, 0], [0.051, 0.045, 0], [0.047, 0.026, 0], [0.027, 0.02, 0]], 0.0042, 6, 24),
    ]),
  );
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={cup}>
        <LiveGlassMat slug={DESK_SLUG} ghost={false} tint="glass" />
      </mesh>
      <mesh position={[0, 0.066, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.0285, 24]} />
        <meshStandardMaterial {...litMat(lit)} color={SURFACE.deep.color} emissive={SURFACE.deep.color} emissiveIntensity={0.22} roughness={0.35} side={DoubleSide} />
      </mesh>
    </group>
  );
}

/** A tripod floor lamp: three splayed, tapered legs meeting at a turned hub,
 *  a stem on up to a drum shade with a real wall (outside and in), and a
 *  finial on top. */
function FloorLamp({ position }: { position: V3 }) {
  const g = useGeometry(() => {
    const frame: BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      // from the hub at 0.42 out and down to the floor at r 0.15
      const len = Math.hypot(0.15, 0.42);
      const tilt = Math.atan2(0.15, 0.42);
      frame.push(place(hang(softBox(0.012, len, 0.012, 0.004, { taper: 1.7 }), len, [0, 0, 0], [tilt, 0, 0]), [0, 0.42, 0], [0, a, 0]));
    }
    frame.push(place(lathe([[0, -0.03], [0.014, -0.03], [0.018, -0.012], [0.018, 0.012], [0.012, 0.03], [0, 0.03]], 16), [0, 0.42, 0]));
    frame.push(place(lathe([[0, 0], [0.006, 0], [0.006, 0.3], [0, 0.3]], 10), [0, 0.43, 0]));
    frame.push(place(lathe([[0, 0], [0.008, 0], [0.012, 0.012], [0.006, 0.024], [0, 0.028]], 12), [0, 0.81, 0])); // finial
    const shade = lathe([[0.132, 0.63], [0.136, 0.633], [0.12, 0.806], [0.116, 0.81], [0.113, 0.806], [0.129, 0.633], [0.126, 0.63]], 40);
    return { frame: merge(frame), shade };
  });
  return (
    <group position={position}>
      <BlobShadow position={[0, 0.003, 0]} radius={0.2} opacity={0.34} />
      <mesh geometry={g.frame}>
        <GlassMat tint="glass" />
      </mesh>
      <mesh geometry={g.shade}>
        <GlassMat tint="pale" />
      </mesh>
    </group>
  );
}

/** A leafy potted houseplant: a turned pot — foot, belly, a rolled rim — and
 *  fourteen arching strap leaves, each folded along its midrib and set on the
 *  golden angle so no two line up. It used to be nine squashed cones, which
 *  read as a bundle of spikes. With a `liveSlug` it solidifies alongside that
 *  hotspot (the workstation). */
function PottedPlant({ position, liveSlug }: { position: V3; liveSlug?: string }) {
  const g = useGeometry(() => {
    const pot = merge([
      lathe([[0, 0], [0.084, 0], [0.094, 0.006], [0.113, 0.06], [0.126, 0.128], [0.13, 0.152], [0.1335, 0.161], [0.128, 0.1665], [0.1215, 0.159], [0, 0.156]], 36),
      lathe([[0, 0.149], [0.121, 0.146], [0, 0.146]], 36), // the soil, a hair domed
    ]);
    const leaves: BufferGeometry[] = [];
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39996;
      const k = ((i * 9) % 14) / 13; // 0..1, scrambled
      const H = 0.3 + k * 0.2; // height the leaf reaches
      const R = 0.12 + (1 - k) * 0.11; // how far it arches out
      const dir = [Math.cos(a), 0, Math.sin(a)];
      const at = (r: number, y: number): [number, number, number] => [dir[0] * r, 0.15 + y, dir[2] * r];
      leaves.push(leaf([at(0, 0), at(R * 0.22, H * 0.55), at(R * 0.55, H * 0.92), at(R, H * 0.8)], 0.066 + (1 - k) * 0.016, [-dir[2], 0, dir[0]], { fold: 0.3, widest: 0.42 }));
    }
    return { pot, leaves: merge(leaves) };
  });
  return (
    <group position={position}>
      <BlobShadow position={[0, 0.003, 0]} radius={0.2} opacity={0.34} />
      <mesh geometry={g.pot}>{liveSlug ? <LiveGlassMat slug={liveSlug} ghost={false} tint="deep" /> : <GlassMat tint="deep" />}</mesh>
      <mesh geometry={g.leaves}>{liveSlug ? <LiveGlassMat slug={liveSlug} ghost={false} tint="pale" solid={0.5} /> : <GlassMat tint="pale" />}</mesh>
    </group>
  );
}

// Books on the shelves (local to the bookcase group), standing spine-out with
// real depth and varied size; a couple lean. Each shelf packed.
//
// The spines used to be six hand-mixed blues. They were already a value ramp —
// which is the right instinct — so they're now that ramp expressed in the three
// SURFACE cuts instead of its own private set. Books stay opaque: a stack of
// paper is the densest thing in the room, and the cut only supplies the value.
const BOOKS: { p: V3; s: V3; c: Tint; r?: V3 }[] = [
  // top shelf (y ≈ 0.78)
  { p: [-0.30, 0.78, 0.02], s: [0.05, 0.17, 0.18], c: 'deep' },
  { p: [-0.245, 0.785, 0.02], s: [0.045, 0.18, 0.18], c: 'glass' },
  { p: [-0.19, 0.778, 0.02], s: [0.052, 0.165, 0.18], c: 'glass' },
  { p: [-0.12, 0.79, 0.02], s: [0.06, 0.19, 0.18], c: 'deep' },
  { p: [-0.05, 0.775, 0.02], s: [0.046, 0.16, 0.18], c: 'glass' },
  { p: [0.02, 0.783, 0.02], s: [0.05, 0.175, 0.18], c: 'pale' },
  { p: [0.10, 0.78, 0.02], s: [0.055, 0.17, 0.18], c: 'deep' },
  { p: [0.185, 0.787, 0.02], s: [0.05, 0.185, 0.18], c: 'glass' },
  { p: [0.258, 0.742, 0.02], s: [0.05, 0.16, 0.18], c: 'glass', r: [0, 0, 0.17] }, // leaning
  // middle shelf (y ≈ 0.52) — gap at x ≈ 0.12 for the open Zwijsen book
  { p: [-0.30, 0.52, 0.02], s: [0.05, 0.17, 0.18], c: 'glass' },
  { p: [-0.245, 0.515, 0.02], s: [0.048, 0.16, 0.18], c: 'deep' },
  { p: [-0.185, 0.523, 0.02], s: [0.055, 0.18, 0.18], c: 'glass' },
  { p: [-0.11, 0.52, 0.02], s: [0.05, 0.17, 0.18], c: 'pale' },
  { p: [-0.04, 0.518, 0.02], s: [0.052, 0.165, 0.18], c: 'deep' },
  { p: [0.26, 0.52, 0.02], s: [0.05, 0.17, 0.18], c: 'glass' },
  { p: [0.214, 0.5, 0.02], s: [0.05, 0.15, 0.18], c: 'deep', r: [0, 0, -0.15] }, // leaning into the gap
  // bottom shelf (y ≈ 0.26) — books, then a horizontal stack fills the right
  { p: [-0.30, 0.26, 0.02], s: [0.052, 0.17, 0.18], c: 'glass' },
  { p: [-0.24, 0.265, 0.02], s: [0.05, 0.18, 0.18], c: 'glass' },
  { p: [-0.18, 0.258, 0.02], s: [0.055, 0.165, 0.18], c: 'deep' },
  { p: [-0.11, 0.262, 0.02], s: [0.048, 0.175, 0.18], c: 'deep' },
  { p: [-0.04, 0.26, 0.02], s: [0.05, 0.17, 0.18], c: 'glass' },
  { p: [0.03, 0.255, 0.02], s: [0.052, 0.16, 0.18], c: 'pale' },
];

/** The Zwijsen AR-books hotspot — a real little book. Two rigid halves (cover
 *  board + page block + printed page) hinge at the spine: it stands CLOSED in
 *  its shelf gap, and on select it lifts out, tilts toward the player and the
 *  front half swings open to reveal the spread — the left/right halves of
 *  public/textures/zwijsen-book.jpg (cream pages until it loads). The printed
 *  pages sit on top of their blocks, so nothing clips through anything. */
const BOOK_W = 0.17; // full open width
const BOOK_H = 0.19; // page depth (spine length)
const BOOK_T = 0.011; // cover board thickness
const BOOK_PT = 0.009; // page block thickness per half
const BOOK_ANG = 0.22; // resting V of the halves once open
function BookHalf({ side, tex, lit }: { side: -1 | 1; tex: Texture | null; lit: LitLink }) {
  const { accentDeep } = useAccent();
  const x = (side * BOOK_W) / 4;
  return (
    <>
      {/* cover board */}
      <mesh position={[x, 0, 0]}>
        <boxGeometry args={[BOOK_W / 2, BOOK_T, BOOK_H]} />
        <meshStandardMaterial {...litMat(lit)} color={accentDeep} emissive={accentDeep} emissiveIntensity={0.16} roughness={0.5} />
      </mesh>
      {/* page block */}
      <mesh position={[x, BOOK_T / 2 + BOOK_PT / 2, 0]}>
        <boxGeometry args={[BOOK_W / 2 - 0.012, BOOK_PT, BOOK_H - 0.014]} />
        <meshStandardMaterial {...litMat(lit)} color={SURFACE.pale.color} emissive={SURFACE.pale.color} emissiveIntensity={0.1} roughness={0.85} />
      </mesh>
      {/* the printed page on top of the block */}
      <mesh position={[x, BOOK_T / 2 + BOOK_PT + 0.0008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BOOK_W / 2 - 0.016, BOOK_H - 0.02]} />
        {tex ? (
          <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.5} roughness={0.75} toneMapped={false} side={DoubleSide} />
        ) : (
          <meshStandardMaterial color={SURFACE.pale.color} emissive={SURFACE.pale.color} emissiveIntensity={0.14} roughness={0.85} side={DoubleSide} />
        )}
      </mesh>
    </>
  );
}
// Holographic content lifting off the open page — a few small wireframe glyphs
// that rise, turn and fade above the spread while the book is open. The AR the
// Zwijsen books are about, made literal; off under reduced motion.
function BookAR({ slug }: { slug: string }) {
  const reduced = useReducedMotion();
  const { accent } = useAccent();
  const { selected } = useActive(slug);
  const refs = useRef<(Group | null)[]>([]);
  const mats = useRef<(MeshStandardMaterial | null)[]>([]);
  const glow = useRef(0);
  const items = useMemo(
    () => [
      { x: -0.035, z: -0.02, spd: 0.3, ph: 0.0, kind: 0 },
      { x: 0.03, z: 0.02, spd: 0.26, ph: 0.4, kind: 1 },
      { x: 0.0, z: 0.045, spd: 0.34, ph: 0.72, kind: 2 },
    ],
    [],
  );
  useFrame((s) => {
    glow.current += ((selected && !reduced ? 1 : 0) - glow.current) * FX.engage;
    const t = s.clock.elapsedTime;
    for (let i = 0; i < items.length; i++) {
      const g = refs.current[i];
      const m = mats.current[i];
      const it = items[i];
      if (!g) continue;
      const p = (t * it.spd + it.ph) % 1;
      g.position.set(it.x, 0.03 + p * 0.16, it.z); // rise off the page
      g.rotation.set(t * 0.5, t * 0.8 + it.ph * 6, 0);
      g.scale.setScalar(0.55 + 0.45 * Math.sin(p * Math.PI));
      if (m) m.opacity = fxEnv(p) * FX.peak * glow.current;
    }
  });
  return (
    <group>
      {items.map((it, i) => (
        <group key={i} ref={(r) => (refs.current[i] = r)}>
          <mesh>
            {it.kind === 0 ? <boxGeometry args={[0.026, 0.026, 0.026]} /> : it.kind === 1 ? <tetrahedronGeometry args={[0.021]} /> : <octahedronGeometry args={[0.02]} />}
            <meshStandardMaterial ref={(r) => (mats.current[i] = r)} color={accent} emissive={accent} emissiveIntensity={1.4} transparent opacity={0} wireframe toneMapped={false} depthWrite={false} userData={{ lifeSkip: true }} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function OpenBook({ slug, position }: { slug: string; position: V3 }) {
  const { accent } = useAccent();
  const { selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const grp = useRef<Group>(null);
  // lit on hover (lit.tsx): the boards, the page blocks and the spine — the
  // printed spread keeps its picture
  const lit = useLitLink(slug);
  const body = useLitBody(grp);
  const frontHinge = useRef<Group>(null); // the half that swings open
  const backHinge = useRef<Group>(null);
  const sel = useRef(0); // 0 = closed in the gap, 1 = lifted + open + facing you
  const tex = useOptionalTexture('/textures/zwijsen-book.jpg');
  // the spread is one image — clone it into a left and a right half
  const [texL, texR] = useMemo(() => {
    if (!tex) return [null, null] as const;
    const half = (off: number) => {
      const t = tex.clone();
      t.repeat.set(0.5, 1);
      t.offset.set(off, 0);
      t.needsUpdate = true;
      return t;
    };
    return [half(0), half(0.5)] as const;
  }, [tex]);
  useEffect(
    () => () => {
      texL?.dispose();
      texR?.dispose();
    },
    [texL, texR],
  );
  useFrame(() => {
    body(lit.litU.value, selected || visited);
    sel.current += ((selected ? 1 : 0) - sel.current) * 0.09;
    const s = reduced ? (selected ? 1 : 0) : sel.current;
    const g = grp.current;
    if (g) {
      // stands closed in the gap (cover out); lifts forward + tilts back so
      // the opening spread reads face-on. Closed, both halves fold onto the
      // hinge's +x side, so the rest pose shifts −x to centre that mass in
      // the gap and keep clear of the leaning neighbour.
      g.rotation.x = (Math.PI / 2) * (1 - s) + 1.12 * s;
      g.rotation.y = 0.35 * s;
      g.position.set(position[0] - 0.04 + 0.01 * s, position[1] + 0.01 + 0.13 * s, position[2] + 0.02 + 0.26 * s);
    }
    // the front half swings 180° around the spine, from folded-shut to the
    // open V; its hinge also drops level with the back half as it opens
    if (frontHinge.current) {
      frontHinge.current.rotation.z = Math.PI * (1 - s) - BOOK_ANG * s;
      frontHinge.current.position.y = (BOOK_T + BOOK_PT * 2 + 0.001) * (1 - s);
    }
    if (backHinge.current) backHinge.current.rotation.z = BOOK_ANG * s;
  });
  return (
    <group ref={grp} position={position}>
      {/* back half — stays put, tilting into its side of the V */}
      <group ref={backHinge}>
        <BookHalf side={1} tex={texR} lit={lit} />
      </group>
      {/* front half — folded over when closed, swings open on select */}
      <group ref={frontHinge}>
        <BookHalf side={-1} tex={texL} lit={lit} />
      </group>
      {/* spine */}
      <mesh position={[0, -0.001, 0]}>
        <boxGeometry args={[0.015, BOOK_T + 0.003, BOOK_H]} />
        <meshStandardMaterial {...litMat(lit)} color={accent} emissive={accent} emissiveIntensity={0.14} roughness={0.5} />
      </mesh>
      {/* holographic content lifting off the open spread */}
      <BookAR slug={slug} />
    </group>
  );
}

/** A little mouse that lives behind the Zwijsen book. When the book is picked up
 *  it hops out of the gap it leaves, drops to the floor and then scurries a loop
 *  around the bookcase. Coords are bookcase-local; it lives outside the pop group
 *  so the bookcase's select-bounce doesn't squash it. */
const MOUSE_GROUND = 0.03; // belly on the floor, bookcase-local
function BookcaseMouse({ gap }: { gap: V3 }) {
  const { accent, accentPale } = useAccent();
  const { selected } = useActive('zwijsen-ar-books');
  const reduced = useReducedMotion();
  const ref = useRef<Group>(null);
  const pos = useMemo(() => new Vector3(), []);
  const vel = useMemo(() => new Vector3(), []);
  const phase = useRef<'hidden' | 'arming' | 'jump' | 'walk'>('hidden');
  const delay = useRef(0);
  const walkT = useRef(0);
  const yaw = useRef(0);
  // The loop the mouse walks — an ellipse that encloses the bookcase footprint.
  const CX = 0;
  const CZ = 0.02;
  const RX = 0.52;
  const RZ = 0.34;

  useFrame((s, delta) => {
    const g = ref.current;
    if (!g) return;
    const dt = Math.min(delta, 1 / 30);
    const t = s.clock.elapsedTime;

    if (selected && phase.current === 'hidden') {
      phase.current = 'arming';
      delay.current = reduced ? 0 : 0.35; // let the book clear the shelf first
    }
    if (phase.current === 'arming') {
      delay.current -= dt;
      if (delay.current <= 0) {
        g.visible = true;
        if (reduced) {
          phase.current = 'walk';
          walkT.current = Math.PI / 2; // sit at the front, no hop
          pos.set(CX, MOUSE_GROUND, CZ + RZ);
        } else {
          phase.current = 'jump';
          pos.set(gap[0], gap[1], gap[2]);
          vel.set(0.05, 0.72, 0.55); // hop up and out toward the room
        }
      }
    } else if (phase.current === 'jump') {
      vel.y -= 3.0 * dt; // gravity
      pos.addScaledVector(vel, dt);
      yaw.current = Math.atan2(vel.x, vel.z);
      if (pos.y <= MOUSE_GROUND) {
        pos.y = MOUSE_GROUND;
        phase.current = 'walk';
        walkT.current = Math.atan2((pos.z - CZ) / RZ, (pos.x - CX) / RX); // continue from here
      }
    } else if (phase.current === 'walk') {
      const speed = reduced ? 0 : 0.85 + Math.sin(t * 6) * 0.18; // rad/s, with a little scurry
      walkT.current += speed * dt;
      pos.set(CX + Math.cos(walkT.current) * RX, MOUSE_GROUND, CZ + Math.sin(walkT.current) * RZ);
      pos.y += reduced ? 0 : Math.abs(Math.sin(t * 15)) * 0.004; // scurry bob
      yaw.current = Math.atan2(-Math.sin(walkT.current) * RX, Math.cos(walkT.current) * RZ);
    }

    if (phase.current === 'hidden') {
      g.visible = false;
      return;
    }
    g.position.copy(pos);
    g.rotation.y = yaw.current;
    g.rotation.x = phase.current === 'jump' ? Math.max(-0.5, Math.min(0.5, -vel.y * 0.3)) : 0;
  });

  const GREY = SURFACE.pale.color;
  const PINK = PALETTE.room.accentPale;
  return (
    <group ref={ref} visible={false}>
      <mesh scale={[0.024, 0.02, 0.034]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color={GREY} emissive={SURFACE.deep.color} emissiveIntensity={0.25} roughness={0.7} flatShading />
      </mesh>
      <mesh position={[0, 0.004, 0.03]} scale={[0.015, 0.014, 0.018]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color={SURFACE.pale.color} emissive={SURFACE.deep.color} emissiveIntensity={0.25} roughness={0.7} flatShading />
      </mesh>
      {[-1, 1].map((sx, i) => (
        <mesh key={`ear${i}`} position={[sx * 0.011, 0.016, 0.026]}>
          <sphereGeometry args={[0.008, 10, 8]} />
          <meshStandardMaterial color={PINK} emissive={SURFACE.deep.color} emissiveIntensity={0.2} roughness={0.7} />
        </mesh>
      ))}
      {[-1, 1].map((sx, i) => (
        <mesh key={`eye${i}`} position={[sx * 0.007, 0.006, 0.042]}>
          <sphereGeometry args={[0.0035, 8, 8]} />
          <meshStandardMaterial color={accentPale} emissive={accent} emissiveIntensity={1.2} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, 0.001, 0.05]}>
        <sphereGeometry args={[0.004, 8, 8]} />
        <meshStandardMaterial color={accentPale} emissive={accentPale} emissiveIntensity={0.5} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.007, -0.03]} rotation={[-0.5, 0, 0]}>
        <cylinderGeometry args={[0.0015, 0.003, 0.05, 6]} />
        <meshStandardMaterial color={PINK} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** The bookcase. Engaging the Zwijsen book "turns it on": the book spines glow,
 *  alongside the open spread lifting out to face the player.
 *
 *  Built like furniture: sides with a softened front edge, a top that
 *  overhangs as a cornice, a plinth set back as a toe kick, a thin back let
 *  into the frame, and shelves with a front lip. The books are rounded, sit
 *  ON their shelves (they used to float a few millimetres over them), run to
 *  different depths with their spines lined up at the front, and carry two
 *  bands near each end of the spine — the detail that makes a box read as a
 *  book. The stack lies a little askew, and the plant on top is a succulent
 *  in a turned pot. Each tone is one mesh: the case, three book values and
 *  the two band values, instead of a mesh per book. */
const SHELF_TOPS = [0.171, 0.431, 0.691];
const SPINE_Z = 0.13; // where the spines line up, a little behind the lip
function Bookcase({ position, rotation }: { position: V3; rotation: [number, number, number] }) {
  const { hovered, selected, visited } = useActive('zwijsen-ar-books');
  const bookMats = useRef<(MeshStandardMaterial | null)[]>([]);
  const lit = useRef(0);
  // the hover light (lit.tsx) for the shelved books and the plant; the books
  // are the body — the frame's glass brings its own
  const link = useLitLink('zwijsen-ar-books');
  const shelved = useRef<Group>(null);
  const body = useLitBody(shelved);
  useFrame(() => {
    const t = hovered || selected ? 1 : visited ? 0.3 : 0;
    lit.current += (t - lit.current) * 0.1;
    const e = 0.1 + lit.current * 0.7;
    for (const m of bookMats.current) if (m) m.emissiveIntensity = e;
    body(link.litU.value, selected || visited);
  });
  const frame = useGeometry(() => {
    const parts: BufferGeometry[] = [];
    for (const sx of [-1, 1]) parts.push(place(softBox(0.028, 0.92, 0.27, 0.007), [sx * 0.356, 0.46, 0.035]));
    parts.push(place(softBox(0.776, 0.028, 0.292, 0.009), [0, 0.934, 0.036])); // the cornice
    parts.push(place(softBox(0.66, 0.045, 0.2, 0.004), [0, 0.0225, 0.01])); // toe kick
    parts.push(place(softBox(0.686, 0.025, 0.25, 0.004), [0, 0.057, 0.035]));
    parts.push(place(softBox(0.686, 0.9, 0.012, 0.003), [0, 0.47, -0.092]));
    for (const top of SHELF_TOPS) {
      parts.push(place(softBox(0.686, 0.022, 0.235, 0.004), [0, top - 0.011, 0.028]));
      parts.push(place(softBox(0.686, 0.03, 0.016, 0.005), [0, top - 0.014, 0.146])); // the lip
    }
    return merge(parts);
  });
  const books = useGeometry(() => {
    const tone: Record<Tint, BufferGeometry[]> = { glass: [], deep: [], pale: [] };
    const light: BufferGeometry[] = [];
    const dark: BufferGeometry[] = [];
    BOOKS.forEach((bk, i) => {
      const [w, h] = bk.s;
      const d = 0.15 + ((i * 37) % 5) * 0.01; // 15–19 cm deep, spines flush
      const top = SHELF_TOPS.reduce((a, b) => (Math.abs(b - (bk.p[1] - h / 2)) < Math.abs(a - (bk.p[1] - h / 2)) ? b : a));
      // a leaning book keeps its place; an upright one stands on the shelf
      const at: V3 = bk.r ? bk.p : [bk.p[0], top + h / 2, SPINE_Z - d / 2];
      const rot = bk.r ?? [0, 0, 0];
      tone[bk.c].push(place(softBox(w, h, d, 0.0035, { band: 1, mid: 1 }), at, rot)); // a 3.5 mm round needs one step
      // two bands near each end of the spine, in the opposite value
      for (const y of [h / 2 - 0.022, -h / 2 + 0.026]) {
        const band = place(softBox(w + 0.0016, 0.006, d + 0.0016, 0.0025, { band: 1, mid: 1 }), [0, y, 0]);
        (bk.c === 'pale' ? dark : light).push(place(band, at, rot));
      }
    });
    // the stack on the bottom shelf, each a little askew
    const stack: [number, number, number, number, Tint][] = [
      [0.2, 0.03, 0.16, 0.02, 'deep'],
      [0.19, 0.028, 0.152, -0.05, 'glass'],
      [0.176, 0.026, 0.148, 0.07, 'pale'],
    ];
    let y = SHELF_TOPS[0];
    for (const [w, h, d, yaw, c] of stack) {
      tone[c].push(place(softBox(w, h, d, 0.004, { band: 1, mid: 1 }), [0.19, y + h / 2, 0.035], [0, yaw, 0]));
      y += h;
    }
    return { glass: merge(tone.glass), deep: merge(tone.deep), pale: merge(tone.pale), light: merge(light), dark: merge(dark) };
  });
  const plant = useGeometry(() => {
    const pot = lathe([[0, 0], [0.022, 0], [0.024, 0.004], [0.027, 0.03], [0.032, 0.035], [0.0325, 0.04], [0.0275, 0.039], [0.026, 0.034], [0, 0.032]], 24);
    const leaves: BufferGeometry[] = [];
    const leafShape = [[0, 0], [0.0075, 0.006], [0.0085, 0.017], [0.0045, 0.031], [0, 0.037]] as [number, number][];
    for (let i = 0; i < 13; i++) {
      const a = i * 2.39996; // the golden angle, like the real thing
      const ring = i / 13;
      const k = 1 - ring * 0.35; // the outer leaves are the older, smaller ones
      // flattened along the tilt, so the broad face turns up and out
      leaves.push(place(lathe(leafShape, 8), [0, 0.034, 0], [0, a, 0.25 + ring * 0.9], [0.55 * k, 1 - ring * 0.3, k]));
    }
    return { pot, leaves: merge(leaves) };
  });
  return (
    <group position={position} rotation={rotation}>
      <BlobShadow position={[0, 0.004, 0.04]} radius={0.52} aspect={0.55} opacity={0.4} />
      <group>
        <mesh geometry={frame}>
          <LiveGlassMat slug="zwijsen-ar-books" ghost={false} opacity={0.22} />
        </mesh>
        <group ref={shelved}>
          {(['glass', 'deep', 'pale'] as const).map((c, i) => (
            <mesh key={c} geometry={books[c]}>
              <meshStandardMaterial ref={(m) => (bookMats.current[i] = m)} {...litMat(link)} color={SURFACE[c].color} emissive={SURFACE[c].color} emissiveIntensity={0.1} roughness={0.6} />
            </mesh>
          ))}
          <mesh geometry={books.light}>
            <meshStandardMaterial {...litMat(link)} color={SURFACE.pale.color} emissive={SURFACE.pale.color} emissiveIntensity={0.16} roughness={0.5} />
          </mesh>
          <mesh geometry={books.dark}>
            <meshStandardMaterial {...litMat(link)} color={SURFACE.deep.color} emissive={SURFACE.deep.color} emissiveIntensity={0.12} roughness={0.5} />
          </mesh>
        </group>
        <group position={[0.25, 0.948, 0.05]}>
          <mesh geometry={plant.pot}>
            <GlassMat tint="deep" lit={link} />
          </mesh>
          <mesh geometry={plant.leaves}>
            <GlassMat tint="pale" lit={link} />
          </mesh>
        </group>
        <LifeGroup slug="zwijsen-ar-books">
          <OpenBook slug="zwijsen-ar-books" position={[0.12, 0.52, 0.04]} />
        </LifeGroup>
      </group>
      <BookcaseMouse gap={[0.12, 0.52, 0.04]} />
    </group>
  );
}

/* ---------- the workstation ---------- */

/** The Virtuele Brigade desk and everything on it, in the desk's own frame.
 *
 *  A Scandinavian writing desk: a thin top with an eased edge, an apron with
 *  one drawer, and square legs that taper to the floor and splay a little.
 *  The top's surface is at 0.395, which the keyboard, mouse and cup sit on.
 *  The monitor is a thin panel with a rounded housing behind it, on a real
 *  stand — an oval foot, a flat neck and a hinge — where it used to be a 3 cm
 *  slab on a dowel; engaging it solidifies the desk, chair and plant with it
 *  (the life spreads). Everything structural stays behind the screen's plane
 *  (z -0.125), so nothing crosses the picture. */
function Desk({ brigade }: { brigade: LitLink }) {
  const g = useGeometry(() => {
    const wood: BufferGeometry[] = [];
    const trim: BufferGeometry[] = [];
    wood.push(place(softBox(0.95, 0.032, 0.46, 0.008), [0, 0.379, 0]));
    // apron: back and sides plain, the front carrying a drawer on the right
    wood.push(place(softBox(0.84, 0.045, 0.02, 0.004), [0, 0.34, -0.19]));
    for (const sx of [-1, 1]) wood.push(place(softBox(0.02, 0.045, 0.36, 0.004), [sx * 0.42, 0.34, 0]));
    wood.push(place(softBox(0.48, 0.045, 0.02, 0.004), [-0.18, 0.34, 0.19]));
    wood.push(place(softBox(0.34, 0.045, 0.018, 0.005, { bulge: 0.002 }), [0.25, 0.34, 0.194]));
    trim.push(place(softBox(0.1, 0.008, 0.008, 0.0035), [0.25, 0.34, 0.206]));
    // legs: 36 mm at the joint, 22 at the foot, splayed out
    for (const [lx, lz] of [[-0.42, -0.19], [0.42, -0.19], [-0.42, 0.19], [0.42, 0.19]]) {
      wood.push(hang(softBox(0.022, 0.365, 0.022, 0.006, { taper: 1.64 }), 0.365, [lx, 0.364, lz], [Math.sign(lz) * 0.05, 0, -Math.sign(lx) * 0.05]));
    }
    return { wood: merge(wood), trim: merge(trim) };
  });
  const m = useGeometry(() => {
    const body: BufferGeometry[] = [];
    // an oval foot, a flat neck rising behind the panel, and the hinge
    body.push(place(lathe([[0, 0], [0.088, 0], [0.093, 0.004], [0.088, 0.009], [0, 0.009]], 36), [0, 0.395, -0.16], [0, 0, 0], [1, 1, 0.62]));
    body.push(place(softBox(0.052, 0.2, 0.014, 0.006, { taper: 0.9 }), [0, 0.5, -0.172]));
    body.push(place(lathe([[0, -0.034], [0.012, -0.034], [0.012, 0.034], [0, 0.034]], 16), [0, 0.598, -0.166], [0, 0, Math.PI / 2]));
    // thin panel; the rounded housing behind it holds the electronics
    body.push(place(softBox(0.54, 0.335, 0.018, 0.009), [0, 0.62, -0.134]));
    body.push(place(softBox(0.36, 0.22, 0.02, 0.01, { bulgeBack: 0.008, mid: 4 }), [0, 0.612, -0.152]));
    return merge(body);
  });
  return (
    <>
      <mesh geometry={g.wood}>
        <LiveGlassMat slug="virtuele-brigade" ghost={false} opacity={0.2} />
      </mesh>
      <mesh geometry={g.trim}>
        <LiveGlassMat slug="virtuele-brigade" ghost={false} tint="pale" />
      </mesh>
      <LifeGroup slug="virtuele-brigade">
        <mesh geometry={m}>
          <LiveGlassMat slug="virtuele-brigade" opacity={0.2} />
        </mesh>
        <RoomScreen slug="virtuele-brigade" position={[0, 0.62, -0.122]} args={[0.48, 0.28, 0.008]} />
      </LifeGroup>
      {/* keyboard square in front of the monitor, mouse to its right, the cup
          off to the left where an elbow won't knock it */}
      <Keyboard position={[-0.02, 0.403, 0.06]} rotation={[0, 0.04, 0]} />
      <Mouse position={[0.235, 0.408, 0.055]} rotation={[0, -0.12, 0]} />
      <CoffeeCup position={[-0.34, 0.395, 0.075]} rotation={[0, -0.5, 0]} lit={brigade} />
      {/* the antenna deploying out of the monitor, hailing for a link */}
      <BrigadeAntenna />
    </>
  );
}

/** The office chair, facing the desk: a five-star base whose spokes taper out
 *  to twin-wheel castors, a sleeved gas lift and a mechanism under the seat, a
 *  seat with a crowned top and a waterfall front, a back shell curved round
 *  the sitter and carried on a single spine, so daylight shows between seat
 *  and back, and T arms. */
function OfficeChair() {
  const g = useGeometry(() => {
    const soft: BufferGeometry[] = [];
    const frame: BufferGeometry[] = [];
    // base: hub, five tapered spokes dipping to their castors
    frame.push(place(lathe([[0, 0], [0.03, 0], [0.032, 0.015], [0.026, 0.034], [0, 0.034]], 20), [0, 0.03, 0]));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const spoke = place(softBox(0.03, 0.125, 0.02, 0.007, { taper: 0.62 }), [0, 0.0625, 0]); // along +y from the hub
      frame.push(place(place(spoke, [0, 0, 0], [Math.PI / 2 + 0.14, 0, 0]), [0, 0.05, 0], [0, -a, 0]));
      // castor: a stem, a hood and twin wheels, turned to trail
      const cx = Math.sin(-a) * 0.123;
      const cz = Math.cos(-a) * 0.123;
      frame.push(place(lathe([[0, 0], [0.0045, 0], [0.0045, 0.014], [0, 0.014]], 8), [cx, 0.024, cz]));
      for (const side of [-1, 1]) {
        frame.push(place(lathe([[0, -0.004], [0.0125, -0.004], [0.014, -0.002], [0.014, 0.002], [0.0125, 0.004], [0, 0.004]], 14), [cx + Math.cos(a) * side * 0.006, 0.014, cz + Math.sin(a) * side * 0.006], [0, -a, Math.PI / 2]));
      }
    }
    // gas lift: sleeve, piston, mechanism
    frame.push(place(lathe([[0, 0.05], [0.022, 0.05], [0.021, 0.15], [0.014, 0.152], [0.013, 0.2], [0, 0.2]], 16), [0, 0, 0]));
    frame.push(place(softBox(0.13, 0.028, 0.15, 0.008), [0, 0.2, -0.01]));
    // the seat: crowned, with a waterfall front
    soft.push(place(softBox(0.34, 0.058, 0.33, 0.024, { crown: 0.008, bulge: 0.012, mid: 5 }), [0, 0.242, 0.005]));
    // the spine: out from under the seat, round and up behind the back
    frame.push(tube([[0, 0.205, -0.06], [0, 0.206, -0.13], [0, 0.228, -0.168], [0, 0.3, -0.18], [0, 0.39, -0.174]], 0.011, 8, 32));
    // the back shell, curved round the sitter, with a lumbar swell
    soft.push(place(softBox(0.3, 0.28, 0.034, 0.018, { bend: 0.03, bulge: 0.01, mid: 5 }), [0, 0.45, -0.152], [-0.1, 0, 0]));
    // T arms: a post from under the seat, a padded rest
    for (const sx of [-1, 1]) {
      frame.push(place(softBox(0.022, 0.13, 0.034, 0.008), [sx * 0.175, 0.29, -0.04]));
      frame.push(place(softBox(0.08, 0.018, 0.034, 0.008), [sx * 0.14, 0.205, -0.04]));
      soft.push(place(softBox(0.045, 0.022, 0.17, 0.01, { crown: 0.003 }), [sx * 0.175, 0.362, -0.025]));
    }
    return { soft: merge(soft), frame: merge(frame) };
  });
  return (
    <>
      <mesh geometry={g.soft}>
        <LiveGlassMat slug="virtuele-brigade" ghost={false} opacity={0.2} />
      </mesh>
      <mesh geometry={g.frame}>
        <LiveGlassMat slug="virtuele-brigade" ghost={false} tint="pale" />
      </mesh>
    </>
  );
}

/* ---------- the couch ---------- */

// A mid-century two-seater, 0.92 × 0.44, its seat cushions' flat top at
// 0.197 — the phone, its balls (COUCH_SEAT_Y) and the popcore hotspot are
// all placed against that. The arms rise from the floor line as their own
// padded pieces, the base sits between them on splayed, tapered legs, the
// seat cushions have a crowned top and a rounded front, the back cushions
// recline against a full-width back, a welt of piping runs round every
// cushion — the detail that says "upholstered" at a glance, and at rest it
// draws the seams into the ghost sketch — and a throw pillow sits in the free
// corner. It used to be built with one corner radius on every part, which is
// what made it read as inflated blocks: here it is tight on the frame and
// soft on everything you would sit on.
const COUCH_SEAT: { w: number; h: number; d: number; r: number; o: Soft } = { w: 0.369, h: 0.066, d: 0.4, r: 0.026, o: { crown: 0.007, bulge: 0.006, mid: 5 } };
const COUCH_BACK: { w: number; h: number; d: number; r: number; o: Soft } = { w: 0.366, h: 0.2, d: 0.085, r: 0.04, o: { crown: 0.004, bulge: 0.013, mid: 4 } };
function Couch() {
  const g = useGeometry(() => {
    const body: BufferGeometry[] = [];
    const welt: BufferGeometry[] = [];
    const wood: BufferGeometry[] = [];
    // base between the arms, and a full-width back the cushions lean on
    body.push(place(softBox(0.75, 0.06, 0.44, 0.012), [0, 0.105, 0]));
    body.push(place(softBox(0.92, 0.255, 0.07, 0.02, { crown: 0.004 }), [0, 0.2025, -0.185]));
    // padded arms from the base line up, a touch wider at the top
    for (const sx of [-1, 1]) body.push(place(softBox(0.085, 0.187, 0.44, 0.03, { crown: 0.006, taper: 1.04, bulge: 0.004, mid: 3 }), [sx * 0.4175, 0.1685, 0]));
    // seat cushions: flat top at 0.197, crowned ~6 mm where the phone lies
    const S = COUCH_SEAT;
    for (const sx of [-1, 1]) {
      const at: [number, number, number] = [sx * 0.1885, 0.164, 0.02];
      body.push(place(softBox(S.w, S.h, S.d, S.r, S.o), at));
      welt.push(place(tube(softSeam(S.w, S.h, S.d, S.r, S.o, 'top'), 0.003, 5, 72, true), at));
    }
    // back cushions, reclined against the back, each set a hair differently
    const B = COUCH_BACK;
    for (const [sx, yaw] of [[-1, 0.025], [1, -0.018]] as const) {
      const at: [number, number, number] = [sx * 0.1875, 0.294, -0.1];
      const rot: [number, number, number] = [-0.19, yaw, 0];
      body.push(place(softBox(B.w, B.h, B.d, B.r, B.o), at, rot));
      welt.push(place(tube(softSeam(B.w, B.h, B.d, B.r, B.o, 'front'), 0.003, 5, 72, true), at, rot));
    }
    // a throw pillow in the free corner, away from the phone
    wood.push(place(softBox(0.15, 0.15, 0.045, 0.03, { crown: 0.01, bulge: 0.014, bulgeBack: 0.014, mid: 4 }), [-0.305, 0.268, -0.055], [-0.42, 0.42, 0.1]));
    // splayed, tapered legs with a ferrule at the foot
    const leg = [[0, -0.08], [0.0095, -0.08], [0.0095, -0.069], [0.0086, -0.068], [0.0155, 0], [0, 0]] as [number, number][];
    for (const [lx, lz] of [[-0.4, 0.17], [0.4, 0.17], [-0.4, -0.17], [0.4, -0.17]]) {
      wood.push(place(lathe(leg, 12), [lx, 0.078, lz], [Math.sign(lz) * 0.12, 0, -Math.sign(lx) * 0.12]));
    }
    return { body: merge(body), welt: merge(welt), wood: merge(wood) };
  });
  return (
    <group>
      <mesh geometry={g.body}>
        <LiveGlassMat slug="popcore-games" ghost={false} opacity={0.2} />
      </mesh>
      <mesh geometry={g.welt}>
        <LiveGlassMat slug="popcore-games" ghost={false} tint="pale" />
      </mesh>
      <mesh geometry={g.wood}>
        <LiveGlassMat slug="popcore-games" ghost={false} tint="deep" opacity={0.26} />
      </mesh>
    </group>
  );
}

export function RoomRig() {
  const { accent } = useAccent();
  const brigade = useLitLink('virtuele-brigade'); // the coffee's light (lit.tsx)
  // DEV-only position scrubbers; tree-shaken from production builds (see devTweak).
  const desk = useTweak('Room.Desk', { position: [-1.2, 0, 0.18], rotationY: 1.76 });
  const couch = useTweak('Room.Couch', { position: [0.12, 0, -0.22], rotationY: -0.16 });
  const table = useTweak('Room.AR table', { position: [0, 0, 0.52] });
  const shelf = useTweak('Room.Bookcase', { position: [1, 0, -1.06], rotationY: -0.27 });
  const plant = useTweak('Room.Plant', { position: [-1.23, 0, 0.9] });
  const lamp = useTweak('Room.Floor lamp', { position: [-0.32, 0, -1.57] });
  return (
    <group>
      {/* round rug centred on the scene — lined up with the chip die below it.
          GROUND, not SURFACE: it's a marking on the sheet, the same substance
          as the city's roads one layer up, so the two floors match. */}
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[1.05, 1.05, 0.02, 56]} />
        <GroundMat />
        {/* the hover light's shadows, printed on the rug (lit.tsx) */}
        <ShadowPrint />
      </mesh>
      <Line points={circlePts(1.05)} position={[0, 0.024, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.2} />
      <Line points={circlePts(0.78)} position={[0, 0.026, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.1} />

      {/* workstation (desk + monitor + chair) — front-left by the plant, angled
          toward the centre; the monitor flickers on hover. Engaging the monitor
          solidifies the desk, chair + plant with it (the life spreads). */}
      <group position={desk.position} rotation={[0, desk.rotationY, 0]}>
        <BlobShadow position={[0, 0.004, -0.16]} radius={0.6} aspect={0.72} opacity={0.38} />
        <group position={[0, 0, -0.3]}>
          <Desk brigade={brigade} />
        </group>
        {/* the chair in front of the desk, facing the monitor */}
        <group position={[0, 0, 0.05]} rotation={[0, Math.PI, 0]}>
          <OfficeChair />
        </group>
      </group>

      {/* bookcase (back-right) — engaging the Zwijsen book lights its spine +
          lifts the open book out of its gap */}
      <Bookcase position={shelf.position} rotation={[0, shelf.rotationY, 0]} />

      {/* couch + phone — faces the coffee table / room front (+z). Opening the
          phone solidifies the couch it sits on. */}
      <group position={couch.position} rotation={[0, couch.rotationY, 0]}>
        <BlobShadow position={[0, 0.004, -0.02]} radius={0.6} aspect={0.58} opacity={0.4} />

        <Couch />

        {/* The phone. This is what the couch is here FOR — the popcore hotspot
            anchors to it, and a couch with nothing on it gives the marker
            nothing to point at. It lands on the right-hand cushion, whose top
            is at about 0.203 there, crown included. */}
        <LifeGroup slug="popcore-games">
          <Phone slug="popcore-games" position={[0.12, 0.205, 0.06]} args={[0.075, 0.155, 0.004]} liveColor={accent} />
        </LifeGroup>
      </group>

      {/* coffee table with AR racing (Lightship Drive), directly in front of the couch */}
      <LifeGroup slug="lightship-drive">
        <CoffeeTableAR position={table.position} hoverSlug="lightship-drive" />
      </LifeGroup>

      {/* fill the diorama out, balanced around the centre; the plant belongs to
          the workstation corner, so it wakes with the monitor */}
      <PottedPlant position={plant.position} liveSlug="virtuele-brigade" />
      <FloorLamp position={lamp.position} />
    </group>
  );
}

