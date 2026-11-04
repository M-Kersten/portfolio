import { WebGLRenderTarget, type Camera, type Object3D, type Scene, type WebGLRenderer } from 'three';
import { opening } from './store';

/* Compiling shaders before their first draw, for where they'll be drawn.

   The scene is only ever drawn into the effect composer's buffer (Stage),
   never straight to the screen, and three builds a material a different
   program for each: the output colour space is part of it. renderer.compile
   with nothing bound builds the screen's, which nothing then uses, while the
   real one is still built at the first draw. So a target is bound while it
   runs. compile only hands the shaders to the GPU; three waits for a program
   on its first use. (Not compileAsync: its readiness poll throws on a
   material that's been swapped out in the meantime, and never resolves.) */

let target: WebGLRenderTarget | null = null; // 1×1, never drawn into

/** renderer.compile(scene, camera, lights) for the composer's buffer. `lights`
 *  is the scene the lights (and fog and environment) are taken from; by
 *  default the scene itself. */
export function compileForBuffer(gl: WebGLRenderer, scene: Object3D, camera: Camera, lights: Scene | null = null) {
  target ??= new WebGLRenderTarget(1, 1);
  const bound = gl.getRenderTarget();
  gl.setRenderTarget(target);
  try {
    gl.compile(scene, camera, lights);
  } finally {
    gl.setRenderTarget(bound);
  }
}

/** Run when the page is idle (or soon, where there's no requestIdleCallback). */
export function whenIdle(fn: () => void): number {
  return window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 500 }) : window.setTimeout(fn, 32);
}
export function cancelIdle(id: number) {
  if (window.cancelIdleCallback) window.cancelIdleCallback(id);
  else window.clearTimeout(id);
}

/** Call `fn` once the page is quiet: no sooner than `delay` ms from now, not
 *  during the opening dolly (whatever this work costs mustn't land on the
 *  camera's one showpiece move), and when the browser is idle. Returns a
 *  cancel. */
export function whenQuiet(fn: () => void, delay: number): () => void {
  let live = true;
  let timer = 0;
  let idle = 0;
  const check = () => {
    if (!live) return;
    if (opening.dollying) timer = window.setTimeout(check, 400);
    else idle = whenIdle(() => live && fn());
  };
  timer = window.setTimeout(check, delay);
  return () => {
    live = false;
    window.clearTimeout(timer);
    cancelIdle(idle);
  };
}

/** Compile these objects' materials (compileForBuffer, lights and all from
 *  `lights`), a batch per idle slice. Returns a cancel. */
export function compileInBatches(gl: WebGLRenderer, camera: Camera, objects: Object3D[], lights: Scene, batch = 24): () => void {
  let live = true;
  let idle = 0;
  const queue = objects.slice();
  const step = () => {
    if (!live) return;
    const part = queue.splice(0, batch);
    // compile hands its `scene` to traverse() for the materials and to
    // traverseVisible() for lights; a batch stands in for it, so each object
    // is compiled on its own rather than with everything under it
    const asScene = { traverse: (fn: (o: Object3D) => void) => part.forEach(fn), traverseVisible: () => {} } as unknown as Object3D;
    try {
      compileForBuffer(gl, asScene, camera, lights);
    } catch {
      queue.length = 0; // three changed under us: they compile on first draw, as before
    }
    if (queue.length) idle = whenIdle(step);
  };
  idle = whenIdle(step);
  return () => {
    live = false;
    cancelIdle(idle);
  };
}
