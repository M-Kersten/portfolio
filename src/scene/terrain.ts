// Deterministic topographic height field. Pure math (no three import) so both
// the 3D terrain mesh and the hotspot placement (framing.ts) agree on exactly
// where the surface is — project markers sit on the landscape, not floating.

export type LayerId = 'chip' | 'room' | 'city';

// Phase seeds give each layer a distinct landscape while sharing one language.
const SEED: Record<LayerId, number> = { city: 0.0, room: 2.1, chip: 4.7 };

export const TERRAIN_R = 2.15; // half-extent / disc radius of a field
const AMP = 0.42; // vertical amplitude

/** Local-space height of the terrain at (x, z) for a layer. */
export function heightAt(x: number, z: number, layer: LayerId): number {
  const s = SEED[layer];
  const r = Math.hypot(x, z);
  let h =
    Math.sin(x * 1.15 + s) * Math.cos(z * 1.1 - s * 0.5) * 0.5 +
    Math.sin(x * 2.4 - s) * Math.cos(z * 2.0 + s) * 0.2 +
    Math.sin((x + z) * 0.85 + s * 1.3) * 0.16;
  h += Math.exp(-(r * r) / 1.5) * 0.55; // a soft central massif
  const edge = Math.max(0, 1 - r / TERRAIN_R); // settle the rim toward zero
  return (h * (0.4 + 0.6 * edge) + 0.04) * AMP;
}

const inDisc = (x: number, z: number) => Math.hypot(x, z) <= TERRAIN_R + 1e-3;

/** Wireframe "net" of the terrain as GL_LINES segment positions (a glowing
 *  contour grid). Only edges fully inside the disc are emitted. */
export function buildGridSegments(layer: LayerId, n = 38): Float32Array {
  const span = TERRAIN_R * 2;
  const coord = (i: number) => -TERRAIN_R + (i / n) * span;
  const pts: number[] = [];
  const push = (i: number, j: number) => {
    const x = coord(i);
    const z = coord(j);
    pts.push(x, heightAt(x, z, layer), z);
  };
  for (let j = 0; j <= n; j++)
    for (let i = 0; i < n; i++)
      if (inDisc(coord(i), coord(j)) && inDisc(coord(i + 1), coord(j))) {
        push(i, j);
        push(i + 1, j);
      }
  for (let i = 0; i <= n; i++)
    for (let j = 0; j < n; j++)
      if (inDisc(coord(i), coord(j)) && inDisc(coord(i), coord(j + 1))) {
        push(i, j);
        push(i, j + 1);
      }
  return new Float32Array(pts);
}

/** A closed contour ring at plan-radius `radius`, each vertex lifted to the
 *  terrain so the ring undulates like a real elevation contour. */
export function contourRing(layer: LayerId, radius: number, seg = 96): [number, number, number][] {
  const p: [number, number, number][] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    p.push([x, heightAt(x, z, layer) + 0.012, z]);
  }
  return p;
}

function makeRand(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A soft point cloud floating just above the terrain. `t` is a 0..1 elevation
 *  ramp per point, used to blend two accent colours into "gradient dots". */
export function buildPointCloud(layer: LayerId, count = 240): { positions: Float32Array; t: Float32Array } {
  const rnd = makeRand(layer === 'city' ? 11 : layer === 'room' ? 29 : 53);
  const positions = new Float32Array(count * 3);
  const t = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    const a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd()) * TERRAIN_R;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    const y = heightAt(x, z, layer) + 0.06 + rnd() * 0.6;
    positions[k * 3] = x;
    positions[k * 3 + 1] = y;
    positions[k * 3 + 2] = z;
    t[k] = Math.min(1, Math.max(0, (y + 0.1) / 0.85));
  }
  return { positions, t };
}
