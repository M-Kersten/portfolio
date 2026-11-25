import { useEffect, useRef } from 'react';
import { isTouch } from '../../lib/media';

/* The last portrait, in relief.

   The photo is a dither: white dots on nothing. Here every dot is a point in
   space, pushed towards you by the photo's depth map (public/profile/depth.png:
   white is near, black is the back plane), so the picture is a point cloud of
   the same dots: a bust that turns to look at the cursor. Facing front it is
   the photo, dot for dot; turned, the arms swing in front of the chest and the
   nose leads the cheeks.

   It's a relief, not a head: there is no back to it, so it only ever turns a
   little (TURN). A mouse turns it from anywhere on the page, and it comes back
   to face you when the mouse has been still a while; on a touch screen it turns
   as it scrolls up the screen, and sways.

   Plain WebGL, no three: one buffer of points and one small shader, so About
   doesn't pull the maquette's 3D into the page's first load. Nothing is set up
   until the portrait is near the screen, and nothing is drawn while it's off it. */

/** How the photo sits in its frame: zoomed a touch and anchored low, so the
 *  empty space over the head is cropped and the face sits high. The flat photos
 *  take the same numbers (About.tsx hands them to the CSS). */
export const CROP = { zoom: 1.16, y: 0.85 };

const DEPTH = 193; // the depth map's white, in photo pixels in front of its black
// what it turns about, as a share of the photo (the collar) and photo pixels of depth
const PIVOT = { x: 0.492, y: 0.492, z: 40 };
const TURN = { yaw: 0.4, pitch: 0.13 }; // rad, at most
const REACH = 520; // px from the portrait at which a mouse has it most of the way round
const REST = 3.5; // s of a still mouse before it faces front again
const SWAY = { mouse: 0.035, touch: 0.16 }; // rad, a slow idle turn
/* A ripple of colour through the dots (see Pulse): a thin shell that grows out
   from a point, tinting the dots it passes and fading as it goes. It travels
   through the relief's depth too, so it runs over the face rather than across a
   flat picture. `speed` and `width` are photo pixels, `life` and `every`
   seconds (it repeats while the pulse is held), `tint` how far a dot goes to
   the colour at the front of a fresh ripple. */
const RIPPLE = { speed: 430, width: 46, life: 1.7, every: 1.5, tint: 0.8 };
const RIPPLES = 2; // at once: a second one can set off before the first has faded

/** A point on the portrait's frame to send ripples from, and their colour. */
export interface Pulse {
  x: number; // across the frame, 0..1
  y: number; // down it
  color: string; // #rrggbb
}

const VERT = `
attribute vec4 aP; // x, y in photo pixels; depth 0..1; brightness
uniform vec4 uBox; // the frame's centre in photo pixels (xy) and its half size (zw)
uniform vec3 uPivot;
uniform vec2 uTurn; // yaw, pitch
uniform float uDepth;
uniform mediump float uSize; // the quad drawn for a dot, in pixels
uniform vec4 uRipple[${RIPPLES}]; // a ripple's centre in photo pixels (x, y, depth) and its radius
uniform vec4 uTint[${RIPPLES}]; // its colour, and how strong it still is
varying vec4 vC;
void main() {
  vec3 q = vec3(aP.xy, aP.z * ${DEPTH.toFixed(1)});
  vec3 c = vec3(1.0);
  for (int i = 0; i < ${RIPPLES}; i++) {
    float d = (distance(q, uRipple[i].xyz) - uRipple[i].w) / ${RIPPLE.width.toFixed(1)};
    c = mix(c, uTint[i].rgb, uTint[i].a * exp(-d * d));
  }
  vec3 p = vec3(aP.xy - uPivot.xy, (aP.z * ${DEPTH.toFixed(1)} - uPivot.z) * uDepth);
  float cy = cos(uTurn.x), sy = sin(uTurn.x), cp = cos(uTurn.y), sp = sin(uTurn.y);
  float x = p.x * cy + p.z * sy;
  float z = -p.x * sy + p.z * cy;
  float y = p.y * cp - z * sp;
  gl_Position = vec4((x + uPivot.x - uBox.x) / uBox.z, -(y + uPivot.y - uBox.y) / uBox.w, 0.0, 1.0);
  gl_PointSize = uSize;
  vC = vec4(c, 1.0) * aP.w;
}`;
// A dot is a square of the photo, usually smaller than a screen pixel. Each is
// drawn over the pixels it touches, by how much of each it covers, and they add
// up: where the dots tile, the screen is white; where they're sparse, grey. The
// same sum a browser does scaling the photo down, so facing front it is the
// photo, and there's no moiré between the dots and the pixels as it turns.
const FRAG = `
precision mediump float;
uniform mediump float uSize;
uniform float uDot; // the dot itself, in pixels
varying vec4 vC;
void main() {
  vec2 d = abs(gl_PointCoord - 0.5) * uSize;
  vec2 o = clamp(0.5 + uDot * 0.5 - d, 0.0, min(1.0, uDot));
  gl_FragColor = vC * (o.x * o.y);
}`;

function load(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

/** Every lit dot of the photo as x, y, depth, brightness. */
function points(photo: HTMLImageElement, depth: HTMLImageElement) {
  const w = photo.naturalWidth;
  const h = photo.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  if (!cx) return null;
  cx.drawImage(depth, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data;
  cx.clearRect(0, 0, w, h);
  cx.drawImage(photo, 0, 0);
  const c = cx.getImageData(0, 0, w, h).data;
  let n = 0;
  for (let i = 3; i < c.length; i += 4) if (c[i] > 40) n++;
  const out = new Float32Array(n * 4);
  let o = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (c[i + 3] <= 40) continue;
      out[o++] = x + 0.5;
      out[o++] = y + 0.5;
      out[o++] = d[i] / 255;
      out[o++] = (c[i] / 255) * (c[i + 3] / 255);
    }
  }
  return { data: out, count: n, w, h };
}

export function PortraitRelief({
  photo,
  depth,
  active,
  pulse = null,
  onReady,
}: {
  photo: string;
  depth: string;
  active: boolean;
  /** While set, ripples of its colour run out through the dots from its point (keep the object the same between renders). */
  pulse?: Pulse | null;
  /** It has drawn (true), or lost its canvas (false): the flat photo stands in until, and after. */
  onReady: (ok: boolean) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef(active);
  live.current = active;
  const ready = useRef(onReady);
  ready.current = onReady;
  const pulsing = useRef(pulse);
  pulsing.current = pulse;

  useEffect(() => {
    const canvas = ref.current;
    const box = canvas?.parentElement;
    if (!canvas || !box) return;
    let gone = false;
    let raf = 0;
    let seen = false;
    let started = false;
    let draw: ((now: number) => void) | null = null;
    const touch = isTouch();

    // where it's looking, and where it's asked to
    const turn = { yaw: 0, pitch: 0, depth: 0 };
    const mouse = { x: 0, y: 0, at: -1e9 };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.at = performance.now();
    };

    const start = async () => {
      const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
      if (!gl) return;
      let pts: ReturnType<typeof points>;
      try {
        const [p, d] = await Promise.all([load(photo), load(depth)]);
        pts = points(p, d);
      } catch {
        return; // no depth map: the flat photo stays
      }
      if (gone || !pts) return;

      const shader = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
      };
      const prog = gl.createProgram()!;
      gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        if (import.meta.env.DEV) console.warn('PortraitRelief:', gl.getProgramInfoLog(prog));
        return; // the flat photo stays
      }
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, pts.data, gl.STATIC_DRAW);
      const aP = gl.getAttribLocation(prog, 'aP');
      gl.enableVertexAttribArray(aP);
      gl.vertexAttribPointer(aP, 4, gl.FLOAT, false, 0, 0);
      const u = (name: string) => gl.getUniformLocation(prog, name);
      const uBox = u('uBox');
      const uTurn = u('uTurn');
      const uDepth = u('uDepth');
      const uSize = u('uSize');
      const uDot = u('uDot');
      const uRipple = u('uRipple[0]');
      const uTint = u('uTint[0]');
      const ripple = new Float32Array(RIPPLES * 4);
      const tint = new Float32Array(RIPPLES * 4);
      const born = new Array<number>(RIPPLES).fill(-1e9);
      let slot = 0;
      let held: Pulse | null = null;
      let sent = -1e9;
      gl.uniform3f(u('uPivot'), PIVOT.x * pts.w, PIVOT.y * pts.h, PIVOT.z);
      // the dots add up, the way they do when the photo is scaled down
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.clearColor(0, 0, 0, 0);

      let last = 0;
      let first = true;
      draw = (now: number) => {
        raf = 0;
        if (gone) return;
        const r = box.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = Math.max(1, Math.round(r.width * dpr));
        const H = Math.max(1, Math.round(r.height * dpr));
        if (canvas.width !== W || canvas.height !== H) {
          canvas.width = W;
          canvas.height = H;
          gl.viewport(0, 0, W, H);
        }
        const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
        last = now;
        const t = now / 1000;
        const on = live.current;
        // another photo is showing and this one has gone flat: nothing to draw
        if (!on && turn.depth < 0.002 && !first) {
          turn.depth = turn.yaw = turn.pitch = 0;
          if (seen) raf = requestAnimationFrame(draw!);
          return;
        }

        // where to look
        let yaw = Math.sin(t * 0.55) * (touch ? SWAY.touch : SWAY.mouse);
        let pitch = 0;
        if (touch) {
          // turning as it goes up the screen, from facing front at the middle
          const v = Math.max(-1, Math.min(1, (r.top + r.height / 2 - window.innerHeight / 2) / (window.innerHeight / 2)));
          yaw += -v * TURN.yaw * 0.7;
          pitch = v * TURN.pitch;
        } else {
          const still = (now - mouse.at) / 1000;
          const care = 1 - Math.min(1, Math.max(0, (still - REST) / 1.5)); // lets go after a rest
          yaw += Math.tanh((mouse.x - (r.left + r.width / 2)) / REACH) * TURN.yaw * care;
          pitch = -Math.tanh((mouse.y - (r.top + r.height * 0.3)) / REACH) * TURN.pitch * care;
        }
        const ease = (k: number) => 1 - Math.exp(-dt * k);
        turn.depth += ((on ? 1 : 0) - turn.depth) * ease(on ? 3.2 : 9);
        turn.yaw += (yaw * turn.depth - turn.yaw) * ease(5);
        turn.pitch += (pitch * turn.depth - turn.pitch) * ease(5);

        // the frame, in photo pixels
        const k = (CROP.zoom * r.width) / pts.w; // screen px per photo px
        const top = (r.height - k * pts.h) * CROP.y;
        const bx = pts.w / 2;
        const by = (r.height / 2 - top) / k;
        const hw = r.width / 2 / k;
        const hh = r.height / 2 / k;
        gl.uniform4f(uBox, bx, by, hw, hh);

        // ripples: one as a pulse starts, another every so often while it's held
        const want = on ? pulsing.current : null;
        if (want && (want !== held || now - sent > RIPPLE.every * 1000)) {
          const o = slot * 4;
          slot = (slot + 1) % RIPPLES;
          ripple[o] = bx + (want.x * 2 - 1) * hw;
          ripple[o + 1] = by + (want.y * 2 - 1) * hh;
          ripple[o + 2] = PIVOT.z;
          const rgb = parseInt(want.color.slice(1), 16);
          tint[o] = ((rgb >> 16) & 255) / 255;
          tint[o + 1] = ((rgb >> 8) & 255) / 255;
          tint[o + 2] = (rgb & 255) / 255;
          born[o / 4] = now;
          sent = now;
        }
        held = want;
        for (let i = 0; i < RIPPLES; i++) {
          const age = (now - born[i]) / 1000;
          const left = Math.max(0, 1 - age / RIPPLE.life);
          ripple[i * 4 + 3] = age * RIPPLE.speed;
          // in over the first tenth of a second, then fading all the way out
          tint[i * 4 + 3] = RIPPLE.tint * Math.min(1, age / 0.1) * left * Math.sqrt(left);
        }
        gl.uniform4fv(uRipple, ripple);
        gl.uniform4fv(uTint, tint);
        gl.uniform2f(uTurn, turn.yaw, turn.pitch);
        gl.uniform1f(uDepth, turn.depth);
        const s = k * dpr; // a dot, in device pixels
        gl.uniform1f(uSize, Math.ceil(s) + 1);
        gl.uniform1f(uDot, s);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.POINTS, 0, pts.count);
        if (first) {
          first = false;
          ready.current(true);
        }
        if (seen) raf = requestAnimationFrame(draw!);
      };
      if (seen) raf = requestAnimationFrame(draw);
    };
    const onLost = () => {
      gone = true; // the browser took the canvas back: the flat photo stands in
      ready.current(false);
    };
    canvas.addEventListener('webglcontextlost', onLost);

    const io = new IntersectionObserver(
      ([entry]) => {
        seen = entry.isIntersecting;
        if (seen && !started) {
          started = true;
          void start();
        } else if (seen && draw && !raf) {
          raf = requestAnimationFrame(draw);
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(box);
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      gone = true;
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('webglcontextlost', onLost);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [photo, depth]);

  return <canvas ref={ref} className="about__relief" aria-hidden="true" />;
}
