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

interface Palette {
  accent: string;
}
export const PALETTE: Record<LayerId, Palette> = {
  city: { accent: '#27e8f2' },
  room: { accent: '#ff9068' },
  chip: { accent: '#a9f75c' },
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

