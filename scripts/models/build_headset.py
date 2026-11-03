# The VR headset on the Room's desk (the Virtuele Brigade's own kit), after a
# Meta Quest 3: a soft, pillow-shaped white visor with three dark sensor pills
# down its front, a dark foam face pad, short white arms off its sides and a
# grey fabric strap, put down behind it in a loop that drops from the arms to
# the desk, with a top strap over it. Exported as one glb of named parts for
# the site (src/scene/maquette/room.tsx, VRHeadset, which tints them). See
# README.md to rebuild.
#
# Coordinates are the headset's own (see modelkit.py): Y up, resting on the desk
# at y 0, the visor's front facing +Z, the strap trailing out behind at -Z.
#   hs_shell   the visor and its two arms, white
#   hs_pods    the three sensor pills on the front, dark glass
#   hs_face    the foam face pad behind the visor, notched for the nose
#   hs_strap   the fabric: the loop round the back and the top strap
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modelkit as K  # noqa: E402  (imports bpy first)
import bmesh  # noqa: E402  (registered once bpy has loaded)
from mathutils import Vector  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

YC = 0.036  # the visor's centre height: it stands on its lower edge
# the visor as a stack of rounded rectangles front to back (z, width, height,
# corner radius): fullest in the middle, rounding off to the front and to the
# face, so it reads as one soft pillow rather than a box with a lid
VISOR = [
    (-0.004, 0.128, 0.060, 0.022),
    (0.000, 0.136, 0.066, 0.026),
    (0.010, 0.140, 0.070, 0.028),
    (0.026, 0.140, 0.070, 0.028),
    (0.036, 0.136, 0.066, 0.026),
    (0.042, 0.128, 0.058, 0.022),
    (0.0455, 0.116, 0.047, 0.018),
]
FRONT = VISOR[-1][0]
SEG = 8  # points per rounded corner

# the strap
ARM_END = -0.048  # where the white arms end and the fabric takes over
LOOP_LOW = 0.0125  # the loop's centre height at the back, lying on the desk
BAND_HW, BAND_T = 0.012, 0.0042  # half the fabric's width, its thickness
BACK_Z = -0.182


def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def catmull(pts, per=8):
    """A smooth curve through the points (Catmull-Rom), per spans between each pair."""
    P = [Vector(p) for p in pts]
    out = []
    for i in range(len(P) - 1):
        p0 = P[i - 1] if i > 0 else P[0] * 2 - P[1]
        p1, p2 = P[i], P[i + 1]
        p3 = P[i + 2] if i + 2 < len(P) else P[-1] * 2 - P[-2]
        for k in range(per):
            t = k / per
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
    out.append(P[-1])
    return out


def sweep(name, path, side, hw, ht):
    """A flat band along a path: hw is half its width along `side(point)`, ht half
    its thickness across it. Capped at both ends."""
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(path):
        t = (path[min(len(path) - 1, i + 1)] - path[max(0, i - 1)]).normalized()
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


def visor():
    # lofted along Y, then turned so the stack runs along +Z (front) and the
    # outlines stand in the XY plane
    ob = K.loft('visor', [(K.rrect_pts(w, h, r, SEG), z) for z, w, h, r in VISOR])
    K.xf(ob, (0, YC, 0), (math.pi / 2, 0, 0))
    return ob


def arms():
    out = []
    for s in (1, -1):
        path = [Vector(p) for p in catmull([(s * 0.0665, YC, 0.006), (s * 0.0715, YC - 0.001, -0.02), (s * 0.0725, YC - 0.003, ARM_END)], 8)]
        a = sweep('arm', path, lambda p: (0, 1, 0), 0.0085, 0.0034)
        K.bevel(a, 0.0016, now=True)
        out.append(a)
    return out


def shell():
    ob = K.join('hs_shell', [visor()] + arms())
    return K.finish(ob, 50)


def pods():
    parts = []
    for x in (-0.034, 0.0, 0.034):
        pill = K.prism_ax('pill', K.rrect_pts(0.0135, 0.031, 0.0067, SEG), FRONT - 0.0012, FRONT + 0.0014, axis='z')
        K.xf(pill, (x, YC, 0))
        K.bevel(pill, 0.0007, now=True)
        parts.append(pill)
    ob = K.join('hs_pods', parts)
    return K.finish(ob, 50)


def face():
    ob = K.prism_ax('hs_face', K.rrect_pts(0.122, 0.054, 0.021, SEG), -0.027, -0.003, axis='z')
    K.xf(ob, (0, YC - 0.002, 0))
    notch = K.cyl('notch', 0.012, 0.06, pos=(0, YC - 0.028, -0.015), rot=(math.pi / 2, 0, 0), seg=32)
    K.cut(ob, notch)
    K.bevel(ob, 0.0035, now=True)
    return K.finish(ob, 50)


def strap():
    # the loop: on from the arms, dropping to the desk and round the back
    plan = [(-0.0725, ARM_END + 0.004), (-0.0725, -0.085), (-0.064, -0.135), (-0.036, -0.170), (0.0, BACK_Z)]
    plan += [(-x, z) for x, z in reversed(plan[:-1])]
    path = [Vector((p.x, 0, p.z)) for p in catmull([(x, 0, z) for x, z in plan], 8)]
    for p in path:
        p.y = LOOP_LOW + (YC - 0.003 - LOOP_LOW) * smooth(-0.13, ARM_END, p.z)
    loop = sweep('loop', path, lambda p: (0, 1, 0), BAND_HW, BAND_T / 2)
    K.bevel(loop, 0.0013, now=True)
    # the top strap, from the visor's brow down to the loop's back
    top_pts = [(0, 0.0705, -0.002), (0, 0.065, -0.04), (0, 0.048, -0.09), (0, 0.033, -0.14), (0, LOOP_LOW + BAND_HW + BAND_T / 2, BACK_Z + 0.004)]
    top = sweep('top', catmull(top_pts, 8), lambda p: (1, 0, 0), 0.013, BAND_T / 2)
    K.bevel(top, 0.0013, now=True)
    ob = K.join('hs_strap', [loop, top])
    return K.finish(ob, 50)


def main():
    K.reset()
    t0 = time.time()
    parts = [(shell(), 'pale'), (pods(), 'deep'), (face(), 'deep'), (strap(), 'glass')]
    for ob, _ in parts:
        print(f'  {ob.name:10s} {K.tris(ob):6d} tris')
    print(f'headset: {len(parts)} meshes, {sum(K.tris(o) for o, _ in parts)} tris, {time.time() - t0:.1f}s')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'headset-raw.glb')
    size = K.export(path, [o for o, _ in parts])
    print(f'exported {path} {size / 1024:.0f} KB')
    if '--preview' in sys.argv:
        view = sys.argv[sys.argv.index('--view') + 1] if '--view' in sys.argv else 'front'
        cams = {'front': (0.2, 0.17, 0.26), 'back': (-0.2, 0.18, -0.34), 'side': (0.34, 0.08, -0.04), 'face': (0.05, 0.06, 0.3)}
        s = K.preview(os.path.join(OUT, f'prev-headset-{view}.png'), parts, cams[view], (0, 0.03, -0.07), lens=60)
        print(f'preview {s:.1f}s')


if __name__ == '__main__':
    main()
