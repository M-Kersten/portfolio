// Procedural micro-surface for the maquette's objects.
//
// A woken object has to read as something you could pick up, and the thing that
// sells that is not gloss — it's the *break-up* in the gloss. A perfectly smooth
// CG surface slides a clean highlight across itself and reads as render; real
// injection-moulded plastic has a fine tooling grain that shatters the highlight
// into something slightly irregular. That grain is all this file makes.
//
// Two maps off one height field, generated once and shared by every material in
// the scene (one 256² pair total, not one per object):
//   · roughness — near-white with a gentle wobble, so it MODULATES the material's
//     own roughness rather than replacing it (three multiplies by the green
//     channel, so a mid-grey map would silently halve it).
//   · normal    — the same field as slope, for a bump far too small to see as
//     shape but big enough to make the highlight crawl.
import { CanvasTexture, RepeatWrapping, type Texture } from 'three';

const SIZE = 256;
const LATTICE = 32; // noise cell size — must divide SIZE for the tile to wrap

/** Deterministic hash → [0,1), wrapped on the lattice so the tile is seamless. */
function hash(ix: number, iy: number, seed: number): number {
  const n = LATTICE;
  const x = ((ix % n) + n) % n;
  const y = ((iy % n) + n) % n;
  let h = x * 374761393 + y * 668265263 + seed * 1274126177;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number, freq: number, seed: number): number {
  const fx = x * freq;
  const fy = y * freq;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fade(fx - x0);
  const ty = fade(fy - y0);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

/** Three octaves, the finest one dominant — this is grain, not landscape. */
function height(x: number, y: number): number {
  const u = x / SIZE;
  const v = y / SIZE;
  return (
    0.5 * valueNoise(u, v, LATTICE, 1) +
    0.32 * valueNoise(u, v, LATTICE * 2, 2) +
    0.18 * valueNoise(u, v, LATTICE * 4, 3)
  );
}

let cache: { roughness: Texture; normal: Texture } | null = null;

/** Built on first use and memoised — every material shares the one pair. */
export function surfaceMaps(): { roughness: Texture; normal: Texture } | null {
  if (cache) return cache;
  if (typeof document === 'undefined') return null;

  const h = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) h[y * SIZE + x] = height(x, y);
  }

  const rc = document.createElement('canvas');
  const nc = document.createElement('canvas');
  rc.width = rc.height = nc.width = nc.height = SIZE;
  const rctx = rc.getContext('2d');
  const nctx = nc.getContext('2d');
  if (!rctx || !nctx) return null;
  const rimg = rctx.createImageData(SIZE, SIZE);
  const nimg = nctx.createImageData(SIZE, SIZE);

  // How far the roughness map is allowed to swing either side of white. Small:
  // the point is a shimmer in the highlight, not a visibly blotchy surface.
  const SWING = 26;
  const SLOPE = 2.4; // normal strength baked into the map; scaled again per material

  const at = (x: number, y: number) => h[(((y % SIZE) + SIZE) % SIZE) * SIZE + (((x % SIZE) + SIZE) % SIZE)];

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const v = 229 + (at(x, y) - 0.5) * 2 * SWING;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = Math.max(0, Math.min(255, v));
      rimg.data[i + 3] = 255;

      // central differences → tangent-space normal
      const dx = (at(x + 1, y) - at(x - 1, y)) * SLOPE;
      const dy = (at(x, y + 1) - at(x, y - 1)) * SLOPE;
      const len = Math.hypot(dx, dy, 1);
      nimg.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      nimg.data[i + 3] = 255;
    }
  }
  rctx.putImageData(rimg, 0, 0);
  nctx.putImageData(nimg, 0, 0);

  const mk = (c: HTMLCanvasElement) => {
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    // Tight repeat: the maquette's objects are centimetres across in world units,
    // so the grain has to tile hard to stay sub-millimetre on screen.
    t.repeat.set(8, 8);
    t.anisotropy = 4;
    return t;
  };
  cache = { roughness: mk(rc), normal: mk(nc) };
  return cache;
}
