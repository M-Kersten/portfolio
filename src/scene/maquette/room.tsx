// The ROOM layer (middle) — games, apps & the web. The desk with the monitor
// (Virtuele Brigade) and its keyboard / mouse / coffee cup, the couch with the
// phone (Popcore), the AR race table (Lightship Drive) and the bookcase with the
// openable Zwijsen book, plus lamp and plant props. RoomRig composes and places
// everything.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, DoubleSide, Euler, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Ray, RepeatWrapping, RingGeometry, SRGBColorSpace, Vector3, type Group, type Mesh, type Texture } from 'three';
import { usePlacement } from '../../dev/tuning';
import { useReducedMotion } from '../../lib/media';
import { spring, wobble } from '../../lib/spring';
import { easeOut, ring } from '../../lib/ease';
import { cursorAtDepth, cursorIdle, cursorRay, useCloseUp } from './closeup';
import { GOLD, PALETTE, SURFACE, NEUTRAL, useAccent, type Tint, circlePts, roundedRectPts, roundedPlaneGeometry, Line, useActive, useOptionalTexture, FX, fxEnv, type V3 } from './shared';
import { GHOST_FILL, LifeGroup } from './life';
import { Crease, GlassMat, GroundMat, LiveEdges, LiveGlassMat, glowTexture } from './materials';
import { useBooksKit, useCarKit, useHeadsetKit, useMonitorKit, usePhoneKit, useTableKit, type BooksKit } from './kit';
import { BlobShadow } from './backdrop';
import { litMat, ShadowPrint, useLitBody, useLitLink, type LitLink } from './lit';
import { hang, lathe, leaf, merge, place, softBox, softSeam, tube, useGeometry, type Soft } from './shapes';

const PHONE_BALLS = 6;
const COUCH_SEAT_Y = 0.2; // top of the couch cushion, in couch-local space
// the handset's size (build_phone.py: W, H, T); the screen is drawn here, off W and H
const PHONE_W = 0.075;
const PHONE_H = 0.155;
const PHONE_T = 0.0075;
/* The balls, once out, lie about the cushions: in the close-up, hover over one
   and it pops up into the air, lands with a bounce or two and rolls to a stop,
   off the cushions' edges and off each other. A tiny game, Popcore's trade. */
const SEAT = { x: [-0.35, 0.35], z: [-0.08, 0.2] }; // where a ball can roll, couch frame
const POP = 0.7; // the pop's upward speed (m/s): a hop of ~9 cm under the cushion's gravity
const POP_DRIFT = 0.07; // and a little sideways, at random, so it lands somewhere new
const POP_REACH = 1.8; // how near the cursor's ray has to pass a ball, in ball radii
const POP_REST = 0.25; // s on the cushion before the same ball pops again
const POP_CHARGE = 0.09; // s it sinks into the cushion, gathering itself, before it goes
const POP_COMBO = { window: 0.9, step: 0.2, max: 4 }; // pops this close together go higher, a step each
const ROLL_DRAG = 2.2; // the cushion's friction (1/s)
// shared scratch for the instanced rings, flat on the surface they spread over
const _m4 = new Matrix4();
const _q4 = new Quaternion();
const _v3 = new Vector3();
const _c3 = new Color();
const FLAT = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
const RINGS = 6;
/** The phone on the couch (Popcore), a Blender model (build_phone.py). It lies
 *  face down, the way a phone is left on a cushion, so what you see from across
 *  the room is its back, and the camera island on it is what says "phone". It
 *  buzzes on hover, and the screen it's lying on lights the cushion round its
 *  edges. On *select* it lifts off the cushion and turns over to face you, and
 *  the first time you open it a handful of ping-pong balls pop out and settle on
 *  the seat. The screen shows a screenshot once you've visited it — drop a JPG at
 *  public/textures/room-phone.jpg; until then it stays a plain glowing screen. */
function Phone({ slug, position, liveColor }: { slug: string; position: V3; liveColor: string }) {
  const { accent } = useAccent();
  const { hovered, selected, visited } = useActive(slug);
  const reduced = useReducedMotion();
  const close = useCloseUp(slug);
  const frame = useRef<Group>(null); // the couch's frame, to find the cursor in
  const ray = useMemo(() => new Ray(), []);
  const kit = usePhoneKit();
  const rigRef = useRef<Group>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const spill = useRef<MeshBasicMaterial>(null);
  // lit on hover (lit.tsx): the handset, not its screen
  const lit = useLitLink(slug);
  const body = useLitBody(rigRef);
  const k = useRef(0); // emissive hover/select level
  const glow = useRef(0); // 0 → 1 shift toward the lifelike colour
  const turn = useRef(0); // 0 = lying face down, 1 = lifted + facing the user
  const buzz = useRef(0); // hover buzz envelope
  const base = useMemo(() => new Color(accent), [accent]);
  const lifelike = useMemo(() => new Color(liveColor), [liveColor]);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;

  // Ping-pong balls — each carries its own little bit of physics, fired once on
  // the first open. Held as plain objects (mutated in useFrame, not React state).
  const balls = useMemo(
    () => Array.from({ length: PHONE_BALLS }, () => ({ mesh: null as Group | null, body: null as Mesh | null, vel: new Vector3(), delay: 0, rest: 0, charge: -1, landAt: -99, impact: 0 })),
    [],
  );
  const R = 0.015; // ball radius
  const fired = useRef(false);
  const combo = useRef({ n: 0, at: -99 });
  // a ring on the cushion where a ball takes off
  const ringsIM = useRef<InstancedMesh>(null);
  const rings = useMemo(() => Array.from({ length: RINGS }, () => ({ pos: new Vector3(), at: -99 })), []);
  const ringN = useRef(0);
  const ringGeo = useGeometry(() => new RingGeometry(0.72, 1, 32));
  const ringMat = useMemo(() => {
    const m = new MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    m.userData.lifeSkip = true;
    return m;
  }, []);
  useEffect(() => () => ringMat.dispose(), [ringMat]);
  const shown = useRef(false); // whether the screenshot is currently mapped on
  const tex = useOptionalTexture('/textures/room-phone.jpg');
  const spillTex = useMemo(glowTexture, []);

  // The screen: glass close to the edge the way a current phone's is, its
  // corners following the body's own curve rather than cutting across it.
  const screenGeo = useGeometry(() => roundedPlaneGeometry(PHONE_W * 0.93, PHONE_H * 0.955, PHONE_W * 0.19));

  useFrame((s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const t = s.clock.elapsedTime;
    body(lit.litU.value, selected || visited);

    // --- lift and turn over toward the user on select; buzz on hover while resting ---
    const rig = rigRef.current;
    if (rig) {
      turn.current += ((selected ? 1 : 0) - turn.current) * 0.1;
      const tt = reduced ? (selected ? 1 : 0) : turn.current;
      // the lift leads and the turn follows (its square), so the phone is clear
      // of the cushion before its end swings down through where it was lying
      const tr = tt * tt;
      buzz.current += ((hovered || selected ? 1 : 0) - buzz.current) * 0.2;
      const a = reduced ? 0 : buzz.current * (1 - tt); // buzz fades as it stands up
      // turned a little toward the camera's side once up, so the screen faces the view
      const YAW_OFFSET = 0.38;
      rig.rotation.set(mix(Math.PI / 2, -0.15, tr), mix(0, YAW_OFFSET, tr) + Math.sin(t * 45) * 0.022 * a, mix(0.3, 0.0, tr));
      rig.position.set(position[0] + Math.sin(t * 50) * 0.005 * a, position[1] + tt * 0.14, position[2] + Math.cos(t * 58) * 0.005 * a);
      rig.scale.setScalar(mix(1, 1.35, tt));
      // the screen it's lying on, buzzing: light leaking out round its edges
      if (spill.current) spill.current.opacity = (reduced ? buzz.current : a) * (1 - tt) * (0.45 + 0.15 * Math.sin(t * 9));
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

    // --- the take-off rings, spreading over the cushion ---
    const rim = ringsIM.current;
    if (rim) {
      rings.forEach((r, j) => {
        const age = (t - r.at) / 0.4;
        const on = age >= 0 && age < 1;
        _v3.setScalar(on ? 0.012 + 0.04 * easeOut(age) : 0);
        rim.setMatrixAt(j, _m4.compose(r.pos, FLAT, _v3));
        rim.setColorAt(j, _c3.setScalar(on ? 0.9 * (1 - age) : 0));
      });
      rim.instanceMatrix.needsUpdate = true;
      if (rim.instanceColor) rim.instanceColor.needsUpdate = true;
    }

    // --- integrate the balls: launch, arc under gravity, bounce, then roll ---
    if (fired.current && !reduced) {
      const restY = COUCH_SEAT_Y + R;
      // the cursor over the couch, to pop a ball it passes over
      const pointing = close && !!frame.current && !!cursorRay(s, frame.current, ray);
      for (const b of balls) {
        if (!b.mesh) continue;
        if (b.delay > 0) {
          b.delay -= dt;
          continue;
        }
        b.mesh.visible = true;
        const p = b.mesh.position;
        const rolling = p.y <= restY + 1e-4 && b.vel.y === 0;
        if (rolling) {
          b.rest += dt;
          // hovered: it sinks into the cushion, gathering itself, then pops; one
          // popped soon after another goes higher, a step a time (POP_COMBO)
          if (b.charge < 0 && pointing && b.rest > POP_REST && ray.distanceSqToPoint(p) < (R * POP_REACH) ** 2) b.charge = t;
          if (b.charge >= 0 && t - b.charge >= POP_CHARGE) {
            const c = combo.current;
            c.n = t - c.at < POP_COMBO.window ? Math.min(POP_COMBO.max, c.n + 1) : 0;
            c.at = t;
            b.vel.set((Math.random() - 0.5) * 2 * POP_DRIFT, POP * (1 + POP_COMBO.step * c.n) * (0.9 + 0.2 * Math.random()), (Math.random() - 0.5) * 2 * POP_DRIFT);
            b.rest = 0;
            b.charge = -1;
            const r = rings[ringN.current++ % RINGS];
            r.pos.set(p.x, restY - R + 0.002, p.z);
            r.at = t;
          }
        }
        if (b.vel.y !== 0 || !rolling) b.vel.y -= 2.6 * dt; // gravity
        else {
          const drag = Math.exp(-dt * ROLL_DRAG);
          b.vel.x *= drag;
          b.vel.z *= drag;
        }
        p.addScaledVector(b.vel, dt);
        if (p.y <= restY && !rolling) {
          p.y = restY;
          b.landAt = t;
          b.impact = Math.min(1, Math.abs(b.vel.y) / 0.7);
          if (Math.abs(b.vel.y) < 0.14) b.vel.y = 0; // landed: it rolls from here
          else {
            b.vel.y = -b.vel.y * 0.5; // bounce
            b.vel.x *= 0.72;
            b.vel.z *= 0.72;
          }
        }
        // the cushions' edges, once it's down on them
        if (p.y <= restY + 0.02) {
          for (const [k, [lo, hi]] of [['x', SEAT.x], ['z', SEAT.z]] as const) {
            if (p[k] < lo || p[k] > hi) {
              p[k] = Math.min(hi, Math.max(lo, p[k]));
              b.vel[k] *= -0.5;
            }
          }
        }
        // its shape: squashed into the cushion as it gathers, stretched as it
        // flies, squashed as it lands and springing back round; its bottom stays
        // on the cushion while it's squashed
        let sy = 1;
        if (b.charge >= 0) sy = 1 - 0.38 * easeOut((t - b.charge) / POP_CHARGE);
        else if (p.y > restY + 1e-4) sy = 1 + Math.min(0.3, Math.abs(b.vel.y) * 0.45);
        else sy = 1 - 0.3 * b.impact * ring(t - b.landAt, 5, 10);
        const sxz = 1 / Math.sqrt(Math.max(0.4, sy));
        if (b.body) {
          b.body.scale.set(sxz, sy, sxz);
          b.body.position.y = p.y <= restY + 1e-4 ? -(1 - sy) * R : 0;
        }
      }
      // and each other: apart along the line between them, trading that speed
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i].mesh;
        if (!a?.visible) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const c = balls[j].mesh;
          if (!c?.visible) continue;
          const dx = c.position.x - a.position.x;
          const dz = c.position.z - a.position.z;
          const d = Math.hypot(dx, dz);
          if (d >= 2 * R || d < 1e-6 || Math.abs(c.position.y - a.position.y) > R) continue;
          const nx = dx / d;
          const nz = dz / d;
          const over = (2 * R - d) / 2;
          a.position.x -= nx * over;
          a.position.z -= nz * over;
          c.position.x += nx * over;
          c.position.z += nz * over;
          const va = balls[i].vel.x * nx + balls[i].vel.z * nz;
          const vc = balls[j].vel.x * nx + balls[j].vel.z * nz;
          if (va - vc > 0) {
            const swap = (va - vc) * 0.9;
            balls[i].vel.x -= nx * swap;
            balls[i].vel.z -= nz * swap;
            balls[j].vel.x += nx * swap;
            balls[j].vel.z += nz * swap;
          }
        }
      }
    }
  });

  return (
    <group ref={frame}>
      {/* the light the face-down screen leaks onto the cushion when it buzzes,
          lying under the phone at its resting turn */}
      <group position={[position[0], COUCH_SEAT_Y + 0.004, position[2]]} rotation={[0, -0.3, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <planeGeometry args={[PHONE_W * 2, PHONE_H * 1.5]} />
          <meshBasicMaterial ref={spill} userData={{ lifeSkip: true }} map={spillTex} color={accent} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      <group ref={rigRef} position={position} rotation={[Math.PI / 2, 0, 0.3]}>
        {kit && (
          <>
            {/* the body, in the project's colour; the life system greys it until opened */}
            <mesh geometry={kit.ph_body}>
              <meshStandardMaterial {...litMat(lit)} color={accent} emissive={accent} emissiveIntensity={0.28} roughness={0.4} toneMapped={false} />
            </mesh>
            {/* The keys and the camera island hold their own look, ghost or not
                (`lifeSkip`): face down, the island is the one detail that says
                what this is, so it can't fade with the rest. */}
            <mesh geometry={kit.ph_keys}>
              <meshStandardMaterial {...litMat(lit, { lifeSkip: true })} color={accent} emissive={accent} emissiveIntensity={0.16} roughness={0.3} metalness={0.25} toneMapped={false} />
            </mesh>
            <mesh geometry={kit.ph_island}>
              <meshStandardMaterial {...litMat(lit, { lifeSkip: true })} color={SURFACE.deep.color} roughness={0.3} metalness={0.3} toneMapped={false} />
            </mesh>
            <mesh geometry={kit.ph_lens}>
              <meshStandardMaterial {...litMat(lit, { lifeSkip: true })} color={SURFACE.pale.color} roughness={0.25} metalness={0.6} toneMapped={false} />
            </mesh>
            <mesh geometry={kit.ph_glass}>
              <meshStandardMaterial {...litMat(lit, { lifeSkip: true })} color="#05070c" emissive={accent} emissiveIntensity={0.08} roughness={0.08} metalness={0.4} toneMapped={false} />
            </mesh>
            <mesh geometry={kit.ph_flash}>
              <meshStandardMaterial {...litMat(lit, { lifeSkip: true })} color="#fff4dc" emissive="#fff4dc" emissiveIntensity={0.25} roughness={0.4} toneMapped={false} />
            </mesh>
          </>
        )}
        {/* screen face — a ghost glow until opened, then the screenshot. Just
            clear of the body's front face. */}
        <mesh geometry={screenGeo} position={[0, 0, PHONE_T / 2 + 0.0004]}>
          <meshStandardMaterial ref={mat} userData={{ lifeSkip: true }} color={accent} emissive={accent} emissiveIntensity={0.5} roughness={0.4} toneMapped={true} />
        </mesh>
      </group>
      {balls.map((b, i) => (
        <group
          key={i}
          ref={(g) => {
            b.mesh = g;
          }}
          position={position}
          visible={false}
        >
          <mesh
            ref={(m) => {
              b.body = m;
            }}
          >
            <sphereGeometry args={[R, 16, 12]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} roughness={0.45} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <instancedMesh ref={ringsIM} args={[ringGeo, ringMat, RINGS]} frustumCulled={false} />
    </group>
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

/* The Lightship Drive cars, after the game's own (scripts/models/build_car.py,
   loaded by kit.ts): a low, chunky wedge with a dark glass cabin, a neon stripe
   round its beltline running yellow at the nose through blue to magenta at the
   tail, and fat tyres with glowing rims. They point along their local +z. The
   colours are the game's: they show once the table has come alive, and until
   then the life system holds them to the ghost like the rest of the model. */
interface Livery {
  body: string;
  cabin: string;
  rim: string;
}
const STRIPE = ['#ff3ad0', '#3aa8ff', '#ffe23a'].map((c) => new Color(c)); // tail → nose

/** The stripe's gradient, written once into the shared geometry as vertex
 *  colours, by how far along the car each vertex sits. */
function paintStripe(g: BufferGeometry) {
  if (g.attributes.color) return;
  const pos = g.attributes.position;
  g.computeBoundingBox();
  const { min, max } = g.boundingBox!;
  const col = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getZ(i) - min.z) / Math.max(1e-6, max.z - min.z);
    const k = Math.min(0.999, t) * (STRIPE.length - 1);
    c.copy(STRIPE[Math.floor(k)]).lerp(STRIPE[Math.floor(k) + 1], k % 1);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
}

function RaceCar({ livery, boost }: { livery: Livery; boost?: { current: number } }) {
  const kit = useCarKit();
  const flash = useRef<Mesh>(null);
  // a boost flashes the car (CoffeeTableAR, BOOST_FLASH): a white shell over
  // the body, bright as it takes the boost and gone again in a third of a second
  useFrame(() => {
    const f = flash.current;
    if (!f) return;
    const k = boost ? Math.max(0, (boost.current - BOOST_FLASH) / (1 - BOOST_FLASH)) : 0;
    f.visible = k > 0;
    (f.material as MeshBasicMaterial).opacity = k * k;
  });
  if (!kit) return null;
  paintStripe(kit.car_stripe);
  return (
    <group>
      <mesh geometry={kit.car_body}>
        <meshStandardMaterial color={livery.body} emissive={livery.body} emissiveIntensity={0.35} roughness={0.42} metalness={0.1} />
        <Crease threshold={30} color={NEUTRAL} transparent opacity={0.3} />
      </mesh>
      <mesh geometry={kit.car_cabin}>
        <meshStandardMaterial color={livery.cabin} roughness={0.18} metalness={0.35} />
        <Crease threshold={30} color={NEUTRAL} transparent opacity={0.3} />
      </mesh>
      <mesh geometry={kit.car_stripe}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>
      <mesh geometry={kit.car_tyres}>
        <meshStandardMaterial color="#15121c" roughness={0.8} />
      </mesh>
      <mesh geometry={kit.car_rims}>
        <meshStandardMaterial color={livery.rim} emissive={livery.rim} emissiveIntensity={1.1} roughness={0.35} toneMapped={false} />
      </mesh>
      <mesh ref={flash} geometry={kit.car_body} scale={1.3} visible={false}>
        <meshBasicMaterial color="#ffffff" transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} userData={{ lifeSkip: true }} />
      </mesh>
    </group>
  );
}

/** The crown that floats over whichever car is winning, a flat cut-out like the
 *  game's. Gold, not a layer accent: it isn't a project colour, it's a trophy. */
const CROWN = GOLD;
function LeaderCrown() {
  const kit = useCarKit();
  if (!kit) return null;
  return (
    <mesh geometry={kit.crown}>
      <meshStandardMaterial color={CROWN} emissive={CROWN} emissiveIntensity={1.1} roughness={0.3} transparent opacity={0.88} toneMapped={false} />
    </mesh>
  );
}

/* ---------- The Lightship Drive table ----------
   After the show-floor setup in the project's film: a low table with a mat on
   it and two light-blue kickers set out on the mat. The cars
   follow a course over it instead of circling a ring: down the front straight
   and off a kicker, braking into the hairpin, a jog in toward the middle, off
   the second kicker on the back straight, and round the tighter sweeper home.
   The course itself is only hinted at: faint arrows down its middle.

   The table and the kicker are Blender models (build_table.py, via kit.ts);
   the mat, the course and the race are laid out here. Table space: x
   along the table, y up, z across it, the front straight at +z. */
const MAT = 0.19 + 0.0012; // the mat on the table's top (TOP in build_table.py): everything below stands on it
const MAT_W = 0.7;
const MAT_D = 0.36;
const LANE = 0.0185; // each car's line off the course's middle: two abreast, and the kickers are built wide enough for both
const CAR_SCALE = 0.85; // the cars at this table's scale, so two fit abreast

// The course, as a turtle drives it from the start of the front straight,
// heading +x: straights and arcs, each (length, radians turned; right is
// negative). Round the near end in a wide hairpin; then the back steps in toward
// the middle (two 10 cm arcs); a short back straight; and a tighter sweeper
// home. It closes on itself: the jog takes up the difference between the two
// ends' radii.
const JOG_R = 0.1;
const JOG = Math.acos(1 - 0.05 / (2 * JOG_R)); // each arc of the 5 cm step in
const LEGS: [number, number][] = [
  [0.33, 0], // the front straight, with the first kicker on it
  [Math.PI * 0.12, -Math.PI], // the hairpin
  [0.06, 0],
  [JOG_R * JOG, -JOG], // the jog in toward the middle…
  [JOG_R * JOG, JOG], // …and out of it, straight again
  [0.19, 0], // the back straight, with the second kicker
  [Math.PI * 0.095, -Math.PI], // the sweeper
  [0.06 + 2 * JOG_R * Math.sin(JOG) + 0.19 - 0.33, 0], // home
];
const START: [number, number] = [-0.1515, 0.12]; // centres the course on the mat
const COURSE = (() => {
  const total = LEGS.reduce((n, [l]) => n + l, 0);
  const N = Math.round(total / 0.012);
  const pts: Vector3[] = [];
  let [x, z] = START;
  let h = 0; // heading, from +x toward +z
  let leg = 0;
  let into = 0; // how far along the current leg
  const step = total / N;
  for (let i = 0; i < N; i++) {
    pts.push(new Vector3(x, 0, z));
    // drive one step, across leg ends
    let left = step;
    while (left > 1e-9) {
      const [len, turn] = LEGS[leg];
      const go = Math.min(left, len - into);
      if (turn === 0) {
        x += Math.cos(h) * go;
        z += Math.sin(h) * go;
      } else {
        const r = len / Math.abs(turn);
        const dh = (turn / len) * go;
        // along the arc: the chord, at the mid heading
        const c = 2 * r * Math.sin(Math.abs(dh) / 2);
        x += Math.cos(h + dh / 2) * c;
        z += Math.sin(h + dh / 2) * c;
        h += dh;
      }
      into += go;
      left -= go;
      if (into >= len - 1e-9) {
        leg = (leg + 1) % LEGS.length;
        into = 0;
      }
    }
  }
  const curve = new CatmullRomCurve3(pts, true, 'centripetal');
  const L = curve.getLength();
  // a kicker on each straight, by its toe: the first late on the front
  // straight, landing just before the hairpin; the second as the back straight
  // begins, landing as the sweeper does
  const at = (n: number) => LEGS.slice(0, n).reduce((m, [l]) => m + l, 0);
  const toes = [0.085, at(5) + 0.004].map((s) => (s / total) * L);
  return { curve, L, toes };
})();
const wrapS = (s: number) => ((s % COURSE.L) + COURSE.L) % COURSE.L;

// The kicker (build_table.py): its length, its height at the lip, and its face as
// (distance from the toe, height), down its steep back to the mat. The course is
// draped over it; a car goes up the face and off the lip.
const RAMP_L = 0.08;
const RAMP_H = 0.03;
const LIP = RAMP_L - 0.004;
const RAMP_FACE: [number, number][] = [
  [0, 0.0016],
  [RAMP_L / 2 + 0.004, RAMP_H * 0.64],
  [LIP, RAMP_H],
  [RAMP_L, 0],
];
// Off the lip a car flies a parabola, launched along the face's last facet and
// landing FLIGHT beyond the lip, then a small bounce as it lands.
const LAUNCH = (RAMP_H * 0.36) / (LIP - RAMP_FACE[1][0]);
const FLIGHT = 0.12;
const FALL = (RAMP_H + LAUNCH * FLIGHT) / FLIGHT ** 2; // so it's back on the mat at FLIGHT
const BOUNCE = { h: 0.0025, len: 0.035 };

/** How high the course lies at `s` along it: on the mat, or draped over a kicker. */
function courseHeight(s: number): number {
  for (const toe of COURSE.toes) {
    const x = wrapS(s - toe);
    if (x > RAMP_L) continue;
    for (let i = 1; i < RAMP_FACE.length; i++) {
      const [x1, y1] = RAMP_FACE[i];
      if (x <= x1) {
        const [x0, y0] = RAMP_FACE[i - 1];
        return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      }
    }
  }
  return 0;
}

/** Where a car rides at `s`: its height off the mat, and the slope it's pitched to. */
function rideAt(s: number): [number, number] {
  for (const toe of COURSE.toes) {
    const x = wrapS(s - toe) - LIP; // past the lip
    if (x > 0 && x < FLIGHT) return [RAMP_H + LAUNCH * x - FALL * x * x, LAUNCH - 2 * FALL * x];
    if (x >= FLIGHT && x < FLIGHT + BOUNCE.len) {
      const k = (Math.PI * (x - FLIGHT)) / BOUNCE.len;
      return [BOUNCE.h * Math.sin(k), ((BOUNCE.h * Math.PI) / BOUNCE.len) * Math.cos(k)];
    }
  }
  const e = 0.003;
  return [courseHeight(s), (courseHeight(s + e) - courseHeight(s - e)) / (2 * e)];
}

// How hard a car brakes for the bend ahead: the course's curvature, averaged
// over the next few centimetres so it slows before the hairpin rather than in
// it, and picks up again on the way out.
const GRIP_N = 256;
const BRAKE = 0.32; // the speed shed in the tightest bend
const GRIP = (() => {
  const { curve } = COURSE;
  const ds = COURSE.L / GRIP_N;
  const k = new Float32Array(GRIP_N);
  const a = new Vector3();
  const b = new Vector3();
  for (let i = 0; i < GRIP_N; i++) {
    curve.getTangentAt(i / GRIP_N, a);
    curve.getTangentAt(((i + 1) % GRIP_N) / GRIP_N, b);
    k[i] = Math.abs(Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z)) / ds;
  }
  const AHEAD = Math.round(0.06 / ds);
  const out = new Float32Array(GRIP_N);
  for (let i = 0; i < GRIP_N; i++) {
    let sum = 0;
    for (let j = 0; j <= AHEAD; j++) sum += k[(i + j) % GRIP_N];
    out[i] = 1 - BRAKE * Math.min(1, sum / (AHEAD + 1) / 11);
  }
  return out;
})();
const gripAt = (s: number) => GRIP[Math.floor((wrapS(s) / COURSE.L) * GRIP_N) % GRIP_N];

/* The course, hinted at: small, faint arrows down its middle, pointing the
   way the race goes, and climbing the kickers with it. One tile of the strip's
   texture is one arrow; the strip's length is a whole number of them, so it
   closes without a seam. */
const ARROW_W = 0.024; // the strip the arrows are drawn on: one arrow wide
const ARROW_GAP = COURSE.L / Math.round(COURSE.L / 0.09); // from one arrow to the next
let arrowTex: CanvasTexture | null = null;
function arrowTexture(): CanvasTexture {
  if (arrowTex) return arrowTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = Math.round((64 * ARROW_GAP) / ARROW_W); // square texels
  const g = c.getContext('2d');
  if (g) {
    const { width: w } = c;
    // an arrowhead pointing up the texture, which the strip's v runs along
    // with the race; the rest of the tile is clear
    g.strokeStyle = SURFACE.pale.color;
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(w * 0.18, w * 0.78);
    g.lineTo(w * 0.5, w * 0.36);
    g.lineTo(w * 0.82, w * 0.78);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return (arrowTex = t);
}

/** The strip the arrows lie on: down the middle of the course, draped over the
 *  kickers, with v running along it. */
function arrowGeometry(): BufferGeometry {
  const N = 420;
  const pos = new Float32Array((N + 1) * 6);
  const uv = new Float32Array((N + 1) * 4);
  const idx: number[] = [];
  const p = new Vector3();
  const t = new Vector3();
  for (let i = 0; i <= N; i++) {
    const u = (i % N) / N;
    COURSE.curve.getPointAt(u, p);
    COURSE.curve.getTangentAt(u, t);
    const s = (i / N) * COURSE.L;
    const y = MAT + courseHeight(s) + 0.0012;
    const nx = t.z * (ARROW_W / 2);
    const nz = -t.x * (ARROW_W / 2);
    pos.set([p.x + nx, y, p.z + nz, p.x - nx, y, p.z - nz], i * 6);
    uv.set([0, s / ARROW_GAP, 1, s / ARROW_GAP], i * 4);
  }
  // a quad per step, except down the steep back of a kicker: the strip stops at
  // the lip and picks up again on the mat behind it, rather than hanging a wall
  for (let i = 0; i < N; i++) {
    if (Math.abs(pos[i * 6 + 1] - pos[(i + 1) * 6 + 1]) > 0.004) continue;
    idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const PIECE = '#74b6ff'; // the kickers' light blue, as in the film

/* Two cars racing the course. Each runs its own lap, and three things make it a
   contest rather than a procession (simulated across wake phases: a pass every
   ~19s, a typical gap a sixth of a lap, and no car ever below half pace):

     · `wob`/`amp` — each car's pace rises and falls round the lap on its own
       rhythm, on top of the braking every car does for the bends.
     · `PACE` — a slow swing in outright pace, in antiphase between the two, so
       each is genuinely the quicker car for a spell: this is what opens a gap
       and closes it again.
     · `CATCH` — a push on whoever is behind, growing with the gap and worth
       nothing when they're level, so the gap centres on zero whenever you
       arrive and nothing holds them together through a pass.

   Progress is counted in laps (2π a lap), which is what decides the lead. They
   keep to their own lanes, so a pass happens alongside. */
const CARS: { livery: Livery; at: number; lane: number; wob: number; amp: number; phase: number; pace: number }[] = [
  // the game's purple car, magenta rims; its orange rival with a blue cabin
  { livery: { body: '#5b2a8f', cabin: '#1d1a3f', rim: '#ff4fd8' }, at: 0, lane: LANE, wob: 3, amp: 0.12, phase: 0, pace: 0 },
  { livery: { body: '#ff8a3c', cabin: '#3a2f9e', rim: '#b45cff' }, at: -1.8, lane: -LANE, wob: 2, amp: 0.15, phase: 1.9, pace: Math.PI },
];
const PACE = 0.17; // depth of the slow pace swing
const PACE_W = 0.175; // rad/s — a full swing every ~36s, so a pass is an event
const CATCH = 0.07; // how hard a dropped car pushes on, per radian of gap
const CATCH_CAP = 6; // never let the band become a rocket if the gap ever runs away
const LEAD_HYST = 0.07; // the crown won't change hands on a photo finish jitter
const LAP_SPEED = (2 * Math.PI * 0.2) / COURSE.L; // laps (in radians) per metre-per-second at 0.2 m/s top speed
/* In the table's close-up, point at a car and it gets a boost: it squats for
   a beat (BOOST_SQUAT: rear down, low and wide, braking), then launches,
   stretched along its line and flashing white, into a burst of speed that
   fades over BOOST_FADE with a neon trail in its stripe's colours streaming
   behind, its nose lifting and bobbing as it settles. So you can help one into
   the lead. One boost per car per BOOST_REST. */
const BOOST = 0.9; // extra speed at the burst's peak
const BOOST_FADE = 1.3; // s
const BOOST_FLASH = 0.7; // the flash lasts while the boost fades from 1 to here (~0.4 s)
const BOOST_REST = 1.6; // s before the same car takes another
const BOOST_REACH = 0.035; // how near the cursor's ray has to pass a car (m)
const BOOST_SQUAT = 0.14; // s it gathers itself before it goes
const TRAIL = { beads: 12, gap: 0.014, r: 0.0055 }; // the boost's neon trail, back along the car's line

function CoffeeTableAR({ position, hoverSlug }: { position: V3; hoverSlug?: string }) {
  const { hovered, selected, visited } = useActive(hoverSlug ?? '');
  const reduced = useReducedMotion();
  const kit = useTableKit();
  const cars = useRef<(Group | null)[]>([]);
  const crown = useRef<Group>(null);
  const speed = useRef(0.1);
  const live = useRef(0);
  // laps covered per car, seeded with each car's start so the lead is right from the first frame
  const dist = useRef(CARS.map((c) => c.at));
  const pitch = useRef(CARS.map(() => 0));
  const lead = useRef(0);
  const close = useCloseUp(hoverSlug ?? '');
  const table = useRef<Group>(null);
  const boost = useMemo(() => CARS.map(() => ({ current: 0, rest: 0, at: -99, launched: true })), []);
  const trailIM = useRef<InstancedMesh>(null);
  const trailMat = useMemo(() => {
    const m = new MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    m.userData.lifeSkip = true;
    return m;
  }, []);
  useEffect(() => () => trailMat.dispose(), [trailMat]);
  const tp = useMemo(() => new Vector3(), []);
  const tt = useMemo(() => new Vector3(), []);
  const ray = useMemo(() => new Ray(), []);
  const carAt = useMemo(() => new Vector3(), []);
  const arrows = useGeometry(arrowGeometry);
  const mat = useGeometry(() => roundedPlaneGeometry(MAT_W, MAT_D, 0.03));
  const arrowMap = useMemo(arrowTexture, []);
  const ramps = useMemo(
    () =>
      COURSE.toes.map((toe) => {
        const u = wrapS(toe + RAMP_L / 2) / COURSE.L;
        const p = COURSE.curve.getPointAt(u);
        const t = COURSE.curve.getTangentAt(u);
        return { p: [p.x, MAT, p.z] as V3, yaw: Math.atan2(t.x, t.z) };
      }),
    [],
  );
  const p = useMemo(() => new Vector3(), []);
  const tan = useMemo(() => new Vector3(), []);
  useFrame((s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    // ghost table: the cars barely creep; the race only runs once it's alive
    const sT = selected || visited ? 1 : hovered ? 0.45 : 0.1;
    speed.current += (sT - speed.current) * 0.05;
    live.current += ((selected || visited ? 1 : 0) - live.current) * FX.engage;
    const t = s.clock.elapsedTime;

    // a car the cursor points at takes a boost
    const aiming = close && !!table.current && !!cursorRay(s, table.current, ray);
    for (let i = 0; i < CARS.length; i++) {
      const b = boost[i];
      b.current = Math.max(0, b.current - dt / BOOST_FADE);
      b.rest = Math.max(0, b.rest - dt);
      const g = cars.current[i];
      if (aiming && g && b.rest === 0) {
        carAt.copy(g.position).y += 0.015;
        if (ray.distanceSqToPoint(carAt) < BOOST_REACH * BOOST_REACH) {
          b.at = t; // it squats first; the burst comes as it launches
          b.launched = false;
          b.rest = BOOST_REST;
        }
      }
      if (!b.launched && t - b.at >= BOOST_SQUAT) {
        b.launched = true;
        b.current = 1;
      }
    }

    // who's ahead, by laps covered; the dead band stops the crown flickering through a pass
    const d = dist.current[0] - dist.current[1];
    if (d > LEAD_HYST) lead.current = 0;
    else if (d < -LEAD_HYST) lead.current = 1;
    for (let i = 0; i < CARS.length; i++) {
      const c = CARS[i];
      const at = (dist.current[i] / (2 * Math.PI)) * COURSE.L;
      if (!reduced) {
        let v = speed.current * gripAt(at) * (1 + c.amp * Math.sin(dist.current[i] * c.wob + c.phase) + PACE * Math.sin(t * PACE_W + c.pace));
        if (i !== lead.current) {
          // pushing on from behind, not towed along in front: zero at the pass,
          // so they're free to come apart again on the other side of it
          const gap = Math.min(CATCH_CAP, Math.max(0, dist.current[lead.current] - dist.current[i]));
          v *= 1 + CATCH * gap;
        }
        v *= 1 + BOOST * boost[i].current;
        if (!boost[i].launched) v *= 1 - 0.5 * easeOut((t - boost[i].at) / BOOST_SQUAT); // braking into the squat
        dist.current[i] += v * dt * LAP_SPEED;
      }
      const g = cars.current[i];
      if (!g) continue;
      const u = wrapS(at) / COURSE.L;
      COURSE.curve.getPointAt(u, p);
      COURSE.curve.getTangentAt(u, tan);
      const [y, slope] = rideAt(at);
      // the nose follows the slope, eased, so a landing settles rather than snaps
      const aim = -Math.atan(slope);
      pitch.current[i] = reduced ? aim : pitch.current[i] + (aim - pitch.current[i]) * (1 - Math.exp(-dt * 16));
      g.position.set(p.x + tan.z * c.lane, MAT + y, p.z - tan.x * c.lane);
      // the boost's body language: low and wide in the squat, rear down; then
      // stretched along its line as it goes, the nose bobbing as it settles
      const b = boost[i];
      const ph = t - b.at;
      let sx = 1;
      let sy = 1;
      let sz = 1;
      let nose = 0;
      if (!reduced && ph >= 0 && !b.launched) {
        const k = easeOut(ph / BOOST_SQUAT);
        sx = 1 + 0.08 * k;
        sy = 1 - 0.16 * k;
        sz = 1 - 0.05 * k;
        nose = -0.1 * k;
      } else if (!reduced && ph >= BOOST_SQUAT) {
        const e = Math.exp(-(ph - BOOST_SQUAT) * 7);
        sx = 1 - 0.06 * e;
        sy = 1 - 0.08 * e;
        sz = 1 + 0.3 * e;
        nose = -0.05 * ring(ph - BOOST_SQUAT, 2.4, 4);
      }
      g.scale.set(sx, sy, sz);
      g.rotation.set(pitch.current[i] - 0.07 * b.current + nose, Math.atan2(tan.x, tan.z), 0, 'YXZ');
      // the trail: back along the line it's driven, jumps and all, in its
      // stripe's colours (yellow at the car, through blue, to magenta), as
      // bright as the boost still is
      const trail = trailIM.current;
      if (trail) {
        for (let k = 0; k < TRAIL.beads; k++) {
          const j = i * TRAIL.beads + k;
          const f = k / (TRAIL.beads - 1);
          const glow = b.current * (1 - f) * 1.4;
          if (glow <= 0.01) {
            trail.setMatrixAt(j, _m4.makeScale(0, 0, 0));
            continue;
          }
          const back = at - (k + 1) * TRAIL.gap;
          const uk = wrapS(back) / COURSE.L;
          COURSE.curve.getPointAt(uk, tp);
          COURSE.curve.getTangentAt(uk, tt);
          _v3.set(tp.x + tt.z * c.lane, MAT + rideAt(back)[0] + 0.008, tp.z - tt.x * c.lane);
          trail.setMatrixAt(j, _m4.compose(_v3, _q4.identity(), tp.setScalar((1 - 0.55 * f) * TRAIL.r / 0.006)));
          const from = f < 0.5 ? STRIPE[2] : STRIPE[1];
          const to = f < 0.5 ? STRIPE[1] : STRIPE[0];
          trail.setColorAt(j, _c3.copy(from).lerp(to, (f % 0.5) * 2).multiplyScalar(glow));
        }
      }
    }
    if (trailIM.current) {
      trailIM.current.instanceMatrix.needsUpdate = true;
      if (trailIM.current.instanceColor) trailIM.current.instanceColor.needsUpdate = true;
    }

    // the crown rides whoever is ahead, and hops across the moment that changes
    const lc = cars.current[lead.current];
    if (crown.current && lc) {
      const bob = reduced ? 0 : t;
      crown.current.position.set(lc.position.x, lc.position.y + 0.034 + Math.sin(bob * 3) * 0.004, lc.position.z);
      crown.current.rotation.y = bob * 0.9;
      crown.current.scale.setScalar(live.current * CAR_SCALE); // only once the race is real
      crown.current.visible = live.current > 0.02;
    }
  });
  return (
    <group ref={table} position={position} rotation={[0, -0.16, 0]}>
      <BlobShadow position={[0, 0.004, 0]} radius={0.48} aspect={0.62} opacity={0.4} />
      {kit && (
        <mesh geometry={kit.tbl_frame}>
          <LiveGlassMat slug="lightship-drive" tint="pale" />
          <LiveEdges slug="lightship-drive" threshold={35} />
        </mesh>
      )}
      {/* the mat the game is played on: a plain sheet in the model's ground
          (GROUND, materials.tsx — it lies on the table rather than standing on
          it, like the rug), so the table reads as part of the maquette and the
          cars and kickers carry the colour */}
      <mesh geometry={mat} position={[0, MAT, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <GroundMat />
      </mesh>
      {/* faint: they show the way without drawing the eye off the cars */}
      <mesh geometry={arrows} renderOrder={1}>
        <meshBasicMaterial map={arrowMap} transparent opacity={0.5} depthWrite={false} toneMapped={false} />
      </mesh>
      {kit &&
        ramps.map((r, i) => (
          <mesh key={i} geometry={kit.ramp} position={r.p} rotation={[0, r.yaw, 0]}>
            <LiveGlassMat slug="lightship-drive" tint="pale" color={PIECE} />
            <LiveEdges slug="lightship-drive" threshold={20} />
          </mesh>
        ))}
      {CARS.map((c, i) => (
        <group key={i} ref={(g) => (cars.current[i] = g)}>
          <group scale={CAR_SCALE}>
            <RaceCar livery={c.livery} boost={boost[i]} />
          </group>
        </group>
      ))}
      {/* the boosts' neon trails */}
      <instancedMesh ref={trailIM} args={[undefined, trailMat, CARS.length * TRAIL.beads]} frustumCulled={false}>
        <sphereGeometry args={[0.006, 8, 6]} />
      </instancedMesh>
      {/* the trophy over whoever is winning */}
      <group ref={crown} visible={false}>
        <LeaderCrown />
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

/* A VR headset put down on the desk, front to the room, after a Meta Quest: a
   soft white visor with three dark sensor pills down its front, the foam face
   pad behind it, and the fabric strap looped out the back. Modelled in Blender
   (scripts/models/build_headset.py). */
function Headset() {
  const kit = useHeadsetKit();
  if (!kit) return null;
  return (
    <>
      <mesh geometry={kit.hs_strap}>
        <LiveGlassMat slug={DESK_SLUG} ghost={false} tint="glass" />
      </mesh>
      <mesh geometry={kit.hs_shell}>
        <LiveGlassMat slug={DESK_SLUG} ghost={false} tint="pale" />
        <LiveEdges slug={DESK_SLUG} threshold={35} />
      </mesh>
      <mesh geometry={kit.hs_pods}>
        <LiveGlassMat slug={DESK_SLUG} ghost={false} tint="deep" />
      </mesh>
      <mesh geometry={kit.hs_face}>
        <LiveGlassMat slug={DESK_SLUG} ghost={false} tint="deep" />
      </mesh>
    </>
  );
}

/* The Virtuele Brigade is played together, so open it and a session starts:
   the headset on the desk lifts to a standing player's head height, a second
   one joins beside the screen (it spawns in, the way a remote player appears),
   and the two play a scene only they can see — worn by no one.

   What makes it read as multiplayer is that they play it together, beat by
   beat (BEATS): both on the same thing; one turning to the other, who turns
   back, and a nod — talking it over; both leaning in over something on the
   ground; a sound, and the second follows the first's turn a moment later; one
   down behind cover while the other keeps watch above. Each beat gives each
   player a point to look at (in the desk's frame: SCENE, or the other player),
   which its head eases onto with the camera's spring (lib/spring.ts: a head
   gathers speed and settles, it doesn't snap). The heads tip into their turns,
   and a slow sway of breath and weight runs under all of it, out of step
   between the two. Close the project and the second leaves, and the first
   settles back where it was put down. Under reduced motion they take their
   places and hold still. */
const HS_PIVOT: V3 = [0, 0.036, -0.1]; // the middle of the wearer's head, in the headset's own frame
const HS_LEVEL = 0.12; // pitched a little nose-down, which levels the strap round the head that isn't there
// Where the two heads stand, desk frame: over the desk's left end and to the
// right of the screen, both clear above it. The camera looks on from the front
// left, so a look at SCENE.ahead shows it the visors, and a look at each other
// shows them in profile.
const PLAYERS: V3[] = [
  [-0.32, 0.9, 0.1],
  [0.42, 0.86, 0.14],
];
const SCENE: Record<'ahead' | 'ground' | 'left' | 'right' | 'up', V3> = {
  ahead: [0.05, 0.75, 1.4],
  ground: [0.05, 0.3, 0.7],
  left: [-1.4, 0.85, 0.55],
  right: [1.3, 0.8, 0.7],
  up: [0.2, 1.7, 0.9],
};
type Aim = V3 | 'peer';
// (`glide`, the head's spring, is kept long: a head that whips round reads as
// a puppet, one that gathers speed and eases in as someone looking)
const BEATS: { hold: number; glide: number; look: [Aim, Aim]; duck?: [number, number]; lean?: [number, number]; nod?: boolean; lag?: number }[] = [
  { hold: 2.6, glide: 0.8, look: [SCENE.ahead, SCENE.ahead] }, // both on the same thing
  { hold: 2.0, glide: 0.65, look: ['peer', SCENE.ahead] }, // one turns to the other…
  { hold: 2.4, glide: 0.65, look: ['peer', 'peer'], nod: true }, // …who turns back: talking it over
  { hold: 2.4, glide: 0.75, look: [SCENE.ground, SCENE.ground], lean: [0.035, -0.035] }, // both lean in over something
  { hold: 1.9, glide: 0.45, look: [SCENE.left, SCENE.left], lag: 0.45 }, // a sound: one turns, the other a moment behind
  { hold: 2.2, glide: 0.55, look: [SCENE.left, SCENE.up], duck: [0.075, 0] }, // one into cover, the other keeping watch
  { hold: 1.8, glide: 0.65, look: ['peer', 'peer'], nod: true }, // a nod: clear
  { hold: 2.3, glide: 0.7, look: [SCENE.right, SCENE.right], lag: 0.3 }, // on, together
];
const BEAT_LEN = BEATS.reduce((n, b) => n + b.hold, 0);
const JOIN_DELAY = 0.7; // s after the first lifts that the second spawns in
/* In the close-up, now and then, the two notice you: between their beats they
   turn to look at the cursor, the first and then the second, as if a third
   player had just joined the session, and after a moment go back to their game.
   It's a double-take (DOUBLE_TAKE): a quick glance partway round, back to the
   game, then the real look round, the head tipped as if to say "who's that?".
   Only while the cursor's moving; never more often than every NOTICE_EVERY. */
const NOTICE_FIRST = 2.5; // s into the session before the first time
const NOTICE_LEN = 2.8; // how long they look, double-take and all
/** The double-take, in s into a player's notice: the glance (`of` the way
 *  round to you) until `glance`, back on the game until `back`, then the look;
 *  each on its own spring (`glides`, s), the look's head tipped `tilt` (rad;
 *  the two tip opposite ways). */
const DOUBLE_TAKE = { glance: 0.28, back: 0.62, of: 0.45, glides: [0.16, 0.28, 0.42], tilt: 0.16 };
const NOTICE_EVERY = [6, 9]; // s from one time to the next, at random between
const NOTICE_LAG = 0.25; // the second looks round this long after the first
const NOTICE_AT: V3 = [0.05, 0.85, 0.6]; // the depth they look out to, desk frame: in front of them, toward you
const JOIN_FLICKER = 0.3; // s of flicker as it arrives
/** Which beat is playing `t` seconds into the session, and how long it has been on. */
function beatAt(t: number): [number, number] {
  let u = ((t % BEAT_LEN) + BEAT_LEN) % BEAT_LEN;
  for (let i = 0; i < BEATS.length; i++) {
    if (u < BEATS[i].hold) return [i, u];
    u -= BEATS[i].hold;
  }
  return [0, 0];
}
function VRPlayers({ position, rotation }: { position: V3; rotation?: V3 }) {
  const { selected } = useActive(DESK_SLUG);
  const reduced = useReducedMotion();
  const close = useCloseUp(DESK_SLUG);
  const frame = useRef<Group>(null); // the desk's frame, to find the cursor in
  const notice = useRef({ t: -1, next: NOTICE_FIRST });
  const you = useMemo(() => new Vector3(), []);
  const depth = useMemo(() => new Vector3(...NOTICE_AT), []);
  const rigs = useRef<(Group | null)[]>([]);
  const lift = useRef(0); // 0 on the desk, 1 on the first player's head
  const session = useRef(0); // seconds the session has been running
  const heads = useRef(PLAYERS.map(() => ({ yaw: 0, pitch: 0, duck: 0, lean: 0, tilt: 0 })));
  const vels = useRef(PLAYERS.map(() => ({ yaw: { v: 0 }, pitch: { v: 0 }, duck: { v: 0 }, lean: { v: 0 }, tilt: { v: 0 } })));
  const restYaw = rotation?.[1] ?? 0;
  // where the first head's middle is while its headset lies on the desk
  const rest = useMemo<V3>(() => {
    const c = Math.cos(restYaw);
    const sn = Math.sin(restYaw);
    return [position[0] + HS_PIVOT[0] * c + HS_PIVOT[2] * sn, position[1] + HS_PIVOT[1], position[2] - HS_PIVOT[0] * sn + HS_PIVOT[2] * c];
  }, [position, restYaw]);
  useFrame((s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const t = s.clock.elapsedTime;
    const on = selected ? 1 : 0;
    lift.current = reduced ? on : lift.current + (on - lift.current) * (1 - Math.exp(-dt * 2.2));
    session.current = selected ? session.current + dt : 0;
    const e = lift.current * lift.current * (3 - 2 * lift.current); // eased off the desk and back onto it
    // noticing you: when it's time, and only while the cursor's moving
    const nt = notice.current;
    const moving = close && cursorIdle() < 1.5;
    const seen = moving && !!frame.current && !!cursorAtDepth(s, frame.current, depth, you);
    if (!selected) Object.assign(nt, { t: -1, next: NOTICE_FIRST });
    else if (nt.t < 0 && seen && session.current >= nt.next) nt.t = 0;
    else if (nt.t >= 0) {
      nt.t += dt;
      if (nt.t > NOTICE_LEN + NOTICE_LAG) {
        nt.t = -1;
        nt.next = session.current + NOTICE_EVERY[0] + Math.random() * (NOTICE_EVERY[1] - NOTICE_EVERY[0]);
      }
    }
    // the second player: spawning in once the session's begun, gone when it ends
    const since = session.current - JOIN_DELAY;
    const joined = reduced ? on : selected ? Math.min(1, Math.max(0, since / 0.45)) : Math.max(0, Math.min(1, e * 1.4 - 0.4));
    const flicker = !reduced && selected && since > 0 && since < JOIN_FLICKER && Math.sin(since * 90) < 0;
    for (let p = 0; p < PLAYERS.length; p++) {
      const g = rigs.current[p];
      if (!g) continue;
      const at = PLAYERS[p];
      const peer = PLAYERS[1 - p];
      // the beat this player is on: the second follows a beat's turn `lag` behind
      let [bi] = beatAt(session.current);
      if (p === 1) {
        const [b2, into] = beatAt(session.current);
        const lag = BEATS[b2].lag ?? 0;
        bi = into < lag ? (b2 + BEATS.length - 1) % BEATS.length : b2;
      }
      const B = BEATS[bi];
      const aim = B.look[p];
      const game: V3 = aim === 'peer' ? peer : aim;
      // noticing you overrides the beat while it lasts, as a double-take: the
      // glance (0), back to the game (1), the look (2)
      const into = nt.t - p * NOTICE_LAG;
      const noticing = nt.t >= 0 && into >= 0 && into <= NOTICE_LEN && seen;
      const take = !noticing ? -1 : into < DOUBLE_TAKE.glance ? 0 : into < DOUBLE_TAKE.back ? 1 : 2;
      const of = take === 0 ? DOUBLE_TAKE.of : take === 2 ? 1 : 0;
      const to: V3 = [game[0] + (you.x - game[0]) * of, game[1] + (you.y - game[1]) * of, game[2] + (you.z - game[2]) * of];
      const dx = to[0] - at[0];
      const dz = to[2] - at[2];
      const yaw = Math.atan2(dx, dz);
      const nod = B.nod && !noticing && !reduced ? 0.05 * (1 - Math.cos(session.current * 5 + p)) : 0;
      const pitch = -Math.atan2(to[1] - at[1], Math.hypot(dx, dz)) + nod;
      const glide = take < 0 ? B.glide : DOUBLE_TAKE.glides[take];
      const hd = heads.current[p];
      const v = vels.current[p];
      if (reduced) Object.assign(hd, { yaw: Math.atan2(SCENE.ahead[0] - at[0], SCENE.ahead[2] - at[2]), pitch: 0, duck: 0, lean: 0, tilt: 0 });
      else {
        hd.yaw = spring(hd.yaw, yaw, v.yaw, dt, glide);
        hd.pitch = spring(hd.pitch, pitch, v.pitch, dt, glide);
        hd.duck = spring(hd.duck, (B.duck?.[p] ?? 0) * on, v.duck, dt, B.glide);
        hd.lean = spring(hd.lean, (B.lean?.[p] ?? 0) * on, v.lean, dt, B.glide);
        hd.tilt = spring(hd.tilt, take === 2 ? (p === 0 ? 1 : -1) * DOUBLE_TAKE.tilt : 0, v.tilt, dt, 0.35);
      }
      // breath and weight under it all, out of step between the two, the head
      // tipping into a turn, and tipped while it looks at you
      const k = p === 0 ? e : joined;
      const sway = reduced ? 0 : k;
      const ph = p * 2.1;
      const roll = 0.18 * Math.tanh((-v.yaw.v * 0.07) / 0.18) * sway + Math.sin(t * 0.8 + ph) * 0.03 * sway + hd.tilt * sway;
      const x = at[0] + hd.lean + Math.sin(t * 0.7 + ph) * 0.008 * sway;
      const y = at[1] - hd.duck + Math.sin(t * 1.6 + ph) * 0.005 * sway;
      const z = at[2] + Math.sin(t * 0.55 + 1 + ph) * 0.006 * sway;
      const rx = HS_LEVEL + hd.pitch;
      const ry = hd.yaw + Math.sin(t * 0.9 + ph) * 0.03 * sway;
      if (p === 0) {
        // lifted off the desk and set back down on it
        const mix = (a: number, b: number) => a + (b - a) * e;
        g.position.set(mix(rest[0], x), mix(rest[1], y), mix(rest[2], z));
        g.rotation.set(mix(0, rx), mix(restYaw, ry), mix(0, roll), 'YXZ');
      } else {
        // spawned in where it stands: out of nothing, a touch over size, settling
        g.visible = joined > 0.001 && !flicker;
        const pop = joined < 1 ? joined * (1 + 0.25 * Math.sin(joined * Math.PI)) : 1;
        g.scale.setScalar(Math.max(0.001, pop));
        g.position.set(x, y, z);
        g.rotation.set(rx, ry, roll, 'YXZ');
      }
    }
  });
  return (
    <group ref={frame}>
      <group ref={(g) => (rigs.current[0] = g)} position={rest} rotation={[0, restYaw, 0]}>
        <group position={[-HS_PIVOT[0], -HS_PIVOT[1], -HS_PIVOT[2]]}>
          <Headset />
        </group>
      </group>
      <group ref={(g) => (rigs.current[1] = g)} position={PLAYERS[1]} visible={false}>
        <group position={[-HS_PIVOT[0], -HS_PIVOT[1], -HS_PIVOT[2]]}>
          <Headset />
        </group>
      </group>
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
const BOOK_ANG = 0.14; // resting V of the halves once open: shallow, so both pages face you
function BookHalf({ side, tex, lit, kit }: { side: -1 | 1; tex: Texture | null; lit: LitLink; kit: BooksKit }) {
  const { accentDeep } = useAccent();
  const x = (side * BOOK_W) / 4;
  return (
    <>
      {/* the cover board, its outer corners rounded, and the page block on it
          (build_books.py: one half, mirrored for the other) */}
      <group scale={[side, 1, 1]}>
        <mesh geometry={kit.zw_board}>
          <meshStandardMaterial {...litMat(lit)} color={accentDeep} emissive={accentDeep} emissiveIntensity={0.16} roughness={0.5} />
        </mesh>
        <mesh geometry={kit.zw_block}>
          <meshStandardMaterial {...litMat(lit)} color={SURFACE.pale.color} emissive={SURFACE.pale.color} emissiveIntensity={0.32} roughness={0.85} />
        </mesh>
      </group>
      {/* the printed page on top of the block */}
      <mesh position={[x, BOOK_T / 2 + BOOK_PT + 0.0008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BOOK_W / 2 - 0.016, BOOK_H - 0.02]} />
        {tex ? (
          <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={1} roughness={0.75} toneMapped={false} side={DoubleSide} />
        ) : (
          <meshStandardMaterial color={SURFACE.pale.color} emissive={SURFACE.pale.color} emissiveIntensity={0.55} roughness={0.85} side={DoubleSide} />
        )}
      </mesh>
    </>
  );
}
// Holographic content lifting off the open page — a few small wireframe glyphs
// that rise, turn and fade above the spread while the book is open. The AR the
// Zwijsen books are about, made literal; off under reduced motion.
// In the book's close-up they drift toward the cursor as they rise (the more
// the higher they are, up to HOLO_REACH from where they'd be), and float back
// when it rests. The drift is springy (HOLO_SPRING): they reach a little past
// and bob back. And they whirl as they reach you, up to HOLO_WHIRL times their
// own turn, a touch bigger.
const HOLO_PULL = 0.5;
const HOLO_REACH = 0.12;
const HOLO_SPRING = { freq: 1.3, damping: 0.35 }; // see wobble
const HOLO_WHIRL = 5;
function BookAR({ slug }: { slug: string }) {
  const reduced = useReducedMotion();
  const { accent } = useAccent();
  const { selected } = useActive(slug);
  const close = useCloseUp(slug);
  const root = useRef<Group>(null);
  const you = useMemo(() => new Vector3(), []);
  const over = useMemo(() => new Vector3(0, 0.12, 0), []);
  const drift = useMemo(() => [new Vector3(), new Vector3(), new Vector3()], []);
  const driftVel = useMemo(() => drift.map(() => ({ x: { v: 0 }, y: { v: 0 }, z: { v: 0 } })), [drift]);
  const turn = useMemo(() => drift.map(() => ({ x: 0, y: 0 })), [drift]); // each glyph's turn so far
  const pull = useMemo(() => new Vector3(), []);
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
  useFrame((s, delta) => {
    glow.current += ((selected && !reduced ? 1 : 0) - glow.current) * FX.engage;
    const t = s.clock.elapsedTime;
    const dt = Math.min(delta, 1 / 30);
    const toward = close && cursorIdle() < 2.5 && !!root.current && !!cursorAtDepth(s, root.current, over, you);
    for (let i = 0; i < items.length; i++) {
      const g = refs.current[i];
      const m = mats.current[i];
      const it = items[i];
      if (!g) continue;
      const p = (t * it.spd + it.ph) % 1;
      const y = 0.03 + p * 0.16;
      // toward the cursor, the further the higher it has risen, within reach
      if (toward) {
        pull.set(you.x - it.x, you.y - y, you.z - it.z).multiplyScalar(HOLO_PULL * p);
        if (pull.length() > HOLO_REACH) pull.setLength(HOLO_REACH);
      } else pull.set(0, 0, 0);
      const d = drift[i];
      const dv = driftVel[i];
      if (reduced) d.copy(pull);
      else {
        d.x = wobble(d.x, pull.x, dv.x, dt, HOLO_SPRING.freq, HOLO_SPRING.damping);
        d.y = wobble(d.y, pull.y, dv.y, dt, HOLO_SPRING.freq, HOLO_SPRING.damping);
        d.z = wobble(d.z, pull.z, dv.z, dt, HOLO_SPRING.freq, HOLO_SPRING.damping);
      }
      g.position.set(it.x + d.x, y + d.y, it.z + d.z); // rise off the page
      // whirling up as it reaches you
      const near = Math.min(1, d.length() / HOLO_REACH);
      const whirl = 1 + (HOLO_WHIRL - 1) * near * near;
      const tn = turn[i];
      tn.x += dt * 0.5 * whirl;
      tn.y += dt * 0.8 * whirl;
      g.rotation.set(tn.x, tn.y + it.ph * 6, 0);
      g.scale.setScalar((0.55 + 0.45 * Math.sin(p * Math.PI)) * (1 + 0.2 * near));
      if (m) m.opacity = fxEnv(p) * FX.peak * glow.current;
    }
  });
  return (
    <group ref={root}>
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
  const kit = useBooksKit();
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
      g.rotation.y = 0.17 * s; // squared up to the camera, which looks from a little to the right
      g.scale.setScalar(1 + 0.4 * s); // held up to be read: bigger than it stood on the shelf
      g.position.set(position[0] - 0.04 + 0.01 * s, position[1] + 0.01 + 0.15 * s, position[2] + 0.02 + 0.34 * s);
    }
    // the front cover swings 180° round the spine, from folded-shut to the open
    // V, out through the front of the book (the side that faces the room: the
    // other way it opened through the back, into the shelf, and the book
    // looked as if it were opening inside out). Its hinge also drops level
    // with the back half as it opens
    if (frontHinge.current) {
      frontHinge.current.rotation.z = -Math.PI * (1 - s) - BOOK_ANG * s; // -π: out through the front, toward the room
      frontHinge.current.position.y = (BOOK_T + BOOK_PT * 2 + 0.001) * (1 - s);
    }
    if (backHinge.current) backHinge.current.rotation.z = BOOK_ANG * s;
  });
  return (
    <group ref={grp} position={position}>
      {/* back half — stays put, tilting into its side of the V */}
      <group ref={backHinge}>{kit && <BookHalf side={1} tex={texR} lit={lit} kit={kit} />}</group>
      {/* front half — folded over when closed, swings open on select */}
      <group ref={frontHinge}>{kit && <BookHalf side={-1} tex={texL} lit={lit} kit={kit} />}</group>
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

/* The shelved books: one hardcover from the kit (build_books.py, a typical
   5 × 17 × 17 cm book), placed at each book's own size — its covers in the
   book's value, its page block paper, the two bands across its spine in the
   opposite value — and merged into one mesh per tone. */
const KIT_BOOK: V3 = [0.05, 0.17, 0.17]; // the kit book's thickness, height, depth
function ShelvedBooks({ kit, link, mats }: { kit: BooksKit; link: LitLink; mats: { current: (MeshStandardMaterial | null)[] } }) {
  const books = useGeometry(() => {
    const tone: Record<Tint, BufferGeometry[]> = { glass: [], deep: [], pale: [] };
    const paper: BufferGeometry[] = [];
    const light: BufferGeometry[] = [];
    const dark: BufferGeometry[] = [];
    const add = (c: Tint, at: V3, rot: V3, size: V3) => {
      const sc: V3 = [size[0] / KIT_BOOK[0], size[1] / KIT_BOOK[1], size[2] / KIT_BOOK[2]];
      tone[c].push(place(kit.book_cover.clone(), at, rot, sc));
      paper.push(place(kit.book_pages.clone(), at, rot, sc));
      (c === 'pale' ? dark : light).push(place(kit.book_bands.clone(), at, rot, sc));
    };
    BOOKS.forEach((bk, i) => {
      const [w, h] = bk.s;
      const d = 0.15 + ((i * 37) % 5) * 0.01; // 15–19 cm deep, spines flush
      const top = SHELF_TOPS.reduce((a, b) => (Math.abs(b - (bk.p[1] - h / 2)) < Math.abs(a - (bk.p[1] - h / 2)) ? b : a));
      // a leaning book keeps its place; an upright one stands on the shelf
      add(bk.c, bk.r ? bk.p : [bk.p[0], top + h / 2, SPINE_Z - d / 2], bk.r ?? [0, 0, 0], [w, h, d]);
    });
    // the stack on the bottom shelf, lying down (spines still out), each a little askew
    const stack: [number, number, number, number, Tint][] = [
      [0.2, 0.03, 0.16, 0.02, 'deep'],
      [0.19, 0.028, 0.152, -0.05, 'glass'],
      [0.176, 0.026, 0.148, 0.07, 'pale'],
    ];
    let y = SHELF_TOPS[0];
    for (const [len, thick, d, yaw, c] of stack) {
      add(c, [0.19, y + thick / 2, 0.035], [0, yaw, Math.PI / 2], [thick, len, d]);
      y += thick;
    }
    return { glass: merge(tone.glass), deep: merge(tone.deep), pale: merge(tone.pale), paper: merge(paper), light: merge(light), dark: merge(dark) };
  }, [kit]);
  return (
    <>
      {(['glass', 'deep', 'pale'] as const).map((c, i) => (
        <mesh key={c} geometry={books[c]}>
          <meshStandardMaterial ref={(m) => (mats.current[i] = m)} {...litMat(link)} color={SURFACE[c].color} emissive={SURFACE[c].color} emissiveIntensity={0.1} roughness={0.6} />
        </mesh>
      ))}
      <mesh geometry={books.paper}>
        <meshStandardMaterial {...litMat(link)} color={SURFACE.pale.color} emissive={SURFACE.pale.color} emissiveIntensity={0.2} roughness={0.85} />
      </mesh>
      <mesh geometry={books.light}>
        <meshStandardMaterial {...litMat(link)} color={SURFACE.pale.color} emissive={SURFACE.pale.color} emissiveIntensity={0.16} roughness={0.5} />
      </mesh>
      <mesh geometry={books.dark}>
        <meshStandardMaterial {...litMat(link)} color={SURFACE.deep.color} emissive={SURFACE.deep.color} emissiveIntensity={0.12} roughness={0.5} />
      </mesh>
    </>
  );
}

/** The bookcase. Engaging the Zwijsen book "turns it on": the book spines glow,
 *  alongside the open spread lifting out to face the player.
 *
 *  Built like furniture: sides with a softened front edge, a top that
 *  overhangs as a cornice, a plinth set back as a toe kick, a thin back let
 *  into the frame, and shelves with a front lip. The books are hardcovers
 *  (ShelvedBooks): they sit ON their shelves, run to different depths with
 *  their spines lined up at the front, a couple lean, and a stack lies a
 *  little askew on the bottom shelf. The plant on top is a succulent in a
 *  turned pot. */
const SHELF_TOPS = [0.171, 0.431, 0.691];
const SPINE_Z = 0.13; // where the spines line up, a little behind the lip
function Bookcase({ position, rotation }: { position: V3; rotation: [number, number, number] }) {
  const { hovered, selected, visited } = useActive('zwijsen-ar-books');
  const kit = useBooksKit();
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
        <group ref={shelved}>{kit && <ShelvedBooks kit={kit} link={link} mats={bookMats} />}</group>
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
 *  The monitor is a current slim one from Blender (build_monitor.py): the
 *  picture almost to the edge in a thin bezel, a shallow housing on its back,
 *  on an L stand — a flat base plate and one upright leaning up to a hinge.
 *  Engaging it solidifies the desk, chair and plant with it (the life
 *  spreads). Everything structural stays behind the screen's plane
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
  const mon = useMonitorKit();
  return (
    <>
      <mesh geometry={g.wood}>
        <LiveGlassMat slug="virtuele-brigade" ghost={false} opacity={0.2} />
      </mesh>
      <mesh geometry={g.trim}>
        <LiveGlassMat slug="virtuele-brigade" ghost={false} tint="pale" />
      </mesh>
      <LifeGroup slug="virtuele-brigade">
        {mon && (
          <>
            <mesh geometry={mon.mon_panel}>
              <LiveGlassMat slug="virtuele-brigade" opacity={0.2} />
              <LiveEdges slug="virtuele-brigade" threshold={35} />
            </mesh>
            <mesh geometry={mon.mon_stand}>
              <LiveGlassMat slug="virtuele-brigade" tint="pale" />
            </mesh>
          </>
        )}
        {/* the picture, edge to edge in the panel's thin bezel (build_monitor.py) */}
        <RoomScreen slug="virtuele-brigade" position={[0, 0.63, -0.1255]} args={[0.542, 0.302, 0.002]} />
      </LifeGroup>
      {/* keyboard square in front of the monitor, mouse to its right; to its left
          the headset the project is for, put down facing the room with its strap
          trailing back, and the cup in the far corner, where an elbow won't knock it */}
      <Keyboard position={[-0.02, 0.403, 0.06]} rotation={[0, 0.04, 0]} />
      <Mouse position={[0.235, 0.408, 0.055]} rotation={[0, -0.12, 0]} />
      <CoffeeCup position={[-0.4, 0.395, -0.13]} rotation={[0, -2.2, 0]} lit={brigade} />
      <VRPlayers position={[-0.28, 0.395, 0.06]} rotation={[0, -0.35, 0]} />
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
// draws the seams into the ghost sketch. It used to be built with one corner radius on every part, which is
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
  // placeable by eye from the dev tools in `npm run dev` (dev/tuning.ts)
  const desk = usePlacement('Room.Desk', { position: [-1.2, 0, 0.18], rotationY: 1.76 });
  const couch = usePlacement('Room.Couch', { position: [0.12, 0, -0.22], rotationY: -0.16 });
  const table = usePlacement('Room.AR table', { position: [0, 0, 0.52] });
  const shelf = usePlacement('Room.Bookcase', { position: [1, 0, -1.06], rotationY: -0.27 });
  const plant = usePlacement('Room.Plant', { position: [-1.23, 0, 0.9] });
  const lamp = usePlacement('Room.Floor lamp', { position: [-0.32, 0, -1.57] });
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
            nothing to point at. It lands face down on the right-hand cushion,
            whose top is at about 0.203 there, crown included: its centre half
            its thickness above that, and a hair more for the screen. */}
        <LifeGroup slug="popcore-games">
          <Phone slug="popcore-games" position={[0.12, 0.2075, 0.06]} liveColor={accent} />
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

