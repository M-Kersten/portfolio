// The ROOM layer (middle) — games, apps & the web. The desk with the monitor
// (Virtuele Brigade), the couch with the phone (Popcore), the AR race table
// (Lightship Drive) and the bookcase with the openable Zwijsen book, plus
// lamp, plant and VR headset props. RoomRig composes and places everything.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, RoundedBox } from '@react-three/drei';
import { Color, DoubleSide, ExtrudeGeometry, MeshStandardMaterial, Vector3, type Group, type Mesh, type Texture } from 'three';
import { useTweak } from '../devTweak';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { NEUTRAL, useAccent, circlePts, smoothCurve, roundedRectShape, roundedPlaneGeometry, Line, useActive, bounceObject, useOptionalTexture, type V3 } from './shared';
import { GHOST_FILL, LifeGroup } from './life';
import { GlassMat, LiveGlassMat, Accent, SoftBox } from './materials';
import { BlobShadow } from './backdrop';

const PHONE_BALLS = 6;
const COUCH_SEAT_Y = 0.2; // top of the couch cushion, in couch-local space
function Phone({ slug, position, args, liveColor }: { slug: string; position: V3; args: V3; liveColor: string }) {
  const { accent } = useAccent();
  const { hovered, selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const rigRef = useRef<Group>(null);
  const mat = useRef<MeshStandardMaterial>(null);
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
  const screenGeo = useMemo(() => roundedPlaneGeometry(args[0] * 0.84, args[1] * 0.9, Math.min(args[0], args[1]) * 0.16), [args]);
  useEffect(() => {
    return () => {
      bodyGeo.dispose();
      screenGeo.dispose();
    };
  }, [bodyGeo, screenGeo]);

  useFrame((s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const t = s.clock.elapsedTime;

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
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.28} roughness={0.4} toneMapped={false} />
        </mesh>
        {/* screen face — a ghost glow until opened, then the screenshot. Sits
            clear of the body's bevelled front cap (extrude depth d/2 + bevel
            d·0.4 = d·0.9) or the opaque body would bury it. */}
        <mesh geometry={screenGeo} position={[0, 0, args[2] * 0.9 + 0.0006]}>
          <meshStandardMaterial ref={mat} userData={{ lifeSkip: true }} color={accent} emissive={accent} emissiveIntensity={0.5} roughness={0.4} toneMapped={true} side={DoubleSide} />
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
          <meshStandardMaterial color="#fffdf5" emissive="#fff0d0" emissiveIntensity={0.2} roughness={0.55} toneMapped={false} />
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
  const meshRef = useRef<Mesh>(null);
  const k = useRef(0);
  const shown = useRef(false);
  const tex = useOptionalTexture('/textures/room-screen.jpg');
  const live = useRef(0);
  const accentC = useMemo(() => new Color(accent), [accent]);
  useFrame((s, delta) => {
    if (meshRef.current) bounceObject(meshRef.current, selected, reduced, delta);
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
    <mesh ref={meshRef} position={position} rotation={rotation}>
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
function RaceCar({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.007, -0.002]}>
        <boxGeometry args={[0.03, 0.012, 0.06]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.4} metalness={0.1} toneMapped={false} />
      </mesh>
      {/* nose */}
      <mesh position={[0, 0.005, 0.032]}>
        <boxGeometry args={[0.024, 0.008, 0.018]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.4} toneMapped={false} />
      </mesh>
      {/* cabin / windscreen */}
      <mesh position={[0, 0.017, -0.004]}>
        <boxGeometry args={[0.022, 0.012, 0.026]} />
        <meshStandardMaterial color="#0b1418" emissive={color} emissiveIntensity={0.12} roughness={0.25} toneMapped={false} />
      </mesh>
      {/* rear wing */}
      <mesh position={[0, 0.016, -0.03]}>
        <boxGeometry args={[0.032, 0.002, 0.008]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} roughness={0.4} toneMapped={false} />
      </mesh>
      {/* wheels */}
      {([[-0.018, 0.022], [0.018, 0.022], [-0.018, -0.022], [0.018, -0.022]] as [number, number][]).map(([wx, wz], i) => (
        <mesh key={i} position={[wx, 0.002, wz]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.008, 0.008, 0.006, 12]} />
          <meshStandardMaterial color="#161f27" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

// A fading comet-tail behind a car — a string of beads on the race circle,
// brightest at the car and dying out behind it. Only lit while the table is
// alive (selected/visited) and moving, so a dormant or reduced-motion table
// shows no streaks. Lives inside the rotating ring, so it trails its car.
const TRAIL_R = 0.2;
function CarTrail({ angle, color }: { angle: number; color: string }) {
  const reduced = useReducedMotion();
  const { selected, visited } = useActive('lightship-drive');
  const glow = useRef(0);
  const mats = useRef<(MeshStandardMaterial | null)[]>([]);
  const beads = useMemo(() => {
    const N = 7;
    return Array.from({ length: N }, (_, i) => {
      const a = angle - (i + 1) * 0.14; // step back along the circle, behind the car
      return { p: [TRAIL_R * Math.cos(a), 0, TRAIL_R * Math.sin(a)] as V3, f: 1 - i / N, r: 0.007 * (1 - i * 0.09) };
    });
  }, [angle]);
  useFrame(() => {
    glow.current += (((selected || visited) && !reduced ? 1 : 0) - glow.current) * 0.06;
    for (let i = 0; i < beads.length; i++) {
      const m = mats.current[i];
      if (!m) continue;
      m.emissiveIntensity = beads[i].f * 1.7 * glow.current;
      m.opacity = 0.85 * beads[i].f * glow.current;
    }
  });
  return (
    <group>
      {beads.map((b, i) => (
        <mesh key={i} position={b.p}>
          <sphereGeometry args={[b.r, 8, 8]} />
          <meshStandardMaterial ref={(r) => (mats.current[i] = r)} color={color} emissive={color} emissiveIntensity={0} transparent opacity={0} toneMapped={false} depthWrite={false} userData={{ lifeSkip: true }} />
        </mesh>
      ))}
    </group>
  );
}

/** Coffee table with an AR race loop and two cars (Lightship Drive). The cars
 *  ride a circle, simply rotating around the table's centre pivot, each trailing
 *  a light-streak while the table is alive. */
function CoffeeTableAR({ position, hoverSlug }: { position: V3; hoverSlug?: string }) {
  const { accent } = useAccent();
  const { hovered, selected, visited } = useActive(hoverSlug ?? '');
  const reduced = useReducedMotion();
  const ring = useRef<Group>(null);
  const popRef = useRef<Group>(null);
  const speed = useRef(0.1);
  const R = 0.2; // track radius
  useFrame((_s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta);
    // ghost table: the cars barely creep; the race only runs once it's alive
    const sT = selected || visited ? 1 : hovered ? 0.45 : 0.1;
    speed.current += (sT - speed.current) * 0.05;
    if (ring.current && !reduced) ring.current.rotation.y += Math.min(delta, 1 / 30) * speed.current;
  });
  return (
    <group position={position}>
      <BlobShadow position={[0, 0.004, 0]} radius={0.42} opacity={0.4} />
      <group ref={popRef}>
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.32, 0.32, 0.03, 40]} />
          <LiveGlassMat slug="lightship-drive" opacity={0.2} />
          <Edges threshold={30} color={NEUTRAL} />
        </mesh>
        {([[0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]] as [number, number][]).map(([lx, lz], i) => (
          <mesh key={i} position={[lx, 0.09, lz]}>
            <cylinderGeometry args={[0.016, 0.016, 0.18, 10]} />
            <LiveGlassMat slug="lightship-drive" opacity={0.24} />
          </mesh>
        ))}
        {/* the AR race loop — a circle */}
        <Line points={circlePts(R)} position={[0, 0.2, 0]} color={accent} lineWidth={1.5} transparent opacity={0.7} />
        {/* two cars circling the centre pivot, facing their direction of travel —
            one wears the room's coral, its rival the neutral white-blue */}
        <group ref={ring} position={[0, 0.202, 0]}>
          <group position={[R, 0, 0]} rotation={[0, Math.PI, 0]}>
            <RaceCar color="#ff9068" />
          </group>
          <group position={[-R, 0, 0]}>
            <RaceCar color="#9fb6c6" />
          </group>
          <CarTrail angle={0} color="#ff9068" />
          <CarTrail angle={Math.PI} color="#9fb6c6" />
        </group>
      </group>
    </group>
  );
}

/** A VR headset prop on a stand (Virtuele Brigade). */
function VRHeadset({ position, rotation }: { position: V3; rotation?: V3 }) {
  const strap = useMemo(() => smoothCurve([[-0.075, 0, 0], [-0.05, 0.06, -0.055], [0.05, 0.06, -0.055], [0.075, 0, 0]], 24), []);
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[0.16, 0.09, 0.1]} radius={0.03} smoothness={3}>
        <GlassMat opacity={0.3} />
      </RoundedBox>
      <Accent position={[0, 0, 0.052]} args={[0.11, 0.05, 0.004]} intensity={0.3} color={NEUTRAL} />
      <Line points={strap} color={NEUTRAL} lineWidth={1.2} transparent opacity={0.5} />
    </group>
  );
}

/** A floor lamp with a glowing shade. */
// The lamp's bulb, softly lit and gently breathing — a light someone left on.
// A single warm point in the cool room (a domestic cue, not a project waking);
// steady under reduced motion.
function LampGlow() {
  const reduced = useReducedMotion();
  const mat = useRef<MeshStandardMaterial>(null);
  useFrame((s) => {
    if (!mat.current) return;
    const breathe = reduced ? 1 : 0.86 + 0.14 * Math.sin(s.clock.elapsedTime * 0.8);
    mat.current.emissiveIntensity = 0.55 * breathe;
  });
  return (
    <mesh position={[0, 0.64, 0]}>
      <sphereGeometry args={[0.045, 12, 12]} />
      <meshStandardMaterial ref={mat} color="#ffb488" emissive="#ffb488" emissiveIntensity={0.55} transparent opacity={0.5} roughness={0.5} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

function FloorLamp({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <BlobShadow position={[0, 0.003, 0]} radius={0.2} opacity={0.34} />
      <mesh position={[0, 0.006, 0]}>
        <cylinderGeometry args={[0.12, 0.13, 0.012, 24]} />
        <GlassMat opacity={0.22} />
      </mesh>
      <mesh position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.66, 8]} />
        <GlassMat opacity={0.3} />
      </mesh>
      <mesh position={[0, 0.72, 0]}>
        <coneGeometry args={[0.14, 0.18, 22, 1, true]} />
        <GlassMat opacity={0.2} />
        <Edges threshold={30} color={NEUTRAL} />
      </mesh>
      <Accent position={[0, 0.66, 0]} args={[0.07, 0.02, 0.07]} intensity={0.5} color={NEUTRAL} />
      <LampGlow />
    </group>
  );
}

/** A leafy potted houseplant — upright arching blades fanning out of a pot.
 *  With a `liveSlug` it solidifies alongside that hotspot (the workstation). */
function PottedPlant({ position, liveSlug }: { position: V3; liveSlug?: string }) {
  const blades = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        a: (i / 9) * Math.PI * 2 + (i % 2) * 0.4,
        tilt: 0.13 + (i % 3) * 0.08,
        len: 0.34 + ((i * 7) % 3) * 0.07,
      })),
    [],
  );
  return (
    <group position={position}>
      <BlobShadow position={[0, 0.003, 0]} radius={0.2} opacity={0.34} />
      {/* pot — kept to the scene's neutral glass, no terracotta */}
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.13, 0.1, 0.16, 22]} />
        {liveSlug ? <LiveGlassMat slug={liveSlug} ghost={false} opacity={0.4} /> : <GlassMat opacity={0.4} />}
        <Edges threshold={24} color={NEUTRAL} />
      </mesh>
      {/* soil, as understated glass rather than dark earth */}
      <mesh position={[0, 0.165, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.012, 20]} />
        {liveSlug ? <LiveGlassMat slug={liveSlug} ghost={false} opacity={0.3} /> : <GlassMat opacity={0.3} />}
      </mesh>
      {/* leaf blades — same neutral glass, no green, barely there at rest */}
      {blades.map((b, i) => (
        <group key={i} position={[0, 0.17, 0]} rotation={[0, b.a, 0]}>
          <group rotation={[b.tilt, 0, 0]}>
            <mesh position={[0, b.len / 2, 0]} scale={[1, 1, 0.18]}>
              <coneGeometry args={[0.045, b.len, 5]} />
              {liveSlug ? <LiveGlassMat slug={liveSlug} ghost={false} opacity={0.14} solid={0.5} /> : <GlassMat opacity={0.14} />}
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

// Books on the shelves (local to the bookcase group), standing spine-out with
// real depth, varied size + muted colour; a couple lean. Each shelf packed.
const BOOKS: { p: V3; s: V3; c: string; r?: V3 }[] = [
  // top shelf (y ≈ 0.78)
  { p: [-0.30, 0.78, 0.02], s: [0.05, 0.17, 0.18], c: '#2f4a6b' },
  { p: [-0.245, 0.785, 0.02], s: [0.045, 0.18, 0.18], c: '#3a608a' },
  { p: [-0.19, 0.778, 0.02], s: [0.052, 0.165, 0.18], c: '#4f74a6' },
  { p: [-0.12, 0.79, 0.02], s: [0.06, 0.19, 0.18], c: '#26405f' },
  { p: [-0.05, 0.775, 0.02], s: [0.046, 0.16, 0.18], c: '#5b7cab' },
  { p: [0.02, 0.783, 0.02], s: [0.05, 0.175, 0.18], c: '#6f8cb6' },
  { p: [0.10, 0.78, 0.02], s: [0.055, 0.17, 0.18], c: '#2f4a6b' },
  { p: [0.185, 0.787, 0.02], s: [0.05, 0.185, 0.18], c: '#3a608a' },
  { p: [0.258, 0.742, 0.02], s: [0.05, 0.16, 0.18], c: '#4f74a6', r: [0, 0, 0.17] }, // leaning
  // middle shelf (y ≈ 0.52) — gap at x ≈ 0.12 for the open Zwijsen book
  { p: [-0.30, 0.52, 0.02], s: [0.05, 0.17, 0.18], c: '#5b7cab' },
  { p: [-0.245, 0.515, 0.02], s: [0.048, 0.16, 0.18], c: '#26405f' },
  { p: [-0.185, 0.523, 0.02], s: [0.055, 0.18, 0.18], c: '#3a608a' },
  { p: [-0.11, 0.52, 0.02], s: [0.05, 0.17, 0.18], c: '#6f8cb6' },
  { p: [-0.04, 0.518, 0.02], s: [0.052, 0.165, 0.18], c: '#2f4a6b' },
  { p: [0.26, 0.52, 0.02], s: [0.05, 0.17, 0.18], c: '#5b7cab' },
  { p: [0.214, 0.5, 0.02], s: [0.05, 0.15, 0.18], c: '#26405f', r: [0, 0, -0.15] }, // leaning into the gap
  // bottom shelf (y ≈ 0.26) — books, then a horizontal stack fills the right
  { p: [-0.30, 0.26, 0.02], s: [0.052, 0.17, 0.18], c: '#3a608a' },
  { p: [-0.24, 0.265, 0.02], s: [0.05, 0.18, 0.18], c: '#4f74a6' },
  { p: [-0.18, 0.258, 0.02], s: [0.055, 0.165, 0.18], c: '#2f4a6b' },
  { p: [-0.11, 0.262, 0.02], s: [0.048, 0.175, 0.18], c: '#26405f' },
  { p: [-0.04, 0.26, 0.02], s: [0.05, 0.17, 0.18], c: '#5b7cab' },
  { p: [0.03, 0.255, 0.02], s: [0.052, 0.16, 0.18], c: '#6f8cb6' },
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
function BookHalf({ side, tex }: { side: -1 | 1; tex: Texture | null }) {
  const x = (side * BOOK_W) / 4;
  return (
    <>
      {/* cover board */}
      <mesh position={[x, 0, 0]}>
        <boxGeometry args={[BOOK_W / 2, BOOK_T, BOOK_H]} />
        <meshStandardMaterial color="#ff7a3d" emissive="#ff7a3d" emissiveIntensity={0.16} roughness={0.5} />
      </mesh>
      {/* page block */}
      <mesh position={[x, BOOK_T / 2 + BOOK_PT / 2, 0]}>
        <boxGeometry args={[BOOK_W / 2 - 0.012, BOOK_PT, BOOK_H - 0.014]} />
        <meshStandardMaterial color="#efe6d0" emissive="#efe6d0" emissiveIntensity={0.1} roughness={0.85} />
      </mesh>
      {/* the printed page on top of the block */}
      <mesh position={[x, BOOK_T / 2 + BOOK_PT + 0.0008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BOOK_W / 2 - 0.016, BOOK_H - 0.02]} />
        {tex ? (
          <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.5} roughness={0.75} toneMapped={false} side={DoubleSide} />
        ) : (
          <meshStandardMaterial color="#f3ead4" emissive="#f3ead4" emissiveIntensity={0.14} roughness={0.85} side={DoubleSide} />
        )}
      </mesh>
    </>
  );
}
function OpenBook({ slug, position }: { slug: string; position: V3 }) {
  const { selected } = useActive(slug);
  const reduced = useReducedMotion();
  const grp = useRef<Group>(null);
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
        <BookHalf side={1} tex={texR} />
      </group>
      {/* front half — folded over when closed, swings open on select */}
      <group ref={frontHinge}>
        <BookHalf side={-1} tex={texL} />
      </group>
      {/* spine */}
      <mesh position={[0, -0.001, 0]}>
        <boxGeometry args={[0.015, BOOK_T + 0.003, BOOK_H]} />
        <meshStandardMaterial color="#e06a30" emissive="#e06a30" emissiveIntensity={0.14} roughness={0.5} />
      </mesh>
    </group>
  );
}

/** A little mouse that lives behind the Zwijsen book. When the book is picked up
 *  it hops out of the gap it leaves, drops to the floor and then scurries a loop
 *  around the bookcase. Coords are bookcase-local; it lives outside the pop group
 *  so the bookcase's select-bounce doesn't squash it. */
const MOUSE_GROUND = 0.03; // belly on the floor, bookcase-local
function BookcaseMouse({ gap }: { gap: V3 }) {
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

  const GREY = '#8b929c';
  const PINK = '#b58794';
  return (
    <group ref={ref} visible={false}>
      <mesh scale={[0.024, 0.02, 0.034]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color={GREY} emissive="#3a3f47" emissiveIntensity={0.25} roughness={0.7} flatShading />
      </mesh>
      <mesh position={[0, 0.004, 0.03]} scale={[0.015, 0.014, 0.018]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#949aa4" emissive="#3a3f47" emissiveIntensity={0.25} roughness={0.7} flatShading />
      </mesh>
      {[-1, 1].map((sx, i) => (
        <mesh key={`ear${i}`} position={[sx * 0.011, 0.016, 0.026]}>
          <sphereGeometry args={[0.008, 10, 8]} />
          <meshStandardMaterial color={PINK} emissive="#3a3f47" emissiveIntensity={0.2} roughness={0.7} />
        </mesh>
      ))}
      {[-1, 1].map((sx, i) => (
        <mesh key={`eye${i}`} position={[sx * 0.007, 0.006, 0.042]}>
          <sphereGeometry args={[0.0035, 8, 8]} />
          <meshStandardMaterial color="#ffd7e0" emissive="#ff6a90" emissiveIntensity={1.2} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, 0.001, 0.05]}>
        <sphereGeometry args={[0.004, 8, 8]} />
        <meshStandardMaterial color="#d98aa0" emissive="#d98aa0" emissiveIntensity={0.5} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.007, -0.03]} rotation={[-0.5, 0, 0]}>
        <cylinderGeometry args={[0.0015, 0.003, 0.05, 6]} />
        <meshStandardMaterial color={PINK} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** The bookcase. Engaging the Zwijsen book "turns it on": the book spines glow,
 *  alongside the open spread lifting out to face the player. */
function Bookcase({ position }: { position: V3 }) {
  const { hovered, selected, visited } = useActive('zwijsen-ar-books');
  const bookMats = useRef<(MeshStandardMaterial | null)[]>([]);
  const lit = useRef(0);
  const reduced = useReducedMotion();
  const popRef = useRef<Group>(null);
  useFrame((_s, delta) => {
    if (popRef.current) bounceObject(popRef.current, selected, reduced, delta, 0.1);
    const t = hovered || selected ? 1 : visited ? 0.3 : 0;
    lit.current += (t - lit.current) * 0.1;
    const e = 0.1 + lit.current * 0.7;
    for (const m of bookMats.current) if (m) m.emissiveIntensity = e;
  });
  return (
    <group position={position}>
      <BlobShadow position={[0, 0.004, 0.04]} radius={0.52} aspect={0.55} opacity={0.4} />
      <group ref={popRef}>
      {/* case frame: back, sides, top, base — solidifies once the book is opened */}
      <SoftBox position={[0, 0.46, -0.09]} args={[0.74, 0.92, 0.06]} radius={0.02} liveSlug="zwijsen-ar-books" liveGhost={false} />
      <SoftBox position={[-0.355, 0.46, 0.04]} args={[0.03, 0.92, 0.26]} radius={0.01} liveSlug="zwijsen-ar-books" liveGhost={false} />
      <SoftBox position={[0.355, 0.46, 0.04]} args={[0.03, 0.92, 0.26]} radius={0.01} liveSlug="zwijsen-ar-books" liveGhost={false} />
      <SoftBox position={[0, 0.915, 0.04]} args={[0.74, 0.03, 0.26]} radius={0.01} liveSlug="zwijsen-ar-books" liveGhost={false} />
      <SoftBox position={[0, 0.02, 0.04]} args={[0.74, 0.04, 0.26]} radius={0.01} liveSlug="zwijsen-ar-books" liveGhost={false} />
      {/* shelves */}
      {[0.16, 0.42, 0.68].map((sy, s) => (
        <SoftBox key={s} position={[0, sy, 0.04]} args={[0.7, 0.02, 0.24]} radius={0.006} opacity={0.3} liveSlug="zwijsen-ar-books" liveGhost={false} />
      ))}
      {/* books — their spines glow when the bookcase is on */}
      {BOOKS.map((bk, i) => (
        <mesh key={i} position={bk.p} rotation={bk.r}>
          <boxGeometry args={bk.s} />
          <meshStandardMaterial ref={(m) => (bookMats.current[i] = m)} color={bk.c} emissive={bk.c} emissiveIntensity={0.1} roughness={0.6} />
        </mesh>
      ))}
      {/* a horizontal stack on the bottom-right shelf */}
      <group position={[0.19, 0.19, 0.02]}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.2, 0.03, 0.16]} />
          <meshStandardMaterial color="#26405f" emissive="#26405f" emissiveIntensity={0.12} roughness={0.6} />
        </mesh>
        <mesh position={[0.01, 0.032, 0.006]}>
          <boxGeometry args={[0.19, 0.028, 0.155]} />
          <meshStandardMaterial color="#3a608a" emissive="#3a608a" emissiveIntensity={0.12} roughness={0.6} />
        </mesh>
        <mesh position={[-0.008, 0.062, -0.004]}>
          <boxGeometry args={[0.18, 0.026, 0.15]} />
          <meshStandardMaterial color="#4f74a6" emissive="#4f74a6" emissiveIntensity={0.12} roughness={0.6} />
        </mesh>
      </group>
      {/* a little potted plant on top for detail — neutral glass, no green/brown */}
      <group position={[0.25, 0.93, 0.05]}>
        <mesh position={[0, 0.018, 0]}>
          <cylinderGeometry args={[0.03, 0.024, 0.04, 16]} />
          <GlassMat opacity={0.4} />
        </mesh>
        <mesh position={[0, 0.07, 0]}>
          <icosahedronGeometry args={[0.045, 0]} />
          <GlassMat opacity={0.16} />
        </mesh>
      </group>
      <LifeGroup slug="zwijsen-ar-books">
        <OpenBook slug="zwijsen-ar-books" position={[0.12, 0.52, 0.04]} />
      </LifeGroup>
      </group>
      {/* a mouse hiding behind the book — hops out of the gap and scurries around */}
      <BookcaseMouse gap={[0.12, 0.52, 0.04]} />
    </group>
  );
}

export function RoomRig() {
  // DEV-only position scrubbers; tree-shaken from production builds (see devTweak).
  const desk = useTweak('Room.Desk', { position: [-1.2, 0, 0.18], rotationY: 1.76 });
  const couch = useTweak('Room.Couch', { position: [0.12, 0, -0.22], rotationY: -0.16 });
  const table = useTweak('Room.AR table', { position: [0, 0, 0.52] });
  const shelf = useTweak('Room.Bookcase', { position: [0.9, 0, -0.82] });
  const plant = useTweak('Room.Plant', { position: [-1.23, 0, 0.9] });
  const lamp = useTweak('Room.Floor lamp', { position: [-0.32, 0, -1.57] });
  return (
    <group>
      {/* round rug centred on the scene — lined up with the chip die below it;
          kept very sheer so it reads as a floor marking, not a bright disc */}
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[1.05, 1.05, 0.02, 56]} />
        <GlassMat opacity={0.06} />
      </mesh>
      <Line points={circlePts(1.05)} position={[0, 0.024, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.2} />
      <Line points={circlePts(0.78)} position={[0, 0.026, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.1} />

      {/* workstation (desk + monitor + chair) — front-left by the plant, angled
          toward the centre; the monitor flickers on hover. Engaging the monitor
          solidifies the desk, chair + plant with it (the life spreads). */}
      <group position={desk.position} rotation={[0, desk.rotationY, 0]}>
        <BlobShadow position={[0, 0.004, -0.16]} radius={0.6} aspect={0.72} opacity={0.38} />
        <group position={[0, 0, -0.3]}>
          <SoftBox position={[0, 0.37, 0]} args={[0.95, 0.05, 0.45]} radius={0.03} outline liveSlug="virtuele-brigade" liveGhost={false} />
          {([[-0.42, -0.18], [0.42, -0.18], [-0.42, 0.18], [0.42, 0.18]] as [number, number][]).map(([lx, lz], i) => (
            <mesh key={i} position={[lx, 0.18, lz]}>
              <cylinderGeometry args={[0.02, 0.02, 0.36, 12]} />
              <LiveGlassMat slug="virtuele-brigade" ghost={false} opacity={0.26} />
            </mesh>
          ))}
          <LifeGroup slug="virtuele-brigade">
            <mesh position={[0, 0.45, -0.05]}>
              <cylinderGeometry args={[0.016, 0.016, 0.14, 12]} />
              <GlassMat opacity={0.26} />
            </mesh>
            <SoftBox position={[0, 0.62, -0.14]} args={[0.54, 0.34, 0.03]} radius={0.02} liveSlug="virtuele-brigade" />
            <RoomScreen slug="virtuele-brigade" position={[0, 0.62, -0.122]} args={[0.48, 0.28, 0.008]} />
          </LifeGroup>
          <SoftBox position={[0, 0.39, 0.12]} args={[0.34, 0.02, 0.12]} radius={0.012} opacity={0.26} />
          {/* desk clutter: a mug + papers */}
          <mesh position={[-0.36, 0.42, 0.12]}>
            <cylinderGeometry args={[0.03, 0.03, 0.06, 14]} />
            <GlassMat opacity={0.34} />
            <Edges threshold={30} color={NEUTRAL} />
          </mesh>
          <SoftBox position={[-0.05, 0.405, 0.14]} args={[0.13, 0.012, 0.17]} radius={0.004} opacity={0.3} />
          <VRHeadset position={[0.34, 0.44, 0.06]} rotation={[0, -0.6, 0]} />
        </group>
        {/* chair in front of the desk, facing the monitor */}
        <group position={[0, 0, 0.05]} rotation={[0, Math.PI, 0]}>
          <SoftBox position={[0, 0.24, 0]} args={[0.3, 0.06, 0.3]} radius={0.05} liveSlug="virtuele-brigade" liveGhost={false} />
          <SoftBox position={[0, 0.42, -0.14]} args={[0.3, 0.32, 0.05]} radius={0.05} liveSlug="virtuele-brigade" liveGhost={false} />
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.022, 0.022, 0.24, 12]} />
            <LiveGlassMat slug="virtuele-brigade" ghost={false} opacity={0.26} />
          </mesh>
        </group>
      </group>

      {/* bookcase (back-right) — engaging the Zwijsen book lights its spine +
          lifts the open book out of its gap */}
      <Bookcase position={shelf.position} />

      {/* couch + phone — faces the coffee table / room front (+z). Opening the
          phone solidifies the couch it sits on. */}
      <group position={couch.position} rotation={[0, couch.rotationY, 0]}>
        <BlobShadow position={[0, 0.004, -0.02]} radius={0.6} aspect={0.58} opacity={0.4} />
        <SoftBox position={[0, 0.12, 0]} args={[0.92, 0.16, 0.44]} radius={0.07} outline liveSlug="popcore-games" liveGhost={false} />
        <SoftBox position={[0, 0.3, -0.2]} args={[0.92, 0.28, 0.09]} radius={0.06} liveSlug="popcore-games" liveGhost={false} />
        <SoftBox position={[-0.46, 0.22, 0]} args={[0.09, 0.24, 0.44]} radius={0.045} liveSlug="popcore-games" liveGhost={false} />
        <SoftBox position={[0.46, 0.22, 0]} args={[0.09, 0.24, 0.44]} radius={0.045} liveSlug="popcore-games" liveGhost={false} />
        <SoftBox position={[-0.24, 0.22, 0.02]} args={[0.3, 0.12, 0.32]} radius={0.06} opacity={0.22} liveSlug="popcore-games" liveGhost={false} />
        <LifeGroup slug="popcore-games">
          <Phone slug="popcore-games" position={[0.12, 0.205, 0.06]} args={[0.075, 0.155, 0.004]} liveColor="#ff7a3d" />
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

