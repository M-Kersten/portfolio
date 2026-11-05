// The Virtuele Brigade, played: call-outs. Its close-up already runs a shared
// session (room.tsx VRPlayers: two players in VR, worn by no one). With a
// cursor, you're the third player, at the desk, the way the instructors join
// one (in VR, at a desktop or in the editor). Now and then something turns up
// around the two that only you can see from where you sit: a marker, with a
// ring closing in on it. Rest the cursor on it and you've called it out: both
// turn to look, the second a beat behind the first, and once they've seen it
// they nod and it's cleared. Each one cleared lights a pip along the foot of
// the monitor; one left too long slips away, and the row goes dark. A full row
// and the two turn to each other and nod, and it starts over, a little faster
// each time it's made. Not on a touch screen, where there's no cursor to call
// with, nor under reduced motion (useCloseUp): there the session plays as it
// always has.
import { useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, type Size } from '@react-three/fiber';
import { AdditiveBlending, Color, DoubleSide, Vector2, Vector3, type Camera, type Group, type Mesh, type MeshBasicMaterial } from 'three';
import { useAccent, useActive, type V3 } from './shared';
import { cursorNdc, useCloseUp } from './closeup';
import { play } from '../../lib/sound';
import { bump, easeOutBack } from '../../lib/ease';

/** What the game tells the two players (room.tsx VRPlayers reads it). */
export interface CallLink {
  /** the game is on: their own noticing of the cursor gives way to it */
  on: boolean;
  /** where they've been told to look, in the desk's frame, or null */
  look: Vector3 | null;
  /** when (on the scene's clock) the last call was cleared: they nod */
  nodAt: number;
  /** when a full row was made: they turn to each other and nod */
  roundAt: number;
}
export const newCallLink = (): CallLink => ({ on: false, look: null, nodAt: -1, roundAt: -1 });
/** How long the two take over a full row, turned to each other. */
export const ROUND_LEN = 1.8;

/* Where something can turn up, in the desk's frame (its top is at 0.395, the
   screen spans ±0.27 across and 0.48–0.78 up, the two heads float at about
   [-0.32, 0.9] and [0.42, 0.86]): round the players, above the screen, out to
   the left and low in front, never on the screen or a head. The close-up sees
   about −0.6…0.75 across and 0.2…1.15 up, the label covering the right; only
   the spots that land in the picture, clear of the label, are used (see
   `inView`), so another screen's framing just has fewer to choose from. */
const SPOTS: V3[] = [
  [-0.45, 1.04, 0.25],
  [-0.05, 1.06, 0.02],
  [0.62, 1.1, 0.18],
  [-0.52, 0.62, 0.35],
  [-0.55, 0.36, 0.38],
  [0.5, 0.3, 0.4],
  [0.55, 0.6, 0.3],
  [0.22, 1.12, 0.1],
  [-0.54, 0.86, 0.25],
];
const LIFE = 4.8; // s a marker waits to be called, at the start of a row…
const LIFE_STEP = 0.22; // …shorter by this for each one in the row…
const LIFE_MIN = 2.2; // …down to this
const GAP = [0.6, 1.3]; // s from one to the next, at random between
const FIRST = 2.4; // s into the session before the first
const REACH = 0.024; // how near the cursor has to come, as a share of the canvas's width (about 30px at 1280)
const DWELL = 0.16; // s it has to rest there: that's the call
const LOOK = 0.7; // s from the call to cleared: the time the two take to look
const ROW = 10; // pips along the monitor: a full row is a round
const R = 0.034; // a marker's radius, desk units
const SLIP = 0.5; // s for a missed one to blink out
const BURST = 0.45; // s for a cleared one's ring to run out

type Phase = 'wait' | 'live' | 'called' | 'cleared' | 'missed';

/** The monitor's pips: along the foot of the picture, just in front of it. */
const SCREEN = { x: 0, y: 0.63 - 0.151 + 0.017, z: -0.1255 + 0.0022, pitch: 0.021, size: 0.012 };

export function Callouts({ slug, link }: { slug: string; link: MutableRefObject<CallLink> }) {
  const close = useCloseUp(slug);
  const { selected } = useActive(slug);
  const { accent, accentPale } = useAccent();
  const marker = useRef<Group>(null);
  const core = useRef<MeshBasicMaterial>(null);
  const ring = useRef<MeshBasicMaterial>(null);
  const closer = useRef<Mesh>(null);
  const closerMat = useRef<MeshBasicMaterial>(null);
  const burst = useRef<Mesh>(null);
  const burstMat = useRef<MeshBasicMaterial>(null);
  const pips = useRef<(MeshBasicMaterial | null)[]>([]);
  const game = useRef({ phase: 'wait' as Phase, t: 0, wait: FIRST, spot: -1, last: -1, rest: 0, row: 0, rounds: 0, life: LIFE, on: 0, session: 0 });
  const ink = useMemo(() => ({ hot: new Color(accent), pale: new Color(accentPale), c: new Color() }), [accent, accentPale]);
  const tmp = useMemo(() => ({ w: new Vector3(), p: new Vector3(), n: new Vector2(), at: new Vector3() }), []);

  /** Whether spot `i` lands in the picture, clear of its edges and of the label. */
  const inView = (i: number, group: Group, camera: Camera, size: Size) => {
    tmp.w.set(...SPOTS[i]);
    group.parent?.localToWorld(tmp.w);
    tmp.p.copy(tmp.w).project(camera);
    if (tmp.p.z > 1) return false;
    const x = ((tmp.p.x + 1) / 2) * size.width + size.left;
    const y = ((1 - tmp.p.y) / 2) * size.height + size.top;
    const m = 48; // px kept from the edges (and the header's height more at the top)
    if (x < size.left + m || x > size.left + size.width - m || y < size.top + m + 64 || y > size.top + size.height - m) return false;
    const label = document.querySelector('.exhibit .xl')?.getBoundingClientRect();
    if (label && x > label.left - 40 && x < label.right + 40 && y > label.top - 40 && y < label.bottom + 40) return false;
    return true;
  };

  useFrame((st, delta) => {
    const g = marker.current;
    if (!g) return;
    const dt = Math.min(delta, 1 / 30);
    const now = st.clock.elapsedTime;
    const s = game.current;
    const L = link.current;
    // on in the close-up with a cursor, a moment into the session
    s.session = selected ? s.session + dt : 0;
    s.on = close ? Math.min(1, s.on + dt / 0.4) : Math.max(0, s.on - dt / 0.3);
    L.on = close;
    if (!close) {
      // closed (or a touch screen): nothing up, the row cleared for next time
      Object.assign(s, { phase: 'wait', t: 0, wait: FIRST, spot: -1, rest: 0, row: 0, life: LIFE });
      L.look = null;
    }
    s.t += dt;

    if (close) {
      if (s.phase === 'wait' && s.t > s.wait) {
        // the next one: a spot in the picture, not the last one
        const free = SPOTS.map((_, i) => i).filter((i) => i !== s.last && inView(i, g, st.camera, st.size));
        if (free.length) {
          s.spot = free[Math.floor(Math.random() * free.length)];
          s.last = s.spot;
          s.life = Math.max(LIFE_MIN, LIFE - LIFE_STEP * s.row - 0.15 * s.rounds);
          s.phase = 'live';
          s.t = 0;
          s.rest = 0;
        } else s.t = s.wait - 0.5; // nowhere to put one just now: look again in a moment
      } else if (s.phase === 'live') {
        // is the cursor on it?
        tmp.w.set(...SPOTS[s.spot]);
        g.parent?.localToWorld(tmp.w);
        tmp.p.copy(tmp.w).project(st.camera);
        const on = cursorNdc(st.size, tmp.n);
        const near = !!on && Math.hypot(((tmp.n.x - tmp.p.x) / 2) * st.size.width, ((tmp.n.y - tmp.p.y) / 2) * st.size.height) < REACH * st.size.width;
        s.rest = near ? s.rest + dt : 0;
        if (s.rest > DWELL) {
          // called: the two turn to it
          s.phase = 'called';
          s.t = 0;
          L.look = tmp.at.set(...SPOTS[s.spot]);
          play('call-out', { volume: 0.45 });
        } else if (s.t > s.life) {
          s.phase = 'missed';
          s.t = 0;
          s.row = 0;
          play('call-miss', { volume: 0.4 });
        }
      } else if (s.phase === 'called' && s.t > LOOK) {
        // they've seen it
        s.phase = 'cleared';
        s.t = 0;
        s.row++;
        L.nodAt = now;
        play('call-clear', { volume: 0.45 });
        if (s.row >= ROW) {
          L.roundAt = now + 0.35;
          s.rounds++;
        }
      } else if (s.phase === 'cleared' && s.t > BURST) {
        L.look = null;
        if (s.row >= ROW) s.row = 0;
        s.phase = 'wait';
        s.t = 0;
        s.wait = (s.rounds && L.roundAt > now - ROUND_LEN ? ROUND_LEN : 0) + GAP[0] + Math.random() * (GAP[1] - GAP[0]);
      } else if (s.phase === 'missed' && s.t > SLIP) {
        s.phase = 'wait';
        s.t = 0;
        s.wait = GAP[0] + Math.random() * (GAP[1] - GAP[0]);
      }
    }

    // ---- the marker ----
    const showing = s.spot >= 0 && s.phase !== 'wait';
    g.visible = showing && s.on > 0.01;
    if (g.visible) {
      g.position.set(...SPOTS[s.spot]);
      g.lookAt(st.camera.position);
      // it breathes while it waits; the ring tightens onto it as it's called
      const up = easeOutBack(Math.min(1, (s.phase === 'live' ? s.t : 1) / 0.28));
      const lock = s.phase === 'called' || s.phase === 'cleared' ? 1 - 0.18 * easeOutBack(Math.min(1, (s.phase === 'called' ? s.t : 1) / 0.2)) : 1;
      const breathe = s.phase === 'live' ? 1 + 0.08 * Math.sin(now * 7) + 0.25 * Math.min(1, s.rest / DWELL) : 1;
      g.scale.setScalar(R * up * lock * breathe);
      // the time it has: a ring closing in from three times its size
      const left = s.phase === 'live' ? 1 - s.t / s.life : 0;
      if (closer.current && closerMat.current) {
        closer.current.visible = s.phase === 'live';
        closer.current.scale.setScalar(1 + 2 * left);
        closerMat.current.opacity = 0.55 * Math.min(1, s.t / 0.3) * s.on;
      }
      // colour and strength: hot while it waits, pale when called, a blink as it slips
      const slip = s.phase === 'missed' ? (Math.floor(s.t * 12) % 2 ? 0 : 1) * (1 - s.t / SLIP) : 1;
      const called = s.phase === 'called' || s.phase === 'cleared';
      const fadeOut = s.phase === 'cleared' ? 1 - s.t / BURST : 1;
      if (core.current) {
        core.current.color.copy(called ? ink.pale : ink.hot).multiplyScalar(called ? 2.2 : 1.5);
        core.current.opacity = s.on * slip * fadeOut;
      }
      if (ring.current) {
        ring.current.color.copy(called ? ink.pale : ink.hot).multiplyScalar(1.3);
        ring.current.opacity = s.on * slip * fadeOut * (s.phase === 'live' ? 0.75 + 0.25 * Math.min(1, s.rest / DWELL) : 1);
      }
      // cleared: a ring runs out from it
      if (burst.current && burstMat.current) {
        burst.current.visible = s.phase === 'cleared';
        const k = Math.min(1, s.t / BURST);
        burst.current.scale.setScalar(1 + 2.6 * (1 - (1 - k) * (1 - k)));
        burstMat.current.opacity = (1 - k) * s.on;
      }
    }

    // ---- the pips on the monitor: the newest flashes as it lights, and a
    // full row flashes all together while the two nod over it ----
    const round = L.roundAt >= 0 && now >= L.roundAt && now - L.roundAt < ROUND_LEN;
    for (let i = 0; i < ROW; i++) {
      const m = pips.current[i];
      if (!m) continue;
      const fresh = i === s.row - 1 && s.phase === 'cleared' ? 1 + 1.4 * bump(s.t / BURST) : 1;
      const level = round ? (Math.floor((now - L.roundAt) * 6) % 2 ? 1.7 : 0.35) : i < s.row ? 1.25 * fresh : 0.16;
      m.color.copy(ink.hot).multiplyScalar(level);
      m.opacity = s.on;
    }
  });

  return (
    <>
      <group ref={marker} visible={false} renderOrder={9}>
        {/* the dot */}
        <mesh renderOrder={9}>
          <circleGeometry args={[0.32, 20]} />
          <meshBasicMaterial ref={core} color={accent} transparent depthTest={false} depthWrite={false} blending={AdditiveBlending} toneMapped={false} fog={false} side={DoubleSide} userData={{ lifeSkip: true, presenceOwn: true }} />
        </mesh>
        {/* its ring */}
        <mesh renderOrder={9}>
          <ringGeometry args={[0.82, 1, 40]} />
          <meshBasicMaterial ref={ring} color={accent} transparent depthTest={false} depthWrite={false} blending={AdditiveBlending} toneMapped={false} fog={false} side={DoubleSide} userData={{ lifeSkip: true, presenceOwn: true }} />
        </mesh>
        {/* the ring closing in: the time it has */}
        <mesh ref={closer} renderOrder={9}>
          <ringGeometry args={[0.95, 1, 48]} />
          <meshBasicMaterial ref={closerMat} color={accent} transparent opacity={0} depthTest={false} depthWrite={false} blending={AdditiveBlending} toneMapped={false} fog={false} side={DoubleSide} userData={{ lifeSkip: true, presenceOwn: true }} />
        </mesh>
        {/* cleared: a ring running out */}
        <mesh ref={burst} visible={false} renderOrder={9}>
          <ringGeometry args={[0.9, 1, 48]} />
          <meshBasicMaterial ref={burstMat} color={accentPale} transparent opacity={0} depthTest={false} depthWrite={false} blending={AdditiveBlending} toneMapped={false} fog={false} side={DoubleSide} userData={{ lifeSkip: true, presenceOwn: true }} />
        </mesh>
      </group>
      {/* the row of pips along the foot of the picture */}
      {Array.from({ length: ROW }, (_, i) => (
        <mesh key={i} position={[SCREEN.x + (i - (ROW - 1) / 2) * SCREEN.pitch, SCREEN.y, SCREEN.z]} renderOrder={4}>
          <planeGeometry args={[SCREEN.size, SCREEN.size]} />
          <meshBasicMaterial ref={(m) => (pips.current[i] = m)} color={accent} transparent opacity={0} depthWrite={false} toneMapped={false} userData={{ lifeSkip: true, presenceOwn: true }} />
        </mesh>
      ))}
    </>
  );
}
