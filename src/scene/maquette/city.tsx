// The CITY layer (top) — GIS & location work. A skyline with lit windows, the
// windmill (DTT), the park with the ARCam tower viewer (ARCam), and the
// central skyscraper (Alliander), plus roads, power lines, ducks and a
// constellation. CityRig at the bottom composes and places everything.
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, Box3, BoxGeometry, BufferAttribute, BufferGeometry, Color, CurvePath, DoubleSide, Euler, InstancedMesh, LineCurve3, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Ray, RingGeometry, Shape, ShapeGeometry, ShaderMaterial, TubeGeometry, Vector2, Vector3, type Group, type Mesh, type Points as ThreePoints, type Sprite } from 'three';
import { usePlacement } from '../../dev/tuning';
import { useSceneSelector } from '../store';
import { portraitMix } from '../framing';
import { isTouch, useReducedMotion } from '../../lib/media';
import { NEUTRAL, GLASS, PALETTE, SURFACE, SURFACE_ABSENT, SURFACE_GLOW, useAccent, circlePts, roundedRectPts, smoothCurve, makeRand, Line, useActive, FX, fxEnv, type V3 } from './shared';
import { GHOST_FILL, LifeGroup } from './life';
import { Crease, glassRim, GlassMat, glowTexture, GroundMat, LiveEdges, LiveGlassMat } from './materials';
import { PresenceCtx } from './presence';
import { LIT_SOLID_OPACITY, litMat, litShade, ShadowPrint, useLitBody, useLitLink, type LitLink } from './lit';
import { faceted, lathe, merge, place, tube, useGeometry } from './shapes';
import { useLook } from '../look';
import { BlobShadow, blobShadowTexture } from './backdrop';
import { NextProjectSite, SITE_POS } from './launchSite';
import { loadBinoculars, loadBlocksKit, loadMillKit, loadTowerKit, loadTrafoKit, useBlocksKit, useMillKit, useTowerKit, useTrafoKit, type BlocksKit, type MillKit, type TowerKit, type TrafoKit } from './kit';
import { cursorAtDepth, cursorIdle, cursorNdc, cursorOnLevel, cursorRay, useCloseUp } from './closeup';
import { ParkCritters, SAFARI, VIEWER } from './critters';
import { spring, wobble } from '../../lib/spring';
import { bump, easeIn, easeOut, ring } from '../../lib/ease';
import { play } from '../../lib/sound';

/** The city's wake ramp: written once per frame by WindowDriver, read by every
 *  Building for both its windows and its body. A module-level box rather than
 *  state or context because it changes every frame and nothing should re-render
 *  for it — the panes only need a number to stagger themselves against.
 *
 *  This was two boxes, one for windows and one for bodies, back when the windows
 *  also answered hover and the bodies did not. They have carried the same value
 *  since hover came out, so it is one number now. */
const cityLevel = { k: 0 };
// scratch for the instanced effects (the gust's streaks, the grid's beads)
const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3();
const _v = new Vector3();
const _c = new Color();
const WHITE = new Color('#ffffff');
/** How long the whole skyline takes to come on, in seconds, and how much of that
 *  is spent staggering. At 0.75 the last building starts at 0.75s and every one
 *  takes the remaining 0.25s to come up, so the city is fully lit at 1.0s and no
 *  single window creeps. */
const ON_SECONDS = 1;
const WIN_STAGGER = 0.75;
/** Seed for the order the lights come on in. Its own generator, deliberately:
 *  the block generator's draw sequence places every building in the city, so
 *  taking numbers out of it here would reshuffle the skyline. */
const LIGHT_SEED = 0x5eed11;

/** Has the tower ever been opened this visit?
 *
 *  Module-level, not a ref and not state, because it has to outlive the driver.
 *  `k` below is a `useRef(0)`, so anything that remounts WindowDriver — the city
 *  group going away when you scroll off the layer, the shared window material
 *  being rebuilt — used to restart the ramp from dark and play the whole
 *  come-on again. That is the "they don't stay on" everyone was seeing: not the
 *  latch failing, the ramp starting over. */
let cityLatched = false;

/** The warm-up flicker, and the reason it stops.
 *
 *  This used to be a flat `0.82 + 0.18 * …` applied at every level, so a city
 *  that had finished lighting went on wavering by nearly 20% for as long as the
 *  page was open. Filament settling is a thing lights do while they come on, not
 *  something they do forever, and a skyline that never stops guttering reads as
 *  a fault rather than as atmosphere — "it doesn't stay lit".
 *
 *  So the amplitude rides on how far from settled the ramp is: full flicker in
 *  the dark, none at all once the level reaches 1. `phase` offsets each building
 *  so they don't all shimmer in step. */
function flicker(level: number, t: number, phase: number, reduced: boolean) {
  if (reduced) return 1;
  const amp = 0.18 * (1 - level);
  return 1 - amp + amp * Math.sin(t * 26 + phase) * Math.sin(t * 6.3);
}

/* ---------- where the outlying pieces stand ----------
 *  Hoisted out of CityRig because the outskirts have to keep clear of all three,
 *  and a fringe that read its neighbours' places off a dev scrubber would
 *  reshuffle itself every time one was dragged. These are the seeds; usePlacement
 *  still moves the mill and the park themselves in dev. */
const MILL_POS: V3 = [-1.2, 0, -0.06];
const PARK_POS: V3 = [1.3, 0, -0.23];

/** The skyline answers to the tower and nothing else. It is the city layer's own
 *  project, and the windmill and the park are their own objects standing in the
 *  city rather than switches for it. */
const TOWER = 'alliander-hololens';

function WindowDriver({ mat }: { mat: MeshStandardMaterial }) {
  // Open the tower and the city stays lit for the rest of the visit. `visited`
  // is the latch — the store appends to it and never clears it — and `selected`
  // is only here so the ramp starts on the same frame as the click rather than
  // waiting on the route effect. Nothing else feeds this: no hover, because the
  // lights were then the one thing on the layer that could go back OUT, and no
  // `completedAt`, because visiting all ten includes the tower anyway.
  const lit = useSceneSelector((s) => s.selectedSlug === TOWER || s.visited.includes(TOWER));
  const reduced = useReducedMotion();
  // Seeded from the latch, so a remount while the city is lit comes back lit
  // instead of replaying the come-on from dark.
  const k = useRef(cityLatched ? 1 : 0);
  useFrame((s, delta) => {
    if (lit) cityLatched = true;
    // One direction only. There is no target to lerp toward and no path back to
    // zero: once the tower has been opened the level climbs to 1 over
    // ON_SECONDS and stays there for the rest of the visit, whatever `lit`,
    // presence or the route do afterwards.
    if (cityLatched) k.current = reduced ? 1 : Math.min(1, k.current + delta / ON_SECONDS);
    cityLevel.k = k.current;
    const t = s.clock.elapsedTime;
    mat.emissiveIntensity = k.current * 1.1 * flicker(k.current, t, 0, reduced);
    mat.opacity = 0.08 + k.current * 0.6;
  });
  return null;
}

/* ---------- the blocks ---------- */
/** A block's own slice of the city-wide ramp — its beat in the wave that travels
 *  outward from the tower (`delay` is its distance from it). */
function staggered(level: number, delay: number) {
  const raw = (level - delay * WIN_STAGGER) / (1 - WIN_STAGGER);
  return raw <= 0 ? 0 : raw >= 1 ? 1 : raw;
}

// Fetch the model with the tower's, as soon as the scene's code arrives.
// A failure here is retried and reported by useBlocksKit.
loadBlocksKit().catch(() => {});

/** One of the six blocks round the tower, from its Blender model
 *  (scripts/models/build_blocks.py, shipped as public/models/blocks.glb): a
 *  podium with a door on the street side, the shaft with its punched four-bay
 *  grid and a sill under every pane, a cornice, and a setback crown or a plant
 *  room on the roof. The massing is glass and carries the outline; cornices,
 *  sills, canopy and plant room are a pale cut with none, since at this scale
 *  more linework stops describing a silhouette and starts obscuring it. */
function Building({ i, kit, x, z, w, d, winMat, delay = 0 }: { i: number; kit: BlocksKit; x: number; z: number; w: number; d: number; winMat: MeshStandardMaterial; delay?: number }) {
  const parts = useMemo(() => {
    const body = kit[`block${i}_body`]!;
    // The panes lie UNDER the glass. Once woken the glass is 94% opaque, and the
    // city's lit windows have always been the glow coming through it rather
    // than a sticker on its face — three sorts transparent meshes back to front
    // by the centres of their bounds, and the old window grid's fell just behind
    // its shaft's. Here that's certain rather than lucky: the panes take the
    // body's own bounds, so the two tie, and a tie goes to the mesh made first,
    // which is the panes (first in the JSX below).
    const windows = kit[`block${i}_windows`]!.clone();
    windows.boundingSphere = body.boundingSphere!.clone();
    return { body, trim: kit[`block${i}_trim`]!, windows };
  }, [kit, i]);
  useEffect(() => () => parts.windows.dispose(), [parts]);
  /* Each building's lights are its own, via its own clone of the window material:
     they come on when the grid's power reaches it (POWER, PowerGrid), not with
     the rest of the skyline. Dark, the panes draw under the glass (see `parts`
     above); lit, they draw after it, so they shine from the wall's face like
     the occupied windows (OccupiedWindows) rather than glowing faintly through
     the glass. The glass writes depth once the city is awake, so the far wall's
     panes stay hidden behind it.
     Not per pane: every window in a building shares one material, so the only
     per-pane handle is its size — and easing that made the panes visibly grow,
     which is not what a light does. Per building costs six materials and leaves
     the panes exactly as they are, dark grid and all, at rest. */
  // As power arrives the floors light from the ground up (uReveal, in the
  // block's own height) with a bright line riding up the facade ahead of them
  // (uLine, uEdge); a later pulse sends just the line up the lit windows.
  const reveal = useMemo(() => ({ uReveal: { value: 10 }, uLine: { value: -1 }, uEdge: { value: 0 } }), []);
  const mat = useMemo(() => {
    const m = winMat.clone();
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, reveal);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vH;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = position.y;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vH;\nuniform float uReveal;\nuniform float uLine;\nuniform float uEdge;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
  float below = 1.0 - smoothstep(uReveal - 0.004, uReveal + 0.004, vH);
  totalEmissiveRadiance *= below;
  diffuseColor.a *= mix(0.12, 1.0, below);
  totalEmissiveRadiance += vec3(0.8, 1.0, 1.0) * uEdge * exp(-pow((vH - uLine) / 0.014, 2.0));`,
        );
    };
    return m;
  }, [winMat, reveal]);
  const tint = useMemo(() => mat.emissive.clone(), [mat]);
  const height = useMemo(() => {
    parts.windows.computeBoundingBox();
    const b = parts.windows.boundingBox!;
    return [b.min.y - 0.02, b.max.y + 0.02];
  }, [parts]);
  const panes = useRef<Mesh>(null);
  const group = useRef<Group>(null);
  const reduced = useReducedMotion();
  useEffect(() => () => mat.dispose(), [mat]);
  // The body, its outline and its trim ride the city's staggered ramp, so a
  // block turns solid on its own beat as the city wakes rather than the whole
  // skyline hardening at once. Written every frame, read by LiveGlassMat/LiveEdges.
  const wake = useRef(0);
  useFrame((s) => {
    wake.current = staggered(cityLevel.k, delay);
    // its lights: up over LIGHT_ON once power has reached it, flickering as they
    // settle, and a little brighter for a moment each time power arrives again
    const now = s.clock.elapsedTime;
    const first = POWER.first[i] ?? -1;
    const on = first >= 0 && now >= first ? (reduced ? 1 : Math.min(1, (now - first) / LIGHT_ON)) : 0;
    const last = POWER.last[i] ?? -1;
    const after = now - last;
    const struck = last >= 0 && after >= 0 && !reduced;
    const lift = struck ? Math.exp(-after * 2.5) : 0;
    // the floors, ground to roof, and the line riding up ahead of them
    const [lo, hi] = height;
    const sweep = easeOut(after / LIGHT_ON);
    reveal.uReveal.value = struck && Math.abs(first - last) < 1e-6 && after < LIGHT_ON ? lo + (hi - lo) * sweep : 10;
    reveal.uLine.value = lo + (hi - lo) * sweep;
    reveal.uEdge.value = struck && after < LIGHT_ON * 1.5 ? 2 * (1 - after / (LIGHT_ON * 1.5)) : 0;
    // a white-cyan flash as it's switched on, settling to the windows' glow
    mat.emissive.copy(tint).lerp(WHITE, lift * 0.55);
    mat.emissiveIntensity = on * WIN_LIT * flicker(on, now, delay * 9, reduced) + lift * WIN_FLASH;
    mat.opacity = Math.min(0.95, 0.08 + on * 0.8 + lift * 0.3);
    if (panes.current) panes.current.renderOrder = on > 0 || lift > 0.01 ? 1 : 0;
    // and a jolt: up, and ringing back down
    const jolt = struck ? 0.018 * ring(after, 4, 6) : 0;
    group.current?.scale.set(1 - jolt * 0.4, 1 + jolt, 1 - jolt * 0.4);
  });
  return (
    <group ref={group} position={[x, 0, z]}>
      <BlobShadow position={[0, 0.004, 0]} radius={Math.max(w, d) * 0.95} opacity={0.4} />
      <mesh ref={panes} geometry={parts.windows} material={mat} />
      <mesh geometry={parts.body}>
        {/* ghost={false}: a building is dressing, not a hotspot ghost, so it rests
            as its own quiet glass and only hardens as the city comes live — then
            it reads solid, like the windmill does once woken. */}
        <LiveGlassMat slug="alliander-hololens" ghost={false} wake={wake} />
        <LiveEdges slug="alliander-hololens" threshold={35} wake={wake} />
      </mesh>
      <mesh geometry={parts.trim}>
        <LiveGlassMat slug="alliander-hololens" ghost={false} tint="pale" wake={wake} />
      </mesh>
    </group>
  );
}

/** The low fringe between the city grid and its neighbours.
 *
 *  The grid stops at ±0.9 and the ground was simply empty from there to the
 *  windmill, the park and the launch site — so those three read as separate
 *  models parked on a shared floor rather than as the edges of one town. This
 *  fills that gap the way a real outskirt does: low buildings on jittered rings,
 *  shorter and sparser the further out they sit, stopping short of every
 *  neighbour's own ground so each still has its clearing.
 *
 *  ABSENT UNTIL THE CITY IS WOKEN. Standing there at rest they were another
 *  dozen glass boxes behind an already-busy skyline of glass boxes, and the
 *  silhouette that has to carry the hero shot is the seven towers, not the
 *  scenery behind them. Arriving on the tail of the tower's ramp they do the
 *  same job with none of that cost, and they read better for it: the wave that
 *  travels out from the tower now visibly extends the town rather than just
 *  hardening what was already drawn.
 *
 *  Two draw calls, both idle while hidden. The bodies ride one instanced box and
 *  the contact pools one instanced disc; there is no wireframe, because a fringe
 *  that only ever appears already-lit never passes through the sketch stage the
 *  outlines exist to draw. */
const FRINGE_SEED = 5501;
/** Angular span of the fringe: the back half plus both flanks. The front is left
 *  clear — the curved road, the hero copy and the room layer showing through the
 *  floor all live down there, and a row of rooftops in that band just crowds it. */
const FRINGE_A0 = Math.PI * 0.86;
const FRINGE_A1 = Math.PI * 2.14;

/** Shortest distance from (x,z) to a polyline in the ground plane. */
function distToPath(x: number, z: number, path: V3[]) {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const vx = b[0] - a[0];
    const vz = b[2] - a[2];
    const len2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[2]) * vz) / len2));
    best = Math.min(best, Math.hypot(x - (a[0] + vx * t), z - (a[2] + vz * t)));
  }
  return best;
}

function Outskirts({ clear, blocks }: { clear: V3[][]; blocks: { x: number; z: number; w: number; d: number }[] }) {
  const bodies = useRef<InstancedMesh>(null);
  const shadows = useRef<InstancedMesh>(null);
  const shadowTex = useMemo(blobShadowTexture, []);
  const plots = useMemo(() => {
    const rnd = makeRand(FRINGE_SEED);
    const out: { x: number; z: number; w: number; d: number; h: number; yaw: number }[] = [];
    // Everything the fringe has to keep off: each neighbour's own ground, the
    // tower's plaza, the transformer's plot, and the city blocks themselves.
    const keepOut: [number, number, number][] = [
      [0, 0, 0.34], // the tower's plaza
      [0, 0.55, 0.2], // the transformer house
      [MILL_POS[0], MILL_POS[2], 0.44], // the mill's mound, with room to breathe
      [PARK_POS[0], PARK_POS[2], 0.6], // the park disc + its outermost trees
      [SITE_POS[0], SITE_POS[2], 0.32], // the launch apron and its clearance
    ];
    for (let ring = 0; ring < 3; ring++) {
      const r0 = 0.95 + ring * 0.25;
      // Candidates, not plots: the mill, the park and the pad each claim a wide
      // berth and most of a ring's arc lands inside one of them, so roughly half
      // of these are rejected below. Kept deliberately thin — the fringe is here
      // to carry the density outward, and past about a dozen plots it stops
      // reading as an edge and starts reading as clutter behind the skyline.
      const n = 12 - ring * 4; // sparser the further out
      for (let i = 0; i < n; i++) {
        const a = FRINGE_A0 + ((i + 0.5) / n) * (FRINGE_A1 - FRINGE_A0) + (rnd() - 0.5) * 0.2;
        const r = r0 + (rnd() - 0.5) * 0.2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        // Wide and low, deliberately: at the first attempt these were roughly
        // cubic and up to 0.2 tall, and from the hero's viewpoint — where the
        // fringe sits BEHIND the skyline and so projects higher up the frame —
        // they read as small towers floating between the real ones. Footprints
        // wider than they are tall are what make a low-rise fringe read as
        // ground rather than as more skyline.
        const w = 0.1 + rnd() * 0.1;
        const d = 0.08 + rnd() * 0.07;
        // Heights fall away from the centre — the skyline has to taper into the
        // landscape, not end in a wall. The inner ring is the step down from a
        // 0.5-tall block; by the outer one they're barely more than footprints.
        const h = Math.max(0.03, 0.095 - ring * 0.027) * (0.72 + rnd() * 0.56);
        if (keepOut.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr)) continue;
        if (blocks.some((b) => Math.abs(x - b.x) < b.w / 2 + w / 2 + 0.03 && Math.abs(z - b.z) < b.d / 2 + d / 2 + 0.03)) continue;
        if (clear.some((path) => distToPath(x, z, path) < 0.075 + Math.max(w, d) / 2)) continue;
        out.push({ x, z, w, d, h, yaw: (rnd() - 0.5) * 0.5 });
      }
    }
    return out;
  }, [clear, blocks]);

  useLayoutEffect(() => {
    const im = bodies.current;
    const sh = shadows.current;
    if (!im || !sh || plots.length === 0) return;
    const mtx = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    const p = new Vector3();
    const s = new Vector3();
    plots.forEach((b, i) => {
      p.set(b.x, b.h / 2, b.z);
      q.setFromEuler(e.set(0, b.yaw, 0));
      s.set(b.w, b.h, b.d);
      im.setMatrixAt(i, mtx.compose(p, q, s));
      // …and its contact pool, laid flat on the floor. Without these the fringe
      // hovered: a low translucent box seen from far off has no other cue that
      // it's standing on anything.
      p.set(b.x, 0.004, b.z);
      q.setFromEuler(e.set(-Math.PI / 2, 0, b.yaw));
      s.set(b.w * 1.15, b.d * 1.15, 1);
      sh.setMatrixAt(i, mtx.compose(p, q, s));
    });
    im.instanceMatrix.needsUpdate = true;
    sh.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    sh.computeBoundingSphere();
  }, [plots]);

  // The fringe arrives on the tail of the city's ramp — the wave of lights and
  // solidifying glass travels outward from the tower, and this is where it ends.
  const group = useRef<Group>(null);
  const wake = useRef(0);
  const shadowMat = useRef<MeshBasicMaterial>(null);
  const presence = useContext(PresenceCtx);
  useFrame(() => {
    wake.current = staggered(cityLevel.k, 1); // delay 1: the outermost beat
    // Hidden outright below the threshold rather than merely transparent, so a
    // resting city pays nothing at all for scenery it isn't showing — and so the
    // fringe can't fog the towers behind it while it's meant to be absent.
    if (group.current) group.current.visible = wake.current > 0.01;
    // The pools come up with the bodies; a contact shadow arriving before the
    // thing casting it reads as a stain on the floor.
    if (shadowMat.current) shadowMat.current.opacity = 0.34 * wake.current * presence.current;
  });
  if (plots.length === 0) return null;
  return (
    <group ref={group} visible={false}>
      <instancedMesh ref={shadows} args={[undefined, undefined, plots.length]} renderOrder={-1}>
        <circleGeometry args={[1, 20]} />
        <meshBasicMaterial ref={shadowMat} userData={{ lifeSkip: true, presenceOwn: true }} map={shadowTex} transparent opacity={0} depthWrite={false} />
      </instancedMesh>
      {/* opacity={0} at rest: with ghost={false} that's LiveGlassMat's floor, so
          the boxes ramp from nothing to solid instead of fading up from a ghost
          — they're arriving, not waking. */}
      <instancedMesh ref={bodies} args={[undefined, undefined, plots.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <LiveGlassMat slug="alliander-hololens" ghost={false} opacity={SURFACE_ABSENT} wake={wake} />
      </instancedMesh>
    </group>
  );
}

/* ---------- the windmill ---------- */
/** Where the mill's sails turn, mill-local, as HUB in
 *  scripts/models/build_mill.py has it: the hub's height and how far in front
 *  of the smock it stands, and the windshaft's tilt (up at the front, as a
 *  real one's is). */
const MILL_HUB = { y: 0.7, z: 0.265, tilt: 0.12 };
/* In the mill's close-up the cursor is the wind: the cap (and the sails on it)
   turns slowly round into the wind blowing from where the cursor is, as a mill
   is turned into the wind, and moving the mouse past it is a gust that spins
   the sails up; they coast down again when it stops. The wind comes from
   WIND_FROM out in front of the cursor, toward you, so the cap swings round
   steadily as the cursor crosses the mill rather than flipping sides at its
   middle. The cap is heavy: it swings a little past the wind and settles back
   (WIND_SWING). A gust kicks the sails up a little past its speed (GUST_KICK),
   flaps their cloth (FLUTTER) and blows streaks in past them (GUST_STREAKS). */
const WIND_TURN = 1.0; // how far the cap will turn either way (rad)
const WIND_SWING = { freq: 0.55, damping: 0.42 }; // the cap's springy turn (see wobble)
const WIND_FROM = 0.8; // how far out toward you the wind blows from, past the cursor (mill units)
const GUST = 2.6; // spin per unit of cursor travel (screen halves), rad/s
const GUST_MAX = 8; // rad/s
const GUST_FADE = 2.2; // s for a gust to die down: the sails coast
const GUST_KICK = { freq: 1.1, damping: 0.45 }; // the sails taking a gust up (see wobble)
const PUFF_FADE = 0.4; // s for the wind itself to drop once the cursor stops (the cloth, the streaks)
const FLUTTER = 3; // the wind (as GUST) at which the cloth flaps its most
/** The gust's streaks: how many at once at most, each one's life (s), how
 *  many a second per rad/s of gust, and where they start, out along the wind
 *  from the mill (mill units). */
const GUST_STREAKS = { count: 12, life: 0.5, rate: 3.5, from: 0.75 };
/* The mill at work, and the game in its close-up. Left to itself the mill
   turns slowly (SPIN_REST), as a working mill in a light breeze does. Blow on
   it hard enough, moving the cursor and keeping it moving, and the sails spin
   up past POWER_FROM: then they make power, more the faster they turn, and it
   runs along a cable under the road to the tower in the middle (MillLine). The
   tower fills with it, its light-band rising with the charge; let the sails
   slow and it drains back. Once it's full the tower is powered for the visit
   (Skyscraper reads MILL). */
const SPIN_REST = 0.15; // rad/s, the sails left to themselves
const POWER_FROM = 2.4; // rad/s the sails have to beat to make power…
const POWER_RATE = 0.065; // …and the tower's charge a second for every rad/s over it (full in about 5 s of hard blowing)
const POWER_DRAIN = 0.05; // the charge a second it loses while they aren't making any (until it's full)
/** What the mill sends the tower, written by Windmill each frame: how hard
 *  power is flowing down the cable (0–1), how full the tower is (0–1), and when
 *  it was first full (the clock's s; -1 not yet), after which it stays powered. */
const MILL = { flow: 0, charge: 0, poweredAt: -1 };
/** The mill's wind, written by Windmill each frame: the cap's yaw, where the
 *  wind blows from, the gust the sails feel (`strength`, slow to die, and
 *  `gust`, the sails' extra turn) and the wind itself (`puff`, gone as soon
 *  as the cursor stops), plus the cursor's last spot. */
type MillWindState = { yaw: number; toward: number; blowing: boolean; strength: number; gust: number; puff: number; px: number; py: number; read: boolean };

// Fetch the model with the tower's, as soon as the scene's code arrives.
// A failure here is retried and reported by useMillKit.
loadMillKit().catch(() => {});

// The breeze that drives the mill, made visible — faint holographic wind streaks
// flowing across the sails while it's turning. Thin accent-tinted dashes drift
// past the front face, brightening mid-pass and fading at the ends, each on its
// own line and speed; only while engaged (off under reduced motion).
function MillWind() {
  const reduced = useReducedMotion();
  const { accent } = useAccent();
  const { hovered, selected, visited } = useActive('dtt-amsterdam');
  const windCol = useMemo(() => new Color(accent).lerp(new Color('#ffffff'), 0.5), [accent]);
  const refs = useRef<(Mesh | null)[]>([]);
  const glow = useRef(0);
  const streaks = useMemo(() => {
    const rnd = makeRand(915);
    return Array.from({ length: 7 }, () => ({
      y: MILL_HUB.y - 0.2 + rnd() * 0.4, // spread over the sail span
      z: MILL_HUB.z + 0.06 + rnd() * 0.1, // just in front of the sails
      ph: rnd(),
      spd: 0.2 + rnd() * 0.16, // a gentle drift, each its own pace
      slope: (rnd() - 0.5) * 0.14, // a slight rise/fall across the pass
      len: 0.7 + rnd() * 0.9, // streak length (× the base dash)
    }));
  }, []);
  useFrame((s) => {
    glow.current += (((hovered || selected || visited) && !reduced ? 1 : 0) - glow.current) * FX.engage;
    const t = s.clock.elapsedTime;
    for (let i = 0; i < streaks.length; i++) {
      const m = refs.current[i];
      const d = streaks[i];
      if (!m) continue;
      const p = (t * d.spd + d.ph) % 1; // 0 at the left → 1 off the right
      m.position.set(-0.42 + p * 0.84, d.y + (p - 0.5) * d.slope, d.z);
      (m.material as MeshStandardMaterial).opacity = fxEnv(p) * FX.peak * glow.current;
    }
  });
  return (
    <group>
      {streaks.map((d, i) => (
        <mesh key={i} ref={(r) => (refs.current[i] = r)} scale={[d.len, 1, 1]}>
          <boxGeometry args={[0.07, 0.004, 0.004]} />
          <meshStandardMaterial color={windCol} emissive={windCol} emissiveIntensity={1.4} transparent opacity={0} toneMapped={false} depthWrite={false} blending={AdditiveBlending} userData={{ lifeSkip: true }} />
        </mesh>
      ))}
    </group>
  );
}

/** A gust made visible: while you blow on the mill, quick thin streaks run in
 *  from where the wind comes from and on past the sails, more of them the
 *  harder it blows (GUST_STREAKS), and none once it drops. Each keeps the way
 *  the wind blew when it set off. Reads the mill's wind (a frame late, which
 *  nobody sees). */
function GustStreaks({ wind }: { wind: { current: MillWindState } }) {
  const { accent } = useAccent();
  const reduced = useReducedMotion();
  const color = useMemo(() => new Color(accent).lerp(WHITE, 0.5), [accent]);
  const ref = useRef<InstancedMesh>(null);
  const geo = useMemo(() => new BoxGeometry(0.0035, 0.0035, 0.12), []);
  const mat = useMemo(() => new MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  const pool = useMemo(() => Array.from({ length: GUST_STREAKS.count }, () => ({ born: -99, dir: 0, y: 0, side: 0, from: 0, speed: 0, len: 1, k: 0 })), []);
  const spawn = useRef({ owed: 0, next: 0 });
  const rnd = useMemo(() => makeRand(4721), []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    _c.setRGB(0, 0, 0);
    for (let i = 0; i < GUST_STREAKS.count; i++) m.setColorAt(i, _c);
    m.visible = false;
  }, []);
  useFrame((s, delta) => {
    const m = ref.current;
    if (!m) return;
    const w = wind.current;
    const t = s.clock.elapsedTime;
    const sp = spawn.current;
    if (!reduced && w.blowing) {
      sp.owed += Math.min(delta, 1 / 30) * GUST_STREAKS.rate * w.puff;
      for (; sp.owed >= 1; sp.owed--) {
        const p = pool[sp.next];
        sp.next = (sp.next + 1) % pool.length;
        p.born = t;
        p.dir = w.toward;
        p.y = MILL_HUB.y + (rnd() - 0.5) * 0.55;
        p.side = (rnd() - 0.5) * 0.7;
        p.from = GUST_STREAKS.from + rnd() * 0.25;
        p.speed = 1.2 + rnd() * 0.5;
        p.len = 0.7 + rnd() * 0.7;
        p.k = Math.min(1, 0.35 + w.puff / 3);
      }
    } else sp.owed = 0;
    let any = false;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      const age = t - p.born;
      const u = age / GUST_STREAKS.life;
      if (u < 0 || u >= 1) {
        _c.setRGB(0, 0, 0);
        m.setColorAt(i, _c);
        continue;
      }
      any = true;
      // along the wind's way in, toward the mill and on past the sails
      const along = p.from - p.speed * age;
      const sx = Math.sin(p.dir);
      const cz = Math.cos(p.dir);
      _v.set(sx * along + cz * p.side, p.y, cz * along - sx * p.side);
      _q.setFromEuler(_e.set(0, p.dir, 0));
      // drawn out as it gets going
      _s.set(1, 1, p.len * (0.4 + 0.6 * easeOut(u * 3)));
      m.setMatrixAt(i, _m.compose(_v, _q, _s));
      m.setColorAt(i, _c.copy(color).multiplyScalar(bump(u) * p.k));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.visible = any;
  });
  return <instancedMesh ref={ref} args={[geo, mat, GUST_STREAKS.count]} frustumCulled={false} renderOrder={2} />;
}

/** A Dutch stage mill (stellingmolen), from its Blender model
 *  (scripts/models/build_mill.py, shipped as public/models/mill.glb): an
 *  eight-sided thatched smock on a brick base, a stage round the base's top,
 *  and a boat-shaped cap carrying the sails. At rest the sails stand bare,
 *  their cloth furled along the whips, as a mill does when it isn't working.
 *  Hovering its hotspot (DTT Amsterdam) sets the cloth across the ladders
 *  first, and the sails turn slowly as it fills; once it's been opened they
 *  keep turning. The body solidifies once visited, and its windows light. */
function Windmill({ position, slug, kit }: { position: V3; slug: string; kit: MillKit }) {
  const sails = useRef<Group>(null);
  const cloths = useRef<(Mesh | null)[]>([]);
  const windows = useRef<MeshStandardMaterial>(null);
  const reduced = useReducedMotion();
  const { accent } = useAccent();
  const accentC = useMemo(() => new Color(accent), [accent]);
  const { hovered, selected, visited } = useActive(slug);
  const set = useRef(0); // the cloth: 0 furled along the whips → 1 set across the ladders
  const spin = useRef(0);
  const life = useRef(0);
  // the wind from the cursor (see WIND_*, GUST*)
  const close = useCloseUp(slug);
  const root = useRef<Group>(null);
  const cap = useRef<Group>(null);
  const wind = useRef<MillWindState>({ yaw: 0, toward: 0, blowing: false, strength: 0, gust: 0, puff: 0, px: 0, py: 0, read: false });
  const windVel = useRef({ v: 0 });
  const gustVel = useRef({ v: 0 });
  const ray = useMemo(() => new Ray(), []);
  const from = useMemo(() => new Vector3(), []);
  const pointer = useMemo(() => new Vector2(), []);
  const hub = useMemo(() => new Vector3(0, MILL_HUB.y, 0), []);
  useFrame((s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const w = wind.current;
    // where the wind blows from: the cursor's spot at the hub's depth, carried
    // out toward you by WIND_FROM (the ray's way back)
    const blowing = close && !!root.current && !!cursorRay(s, root.current, ray) && !!cursorAtDepth(s, root.current, hub, from);
    if (blowing) from.addScaledVector(ray.direction, -WIND_FROM);
    const toward = blowing ? Math.max(-WIND_TURN, Math.min(WIND_TURN, Math.atan2(from.x, from.z))) : 0;
    w.toward = toward;
    w.blowing = blowing;
    // the heavy cap swings round, a little past the wind, and settles back
    w.yaw = reduced ? 0 : wobble(w.yaw, toward, windVel.current, dt, WIND_SWING.freq, WIND_SWING.damping);
    if (cap.current) cap.current.rotation.y = w.yaw;
    // a gust: the cursor's travel since the last frame (from the second frame
    // it's blowing on, so coming back onto the model isn't itself a gust) feeds
    // the wind's strength, which dies down over GUST_FADE; the sails kick up a
    // little past it and coast down with it
    const at = blowing ? cursorNdc(s.size, pointer) : null;
    const travel = at && w.read ? Math.hypot(at.x - w.px, at.y - w.py) : 0;
    if (at) {
      w.px = at.x;
      w.py = at.y;
    }
    w.read = !!at;
    w.strength = Math.min(GUST_MAX, w.strength * Math.exp(-dt / GUST_FADE) + travel * GUST);
    w.puff = Math.min(GUST_MAX, w.puff * Math.exp(-dt / PUFF_FADE) + travel * GUST);
    w.gust = wobble(w.gust, w.strength, gustVel.current, dt, GUST_KICK.freq, GUST_KICK.damping);
    if (w.gust < 0) {
      // never turned backwards
      w.gust = 0;
      gustVel.current.v = Math.max(0, gustVel.current.v);
    }
    const engaged = hovered || selected || visited;
    set.current += ((engaged ? 1 : 0) - set.current) * (reduced ? 1 : 0.05);
    // the sails only take the wind as their cloth fills
    const filled = Math.min(1, Math.max(0, (set.current - 0.45) / 0.45));
    spin.current += ((engaged ? SPIN_REST * filled : 0) - spin.current) * 0.04;
    const speed = spin.current + w.gust; // rad/s
    if (sails.current && !reduced) sails.current.rotation.z += Math.min(delta, 0.1) * speed;
    // the power it makes, spun up past POWER_FROM (see MILL)
    const making = close ? Math.max(0, speed - POWER_FROM) : 0;
    MILL.flow += ((making > 0 ? Math.min(1, 0.35 + making / 4) : 0) - MILL.flow) * (1 - Math.exp(-dt * 3));
    if (MILL.poweredAt < 0) {
      MILL.charge = Math.max(0, Math.min(1, MILL.charge + (making > 0 ? making * POWER_RATE : -POWER_DRAIN) * dt));
      if (MILL.charge >= 1) {
        MILL.poweredAt = s.clock.elapsedTime;
        play('mill-power', { volume: 0.6 });
      }
    }
    // the cloth, once set, flaps while the wind blows: it swings off its whip
    // (the free edge in and out) on two rhythms, so it doesn't tick like a clock
    const flap = reduced ? 0 : Math.min(1, w.puff / FLUTTER) * set.current;
    const t = s.clock.elapsedTime;
    cloths.current.forEach((c, k) => {
      if (!c) return;
      c.scale.x = (0.07 + 0.93 * set.current) * (1 + 0.04 * flap * Math.sin(t * 23 + k * 1.7));
      c.rotation.y = 0.12 * flap * (Math.sin(t * 17 + k * 2.3) + 0.4 * Math.sin(t * 31 + k * 1.1));
    });
    // the windows light with the mill's life, from the ghost's grey
    life.current += ((selected || visited ? 1 : 0) - life.current) * 0.06;
    const m = windows.current;
    if (m) {
      m.color.copy(GHOST_FILL).lerp(accentC, life.current);
      m.emissive.copy(GHOST_FILL).lerp(accentC, life.current);
      m.emissiveIntensity = 0.05 + life.current * 0.8;
    }
  });
  return (
    <group ref={root} position={position}>
      <BlobShadow position={[0, 0.004, 0]} radius={0.42} opacity={0.38} />
      {/* Every part of the mill uses LiveGlassMat, not GlassMat: waking the
          windmill has to solidify all of it, or the silhouette still reads as a
          wireframe while every other hotspot comes alive properly. The outlines
          are the body's, the cap's and each sail's; the stage, its railing and
          the sails' ladders are the pale cut with none, so at rest the mill is
          as sparse a drawing as the blocks round it. */}
      {/* the paved yard is GROUND, like the park's plot: the same unlit film as
          the roads that reach it. As a deep glass disc it caught the fresnel
          rim all the way round and drew a bright ellipse at the mill's foot. */}
      <mesh geometry={kit.mill_ground}>
        <GroundMat />
        <ShadowPrint />
      </mesh>
      <mesh geometry={kit.mill_body}>
        <LiveGlassMat slug={slug} />
        <LiveEdges slug={slug} threshold={35} />
      </mesh>
      <mesh geometry={kit.mill_trim}>
        <LiveGlassMat slug={slug} tint="pale" />
      </mesh>
      <mesh geometry={kit.mill_windows}>
        <meshStandardMaterial ref={windows} userData={{ lifeSkip: true }} color={accent} emissive={accent} emissiveIntensity={0.05} roughness={0.4} toneMapped={false} />
      </mesh>
      {/* the cap, the beard board under its nose and the sails it carries turn
          together, into the wind */}
      <group ref={cap}>
        <mesh geometry={kit.mill_cap}>
          <LiveGlassMat slug={slug} tint="pale" />
          <LiveEdges slug={slug} threshold={35} />
        </mesh>
        <mesh geometry={kit.mill_beard}>
          <LiveGlassMat slug={slug} tint="pale" />
        </mesh>
        <group position={[0, MILL_HUB.y, MILL_HUB.z]} rotation={[-MILL_HUB.tilt, 0, 0]}>
          <group ref={sails}>
            <mesh geometry={kit.mill_sails}>
              <LiveGlassMat slug={slug} tint="pale" />
            </mesh>
            {[0, 1, 2, 3].map((k) => (
              <group key={k} rotation={[0, 0, (k * Math.PI) / 2]}>
                {/* Each sail's one outline is its cloth's, with a dimmer idle cap
                    than the body's: four long thin shapes standing alone against
                    open sky read as a bold cross of lines at full brightness,
                    much more attention-grabbing than the same outline wrapping a
                    bulky building. Translucent once set, so the ladder shows. */}
                <mesh ref={(r) => (cloths.current[k] = r)} geometry={kit.mill_cloth} scale={[0.07, 1, 1]}>
                  <LiveGlassMat slug={slug} tint="pale" solid={0.55} />
                  <LiveEdges slug={slug} threshold={35} rest={0.4} />
                </mesh>
              </group>
            ))}
          </group>
        </group>
      </group>
      <MillWind />
      <GustStreaks wind={wind} />
    </group>
  );
}

/** A stylised pine — three stacked faceted tiers over a short trunk stub (the
 *  stub ends below the lowest tier's skirt, so nothing shows through the
 *  leaves). Each tier is a skirted cone, a concave top that droops to its rim
 *  over a shallow underside, so it has a thickness; plain cones read as a
 *  stack of party hats. Neutral glass at rest, like the rest of the
 *  furniture; visiting the park breathes a quiet sea-green into the foliage —
 *  a hint of life, not a lawn-ornament green. */
const PINE_TIERS: [number, number, number][] = [
  // y centre, radius, height — fractions of the tree height
  [0.3, 0.36, 0.44],
  [0.55, 0.27, 0.36],
  [0.78, 0.18, 0.3],
];
function ParkTree({ position, h = 0.45, yaw = 0, slug, lit }: { position: V3; h?: number; yaw?: number; slug?: string; lit: LitLink }) {
  const { selected, visited } = useActive(slug ?? '');
  const live = useRef(0);
  // At rest a pine has to read as the same drawing as everything else on this
  // layer. It didn't: the buildings are 0.30 glass WITH a wireframe outline,
  // while these were 0.40 flat-shaded cones with no outline at all — and
  // `lifeSkip` meant LifeGroup never ghosted them either, so the grove sat there
  // looking switched on while the city around it was still a sketch. That one
  // corner was carrying more visual weight than the tower.
  // Foliage is the dense cut, and it takes that cut's opacity with it — a tree
  // canopy is a thick piece of the stock, not a thin one tinted darker.
  const TREE_REST = SURFACE.deep.rest;
  const restCol = useMemo(() => new Color(SURFACE.deep.color), []); // foliage recedes — it is the deep cut of the stock
  const vivid = useMemo(() => new Color(SURFACE.pale.color), []); // …and comes forward as it wakes, by value, not by hue
  const mat = useMemo(() => {
    const m = new MeshStandardMaterial({ color: SURFACE.deep.color, roughness: 0.7, metalness: 0, transparent: true, opacity: TREE_REST });
    m.userData.lifeSkip = true; // greens up itself once visited
    // …and lights with the park while its hotspot is hovered (lit.tsx)
    Object.assign(m.userData, lit);
    m.onBeforeCompile = litShade;
    return m;
  }, [lit]);
  const body = useLitBody([mat]);
  // Every tier a little different in size, turn and tilt, seeded by where the
  // tree stands, so the grove stops being five copies of one tree.
  const tiers = useGeometry(() => {
    const rnd = makeRand(Math.round(Math.abs(position[0] * 9173 + position[2] * 7919)) + 3);
    const out: Record<string, BufferGeometry> = {};
    PINE_TIERS.forEach(([y, r, th], i) => {
      const R = h * r * (0.93 + rnd() * 0.14);
      const T = h * th * (0.93 + rnd() * 0.14);
      const prof: [number, number][] = [[0, 0.16 * T], [0.86 * R, 0.03 * T], [R, 0], [0.97 * R, 0.06 * T], [0.6 * R, 0.31 * T], [0.28 * R, 0.63 * T], [0, T]];
      out[i] = place(faceted(lathe(prof, 7)), [0, h * y - T / 2, 0], [(rnd() - 0.5) * 0.09, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.09]);
    });
    return out;
  }, [h, position[0], position[2]]);
  useFrame(() => {
    if (!slug) return;
    live.current += ((selected || visited ? 1 : 0) - live.current) * 0.06;
    mat.color.copy(restCol).lerp(vivid, live.current);
    mat.opacity = TREE_REST + live.current * 0.55; // the green + the body arrive together
    body(lit.litU.value, mat.opacity >= LIT_SOLID_OPACITY);
  });
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <mesh position={[0, h * 0.05, 0]}>
        <cylinderGeometry args={[h * 0.022, h * 0.03, h * 0.1, 6]} />
        <GlassMat tint="deep" lit={lit} />
      </mesh>
      {PINE_TIERS.map((_t, i) => (
        <mesh key={i} geometry={tiers[i]} material={mat}>
          {/* The wireframe every other object on this layer has at rest — but
              LiveEdges, not a plain <Edges>. A plain one was here once, and it
              was WRONG twice over: with no lifeSkip flag its material falls to
              LifeGroup's generic line treatment, which never drops opacity
              below half of its authored value even at full life — so selecting
              the park made the wireframe MORE visible, the opposite of retiring
              to the solid tree. LiveEdges owns its own material (flags
              lifeSkip) and fades it to nothing as `live` below rises.
              Held to less than a building's weight at rest: a grove of five
              trees is a lot of linework, and full strength made the park the
              busiest corner in frame. */}
          <LiveEdges slug={slug ?? ''} threshold={30} rest={0.42} />
        </mesh>
      ))}
    </group>
  );
}

/** Fireflies over the park — soft green sparks that wander and blink. A faint
 *  few while the park is dormant; visiting it brings them out properly. */
const FLY_COUNT = 9;
function Fireflies({ slug }: { slug?: string }) {
  const { accent } = useAccent();
  const { selected, visited } = useActive(slug ?? '');
  const reduced = useReducedMotion();
  const live = useRef(0);
  const flies = useRef<(Mesh | null)[]>([]);
  const seeds = useMemo(() => {
    const rand = makeRand(97);
    return Array.from({ length: FLY_COUNT }, () => ({
      x: (rand() - 0.5) * 0.8,
      z: (rand() - 0.5) * 0.8,
      y: 0.1 + rand() * 0.22,
      p: rand() * Math.PI * 2,
      s: 0.5 + rand() * 0.9,
    }));
  }, []);
  useFrame((st) => {
    live.current += ((selected || visited ? 1 : 0) - live.current) * 0.05;
    const t = st.clock.elapsedTime;
    seeds.forEach((sd, i) => {
      const m = flies.current[i];
      if (!m) return;
      if (reduced) {
        m.position.set(sd.x, sd.y, sd.z);
        m.scale.setScalar(0.6 * (0.25 + live.current * 0.75));
        return;
      }
      m.position.set(
        sd.x + Math.sin(t * 0.24 * sd.s + sd.p) * 0.07,
        sd.y + Math.sin(t * 0.5 * sd.s + sd.p * 2.1) * 0.035,
        sd.z + Math.cos(t * 0.31 * sd.s + sd.p) * 0.07,
      );
      const blink = Math.max(0, Math.sin(t * (1.1 + sd.s) + sd.p * 3));
      m.scale.setScalar(blink * (0.25 + live.current * 0.75));
    });
  });
  return (
    <group>
      {Array.from({ length: FLY_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            flies.current[i] = m;
          }}
        >
          <sphereGeometry args={[0.009, 8, 6]} />
          <meshBasicMaterial userData={{ lifeSkip: true }} color={accent} transparent opacity={0.85} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Two little ducks drifting lazy loops on the lake (lake-local coordinates).
 *  They ghost and solidify with the rest of the park. */
function LakeDucks({ lit }: { lit: LitLink }) {
  const reduced = useReducedMotion();
  const ducks = useRef<(Group | null)[]>([]);
  useFrame((st) => {
    const t = reduced ? 0 : st.clock.elapsedTime;
    for (let i = 0; i < 2; i++) {
      const g = ducks.current[i];
      if (!g) continue;
      const dir = i ? -1 : 1;
      const a = t * 0.14 * dir + i * 2.4;
      const rx = 0.095;
      const rz = 0.062;
      g.position.set(0.02 + Math.cos(a) * rx, 0.026, -0.015 + Math.sin(a) * rz);
      // point the beak along the direction of travel
      const vx = -Math.sin(a) * rx * dir;
      const vz = Math.cos(a) * rz * dir;
      g.rotation.y = Math.atan2(-vz, vx);
    }
  });
  return (
    <group>
      {[0, 1].map((i) => (
        <group
          key={i}
          ref={(g) => {
            ducks.current[i] = g;
          }}
        >
          <mesh scale={[1.3, 0.75, 1]}>
            <sphereGeometry args={[0.014, 10, 8]} />
            <GlassMat tint="pale" lit={lit} />
          </mesh>
          <mesh position={[0.014, 0.012, 0]}>
            <sphereGeometry args={[0.008, 8, 6]} />
            <GlassMat tint="pale" lit={lit} />
          </mesh>
          <mesh position={[0.024, 0.012, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.003, 0.008, 6]} />
            <GlassMat tint="glass" lit={lit} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Soft rounded box (furniture, the chip package). Optional top outline. With a
 *  `liveSlug` its glass solidifies once that hotspot is visited; furniture that
 *  shouldn't rest as a ghost also passes `liveGhost={false}`. */
/* ---------- City — GIS & location (top) ---------- */
/** An organic closed outline (a wobbly ring) for a natural lake shoreline. */
function blobPts(r: number, wobble: number, seg = 48, seed = 7): V3[] {
  const rnd = makeRand(seed);
  const k = 7;
  const offs = Array.from({ length: k }, () => 1 + (rnd() - 0.5) * wobble);
  const pts: V3[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const f = (a / (Math.PI * 2)) * k;
    const i0 = Math.floor(f) % k;
    const t = f - Math.floor(f);
    const rr = r * (offs[i0] * (1 - t) + offs[(i0 + 1) % k] * t);
    pts.push([Math.cos(a) * rr, 0, Math.sin(a) * rr]);
  }
  return pts;
}

/** The park's AR tower viewer — the ARCam installation, loaded from the real
 *  model at public/models/binoculars.gltf (single self-contained mesh). It's
 *  normalised at load — the same frosted glass as the buildings and windmill,
 *  stood on the ground, scaled to viewer height — and keeps the behaviour of
 *  the old build: hidden until the ARCam hotspot is selected, then pops in
 *  with a spring and pans left↔right scanning the scene. Taking a picture
 *  lights the viewfinder screen: a separate plane set into the model's hood. */
const BINOS_H = 0.22; // world height the model is normalised to
// The viewfinder, in the viewer's local space (feet at y=0, height BINOS_H). The
// head is a hood open to the back (+z, the side you'd look in from); measured
// off the model, the opening runs x −0.04…0.03, y 0.11…0.2, and its floor
// curves from z −0.004 at the edges to −0.016 at the deepest. The screen sits
// inside that, facing out of the hood, just clear of the floor everywhere, so
// nothing cuts through it: it shows as a display at the back of the hood
// rather than a slab sticking through the head.
const BINOS_SCREEN_POS: V3 = [-0.005, 0.155, -0.003];
const BINOS_SCREEN_SIZE: [number, number] = [0.056, 0.064];
// A simple post the viewer stands on — raise BINOS_STAND_H to lift it higher.
const BINOS_STAND_H = 0.14;
/* In the park's close-up the viewer aims where you point on the park, swinging
   on its post as if you were lining up a shot, and takes the picture (its
   viewfinder lights) once it has held a new spot for a moment. Let the cursor
   rest and it goes back to its own sweep. */
const AIM_REACH = 1.3; // how far it swings either way (rad)
const AIM_GLIDE = 0.3;
const AIM_SETTLE = 0.8; // s steady on a spot before it shoots
const AIM_NEW = 0.3; // how far from its last shot a spot has to be (rad)
/* A shot, aimed or on its sweep: the viewer steadies, its nose dipping a touch
   (dip, rad) for `hold` s, then fires: its nose kicks up (kick, rad) and rings
   down, a flash pops at the lenses (BINOS_LENS, `pop` s), and the viewfinder
   holds the picture bright for `held` s before it fades back (`fade`). */
const SHOT = { hold: 0.18, dip: -0.045, kick: 0.12, pop: 0.22, held: 0.35, fade: 0.22 };
const BINOS_LENS: V3 = [-0.005, 0.155, -0.046]; // just in front of the lenses (the head's −z face)
const BINOS_STAND_R = 0.02;
function Binoculars({ position, rotationY = 0, slug, lit }: { position: V3; rotationY?: number; slug?: string; lit: LitLink }) {
  const { accent } = useAccent();
  const accentC = useMemo(() => new Color(accent), [accent]);
  const { selected, visited } = useActive(slug ?? '');
  const reduced = useReducedMotion();
  const popRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const k = useRef(0); // pop-in scale progress
  const vel = useRef(0);
  const shot = useRef({ at: -99, fired: true, firedAt: -99, big: false }); // see SHOT
  const lensFlash = useRef<Sprite>(null);
  const glow = useMemo(glowTexture, []);
  const lastShot = useRef(0);
  const wakeK = useRef(0); // 0 frosted glass -> 1 the awake, near-solid material
  const screenMat = useRef<MeshStandardMaterial>(null);
  const [model, setModel] = useState<Group | null>(null);
  const presence = useContext(PresenceCtx);
  const cfg = useLook();
  // aiming at the cursor (see AIM_*)
  const close = useCloseUp(slug ?? '');
  const baseRef = useRef<Group>(null);
  const aim = useRef({ yaw: 0, w: 0, steady: 0, shotYaw: 99 });
  const aimVel = useRef({ v: 0 });
  const spot = useMemo(() => new Vector3(), []);

  // The frosted glass shared by the buildings + windmill — the model and the
  // post it stands on both wear it, so they read as one object. It's assigned
  // imperatively to the loaded GLTF's meshes, so it can't be a <LiveGlassMat>;
  // the frame loop below drives it to the same awake look instead. lifeSkip keeps
  // the presence dimmer off it (we multiply by presence ourselves).
  const glass = useMemo(() => {
    const m = new MeshStandardMaterial({
      color: GLASS,
      transparent: true,
      opacity: 0.5,
      roughness: 0.34,
      metalness: 0,
      emissive: SURFACE_GLOW,
      emissiveIntensity: 0.14,
      depthWrite: false,
    });
    m.userData.lifeSkip = true;
    m.userData.presenceOwn = true; // multiplied in below
    Object.assign(m.userData, lit); // lights with the park (lit.tsx)
    m.onBeforeCompile = glassRim;
    return m;
  }, [lit]);
  useEffect(() => () => glass.dispose(), [glass]);
  const body = useLitBody([glass]);

  useEffect(() => {
    let cancelled = false;
    loadBinoculars().then(
      (loaded) => {
        if (cancelled) return;
        const scene = loaded.clone(true); // the loaded one stays untouched for the next mount
        scene.traverse((o) => {
          const mesh = o as Mesh;
          if ((mesh as { isMesh?: boolean }).isMesh) mesh.material = glass;
        });
        // normalise: viewer height, feet on the ground, centred on its footprint
        const box = new Box3().setFromObject(scene);
        const size = new Vector3();
        box.getSize(size);
        scene.scale.setScalar(BINOS_H / (size.y || 1));
        box.setFromObject(scene);
        scene.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
        setModel(scene);
      },
      () => {}, // absent model → the viewer simply never pops in
    );
    return () => {
      cancelled = true;
    };
  }, [glass]);

  useFrame((s, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const t = s.clock.elapsedTime;
    const sh = shot.current;
    // press the shutter (see SHOT); not again before the last one's gone off
    const takeShot = (big = false) => {
      if (!sh.fired) return;
      sh.at = t;
      sh.fired = false;
      sh.big = big;
    };
    // Once brought to life it keeps working — it goes on panning and snapping
    // photos after you deselect it, for as long as it's "alive" this session.
    const live = selected || visited;
    const target = live ? 1 : 0;
    if (reduced) {
      k.current = target;
      vel.current = 0;
    } else {
      // a spring toward the target → a pop-in with a little overshoot
      vel.current += ((target - k.current) * 170 - vel.current * 19) * dt;
      k.current += vel.current * dt;
    }
    const pop = popRef.current;
    if (pop) {
      const sc = Math.max(0, k.current);
      pop.scale.setScalar(sc);
      pop.visible = sc > 0.002;
    }
    const head = headRef.current;
    // the cursor's spot on the park, as a heading for the lenses (they look
    // down the viewer's -z)
    const a = aim.current;
    const following = close && live && k.current > 0.55 && cursorIdle() < 2.5 && !!baseRef.current && !!cursorOnLevel(s, baseRef.current, 0, spot);
    // the park's creatures (critters.tsx) can ask it to swing to one of them and
    // to take the picture: the lock on one you're pointing at, the group photo
    const want = live && k.current > 0.55 ? SAFARI.want : null;
    if (want !== null) {
      a.yaw = spring(a.yaw, want, aimVel.current, dt, AIM_GLIDE);
      a.steady = 0;
    } else if (following) {
      const yaw = Math.max(-AIM_REACH, Math.min(AIM_REACH, Math.atan2(-spot.x, -spot.z)));
      a.yaw = spring(a.yaw, yaw, aimVel.current, dt, AIM_GLIDE);
      // steady on a new spot: the shot
      a.steady = Math.abs(aimVel.current.v) < 0.12 ? a.steady + dt : 0;
      if (a.steady > AIM_SETTLE && Math.abs(a.yaw - a.shotYaw) > AIM_NEW) {
        a.shotYaw = a.yaw;
        takeShot();
      }
    }
    const aiming = following || want !== null;
    a.w += ((aiming ? 1 : 0) - a.w) * (1 - Math.exp(-dt * (aiming ? 4 : 1.5)));
    if (SAFARI.shoot && live && sh.fired) {
      takeShot(SAFARI.shoot === 2);
      SAFARI.shoot = 0;
    }
    if (!reduced && live && k.current > 0.55) {
      // sweep left↔right; snap a photo at each extreme (unless it's yours to aim)
      const ph = t * 0.95;
      if (head) head.rotation.y = Math.sin(ph) * 0.6 * (1 - a.w) + a.yaw * a.w;
      const swing = Math.floor((ph - Math.PI / 2) / Math.PI);
      if (swing !== lastShot.current) {
        lastShot.current = swing;
        if (a.w < 0.5) takeShot();
      }
    } else if (head) {
      head.rotation.y += (0 - head.rotation.y) * 0.1; // settle back to centre
    }
    if (slug) {
      SAFARI.yaw = head ? head.rotation.y : 0;
      SAFARI.aiming = a.w > 0.85;
    }
    // the shot: steady (the dip), then the shutter
    const since = t - sh.at;
    if (!sh.fired && since >= SHOT.hold) {
      sh.fired = true;
      sh.firedAt = t;
      SAFARI.fired++;
    }
    const fired = t - sh.firedAt;
    const steadying = sh.fired ? Math.exp(-fired * 14) : easeOut(since / SHOT.hold);
    const kick = fired < 1.2 ? Math.exp(-7 * fired) * Math.sin(2 * Math.PI * 2.6 * fired) : 0;
    if (head) head.rotation.x = reduced ? 0 : SHOT.dip * steadying + SHOT.kick * kick;
    // the flash at the lenses, swelling as it fades
    const fl = lensFlash.current;
    if (fl) {
      const u = fired / SHOT.pop;
      fl.visible = !reduced && u < 1;
      if (fl.visible) {
        fl.scale.setScalar((0.05 + 0.17 * easeOut(u, 3)) * (sh.big ? 2.2 : 1));
        fl.material.opacity = (1 - u) * (1 - u);
      }
    }
    // the viewfinder holds the picture, then lets it go
    const f = fired < SHOT.held ? 1 : Math.exp(-(fired - SHOT.held) / SHOT.fade);
    // The viewer only exists once it's been woken, so it should wear the awake
    // material the whole time it's on screen — as frosted glass it read as a
    // dormant ghost of itself. Solidifies as it springs in, on the same endpoints
    // LiveGlassMat resolves to, so it matches every other woken object.
    wakeK.current += ((live ? 1 : 0) - wakeK.current) * (reduced ? 1 : cfg.wakeSpeed);
    const wk = wakeK.current;
    glass.opacity = (0.5 + (0.94 - 0.5) * wk) * presence.current;
    glass.roughness = cfg.roughnessBase - cfg.roughnessWakeDelta * wk;
    glass.depthWrite = wk > 0.5;
    body(lit.litU.value, wk > 0.5);
    // the viewfinder: a dim live screen at rest that dims a touch as the viewer
    // steadies, lights up white on the shot, holds, and fades back through the
    // accent
    const sm = screenMat.current;
    if (sm) {
      sm.emissive.copy(accentC).lerp(WHITE, f * f * 0.7);
      sm.emissiveIntensity = 0.3 * (1 - 0.4 * (sh.fired ? 0 : steadying)) + f * 1.6;
      sm.opacity = 0.35 + f * 0.5;
    }
  });

  return (
    <group ref={baseRef} position={position} rotation={[0, rotationY, 0]}>
      <group ref={popRef} visible={false}>
        {/* the frosted-glass post it stands on (doesn't pan with the head) */}
        <mesh position={[0, BINOS_STAND_H / 2, 0]}>
          <cylinderGeometry args={[BINOS_STAND_R * 0.86, BINOS_STAND_R, BINOS_STAND_H, 20]} />
          <primitive object={glass} attach="material" />
        </mesh>
        {/* the viewer head, lifted onto the post; pans + snaps photos (turned
            first, then tipped, so the shot's dip and kick stay a nod however
            far round it's turned) */}
        <group ref={headRef} position={[0, BINOS_STAND_H, 0]} rotation={[0, 0, 0, 'YXZ']}>
          {model && <primitive object={model} />}
          {model && (
            <sprite ref={lensFlash} position={BINOS_LENS} visible={false} renderOrder={2}>
              <spriteMaterial map={glow} color={WHITE} transparent opacity={0} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
            </sprite>
          )}
          {/* the viewfinder screen, set into the hood: lights up on a shot */}
          {model && (
            <mesh position={BINOS_SCREEN_POS}>
              <planeGeometry args={BINOS_SCREEN_SIZE} />
              <meshStandardMaterial
                ref={screenMat}
                userData={{ lifeSkip: true }}
                color={GLASS}
                emissive={accent}
                emissiveIntensity={0.3}
                transparent
                opacity={0.35}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          )}
        </group>
      </group>
    </group>
  );
}

/** The path through the park: a narrow ribbon that wanders in from the west
 *  edge, over the top of the lake, between the trees, and loops out round the
 *  east end, kept off the water, the jetty and the trunks. */
const PARK_PATH: V3[] = [
  [-0.49, 0.026, -0.1],
  [-0.37, 0.026, -0.15],
  [-0.23, 0.026, -0.09],
  [-0.08, 0.026, -0.12],
  [0.05, 0.026, -0.05],
  [0.13, 0.026, 0.07],
  [0.27, 0.026, 0.1],
  [0.34, 0.026, -0.06],
  [0.47, 0.026, -0.12],
];
const PATH_W = 0.032;
function ParkPath({ lit }: { lit: LitLink }) {
  const { geo, edges } = useMemo(() => {
    const pts = smoothCurve(PARK_PATH, 90);
    const pos: number[] = [];
    const idx: number[] = [];
    const left: V3[] = [];
    const right: V3[] = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0];
      const dz = b[2] - a[2];
      const len = Math.hypot(dx, dz) || 1;
      // the ribbon swells a little in the middle, so it reads as trodden, not drawn
      const w = PATH_W * (0.8 + 0.4 * Math.sin((i / (pts.length - 1)) * Math.PI));
      const nx = (-dz / len) * w;
      const nz = (dx / len) * w;
      left.push([p[0] + nx, p[1], p[2] + nz]);
      right.push([p[0] - nx, p[1], p[2] - nz]);
      pos.push(p[0] + nx, p[1], p[2] + nz, p[0] - nx, p[1], p[2] - nz);
      if (i < pts.length - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3); // facing up
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return { geo: g, edges: [left, right] };
  }, []);
  return (
    <group>
      <mesh geometry={geo}>
        <GlassMat tint="pale" lit={lit} />
      </mesh>
      {edges.map((e, i) => (
        <Line key={i} points={e} color={NEUTRAL} lineWidth={1} transparent opacity={0.3} />
      ))}
    </group>
  );
}

function Park({ position, slug }: { position: V3; slug?: string }) {
  const { accent, accentPale } = useAccent();
  const { selected, visited } = useActive(slug ?? '');
  const live = selected || visited;
  // the park's light (lit.tsx), shared by every part of it that doesn't wear
  // its own LiveGlassMat
  const lit = useLitLink(slug ?? '');
  // an irregular lake outline + its filled water shape
  const lake = useMemo(() => {
    const pts = blobPts(0.2, 0.5, 56, 13);
    const shape = new Shape();
    shape.moveTo(pts[0][0], pts[0][2]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][2]);
    return { geo: new ShapeGeometry(shape), shore: pts.map((p) => [p[0], 0, -p[2]] as V3) };
  }, []);
  useFrame((_s) => {
  });
  return (
    <group position={position}>
      <BlobShadow position={[0, 0.003, 0]} radius={0.68} opacity={0.34} />
      <group>
      {/* the park's ground. GROUND, not SURFACE — it's the paved plot the park
          sits on, so it's the same substance as the roads that reach it, and
          keeping it out of the SURFACE cuts is what lets the `deep` water read
          against it instead of merging with it. */}
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.02, 44]} />
        <GroundMat />
        {/* the hover light's shadows, printed on the plot (lit.tsx) */}
        <ShadowPrint />
      </mesh>
      <Line points={circlePts(0.5)} position={[0, 0.024, 0]} color={NEUTRAL} lineWidth={1} transparent opacity={0.4} />
      {/* lake — an irregular water body with shore, ripples, a jetty + reeds */}
      <group position={[-0.14, 0, 0.18]}>
        <mesh geometry={lake.geo} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <LiveGlassMat slug="arcam" tint="deep" />
        </mesh>
        {/* lighter shallows */}
        <mesh position={[0.03, 0.025, -0.02]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.1, 28]} />
          <LiveGlassMat slug="arcam" tint="glass" />
        </mesh>
        {/* shoreline */}
        <Line points={lake.shore} position={[0, 0.03, 0]} color={live ? accentPale : accent} lineWidth={1.2} transparent opacity={0.6} />
        {/* ripples */}
        <Line points={circlePts(0.06, 22)} position={[-0.03, 0.032, 0.02]} color={live ? accentPale : NEUTRAL} lineWidth={1} transparent opacity={0.4} />
        <Line points={circlePts(0.035, 18)} position={[0.06, 0.032, -0.04]} color={live ? accentPale : NEUTRAL} lineWidth={1} transparent opacity={0.35} />
        {/* a little jetty over the water — neutral grey, no timber brown */}
        <group position={[0.13, 0, -0.07]} rotation={[0, -0.5, 0]}>
          <mesh position={[0, 0.045, 0]}>
            <boxGeometry args={[0.13, 0.012, 0.035]} />
            <GlassMat tint="pale" lit={lit} />
            <Crease threshold={30} color={NEUTRAL} />
          </mesh>
          {[-0.05, 0.04].map((px, i) => (
            <mesh key={i} position={[px, 0.022, 0.013]}>
              <cylinderGeometry args={[0.005, 0.005, 0.05, 6]} />
              <GlassMat tint="pale" lit={lit} />
            </mesh>
          ))}
        </group>
        {/* reeds at the far edge — the same quiet glass-green as the trees */}
        {([[-0.16, 0.03], [-0.185, -0.02], [-0.15, -0.06]] as [number, number][]).map(([rx, rz], i) => (
          <mesh key={`r${i}`} position={[rx, 0.06, rz]} rotation={[0.12 * (i - 1), 0, 0.13]}>
            <cylinderGeometry args={[0.003, 0.005, 0.11, 5]} />
            <GlassMat tint="deep" lit={lit} />
          </mesh>
        ))}
        {/* lily pads */}
        {([[0.07, 0.06], [-0.02, -0.08]] as [number, number][]).map(([lx, lz], i) => (
          <mesh key={`l${i}`} position={[lx, 0.028, lz]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.022, 12]} />
            <GlassMat tint="pale" lit={lit} />
          </mesh>
        ))}
        {/* two ducks drifting their lazy loops */}
        <LakeDucks lit={lit} />
      </group>
      <ParkPath lit={lit} />
      {/* a small varied grove — each pine at its own height and turn */}
      <ParkTree position={[0.2, 0, -0.18]} h={0.46} yaw={0.4} slug={slug} lit={lit} />
      <ParkTree position={[0.24, 0, 0.22]} h={0.34} yaw={2.1} slug={slug} lit={lit} />
      <ParkTree position={[-0.22, 0, -0.24]} h={0.4} yaw={1.2} slug={slug} lit={lit} />
      <ParkTree position={[0.4, 0, 0.04]} h={0.3} yaw={3.6} slug={slug} lit={lit} />
      <ParkTree position={[-0.04, 0, -0.42]} h={0.36} yaw={5.1} slug={slug} lit={lit} />
      {/* fireflies wandering between the trees */}
      <Fireflies slug={slug} />
      {/* the ARCam tower viewer — pops in and scans when the hotspot is selected;
          stands on its post (raise BINOS_STAND_H to lift it higher) */}
      <Binoculars position={VIEWER.pos} rotationY={VIEWER.yaw} slug={slug} lit={lit} />
      {/* and the creatures it photographs, in the close-up (critters.tsx) */}
      {slug && <ParkCritters slug={slug} />}
      </group>
    </group>
  );
}

// The city's centrepiece: a setback tower in the manner of the 1920s high-rises,
// modelled in Blender (scripts/models/build_tower.py, shipped as
// public/models/tower.glb). A podium with a recessed entrance, three tiers
// stepping in, two crown steps, a slotted lantern and a spire, with five ribs up
// each face and window strips between them. Carries the Alliander hotspot: the
// glass solidifies once visited (LiveGlassMat), the strips light with the rest
// of the city's windows (the shared winMat, ramped by WindowDriver), the lantern
// powers on with the beacon, and a light-band climbs the tiers while it's alive.

// Fetch the model as soon as the scene's code arrives, not when the city first
// renders: the city is the layer the page opens on, and this is its centrepiece.
// A failure here is retried and reported by useTowerKit.
loadTowerKit().catch(() => {});

/** The three tiers the ribs run up, as [width, y0, y1, corner radius]: a copy
 *  of TIERS[1:4] in scripts/models/build_tower.py. The cables land on these and
 *  the light-band steps in with them, so change both together. */
const TOWER_TIERS: [number, number, number, number][] = [
  [0.27, 0.06, 0.46, 0.075],
  [0.23, 0.46, 0.66, 0.065],
  [0.19, 0.66, 0.8, 0.055],
];
/** The tier standing at height `y` (the top one above it). */
const towerTier = (y: number) => TOWER_TIERS.find((t) => y < t[2]) ?? TOWER_TIERS[TOWER_TIERS.length - 1];
// How far outside a tier's glass the light-band runs: clear of the ribs, which
// stand 0.0095 proud of it, at every setback.
const SURGE_CLEAR = 0.016;
// Where the station's cable leaves the tower: this far out from the glass, clear
// of the ribs.
const CABLE_CLEAR = 0.012;
const BEACON_Y = 1.012; // sitting on the spire's tip at 1.0

/** Distance from the centre to a rounded square's edge along a unit direction
 *  (dx, dz): where a cable heading that way leaves a tier. */
function rrectReach(hx: number, hz: number, r: number, dx: number, dz: number): number {
  const ax = Math.abs(dx);
  const az = Math.abs(dz);
  let t = Math.min(ax > 1e-6 ? hx / ax : Infinity, az > 1e-6 ? hz / az : Infinity);
  const cx = hx - r;
  const cz = hz - r;
  // past the flat sides, the ray leaves through the corner's arc
  if (ax * t > cx && az * t > cz) {
    const b = ax * cx + az * cz;
    const c = cx * cx + cz * cz - r * r;
    t = b + Math.sqrt(Math.max(0, b * b - c));
  }
  return t;
}

/** Where a cable leaves the tower at height y, heading out along (dx, dz). */
function towerReach(y: number, dx: number, dz: number): number {
  const [w, , , r] = towerTier(y);
  return rrectReach(w / 2, w / 2, r, dx, dz) + CABLE_CLEAR;
}

/** An open band round a closed outline: the light-band, round a tier. */
function bandGeometry(pts: V3[], h: number): BufferGeometry {
  const pos: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, , z0] = pts[i];
    const [x1, , z1] = pts[i + 1];
    pos.push(x0, -h / 2, z0, x1, -h / 2, z1, x1, h / 2, z1, x0, -h / 2, z0, x1, h / 2, z1, x0, h / 2, z0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

function Skyscraper({ position, kit, winMat }: { position: V3; kit: TowerKit; winMat?: MeshStandardMaterial }) {
  const { accent } = useAccent();
  const { selected, visited } = useActive(TOWER);
  const lit = useLitLink(TOWER); // the ribs and the spire light with the glass (lit.tsx)
  const beacon = useRef<MeshStandardMaterial>(null);
  const lamp = useRef<MeshStandardMaterial>(null);
  const reduced = useReducedMotion();
  const surge = useRef<Group>(null); // a light-band that climbs the tiers
  const surgeMat = useRef<MeshStandardMaterial>(null);
  const lifeK = useRef(0);
  const accentC = useMemo(() => new Color(accent), [accent]);
  // The band is drawn round the lowest tier and scaled in to each one above it.
  const [w0, y0, , r0] = TOWER_TIERS[0];
  const y1 = TOWER_TIERS[TOWER_TIERS.length - 1][2];
  const band = useMemo(() => bandGeometry(roundedRectPts(w0 + 2 * SURGE_CLEAR, w0 + 2 * SURGE_CLEAR, r0 + SURGE_CLEAR), 0.03), [w0, r0]);
  useFrame((s) => {
    const t = reduced ? 0 : s.clock.elapsedTime;
    // the beacon barely smoulders on the ghost tower; it starts pulsing in
    // colour once the visitor has brought the tower to life, and the lantern
    // powers on with it
    lifeK.current += ((selected || visited ? 1 : 0) - lifeK.current) * 0.08;
    // the mill's power (MILL): filling it, its lantern and beacon come up with
    // the charge; once it's full they're lit as a woken tower's are, for the
    // visit, and it flares as the last of it arrives
    const now = s.clock.elapsedTime;
    const powered = MILL.poweredAt >= 0 ? 1 : 0;
    const charge = powered ? 1 : MILL.charge;
    const flare = powered && !reduced ? bump((now - MILL.poweredAt) / 0.9) : 0;
    const k = Math.max(lifeK.current, powered, charge * 0.8);
    const b = beacon.current;
    if (b) {
      b.color.copy(GHOST_FILL).lerp(accentC, k);
      b.emissive.copy(GHOST_FILL).lerp(accentC, k);
      b.emissiveIntensity = (0.45 + 0.55 * Math.abs(Math.sin(t * 2.1))) * (0.14 + 0.86 * k) + 2.5 * flare;
    }
    const l = lamp.current;
    if (l) {
      l.color.copy(GHOST_FILL).lerp(accentC, k);
      l.emissive.copy(GHOST_FILL).lerp(accentC, k);
      l.emissiveIntensity = 0.05 + k * (0.85 + 0.12 * Math.sin(t * 2.2)) + 1.6 * flare;
    }
    // a light-band climbs the tiers while the tower is alive, energy rising to
    // the crown; it steps in at each setback, the same distance off every tier.
    // Sending power (the grid), it drops fast to the tower's foot, gathering
    // the charge, and flares out there as the pulse sets off.
    if (surge.current && surgeMat.current) {
      const p = reduced ? 0.5 : (t * FX.loopSpeed) % 1;
      let y = y0 + p * (y1 - y0);
      let op = fxEnv(p) * FX.peak * k;
      let grow = 1;
      // filling from the mill, before it's full: the band stands at the charge's
      // level, a gauge, brighter while power is coming in; full, it runs up
      // past the crown in one sweep
      if (!powered && charge > 0.01) {
        y = y0 + charge * (y1 - y0);
        op = FX.peak * (0.8 + 0.6 * MILL.flow + (reduced ? 0 : 0.2 * Math.sin(now * 7)));
      } else if (flare > 0) {
        const u = Math.min(1, (now - MILL.poweredAt) / 0.9);
        y = y0 + easeOut(u) * (y1 - y0);
        op = FX.peak * 2 * (1 - u * 0.6);
        grow = 1 + 0.35 * u;
      }
      const sent = s.clock.elapsedTime - POWER.sentAt;
      if (!reduced && sent >= 0 && sent < P_WIND + 0.3) {
        if (sent < P_WIND) {
          const c = easeIn(sent / P_WIND);
          y += (y0 - y) * c;
          op = Math.max(op, FX.peak * 1.6 * c);
        } else {
          const f = (sent - P_WIND) / 0.3;
          y = y0;
          grow = 1 + 0.5 * easeOut(f);
          op = FX.peak * 1.8 * (1 - f);
        }
      }
      const sc = ((towerTier(y)[0] / 2 + SURGE_CLEAR) / (w0 / 2 + SURGE_CLEAR)) * grow;
      surge.current.position.y = y;
      surge.current.scale.set(sc, 1, sc);
      surgeMat.current.opacity = op;
    }
  });
  return (
    <group position={position}>
      <BlobShadow position={[0, 0.004, 0]} radius={0.34} opacity={0.45} />
      {/* the tiers, the canopy and the lantern: one shell of the scene's frosted
          glass, ghost grey until the hotspot is visited, then it solidifies */}
      <mesh geometry={kit.tower_body}>
        <LiveGlassMat slug={TOWER} />
        <Crease threshold={35} color={NEUTRAL} />
      </mesh>
      {/* the ribs and the spire */}
      <mesh geometry={kit.tower_ribs}>
        <meshStandardMaterial {...litMat(lit)} color={NEUTRAL} emissive={NEUTRAL} emissiveIntensity={0.18} roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh geometry={kit.tower_spire}>
        <meshStandardMaterial {...litMat(lit)} color={NEUTRAL} emissive={NEUTRAL} emissiveIntensity={0.18} roughness={0.4} metalness={0.3} />
      </mesh>
      {/* the window strips between the ribs light with the rest of the city */}
      {winMat && <mesh geometry={kit.tower_windows} material={winMat} />}
      {/* the lantern's lamp, driven above */}
      <mesh geometry={kit.tower_lamp}>
        <meshStandardMaterial ref={lamp} userData={{ lifeSkip: true }} color={accent} emissive={accent} emissiveIntensity={0.05} roughness={0.35} toneMapped={false} />
      </mesh>
      {/* A light-band that climbs the tower while engaged (driven above).
          `renderOrder` is the fix for it flicking between in-front-of and
          behind the tower as the camera moved: the band and the glass are both
          transparent, and both their centroids sit on the tower's own axis, so
          their distances to the camera are near enough identical that three's
          back-to-front sort flipped the pair depending on the viewing angle —
          whichever drew second won. Forcing the band to draw after the glass
          settles it, and because the glass writes depth once it's alive the
          band's far side is then correctly rejected: you see the near side wrap
          the tower, the same way from every angle. */}
      <group ref={surge}>
        <mesh renderOrder={2} geometry={band}>
          <meshStandardMaterial ref={surgeMat} color={accent} emissive={accent} emissiveIntensity={1.4} transparent opacity={0} blending={AdditiveBlending} side={DoubleSide} depthWrite={false} toneMapped={false} userData={{ lifeSkip: true }} />
        </mesh>
      </group>
      {/* the slow-pulsing beacon on the spire's tip */}
      <mesh position={[0, BEACON_Y, 0]}>
        <sphereGeometry args={[0.014, 12, 12]} />
        <meshStandardMaterial ref={beacon} userData={{ lifeSkip: true }} color={accent} emissive={accent} emissiveIntensity={0.6} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ---------- The transformer house — powers the city ---------- */
/** Its footprint's longer side, roof overhang included, for the contact shadow. */
const TRAFO_SPAN = 0.21;
/** The house lit by power coming through: its glow over the shell (`over`
 *  its size), how bright as the pulse comes in (`charge`) and at its height
 *  (`peak`, an additive opacity), and how much it swells as the pulse lands. */
const TRAFO_GLOW = { over: 1.05, charge: 0.35, peak: 0.5, swell: 0.035 };

// Fetch the model with the tower's, as soon as the scene's code arrives.
// A failure here is retried and reported by useTrafoKit.
loadTrafoKit().catch(() => {});

/** A Dutch compact substation, the "transformatorhuisje" that steps the grid
 *  down for the surrounding blocks, from its Blender model
 *  (scripts/models/build_trafo.py, shipped as public/models/trafo.glb): the
 *  blocks' rounded corners and plinth, an overhanging flat roof, a louvred
 *  double door on the street side with the high-voltage sign, and a vent in
 *  each flank; its cables are under the ground (PowerGrid). A prop (not a
 *  hotspot), like the buildings, but it carries the city's power: the sign's
 *  bolt hums faintly at rest, brightens with the Alliander grid when the tower
 *  is engaged or the whole city goes live, and flares as power passes through. */
function TransformerHouse({ position, kit }: { position: V3; kit: TrafoKit }) {
  const { accent } = useAccent();
  const { hovered, selected, visited } = useActive('alliander-hololens');
  // in the close-up, pointing at the house powers the next block (sendPower)
  const close = useCloseUp('alliander-hololens');
  const houseRef = useRef<Group>(null);
  const ray = useMemo(() => new Ray(), []);
  const box = useMemo(() => {
    kit.trafo_body.computeBoundingBox();
    return kit.trafo_body.boundingBox!.clone();
  }, [kit]);
  const wasOver = useRef(false);
  const complete = useSceneSelector((s) => s.completedAt !== null);
  const reduced = useReducedMotion();
  const accentC = useMemo(() => new Color(accent), [accent]);
  // the sign's bolt, the live "power": it opts out of the life system and drives
  // its own ghost→accent glow, like the windows
  const capMat = useMemo(() => {
    const m = new MeshStandardMaterial({ color: GHOST_FILL, emissive: GHOST_FILL, emissiveIntensity: 0.3, roughness: 0.35, metalness: 0.2, toneMapped: false });
    m.userData.lifeSkip = true;
    return m;
  }, []);
  useEffect(() => () => capMat.dispose(), [capMat]);
  // the house lighting up as power comes through: a glow just over its shell,
  // added on, swelling from its middle (see TRAFO_GLOW)
  const glowMat = useMemo(() => {
    const m = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    m.userData.lifeSkip = true;
    return m;
  }, []);
  useEffect(() => () => glowMat.dispose(), [glowMat]);
  const glowAt = useMemo<V3>(() => box.getCenter(new Vector3()).multiplyScalar(1 - TRAFO_GLOW.over).toArray(), [box]);
  const glowRef = useRef<Mesh>(null);
  const k = useRef(0.12);
  // The house solidifies with the city, on its own beat in the wave out from the
  // tower, exactly as the blocks do (its distance from the tower is the same
  // `delay` the blocks derive theirs from). As a prop it rests as its own quiet
  // glass rather than a hotspot ghost waiting to be found.
  const wake = useRef(0);
  const delay = Math.min(1, Math.hypot(position[0], position[2]) / 0.85);
  useFrame((s) => {
    wake.current = staggered(cityLevel.k, delay);
    // rest to a faint smoulder; brighten with the grid (hover < visited < live/complete)
    const kT = selected || complete ? 1 : hovered ? 0.7 : visited ? 0.42 : 0.12;
    k.current += (kT - k.current) * 0.08;
    const t = reduced ? 0 : s.clock.elapsedTime;
    const hum = reduced ? 1 : 0.82 + 0.18 * Math.sin(t * 3.2); // a faint electrical hum
    capMat.color.copy(GHOST_FILL).lerp(accentC, k.current);
    capMat.emissive.copy(GHOST_FILL).lerp(accentC, k.current);
    const now = s.clock.elapsedTime;
    let over = false;
    if (close && houseRef.current && cursorRay(s, houseRef.current, ray)) {
      over = ray.intersectsBox(box);
      if (over && !wasOver.current && now - POWER.sentAt > 0.3) sendPower(now);
    }
    wasOver.current = over;
    // Sending power, the house presses down and springs back (the wind-up), its
    // bolt sputtering while the station gathers. Then it charges up as the
    // pulse comes in under the ground (out of sight behind the house from most
    // of the close-up), swells and flares as it arrives, holding bright for the
    // beat before it lets go.
    const sent = now - POWER.sentAt;
    const press = reduced ? 0 : 0.05 * ring(sent, 3.2, 7);
    const through = sent - P_WIND - P_IN;
    const swell = reduced || through < 0 ? 0 : TRAFO_GLOW.swell * bump(through / (P_HOLD + 0.12));
    houseRef.current?.scale.set(1 + press * 0.45 + swell, 1 - press + swell, 1 + press * 0.45 + swell);
    const sputter = !reduced && sent >= 0 && sent < P_WIND && Math.random() < 0.55 ? 2.2 : 0;
    const zap = through < 0 || through > 1.4 ? 0 : through < P_HOLD ? 5 : 5 * Math.exp(-(through - P_HOLD) * 5);
    capMat.emissiveIntensity = (0.3 + 2.6 * k.current) * hum + sputter + zap;
    const coming = sent - P_WIND;
    const charge = coming < 0 || coming >= P_IN ? 0 : TRAFO_GLOW.charge * easeIn(coming / P_IN, 2);
    const flare = through < 0 ? 0 : through < P_HOLD ? 1 : Math.exp(-(through - P_HOLD) * 6);
    const g = reduced ? 0 : Math.max(charge, flare) + (sputter ? 0.1 : 0);
    glowMat.opacity = g * TRAFO_GLOW.peak;
    if (glowRef.current) glowRef.current.visible = g > 0.002;
    glowMat.color.copy(accentC).lerp(WHITE, 0.3 * flare);
  });
  return (
    <group ref={houseRef} position={position}>
      <BlobShadow position={[0, 0.004, 0]} radius={TRAFO_SPAN * 0.75} opacity={0.42} />
      {/* The shell (plinth, walls and roof slab) is the glass that carries the
          outline, as the blocks' bodies do; the door leaves are the deep cut and
          the louvres, vents, sign plate and roof rim the pale one, neither
          outlined, so at rest it's as sparse a drawing as the blocks round it. */}
      <mesh geometry={kit.trafo_body}>
        <LiveGlassMat slug="alliander-hololens" ghost={false} wake={wake} />
        <LiveEdges slug="alliander-hololens" threshold={35} wake={wake} />
      </mesh>
      <mesh geometry={kit.trafo_doors}>
        <LiveGlassMat slug="alliander-hololens" ghost={false} tint="deep" wake={wake} />
      </mesh>
      <mesh geometry={kit.trafo_trim}>
        <LiveGlassMat slug="alliander-hololens" ghost={false} tint="pale" wake={wake} />
      </mesh>
      <mesh geometry={kit.trafo_power} material={capMat} />
      <mesh ref={glowRef} geometry={kit.trafo_body} material={glowMat} position={glowAt} scale={TRAFO_GLOW.over} renderOrder={2} visible={false} />
    </group>
  );
}

/** One road, as a centre-line and how wide it is. */
type Road = { points: V3[]; width: number };

/** THE WHOLE ROAD NETWORK AS ONE SURFACE.
 *
 *  Every previous version of this built each road as its own quad strip and set
 *  them next to each other, and you could see every cut: butted ribbons show
 *  their seam however carefully the endpoints are matched, overlapping ones
 *  blend twice and leave a bright patch, and a strip that turns leaves a wedge
 *  open on the outside of the bend. Matching widths and tangents got the seams
 *  down to hairlines, but hairlines are still seams — there is no arrangement of
 *  separate pieces that reads as one continuous surface.
 *
 *  So the network isn't assembled from pieces at all. `d` below is the distance
 *  from any point on the ground to the nearest road centre-line, minus that
 *  road's half width — negative inside the tarmac, positive outside it,
 *  regardless of how many roads happen to overlap there. The paved area is
 *  simply everywhere d < 0, and this contours that one region into one mesh.
 *  Junctions, bends and forks aren't cases to handle; they're just places where
 *  the region happens to be wider, and they come out seamless because there was
 *  never a seam to hide.
 *
 *  The kerb falls out of the same thing: it's the boundary of that region, so it
 *  wraps every junction mouth and every road end by construction, and no kerb
 *  can run across an intersection because the intersection is interior.
 *
 *  Contoured over triangles rather than squares — marching squares has two
 *  ambiguous saddle cases and a wrong guess punches a hole in the road, while a
 *  triangle can only be cut one way. Each cell splits into two, and each of
 *  those emits nothing, a corner, a quad or itself.
 *
 *  Two draw calls for every road in the city. */
function roadMesh(roads: Road[], cell: number) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxHalf = 0;
  for (const r of roads) {
    maxHalf = Math.max(maxHalf, r.width / 2);
    for (const p of r.points) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
    }
  }
  const pad = maxHalf + 3 * cell;
  minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
  const nx = Math.ceil((maxX - minX) / cell) + 1;
  const nz = Math.ceil((maxZ - minZ) / cell) + 1;
  // +Infinity is "nowhere near a road", which tests as outside for free
  const d = new Float32Array(nx * nz).fill(Infinity);

  // Scatter each segment into its own neighbourhood rather than sweeping the
  // whole grid per segment: a few hundred segments over a 3.8 x 2.1 field would
  // otherwise be millions of distance evaluations at scene start.
  for (const r of roads) {
    const h = r.width / 2;
    const reach = h + 2 * cell; // one cell past the isoline, so the contour interpolates against real values
    for (let s = 0; s < r.points.length - 1; s++) {
      const ax = r.points[s][0], az = r.points[s][2];
      const ex = r.points[s + 1][0] - ax, ez = r.points[s + 1][2] - az;
      const len2 = ex * ex + ez * ez || 1;
      const i0 = Math.max(0, Math.floor((Math.min(ax, ax + ex) - reach - minX) / cell));
      const i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, ax + ex) + reach - minX) / cell));
      const j0 = Math.max(0, Math.floor((Math.min(az, az + ez) - reach - minZ) / cell));
      const j1 = Math.min(nz - 1, Math.ceil((Math.max(az, az + ez) + reach - minZ) / cell));
      for (let j = j0; j <= j1; j++) {
        const pz = minZ + j * cell;
        for (let i = i0; i <= i1; i++) {
          const px = minX + i * cell;
          let t = ((px - ax) * ex + (pz - az) * ez) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const v = Math.hypot(px - (ax + ex * t), pz - (az + ez * t)) - h;
          const k = j * nx + i;
          if (v < d[k]) d[k] = v;
        }
      }
    }
  }

  const fill: number[] = [];
  const kerb: number[] = [];
  const tri = (x0: number, z0: number, x1: number, z1: number, x2: number, z2: number) => fill.push(x0, 0, z0, x1, 0, z1, x2, 0, z2);
  // where the isoline crosses the edge between two samples
  const lerp = (xa: number, za: number, da: number, xb: number, zb: number, db: number) => {
    const t = da / (da - db);
    return [xa + (xb - xa) * t, za + (zb - za) * t] as [number, number];
  };
  /** One triangle of the lattice, clipped to d < 0. */
  const march = (
    x0: number, z0: number, d0: number,
    x1: number, z1: number, d1: number,
    x2: number, z2: number, d2: number,
  ) => {
    const n = (d0 < 0 ? 1 : 0) + (d1 < 0 ? 1 : 0) + (d2 < 0 ? 1 : 0);
    if (n === 0) return;
    if (n === 3) { tri(x0, z0, x1, z1, x2, z2); return; }
    // rotate so the odd vertex out is first
    let ax = x0, az = z0, da = d0, bx = x1, bz = z1, db = d1, cx = x2, cz = z2, dc = d2;
    if (n === 1) {
      if (d1 < 0) { ax = x1; az = z1; da = d1; bx = x2; bz = z2; db = d2; cx = x0; cz = z0; dc = d0; }
      else if (d2 < 0) { ax = x2; az = z2; da = d2; bx = x0; bz = z0; db = d0; cx = x1; cz = z1; dc = d1; }
    } else {
      if (d1 >= 0) { ax = x1; az = z1; da = d1; bx = x2; bz = z2; db = d2; cx = x0; cz = z0; dc = d0; }
      else if (d2 >= 0) { ax = x2; az = z2; da = d2; bx = x0; bz = z0; db = d0; cx = x1; cz = z1; dc = d1; }
    }
    const p = lerp(ax, az, da, bx, bz, db);
    const q = lerp(ax, az, da, cx, cz, dc);
    kerb.push(p[0], 0, p[1], q[0], 0, q[1]);
    if (n === 1) tri(ax, az, p[0], p[1], q[0], q[1]);
    else { tri(bx, bz, cx, cz, q[0], q[1]); tri(bx, bz, q[0], q[1], p[0], p[1]); }
  };

  // Cells wholly inside the tarmac are merged along each row before anything is
  // emitted: the middle of a road is a long identical run, and marching it cell
  // by cell spent four thousand triangles describing a rectangle. The run's
  // ends land on grid corners the neighbouring row also uses, so the T-vertices
  // this leaves are harmless — one flat colour on one flat plane has no
  // interpolation to crack along.
  const run = (i0: number, i1: number, j: number) => {
    const xa = minX + i0 * cell, xb = minX + i1 * cell;
    const za = minZ + j * cell, zb = za + cell;
    tri(xa, za, xb, za, xb, zb);
    tri(xa, za, xb, zb, xa, zb);
  };
  for (let j = 0; j < nz - 1; j++) {
    let start = -1;
    for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i;
      const dA = d[k], dB = d[k + 1], dC = d[k + nx + 1], dD = d[k + nx];
      if (dA < 0 && dB < 0 && dC < 0 && dD < 0) {
        if (start < 0) start = i;
        continue;
      }
      if (start >= 0) { run(start, i, j); start = -1; }
      if (dA > 0 && dB > 0 && dC > 0 && dD > 0) continue; // wholly outside, the common case
      const xa = minX + i * cell, xb = xa + cell;
      const za = minZ + j * cell, zb = za + cell;
      march(xa, za, dA, xb, za, dB, xb, zb, dC);
      march(xa, za, dA, xb, zb, dC, xa, zb, dD);
    }
    if (start >= 0) run(start, nx - 1, j);
  }
  return { fill: new Float32Array(fill), kerb: new Float32Array(kerb) };
}

/** Contour resolution. The roads are 0.08 across, so this puts ~4 samples over a
 *  carriageway — enough to resolve it, and the isoline is interpolated so the
 *  kerb stays smooth between samples rather than stepping. */
const ROAD_CELL = 0.02;

function RoadNetwork({ roads }: { roads: Road[] }) {
  const { fill, kerb } = useMemo(() => roadMesh(roads, ROAD_CELL), [roads]);
  return (
    <group position={[0, 0.01, 0]}>
      <mesh>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[fill, 3]} />
        </bufferGeometry>
        {/* No depth write and one flat colour, as before — but now it can't
            double-blend anywhere, because the tessellation covers the paved
            region exactly once. */}
        <GroundMat side={DoubleSide} />
        {/* the hover light's shadows, printed on the road (lit.tsx) */}
        <ShadowPrint twoSided />
      </mesh>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[kerb, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={NEUTRAL} transparent opacity={0.42} depthWrite={false} />
      </lineSegments>
    </group>
  );
}

// The Big Dipper (Ursa Major — "the Big Bear") asterism: 7 stars + the links
// between them. Handle on the right, bowl on the left.
const DIPPER: [number, number][] = [
  [0.0, 1.0], // 0 Dubhe  — bowl top-outer
  [0.0, 0.0], // 1 Merak  — bowl bottom-outer
  [1.0, 0.05], // 2 Phecda — bowl bottom-inner
  [1.05, 0.85], // 3 Megrez — bowl top-inner / handle joint
  [1.85, 1.0], // 4 Alioth
  [2.6, 1.15], // 5 Mizar
  [3.35, 1.4], // 6 Alkaid — handle end
];
const DIPPER_LINKS: [number, number][] = [
  [0, 3], [3, 2], [2, 1], [1, 0], // the bowl
  [3, 4], [4, 5], [5, 6], // the handle
];
const DIPPER_MAG = [1, 0.7, 0.65, 0.8, 1, 0.85, 1]; // relative brightness → star size

/** A star constellation (the Big Dipper) that fades in behind the windmill while
 *  it's selected, its stars twinkling and blooming against the night. It hangs
 *  in the sky row over the city's marker line and its names (with the launch
 *  invitation), not across them; on a phone, with no names on the line and the
 *  hero title above the city, it comes down beside the windmill. */
const DIPPER_SKY = 1.67; // the asterism's centre over the windmill's foot…
const DIPPER_SKY_PORTRAIT = 1.0; // …and on a phone
function Constellation({ anchor }: { anchor: V3 }) {
  const { selected, visited } = useActive('dtt-amsterdam');
  const reduced = useReducedMotion();
  const grp = useRef<Group>(null);
  const starMats = useRef<(MeshStandardMaterial | null)[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineRef = useRef<any>(null);
  const k = useRef(0);
  const sky = DIPPER_SKY + (DIPPER_SKY_PORTRAIT - DIPPER_SKY) * portraitMix(useThree((s) => s.size.width / s.size.height));
  const stars = useMemo(() => {
    const cx = DIPPER.reduce((a, s) => a + s[0], 0) / DIPPER.length;
    const cy = DIPPER.reduce((a, s) => a + s[1], 0) / DIPPER.length;
    const S = 0.2; // asterism scale: fits the sky row between the names and the top of the frame
    return DIPPER.map(([x, y]) => [(x - cx) * S, (y - cy) * S, 0] as V3);
  }, []);
  const segs = useMemo(() => DIPPER_LINKS.flatMap(([a, b]) => [stars[a], stars[b]]), [stars]);
  useFrame((s) => {
    // fades in on select and stays lit once the windmill has been opened
    k.current += ((selected || visited ? 1 : 0) - k.current) * 0.08;
    const kk = k.current;
    if (grp.current) {
      grp.current.visible = kk > 0.01;
      grp.current.scale.setScalar(0.9 + 0.1 * kk);
    }
    const t = s.clock.elapsedTime;
    starMats.current.forEach((m, i) => {
      if (!m) return;
      const tw = reduced ? 1 : 0.78 + 0.32 * Math.sin(t * (1.7 + i * 0.4) + i);
      m.emissiveIntensity = kk * 1.8 * tw; // brighter to keep the now-tiny stars visible
      m.opacity = Math.min(1, kk * 1.5);
    });
    const lm = lineRef.current?.material;
    if (lm) {
      lm.userData.lifeSkip = true; // self-animated (a receded city fades it at draw time — presence.tsx)
      // A star chart's lines: faint, so the stars are what you see and the
      // links between them are read, not looked at.
      const op = kk * 0.55;
      lm.opacity = op;
      if (lm.uniforms?.opacity) lm.uniforms.opacity.value = op;
    }
  });
  return (
    <group ref={grp} position={[anchor[0] + 0.1, anchor[1] + sky, anchor[2] - 0.7]} rotation={[0.05, 0.4, 0]} visible={false}>
      <Line ref={lineRef} segments points={segs} color={NEUTRAL} lineWidth={1.5} transparent opacity={0} />
      {stars.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.0033 + DIPPER_MAG[i] * 0.0028, 10, 10]} />
          <meshStandardMaterial
            ref={(m) => {
              starMats.current[i] = m;
            }}
            userData={{ lifeSkip: true }}
            color={NEUTRAL}
            emissive={NEUTRAL}
            emissiveIntensity={0}
            transparent
            opacity={0}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ---------- the grid: under the streets, from the station to the blocks ----------
   The city's power runs underground, as a Dutch town's does. The tower in the
   middle is the power station: one cable runs from its foot to the transformer
   house, and from the transformer the cables run out under the avenues, one to
   each block and in at its foot. They show faintly through the road, the way a
   maquette draws what's buried.

   A block's lights are the grid's: it lights once power reaches it and stays
   lit for the visit. In the Alliander close-up, each time you point at the
   transformer house it powers the next block, nearest first: a pulse runs from
   the station to the transformer, then out along that block's cable (P_*
   below), and the block comes on as it arrives. Once they're all on, a
   point sends the next round, and each block brightens as it's reached. With
   no cursor to point with (a touch screen) they come on in turn by themselves
   (PULSE_AUTO), under reduced motion all at once, and closing the close-up
   brings on any still dark, so a city you've opened is a lit city, as it
   always was. A returning visitor's city comes on with the old staggered
   come-on instead of a cascade. */
const CABLE_Y = -0.006; // under the road, whose surface is at 0.01
const FEED_Y = -0.013; // the station's cable runs deeper, under the others
const CABLE_R = 0.003;
/* A pulse's beats, in seconds from the point that sends it: the station
   gathers charge (the transformer house presses down, the tower's light band
   drops to its foot), the pulse sets off along the station's cable slowly and
   gathers speed, holds a moment in the transformer house (which flares and
   throws sparks), then kicks out along the block's cable faster than it came
   in, easing into each bend and flashing at each junction, and lands with a
   ring of light at the block's foot as its floors come on from the ground up. */
const P_WIND = 0.28;
const P_IN = 0.45;
const P_HOLD = 0.16;
const P_OUT = 0.6;
const P_LEN = P_WIND + P_IN + P_HOLD + P_OUT;
const PULSE_AUTO = 1.1; // s between blocks when they come on by themselves
const PULSE_CLOSE = 0.35; // … and when closing the close-up brings on the rest
const COMET = { beads: 10, gap: 0.011, head: 1.5 }; // the pulse: its head and the tail of beads behind it
const WAKE = 0.2; // how far behind the head the cable glows, cooling as it goes
const LIGHT_ON = 0.45; // s for a block's floors to light, ground to roof
const WIN_LIT = 0.5; // a lit block's windows (an occupied window's glow, OccupiedWindows)
const WIN_FLASH = 1.6; // and the flash as power arrives, on top
const TRAFO_DEPTH = 0.15; // the house's footprint front to back, plinth included (build_trafo.py)
const POWER = {
  first: [] as number[], // when power first reached each block (clock s); -1 while it's dark
  last: [] as number[], // when it last did, for the brightening
  pulses: [] as { to: number; at: number; k: number; zapped: boolean }[], // on their way (k: the next bend on its route)
  sentAt: -99, // the last pulse's leaving, for the transformer's flare
  round: 0, // where the next round starts, once every block is lit
  order: [] as number[], // the blocks, nearest the transformer first
  opened: false, // whether the close-up has been open this visit
};

/** Send power to the next block: TransformerHouse, when it's pointed at, and
 *  PowerGrid, when the blocks come on by themselves. */
function sendPower(now: number) {
  const { order, first, pulses } = POWER;
  if (!order.length) return;
  const going = (i: number) => pulses.some((p) => p.to === i);
  let to = order.find((i) => first[i] < 0 && !going(i));
  if (to === undefined) to = order[POWER.round++ % order.length];
  pulses.push({ to, at: now, k: 1, zapped: false });
  POWER.sentAt = now;
  play('grid-charge', { volume: 0.5 });
}

/** The grid's cables under the street plan (`ave`: where the avenues run).
 *  `feed`: the station's, from the tower's foot to the back of the house.
 *  `routes`: each block's whole way from the house, for its pulse: back to the
 *  avenue in front of the tower, along the avenues, and in at the block's foot.
 *  `runs`: what to draw, the routes merged where they share a street, so the
 *  avenues carry one main each rather than a stack of cables. `order`: nearest
 *  the house first. */
function gridPlan(blocks: { x: number; z: number; w: number; d: number }[], trafo: V3, ave: number) {
  const y = CABLE_Y;
  const [tx, , tz] = trafo;
  const back = tz - TRAFO_DEPTH / 2;
  const start: V3 = [tx, y, back];
  const j0: V3 = [tx, y, ave];
  const station = towerReach(0.1, 0, 1); // the tower's face toward the house
  const feed: V3[] = [
    [tx - 0.03, FEED_Y, station],
    [tx - 0.03, FEED_Y, back],
  ];
  const routes = blocks.map((b): V3[] => {
    const side = Math.abs(b.x) < 0.2 ? 0 : Math.sign(b.x);
    if (side !== 0) {
      const ax = side * ave;
      return [start, j0, [ax, y, ave], [ax, y, b.z], [b.x - (side * b.w) / 2, y, b.z]];
    }
    // the block behind the tower: round by the east avenue, in from the far one
    return [start, j0, [ave, y, ave], [ave, y, -ave], [b.x, y, -ave], [b.x, y, b.z + b.d / 2]];
  });
  // merge every route's straight runs, per street: all of them are along x or
  // along z, so a street is a line and its cables an interval on it
  const lines = new Map<string, { axis: 'x' | 'z'; at: number; spans: [number, number][] }>();
  for (const r of routes)
    for (let i = 0; i < r.length - 1; i++) {
      const [a, b] = [r[i], r[i + 1]];
      const axis = Math.abs(a[2] - b[2]) < 1e-6 ? 'x' : 'z'; // along x when z holds
      const at = axis === 'x' ? a[2] : a[0];
      const lo = Math.min(axis === 'x' ? a[0] : a[2], axis === 'x' ? b[0] : b[2]);
      const hi = Math.max(axis === 'x' ? a[0] : a[2], axis === 'x' ? b[0] : b[2]);
      const key = `${axis}${at.toFixed(4)}`;
      if (!lines.has(key)) lines.set(key, { axis, at, spans: [] });
      lines.get(key)!.spans.push([lo, hi]);
    }
  const runs: V3[][] = [];
  for (const { axis, at, spans } of lines.values()) {
    spans.sort((p, q) => p[0] - q[0]);
    let [lo, hi] = spans[0];
    const flush = () => runs.push(axis === 'x' ? [[lo, y, at], [hi, y, at]] : [[at, y, lo], [at, y, hi]]);
    for (const [a, b] of spans.slice(1)) {
      if (a <= hi + 1e-6) hi = Math.max(hi, b);
      else {
        flush();
        [lo, hi] = [a, b];
      }
    }
    flush();
  }
  const length = (r: V3[]) => r.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - r[i][0], p[2] - r[i][2]), 0);
  const order = blocks.map((_, i) => i).sort((p, q) => length(routes[p]) - length(routes[q]));
  return { feed, routes, runs, order };
}

/** A polyline walked by distance along it: `at(u, out)` is the point a
 *  fraction u of the way (0–1), and `len` how long it is. */
function walker(pts: V3[]) {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2]));
  const len = seg.reduce((n, l) => n + l, 0);
  return {
    len,
    at(u: number, out: Vector3) {
      let d = Math.min(1, Math.max(0, u)) * len;
      for (let i = 0; i < seg.length; i++) {
        if (d <= seg[i] || i === seg.length - 1) {
          const f = seg[i] > 0 ? Math.min(1, d / seg[i]) : 0;
          const [a, b] = [pts[i], pts[i + 1]];
          return out.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
        }
        d -= seg[i];
      }
      return out.set(...pts[pts.length - 1]);
    },
  };
}

/** The out-run's pace along a route: a kick away from the house that fades,
 *  and a dip into each bend, so the pulse takes the corners. `at(s)` maps the
 *  run's time (0–1) to how far along the route it is (0–1); `bends` are the
 *  route's corners, as fractions of it, for the junction flashes. */
function runPace(pts: V3[]) {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[2] - pts[i][2]));
  const len = seg.reduce((n, l) => n + l, 0) || 1;
  const bends: number[] = [];
  let acc = 0;
  for (let i = 0; i < seg.length - 1; i++) bends.push((acc += seg[i]) / len);
  const N = 240;
  const time = new Float32Array(N + 1);
  for (let k = 1; k <= N; k++) {
    const d = ((k - 0.5) / N) * len;
    const kick = 1 + 1.3 * Math.exp(-d / 0.12);
    const dip = bends.reduce((m, b) => m * (1 - 0.55 * Math.exp(-(((d - b * len) / 0.03) ** 2))), 1);
    time[k] = time[k - 1] + len / N / (kick * dip);
  }
  const total = time[N];
  return {
    bends,
    at(s: number) {
      const t = Math.min(1, Math.max(0, s)) * total;
      let lo = 0;
      let hi = N;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (time[mid] <= t) lo = mid;
        else hi = mid;
      }
      return (lo + (t - time[lo]) / Math.max(1e-9, time[hi] - time[lo])) / N;
    },
  };
}

/** A cable as a tube whose u runs along it (0 → 1 by distance), for the glow
 *  that follows a pulse (LIT_FRAG). */
function pathTube(pts: V3[], r: number) {
  const path = new CurvePath<Vector3>();
  for (let i = 0; i < pts.length - 1; i++) path.add(new LineCurve3(new Vector3(...pts[i]), new Vector3(...pts[i + 1])));
  return new TubeGeometry(path, Math.max(16, Math.ceil(path.getLength() / 0.006)), r, 6, false);
}
const LIT_VERT = `varying float vU;
void main() { vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// lit behind the head and cooling with distance from it, brightest at the head
const LIT_FRAG = `uniform float uHead; uniform float uTail; uniform float uFade; uniform vec3 uColor; varying float vU;
void main() {
  float b = uHead - vU;
  float wake = b < 0.0 ? 0.0 : exp(-b / uTail);
  float head = exp(-pow(b / (uTail * 0.22), 2.0));
  gl_FragColor = vec4(uColor * (0.9 * wake + 1.8 * head) * uFade, 1.0);
}`;

/** The grid's cables under the streets (gridPlan), and the pulses running
 *  along them (POWER): thin tubes under the road, one shared material for the
 *  blocks' cables and one for the station's, dim at rest and brighter while
 *  the tower is engaged, each flaring as a pulse passes. A pulse is a short
 *  string of bright beads. This is also where the blocks come on by
 *  themselves (see the grid's note above), and where a pulse arriving lights
 *  its block. */
const PULSES = 6; // pulses drawn at once
const SPARKS = 16;
const FLASHES = 12;
const FLAT = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
function PowerGrid({ feed, routes, runs, order, stagger, house }: { feed: V3[]; routes: V3[][]; runs: V3[][]; order: number[]; stagger: number[]; house: V3 }) {
  const { accent } = useAccent();
  const { hovered, selected, visited } = useActive(TOWER);
  // open at all, the camera arrived or not (`selected` waits for it, and the
  // visit is marked the moment it opens)
  const open = useSceneSelector((s) => s.selectedSlug === TOWER);
  const reduced = useReducedMotion();
  const coarse = useMemo(isTouch, []);
  const k = useRef(0);
  const nextAuto = useRef(0);
  const at = useMemo(() => new Vector3(), []);
  const ways = useMemo(() => ({ feed: walker(feed), routes: routes.map(walker) }), [feed, routes]);
  const paces = useMemo(() => routes.map(runPace), [routes]);
  const cables = useGeometry(() => merge(runs.map((r) => tube(r, CABLE_R, 5, 2))), [runs]);
  const feedCable = useGeometry(() => tube(feed, CABLE_R * 1.4, 6, 2), [feed]);
  // the glow that follows a pulse, one sheath per cable: the station's, then each block's
  const sheaths = useGeometry(() => [feed, ...routes].map((r, i) => pathTube(r, CABLE_R * (i === 0 ? 2.2 : 1.8))).reduce((o, g, i) => ({ ...o, [i]: g }), {} as Record<string, BufferGeometry>), [feed, routes]);
  const accentC = useMemo(() => new Color(accent), [accent]);
  const mats = useMemo(() => {
    const mk = () => {
      const m = new MeshStandardMaterial({ color: SURFACE.deep.color, emissive: accent, emissiveIntensity: 0.05, transparent: true, opacity: 0.5, roughness: 0.5, toneMapped: false });
      m.userData.lifeSkip = true; // drives its own glow
      return m;
    };
    const glow = () => {
      const m = new MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
      m.userData.lifeSkip = true;
      return m;
    };
    const lit = [feed, ...routes].map((r) => {
      const len = r.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - r[i][0], p[2] - r[i][2]), 0) || 1;
      const m = new ShaderMaterial({
        uniforms: { uHead: { value: 0 }, uTail: { value: WAKE / len }, uFade: { value: 0 }, uColor: { value: new Color(accent).lerp(new Color('#ffffff'), 0.35) } },
        vertexShader: LIT_VERT,
        fragmentShader: LIT_FRAG,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      });
      m.userData.lifeSkip = true;
      return m;
    });
    return { cable: mk(), feed: mk(), beads: glow(), sparks: glow(), flashes: glow(), rings: glow(), lit };
  }, [accent, feed, routes]);
  useEffect(
    () => () => {
      for (const m of [mats.cable, mats.feed, mats.beads, mats.sparks, mats.flashes, mats.rings, ...mats.lit]) m.dispose();
    },
    [mats],
  );
  const ring = useGeometry(() => new RingGeometry(0.78, 1, 40));
  // what's drawn: the comets' beads, the sparks, the junction flashes, the arrival rings
  const beadsIM = useRef<InstancedMesh>(null);
  const sparksIM = useRef<InstancedMesh>(null);
  const flashesIM = useRef<InstancedMesh>(null);
  const ringsIM = useRef<InstancedMesh>(null);
  const sheathRefs = useRef<(Mesh | null)[]>([]);
  // each cable's glow: how far along its last pulse got, and when it was last on it
  const glows = useMemo(() => [feed, ...routes].map(() => ({ head: 0, at: -99 })), [feed, routes]);
  const fx = useMemo(
    () => ({
      sparks: Array.from({ length: SPARKS }, () => ({ pos: new Vector3(), vel: new Vector3(), at: -99 })),
      flashes: Array.from({ length: FLASHES }, () => ({ pos: new Vector3(), at: -99 })),
      rings: Array.from({ length: PULSES }, () => ({ pos: new Vector3(), at: -99 })),
      n: { spark: 0, flash: 0, ring: 0 },
    }),
    [],
  );
  // the blocks' places in POWER, kept across remounts (it's module-level, like the city's latch)
  useMemo(() => {
    POWER.order = order;
    for (let i = 0; i < order.length; i++) {
      POWER.first[i] ??= -1;
      POWER.last[i] ??= -1;
    }
  }, [order]);
  useFrame((s, delta) => {
    const now = s.clock.elapsedTime;
    const dt = Math.min(delta, 1 / 30);
    const { first, last, pulses } = POWER;
    if (open) POWER.opened = true;
    // the blocks still dark, and nothing on its way to them
    const dark = order.filter((i) => first[i] < 0 && !pulses.some((p) => p.to === i));
    if (dark.length) {
      if (selected && reduced) for (const i of dark) first[i] = last[i] = now;
      else if (selected && coarse) {
        if (now >= nextAuto.current) {
          sendPower(now);
          nextAuto.current = now + PULSE_AUTO;
        }
      } else if (!open && visited) {
        // a returning visitor's city comes on as it always did; one you've just
        // closed brings on its last blocks in a quick run
        if (!POWER.opened || reduced) for (const i of dark) first[i] = now + stagger[i] * WIN_STAGGER * ON_SECONDS;
        else if (now >= nextAuto.current) {
          sendPower(now);
          nextAuto.current = now + PULSE_CLOSE;
        }
      }
    }
    const beads = beadsIM.current;
    let bead = 0;
    let busy = 0;
    for (const p of pulses) {
      const t = now - p.at;
      if (t < P_WIND) continue; // still gathering at the station (Skyscraper, TransformerHouse)
      busy = 1;
      let way;
      let u;
      if (t < P_WIND + P_IN) {
        // off along the station's cable, slow and gathering speed
        way = ways.feed;
        u = easeIn((t - P_WIND) / P_IN, 2.2);
        glows[0].head = Math.max(u, now - glows[0].at < 0.05 ? glows[0].head : 0);
        glows[0].at = now;
      } else if (t < P_WIND + P_IN + P_HOLD) {
        // held in the house: it flares (TransformerHouse) and throws sparks
        if (!p.zapped) {
          p.zapped = true;
          play('grid-zap', { volume: 0.55 });
          for (let n = 0; n < 10; n++) {
            const sp = fx.sparks[fx.n.spark++ % SPARKS];
            const a = Math.random() * Math.PI * 2;
            sp.pos.set(house[0] + Math.cos(a) * 0.07, 0.11, house[2] + Math.sin(a) * 0.055);
            sp.vel.set(Math.cos(a) * (0.12 + Math.random() * 0.18), 0.25 + Math.random() * 0.3, Math.sin(a) * (0.12 + Math.random() * 0.18));
            sp.at = now;
          }
        }
        continue;
      } else {
        // out along the block's: a kick away from the house, easing into each bend
        way = ways.routes[p.to];
        const pace = paces[p.to];
        u = pace.at((t - P_WIND - P_IN - P_HOLD) / P_OUT);
        const g = glows[p.to + 1];
        g.head = u;
        g.at = now;
        // a flash at each junction it passes
        while (p.k - 1 < pace.bends.length && u >= pace.bends[p.k - 1]) {
          const f = fx.flashes[fx.n.flash++ % FLASHES];
          f.pos.set(...routes[p.to][p.k]);
          f.at = now;
          p.k++;
        }
      }
      // the comet: a bright head and a tail of beads shrinking away behind it
      if (beads && bead + COMET.beads <= PULSES * COMET.beads) {
        for (let j = 0; j < COMET.beads; j++) {
          way.at(u - (j * COMET.gap) / way.len, at);
          const f = 1 - j / COMET.beads;
          _s.setScalar((j === 0 ? COMET.head : 1) * (0.35 + 0.65 * f));
          beads.setMatrixAt(bead, _m.compose(at, _q.identity(), _s));
          beads.setColorAt(bead, _c.setScalar(0.25 + 0.75 * f * f));
          bead++;
        }
      }
    }
    // arrived: a ring at the block's foot, and it comes on (or brightens, if it's on already)
    for (let n = pulses.length - 1; n >= 0; n--) {
      const p = pulses[n];
      if (now - p.at < P_LEN) continue;
      if (first[p.to] < 0) first[p.to] = now;
      last[p.to] = now;
      const r = fx.rings[fx.n.ring++ % PULSES];
      const end = routes[p.to][routes[p.to].length - 1];
      r.pos.set(end[0], 0.013, end[2]);
      r.at = now;
      play('grid-on', { volume: 0.6 });
      pulses.splice(n, 1);
    }
    if (beads) {
      for (let j = bead; j < PULSES * COMET.beads; j++) beads.setMatrixAt(j, _m.makeScale(0, 0, 0));
      beads.instanceMatrix.needsUpdate = true;
      if (beads.instanceColor) beads.instanceColor.needsUpdate = true;
    }
    // the sparks: out of the house, up and falling, shrinking as they go
    const sparks = sparksIM.current;
    if (sparks) {
      fx.sparks.forEach((sp, j) => {
        const age = now - sp.at;
        const life = age >= 0 && age < 0.55 ? 1 - age / 0.55 : 0;
        if (life > 0) {
          sp.vel.y -= 1.4 * dt;
          sp.pos.addScaledVector(sp.vel, dt);
        }
        _s.setScalar(life);
        sparks.setMatrixAt(j, _m.compose(sp.pos, _q.identity(), _s));
        sparks.setColorAt(j, _c.copy(accentC).lerp(WHITE, 0.6).multiplyScalar(life));
      });
      sparks.instanceMatrix.needsUpdate = true;
      if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
    }
    // the junction flashes: a pop that swells and fades
    const flashes = flashesIM.current;
    if (flashes) {
      fx.flashes.forEach((f, j) => {
        const age = (now - f.at) / 0.3;
        const on = age >= 0 && age < 1;
        _s.setScalar(on ? 0.4 + 1.6 * easeOut(age) : 0);
        flashes.setMatrixAt(j, _m.compose(f.pos, _q.identity(), _s));
        flashes.setColorAt(j, _c.copy(accentC).lerp(WHITE, 0.5).multiplyScalar(on ? (1 - age) ** 2 : 0));
      });
      flashes.instanceMatrix.needsUpdate = true;
      if (flashes.instanceColor) flashes.instanceColor.needsUpdate = true;
    }
    // the arrival rings, spreading over the ground
    const rings = ringsIM.current;
    if (rings) {
      fx.rings.forEach((r, j) => {
        const age = (now - r.at) / 0.7;
        const on = age >= 0 && age < 1;
        _s.setScalar(on ? 0.025 + 0.15 * easeOut(age, 3) : 0);
        rings.setMatrixAt(j, _m.compose(r.pos, FLAT, _s));
        rings.setColorAt(j, _c.copy(accentC).lerp(WHITE, 0.3).multiplyScalar(on ? 1.4 * (1 - age) : 0));
      });
      rings.instanceMatrix.needsUpdate = true;
      if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    }
    // each cable's glow: on behind its pulse, cooling once the pulse has gone
    glows.forEach((g, c) => {
      const fade = Math.exp(-Math.max(0, now - g.at) / 0.35);
      const m = mats.lit[c];
      m.uniforms.uHead.value = g.head;
      m.uniforms.uFade.value = fade;
      const sh = sheathRefs.current[c];
      if (sh) sh.visible = fade > 0.01;
    });
    const target = selected ? 1 : hovered ? 0.5 : visited ? 0.3 : 0.08;
    k.current += (target - k.current) * 0.08;
    const kk = k.current;
    mats.cable.emissiveIntensity = 0.05 + kk * 0.9 + busy * 0.4;
    mats.cable.opacity = 0.35 + kk * 0.45;
    mats.feed.emissiveIntensity = 0.05 + kk * 1.1 + busy * 0.4;
    mats.feed.opacity = 0.4 + kk * 0.45;
  });
  return (
    <group>
      <mesh geometry={cables} material={mats.cable} />
      <mesh geometry={feedCable} material={mats.feed} />
      {mats.lit.map((m, c) => (
        <mesh key={c} ref={(r) => (sheathRefs.current[c] = r)} geometry={sheaths[c]} material={m} visible={false} />
      ))}
      {/* the pulses and their sparks, flashes and rings are drawn last, so the
          ground's film never lies over them from one angle and not another */}
      <instancedMesh ref={beadsIM} args={[undefined, mats.beads, PULSES * COMET.beads]} frustumCulled={false} renderOrder={2}>
        <sphereGeometry args={[0.0075, 10, 8]} />
      </instancedMesh>
      <instancedMesh ref={sparksIM} args={[undefined, mats.sparks, SPARKS]} frustumCulled={false} renderOrder={2}>
        <sphereGeometry args={[0.004, 6, 4]} />
      </instancedMesh>
      <instancedMesh ref={flashesIM} args={[undefined, mats.flashes, FLASHES]} frustumCulled={false} renderOrder={2}>
        <sphereGeometry args={[0.01, 10, 8]} />
      </instancedMesh>
      <instancedMesh ref={ringsIM} args={[ring, mats.rings, PULSES]} frustumCulled={false} renderOrder={2} />
    </group>
  );
}

/* ---------- the mill's line to the tower ----------
   The cable the mill's power runs along (see MILL): laid under the road like
   the grid's, from the mill's yard along its lane, the north avenue and the
   west one, and in at the tower's foot. It shows faintly through the road;
   while the sails are making power, beads of light run along it toward the
   tower, faster and brighter the harder they turn. */
const MILL_BEADS = 24;
const MILL_AVE = 0.3; // the avenues' offset (CityRig's AVE)
function MillLine({ from }: { from: V3 }) {
  const { accent } = useAccent();
  const reduced = useReducedMotion();
  const path = useMemo<V3[]>(() => {
    const y = CABLE_Y;
    const [mx, , mz] = from;
    return [
      [mx + 0.16, y, mz],
      [-0.94, y, mz],
      [-0.92, y, -0.2],
      [-0.86, y, -MILL_AVE],
      [-MILL_AVE, y, -MILL_AVE],
      [-MILL_AVE, y, 0],
      [-towerReach(0.06, -1, 0), y, 0],
    ];
  }, [from]);
  const way = useMemo(() => walker(path), [path]);
  const cable = useGeometry(() => tube(path, CABLE_R, 5, 2), [path]);
  const mats = useMemo(() => {
    const line = new MeshStandardMaterial({ color: SURFACE.deep.color, emissive: accent, emissiveIntensity: 0.05, transparent: true, opacity: 0.5, roughness: 0.5, toneMapped: false });
    const bead = new MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    line.userData.lifeSkip = true;
    bead.userData.lifeSkip = true;
    return { line, bead };
  }, [accent]);
  useEffect(
    () => () => {
      mats.line.dispose();
      mats.bead.dispose();
    },
    [mats],
  );
  const beads = useRef<InstancedMesh>(null);
  const col = useMemo(() => new Color(accent).lerp(WHITE, 0.3), [accent]);
  const run = useRef(0);
  useFrame((_, delta) => {
    const im = beads.current;
    if (!im) return;
    const dt = Math.min(delta, 1 / 30);
    const f = reduced ? 0 : MILL.flow;
    // the cable warms with the flow
    mats.line.emissiveIntensity = 0.05 + 0.5 * f;
    im.visible = f > 0.01;
    if (!im.visible) return;
    // the beads' travel, in cable lengths: about a second end to end at full flow
    run.current += (dt * (0.35 + 0.9 * f) * 1.6) / way.len;
    for (let i = 0; i < MILL_BEADS; i++) {
      const u = (i / MILL_BEADS + run.current) % 1;
      way.at(u, _v);
      // in out of the mill's yard and into the tower's foot rather than popping
      const k = f * Math.min(1, u / 0.06, (1 - u) / 0.06);
      _s.setScalar(0.005 + 0.005 * f);
      im.setMatrixAt(i, _m.compose(_v, _q.identity(), _s));
      im.setColorAt(i, _c.copy(col).multiplyScalar(1.6 * k));
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });
  return (
    <group>
      <mesh geometry={cable} material={mats.line} />
      <instancedMesh ref={beads} args={[undefined, mats.bead, MILL_BEADS]} frustumCulled={false} renderOrder={2} visible={false}>
        <sphereGeometry args={[1, 10, 8]} />
      </instancedMesh>
    </group>
  );
}

/* A one-shot drift of accent-coloured sparks over the city — fired at the
   homecoming (celebrateAt), gone within ~3s. A quiet glass-raise, not
   fireworks. */
const BURST_N = 32;
const BURST_COLORS = [PALETTE.city.accent, PALETTE.room.accent];

function CelebrationBurst() {
  const celebrateAt = useSceneSelector((s) => s.celebrateAt);
  const reduced = useReducedMotion();
  const ref = useRef<ThreePoints>(null);
  const posAttr = useRef<BufferAttribute>(null);
  const colAttr = useRef<BufferAttribute>(null);

  const { p0, vel, base, delay, life, posArr, colArr } = useMemo(() => {
    const rnd = makeRand(97);
    const p0 = new Float32Array(BURST_N * 3);
    const vel = new Float32Array(BURST_N * 3);
    const base = new Float32Array(BURST_N * 3);
    const delay = new Float32Array(BURST_N);
    const life = new Float32Array(BURST_N);
    const c = new Color();
    for (let i = 0; i < BURST_N; i++) {
      const ang = rnd() * Math.PI * 2;
      const r = 0.25 + Math.sqrt(rnd()) * 1.05;
      p0[i * 3] = Math.cos(ang) * r;
      p0[i * 3 + 1] = 0.25 + rnd() * 0.25;
      p0[i * 3 + 2] = Math.sin(ang) * r;
      vel[i * 3] = Math.cos(ang) * (0.04 + rnd() * 0.12);
      vel[i * 3 + 1] = 0.5 + rnd() * 0.55;
      vel[i * 3 + 2] = Math.sin(ang) * (0.04 + rnd() * 0.12);
      c.set(BURST_COLORS[(rnd() * BURST_COLORS.length) | 0]);
      base[i * 3] = c.r;
      base[i * 3 + 1] = c.g;
      base[i * 3 + 2] = c.b;
      delay[i] = rnd() * 0.5; // one soft, loose wave
      life[i] = 1.6 + rnd() * 1.0;
    }
    return { p0, vel, base, delay, life, posArr: new Float32Array(BURST_N * 3), colArr: new Float32Array(BURST_N * 3) };
  }, []);

  useFrame(() => {
    const pts = ref.current;
    if (!pts || celebrateAt === null) return;
    const t = (performance.now() - celebrateAt) / 1000;
    if (t > 3.2) {
      pts.visible = false;
      return;
    }
    pts.visible = true;
    for (let i = 0; i < BURST_N; i++) {
      const tt = t - delay[i];
      const alive = tt > 0 && tt < life[i];
      const a = alive ? Math.min(1, tt * 6) * (1 - tt / life[i]) * 0.75 : 0;
      const ttc = Math.max(0, tt);
      posArr[i * 3] = p0[i * 3] + vel[i * 3] * ttc;
      posArr[i * 3 + 1] = p0[i * 3 + 1] + vel[i * 3 + 1] * ttc - 0.3 * ttc * ttc;
      posArr[i * 3 + 2] = p0[i * 3 + 2] + vel[i * 3 + 2] * ttc;
      colArr[i * 3] = base[i * 3] * a;
      colArr[i * 3 + 1] = base[i * 3 + 1] * a;
      colArr[i * 3 + 2] = base[i * 3 + 2] * a;
    }
    if (posAttr.current) posAttr.current.needsUpdate = true;
    if (colAttr.current) colAttr.current.needsUpdate = true;
  });

  if (celebrateAt === null || reduced) return null;

  return (
    <points ref={ref} visible={false}>
      <bufferGeometry>
        <bufferAttribute ref={posAttr} attach="attributes-position" args={[posArr, 3]} />
        <bufferAttribute ref={colAttr} attach="attributes-color" args={[colArr, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.035} vertexColors transparent blending={AdditiveBlending} depthWrite={false} sizeAttenuation toneMapped={false} />
    </points>
  );
}

// A few windows that stay softly lit at rest — a handful of homes awake in the
// otherwise-sleeping city. Kept in the skyline's own calm blue (never warm, per
// the window rule above), most just glowing, one or two slowly winking off and
// on. Independent of the interactive winMat, so waking the whole city (full
// bright) is still the reward. The panes come with the blocks' model: each
// occupied block carries one, `block<i>_lit`, a hair proud of its window grid.
function OccupiedWindows({ kit, buildings }: { kit: BlocksKit; buildings: { x: number; z: number }[] }) {
  const reduced = useReducedMotion();
  const { accent } = useAccent();
  const mats = useRef<(MeshStandardMaterial | null)[]>([]);
  const wins = useMemo(() => {
    const rnd = makeRand(4231);
    const out: { x: number; z: number; g: BufferGeometry; lvl: number; spd: number; ph: number; wink: boolean }[] = [];
    buildings.forEach((b, i) => {
      const g = kit[`block${i}_lit`];
      if (!g) return; // nobody home
      out.push({ x: b.x, z: b.z, g, lvl: 0.5 + rnd() * 0.5, spd: 0.3 + rnd() * 0.4, ph: rnd() * 6.28, wink: rnd() < 0.4 });
    });
    return out;
  }, [kit, buildings]);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    for (let i = 0; i < wins.length; i++) {
      const m = mats.current[i];
      const w = wins[i];
      if (!m) continue;
      // winking windows go dark for a beat now and then; the rest hold a soft glow
      const wink = w.wink && !reduced ? (Math.sin(t * w.spd + w.ph) > 0.72 ? 0.12 : 1) : 1;
      m.emissiveIntensity = w.lvl * 0.5 * wink;
    }
  });
  return (
    <group>
      {wins.map((w, i) => (
        <mesh key={i} position={[w.x, 0, w.z]} geometry={w.g}>
          <meshStandardMaterial ref={(r) => (mats.current[i] = r)} color={accent} emissive={accent} emissiveIntensity={w.lvl * 0.5} transparent opacity={0.92} roughness={0.4} toneMapped={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// A single faint light easing along a road now and then — a lone car crossing
// the sleeping city. One small cool point (a headlight, not a warm glow), a long
// gap between passes, fading in and out at the ends, and gone entirely under
// reduced motion. Path is in the layer's local road coordinates.
function Traffic({ path }: { path: V3[] }) {
  const { accent } = useAccent();
  const reduced = useReducedMotion();
  const ref = useRef<Mesh>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const PERIOD = 19; // seconds between passes
  const DUR = 6; // seconds to cross
  useFrame((s) => {
    if (!ref.current || !mat.current) return;
    const tt = s.clock.elapsedTime % PERIOD;
    if (tt > DUR) {
      mat.current.opacity = 0;
      return;
    }
    const p = tt / DUR;
    const idx = p * (path.length - 1);
    const i0 = Math.min(path.length - 2, Math.floor(idx));
    const f = idx - i0;
    const a = path[i0];
    const b = path[i0 + 1];
    ref.current.position.set(a[0] + (b[0] - a[0]) * f, 0.03, a[2] + (b[2] - a[2]) * f);
    mat.current.opacity = Math.sin(p * Math.PI) * 0.85; // ease in at the start, out at the end
  });
  if (reduced) return null;
  return (
    <mesh ref={ref} position={[path[0][0], 0.03, path[0][2]]}>
      <sphereGeometry args={[0.018, 8, 8]} />
      <meshStandardMaterial ref={mat} color={accent} emissive={accent} emissiveIntensity={2.4} transparent opacity={0} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

export function CityRig() {
  // The street plan: two avenues each way at ±AVE, crossing into the 3x3 of
  // plots that holds one object apiece — the tower on the central plaza, the
  // transformer on the front-centre plot, a block on each of the rest, and the
  // back-left one deliberately left open.
  //
  // There was a rectangular ring closing this off at ±0.76, and it was far too
  // much road: four full-length strips boxing the town in, running parallel to
  // the bypass along the whole southern side. The curved roads do the same job
  // for a sixth of the tarmac — they were already going to these places, they
  // just weren't arriving at anything.
  //
  // So every avenue now runs to its own destination and each end is a junction
  // rather than a stub. The eastern ends stop on the park's boundary (its disc
  // reaches in to x=0.805 at this depth); the southern ends meet the bypass; the
  // x=-AVE avenue simply stops at the z=-AVE junction, because the plot north of
  // it was never built and a street to nowhere is what started all this.
  const AVE = 0.3;
  // The bypass, and the town's southern edge in one road. It passes THROUGH the
  // foot of both N-S avenues — those two points are control points, so the curve
  // interpolates them exactly. Its west end turns the corner into the front
  // avenue's tail rather than running on out of town: from the overview that
  // stretch ran out from behind the hero's subtitle.
  const curveB = useMemo(
    () => smoothCurve([[-1.05, 0.01, 0.62], [-AVE, 0.01, 0.8], [AVE, 0.01, 0.82], [1.05, 0.01, 0.64], [1.8, 0.01, 0.32]]),
    [],
  );
  // Every road as a centre-line, handed to RoadNetwork as one set. There is no
  // ordering or crossing logic here any more and nothing has to be told about
  // anything else: two centre-lines that pass near each other simply make one
  // wider piece of tarmac, because the surface is contoured off all of them at
  // once. Roads that meet do so by ending on each other's line.
  //
  // Each street's ends are chosen so the paved region reaches exactly where it
  // should. `to: 0.765` on the eastern avenue rather than the park's boundary at
  // 0.805, because the contour rounds every terminus off at the road's own half
  // width — so the tarmac reaches 0.805 and stops at the grass.
  const roads = useMemo<Road[]>(
    () => [
      // the avenues: two each way, bounding the nine plots
      { points: [[-AVE, 0.01, -AVE], [-AVE, 0.01, 0.8]], width: 0.08 }, // stops at the z=-AVE junction; the plot north of it was never built
      { points: [[AVE, 0.01, -0.78], [AVE, 0.01, 0.82]], width: 0.08 },
      { points: [[-0.78, 0.01, -AVE], [0.765, 0.01, -AVE]], width: 0.08 }, // east end lands on the park boundary
      { points: [[-0.78, 0.01, AVE], [0.78, 0.01, AVE]], width: 0.08 },
      // and the tails that carry the outer ends somewhere: the mill, the launch
      // apron, and the front avenue's two ends bending down to the bypass
      { points: smoothCurve([[-0.78, 0.01, -AVE], [-0.87, 0.01, -AVE], [-0.93, 0.01, -0.19], [-0.94, 0.01, MILL_POS[2]]]), width: 0.08 },
      { points: smoothCurve([[AVE, 0.01, -0.78], [AVE, 0.01, -0.87], [0.5, 0.01, -0.95], [0.7, 0.01, -0.94], [0.82, 0.01, -0.88]]), width: 0.08 },
      { points: smoothCurve([[-0.78, 0.01, AVE], [-0.87, 0.01, AVE], [-0.95, 0.01, 0.42], [-0.99, 0.01, 0.55], [-1.0, 0.01, 0.64]]), width: 0.08 },
      { points: smoothCurve([[0.78, 0.01, AVE], [0.87, 0.01, AVE], [0.95, 0.01, 0.42], [0.99, 0.01, 0.55], [1.0, 0.01, 0.64]]), width: 0.08 },
      { points: curveB, width: 0.09 },
    ],
    [curveB],
  );
  // Every centre-line the fringe has to stay off, so no shed lands in a road.
  const keepClear = useMemo(() => roads.map((r) => r.points), [roads]);
  // Sparse blocks of square buildings around a central plaza; taller toward
  // the middle so the cluster still reads as a skyline. Everything about how a
  // block looks — its facade, and a roofline alternating by index between a
  // plant room and a setback — is in its Blender model, which
  // scripts/models/build_blocks.py builds by replaying this plan draw for draw.
  // Change the plan and the model has to be rebuilt; dev warns below if the
  // two disagree.
  const cluster = useMemo(() => {
    const rnd = makeRand(1872);
    const out: { x: number; z: number; w: number; d: number; h: number }[] = [];
    const cells = [-0.55, 0, 0.55];
    for (const cx of cells)
      for (const cz of cells) {
        if (cx === 0 && cz === 0) continue; // central plaza → the tower
        if (cx < 0 && cz < 0) continue; // back-left plot — deliberately left open
        const count = 1;
        for (let k = 0; k < count; k++) {
          const x = cx + (rnd() - 0.5) * 0.12;
          const z = cz + (rnd() - 0.5) * 0.12;
          const fall = Math.max(0.1, 1 - (x * x + z * z) * 0.8);
          // Slimmer again, but nowhere near the 0.13–0.18 the very first pass
          // used: that was past 3:1, which is a chimney rather than a building,
          // and left no wall for a facade to happen on. 0.21–0.26 overcorrected
          // into blocks that read as chunky, so these sit at 0.175–0.215 —
          // roughly 2:1 to 3:1 against the same heights.
          //
          // The floor is set by the facade, not by taste. `bay_offsets` (in
          // build_blocks.py) splits (w - 4 panes) between three mullion gaps and
          // two corner piers, so at 0.175 the gap is still ~0.009 against a 0.03
          // pane. Much under that and the mullions vanish, and a punched facade
          // turns into an unbroken curtain wall.
          //
          // Same five rnd() draws in the same order, deliberately: this generator
          // seeds every position in the city, so taking one more or one fewer
          // number here would shuffle the whole skyline instead of resizing it.
          const bld = { x, z, w: 0.175 + rnd() * 0.04, d: 0.175 + rnd() * 0.04, h: 0.24 + fall * 0.3 + rnd() * 0.1 };
          // front-centre plot goes to the transformer house — build the RNG for it
          // (so the rest of the skyline is unchanged), then drop the building.
          if (cx === 0 && cz === 0.55) continue;
          out.push(bld);
        }
      }
    return out;
  }, []);
  /** When each block's lights come on, as a fraction of the one-second come-on.
   *
   *  A shuffled even spread rather than six raw random draws. With only six
   *  blocks, raw draws bunch — the seeded set came out 0.11, 0.27, 0.31, 0.33,
   *  0.33, 0.52, so four of the six lit within a tenth of a second of each
   *  other and the last was done by 0.64. Spacing them and then shuffling keeps
   *  the ORDER random, which is the part that reads, while actually using the
   *  whole second.
   *
   *  Its own generator so the block sequence above is untouched — that one
   *  places every building in the city, and drawing from it here would move the
   *  whole skyline rather than reorder its lights. */
  const lightOrder = useMemo(() => {
    const rnd = makeRand(LIGHT_SEED);
    const n = cluster.length;
    const slots = cluster.map((_, i) => (n === 1 ? 0 : i / (n - 1)));
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    return slots;
  }, [cluster]);
  const { accent } = useAccent();
  // one shared material for every window, ramped by WindowDriver on town-hall hover
  const winMat = useMemo(() => {
    const m = new MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0, transparent: true, opacity: 0.1, roughness: 0.4, toneMapped: false, depthWrite: false });
    m.userData.lifeSkip = true; // WindowDriver animates it; shared with prop buildings
    return m;
  }, [accent]);
  // the city's Blender models (kit.ts); null until they arrive
  const towerKit = useTowerKit();
  const blocksKit = useBlocksKit();
  const millKit = useMillKit();
  const trafoKit = useTrafoKit();
  // The blocks' model is built for this plan (build_blocks.py replays it); say
  // so in dev if the two have drifted apart, rather than draw blocks that no
  // longer fit their plots.
  useEffect(() => {
    if (!import.meta.env.DEV || !blocksKit) return;
    cluster.forEach((b, i) => {
      const box = blocksKit[`block${i}_body`]?.boundingBox;
      const fits = box && Math.abs(box.max.x - box.min.x - 0.012 - b.w) < 0.002 && Math.abs(box.max.y - b.h) < 0.002; // the podium steps out 0.006 a side
      if (!fits) console.warn(`public/models/blocks.glb doesn't match block ${i} of the city's plan. Rebuild it: see scripts/models/README.md.`);
    });
  }, [blocksKit, cluster]);
  // placeable by eye from the dev tools in `npm run dev` (dev/tuning.ts)
  const mill = usePlacement('City.Windmill', { position: MILL_POS });
  const park = usePlacement('City.Park', { position: PARK_POS });
  // The transformer house sits on the front-centre plot of the 3×3 block grid,
  // just across the road from the tower and facing the camera (its own building
  // is dropped so the spot isn't doubled up). Drag City.Transformer in the dev
  // panel to move it to any of the 9 spots.
  const trafo = usePlacement('City.Transformer', { position: [0, 0, 0.55] });
  // The grid under the streets (PowerGrid): the station's cable from the tower
  // to the transformer house, and the house's out to every block.
  const grid = useMemo(() => gridPlan(cluster, trafo.position, AVE), [cluster, trafo.position]);
  return (
    <group>
      {/* every road, contoured into one surface */}
      <RoadNetwork roads={roads} />
      {/* a lone car easing along the bypass every so often */}
      <Traffic path={curveB} />

      {/* the skyline + its civic peak; windows light up on town-hall hover */}
      <WindowDriver mat={winMat} />
      {/* Each block lights at its own random moment inside the one-second
          come-on. This was a radial wave — delay by distance from the tower —
          which reads as a mechanism sweeping outward rather than as a city
          waking up. Lights going on in a real skyline have no order to them. */}
      {blocksKit && cluster.map((b, i) => <Building key={i} i={i} kit={blocksKit} x={b.x} z={b.z} w={b.w} d={b.d} winMat={winMat} delay={lightOrder[i]} />)}
      {/* the low fringe that carries the density out to the neighbours */}
      <Outskirts clear={keepClear} blocks={cluster} />
      {/* a few homes left lit in the sleeping city (independent of the hover glow) */}
      {blocksKit && <OccupiedWindows kit={blocksKit} buildings={cluster} />}
      {/* The tower and its power lines arrive together, with the tower's model.
          Its LifeGroup mounts with it too, so it takes the tower to the right
          level on its first frame rather than on a later sweep. */}
      {towerKit && (
        <LifeGroup slug="alliander-hololens">
          <Skyscraper position={[0, 0, 0]} kit={towerKit} winMat={winMat} />
        </LifeGroup>
      )}
      {/* the neighbourhood transformer house — the substation that powers the
          city, on the front-centre plot facing the camera */}
      {trafoKit && <TransformerHouse position={trafo.position} kit={trafoKit} />}
      {/* the power, underground: the tower (the station) feeds the transformer
          house, and the house each block, a block lighting as power reaches it */}
      {towerKit && blocksKit && <PowerGrid feed={grid.feed} routes={grid.routes} runs={grid.runs} order={grid.order} stagger={lightOrder} house={trafo.position} />}
      {/* the mill's cable to the tower, for the power its sails make (MILL) */}
      {towerKit && <MillLine from={mill.position} />}


      {/* windmill on the side — carries the DTT Amsterdam hotspot */}
      {millKit && (
        <LifeGroup slug="dtt-amsterdam">
          <Windmill position={mill.position} slug="dtt-amsterdam" kit={millKit} />
        </LifeGroup>
      )}
      {/* the Big Dipper rises behind the windmill while it's selected */}
      <Constellation anchor={mill.position} />

      {/* parks (the first carries the arcam hotspot — its trees rustle) */}
      <LifeGroup slug="arcam">
        <Park position={park.position} slug="arcam" />
      </LifeGroup>

      {/* the homecoming celebration + the site that materialises with it */}
      <NextProjectSite />
      <CelebrationBurst />
    </group>
  );
}

