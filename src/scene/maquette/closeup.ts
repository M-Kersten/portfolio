// Close-up interactions: what an exhibit does with the cursor while it's open.
// Each exhibit has one, kept small (the camera following you, a bolt down a
// wire, a tile lighting up), and only its close-up has it: the overview stays
// as calm as a floor plan. None of it runs on a touch screen, where there's no
// cursor to follow, or under reduced motion.
import { useMemo } from 'react';
import { type RootState } from '@react-three/fiber';
import { Matrix4, Plane, Ray, Vector3, type Object3D } from 'three';
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

const inverse = new Matrix4();
/** The cursor's ray, in `obj`'s own frame. */
export function cursorRay(s: RootState, obj: Object3D, out: Ray): Ray {
  s.raycaster.setFromCamera(s.pointer, s.camera);
  inverse.copy(obj.matrixWorld).invert();
  return out.copy(s.raycaster.ray).applyMatrix4(inverse);
}

const flat = new Plane(new Vector3(0, 1, 0), 0);
const ray = new Ray();
/** Where the cursor points on the level plane at height `y` in `obj`'s frame
 *  (a floor, a table top, a cushion), or null if it points away from it. */
export function cursorOnLevel(s: RootState, obj: Object3D, y: number, out: Vector3): Vector3 | null {
  cursorRay(s, obj, ray);
  flat.constant = -y;
  return ray.intersectPlane(flat, out);
}

const facing = new Plane();
const n = new Vector3();
/** Where the cursor points on the plane through `at` (in `obj`'s frame) that
 *  faces the camera: the cursor's place at that depth, for things that look or
 *  drift toward it in the air. */
export function cursorAtDepth(s: RootState, obj: Object3D, at: Vector3, out: Vector3): Vector3 | null {
  cursorRay(s, obj, ray);
  n.copy(ray.direction).negate();
  facing.setFromNormalAndCoplanarPoint(n, at);
  return ray.intersectPlane(facing, out);
}

/** How long the cursor has rested: call once a frame; it resets whenever the
 *  pointer moves. Lets a reaction let go once you've stopped pointing. */
export function cursorIdle(s: RootState, last: { x: number; y: number; idle: number }, dt: number): number {
  if (s.pointer.x !== last.x || s.pointer.y !== last.y) {
    last.x = s.pointer.x;
    last.y = s.pointer.y;
    last.idle = 0;
  } else last.idle += dt;
  return last.idle;
}
