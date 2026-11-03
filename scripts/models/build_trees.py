# The ARCam park's trees: Dutch park trees, the kind that line a city park, to
# stand among its pines (which the site still builds itself, city.tsx
# ParkTree). A lime with its tall, egg-shaped crown, and a plane with a
# broader, rounder one: each crown a single faceted solid, the convex hull of
# a few overlapping lumps, so it reads as foliage cut from the stock the way
# the pines' tiers are, not as a ball. Exported as one glb of named parts for
# the site. See README.md to rebuild.
#
# Coordinates are a tree's own (see modelkit.py), for a tree one unit tall:
# Y up, standing on y 0 at the origin. The site scales each tree to its height.
#   tree_trunk  a trunk with two limbs forking up into the crown (both trees)
#   lime_crown  the lime's crown
#   plane_crown the plane's crown
import math
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modelkit as K  # noqa: E402  (imports bpy first)
import bmesh  # noqa: E402  (registered once bpy has loaded)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')


def hull(name, pts):
    """The convex hull of a point cloud, as one solid."""
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    res = bmesh.ops.convex_hull(bm, input=vs)
    loose = [v for v in res['geom_interior'] if isinstance(v, bmesh.types.BMVert)]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return K.mk(name, bm)


def lumps(rng, blobs, per=32):
    """Points on a few overlapping ellipsoids (centre, radii), jittered: their
    hull is a crown with a facet for every few points, and a lumpy outline."""
    pts = []
    for (cx, cy, cz), (rx, ry, rz) in blobs:
        for i in range(per):
            # spread evenly over each lump (a Fibonacci sphere), then nudged
            y = 1 - 2 * (i + 0.5) / per
            r = math.sqrt(1 - y * y)
            a = i * 2.39996 + rng.random() * 0.5
            k = 0.9 + rng.random() * 0.16
            pts.append((cx + rx * r * math.cos(a) * k, cy + ry * y * k, cz + rz * r * math.sin(a) * k))
    return pts


def crown(name, blobs, seed):
    ob = hull(name, lumps(random.Random(seed), blobs))
    return K.finish(ob, 12)  # flat-shaded: each facet catches the light on its own


def trunk():
    stem = K.cyl('stem', 0.036, 0.5, pos=(0, 0.25, 0), seg=7, r2=0.024)
    limbs = []
    for yaw, lean in ((0.4, 0.42), (2.6, 0.5), (4.5, 0.36)):
        limb = K.cyl('limb', 0.017, 0.2, pos=(0, 0.1, 0), seg=6, r2=0.008)
        K.xf(limb, rot=(lean, yaw, 0))
        K.xf(limb, pos=(0, 0.44, 0))
        limbs.append(limb)
    ob = K.join('tree_trunk', [stem] + limbs)
    return K.finish(ob, 50)


def main():
    K.reset()
    t0 = time.time()
    lime = crown('lime_crown', [((0, 0.7, 0), (0.22, 0.27, 0.22)), ((0.05, 0.56, 0.03), (0.25, 0.2, 0.24)), ((-0.04, 0.86, -0.02), (0.15, 0.15, 0.15))], 7)
    plane = crown('plane_crown', [((0, 0.64, 0), (0.3, 0.22, 0.28)), ((0.12, 0.6, -0.06), (0.2, 0.17, 0.2)), ((-0.12, 0.66, 0.08), (0.2, 0.18, 0.2)), ((0, 0.78, 0), (0.18, 0.14, 0.18))], 11)
    parts = [(trunk(), 'deep'), (lime, 'glass'), (plane, 'glass')]
    for ob, _ in parts:
        print(f'  {ob.name:11s} {K.tris(ob):6d} tris')
    print(f'trees: {len(parts)} meshes, {sum(K.tris(o) for o, _ in parts)} tris, {time.time() - t0:.1f}s')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'trees-raw.glb')
    size = K.export(path, [o for o, _ in parts])
    print(f'exported {path} {size / 1024:.0f} KB')
    if '--preview' in sys.argv:
        # the two trees side by side, each on its own trunk
        import bpy
        t2 = parts[0][0].copy()
        t2.data = parts[0][0].data.copy()
        bpy.context.collection.objects.link(t2)
        parts[0][0].data.transform(K.Matrix.Translation((-0.4, 0, 0)))
        lime.data.transform(K.Matrix.Translation((-0.4, 0, 0)))
        t2.data.transform(K.Matrix.Translation((0.4, 0, 0)))
        plane.data.transform(K.Matrix.Translation((0.4, 0, 0)))
        s = K.preview(os.path.join(OUT, 'prev-trees.png'), parts + [(t2, 'deep')], (0.2, 0.9, 2.2), (0, 0.5, 0), lens=50)
        print(f'preview {s:.1f}s')


if __name__ == '__main__':
    main()
