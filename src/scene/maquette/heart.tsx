// The Philips medical XR & AI exhibit, on the chip layer: a heart projected as a
// hologram out of a chip on the board, the way XR puts a patient's anatomy in
// front of the team in minimally invasive care (the field the research was for,
// and the subject of the project's film). A catheter comes up out of the chip,
// up the aorta and over its arch to the root, where the heart's arteries leave;
// two of them are narrowed. In the close-up you steer it. The shape is
// heartShape.ts; ChipRig puts it in the back-left slot.
import { useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, CapsuleGeometry, Color, CylinderGeometry, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Ray, ShaderMaterial, SphereGeometry, TorusGeometry, Vector3, type Group, type Mesh, type Sprite } from 'three';
import { useSceneSelector } from '../store';
import { isTouch, useReducedMotion } from '../../lib/media';
import { NEUTRAL, PALETTE, useAccent, useActive, type V3 } from './shared';
import { GHOST_FILL } from './life';
import { glassRim, glowTexture, LiveEdges, LiveGlassMat } from './materials';
import { PresenceCtx } from './presence';
import type { ChipKit } from './kit';
import { cursorIdle, cursorRay, useCloseUp } from './closeup';
import { spring, wobble } from '../../lib/spring';
import { bump, easeIn, easeOut, easeOutBack } from '../../lib/ease';
import { play } from '../../lib/sound';
import { aortaTube, BRANCHES, branchPath, heartBody, LENS_DROP, otherVessels, pathTube, pointAt, R_CATHETER, R_CORONARY, tangentAt, trunkPath, type Path } from './heartShape';

/** The lens's top over the board (build_chip.py: projector), the heart's
 *  middle LENS_DROP over it, and the turn that shows the heart's front to the
 *  close-up's camera. */
const LENS_Y = 0.056;
const HEART_YAW = 0.35;

/* The beat: lub-dub, a small kick from the atria and the ventricles' big one a
   moment after, each squeezing the heart on a springy spring so it springs
   back a little past round. It beats weakly while its arteries are narrowed
   (`narrowed` of full strength) and harder, and brighter, as each is opened.
   Waking the exhibit starts it. */
const BEAT = { every: 1.05, kick: 2.2, atria: 0.3, lag: 0.12, freq: 3.2, damping: 0.42, narrowed: 0.6 };
/* Each beat sends a pulse of light down the arteries from the root (`run` s to
   reach the end, `width` its length along one); it stops at a narrowing, and
   the artery past one stays dim. */
const FLOW = { run: 0.55, width: 0.08 };
/* The catheter. In the close-up its tip follows the cursor along the vessels:
   point anywhere on the aorta or an artery and it threads there (back through
   the root if it has to change artery), at most `speed` a second, easing in on
   a spring (`glide`). `reach` is how near the cursor's ray has to pass a
   vessel, `front` how much nearer ones win (the aorta behind the heart doesn't
   steal it from the artery on its front). A narrowing stops it `stop` short;
   pointing on at or past it treats it. It rests `rest` up the aorta (over the
   arch); with the cursor at rest for `idle` s, or on a touch screen, it goes
   and treats them itself. */
const CATH = { glide: 0.16, speed: 0.75, reach: 0.05, front: 0.15, rest: 0.5, idle: 2.5, stop: 0.006 };
/* A treatment: the balloon inflates (`inflate`, the wind-up), then the
   narrowing opens: a flash (`flash`), the blood rushing down the artery
   (`rush`), a big beat, the hologram flaring; the balloon goes down (`deflate`)
   and leaves a stent. */
const TREAT = { inflate: 0.5, flash: 0.25, rush: 0.45, deflate: 0.3, flare: 0.8 };
const WARN = new Color(PALETTE.room.accent); // a narrowing: the maquette's warm colour
/** The tubes' detail: segments along the arteries, along the catheter (the
 *  aorta's run and each artery's) and round it. Its tip draws it in whole
 *  segments, so these also set how finely it creeps. */
const TUBE = { artery: 60, cathTrunk: 100, cathBranch: 60, cathRound: 4 };
/** The beam the heart stands in: from the lens's rim, widening a little as it
 *  rises and fading out before it reaches the heart (so it reads as light, not
 *  a shade round it). */
const BEAM = { r: 0.05, top: 0.075, h: 0.12 };
function beamGeometry() {
  const g = new CylinderGeometry(BEAM.top, BEAM.r, BEAM.h, 28, 1, true);
  // bright at the lens, nothing at the top: colour as intensity, added on
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) col.fill(pos.getY(i) < 0 ? 1 : 0, i * 3, i * 3 + 3);
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}
const WHITE = new Color('#ffffff');

const FLOW_VERT = `varying float vU;
void main() { vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// dim at rest, a pulse running down it each beat, cut off at a narrowing (the
// artery past it dull and warm), and the rush of blood once it's opened
const FLOW_FRAG = `uniform vec3 uColor; uniform vec3 uDead; uniform float uBase; uniform float uHead; uniform float uWidth;
uniform float uCut; uniform float uRush; uniform float uRushAt; uniform float uFade; varying float vU;
void main() {
  float past = step(uCut, vU);
  float pulse = exp(-pow((vU - uHead) / uWidth, 2.0)) * (1.0 - past);
  float rush = uRush * smoothstep(uRushAt - 0.3, uRushAt, vU) * (1.0 - smoothstep(uRushAt, uRushAt + 0.03, vU));
  vec3 c = mix(uColor, uDead, past);
  gl_FragColor = vec4(c * (uBase * (1.0 - 0.5 * past) + 1.4 * pulse + 2.4 * rush) * uFade, 1.0);
}`;

const _onSeg = new Vector3();
const _onRay = new Vector3();
/** The point of `path` nearest the cursor's ray: how near (`d`), how far
 *  along the path (`s`) and a score that also prefers nearer the camera. */
function nearest(path: Path, ray: Ray, centreT: number) {
  let best = { d: Infinity, s: 0, score: Infinity };
  for (let i = 0; i < path.pts.length - 1; i++) {
    const d2 = ray.distanceSqToSegment(path.pts[i], path.pts[i + 1], _onRay, _onSeg);
    const d = Math.sqrt(d2);
    const score = d + CATH.front * (_onRay.distanceTo(ray.origin) - centreT);
    if (score < best.score) best = { d, s: path.at[i] + _onSeg.distanceTo(path.pts[i]), score };
  }
  return best;
}

type Narrowing = { state: 'narrow' | 'inflating' | 'open'; at: number };

/** The Philips module: the projector chip (its Blender parts, in the board's
 *  glass), the faint beam out of its lens, and the hologram over it: the heart,
 *  its vessels, the catheter and the two narrowings. Dormant, it's a pale ghost
 *  of a heart; woken, it beats; open, you treat it. */
export function HeartHologram({ slug, position, kit }: { slug: string; position: V3; kit: ChipKit }) {
  const { accent, accentPale } = useAccent();
  const { hovered, selected, visited } = useActive(slug);
  // open at all, the camera arrived or not
  const open = useSceneSelector((s) => s.selectedSlug === slug);
  const reduced = useReducedMotion();
  const close = useCloseUp(slug);
  const coarse = useMemo(isTouch, []);
  const presence = useContext(PresenceCtx);
  const heartRef = useRef<Group>(null);
  const pumpRef = useRef<Group>(null);
  const trunkCath = useRef<Mesh>(null);
  const branchCath = useRef<(Mesh | null)[]>([]);
  const tipRef = useRef<Mesh>(null);
  const tipGlow = useRef<Sprite>(null);
  const markers = useRef<(Mesh | null)[]>([]);
  const halos = useRef<(Sprite | null)[]>([]);
  const balloons = useRef<(Mesh | null)[]>([]);
  const stents = useRef<(Group | null)[]>([]);
  const flashes = useRef<(Sprite | null)[]>([]);
  const beamRef = useRef<Mesh>(null);
  const ray = useMemo(() => new Ray(), []);
  const glow = useMemo(glowTexture, []);

  // the shape: built once, in the heart's frame
  const shape = useMemo(() => {
    const trunk = trunkPath();
    const branches = BRANCHES.map(branchPath);
    const blockS = BRANCHES.map((b, i) => b.block * branches[i].len);
    const at = (p: Path, s: number) => ({ p: pointAt(p, s, new Vector3()), q: new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), tangentAt(p, s, new Vector3())) });
    return {
      trunk,
      branches,
      blockS,
      blocks: branches.map((p, i) => at(p, blockS[i])),
      body: heartBody(),
      aorta: aortaTube(trunk),
      others: otherVessels(trunk),
      arteries: branches.map((p) => pathTube(p, R_CORONARY, TUBE.artery, 5)),
      trunkCath: pathTube(trunk, R_CATHETER, TUBE.cathTrunk, TUBE.cathRound),
      branchCaths: branches.map((p) => pathTube(p, R_CATHETER * 0.85, TUBE.cathBranch, TUBE.cathRound)),
    };
  }, []);
  useEffect(
    () => () => {
      for (const g of [shape.body, shape.aorta, shape.others, shape.trunkCath, ...shape.arteries, ...shape.branchCaths]) g.dispose();
    },
    [shape],
  );
  const small = useMemo(
    () => ({
      marker: new SphereGeometry(0.0085, 10, 6),
      balloon: new CapsuleGeometry(0.0058, 0.014, 3, 8),
      ring: new TorusGeometry(R_CORONARY * 1.55, 0.0006, 3, 10),
      tip: new SphereGeometry(0.0042, 8, 6),
      beam: beamGeometry(),
    }),
    [],
  );
  useEffect(() => () => Object.values(small).forEach((g) => g.dispose()), [small]);

  // the hologram's own materials (opted out of the life system: they drive
  // their own ghost → alive)
  const mats = useMemo(() => {
    const holo = (opacity: number, depthWrite: boolean) => {
      const m = new MeshStandardMaterial({ color: NEUTRAL, emissive: NEUTRAL, emissiveIntensity: 0.1, transparent: true, opacity, roughness: 0.4, metalness: 0, depthWrite });
      m.onBeforeCompile = glassRim;
      return m;
    };
    const flow = () =>
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color() }, uDead: { value: new Color() }, uBase: { value: 0.3 }, uHead: { value: 2 }, uWidth: { value: FLOW.width }, uCut: { value: 2 }, uRush: { value: 0 }, uRushAt: { value: 0 }, uFade: { value: 0 } },
        vertexShader: FLOW_VERT,
        fragmentShader: FLOW_FRAG,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      });
    const add = (color: Color | string) => new MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    const out = {
      body: holo(0.12, true),
      vessels: holo(0.1, false),
      lens: new MeshStandardMaterial({ color: GHOST_FILL, emissive: GHOST_FILL, emissiveIntensity: 0.1, roughness: 0.25, toneMapped: false }),
      beam: new MeshBasicMaterial({ color: accent, vertexColors: true, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
      arteries: BRANCHES.map(flow),
      cath: new MeshBasicMaterial({ color: new Color(accentPale).lerp(WHITE, 0.6), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
      tip: new MeshBasicMaterial({ color: WHITE, transparent: true, opacity: 0, toneMapped: false }),
      markers: BRANCHES.map(() => add(WARN)),
      balloons: BRANCHES.map(() => new MeshStandardMaterial({ color: WHITE, emissive: new Color(accentPale), emissiveIntensity: 0.5, transparent: true, opacity: 0.85, roughness: 0.3, depthWrite: false, toneMapped: false })),
      stents: BRANCHES.map(() => add(accent)),
    };
    for (const m of [out.body, out.vessels, out.lens, out.beam, out.cath, out.tip, ...out.arteries, ...out.markers, ...out.balloons, ...out.stents]) m.userData.lifeSkip = true;
    return out;
  }, [accent, accentPale]);
  useEffect(
    () => () => {
      for (const m of [mats.body, mats.vessels, mats.lens, mats.beam, mats.cath, mats.tip, ...mats.arteries, ...mats.markers, ...mats.balloons, ...mats.stents]) m.dispose();
    },
    [mats],
  );
  const colors = useMemo(() => ({ ghost: new Color(GHOST_FILL), grey: new Color(NEUTRAL), lime: new Color(accent), pale: new Color(accentPale), dead: WARN.clone().multiplyScalar(0.45) }), [accent, accentPale]);

  const st = useRef({
    k: 0, // brightness: hovered or open
    live: 0, // 0 dormant → 1 awake
    health: 0, // 0 both narrowed → 1 both open
    next: 0, // the next beat
    vent: -1, // the ventricles' kick, due
    beatAt: -99, // the last one
    squeeze: 0,
    sqVel: { v: 0 },
    allAt: -99, // when the last narrowing opened
    wasOpen: false,
    cath: { s: CATH.rest, vel: { v: 0 }, b: 0 },
    blocks: BRANCHES.map((): Narrowing => ({ state: 'narrow', at: -99 })),
  });
  const tipAt = useMemo(() => new Vector3(), []);

  useFrame((s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const t = s.clock.elapsedTime;
    const S = st.current;
    const T = shape.trunk;
    S.k += ((hovered || selected ? 1 : visited ? 0.5 : 0) - S.k) * 0.12;
    S.live += ((selected || visited ? 1 : 0) - S.live) * (reduced ? 1 : 0.05);
    const live = S.live;
    const pres = presence.current;
    // each opening once both are treated is the next patient
    if (open && !S.wasOpen && S.blocks.every((b) => b.state === 'open')) for (const b of S.blocks) Object.assign(b, { state: 'narrow', at: -99 });
    S.wasOpen = open;
    const opened = S.blocks.filter((b) => b.state === 'open').length / S.blocks.length;
    S.health += (opened - S.health) * (reduced ? 1 : 0.05);

    // --- the beat ---
    const amp = reduced ? 0 : live * (BEAT.narrowed + (1 - BEAT.narrowed) * S.health);
    if (t >= S.next) {
      S.next = t + BEAT.every;
      S.vent = t + BEAT.lag;
      S.sqVel.v -= BEAT.kick * BEAT.atria * amp;
    }
    if (S.vent > 0 && t >= S.vent) {
      S.vent = -1;
      S.sqVel.v -= BEAT.kick * amp;
      S.beatAt = t;
    }
    S.squeeze = wobble(S.squeeze, 0, S.sqVel, dt, BEAT.freq, BEAT.damping);
    const sq = S.squeeze; // below 0 in a squeeze
    const pump = pumpRef.current;
    if (pump) pump.scale.set(1 + sq, 1 + 0.6 * sq, 1 + sq);
    const flush = Math.min(1.4, Math.max(0, -sq) / 0.06); // about 1 at a full beat's height
    const flare = reduced ? 0 : bump((t - S.allAt) / TREAT.flare);

    // --- the catheter ---
    const C = S.cath;
    let target: { b: number; s: number } | null = null; // b -1: on the aorta
    const steering = close && cursorIdle() < CATH.idle && !!heartRef.current && !!cursorRay(s, heartRef.current, ray);
    if (steering) {
      const centreT = -ray.origin.dot(ray.direction);
      let best = { ...nearest(T, ray, centreT), b: -1 };
      shape.branches.forEach((p, b) => {
        const n = nearest(p, ray, centreT);
        if (n.score < best.score) best = { ...n, b };
      });
      if (best.d < CATH.reach) target = { b: best.b, s: best.s };
    } else if (open && !reduced && (coarse || cursorIdle() >= CATH.idle)) {
      const b = S.blocks.findIndex((x) => x.state !== 'open');
      target = b >= 0 ? { b, s: shape.blockS[b] + 0.02 } : { b: -1, s: CATH.rest };
    } else target = { b: -1, s: live > 0.5 ? CATH.rest : 0 };
    let goal = C.s;
    if (target) {
      if (target.b >= 0 && target.b !== C.b) {
        // into another artery: back to the root first
        if (C.s <= T.len + 0.002) {
          C.b = target.b;
          goal = T.len + target.s;
        } else goal = T.len;
      } else goal = target.b >= 0 ? T.len + target.s : target.s;
    }
    const blk = S.blocks[C.b];
    const stopAt = T.len + shape.blockS[C.b] - CATH.stop;
    if (blk.state !== 'open') goal = Math.min(goal, stopAt);
    goal = Math.max(0, Math.min(T.len + shape.branches[C.b].len, goal));
    const was = C.s;
    C.s = reduced ? goal : spring(C.s, goal, C.vel, dt, CATH.glide);
    const cap = CATH.speed * dt;
    if (Math.abs(C.s - was) > cap) {
      C.s = was + Math.sign(C.s - was) * cap;
      C.vel.v = Math.sign(C.vel.v) * Math.min(Math.abs(C.vel.v), CATH.speed);
    }
    const moving = Math.min(1, Math.abs(C.s - was) / (cap || 1));
    // at a narrowing and pointed on: the balloon goes up…
    if (blk.state === 'narrow' && C.s >= stopAt - 0.003 && target && target.b === C.b && T.len + target.s >= stopAt) {
      blk.state = 'inflating';
      blk.at = t;
      play('cath-inflate', { volume: 0.5 });
    }
    // …and the narrowing opens
    S.blocks.forEach((b) => {
      if (b.state !== 'inflating' || t - b.at < TREAT.inflate) return;
      b.state = 'open';
      b.at = t;
      play('cath-clear', { volume: 0.6 });
      if (!reduced) S.sqVel.v -= BEAT.kick * 1.3 * live; // a big beat
      if (S.blocks.every((x) => x.state === 'open')) S.allAt = t;
    });

    // --- drawing it ---
    // the hologram: a pale ghost asleep, lime awake, flushing with each beat
    const body = mats.body;
    body.color.copy(colors.ghost).lerp(colors.lime, live * 0.85);
    body.emissive.copy(colors.grey).lerp(colors.lime, live);
    body.emissiveIntensity = 0.06 + 0.22 * live + live * (0.45 + 0.35 * S.health) * flush + 0.12 * S.k + 1.2 * flare;
    body.opacity = (0.1 + 0.16 * live + 0.05 * S.k + 0.05 * flush * live) * pres;
    const vessels = mats.vessels;
    vessels.color.copy(body.color);
    vessels.emissive.copy(body.emissive);
    vessels.emissiveIntensity = 0.05 + 0.18 * live + 0.06 * S.k + 0.6 * flare;
    vessels.opacity = (0.08 + 0.12 * live + 0.04 * S.k) * pres;
    mats.lens.color.copy(colors.ghost).lerp(colors.lime, live);
    mats.lens.emissive.copy(colors.ghost).lerp(colors.lime, live);
    mats.lens.emissiveIntensity = 0.08 + live * (0.7 + 0.5 * flush) + 1.5 * flare;
    mats.beam.opacity = live * (0.12 + 0.06 * flush + 0.25 * flare) * pres;
    if (beamRef.current) beamRef.current.visible = live > 0.02;
    // the arteries
    const sinceBeat = t - S.beatAt;
    shape.branches.forEach((_, b) => {
      const u = mats.arteries[b].uniforms;
      const nb = S.blocks[b];
      u.uColor.value.copy(colors.grey).lerp(colors.pale, live);
      u.uDead.value.copy(colors.grey).lerp(colors.dead, live);
      u.uBase.value = 0.35 + 0.15 * S.k + 0.3 * flare;
      u.uHead.value = reduced || live < 0.05 ? 2 : sinceBeat / FLOW.run;
      u.uCut.value = nb.state === 'open' ? 2 : BRANCHES[b].block;
      const since = t - nb.at;
      const rushing = nb.state === 'open' && since < TREAT.rush * 1.5 && !reduced;
      u.uRush.value = rushing ? 1 - easeIn(since / (TREAT.rush * 1.5)) : 0;
      u.uRushAt.value = BRANCHES[b].block + (since / TREAT.rush) * (1.15 - BRANCHES[b].block);
      u.uFade.value = (0.3 + 0.7 * live) * pres;
    });
    // the catheter, drawn as far as its tip has got, and the tip
    const showCath = live > 0.05 && C.s > 0.003;
    mats.cath.opacity = Math.min(1, live * 1.2) * pres;
    const inTrunk = Math.min(C.s, T.len) / T.len;
    if (trunkCath.current) {
      trunkCath.current.visible = showCath;
      trunkCath.current.geometry.setDrawRange(0, Math.floor(inTrunk * TUBE.cathTrunk) * TUBE.cathRound * 6);
    }
    shape.branches.forEach((p, b) => {
      const m = branchCath.current[b];
      if (!m) return;
      const f = b === C.b ? Math.max(0, Math.min(1, (C.s - T.len) / p.len)) : 0;
      m.visible = showCath && f > 0;
      m.geometry.setDrawRange(0, Math.floor(f * TUBE.cathBranch) * TUBE.cathRound * 6);
    });
    if (C.s <= T.len) pointAt(T, C.s, tipAt);
    else if (pump) pointAt(shape.branches[C.b], C.s - T.len, tipAt).multiply(pump.scale);
    if (tipRef.current) {
      tipRef.current.visible = showCath;
      tipRef.current.position.copy(tipAt);
    }
    mats.tip.opacity = live * pres;
    if (tipGlow.current) {
      tipGlow.current.visible = showCath;
      tipGlow.current.position.copy(tipAt);
      tipGlow.current.scale.setScalar(0.022 + 0.012 * moving + (reduced ? 0 : 0.004 * Math.sin(t * 7)));
      tipGlow.current.material.opacity = live * (0.55 + 0.35 * moving) * pres;
    }
    // the narrowings, the balloon, the stent and the flash
    S.blocks.forEach((nb, b) => {
      const since = t - nb.at;
      const mk = markers.current[b];
      if (mk) {
        const gone = nb.state === 'open' ? easeIn(since / 0.15) : 0;
        const beat = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 5 + b * 2);
        const flicker = nb.state === 'inflating' && !reduced ? (Math.random() < 0.5 ? 1.6 : 0.5) : 1;
        mk.visible = live > 0.05 && gone < 1;
        mk.scale.setScalar((1 + 0.3 * beat) * (1 - gone));
        mats.markers[b].opacity = live * (0.55 + 0.35 * beat) * flicker * pres;
        const ha = halos.current[b];
        if (ha) {
          ha.visible = mk.visible;
          ha.scale.setScalar((0.03 + 0.012 * beat) * (1 - gone));
          ha.material.opacity = live * (0.35 + 0.3 * beat) * flicker * pres;
        }
      }
      const bl = balloons.current[b];
      if (bl) {
        const up = nb.state === 'inflating' ? easeOutBack(since / (TREAT.inflate * 0.7), 2.2) : nb.state === 'open' ? 1 - easeIn(since / TREAT.deflate) : 0;
        const strain = nb.state === 'inflating' && !reduced ? 1 + 0.05 * Math.sin(t * 46) * easeOut(since / TREAT.inflate) : 1;
        bl.visible = up > 0.01;
        bl.scale.set(up * strain, Math.max(0.01, up), up * strain);
      }
      const sn = stents.current[b];
      if (sn) {
        const pop = nb.state === 'open' ? (reduced ? 1 : easeOutBack((since - 0.05) / 0.3, 2.4)) : 0;
        sn.visible = pop > 0.01;
        sn.scale.setScalar(Math.max(0.01, pop));
        mats.stents[b].opacity = Math.min(1, pop) * (0.6 + 0.4 * live) * pres;
      }
      const fl = flashes.current[b];
      if (fl) {
        const u = since / TREAT.flash;
        fl.visible = nb.state === 'open' && u < 1 && !reduced;
        if (fl.visible) {
          fl.scale.setScalar(0.015 + 0.075 * easeOut(u, 3));
          fl.material.opacity = (1 - u) * (1 - u);
        }
      }
    });
  });

  const lens: V3 = [0, LENS_Y, 0];
  return (
    <group position={position}>
      {/* the projector chip */}
      <mesh geometry={kit.hrt_body}>
        <LiveGlassMat slug={slug} tint="deep" />
        <LiveEdges slug={slug} threshold={35} />
      </mesh>
      <mesh geometry={kit.hrt_ring}>
        <LiveGlassMat slug={slug} tint="pale" />
        <LiveEdges slug={slug} threshold={35} />
      </mesh>
      <mesh geometry={kit.hrt_legs}>
        <LiveGlassMat slug={slug} tint="pale" />
      </mesh>
      <mesh geometry={kit.hrt_lens} material={mats.lens} />
      {/* the beam it projects the heart in */}
      <mesh ref={beamRef} geometry={small.beam} material={mats.beam} position={[lens[0], lens[1] + BEAM.h / 2, lens[2]]} visible={false} renderOrder={1} />
      {/* the hologram */}
      <group ref={heartRef} position={[0, LENS_Y + LENS_DROP, 0]} rotation={[0, HEART_YAW, 0]}>
        <mesh geometry={shape.aorta} material={mats.vessels} renderOrder={1} />
        <mesh geometry={shape.others} material={mats.vessels} renderOrder={1} />
        <mesh ref={trunkCath} geometry={shape.trunkCath} material={mats.cath} renderOrder={4} visible={false} />
        <group ref={pumpRef}>
          <mesh geometry={shape.body} material={mats.body} renderOrder={2} />
          {shape.arteries.map((g, b) => (
            <mesh key={b} geometry={g} material={mats.arteries[b]} renderOrder={3} />
          ))}
          {shape.branchCaths.map((g, b) => (
            <mesh key={b} ref={(r) => (branchCath.current[b] = r)} geometry={g} material={mats.cath} renderOrder={4} visible={false} />
          ))}
          {shape.blocks.map((at, b) => (
            <group key={b} position={at.p} quaternion={at.q}>
              <mesh ref={(r) => (markers.current[b] = r)} geometry={small.marker} material={mats.markers[b]} renderOrder={5} />
              <sprite ref={(r) => (halos.current[b] = r)} visible={false} renderOrder={6}>
                <spriteMaterial map={glow} color={WARN} transparent opacity={0} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
              </sprite>
              <mesh ref={(r) => (balloons.current[b] = r)} geometry={small.balloon} material={mats.balloons[b]} rotation={[Math.PI / 2, 0, 0]} renderOrder={5} visible={false} />
              <group ref={(r) => (stents.current[b] = r)} visible={false}>
                {[-0.004, 0.004].map((z) => (
                  <mesh key={z} geometry={small.ring} material={mats.stents[b]} position={[0, 0, z]} renderOrder={5} />
                ))}
              </group>
              <sprite ref={(r) => (flashes.current[b] = r)} visible={false} renderOrder={6}>
                <spriteMaterial map={glow} color={WHITE} transparent opacity={0} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
              </sprite>
            </group>
          ))}
        </group>
        <mesh ref={tipRef} geometry={small.tip} material={mats.tip} renderOrder={5} visible={false} />
        <sprite ref={tipGlow} visible={false} renderOrder={6}>
          <spriteMaterial map={glow} color={colors.pale} transparent opacity={0} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        </sprite>
      </group>
    </group>
  );
}
