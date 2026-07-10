// Shared vocabulary for the whole maquette: the colour palette, the layer
// accent context, small geometry/math helpers, and the hover/selection hooks
// every object leans on. If you're adding a new 3D object, start here to see
// what's already available.
import { createContext, useContext, useEffect, useState, type ComponentProps } from 'react';
import { Line as DreiLine } from '@react-three/drei';
import { CatmullRomCurve3, Shape, ShapeGeometry, SRGBColorSpace, TextureLoader, Vector3, type Object3D, type Texture } from 'three';
import { type LayerId } from '../framing';
import { useSceneSelector } from '../store';
import { asset } from '../../lib/asset';

export const NEUTRAL = '#9fb6c6'; // soft white-blue — the wireframe lines
export const GLASS = '#5b7da0';
export const BG = '#0a0d10';

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
 *  LineMaterial otherwise ignores fog), fading with depth like the meshes. */
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
  const selected = useSceneSelector((s) => s.selectedSlug) === slug;
  const visited = useSceneSelector((s) => s.visited.includes(slug));
  return { hovered, selected, visited };
}
// A springy squash-and-stretch bounce on the rising edge of `selected` — the
// picked object springs to life in place, then settles back to rest. State is
// stashed on the object's userData so call sites just hand us the group/mesh each
// frame. Meant for a non-rotated (or yaw-only) object so the stretch runs along
// world-up; scaling anchors at the object's local origin.
export function bounceObject(obj: Object3D, selected: boolean, reduced: boolean, delta: number, amp = 0.28) {
  const u = obj.userData;
  if (selected && !u.bPrev && !reduced) u.bPop = 1; // trigger on the rising edge
  u.bPrev = selected;
  u.bPop = Math.max(0, (u.bPop ?? 0) - delta * 2.1);
  // phase 0 at the trigger → 1 as it settles; a decaying cosine gives an initial
  // stretch that oscillates (stretch → squash → settle) back to rest.
  const spring = reduced ? 0 : Math.cos((1 - u.bPop) * Math.PI * 3) * u.bPop;
  const sq = spring * amp;
  obj.scale.set(1 - sq, 1 + sq, 1 - sq);
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

