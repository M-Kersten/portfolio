import { Color, MathUtils } from 'three';
import { ATTRIBUTE_META, type TwinAttribute } from '../data/places';

// Deterministic synthetic district. This stands in for a baked 3DBAG model so
// the twin scene, camera transition, attribute colouring and per-building
// readout are all demonstrable before the real bake (scripts/bake-district.md)
// exists. It is always captioned as placeholder geometry — never dressed up as
// real data (§5.5 honesty).

export interface Building {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  height: number;
  bouwjaar: number;
  roof_area: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDistrict(seed: number, blocks: number): Building[] {
  const rnd = mulberry32(seed);
  const cell = 18; // block footprint + street
  const block = 12;
  const half = (blocks * cell) / 2;
  const buildings: Building[] = [];
  let n = 0;

  for (let bx = 0; bx < blocks; bx++) {
    for (let bz = 0; bz < blocks; bz++) {
      const ox = bx * cell - half + cell / 2;
      const oz = bz * cell - half + cell / 2;
      const dist = Math.min(1, Math.hypot(ox, oz) / half); // 0 centre .. 1 edge
      const count = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < count; i++) {
        const w = 4 + rnd() * 7;
        const d = 4 + rnd() * 7;
        const height = 6 + rnd() * 20 + (dist < 0.3 ? 5 : 0); // taller toward centre
        const bouwjaar = MathUtils.clamp(
          Math.round(1880 + dist * 110 + (rnd() - 0.5) * 50),
          1850,
          2022,
        );
        buildings.push({
          id: `NL.IMBAG.${seed}.${n.toString().padStart(4, '0')}`,
          x: ox + (rnd() - 0.5) * (block - w),
          z: oz + (rnd() - 0.5) * (block - d),
          w,
          d,
          height,
          bouwjaar,
          roof_area: Math.round(w * d),
        });
        n++;
      }
    }
  }
  return buildings;
}

export function attrValue(b: Building, attr: TwinAttribute): number {
  if (attr === 'height') return b.height;
  if (attr === 'roof_area') return b.roof_area;
  return b.bouwjaar;
}

const RAMP_LOW = new Color('#a9bcc6');
const RAMP_HIGH = new Color('#0f8a8a');

export function colorFor(b: Building, attr: TwinAttribute): Color {
  const m = ATTRIBUTE_META[attr];
  const t = MathUtils.clamp((attrValue(b, attr) - m.min) / (m.max - m.min), 0, 1);
  return new Color().lerpColors(RAMP_LOW, RAMP_HIGH, t);
}
