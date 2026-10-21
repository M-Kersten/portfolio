# The VR headset on the Room's desk (the Virtuele Brigade's own kit): a rounded
# visor with a dark glass front carrying its tracking lenses, a foam face
# gasket with the nose notch, and the head strap put down behind it in a loop
# that rises from the desk to the visor, a top strap over it and a cushion with
# a tension dial at the back. Exported as one glb of named parts for the site
# (src/scene/maquette/room.tsx, VRHeadset, which tints them). See README.md to
# rebuild.
#
# Coordinates are the headset's own (see modelkit.py): Y up, resting on the desk
# at y 0, the visor's front facing +Z, the strap trailing out behind at -Z.
#   hs_shell   the visor's housing, a pale rounded block
#   hs_plate   the front glass plate, and the lens barrels inside the face
#   hs_lenses  the tracking lenses on the plate (the site gives them a faint glow)
#   hs_face    the foam gasket behind the visor, notched for the nose
#   hs_strap   the loop, the top strap, the hinges and the back cushion
#   hs_dial    the tension dial on the cushion (the site colours it with the accent)
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modelkit as K  # noqa: E402  (imports bpy first)
import bmesh  # noqa: E402  (registered once bpy has loaded)
from mathutils import Vector  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

# the visor
W, H, R = 0.140, 0.066, 0.024  # housing width, height, corner radius
YC = 0.037  # its centre height: it stands on its lower edge
Z_BACK, Z_FRONT = -0.006, 0.0345  # the housing's depth
PLATE_W, PLATE_H, PLATE_R = 0.130, 0.056, 0.019
PLATE_OUT = 0.0055  # how far the plate stands proud of the housing
FACE_Z0, FACE_Z1 = -0.032, -0.0055  # the gasket, behind the housing

# the strap
STRAP_HW, STRAP_T = 0.0105, 0.0065  # half the strap's width, and its thickness
RING_LOW = 0.0135  # the loop's centre height at the back, on the desk
TOP_HW, TOP_T = 0.0125, 0.0055
BACK_Z = -0.19  # the loop's farthest point


def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def catmull(pts, per=8, closed=False):
    """A smooth curve through the points (Catmull-Rom), per spans between each pair."""
    P = [Vector(p) for p in pts]
    n = len(P)
    out = []
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = P[(i - 1) % n] if (closed or i > 0) else P[0] * 2 - P[1]
        p1 = P[i]
        p2 = P[(i + 1) % n]
        p3 = P[(i + 2) % n] if (closed or i + 2 < n) else P[-1] * 2 - P[-2]
        for k in range(per):
            t = k / per
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
    if not closed:
        out.append(P[-1])
    return out


def sweep(name, path, side, hw, ht):
    """A flat strap along a path: hw is half its width along `side(point)`, ht half
    its thickness across it. Capped at both ends."""
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(path):
        a = path[max(0, i - 1)]
        b = path[min(len(path) - 1, i + 1)]
        t = (b - a).normalized()
        s = Vector(side(p)).normalized()
        n = t.cross(s).normalized()
        rings.append([bm.verts.new(p + s * sy * hw + n * sn * ht) for sy, sn in ((1, 1), (1, -1), (-1, -1), (-1, 1))])
    for a, b in zip(rings, rings[1:]):
        for i in range(4):
            bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return K.mk(name, bm)


def shell():
    ob = K.prism_ax('hs_shell', K.rrect_pts(W, H, R, 8), Z_BACK, Z_FRONT, axis='z')
    K.xf(ob, (0, YC, 0))
    K.bevel(ob, 0.0035, now=True)
    return K.finish(ob, 50)


def plate():
    z0 = Z_FRONT - 0.002  # seated into the housing
    ob = K.prism_ax('plate', K.rrect_pts(PLATE_W, PLATE_H, PLATE_R, 8), z0, Z_FRONT + PLATE_OUT, axis='z')
    K.xf(ob, (0, YC, 0))
    K.bevel(ob, 0.0016, now=True)
    # the lens barrels, deep in the face: two short tubes behind the opening
    barrels = []
    for s in (1, -1):
        b = K.cyl('barrel', 0.0225, 0.012, pos=(s * 0.032, YC, Z_BACK + 0.001), rot=(math.pi / 2, 0, 0), seg=32)
        barrels.append(b)
    ob = K.join('hs_plate', [ob] + barrels)
    return K.finish(ob, 50)


def lenses():
    z0 = Z_FRONT + PLATE_OUT - 0.0006
    parts = []
    for s in (1, -1):
        # the tall tracking lenses at either side of the plate
        pill = K.prism_ax('pill', K.rrect_pts(0.0165, 0.033, 0.0082, 8), z0, z0 + 0.0026, axis='z')
        K.xf(pill, (s * 0.0435, YC + 0.001, 0))
        K.bevel(pill, 0.0006, now=True)
        parts.append(pill)
        # and a small one beside the nose
        dot = K.cyl('dot', 0.0035, 0.0022, pos=(s * 0.0125, YC - 0.012, z0 + 0.0011), rot=(math.pi / 2, 0, 0), seg=20)
        parts.append(dot)
    # a centre sensor between them, high on the brow
    parts.append(K.cyl('dot', 0.0028, 0.0022, pos=(0, YC + 0.016, z0 + 0.0011), rot=(math.pi / 2, 0, 0), seg=20))
    ob = K.join('hs_lenses', parts)
    return K.finish(ob, 50)


def face():
    ob = K.prism_ax('hs_face', K.rrect_pts(0.126, 0.057, 0.022, 8), FACE_Z0, FACE_Z1, axis='z')
    K.xf(ob, (0, YC - 0.002, 0))
    # the opening you look through, and the notch the nose sits in
    hole = K.prism_ax('hole', K.rrect_pts(0.104, 0.037, 0.0165, 8), FACE_Z0 - 0.005, FACE_Z1 + 0.005, axis='z')
    K.xf(hole, (0, YC + 0.001, 0))
    notch = K.cyl('notch', 0.0125, 0.06, pos=(0, YC - 0.0285, (FACE_Z0 + FACE_Z1) / 2), rot=(math.pi / 2, 0, 0), seg=32)
    K.cut(ob, hole, notch)
    K.bevel(ob, 0.0028, now=True)
    return K.finish(ob, 50)


def strap():
    # the loop: out from both sides of the visor, round the back at the desk,
    # rising to the visor's own height where it hooks on
    plan = [(-0.0715, 0.0), (-0.0735, -0.04), (-0.0705, -0.09), (-0.058, -0.145), (-0.03, -0.1795), (0.0, BACK_Z + 0.0005)]
    plan += [(-x, z) for x, z in reversed(plan[:-1])]
    path = [Vector((p.x, 0, p.z)) for p in catmull([(x, 0, z) for x, z in plan], 8)]
    for p in path:
        p.y = RING_LOW + (YC - RING_LOW) * smooth(-0.125, -0.002, p.z)
    ring = sweep('ring', path, lambda p: (0, 1, 0), STRAP_HW, STRAP_T / 2)
    K.bevel(ring, 0.0014, now=True)

    # the top strap, from the visor's brow down to the loop's back
    top_pts = [(0, 0.0705, 0.0), (0, 0.0635, -0.04), (0, 0.0455, -0.092), (0, 0.032, -0.14), (0, 0.0278, BACK_Z + 0.006)]
    top = sweep('top', catmull(top_pts, 8), lambda p: (1, 0, 0), TOP_HW, TOP_T / 2)
    K.bevel(top, 0.0012, now=True)

    # the hinges where the loop hooks onto the visor, and the cushion at the back
    parts = [ring, top]
    for s in (1, -1):
        h = K.prism_ax('hinge', K.rrect_pts(0.030, 0.024, 0.0075, 6), -0.004, 0.003, axis='x')
        K.xf(h, (s * 0.0735, YC - 0.001, 0.0))
        K.bevel(h, 0.0012, now=True)
        parts.append(h)
    pad = K.prism('pad', K.rrect_pts(0.072, 0.034, 0.0145, 8), 0.030, y0=0.0015)
    K.xf(pad, (0, 0, BACK_Z - 0.0075))
    K.bevel(pad, 0.0028, now=True)
    parts.append(pad)
    ob = K.join('hs_strap', parts)
    return K.finish(ob, 50)


def dial():
    ob = K.knurl('hs_dial', 0.0115, 0.0008, 0.0295, 0.0372, n=24, axis='y', flat=0.55)
    K.xf(ob, (0, 0, BACK_Z - 0.0035))
    K.bevel(ob, 0.0006, now=True)
    return K.finish(ob, 50)


def main():
    K.reset()
    t0 = time.time()
    parts = [(shell(), 'pale'), (plate(), 'deep'), (lenses(), 'glass'), (face(), 'glass'), (strap(), 'deep'), (dial(), 'mark')]
    for ob, _ in parts:
        print(f'  {ob.name:10s} {K.tris(ob):6d} tris')
    print(f'headset: {len(parts)} meshes, {sum(K.tris(o) for o, _ in parts)} tris, {time.time() - t0:.1f}s')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'headset-raw.glb')
    size = K.export(path, [o for o, _ in parts])
    print(f'exported {path} {size / 1024:.0f} KB')
    if '--preview' in sys.argv:
        view = sys.argv[sys.argv.index('--view') + 1] if '--view' in sys.argv else 'front'
        cams = {'front': (0.2, 0.17, 0.26), 'back': (-0.17, 0.15, -0.3), 'top': (0.0, 0.42, 0.06), 'side': (0.34, 0.07, -0.05)}
        s = K.preview(os.path.join(OUT, f'prev-headset-{view}.png'), parts, cams[view], (0, 0.03, -0.075), lens=60)
        print(f'preview {s:.1f}s')


if __name__ == '__main__':
    main()
