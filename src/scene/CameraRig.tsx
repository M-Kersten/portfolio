import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type PerspectiveCamera } from 'three';
import { useReducedMotion } from '../lib/media';
import { spring, springVec } from '../lib/spring';
import { opening, returning, sceneStore, useSceneSelector } from './store';
import { maquetteLoaded } from './maquette/kit';
import { compileForBuffer } from './warm';
import { HOTSPOTS, fitScale, fitFov, layerGap, overviewFit, portraitMix, CAMERA, LAUNCH } from './framing';
import { anchorWorld, journeyView, nodeView, launchShot, launchTrack, type Framing } from './views';
import { viewFor } from '../dev/tuning';

// The camera is driven by the scroll journey (which layer is centred) and by the
// selected node (zoom in).

// The opening shot, played once (a first visit): the camera starts in close on
// the Chip, at the bottom of the model, and rises past the Room to the City,
// where the page begins, while the whole model makes one turn under it (the
// Maquette's turntable). It shows what the page is before a word of it is
// read: three floors, one on top of the other. The model stays dark for it,
// as it's found: what lights up is what a visitor opens. (It used to be a
// dolly-in on the City alone, which never showed the two floors under it; and
// for a while every exhibit was lit on the way up, which gave away what the
// exploring is for.)
//
// The page is laid out from its first frame as it will rest: the model stands
// where it stands on the City's beat, beside the words (or under them, on an
// upright screen), each floor passing through its own resting place. So the
// opening's line stands where the title will, and nothing has to move aside
// when the title comes.
//
// `dur`: seconds for the rise; `turn`: how far the model turns under it (it
// ends square on). It turns the way that brings each floor's long side round
// from end-on as the camera reaches it — the City arrives narrow and opens out
// to its resting spread, its park swinging out to the right — so the model
// never reaches over the words beside it; the other way, the park came round
// through them. `land`: how far through the line gives way to the title;
// `startZoom`, `startDrop`: the first frame, a little closer in on the Chip
// than its overview and a little lower.
//
// It plays on its own frame time, from when the shot is ready, so it always
// plays in full — a slow cold load delays it rather than eating it — and a
// stalled frame pauses it instead of jumping it forward. It doesn't leave
// until the shot is ready: the camera holds the first frame until every model
// has arrived and the scene's shaders are compiled (INTRO_WAIT at most), so
// nothing pops in under the move and no first-draw compile stalls a frame of
// it. Both the rise and the turn ease up from a standstill and settle to one.
const OPENING = { dur: 6.2, turn: Math.PI * 2, land: 0.78, startZoom: 0.92, startDrop: 0.06 };
// A returning visitor has had the opening, and once is enough: theirs is a
// short push-in on the City with the title already up. `dur`: its seconds;
// `from`: how much further out it starts.
const ARRIVAL = { dur: 2.4, from: 1.2 };
/** The shot this visit gets, in seconds. */
const SHOT_DUR = returning ? ARRIVAL.dur : OPENING.dur;
const INTRO_WAIT = 2500; // ms

/** A smooth path through three points (Catmull–Rom, its ends mirrored), `u`
 *  0 → 1 from the first to the last; written into `out`. */
function through(a: Vector3, b: Vector3, c: Vector3, u: number, out: Vector3): Vector3 {
  const s = Math.min(Math.max(u, 0), 1) * 2;
  const second = s >= 1;
  const t = second ? s - 1 : s;
  const at = (k: 'x' | 'y' | 'z') => {
    const p0 = second ? a[k] : 2 * a[k] - b[k];
    const p1 = second ? b[k] : a[k];
    const p2 = second ? c[k] : b[k];
    const p3 = second ? 2 * c[k] - b[k] : c[k];
    return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
  };
  return out.set(at('x'), at('y'), at('z'));
}
/** An angle the short way round: into (-π, π]. */
const wrapAngle = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

// Porthole focus: the woken object is framed inside the reticle ring — left of
// centre on a desktop so the dossier clears on the right, high on a phone so the
// sheet can rise beneath it. The camera aims straight at the object (LIFT
// undoes the hotspot's authored aimDown) and setViewOffset then slides the
// whole image so that point lands on the ring's centre, moving the object
// across the frame without moving the camera, so the framing angle is kept.
// The ring's centre is read from the same custom properties the reticle is
// drawn with (--fr-cx / --fr-cy, porthole.css), so the two can't disagree at
// any screen size. The slide animates in with the zoom.
const PORTHOLE_LIFT = 1.0;
function readPorthole(): { x: number; y: number } {
  const cs = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const pct = (name: string, fallback: number) => {
    const n = parseFloat(cs?.getPropertyValue(name) ?? '');
    return Number.isFinite(n) ? n / 100 : fallback;
  };
  return { x: pct('--fr-cx', 0.3), y: pct('--fr-cy', 0.5) };
}
// Seconds the camera holds still after a selection while the reticle materialises
// over the object and locks onto it. Mirrors the hold in the fr-acquire keyframes
// (porthole.css) — the two are one movement and have to agree.
const ACQUIRE_HOLD = 0.4;
// Seconds from selection to the push-in visually settling — the acquire hold
// above, plus how long the camera's spring (CAMERA.glide, 0.37s) takes to close
// ~95% of the distance: 2.37 × 0.37 ≈ 0.88s. Gates store.zoomSettled,
// which useActive ANDs into `selected` — so an object's wake animations start
// on arrival instead of partway through the swoop in.
const ZOOM_SETTLE = ACQUIRE_HOLD + 0.9;

// A hop: the selection moves straight from one exhibit to the next while
// zoomed in (a walk from the label or the book, a story link). Played as its
// own move rather than as a fresh push-in, which used to zoom most of the way
// back out during the acquire hold, swing the whole image sideways off the
// porthole and back, then lurch in: one glide instead, on a timed curve that
// starts and ends at rest, with the aim and the view angle travelling together
// and the camera easing back a little mid-flight (more for a longer hop, so a
// jump between layers arcs over the model rather than cutting through it). The
// porthole stays where it is. `base`, `perUnit`, `min`, `max`: its length in
// seconds, by how far the aim travels (world units); `lift*`: the pull-back at
// its middle, as a share of the viewing distance; `settle`: how far through it
// the camera counts as arrived (the label opens as it settles).
const HOP = { base: 0.95, perUnit: 0.32, min: 1.05, max: 1.7, liftPerUnit: 0.16, liftMin: 0.06, liftMax: 0.42, settle: 0.8 };
const smootherstep = (u: number) => u * u * u * (u * (u * 6 - 15) + 10);

// The camera's moves ride a critically damped spring (lib/spring.ts) at
// CAMERA.glide.

export function CameraRig() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const reduced = useReducedMotion();

  const journeyStep = useSceneSelector((s) => s.journeyStep);
  const selectedSlug = useSceneSelector((s) => s.selectedSlug);
  const launch = useSceneSelector((s) => s.launch);
  const textEdge = useSceneSelector((s) => s.textEdge);
  const headTop = useSceneSelector((s) => s.headTop);

  // the porthole's centre as viewport fractions; the breakpoints move it, so
  // it's re-read whenever the canvas resizes
  const porthole = useMemo(readPorthole, [size.width, size.height]);

  const sway = useRef(0);
  const nodeAge = useRef(0); // seconds since the current node was selected
  const prevSel = useRef<string | null>(null);
  const shakeOff = useRef(new Vector3()); // last frame's positional jitter
  const shakeRight = useRef(new Vector3());
  const shakeUp = useRef(new Vector3());
  const flightCut = useRef(-1); // the cinematic camera last flown (-1 = not flying yet)
  const target = useRef(new Vector3().copy(journeyView(0).target));
  const desiredPos = useRef(new Vector3());
  const desiredTarget = useRef(new Vector3());
  const focusAmt = useRef(0); // 0 overview → 1 zoomed on a node (drives the porthole view-offset)
  // The overview's slide: how far the image sits to the right (a share of the
  // screen's width), clear of the words beside the model (overviewFit). Rides
  // the camera's spring between floors; a resize or a new measure of the words
  // sets it outright (`slideFor`: what it was last worked out for).
  const slide = useRef(0);
  const slideVel = useRef({ v: 0 });
  const drop = useRef(0); // …and down, clear of the header on a short screen
  const dropVel = useRef({ v: 0 });
  const slideFor = useRef('');
  // the spring's velocities (see spring): the camera, its aim, its lens, the porthole's slide
  const posVel = useRef(new Vector3());
  const aimVel = useRef(new Vector3());
  const fovVel = useRef({ v: 0 });
  const focusVel = useRef({ v: 0 });
  // something else is steering (the intro's dolly, the launch, a hop): the spring picks up from rest
  const restSpring = () => {
    posVel.current.set(0, 0, 0);
    aimVel.current.set(0, 0, 0);
    fovVel.current.v = 0;
  };
  // the hop in flight (see HOP): where it set off from, and how far along it is
  const hop = useRef<{ fromPos: Vector3; fromTarget: Vector3; fromOff: Vector3; fromFov: number; t: number; dur: number; lift: number } | null>(null);
  const hopTo = useRef(new Vector3());
  const hopDir = useRef(new Vector3());
  // Reduced motion skips the opening — straight to the City overview.
  const introDone = useRef(reduced);
  const introReady = useRef(false); // models in, shaders compiled: the dolly may go
  const introT = useRef(0); // seconds of the dolly played
  const skipIntro = useRef(false); // any scroll / tap / key cancels the intro

  // The opening's path for this screen: from in close on the Chip, past the
  // Room's overview, to the City's — each as the scroll journey frames it, so
  // the shot ends exactly where that logic rests (its pull-back on a narrow
  // screen included: ending short of it, the camera eased to a stop and then
  // crept on to the real resting spot, a second move right as it settled).
  // A returning visitor's is the City's framing alone, from further out.
  const shot = useRef({ from: { pos: new Vector3(), target: new Vector3() }, pos: new Vector3(), target: new Vector3() });
  const openingAt = (u: number, aspect: number) => {
    const g = layerGap(aspect);
    const rest = (step: number) => {
      const f: Framing = journeyView(step, g, aspect, overviewFit(step, size.width, size.height, textEdge, headTop).back);
      f.pos.sub(f.target).multiplyScalar(fitScale(aspect)).add(f.target);
      return f;
    };
    const city = rest(0);
    const out = shot.current;
    if (returning) {
      const k = ARRIVAL.from + (1 - ARRIVAL.from) * Math.min(Math.max(u, 0), 1);
      out.target.copy(city.target);
      out.pos.copy(city.pos).sub(city.target).multiplyScalar(k).add(city.target);
      return out;
    }
    const chip = rest(2);
    const room = rest(1);
    const from = out.from;
    from.target.copy(chip.target).setY(chip.target.y - OPENING.startDrop);
    from.pos.copy(chip.pos).sub(chip.target).multiplyScalar(OPENING.startZoom).add(from.target);
    through(from.pos, room.pos, city.pos, u, out.pos);
    through(from.target, room.target, city.target, u, out.target);
    return out;
  };

  // Park the camera at the shot's START before anything is painted. The Canvas
  // creates it at MAQUETTE_HOME — the settled overview, i.e. the shot's
  // DESTINATION — so without this the first frame shows the end of the shot, then
  // the opening's first useFrame teleports down to the Chip and travels back up.
  // That reads exactly as the camera jumping to a spot and then correcting
  // itself. Layout effect, so it lands before the first painted frame.
  useLayoutEffect(() => {
    // Only when the opening is actually going to play: a deep link or a restored
    // scroll position hands the camera to the node/journey logic instead, and that
    // should ease from the overview, not from a shot it never intended to use.
    if (introDone.current || selectedSlug || journeyStep !== 0) return;
    if (!size.width || !size.height) return; // an unmeasured canvas would make the aspect NaN
    const s = openingAt(0, size.width / size.height);
    camera.position.copy(s.pos);
    target.current.copy(s.target);
    camera.lookAt(target.current);
    opening.dollying = true;
    opening.pivotY = s.target.y - CAMERA.overviewLift;
    // (the turn, the line and the waiting markers are the first visit's)
    if (!returning) {
      opening.spin = OPENING.turn;
      sceneStore.setOpening('wait');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ready the shot: wait for the models (or INTRO_WAIT), give the arrivals two
  // frames to mount into the scene, then compile every shader the scene holds,
  // while the camera is still parked and a stalled frame is invisible.
  useEffect(() => {
    if (introDone.current) return;
    let live = true;
    const go = () => {
      if (live) introReady.current = true;
    };
    const cap = new Promise<void>((r) => window.setTimeout(r, INTRO_WAIT));
    Promise.race([maquetteLoaded(), cap]).then(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!live) return;
          // Synchronous on purpose (see warm.ts); the stall this costs lands on
          // the parked shot. For the composer's buffer: compiled for the
          // screen, every program here went unused and the first draw of
          // anything hidden at load still stalled.
          try {
            compileForBuffer(gl, scene, camera);
          } catch {
            /* a shader that fails here fails on its first draw anyway */
          }
          go();
        }),
      ),
    );
    // whatever happens above, the dolly goes
    const failsafe = window.setTimeout(go, INTRO_WAIT + 1500);
    return () => {
      live = false;
      clearTimeout(failsafe);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // dev: the capture scripts read the camera, the opening's clock and the
  // store, and try framings on the live tuning (CAMERA) before they're written
  // into framing.ts
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __cam: unknown }).__cam = { camera, scene, opening, introT, introReady, store: sceneStore, CAMERA, invalidate };
  }, [camera, invalidate]);

  // State changes (and resizes) need at least one frame in demand mode; the FOV
  // itself is driven per-frame in useFrame so it can ease when zooming in/out.
  useEffect(() => {
    invalidate();
  }, [journeyStep, selectedSlug, launch, textEdge, headTop, size, camera, invalidate]);

  // The load intro yields to the visitor: the first scroll / tap / key press
  // cancels the dolly and hands control straight back to the scroll journey.
  useEffect(() => {
    const cancel = () => {
      skipIntro.current = true;
    };
    const opts: AddEventListenerOptions = { passive: true, once: true };
    window.addEventListener('wheel', cancel, opts);
    window.addEventListener('touchstart', cancel, opts);
    window.addEventListener('pointerdown', cancel, opts);
    window.addEventListener('keydown', cancel, { once: true });
    return () => {
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchstart', cancel);
      window.removeEventListener('pointerdown', cancel);
      window.removeEventListener('keydown', cancel);
    };
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const DEG = Math.PI / 180;

    // Undo last frame's camera-shake jitter before any easing math runs — the
    // shake is a per-frame display offset (added after lookAt below), never
    // part of the camera's actual path, so it can't accumulate or steer.
    camera.position.sub(shakeOff.current);
    shakeOff.current.set(0, 0, 0);

    // ---- Porthole focus offset: slide the projection so the woken node sits
    // in the reticle (see readPorthole). setViewOffset moves the image without
    // moving the camera; the per-frame FOV updates below preserve it. Eases in
    // and out with the zoom.
    // …and it waits out the acquire hold too. This pan slides the WHOLE image
    // sideways, so if it ran while the reticle was still locking on, the object
    // would crawl out from under a ring that hasn't moved yet. `justSwitched`
    // covers the first frame, where nodeAge is still the outgoing node's.
    // A hop holds the porthole where it is (see HOP).
    const justSwitched = selectedSlug !== prevSel.current;
    const isExhibit = (slug: string | null) => !!slug && HOTSPOTS.some((h) => h.slug === slug);
    const hopping = justSwitched
      ? !reduced && launch === 'idle' && introDone.current && isExhibit(prevSel.current) && isExhibit(selectedSlug)
      : hop.current !== null;
    const holdFocus = !!selectedSlug && !reduced && !hopping && (justSwitched || nodeAge.current < ACQUIRE_HOLD);
    const wantFocus = !!selectedSlug && launch === 'idle' && !holdFocus;
    if (reduced) focusAmt.current = wantFocus ? 1 : 0;
    else focusAmt.current = Math.min(1, Math.max(0, spring(focusAmt.current, wantFocus ? 1 : 0, focusVel.current, dt, CAMERA.glide)));
    // ---- The overview's slide: the floor sits in the room the words beside it
    // leave (overviewFit), by the same means: the image is slid, the camera
    // looks straight at the floor. It gives way to the porthole's offset as a
    // node is zoomed in on, and to nothing for a launch (the rocket has the
    // middle of the screen).
    const seat = overviewFit(journeyStep, size.width, size.height, textEdge, headTop);
    const aside = launch === 'idle';
    const wantSlide = aside ? seat.shift : 0;
    const wantDrop = aside ? seat.drop : 0;
    const measuredFor = `${size.width}x${size.height}/${textEdge}/${headTop}`;
    if (reduced || slideFor.current !== measuredFor) {
      slide.current = wantSlide;
      drop.current = wantDrop;
      slideVel.current.v = dropVel.current.v = 0;
      slideFor.current = measuredFor;
    } else if (slide.current !== wantSlide || drop.current !== wantDrop) {
      slide.current = spring(slide.current, wantSlide, slideVel.current, dt, CAMERA.glide);
      drop.current = spring(drop.current, wantDrop, dropVel.current, dt, CAMERA.glide);
      if (Math.abs(slide.current - wantSlide) < 0.0002 && Math.abs(slideVel.current.v) < 0.0002) slide.current = wantSlide;
      if (Math.abs(drop.current - wantDrop) < 0.0002 && Math.abs(dropVel.current.v) < 0.0002) drop.current = wantDrop;
      invalidate();
    }
    const pcam = camera as PerspectiveCamera;
    if (pcam.isPerspectiveCamera) {
      const f = focusAmt.current;
      const offX = (0.5 - porthole.x) * f - slide.current * (1 - f);
      const offY = (0.5 - porthole.y) * f - drop.current * (1 - f);
      if (Math.abs(offX) > 0.0002 || Math.abs(offY) > 0.0002) {
        pcam.setViewOffset(size.width, size.height, offX * size.width, offY * size.height, size.width, size.height);
      } else if (pcam.view?.enabled) {
        pcam.clearViewOffset();
      }
    }

    const aspect = size.width / size.height;

    // ---- The opening shot (see OPENING): up from the Chip to the City while
    // the model turns under the camera; or a returning visitor's push-in on
    // the City (ARRIVAL). Cancelled the moment the visitor scrolls/taps, on a
    // deep link (a node is already selected), during a launch, or once it
    // completes — then the normal journey logic below takes over from wherever
    // the camera is.
    if (!introDone.current) {
      // Played on the shot's own frame time, from when it's ready (see
      // INTRO_WAIT): not the shared boot clock, which a slow load had already
      // spent part of (the camera then snapped into the middle of the move),
      // and not the wall clock, which jumps it forward after a dropped frame.
      // Until it's ready p stays 0: the camera holds the first frame.
      // (A frame up to 1/15 s counts in full, so a slow device still plays
      // the move in its own time; only a real stall is cut short.)
      if (introReady.current) introT.current += Math.min(delta, 1 / 15);
      const p = introT.current / SHOT_DUR;
      if (skipIntro.current || selectedSlug || journeyStep !== 0 || launch !== 'idle' || p >= 1) {
        introDone.current = true;
        opening.dollying = false;
        // Cut short, the model comes round the short way from wherever it had
        // got to (eased home below); never started, it's simply square on.
        opening.spin = p > 0 && p < 1 ? wrapAngle(opening.spin) : 0;
        sceneStore.setOpening('idle');
      } else {
        const s = openingAt(smootherstep(p), aspect);
        camera.position.copy(s.pos);
        target.current.copy(s.target);
        camera.lookAt(target.current);
        opening.pivotY = s.target.y - CAMERA.overviewLift;
        if (!returning) {
          // the turn finishes a touch before the rise does, so the model is
          // already square on as the camera settles
          opening.spin = OPENING.turn * (1 - smootherstep(Math.min(1, p / 0.94)));
          sceneStore.setOpening(!introReady.current ? 'wait' : p < OPENING.land ? 'rise' : 'land');
        }
        restSpring();
        const cam0 = camera as PerspectiveCamera;
        const wantFov0 = fitFov(aspect);
        if (cam0.isPerspectiveCamera && Math.abs(cam0.fov - wantFov0) > 0.01) {
          cam0.fov = wantFov0;
          cam0.updateProjectionMatrix();
        }
        invalidate();
        return;
      }
    }

    // a turn left over from an opening that was cut short eases home
    if (opening.spin !== 0) {
      opening.spin *= Math.exp(-7 * dt);
      if (Math.abs(opening.spin) < 0.002) opening.spin = 0;
      invalidate();
    }

    const gap = layerGap(aspect); // layers spread apart on tall screens

    // ---- Launch mode: the camera belongs to the rocket -------------------
    // On the pad (and through the count) it frames the vehicle three-quarter.
    // From the count on it flies the film's shots (launchShot, choreographed
    // in maquette/launch.ts and written by the launch site each frame): the
    // pad through the count, the ground for liftoff, riding the stack for the
    // climb, alongside for staging, the tower for the booster's catch —
    // cutting from one camera to the next.
    // Overrides journey + node.
    if (launch !== 'idle') {
      restSpring();
      const flying = launch !== 'pad' && launchShot.active;
      const fit = fitScale(aspect);
      if (flying) {
        // the shot pulls back on narrow screens as far as it asks to (a camera
        // riding on the rocket stays where it is: on a tall screen the column
        // fits better, not worse)
        const pull = 1 + (fit - 1) * launchShot.pull;
        desiredTarget.current.copy(launchShot.target);
        desiredPos.current.copy(launchShot.pos).sub(launchShot.target).multiplyScalar(pull).add(launchShot.target);
      } else {
        const offRaw = LAUNCH.padOffset;
        desiredTarget.current.set(launchTrack.x, launchTrack.y - LAUNCH.padAim, launchTrack.z);
        desiredPos.current.set(launchTrack.x + offRaw[0] * fit, launchTrack.y + offRaw[1], launchTrack.z + offRaw[2] * fit);
      }
      // a new camera in the cinematic is a cut, not a flight to it (the first
      // still glides down off the pad framing)
      const cut = flying && flightCut.current >= 0 && launchShot.cut !== flightCut.current;
      flightCut.current = flying ? launchShot.cut : -1;
      const cam = camera as PerspectiveCamera;
      const wantFov = fitFov(aspect) + (flying ? launchShot.fov : LAUNCH.fovZoom);
      if (cam.isPerspectiveCamera) {
        const nextFov = reduced || cut ? wantFov : cam.fov + (wantFov - cam.fov) * (1 - Math.exp(-CAMERA.fovLerp * dt));
        if (Math.abs(nextFov - cam.fov) > 0.002) {
          cam.fov = nextFov;
          cam.updateProjectionMatrix();
        }
      }
      let amp = 0;
      if (reduced || cut) {
        camera.position.copy(desiredPos.current);
        target.current.copy(desiredTarget.current);
        if (cut) amp = launchShot.shake;
      } else {
        // In flight the shots are already smooth, so the camera holds them
        // exactly — after a soft first second and a half that carries it down
        // off the pad framing into the first shot (a chasing ease would trail
        // a stack doing several of its own lengths a second). On the pad it
        // glides as usual.
        const since = launchShot.since;
        const settle = Math.min(1, Math.max(0, (since - 0.3) / 1.4));
        const k = flying ? Math.max(1 - Math.exp(-2.4 * dt), settle * settle * (3 - 2 * settle)) : 1 - Math.exp(-3.4 * dt);
        camera.position.lerp(desiredPos.current, k);
        target.current.lerp(desiredTarget.current, k);
        // whatever the film's shot asks for
        amp = flying ? launchShot.shake : 0;
      }
      camera.lookAt(target.current);
      // ---- camera rumble: position only ----
      // Applied AFTER lookAt, across the view plane (camera-local right/up), so
      // the whole frame moves rather than the aim wobbling. Smooth, layered
      // sines rather than a fresh random offset every frame: that read as a
      // jittery handheld, this as the ground shaking under a tripod.
      if (amp > 0) {
        const tt = performance.now() / 1000;
        const nx = Math.sin(tt * 37.1) * 0.55 + Math.sin(tt * 23.3 + 1.7) * 0.45;
        const ny = Math.sin(tt * 31.7 + 0.6) * 0.55 + Math.sin(tt * 19.9 + 2.9) * 0.45;
        shakeRight.current.set(1, 0, 0).applyQuaternion(camera.quaternion);
        shakeUp.current.set(0, 1, 0).applyQuaternion(camera.quaternion);
        shakeOff.current.addScaledVector(shakeRight.current, nx * amp).addScaledVector(shakeUp.current, ny * amp);
        camera.position.add(shakeOff.current);
      }
      return;
    }

    const hotspot = selectedSlug ? HOTSPOTS.find((h) => h.slug === selectedSlug) : undefined;
    // The close-up framing for this node: its own `view` overrides falling back
    // to the CAMERA defaults, and in dev the live values from the dev tools.
    const view = hotspot ? viewFor(hotspot) : undefined;

    // Restart the pan (and its ease-in) whenever the selection changes, so it
    // begins centred on the freshly-framed node and drifts out from there.
    if (selectedSlug !== prevSel.current) {
      prevSel.current = selectedSlug;
      nodeAge.current = 0;
      sway.current = 0;
      // straight from one exhibit to another: a hop, from wherever the camera is
      const cam0 = camera as PerspectiveCamera;
      hop.current =
        hotspot && hopping
          ? {
              fromPos: camera.position.clone(),
              fromTarget: target.current.clone(),
              fromOff: new Vector3(),
              fromFov: cam0.isPerspectiveCamera ? cam0.fov : 0,
              t: 0,
              dur: 0,
              lift: 0,
            }
          : null;
      // setSelected already latched zoomSettled false for a fresh push-in, so the
      // rig only ever RELEASES it — one owner per edge, no race. Reduced motion
      // has no glide to wait out and a selection with no hotspot has nothing to
      // arrive at, so those release on this same frame.
      if (reduced || !hotspot) sceneStore.setZoomSettled(true);
      // Capture where the object sits on screen RIGHT NOW (camera still wide) so
      // the porthole reticle can appear ON it and fly to the ring centre as the
      // camera zooms in. Off-screen / reduced-motion → no fly-in (opens centred).
      if (hotspot) {
        // (a hop keeps the ring locked on the porthole: no fly-in)
        const ndc = anchorWorld(hotspot, gap).project(camera);
        const onScreen = !reduced && !hop.current && ndc.z < 1 && Math.abs(ndc.x) < 1.4 && Math.abs(ndc.y) < 1.4;
        sceneStore.setReticleStart({
          slug: hotspot.slug,
          pos: onScreen ? { x: (ndc.x * 0.5 + 0.5) * 100, y: (-ndc.y * 0.5 + 0.5) * 100 } : null,
        });
      } else {
        sceneStore.setReticleStart(null);
      }
    }
    if (hotspot) {
      nodeAge.current += dt;
      // (a hop says when it has arrived itself, below)
      if (!hop.current && nodeAge.current >= ZOOM_SETTLE) sceneStore.setZoomSettled(true);
    }

    // ---- The acquire hold. If the push-in started the instant you select, the
    // camera would be well on its way before the reticle had even begun to
    // travel, and the ring would land late. So hold the previous framing while
    // the reticle finds and locks the target, then release: the push-in and the
    // ring's travel start on the same beat and ease the same way (the ring's
    // curve is fitted to the camera's spring). Must match ACQUIRE_HOLD in the
    // fr-acquire keyframes.
    const acquiring = !!hotspot && !reduced && !hop.current && nodeAge.current < ACQUIRE_HOLD;
    const framed = hotspot && !acquiring ? hotspot : undefined;

    const base = framed ? nodeView(framed, gap, view!) : journeyView(journeyStep, gap, aspect, seat.back);
    desiredTarget.current.copy(base.target);

    // Ease the camera back on narrow/tall viewports so the whole active layer
    // stays in frame (see fitScale). The offset keeps its direction — the same
    // three-quarter angle — just longer, so the maquette reads smaller but whole.
    // A close-up takes only part of that (CAMERA.nodeFit): it has one object to
    // fit in the porthole, not a layer to fit across the screen.
    const baseFov = fitFov(aspect);
    const wantFov = baseFov + (framed ? view!.fovZoom : 0);
    const fit = framed
      ? (1 + (fitScale(aspect) - 1) * CAMERA.nodeFit) * (1 + (view!.mobileZoom - 1) * portraitMix(aspect))
      : fitScale(aspect);
    const off = base.pos.clone().sub(base.target).multiplyScalar(fit);
    // Zooming into a node widens the lens (wantFov); pull the camera in by the
    // matching amount so the node keeps its framing — the wider FOV then only
    // warps perspective, it doesn't throw the subject around the frame.
    if (framed) off.multiplyScalar(Math.tan((baseFov / 2) * DEG) / Math.tan((wantFov / 2) * DEG));

    // Porthole focus: aim at the object itself (undoing the authored aimDown) —
    // the view-offset slide up top then carries it onto the ring's centre. The
    // camera position is untouched, so the angle holds.
    if (framed) desiredTarget.current.y += view!.aimDown * PORTHOLE_LIFT;

    if (!reduced) {
      // Once a node has settled (nodeOrbitDelay), a slow pan eases in over
      // nodeOrbitRamp and drifts the camera around it; the overview keeps a
      // smaller, always-on idle sway.
      let ease = 1;
      if (hotspot) {
        const e = Math.min(Math.max((nodeAge.current - CAMERA.nodeOrbitDelay) / CAMERA.nodeOrbitRamp, 0), 1);
        ease = e * e * (3 - 2 * e); // smoothstep
      }
      const orbit = hotspot && view ? view.orbit : 1; // a wide close-up pans less (HotspotView.orbit)
      const amp = (hotspot ? CAMERA.nodeOrbitAmp * orbit : CAMERA.idleSwayAmp) * ease;
      const speed = hotspot ? CAMERA.nodeOrbitSpeed : CAMERA.idleSwaySpeed;
      sway.current += dt * speed;
      const a = Math.sin(sway.current) * amp;
      const bob = hotspot ? Math.cos(sway.current) * CAMERA.nodeOrbitBob * orbit * ease : 0;
      desiredPos.current.set(
        base.target.x + off.x * Math.cos(a) - off.z * Math.sin(a),
        base.target.y + off.y + bob,
        base.target.z + off.x * Math.sin(a) + off.z * Math.cos(a),
      );
    } else {
      desiredPos.current.copy(base.target).add(off);
    }

    const cam = camera as PerspectiveCamera;

    // ---- The hop (see HOP): the aim travels from where it was to the new
    // object, the view's direction turns from the old angle to the new one and
    // its distance from the old to the new, with a pull-back at the middle, all
    // on one curve that leaves and arrives at rest; the lens with them. The
    // chase below takes over from exactly where it ends.
    const h = hop.current;
    if (h && framed) {
      if (!h.dur) {
        const d = h.fromTarget.distanceTo(desiredTarget.current);
        h.dur = Math.min(HOP.max, Math.max(HOP.min, HOP.base + HOP.perUnit * d));
        h.lift = Math.min(HOP.liftMax, Math.max(HOP.liftMin, HOP.liftPerUnit * d));
        h.fromOff.copy(h.fromPos).sub(h.fromTarget);
      }
      h.t += dt;
      const u = Math.min(1, h.t / h.dur);
      const e = smootherstep(u);
      target.current.copy(h.fromTarget).lerp(desiredTarget.current, e);
      const to = hopTo.current.copy(desiredPos.current).sub(desiredTarget.current);
      const len = (h.fromOff.length() + (to.length() - h.fromOff.length()) * e) * (1 + h.lift * Math.sin(Math.PI * e));
      const dir = hopDir.current.copy(h.fromOff).normalize().lerp(to.normalize(), e).normalize();
      camera.position.copy(target.current).addScaledVector(dir, len);
      if (cam.isPerspectiveCamera && h.fromFov) {
        cam.fov = h.fromFov + (wantFov - h.fromFov) * e;
        cam.updateProjectionMatrix();
      }
      if (u >= HOP.settle) sceneStore.setZoomSettled(true);
      if (u >= 1) hop.current = null;
      restSpring();
      camera.lookAt(target.current);
      return;
    }

    // The lens breathes with the zoom: the FOV widens as the camera dollies in
    // and settles back as it pulls out, on the camera's own spring, so the
    // dolly and the lens (which the pull-in above compensates for) move as one.
    if (cam.isPerspectiveCamera) {
      const nextFov = reduced ? wantFov : spring(cam.fov, wantFov, fovVel.current, dt, CAMERA.glide);
      if (Math.abs(nextFov - cam.fov) > 0.002) {
        cam.fov = nextFov;
        cam.updateProjectionMatrix();
      }
    }

    if (reduced) {
      camera.position.copy(desiredPos.current);
      target.current.copy(desiredTarget.current);
      restSpring();
    } else {
      springVec(camera.position, desiredPos.current, posVel.current, dt, CAMERA.glide);
      springVec(target.current, desiredTarget.current, aimVel.current, dt, CAMERA.glide);
    }
    camera.lookAt(target.current);
  });

  return null;
}
