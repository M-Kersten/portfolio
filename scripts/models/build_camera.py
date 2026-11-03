# The Custom AR framework's camera on the chip layer: a bullet CCTV camera on a
# post, the computer-vision eye the framework was built around. Made in the
# chip kit's own idiom (build_chip.py): rounded housings, the kit bevel, deep
# bodies with pale fittings and a glass stand, so it stands on the board as one
# of its parts rather than as a prop dropped on it. Exported as one glb of
# named parts for the site (src/scene/maquette/chip.tsx, SecurityCamera, which
# aims it and lights it). See README.md to rebuild.
#
# Two frames, both Y up (see modelkit.py):
#   the mount's: the board's top at y 0, the ball joint's centre at (0, PIVOT_Y, 0)
#     cam_mount   the base plate, the post, the socket and the ball
#     cam_screws  the base plate's four screw heads
#   the head's: the ball's centre at the origin, the housing's axis along +Z at
#   y HEAD_UP, its front face at z FRONT (the site nods and pans the head about
#   the ball)
#     cam_body    the housing, with the neck and saddle down to the ball
#     cam_visor   the sun shield over it, on a rib
#     cam_front   the dark front panel round the lens, and the lens's bezel
#     cam_ir      the ring of IR LEDs on the front panel (the site lights them)
#     cam_cable   the cable gland on the back and the pigtail out of it
#   and on its own:
#     cam_lens    the lens's glass dome, centred on the origin, facing +Z: the
#                 site puts it in the bezel and racks it in and out for focus
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modelkit as K  # noqa: E402  (imports bpy first)
import bmesh  # noqa: E402  (registered once bpy has loaded)
from mathutils import Vector  # noqa: E402
from modelkit import BEV_M, BEV_S, TAU  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

PIVOT_Y = 0.17  # the ball joint's centre over the board
HEAD_UP = 0.075  # the housing's axis over the ball
SEG = 5  # points per rounded corner: the kit's soft corners at a low count
# the housing as a stack of rounded rectangles back to front (z, width, height,
# corner radius): drawn in toward the back where the gland comes out
HOUSING = [
    (-0.125, 0.082, 0.078, 0.03),
    (-0.112, 0.096, 0.092, 0.036),
    (0.1, 0.1, 0.096, 0.038),
]
FRONT = HOUSING[-1][0]
BACK = HOUSING[0][0]
RECESS = 0.008  # how far the front panel sits back in the housing's mouth
LENS_R = 0.016
IR_N, IR_AT, IR_R = 8, 0.029, 0.0042  # the IR ring: how many, how far out, how big


def mount():
    plate = K.rbox('plate', (0.11, 0.012, 0.11), 0.022, pos=(0, 0.006, 0), seg=SEG, bev=BEV_M)
    post = K.cyl('post', 0.016, PIVOT_Y - 0.03, pos=(0, 0.012 + (PIVOT_Y - 0.03) / 2, 0), seg=14, r2=0.012, bev=BEV_S)
    socket = K.cyl('socket', 0.021, 0.016, pos=(0, PIVOT_Y - 0.016, 0), seg=14, r2=0.018, bev=BEV_S)
    ball = K.sphere('ball', 0.019, pos=(0, PIVOT_Y, 0), seg=14, rings=8)
    ob = K.join('cam_mount', [plate, post, socket, ball])
    return K.finish(ob, 35)


def screws():
    heads = [K.cyl(f's{i}', 0.0055, 0.004, pos=(sx * 0.037, 0.014, sz * 0.037), seg=8, r2=0.0045) for i, (sx, sz) in enumerate(((1, 1), (-1, 1), (1, -1), (-1, -1)))]
    return K.finish(K.join('cam_screws', heads), 50)


def housing():
    # lofted along Y, then turned so the stack runs along +Z and the outlines
    # stand in the XY plane (as the headset's visor is)
    ob = K.loft('housing', [(K.rrect_pts(w, h, r, SEG), z) for z, w, h, r in HOUSING])
    K.xf(ob, (0, HEAD_UP, 0), (math.pi / 2, 0, 0))
    mouth = K.prism_ax('mouth', K.rrect_pts(0.084, 0.08, 0.031, SEG), FRONT - RECESS, FRONT + 0.01, axis='z')
    K.xf(mouth, (0, HEAD_UP, 0))
    K.cut(ob, mouth)
    K.bevel(ob, BEV_M, now=True)
    # the saddle it's clamped in, and the neck down into the ball
    bottom = HEAD_UP - HOUSING[-1][2] / 2
    saddle = K.rbox('saddle', (0.05, 0.012, 0.07), 0.01, pos=(0, bottom - 0.002, -0.015), seg=SEG, bev=BEV_S)
    neck = K.cyl('neck', 0.0115, bottom - 0.008, pos=(0, (bottom - 0.008) / 2 + 0.006, -0.015), seg=12, bev=BEV_S)
    ob = K.join('cam_body', [ob, saddle, neck])
    return K.finish(ob, 35)


def visor():
    # a curved shield riding over the housing's top, reaching past its front
    r0 = HOUSING[-1][2] / 2 + 0.009
    r1 = r0 + 0.005
    arc = [math.radians(a) for a in range(28, 153, 9)]
    band = [(r1 * math.cos(a), r1 * math.sin(a)) for a in arc] + [(r0 * math.cos(a), r0 * math.sin(a)) for a in reversed(arc)]
    shield = K.prism_ax('shield', band, -0.1, FRONT + 0.045, axis='z')
    K.xf(shield, (0, HEAD_UP, 0))
    # its front edge swept back from the crown down to the sides, the way a
    # visor is cut: a plane through the crown's front edge, leaning back
    tip = FRONT + 0.045
    lean = 0.035 / r1  # how far back the edge comes per unit down
    th = math.atan(lean)
    n = Vector((0, -math.sin(th), math.cos(th)))
    c = Vector((0, HEAD_UP + r1, tip)) + n * 0.05
    trim = K.box('trim', (0.2, 0.3, 0.1), pos=tuple(c), rot=(th, 0, 0))
    K.cut(shield, trim)
    K.bevel(shield, BEV_S, now=True)
    rib = K.box('rib', (0.012, 0.012, 0.16), pos=(0, HEAD_UP + HOUSING[-1][2] / 2 + 0.004, -0.015), bev=BEV_S)
    return K.finish(K.join('cam_visor', [shield, rib]), 35)


def front():
    z0 = FRONT - RECESS
    panel = K.prism_ax('panel', K.rrect_pts(0.08, 0.076, 0.029, SEG), z0 - 0.002, z0 + 0.002, axis='z')
    K.xf(panel, (0, HEAD_UP, 0))
    hole = K.cyl('hole', LENS_R + 0.003, 0.02, pos=(0, HEAD_UP, z0), rot=(math.pi / 2, 0, 0), seg=20)
    K.cut(panel, hole)
    # the lens's bezel: a short dark tube standing out of the panel
    bezel = K.lathe('bezel', [(LENS_R + 0.001, z0 - 0.004), (LENS_R + 0.0045, z0 - 0.004), (LENS_R + 0.0045, z0 + 0.004), (LENS_R + 0.0025, z0 + 0.0055), (LENS_R + 0.001, z0 + 0.0055)], seg=20, closed=True)
    K.xf(bezel, (0, HEAD_UP, 0), (math.pi / 2, 0, 0))
    return K.finish(K.join('cam_front', [panel, bezel]), 35)


def ir_ring():
    z = FRONT - RECESS + 0.002
    leds = []
    for i in range(IR_N):
        a = TAU * i / IR_N + TAU / (2 * IR_N)
        leds.append(K.sphere(f'ir{i}', IR_R, pos=(IR_AT * math.cos(a), HEAD_UP + IR_AT * math.sin(a), z), seg=8, rings=4, scale=(1, 1, 0.6)))
    return K.finish(K.join('cam_ir', leds), 50)


def tube(name, path, r, seg=8):
    """A round tube along a path of points, capped at both ends."""
    bm = bmesh.new()
    P = [Vector(p) for p in path]
    rings = []
    up = Vector((1, 0, 0))
    for i, p in enumerate(P):
        t = (P[min(len(P) - 1, i + 1)] - P[max(0, i - 1)]).normalized()
        a = t.cross(up).normalized()
        b = t.cross(a).normalized()
        rings.append([bm.verts.new(p + (a * math.cos(TAU * k / seg) + b * math.sin(TAU * k / seg)) * r) for k in range(seg)])
    for ra, rb in zip(rings, rings[1:]):
        for k in range(seg):
            bm.faces.new((ra[k], ra[(k + 1) % seg], rb[(k + 1) % seg], rb[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return K.mk(name, bm)


def cable():
    # the gland: a hex nut on the back face, then its tapered nose
    y = HEAD_UP - 0.012
    nut = K.cyl('nut', 0.0105, 0.008, pos=(0, y, BACK - 0.004), rot=(math.pi / 2, 0, 0), seg=6, bev=0.001)
    nose = K.cyl('nose', 0.008, 0.012, pos=(0, y, BACK - 0.014), rot=(-math.pi / 2, 0, 0), seg=10, r2=0.0058)
    # the pigtail: out of the gland, turning down and tucking in under the
    # saddle, so it moves with the head rather than hanging from nothing
    pts = [(0, y, BACK - 0.02), (0, y - 0.004, BACK - 0.034), (0, y - 0.026, BACK - 0.04), (0, y - 0.05, BACK - 0.028), (0, 0.028, -0.07), (0, 0.022, -0.045)]
    # smoothed through the points (Catmull-Rom), a few spans between each
    P = [Vector(p) for p in pts]
    path = []
    for i in range(len(P) - 1):
        p0 = P[i - 1] if i > 0 else P[0] * 2 - P[1]
        p1, p2 = P[i], P[i + 1]
        p3 = P[i + 2] if i + 2 < len(P) else P[-1] * 2 - P[-2]
        for k in range(4):
            t = k / 4
            path.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
    path.append(P[-1])
    wire = tube('wire', path, 0.0045)
    return K.finish(K.join('cam_cable', [nut, nose, wire]), 50)


def lens():
    ob = K.sphere('cam_lens', LENS_R, seg=16, rings=8, scale=(1, 1, 0.55))
    # just the front half: the back sits in the bezel
    K.cut(ob, K.box('back', (0.05, 0.05, 0.05), pos=(0, 0, -0.025)))
    return K.finish(ob, 60)


def main():
    K.reset()
    t0 = time.time()
    parts = [(mount(), 'glass'), (screws(), 'pale'), (housing(), 'deep'), (visor(), 'pale'), (front(), 'deep'), (ir_ring(), 'pale'), (cable(), 'deep'), (lens(), 'glass')]
    for ob, _ in parts:
        print(f'  {ob.name:10s} {K.tris(ob):6d} tris')
    print(f'camera: {len(parts)} meshes, {sum(K.tris(o) for o, _ in parts)} tris, {time.time() - t0:.1f}s')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'camera-raw.glb')
    size = K.export(path, [o for o, _ in parts])
    print(f'exported {path} {size / 1024:.0f} KB')
    if '--preview' in sys.argv:
        # the head goes up onto the ball, and the lens into its bezel, for the render
        for ob, _ in parts[2:]:
            ob.data.transform(K.Matrix.Translation((0, PIVOT_Y, 0)))
        parts[-1][0].data.transform(K.Matrix.Translation((0, HEAD_UP, FRONT - RECESS + 0.002)))
        view = sys.argv[sys.argv.index('--view') + 1] if '--view' in sys.argv else 'front'
        cams = {'front': (0.34, 0.36, 0.42), 'back': (-0.3, 0.34, -0.36), 'side': (0.75, 0.3, 0.05)}
        s = K.preview(os.path.join(OUT, f'prev-camera-{view}.png'), parts, cams[view], (0, 0.17, 0.0), lens=55)
        print(f'preview {s:.1f}s')


if __name__ == '__main__':
    main()
