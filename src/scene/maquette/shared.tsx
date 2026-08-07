// Shared vocabulary for the whole maquette: the colour palette, the layer
// accent context, small geometry/math helpers, and the hover/selection hooks
// every object leans on. If you're adding a new 3D object, start here to see
// what's already available.
import { createContext, useContext, useEffect, useState, type ComponentProps } from 'react';
import { Line as DreiLine } from '@react-three/drei';
import { CatmullRomCurve3, Shape, ShapeGeometry, SRGBColorSpace, TextureLoader, Vector3, type Texture } from 'three';
import { type LayerId } from '../framing';
import { useSceneSelector } from '../store';
import { asset } from '../../lib/asset';

// The blueprint statics. These two are baked into props/geometry at mount, so
// unlike the palette colours in scene/fxTweak.tsx they can't scrub live — keep
// them in tune with fxTweak's bgColor/ink values when regrading the scene.
// (Pre-blueprint they were NEUTRAL '#9fb6c6', BG '#0a0d10'.)
export const NEUTRAL = '#d3e4f6'; // drawn-ink white-blue — the wireframe lines
export const GLASS = '#5b7da0';
export const BG = '#0c2044'; // matches fxTweak bgColor — the drawing's paper

/* ===========================================================================
 * THE MATERIAL SYSTEM
 *
 * The maquette is a study model: one frosted stock, cut into shapes, standing
 * on a survey sheet. Everything you can see belongs to exactly one of four
 * categories below, and takes its colour and its opacity from here — never from
 * a literal in an object file.
 *
 * This exists because the model had accumulated 56 literal hex colours and 37
 * distinct opacities across three layers, each one chosen against its own
 * neighbours rather than against a rule. That is what made a set of individually
 * fine objects read as stuck together: two adjacent things could be different
 * substances for no reason anybody could name.
 *
 *   SURFACE  Anything solid. ONE substance in three VALUES — not three
 *            materials. A denser part of a model isn't more opaque, it's a
 *            lighter or darker cut of the same stock, which is how a real
 *            acrylic model separates a jetty from the water under it.
 *   LINE     The drawn edge. One ink, one weight, and only ever on a
 *            silhouette — never tracing a band, a cap or a plinth.
 *   MARK     The only place colour is allowed. Emissive, and it means
 *            "this is alive or interactive". Takes the layer's accent.
 *   GROUND   The sheet: floor lattice, survey marks, roads, contact shadows.
 *            Quiet by definition — it must never compete with the model.
 * ======================================================================== */

/** SURFACE — one stock, three cuts.
 *
 *  Each cut carries its own resting opacity, and that is not a loophole back to
 *  authoring opacity per object: in real acrylic, thickness IS opacity, so a
 *  dense piece being both darker and more solid is the same physical fact
 *  described twice. Tying the two together is what lets a jetty read against
 *  the water under it without anyone choosing a number.
 *
 *  The first version of this system held every surface at one opacity and let
 *  the tints do all the separating. It didn't work: three values at 0.30 over a
 *  dark ground compress to almost nothing, and the park and the transformer
 *  house — both of which had been leaning on hue for their identity —
 *  dissolved. Widening the spread and pairing it with opacity fixed both. */
export const SURFACE = {
  /** thin, lit, or sitting on top of something else */
  pale: { color: '#b9cde3', rest: 0.24 },
  /** the default — most of the model is this */
  glass: { color: GLASS, rest: 0.32 },
  /** dense: water, foliage mass, a solid core, a shadowed interior */
  deep: { color: '#2c4460', rest: 0.46 },
} as const;
export type Tint = keyof typeof SURFACE;

/** Where any cut ends up once its hotspot is woken. One value for all three, so
 *  a woken object is the same solid whatever it was cut from. */
export const SURFACE_AWAKE = 0.94;
/** Not yet built. The one state the cuts don't cover: scenery that arrives as
 *  the model comes alive rather than waking up with it. */
export const SURFACE_ABSENT = 0;

/** The faint self-glow every cut carries, so the stock reads as lit from within
 *  rather than as a dark pane on a dark ground. Part of the substance — it is
 *  not a colour choice an object gets to make, which is why it lives here and
 *  not as a literal in three separate material declarations. */
export const SURFACE_GLOW = '#0c2a30';

/** LINE — the drawn edge, at one weight and one resting strength. */
export const LINE_REST = 0.55;

/* ---------------------------------------------------------------------------
 * CORNERS — one fillet, every layer.
 *
 * The maquette used to be half hard-edged (48 raw boxes, the entire city among
 * them) and half rounded (29 SoftBoxes carrying 13 different hand-picked radii
 * between 0.006 and 0.055). That is the same defect the colours had, in
 * geometry: every value chosen against its own neighbours instead of a rule, so
 * a desk and the building above it were finished by two different hands.
 *
 * The rule: a fillet is a FRACTION of the piece's smallest dimension, capped.
 * Proportional is what makes a tower and a keycap look cut from the same stock —
 * an absolute radius melts the small parts and barely touches the big ones. The
 * cap stops a chunky piece turning into a pebble, so everything past roughly
 * 0.12 across shares one large-form corner.
 * ------------------------------------------------------------------------- */
export const SOFT = {
  /** Fillet as a fraction of the smallest dimension.
   *
   *  Tuned down from a quarter, which is what the room's hand-picked radii
   *  averaged out to and which looks right on furniture — but the city's shafts
   *  are only ~0.1 across, so a quarter of that turned the skyline into a shelf
   *  of bottles: rounded bar, rounded cap, rounded pad at the base. An eighth
   *  reads as a finished edge on both, which is the whole point of having one
   *  number rather than two. */
  frac: 0.12,
  /** …but never larger than this, so big forms share one corner */
  max: 0.016,
  /** Below this the piece is a few pixels on screen and has no corners to be
   *  coherent about, so it stays a plain box — a fillet there is invisible and
   *  costs twenty times the triangles. (The detail floor, applied to geometry.) */
  floor: 0.012,
  /** Segments across the fillet. Two, deliberately — see `edge`. */
  curve: 2,
  bevel: 1,
  /** Smooth-shade the whole fillet (every dihedral on a filleted box is ≤45°),
   *  so two segments read as round rather than as a chamfer. */
  crease: 0.9,
  /** The wireframe threshold that goes with `curve: 2`.
   *
   *  Rounded boxes and edge outlines fight each other, which is why SoftBox
   *  always avoided <Edges> and drew an explicit top line instead: a fillet
   *  split into N facets presents N+1 dihedral angles where the sharp edge used
   *  to be, so a threshold low enough to catch them draws the silhouette two or
   *  three times over — exactly the "too many lines" problem the city already
   *  had. At two segments the sequence across a corner is 22.5° · 45° · 22.5°,
   *  so a threshold between those two values emits exactly ONE line, running
   *  along the crown of the fillet. Which is where a draughtsman would put it. */
  edge: 30,
};
/** The fillet for a box, from the rule above. 0 means "below the floor — leave
 *  it a box". */
export function softRadius(w: number, h: number, d: number): number {
  const m = Math.min(w, h, d);
  if (m < SOFT.floor) return 0;
  return Math.min(m * SOFT.frac, SOFT.max, m / 2 - 1e-4);
}

/** GROUND — the sheet under the model. */
export const GROUND = {
  sheet: '#22384f', // roads, aprons, paved ground
  film: 0.62, // their opacity
  mark: 0.34, // survey marks: contours, ticks, bearings
};

/** MARK — the two licensed exceptions to "emissive means the layer accent".
 *  Both are things the world would colour for you, not UI states: a flame is a
 *  real light source (tinting it cyan in the city would read as a coolant leak)
 *  and a trophy is gold because trophies are gold. Everything else emissive
 *  takes `useAccent()`. Two exceptions, both named here — an object file adding
 *  a third one of its own is the bug this list exists to make visible. */
export const FIRE = '#ff9d5c';
export const GOLD = '#ffcf5e';

/** A layer's accent, at three values — the same discipline SURFACE uses, for the
 *  same reason. A mark with parts (a car's body and its livery, a screen and its
 *  bezel glow) separates them by value, never by reaching for a second hue. The
 *  room used to hold four unrelated car colours plus two pinks; they're all this
 *  one coral now, at different depths. */
interface Palette {
  accent: string;
  accentPale: string;
  accentDeep: string;
}
export const PALETTE: Record<LayerId, Palette> = {
  city: { accent: '#27e8f2', accentPale: '#9ef2f8', accentDeep: '#12909c' },
  room: { accent: '#ff9068', accentPale: '#ffc5ab', accentDeep: '#c25b38' },
  chip: { accent: '#a9f75c', accentPale: '#d6fbaa', accentDeep: '#6faa33' },
};
export const AccentCtx = createContext<Palette>(PALETTE.city);
export const useAccent = () => useContext(AccentCtx);

// Active-spot FX consistency — every holographic "working loop" that plays while
// a spot is open shares these, so the whole set reads as one family: the same
// engage speed (how fast it fades in/out on select), the same loop cadence, the
// same peak strength and the same in→out envelope. Each effect keeps a shape
// that suits its object and takes its LAYER's accent colour; an object's own
// mechanical motion (a heartbeat, circling cars, a spinning sail) keeps its
// diegetic speed. Tune the whole set from here.
export const FX = {
  engage: 0.06, // lerp per frame toward the active state (appear / clear)
  loopSpeed: 0.42, // base rate for the repeating overlay loops (pulses, sweeps, rises)
  peak: 0.55, // peak opacity of an overlay element
};
export const fxEnv = (p: number) => Math.sin(Math.PI * p); // 0 → 1 → 0 across one loop

export type V3 = [number, number, number];

/* ---------- maths helpers ---------- */
export function circlePts(r: number, seg = 56): V3[] {
  const p: V3[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    p.push([Math.cos(a) * r, 0, Math.sin(a) * r]);
  }
  return p;
}
export function roundedRectPts(w: number, d: number, r: number, seg = 6): V3[] {
  const rr = Math.max(0.001, Math.min(r, w / 2 - 0.001, d / 2 - 0.001));
  const hw = w / 2 - rr;
  const hd = d / 2 - rr;
  const pts: V3[] = [];
  const corner = (cx: number, cz: number, a0: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * rr, 0, cz + Math.sin(a) * rr]);
    }
  };
  corner(hw, hd, 0);
  corner(-hw, hd, Math.PI / 2);
  corner(-hw, -hd, Math.PI);
  corner(hw, -hd, Math.PI * 1.5);
  pts.push(pts[0]);
  return pts;
}
export function smoothCurve(pts: V3[], n = 50): V3[] {
  const curve = new CatmullRomCurve3(pts.map((p) => new Vector3(p[0], p[1], p[2])));
  return curve.getPoints(n).map((v) => [v.x, v.y, v.z] as V3);
}
/** A rounded-rectangle Shape centred on the origin (XY plane) — the phone body
 *  and its screen are both cut from this so nothing reads as a hard box. */
export function roundedRectShape(w: number, h: number, r: number): Shape {
  const hw = w / 2;
  const hh = h / 2;
  const rr = Math.min(r, hw, hh);
  const s = new Shape();
  s.moveTo(-hw + rr, -hh);
  s.lineTo(hw - rr, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + rr);
  s.lineTo(hw, hh - rr);
  s.quadraticCurveTo(hw, hh, hw - rr, hh);
  s.lineTo(-hw + rr, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - rr);
  s.lineTo(-hw, -hh + rr);
  s.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
  return s;
}
/** A flat rounded-rect plane with UVs normalised to 0..1 over its bounds, so a
 *  screenshot texture maps across it exactly (ShapeGeometry otherwise uses raw
 *  vertex coordinates for UVs). */
export function roundedPlaneGeometry(w: number, h: number, r: number): ShapeGeometry {
  const g = new ShapeGeometry(roundedRectShape(w, h, r), 8);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + w / 2) / w, (uv.getY(i) + h / 2) / h);
  uv.needsUpdate = true;
  return g;
}
export function makeRand(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wrap drei's Line so every maquette line participates in the scene fog (its
 *  LineMaterial otherwise ignores fog), fading with depth like the meshes.
 *
 *  Line discipline (so the drawing reads as ONE hand): mesh `<Edges>` are
 *  always NEUTRAL (GHOST_LINE on unbuilt/ghost things); drei Line widths stay
 *  on a three-step scale — 1 structure · 1.2 detail · 1.5 signature accents
 *  (the constellation, drawn far away in the sky, is the one licensed
 *  exception). Accent-coloured lines belong to interactive objects only. */
export function Line(props: ComponentProps<typeof DreiLine>) {
  return <DreiLine fog {...props} />;
}

/* ---------- Hover behaviours ----------
   Hovering a project's dot animates the object in a way that fits what it is:
   the phone vibrates, the monitor + chip + AR projection power on / flicker, the
   building windows light up, the park's trees rustle. Each reads the hovered
   slug from the store and eases a 0→1 value it drives its motion from. */
export function useActive(slug: string) {
  const hovered = useSceneSelector((s) => s.hoveredSlug) === slug;
  const rawSelected = useSceneSelector((s) => s.selectedSlug) === slug;
  // Gated on the camera's own push-in (CameraRig writes zoomSettled — see
  // ZOOM_SETTLE there): every "coming alive" reaction in the maquette (the life
  // system, the bounce-on-select, the bespoke per-object wake-ups below) reads
  // `selected` from here, so gating it in this one place holds all of them
  // back until the zoom has actually arrived, instead of materialising mid-swoop.
  // `visited` is untouched — a revisit is already alive from frame one, nothing
  // to delay — and nothing outside the canvas (the HUD, the hotspot markers'
  // hide-on-open) reads this hook, so none of that timing shifts.
  const zoomSettled = useSceneSelector((s) => s.zoomSettled);
  const visited = useSceneSelector((s) => s.visited.includes(slug));
  return { hovered, selected: rawSelected && zoomSettled, visited };
}
/** Load an optional texture from /public. Resolves to null while loading and
 *  stays null when the file hasn't been provided, so objects keep their plain
 *  procedural fallback (used by the monitor, the phone and the Zwijsen book). */
export function useOptionalTexture(path: string): Texture | null {
  const [tex, setTex] = useState<Texture | null>(null);
  useEffect(() => {
    let cancelled = false;
    new TextureLoader().load(
      asset(path),
      (t) => {
        t.colorSpace = SRGBColorSpace;
        if (cancelled) t.dispose();
        else setTex(t);
      },
      undefined,
      () => {}, // absent file → keep the fallback
    );
    return () => {
      cancelled = true;
    };
  }, [path]);
  return tex;
}

