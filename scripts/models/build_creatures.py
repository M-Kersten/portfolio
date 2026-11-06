# The creatures of the ARCam park's scavenger hunt, each out of one of Merijn's
# projects: soft toys with big glossy eyes and one thing each that says what
# it is. They hide in the park and pop out (the site's game, in
# src/scene/maquette/critters.tsx), and three bring a prop.
# Exported as one glb of named pieces: each creature, and its prop apart. See
# README.md to rebuild.
#
# Each is modelled in toy units facing +X (creature_kit.py), painted in vertex
# colours (the site reads them as light and dark; their alpha is how much a
# part glows), thinned for the web, then centred on its body's footprint and
# scaled into the park's units: its feet at y 0, facing +X.
#   orbitot           a little Saturn, rings and all, a moon on a dotted orbit (Sol.AR)
#   pinboo            a map pin turned ghost, its white dot one big eye; and
#                     pinboo_dot, the spot the map says it's at, which it
#                     drifts off (GPS drifts)
#   cameleon          a chameleon in pixel camouflage, camera lenses for eyes, a
#                     flash on its crest (ARCam)
#   moletage          a mole in a high-vis vest, holding up a cable it dug out
#                     from under the street (Amsterdam Underground); and
#                     moletage_hill, the molehill it sits in, with its bricks
#                     and the cone that says the street's up
#   driftnot          a cloud on a chain (cloud anchors); and driftnot_anchor,
#                     the anchor dug into the lawn, in its AR ring
#   chatterkeet       a ring-necked parakeet, a reply always being typed (the
#                     Amsterdam AI guides)
#   jerboost          a jerboa ready to spring, the crown on, a chequered flag at
#                     the end of its tail (Lightship Drive)
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import creature_kit as C  # noqa: E402  (imports modelkit, which imports bpy first)
from creature_kit import (  # noqa: E402
    BLUSH, INK, MB, TAU, Bands, Checker, Flat, Matrix, Pixels, Ramp, Vector, YBands,
    annulus, ball, basis, blobs, cam_az, catmull, ell, ell_along, facing, land, patch, put,
    ring_on, rot_about, skin, smile_on, smooth, surface, toon_eye, torus, toward, turn_to,
    wire, xform,
)
import modelkit as K  # noqa: E402
import bmesh  # noqa: E402
import bpy  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
CYAN = '#27e8f2'


# ------------------------------------------------------------- Orbitot

def orbitot():
    """A little Saturn, rings and all, with a moon on a dotted orbit round it."""
    Cn = Vector((0, 2.7, 0))
    R = 1.42
    f, u, s = facing((1, 0, 0))
    body = smooth(K.sphere('saturn', R, tuple(Cn), 64, 40))
    parts = [put(body, Bands([(0.0, '#d8a46c'), (0.3, '#ecc995'), (0.55, '#f7e7c6'), (0.8, '#efd3a2'), (1.0, '#e0b27a')], period=0.75, wave=0.12))]
    tree = surface(body)
    # the face, high enough that the ring passes under it
    for k, yaw in enumerate((-0.3, 0.3)):
        p, n = land(tree, Cn, toward(yaw, 0.44, f, u, s))
        parts += toon_eye(f'seye{k}', p, n, u, 0.26, 1.38, 0.45)
    parts.append(smile_on('smile', tree, Cn, [toward(y, 0.2 - 0.07 * math.cos(y / 0.16 * math.pi / 2), f, u, s) for y in (-0.16, -0.09, 0.0, 0.09, 0.16)], 0.035, INK))
    for k, yaw in enumerate((-0.56, 0.56)):
        p, n = land(tree, Cn, toward(yaw, 0.26, f, u, s))
        parts.append(patch(f'blush{k}', p, n, u, 0.2, 0.12, 0.05, BLUSH))
    # the rings: bands with the dark gap, nearly edge-on, rolled a little
    ring = []
    for k, (r0, r1, col) in enumerate([(1.9, 2.18, '#b9a383'), (2.22, 2.72, '#ead7b0'), (2.84, 3.05, '#d4c09c')]):
        ring.append(put(annulus(f'ring{k}', r0, r1), Flat(col)))
    xform(ring, Matrix.Translation(Cn) @ Matrix.Rotation(-0.2, 4, 'X') @ Matrix.Rotation(-0.05, 4, 'Z'))
    parts += ring
    turn_to(parts, cam_az() - 0.25)
    # a moon on a dotted orbit (the AR app's orbit line), tilted the other way:
    # the moon up and off to one side, the dots stopping short of its face
    orbit = Matrix.Translation(Cn) @ Matrix.Rotation(0.42, 4, 'X') @ Matrix.Rotation(0.3, 4, 'Z')
    R_o, N = 3.45, 40
    camv = C.CAM.normalized()
    right = Vector((camv.z, 0, -camv.x)).normalized()
    want = (right * 0.85 + Vector((0, 0.55, 0))).normalized()
    ring_pts = [orbit @ Vector((R_o * math.cos(TAU * k / N), 0, R_o * math.sin(TAU * k / N))) for k in range(N)]
    km = max(range(N), key=lambda k: (ring_pts[k] - Cn).normalized().dot(want))
    for k, p in enumerate(ring_pts):
        if min((k - km) % N, (km - k) % N) <= 2:
            continue
        rel = p - Cn
        along = rel.dot(camv)
        if along > 0 and (rel - camv * along).length < R + 0.45:
            continue
        parts.append(put(K.sphere(f'od{k}', 0.05, tuple(p), 6, 4), Flat(CYAN, glow=0.6)))
    parts.append(put(smooth(K.sphere('moon', 0.32, tuple(ring_pts[km]), 24, 14)), Flat('#c8ccd4')))
    return parts, {}


# ------------------------------------------------------------- Pinboo

def pinboo():
    """A map pin turned ghost, its white dot one big eye: it never sits where
    the map says it is. The dot it should be on is its own piece (the site
    drops the pin on it and lets it drift off)."""
    f, u, s = facing((1, 0, 0))
    H = Vector((0, 3.3, 0))
    R = 1.2
    chain = [(0.0, 2.62, 0.0, 0.84), (-0.02, 2.12, 0.03, 0.58), (-0.06, 1.72, 0.08, 0.38), (-0.13, 1.4, 0.13, 0.24), (-0.24, 1.15, 0.17, 0.14), (-0.38, 0.98, 0.2, 0.08)]
    arm_w = toward(1.42, -0.2, f, u, s)
    arm_d = toward(-1.42, -0.42, f, u, s)
    el = [ball(tuple(H), R)] + [ball((x, y, z), r) for x, y, z, r in chain] + [
        ell_along(H + arm_w * (R - 0.05), 0.22, arm_w + u * 1.1, 1.75, 0.85),
        ell_along(H + arm_d * (R - 0.05), 0.22, arm_d - u * 0.1, 1.6, 0.85),
    ]
    body = blobs('pin', el, res=0.04)
    parts = [put(body, Flat('#ff6a54'))]
    tree = surface(body)
    # the pin's white dot is its one big eye, glancing off to the side (at the
    # spot it's meant to be on)
    p, n = land(tree, H, toward(0, 0.1, f, u, s))
    upv = (u - n * u.dot(n)).normalized()
    side = upv.cross(n).normalized()
    parts.append(patch('sclera', p, n, u, 0.6, 0.62, 0.3, Flat('#fffaf3'), sink=0.88))
    ic = p + n * 0.04 - side * 0.13 + upv * 0.02
    parts.append(patch('iris', ic, n, u, 0.33, 0.36, 0.14, Flat('#22b8c8'), sink=0.5))
    parts.append(patch('pupil', ic + n * 0.035, n, u, 0.17, 0.2, 0.08, Flat('#0c1418'), sink=0.3))
    for k, (x, y, rr) in enumerate([(-0.12, 0.14, 0.085), (0.1, -0.12, 0.04)]):
        g = K.sphere(f'pglint{k}', 1.0, (0, 0, 0), 12, 8)
        g.data.transform(basis(side * rr, upv * (rr * 1.1), n * (rr * 0.3), ic + n * 0.09 + side * x + upv * y))
        parts.append(put(smooth(g), C.CATCH))
    parts.append(smile_on('pmouth', tree, H, [toward(y, -0.44 - 0.08 * math.cos(y / 0.2 * math.pi / 2), f, u, s) for y in (-0.2, -0.1, 0.0, 0.1, 0.2)], 0.035, Flat('#4a1a1e')))
    for k, yaw in enumerate((-0.55, 0.55)):
        p, n = land(tree, H, toward(yaw, -0.38, f, u, s))
        parts.append(patch(f'pblush{k}', p + n * 0.02, n, u, 0.16, 0.09, 0.04, BLUSH))
    # drifting: leaned over, as if caught by a gust
    xform(parts, Matrix.Rotation(0.14, 4, 'Z') @ Matrix.Rotation(-0.1, 4, 'X'))
    turn_to(parts, cam_az() - 0.3)
    # where the map says it is: the dot and its accuracy ring, a step to its left
    az = cam_az()
    front = Vector((math.cos(az), 0, math.sin(az)))
    left = Vector((-math.sin(az), 0, math.cos(az)))
    G = left * 1.55 + front * 0.75
    dot = [put(torus('halo_rim', 1.3, 0.035, pos=(G.x, 0.02, G.z), seg=64, ring=5), Flat(CYAN, glow=0.5)),
           put(torus('dot_rim', 0.26, 0.06, pos=(G.x, 0.05, G.z), seg=32, ring=6), Flat('#ffffff')),
           put(K.sphere('dot', 0.24, (G.x, 0.05, G.z), 20, 8, scale=(1, 0.3, 1)), Flat(CYAN, glow=0.9))]
    return parts + dot, {'pieces': {'dot': dot}}


# ------------------------------------------------------------- Cameleon

def lens_eye(name, base, aim, up, skin_p):
    """A chameleon's turret eye that is a camera lens: the turret, a steel
    barrel, coated glass and its catchlights."""
    aim = Vector(aim).normalized()
    upv = Vector(up)
    upv = (upv - aim * upv.dot(aim)).normalized()
    side = upv.cross(aim).normalized()  # the viewer's right, looking into the lens
    # columns: x → side, y → aim (the lathe's axis), z = x × y (which is down)
    M = basis(side, aim, side.cross(aim).normalized(), base)
    tur = K.lathe(name + '_tur', [(0.0, -0.06), (0.4, -0.06), (0.46, 0.12), (0.44, 0.29), (0.36, 0.43), (0.29, 0.5), (0.27, 0.52)], seg=32)
    tur.data.transform(M)
    out = [put(smooth(tur), skin_p)]
    barrel = K.lathe(name + '_bar', [(0.25, 0.47), (0.285, 0.51), (0.285, 0.62), (0.27, 0.66), (0.22, 0.67)], seg=32)
    barrel.data.transform(M)
    out.append(put(smooth(barrel), Flat('#d7dce2')))
    grip = torus(name + '_grip', 0.292, 0.025, seg=32, ring=6)
    grip.data.transform(M @ Matrix.Translation((0, 0.565, 0)))
    out.append(put(grip, Flat('#23262c')))
    glass = K.sphere(name + '_glass', 1.0, (0, 0, 0), 24, 12)
    glass.data.transform(M @ basis((0.22, 0, 0), (0, 0.075, 0), (0, 0, 0.22), (0, 0.62, 0)))
    out.append(put(smooth(glass), Flat('#241c4a')))
    for k, (x, y, rr) in enumerate([(-0.09, 0.09, 0.06), (0.08, -0.08, 0.03)]):
        g = K.sphere(f'{name}_glint{k}', 1.0, (0, 0, 0), 10, 6)
        g.data.transform(M @ basis((rr, 0, 0), (0, rr * 0.3, 0), (0, 0, rr * 1.1), (x, 0.69, -y)))
        out.append(put(smooth(g), C.CATCH))
    return out


def cameleon():
    """A chameleon in pixel camouflage, its turret eyes camera lenses, a flash
    on its crest and a shutter button on top, creeping along on its own feet."""
    face_az = cam_az() - 0.9
    cam_local = (Matrix.Rotation(face_az, 4, 'Y') @ C.CAM).normalized()
    Hc = Vector((1.05, 3.7, 0))
    CQ = Vector((0.55, 4.4, 0))
    el = [
        ell((-0.35, 3.17, 0), 0.95, (1.45, 0.98, 0.8), (0, 0, 0.1)),
        ell((0.45, 3.45, 0), 0.72, (1.1, 0.95, 0.78)),
        ell(tuple(Hc), 0.85, (1.2, 0.95, 0.86)),
        ball((1.75, 3.55, 0), 0.42),
        ell(tuple(CQ), 0.6, (1.25, 0.78, 0.34), (0, 0, -0.62)),
    ]
    legs = []
    for k, (hx, fx, sd) in enumerate([(0.5, 0.82, 1), (0.5, 0.75, -1), (-0.95, -1.15, 1), (-0.95, -1.25, -1)]):
        hip = Vector((hx, 2.85, sd * 0.5))
        knee = Vector(((hx + fx) / 2 + 0.05, 2.5, sd * 0.74))
        foot = Vector((fx, 2.03, sd * 0.24))
        legs.append(skin(f'leg{k}', [tuple(hip), tuple(knee), tuple(foot)], [0.2, 0.15, 0.13]))
        el.append(ell(tuple(foot + Vector((0, 0.02, 0))), 0.17, (1.3, 0.75, 1.25)))
    body = blobs('cham', el, res=0.04)
    skin_p = Pixels([(0.0, '#1d8f86'), (0.3, '#27a898'), (0.62, '#36c0a6'), (0.9, '#8fd96a')], '#cdf3df', cell=0.2)
    parts = [put(body, skin_p)]  # (it was posed on a root: its feet are at y 2.03, set down below)
    parts += [put(lg, skin_p) for lg in legs]
    c = Vector((-2.25, 2.62, 0))
    tail = [Vector((-1.35, 3.2, 0.0))]
    for i in range(36):
        th = math.radians(75) + i / 35 * math.radians(400)
        r = 0.72 * (1 - 0.63 * i / 35)
        tail.append(c + Vector((r * math.cos(th), r * math.sin(th), 0.12 * i / 35)))
    parts.append(put(skin('tail', [tuple(p) for p in tail], [0.4 - 0.32 * (i / (len(tail) - 1)) ** 0.8 for i in range(len(tail))]), skin_p))
    for k in range(7):
        t = k / 6
        p = Vector((0.15 - 1.55 * t, 4.17 - 0.12 * t - 0.25 * t * t, 0))
        sp = K.cyl(f'spine{k}', 0.08, 0.22, pos=(0, 0, 0), r2=0.0, seg=8)
        sp.data.transform(Matrix.Translation(p) @ Matrix.Rotation(0.25, 4, 'Z'))
        parts.append(put(smooth(sp), skin_p))
    tree = surface(body)
    up = Vector((0, 1, 0))
    near_b, near_n = land(tree, Hc + Vector((0.12, 0.22, 0)), Vector((0.2, 0.25, 1.0)))
    parts += lens_eye('eyeN', near_b - near_n * 0.06, (cam_local + Vector((0.0, -0.05, 0.25))).normalized(), up, skin_p)
    far_b, far_n = land(tree, Hc + Vector((0.12, 0.22, 0)), Vector((0.2, 0.25, -1.0)))
    parts += lens_eye('eyeF', far_b - far_n * 0.06, Vector((0.25, 0.85, -0.5)).normalized(), up, skin_p)
    dirs = [Vector((1.0, -0.25, 0.0)), Vector((0.85, -0.35, 0.45)), Vector((0.45, -0.35, 0.85)), Vector((0.1, -0.2, 1.0)), Vector((-0.05, -0.02, 1.0))]
    parts.append(smile_on('cmouth', tree, Hc + Vector((0.25, -0.1, 0)), dirs, 0.035, Flat('#0e3b39')))
    p, n = land(tree, Hc + Vector((0.25, -0.1, 0)), Vector((0.55, -0.2, 0.9)))
    parts.append(patch('cblush', p, n, up, 0.17, 0.1, 0.04, BLUSH))
    p, n = land(tree, CQ, Vector((0.8, 0.35, 0)))
    parts.append(patch('flash', p, n, up, 0.14, 0.08, 0.05, Flat('#f4fbff', glow=0.35), sink=0.1))
    p2, n2 = land(tree, CQ, Vector((-0.2, 1.0, 0)))
    parts.append(put(K.cyl('shutter', 0.15, 0.13, pos=tuple(p2 + n2 * 0.04), seg=16, bev=0.03), Flat('#ff4a3d')))
    turn_to(parts, face_az)
    xform(parts, Matrix.Translation((0, -2.03, 0)))  # down on its feet
    return parts, {}


# ------------------------------------------------------------- Moletage

def moletage():
    """A mole in a street-works vest, come up out of its molehill with the end
    of a cable it dug up from under the street, still sparking. The molehill
    and the street works round it are their own piece: its home, the hole it
    pops up out of (the site hides what's below the rim, MOLE_RIM)."""
    f, u, s = facing((1, 0, 0))
    soil = Flat('#4c3426')
    # the molehill: turned-up earth heaped round the hole the mole sits in,
    # lumpy, lighter where it's dried on top, dark down the hole
    M0 = Vector((0.42, 0, 0.25))
    mound_el = [ell((M0.x, 0.0, M0.z), 2.05, (1.0, 0.26, 1.0))]
    for k in range(13):
        a = TAU * k / 13 + 0.3 + 0.12 * math.sin(5.1 * k)
        r = 1.48 + 0.12 * math.sin(3.7 * k + 1)
        mound_el.append(ball((M0.x + r * math.cos(a), 0.24 + 0.1 * math.sin(2.3 * k), M0.z + r * math.sin(a)), 0.4 + 0.12 * (0.5 + 0.5 * math.sin(4.3 * k + 0.5))))
    for k in range(9):
        a = TAU * k / 9 + 0.6
        mound_el.append(ball((M0.x + 1.98 * math.cos(a), 0.08, M0.z + 1.98 * math.sin(a)), 0.28 + 0.08 * math.sin(2.9 * k)))
    earth = Ramp(['#3a281d', '#6b4b34'], axis=(0, 1, 0), stops=(0.35, 0.85))
    mound = blobs('mound', mound_el, res=0.05, neg=[ell((M0.x, 0.55, M0.z), 1.2, (1.0, 0.8, 1.0))])
    bm = bmesh.new()
    bm.from_mesh(mound.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, -1, 0), clear_outer=True)
    bm.to_mesh(mound.data)  # flat on the lawn: nothing under it
    bm.free()
    hill = [put(mound, earth)]
    hill.append(put(K.cyl('hole', 1.08, 0.02, pos=(M0.x, 0.05, M0.z), seg=32), Flat('#150d09')))
    for k in range(14):
        a = TAU * k / 14 + 0.17 * k
        r = 2.25 + 0.35 * math.sin(2.3 * k)
        hill.append(put(K.sphere(f'crumb{k}', 0.07 + 0.04 * (k % 3) / 2, (M0.x + r * math.cos(a), 0.04, M0.z + r * math.sin(a)), 8, 5, scale=(1, 0.7, 1)), soil))
    # the bricks it brought up: one on the hill, two on the grass
    for k, (p, rot) in enumerate([((0.2, 0.62, -1.15), (0.45, 0.5, 0.35)), ((-1.75, 0.1, -0.5), (0.0, 1.7, 0.0)), ((2.5, 0.1, -0.55), (0.0, 0.4, 0.0))]):
        hill.append(put(K.rbox(f'brick{k}', (0.62, 0.2, 0.3), 0.04, pos=p, rot=rot, bev=0.015), Flat('#a4493a')))
    B = Vector((0.35, 1.08, 0.25))
    Hh = Vector((0.5, 2.62, 0.25))
    velvet = Ramp(['#3b374a', '#615c78'], axis=(0.85, -0.45, 0), stops=(0.5, 0.78))
    body = blobs('mole', [ell(tuple(B), 1.05, (0.95, 1.0, 0.95)), ell((0.75, 0.9, 0.25), 0.72, (0.85, 0.95, 1.0)), ball(tuple(Hh), 0.9)], res=0.035)
    parts = [put(body, velvet)]
    tree = surface(body)
    pink = Flat('#f4a3b1')
    p, n = land(tree, Vector((0.55, 1.0, 0.25)), toward(0.0, -0.1, f, u, s))
    parts.append(patch('tummy', p, n, u, 0.7, 0.78, 0.36, Ramp(['#7d7893', '#9a95ad'], axis=(0, 1, 0)), sink=0.88))
    feet = []
    for sd in (-1, 1):
        c = Vector((1.22, 0.15, 0.25 + sd * 0.45))
        feet.append(ell_along(c, 0.2, (1, 0, sd * 0.25), 1.5, 0.6))
        for k in range(3):
            feet.append(ball(tuple(c + Vector((0.27, 0.0, sd * 0.06 + (k - 1) * 0.1))), 0.075))
    feet.append(ball((-0.66, 0.35, 0.25), 0.11))
    parts.append(put(blobs('feet', feet, res=0.03), pink))
    sp, _ = land(tree, Hh, toward(0.0, -0.18, f, u, s))
    tip = sp + Vector((0.36, -0.05, 0))
    parts.append(put(blobs('snout', [ell_along(sp + Vector((0.08, 0, 0)), 0.23, tip - sp, 1.25, 0.85), ball(tuple(tip), 0.17)], res=0.03), pink))
    parts.append(put(K.sphere('nose', 0.11, tuple(tip + Vector((0.13, 0.025, 0))), 14, 10, scale=(0.8, 0.75, 1.15)), Flat('#e2607e')))
    for sd in (-1, 1):
        for k in range(3):
            a = tip + Vector((-0.1, 0.03 - 0.05 * k, sd * 0.12))
            parts.append(put(wire(f'wh{sd}{k}', [tuple(a), tuple(a + Vector((0.08, 0.03 - 0.05 * k, sd * 0.2))), tuple(a + Vector((0.12, 0.04 - 0.11 * k, sd * 0.4)))], 0.012, res=3), Flat('#efe9f2')))
    for k, yaw in enumerate((-0.36, 0.36)):
        p, n = land(tree, Hh, toward(yaw, 0.14, f, u, s))
        parts += toon_eye(f'meye{k}', p, n, u, 0.17, 1.2, 0.5)
    for k, yaw in enumerate((-0.62, 0.62)):
        p, n = land(tree, Hh, toward(yaw, -0.1, f, u, s))
        parts.append(patch(f'mblush{k}', p, n, u, 0.16, 0.1, 0.04, BLUSH))
    parts.append(smile_on('mmouth', tree, Hh, [toward(y, -0.48 - 0.05 * math.cos(y / 0.18 * math.pi / 2), f, u, s) for y in (-0.18, -0.09, 0.0, 0.09, 0.18)], 0.03, Flat('#2a1520')))
    # a street-works vest: orange, two silver bands, open down the front
    vest = C.D.objects.new('vest', body.data.copy())
    K.scene().collection.objects.link(vest)
    bm = bmesh.new()
    bm.from_mesh(vest.data)
    for co, no, clear in [((0, 1.95, 0), (0, 1, 0), True), ((0, 0.5, 0), (0, -1, 0), True), ((0, 0, -0.17), (0, 0, 1), False), ((0, 0, 0.67), (0, 0, 1), False)]:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no, clear_outer=clear)
    kill = [fc for fc in bm.faces if (lambda c: c.x > B.x + 0.25 and -0.17 < c.z < 0.67)(fc.calc_center_median())]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * 0.03
    bm.to_mesh(vest.data)
    bm.free()
    K.add_mod(vest, 'SOLIDIFY', thickness=0.05, offset=1)
    K.bake(vest)
    parts.append(put(smooth(vest), YBands(0.5, 1.95, '#ff6a13', '#d3d8dc', [(0.36, 0.45), (0.66, 0.75)])))
    # and the cone that says the street's up
    cone = K.lathe('cone', [(0.0, 0.8), (0.05, 0.8), (0.21, 0.08), (0.24, 0.06), (0.0, 0.06)], seg=20)
    foot = K.rbox('cone_foot', (0.6, 0.06, 0.6), 0.08, pos=(0, 0.03, 0), bev=0.01)
    cn = [put(smooth(cone), YBands(0.06, 0.8, '#ff5a1f', '#f2f2ee', [(0.42, 0.55), (0.7, 0.8)])), put(foot, Flat('#2b2d31'))]
    xform(cn, Matrix.Translation((-1.55, 0, 1.5)) @ Matrix.Rotation(0.3, 4, 'Y'))
    hill += cn

    def hand(name, at, d, palm_n, curl=0.0):
        d = Vector(d).normalized()
        pn = Vector(palm_n)
        pn = (pn - d * pn.dot(d)).normalized()
        sd = pn.cross(d).normalized()  # so (d, sd, pn) is a right-handed frame
        el = [{'type': 'ELLIPSOID', 'co': tuple(at), 'r': 0.28 / MB, 'size': (1.15, 1.0, 0.45), 'quat': basis(d, sd, pn, (0, 0, 0)).to_quaternion()}]
        claws = []
        for k in range(5):
            o = (k - 2) * 0.12
            fp = Vector(at) + d * (0.34 - 0.04 * abs(k - 2)) + sd * o - pn * curl
            el.append(ball(tuple(fp), 0.08))
            cl = K.cyl(f'{name}_claw{k}', 0.035, 0.12, pos=(0, 0, 0), r2=0.0, seg=6)
            q = Vector((0, 1, 0)).rotation_difference(d)
            cl.data.transform(Matrix.Translation(fp + d * 0.09) @ q.to_matrix().to_4x4())
            claws.append(put(smooth(cl), Flat('#f4eee6')))
        return [put(blobs(name, el, res=0.03), pink)] + claws
    hL, hR = Vector((1.42, 1.1, -0.12)), Vector((1.45, 1.32, 0.62))
    parts += hand('handL', hL, (0.25, 0.1, 0.95), (0.1, 0.95, -0.1))
    parts += hand('handR', hR, (0.25, -0.15, -0.95), (0.1, -0.95, 0.1))
    for k, (a, b) in enumerate([((0.62, 1.5, -0.3), hL - Vector((0.15, 0, -0.12))), ((0.65, 1.62, 0.75), hR - Vector((0.15, 0, 0.12)))]):
        parts.append(put(skin(f'arm{k}', [a, tuple(b)], [0.24, 0.19]), velvet))
    # the cable, up out of the hole beside it to the paw that holds it up
    cab = catmull([(1.0, 0.1, -0.45), (1.42, 0.42, -0.42), (1.62, 0.75, -0.1), (1.5, 1.2, 0.25), (1.45, 1.62, 0.3)], 6)
    parts.append(put(skin('cable', [tuple(p) for p in cab], 0.08, sub=1), Flat('#ff7b35')))
    end = cab[-1]
    up_d = (cab[-1] - cab[-2]).normalized()
    side_d = up_d.cross(Vector((1, 0, 0))).normalized()
    other = up_d.cross(side_d).normalized()
    for k in range(3):
        a = TAU * k / 3
        o = side_d * (0.035 * math.cos(a)) + other * (0.035 * math.sin(a))
        parts.append(put(wire(f'cu{k}', [tuple(end + o * 0.5), tuple(end + up_d * 0.1 + o), tuple(end + up_d * 0.16 + o * 1.8)], 0.02, res=3), Flat('#d0844f')))
    spark_c = end + up_d * 0.3
    for k, ax in enumerate([side_d, other, up_d]):
        sk = K.sphere(f'spark{k}', 1.0, (0, 0, 0), 8, 5)
        b1 = ax * 0.18
        b2 = ax.orthogonal().normalized() * 0.035
        sk.data.transform(basis(b1, b2, b1.cross(b2).normalized() * 0.035, spark_c))
        parts.append(put(smooth(sk), Flat(CYAN, glow=1.0)))
    turn_to(parts + hill, cam_az() - 0.35)
    return parts + hill, {'pieces': {'hill': hill}}


# ------------------------------------------------------------- Driftnot

def chain(name, a, b, sag=0.25, pitch=0.19, paint_=None):
    """A chain of oval links from a to b, sagging a little, each link turned a
    quarter to the last."""
    a, b = Vector(a), Vector(b)

    def at(t):
        return a.lerp(b, t) - Vector((0, 1, 0)) * (sag * 4 * t * (1 - t))
    n = max(2, int((b - a).length / pitch))
    out = []
    for i in range(n):
        t = (i + 0.5) / n
        p = at(t)
        tg = (at(min(1, t + 0.01)) - at(max(0, t - 0.01))).normalized()
        n1 = tg.cross(Vector((0, 1, 0)))
        n1 = (n1 if n1.length > 1e-4 else tg.cross(Vector((1, 0, 0)))).normalized()
        n2 = tg.cross(n1).normalized()
        ln = torus(f'{name}{i}', 0.1, 0.03, seg=12, ring=5)
        ln.data.transform(basis(tg * 1.55, n1, n2, p) if i % 2 else basis(tg * 1.55, n2, -n1, p))
        out.append(put(ln, paint_))
    return out


def driftnot():
    """A cloud on a chain, its anchor dug into the lawn so it can't drift off.
    The anchor and its ring are their own piece: its home, where it puffs up."""
    f, u, s = facing((1, 0, 0))
    Cc = Vector((0, 4.05, 0))
    puffs = [((0, 0.25, 0), 1.0), ((0.05, 0.05, 0.95), 0.74), ((0.05, 0.05, -0.95), 0.74), ((-0.15, -0.05, 1.62), 0.5), ((-0.15, -0.05, -1.62), 0.5),
             ((-0.1, 0.9, 0.5), 0.62), ((-0.15, 0.82, -0.52), 0.58), ((-0.6, 0.35, 0.0), 0.85), ((-0.45, 0.55, 0.95), 0.55), ((-0.45, 0.5, -0.95), 0.55)]
    el = [ball(tuple(Cc + Vector(p)), r) for p, r in puffs] + [ell(tuple(Cc + Vector((-0.1, -0.3, 0))), 0.95, (1.0, 0.42, 1.9))]
    cloud = blobs('cloud', el, res=0.05)
    parts = [put(cloud, Ramp(['#b4c6dc', '#ffffff'], axis=(0, 1, 0), stops=(0.3, 0.62)))]
    tree = surface(cloud)
    F = Cc + Vector((0, 0.2, 0))
    for k, yaw in enumerate((-0.3, 0.3)):
        p, n = land(tree, F, toward(yaw, 0.12, f, u, s))
        parts += toon_eye(f'ceye{k}', p, n, u, 0.22, 1.35, 0.45)
    parts.append(smile_on('csmile', tree, F, [toward(y, -0.14 - 0.07 * math.cos(y / 0.16 * math.pi / 2), f, u, s) for y in (-0.16, -0.08, 0.0, 0.08, 0.16)], 0.035, INK))
    for k, yaw in enumerate((-0.55, 0.55)):
        p, n = land(tree, F, toward(yaw, -0.02, f, u, s))
        parts.append(patch(f'cblush{k}', p, n, u, 0.18, 0.11, 0.045, BLUSH))
    # the anchor: shank, ring, stock, the curved arms and their flukes, ship-red
    an = [K.cyl('shank', 0.1, 1.55, pos=(0, 1.12, 0), seg=12, bev=0.03)]
    ring = torus('aring', 0.19, 0.055, seg=20, ring=6)
    ring.data.transform(Matrix.Translation((0, 2.08, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    an.append(ring)
    an.append(K.cyl('stock', 0.065, 1.1, pos=(0, 1.72, 0), rot=(math.pi / 2, 0, 0), seg=10, bev=0.02))
    for sd in (-1, 1):
        an.append(K.sphere(f'stock_end{sd}', 0.1, (0, 1.72, sd * 0.55), 10, 6))
    arms = torus('arms', 0.62, 0.085, seg=24, ring=6, arc=math.radians(150))
    arms.data.transform(Matrix.Translation((0, 0.95, 0)) @ Matrix.Rotation(-0.26, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    an.append(arms)
    an.append(K.sphere('crown', 0.14, (0, 0.33, 0), 12, 8))
    for sd in (-1, 1):
        th = math.radians(-15 if sd > 0 else -165)
        end = Vector((0.62 * math.cos(th), 0.95 + 0.62 * math.sin(th), 0))
        tg = Vector((-math.sin(th), math.cos(th), 0)) * (1 if sd > 0 else -1)
        fl = K.cyl(f'fluke{sd}', 0.2, 0.42, r2=0.0, seg=12)
        q = Vector((0, 1, 0)).rotation_difference(tg)
        fl.data.transform(Matrix.Translation(end + tg * 0.12) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((1, 1, 0.35, 1)))
        an.append(fl)
    an = [put(smooth(o), Flat('#e0553a')) for o in an]
    A = Vector((0.95, 0, -1.65))
    M = Matrix.Translation(A) @ Matrix.Rotation(0.5, 4, 'Y') @ Matrix.Rotation(-0.24, 4, 'Z')
    xform(an, M)
    low = min(v.co.y for o in an for v in o.data.vertices)
    xform(an, Matrix.Translation((0, -low - 0.07, 0)))
    ring_top = Matrix.Translation((0, -low - 0.07, 0)) @ M @ Vector((0, 2.08 + 0.19, 0))
    # the chain up to its underside, and the AR anchor's ring on the lawn
    top, _ = land(tree, Cc + Vector((0.15, 0, -0.35)), Vector((0.1, -1, -0.15)))
    parts += chain('link', ring_top, top + Vector((0, 0.05, 0)), sag=0.2, paint_=Flat('#aeb8c2'))
    an.append(put(torus('anchor_ring', 0.78, 0.035, pos=(A.x, 0.015, A.z), seg=48, ring=5), Flat(CYAN, glow=0.7)))
    turn_to(parts + an, cam_az() - 0.2)
    return parts + an, {'pieces': {'anchor': an}}


# ------------------------------------------------------------- Chatterkeet

def chatterkeet():
    """One of Amsterdam's green parakeets, down on the grass, a reply always on
    its way. The speech bubble is its own piece, so the site can keep it
    turned to you whichever way the bird hops."""
    f, u, s = facing((1, 0, 0))
    turn = rot_about('Y', -0.5, (0.1, 3.3, 0))
    fh = (turn.to_3x3() @ f).normalized()
    sh = (turn.to_3x3() @ s).normalized()
    Hb = turn @ Vector((0.18, 3.62, 0))
    body = blobs('parakeet', [ell((0.02, 2.72, 0), 0.62, (0.92, 1.12, 0.88), (0, 0, 0.12)), ball(tuple(Hb), 0.56)], res=0.035)
    parts = [put(body, Ramp(['#2c9a46', '#b9e66b'], axis=(0.75, -0.65, 0), stops=(0.46, 0.72)))]
    tree = surface(body)
    wing_p = Ramp(['#2a7f8c', '#2a8a4a'], axis=(1, 0.4, 0), stops=(0.25, 0.55))
    for sd in (-1, 1):
        parts.append(put(blobs(f'pwing{sd}', [ell((-0.12, 2.78, sd * 0.55), 0.4, (1.5, 0.7, 0.35), (0, sd * 0.1, -0.55)), ell((-0.5, 2.38, sd * 0.45), 0.3, (1.7, 0.5, 0.3), (0, sd * 0.1, -0.8))], res=0.03), wing_p))
    for sd in (-1, 1):
        # the long tail, slanting back over the grass
        parts.append(put(skin(f'ptail{sd}', [(-0.42, 2.45, sd * 0.05), (-0.95, 2.28, sd * 0.09), (-1.45, 2.16, sd * 0.07), (-1.85, 2.12, sd * 0.02)], [0.13, 0.1, 0.06, 0.02], flat=0.4), Flat('#2f9a86')))
    parts.append(ring_on('collar_k', tree, turn @ Vector((0.12, 3.18, 0)), 0.45, 0.05, Flat('#16181a'), n=24))
    parts.append(ring_on('collar_r', tree, turn @ Vector((0.05, 3.3, 0)), 0.3, 0.04, Flat('#f08aa8'), n=24))
    p, n = land(tree, Hb, toward(0.0, -0.1, fh, u, sh))
    parts.append(put(skin('beak', [tuple(p - fh * 0.12), tuple(p + fh * 0.12 + u * 0.02), tuple(p + fh * 0.26 - u * 0.1), tuple(p + fh * 0.24 - u * 0.26)], [0.16, 0.13, 0.07, 0.02]), Flat('#e43f37')))
    low = K.sphere('lowbeak', 1.0, (0, 0, 0), 12, 8)
    low.data.transform(basis(fh * 0.13, u * 0.07, sh * 0.1, p + fh * 0.05 - u * 0.2))
    parts.append(put(smooth(low), Flat('#a92c2a')))
    for k, yaw in enumerate((-0.52, 0.52)):
        q, nq = land(tree, Hb, toward(yaw, 0.2, fh, u, sh))
        parts += toon_eye(f'peye{k}', q, nq, u, 0.16, 1.3, 0.45)
    toe = Flat('#b79aa3')
    for sd in (-1, 1):
        for dx in (1, -1):
            for dz in (-0.05, 0.05):
                a = Vector((0.0, 2.12, sd * 0.17 + dz))
                b = Vector((dx * 0.17, 2.07, sd * 0.19 + dz * 1.4))
                c = Vector((dx * 0.26, 2.06, sd * 0.2 + dz * 1.6))
                parts.append(put(skin(f'toe{sd}{dx}{dz}', [tuple(a), tuple(b), tuple(c)], [0.05, 0.045, 0.035], sub=1), toe))
    az = cam_az() - 0.7
    turn_to(parts, az)
    # a speech bubble by its head, facing the way it's seen from, a reply being typed
    camv = C.CAM.normalized()
    right = Vector((camv.z, 0, -camv.x)).normalized()
    upw = camv.cross(right).normalized()  # the view's up
    head_w = Matrix.Rotation(-az, 4, 'Y') @ Hb
    bc = head_w + right * 1.25 + Vector((0, 0.72, 0))
    q = basis(right, upw, camv, (0, 0, 0)).to_quaternion()
    white = Flat('#ffffff')
    bubble = [put(blobs('bubble', [{'type': 'ELLIPSOID', 'co': tuple(bc), 'r': 0.36 / MB, 'size': (1.95, 1.0, 0.42), 'quat': q},
                                      {'type': 'ELLIPSOID', 'co': tuple(bc - right * 0.42 - upw * 0.3), 'r': 0.12 / MB, 'size': (1.0, 1.0, 0.6), 'quat': q}], res=0.03), white)]
    tail = K.cyl('bubble_tail', 0.1, 0.32, r2=0.0, seg=10)
    tq = Vector((0, 1, 0)).rotation_difference((-right * 0.8 - upw * 0.6).normalized())
    tail.data.transform(Matrix.Translation(bc - right * 0.5 - upw * 0.38) @ tq.to_matrix().to_4x4() @ Matrix.Diagonal((1, 1, 0.5, 1)))
    bubble.append(put(smooth(tail), white))
    for k, (dx, g) in enumerate([(-0.27, 1.0), (0.0, 0.65), (0.27, 0.35)]):
        bubble.append(put(K.sphere(f'dot{k}', 0.085, tuple(bc + right * dx + camv * 0.16), 12, 8), Flat(CYAN, glow=g)))
    xform(parts + bubble, Matrix.Translation((0, -2.05, 0)))  # down on the grass
    return parts + bubble, {'pieces': {'bubble': bubble}}


# ------------------------------------------------------------- Jerboost

def jerboost():
    """A jerboa ready to spring, the crown on, a chequered flag at the end of
    its tail. (Posed in mid-leap; set down below so its toes touch the grass.)"""
    f, u, s = facing((1, 0, 0))
    Bj = Vector((1.35, 1.78, 0))
    turn = rot_about('Y', -0.55, Bj + Vector((0.3, 0.3, 0)))
    fh = (turn.to_3x3() @ f).normalized()
    sh = (turn.to_3x3() @ s).normalized()
    Hj = turn @ Vector((1.88, 2.3, 0))
    fur = Ramp(['#d8a96c', '#fbf0dc'], axis=(0.25, -1, 0), stops=(0.43, 0.6))
    ears = [ell(tuple(turn @ Vector((1.75, 2.95, sd * 0.32))), 0.4, (0.3, 1.35, 0.8), (sd * 0.32, -sd * 0.25, 0.32)) for sd in (-1, 1)]
    el = [ell(tuple(Bj), 0.5, (1.2, 0.95, 0.9), (0, 0, 0.35)), ball(tuple(Hj), 0.52), ell(tuple(Hj + fh * 0.42 - u * 0.12), 0.2, (1.2, 0.85, 0.9))] + ears
    for sd in (-1, 1):
        el.append(ell(tuple(Bj + Vector((0.42, -0.02, sd * 0.2))), 0.1, (1.6, 0.7, 0.7), (0, 0, -0.6)))
    body = blobs('jerboa', el, res=0.03)
    parts = [put(body, fur)]
    tree = surface(body)
    pink = Flat('#f4aab5')
    for sd in (-1, 1):
        ec = turn @ Vector((1.75, 2.95, sd * 0.32))
        p, n = land(tree, ec, (fh + sh * sd * 0.25).normalized())
        parts.append(patch(f'inner_ear{sd}', p, n, u, 0.2, 0.38, 0.05, pink, sink=0.3))
    for k, yaw in enumerate((-0.42, 0.42)):
        p, n = land(tree, Hj, toward(yaw, 0.12, fh, u, sh))
        parts += toon_eye(f'jeye{k}', p, n, u, 0.18, 1.3, 0.45)
    tip, tn = land(tree, Hj + fh * 0.42 - u * 0.12, fh)
    parts.append(put(K.sphere('jnose', 0.07, tuple(tip + tn * 0.02), 10, 6), Flat('#e9768c')))
    for sd in (-1, 1):
        for k in range(2):
            a = tip - fh * 0.06 + sh * (sd * 0.07) - u * (0.02 + 0.05 * k)
            parts.append(put(wire(f'jw{sd}{k}', [tuple(a), tuple(a + sh * (sd * 0.22) + fh * 0.04 - u * 0.03 * k), tuple(a + sh * (sd * 0.42) + fh * 0.02 - u * (0.02 + 0.08 * k))], 0.01, res=3), Flat('#efe9f2')))
    parts.append(smile_on('jmouth', tree, Hj, [toward(y, -0.42 - 0.05 * math.cos(y / 0.14 * math.pi / 2), fh, u, sh) for y in (-0.14, -0.07, 0.0, 0.07, 0.14)], 0.022, Flat('#3a2420')))
    for sd in (-1, 1):
        hip = Bj + Vector((-0.32, -0.22, sd * 0.24))
        knee = Bj + Vector((-0.62, -0.58, sd * 0.27))
        ankle = Bj + Vector((-1.02, -0.52, sd * 0.24))
        toes = Bj + Vector((-1.5, -0.6, sd * 0.22))
        parts.append(put(skin(f'jleg{sd}', [tuple(hip), tuple(knee), tuple(ankle), tuple(toes)], [0.17, 0.11, 0.08, 0.06]), fur))
        parts.append(put(blobs(f'jfoot{sd}', [ell(tuple(toes + Vector((-0.05, 0, 0))), 0.13, (2.1, 0.6, 1.0), (0, 0, 0.1))], res=0.025), pink))
    tl = catmull([tuple(Bj + Vector(p)) for p in [(-0.48, -0.02, 0.0), (-1.15, 0.12, 0.08), (-1.85, 0.42, -0.04), (-2.45, 0.85, 0.06), (-2.9, 1.08, 0.02)]], 6)
    parts.append(put(skin('jtail', [tuple(p) for p in tl], [0.08 - 0.04 * i / (len(tl) - 1) for i in range(len(tl))]), fur))
    flag = C.plane('flag', 0.66, 0.46, sub=12)
    for v in flag.data.vertices:
        v.co.z += 0.05 * math.sin((v.co.x + 0.33) * 9.0) * (v.co.x + 0.33) / 0.66
    K.add_mod(flag, 'SOLIDIFY', thickness=0.02, offset=0)
    K.bake(flag)
    flag.data.transform(Matrix.Translation(tl[-1] + Vector((-0.33, -0.19, 0))) @ Matrix.Rotation(-0.12, 4, 'Z'))
    parts.append(put(flag, Checker(4)))
    gold = Flat('#f3c443')
    crown = [K.lathe('crown_band', [(0.17, 0.0), (0.2, 0.0), (0.2, 0.11), (0.17, 0.11)], seg=20, closed=True)]
    for k in range(5):
        a = TAU * k / 5
        crown.append(K.cyl(f'crown_pt{k}', 0.055, 0.15, pos=(0.185 * math.cos(a), 0.18, 0.185 * math.sin(a)), r2=0.0, seg=8))
        crown.append(K.sphere(f'crown_gem{k}', 0.03, (0.185 * math.cos(a), 0.27, 0.185 * math.sin(a)), 8, 5))
    crown = [put(smooth(o), gold) for o in crown]
    xform(crown, Matrix.Translation(Hj + u * 0.47 - fh * 0.06) @ Matrix.Rotation(0.32, 4, 'Z') @ Matrix.Rotation(0.12, 4, 'X') @ Matrix.Scale(1.45, 4))
    parts += crown
    turn_to(parts, cam_az() - 1.15)
    low = min(v.co.y for o in parts for v in o.data.vertices)
    xform(parts, Matrix.Translation((0, -low, 0)))  # down on its toes
    return parts, {}


# ------------------------------------------------------------- export

# each one's size in the park: park units per toy unit
CREATURES = [
    ('orbitot', orbitot, 0.0165),
    ('pinboo', pinboo, 0.0175),
    ('cameleon', cameleon, 0.0165),
    ('moletage', moletage, 0.021),
    ('driftnot', driftnot, 0.0165),
    ('chatterkeet', chatterkeet, 0.018),
    ('jerboost', jerboost, 0.0175),
]
DENSITY = 40  # triangles per square toy unit of surface: they're a few dozen pixels tall
MIN_TRIS = 60


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def thin(ob):
    """Decimate a part to about DENSITY triangles per unit of its surface."""
    n = tris(ob)
    if n < 300:
        return ob
    area = sum(p.area for p in ob.data.polygons)
    want = max(MIN_TRIS, int(area * DENSITY))
    if n > want * 1.15:
        m = ob.modifiers.new('thin', 'DECIMATE')
        m.ratio = want / n
        K.bake(ob)
    return ob


def build(cid, fn, scale):
    C.TURN['az'] = 0.0
    C.PAINT.clear()
    parts, meta = fn()
    pieces = meta.get('pieces', {})
    for o in parts:
        thin(o)
        C.paint(o)
    # face +X again, centre on the body's footprint, into park units
    xform(parts, Matrix.Rotation(C.TURN['az'], 4, 'Y'))
    in_piece = {o.name for objs in pieces.values() for o in objs}
    main = [o for o in parts if o.name not in in_piece]
    xs = [v.co.x for o in main for v in o.data.vertices]
    zs = [v.co.z for o in main for v in o.data.vertices]
    cx, cz = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2
    xform(parts, Matrix.Scale(scale, 4) @ Matrix.Translation((-cx, 0, -cz)))
    out = [K.join(cid, main)]
    for name, objs in pieces.items():
        out.append(K.join(f'{cid}_{name}', objs))
    return out


def main():
    K.reset()
    t0 = time.time()
    obs = []
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    for cid, fn, scale in CREATURES:
        if only and cid not in only:
            continue
        t1 = time.time()
        made = build(cid, fn, scale)
        obs += made
        for o in made:
            lo = [min(v.co[i] for v in o.data.vertices) for i in range(3)]
            hi = [max(v.co[i] for v in o.data.vertices) for i in range(3)]
            print(f'  {o.name:18s} {tris(o):6d} tris  {hi[0] - lo[0]:.3f} × {hi[1] - lo[1]:.3f} × {hi[2] - lo[2]:.3f}  y {lo[1]:.3f}..{hi[1]:.3f}  {time.time() - t1:.1f}s')
    print(f'creatures: {len(obs)} meshes, {sum(tris(o) for o in obs)} tris, {time.time() - t0:.1f}s')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'creatures-raw.glb')
    for o in K.scene().objects:
        o.select_set(False)
    for o in obs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_yup=False,
        export_apply=True,
        export_normals=True,
        export_texcoords=False,
        export_tangents=False,
        export_materials='NONE',
        export_vertex_color='ACTIVE',
        export_extras=False,
        use_mesh_edges=False,
        use_mesh_vertices=False,
    )
    print(f'exported {path} {os.path.getsize(path) / 1024:.0f} KB')


if __name__ == '__main__':
    main()
