// Tailored-twin place registry — §5.8 "point it at the viewer".
//
// Selection is ALLOWLIST-ONLY. The `?place=<id>` URL parameter selects an id
// that already exists here, each with its own pre-baked model. The parameter
// never carries coordinates, so no crafted link can aim the scene at an
// arbitrary or sensitive location. Unknown / missing id falls back to DEFAULT.
//
// To tailor before an application: bake the district once (scripts/bake-district.md),
// drop the .glb in public/models/<id>.glb, add an entry here, and share
//   …/work/municipal-twin?place=<id>

export type TwinAttribute = 'bouwjaar' | 'height' | 'roof_area';

export interface Place {
  /** url-safe slug, the value of ?place= */
  id: string;
  /** shown in the caption */
  label: string;
  /** /models/<id>.glb, baked once via §5.2 (resolved against BASE_URL at load) */
  model: string;
  /** camera framing for the establishing shot */
  view: { distance: number; pitch: number; bearing: number };
  /** default colouring attribute */
  attribute: TwinAttribute;
  /** optional /textures/<id>.jpg aerial drape (§5.4) */
  aerial?: string;
  /** optional, quiet line in the caption (§5.8) e.g. "Framed for the Municipality of Arnhem" */
  dedication?: string;
  /**
   * Procedural-placeholder hints. Used ONLY by the synthetic district that
   * stands in until a real baked .glb is dropped at `model`. A baked model
   * carries its own geometry and attributes and ignores these.
   */
  placeholder?: {
    seed: number;
    /** grid blocks across the district */
    blocks: number;
  };
}

export const PLACES: Place[] = [
  {
    id: 'weesp',
    label: 'Weesp',
    model: '/models/weesp.glb',
    view: { distance: 180, pitch: 55, bearing: 20 },
    attribute: 'bouwjaar',
    placeholder: { seed: 1872, blocks: 7 },
  },
  // Example tailored target. Bake arnhem.glb and this opens framed on it,
  // with a quiet dedication line beside the required 3DBAG attribution.
  {
    id: 'arnhem',
    label: 'Arnhem',
    model: '/models/arnhem.glb',
    view: { distance: 220, pitch: 50, bearing: -25 },
    attribute: 'roof_area',
    dedication: 'Framed for the Municipality of Arnhem',
    placeholder: { seed: 2603, blocks: 8 },
  },
];

export const DEFAULT_PLACE_ID = 'weesp';

/** Allowlist resolver: only returns a registry entry, never trusts free input. */
export function resolvePlace(id: string | null | undefined): Place {
  const found = id ? PLACES.find((p) => p.id === id) : undefined;
  return found ?? PLACES.find((p) => p.id === DEFAULT_PLACE_ID) ?? PLACES[0];
}

export const ATTRIBUTE_META: Record<
  TwinAttribute,
  { label: string; unit: string; min: number; max: number; lowLabel: string; highLabel: string }
> = {
  bouwjaar: { label: 'Construction year', unit: '', min: 1880, max: 2020, lowLabel: '1880', highLabel: '2020' },
  height: { label: 'Building height', unit: 'm', min: 3, max: 30, lowLabel: '3 m', highLabel: '30 m' },
  roof_area: { label: 'Roof surface area', unit: 'm²', min: 40, max: 600, lowLabel: '40 m²', highLabel: '600 m²' },
};
