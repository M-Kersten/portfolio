// Close-up interactions: what an exhibit does with the cursor while it's open.
// Each exhibit has one, kept small (the camera following you, a bolt down a
// wire, a tile lighting up), and only its close-up has it: the overview stays
// as calm as a floor plan. None of it runs on a touch screen, where there's no
// cursor to follow, or under reduced motion.
//
// The cursor is read here, not from R3F's `pointer`. In a close-up the exhibit
// (components/exhibit/Exhibit.tsx) lies over the whole canvas: its clear
// backdrop, which closes it on a click, takes every pointer event, so the
// canvas never hears the mouse move and R3F's pointer stands still wherever it
// was when the exhibit opened. So one listener on the window keeps the cursor's
// place, and whether it's over the model at all: over the canvas or that clear
// backdrop, rather than over the label, a button, or the book's page.
import { useMemo } from 'react';
import { type RootState, type Size } from '@react-three/fiber';
import { Matrix4, Plane, Ray, Vector2, Vector3, type Object3D } from 'three';
import { isTouch, useReducedMotion } from '../../lib/media';
import { useActive } from './shared';

/** Whether `slug`'s close-up reacts to the cursor: it's the exhibit that's
 *  open, the pointer is a fine one (a mouse or a trackpad), and motion isn't
 *  reduced. */
export function useCloseUp(slug: string): boolean {
  const { selected } = useActive(slug);
  const reduced = useReducedMotion();
  const coarse = useMemo(isTouch, []);
  return selected && !reduced && !coarse;
}

// the cursor: where it is (client px), whether it's over the model, and when it last moved (s)
const cursor = { x: 0, y: 0, over: false, movedAt: -Infinity };

function overModel(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  if (t.closest('.scene-canvas')) return true;
  // the exhibit's clear backdrop, unless the book is open over it
  return t.classList.contains('exhibit__dim') && !t.closest('[data-book]');
}

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch') return;
      cursor.x = e.clientX;
      cursor.y = e.clientY;
      cursor.over = overModel(e.target);
      cursor.movedAt = performance.now() / 1000;
    },
    { passive: true },
  );
  // out of the window altogether
  document.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget) cursor.over = false;
  });
}

/** The cursor over the canvas, in R3F's -1…1 terms (y up), or null while it's
 *  off the model. */
export function cursorNdc(size: Size, out: Vector2): Vector2 | null {
  if (!cursor.over || !size.width || !size.height) return null;
  return out.set(((cursor.x - size.left) / size.width) * 2 - 1, 1 - ((cursor.y - size.top) / size.height) * 2);
}

/** How long the cursor has rested, in seconds (Infinity while it's off the
 *  model). Lets a reaction let go once you've stopped pointing. */
export function cursorIdle(): number {
  return cursor.over ? performance.now() / 1000 - cursor.movedAt : Infinity;
}

const ndc = new Vector2();
const inverse = new Matrix4();
/** The cursor's ray, in `obj`'s own frame, or null while it's off the model. */
export function cursorRay(s: RootState, obj: Object3D, out: Ray): Ray | null {
  if (!cursorNdc(s.size, ndc)) return null;
  s.raycaster.setFromCamera(ndc, s.camera);
  inverse.copy(obj.matrixWorld).invert();
  return out.copy(s.raycaster.ray).applyMatrix4(inverse);
}

const flat = new Plane(new Vector3(0, 1, 0), 0);
const ray = new Ray();
/** Where the cursor points on the level plane at height `y` in `obj`'s frame
 *  (a floor, a table top, a cushion), or null if it points away from it. */
export function cursorOnLevel(s: RootState, obj: Object3D, y: number, out: Vector3): Vector3 | null {
  if (!cursorRay(s, obj, ray)) return null;
  flat.constant = -y;
  return ray.intersectPlane(flat, out);
}

const facing = new Plane();
const n = new Vector3();
/** Where the cursor points on the plane through `at` (in `obj`'s frame) that
 *  faces the camera: the cursor's place at that depth, for things that look or
 *  drift toward it in the air. */
export function cursorAtDepth(s: RootState, obj: Object3D, at: Vector3, out: Vector3): Vector3 | null {
  if (!cursorRay(s, obj, ray)) return null;
  n.copy(ray.direction).negate();
  facing.setFromNormalAndCoplanarPoint(n, at);
  return ray.intersectPlane(facing, out);
}
