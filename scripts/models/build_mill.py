# The city's windmill (the DTT hotspot), built in Blender and exported as one
# glb of named parts for the site (src/scene/maquette/city.tsx). See README.md
# to rebuild.
#
# A stage mill (stellingmolen), like the working mills along the Zaan: an
# eight-sided thatched smock on a brick base, a wooden stage round the base's
# top, and a boat-shaped cap carrying the sails. Coordinates are mill-local
# (see modelkit.py): Y up, the ground at y 0, the mill on the origin facing +Z,
# its sails toward the camera. It keeps the old mill's envelope — about 0.3
# round at the foot, the sails ~0.44 long — so the hotspot, the camera
# framing and the road ending at its foot still fit.
#   mill_ground   the paved yard it stands on
#   mill_body     base and smock, one glass shell (outlined)
#   mill_cap      the boat-shaped cap (outlined)
#   mill_trim     stage, struts, railing and the beard board (no outline)
#   mill_windows  the four windows that light when the mill is woken
#   mill_sails    the four sails' ladders and the windshaft's head, in hub
#                 space — they turn together and carry no outline
#   mill_cloth    ONE sail's cloth, in hub space pointing up +Y, from x 0 at
#                 the whip across to the rail: the site draws it four times a
#                 quarter turn apart, outlines it, and sets it by scale x
# city.tsx keeps a copy of HUB (MILL_HUB): it places and tilts the sails.
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modelkit as K  # noqa: E402  (imports bpy first)
from modelkit import BEV_M, BEV_S, TAU  # noqa: E402

import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

# Where the sails turn: the hub (y, z), the sail from r_in to r_out along its
# whip and w across, and the windshaft's tilt, up at the front as a real
# one's is. city.tsx turns the sails about the same hub (MILL_HUB), so y, z
# and tilt change in both.
HUB = dict(y=0.70, z=0.265, r_in=0.075, r_out=0.44, w=0.075, tilt=0.12)
STAGE_Y = 0.215  # the stage's floor, the base's top
TOP = 0.645  # where the smock meets the cap


# ============================================================== helpers


def beam(name, p0, p1, w, d=None):
    """A box from p0 to p1, w by d in section."""
    d = w if d is None else d
    v = Vector(p1) - Vector(p0)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(w, v.length, d), verts=bm.verts)
    ob = K.mk(name, bm)
    q = Vector((0, 1, 0)).rotation_difference(v.normalized())
    ob.data.transform(Matrix.Translation((Vector(p0) + Vector(p1)) / 2) @ q.to_matrix().to_4x4())
    ob.data.update()
    return ob


def ngon(r, n=8):
    """A regular n-gon's corners in XZ, its flats facing the axes."""
    return [(r * math.sin(TAU * i / n + math.pi / n), r * math.cos(TAU * i / n + math.pi / n)) for i in range(n)]


def rect(w, d):
    return [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)]


def loft_z(name, sections):
    """Skin (outline in XY, at z) sections along Z, capped: a hull."""
    bm = bmesh.new()
    rings = [[bm.verts.new((x, y, z)) for x, y in pts] for pts, z in sections]
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return K.mk(name, bm)


def arch_pts(w, h, seg=8):
    """A round-headed opening's outline (XY), sill at y 0."""
    r = w / 2
    pts = [(-r, 0.0), (r, 0.0)]
    for i in range(seg + 1):
        a = math.pi * i / seg
        pts.append((r * math.cos(a), h - r + r * math.sin(a)))
    return pts


def opening(name, w, h, depth, pos, a=0.0):
    """A cutter for a round-headed door or window facing out along angle a
    (0 = +Z): the arch outline extruded through the wall."""
    pts = arch_pts(w, h)
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, -depth / 2)) for x, y in pts]
    hi = [bm.verts.new((x, y, depth / 2)) for x, y in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return K.xf(K.mk(name, bm), pos, (0, a, 0))


def pane(name, w, h, pos, a=0.0):
    """A one-sided, round-headed lit pane facing out along angle a."""
    bm = bmesh.new()
    bm.faces.new([bm.verts.new((x, y, 0.0)) for x, y in arch_pts(w, h, 6)])  # counter-clockwise from the front
    bm.normal_update()
    ob = K.mk(name, bm)
    if ob.data.polygons[0].normal.z < 0:
        ob.data.flip_normals()
    return K.xf(ob, pos, (0, a, 0))


def on_wall(r, a, y, out=0.0):
    """A point on a round or regular wall of radius r at angle a (0 = +Z)."""
    return ((r + out) * math.sin(a), y, (r + out) * math.cos(a))


def railing(r, y0, h, n_posts, n=8, post=0.006, rail=0.005, mid=True):
    """Posts round a regular n-gon of radius r at y0, a top rail and (with
    `mid`) a mid rail."""
    parts = []
    corners = ngon(r, n)
    per_side = n_posts // n
    for i in range(n):
        (x0, z0), (x1, z1) = corners[i], corners[(i + 1) % n]
        for k in range(per_side):
            f = k / per_side
            parts.append(K.box('post', (post, h, post), pos=(x0 + (x1 - x0) * f, y0 + h / 2, z0 + (z1 - z0) * f)))
    for i in range(n):
        (x0, z0), (x1, z1) = corners[i], corners[(i + 1) % n]
        parts.append(beam('rail', (x0, y0 + h, z0), (x1, y0 + h, z1), rail))
        if mid:
            parts.append(beam('rail', (x0, y0 + h * 0.5, z0), (x1, y0 + h * 0.5, z1), rail * 0.7))
    return parts


# ============================================================== the mill


def mill():
    out = []
    # a paved yard in place of the old mound
    yard = K.lathe('yard', K.rounded_profile([(0.0, 0.0), (0.29, 0.0), (0.29, 0.012), (0.0, 0.012)], [0, 0, 0.004, 0]), seg=40)
    out.append((K.join('mill_ground', [yard]), 'deep'))
    # the brick base, an octagon a touch tapered up to the stage, and the
    # thatched smock above it, tapering to the cap
    body = K.loft('base', [(ngon(0.2), 0.012), (ngon(0.186), STAGE_Y)])
    K.union(body, K.loft('smock', [(ngon(0.176), STAGE_Y - 0.002), (ngon(0.118), TOP)]))
    # a round-headed door in the base's front, and a window either side
    K.cut(body, opening('door', 0.056, 0.105, 0.08, (0, 0.012, 0.19)))
    for a in (-math.pi / 4, math.pi / 4):
        x, y, z = on_wall(0.19, a, 0.11)
        K.cut(body, opening('win', 0.03, 0.05, 0.06, (x, y, z), a))
    # the ledge where the smock stands on the base hides behind the stage: a
    # soft round the outline passes over, so it isn't drawn through the deck
    K.soften(body, lambda x, y, z: abs(y - STAGE_Y) < 0.0035, 0.003)
    # every edge rounded, the octagon's corners too: they soften past the 35°
    # outline, so at rest the mill draws its rims the way the blocks do rather
    # than eight corner lines
    K.bevel(body, BEV_M, now=True)
    out.append((K.join('mill_body', [body]), 'glass'))
    # the cap: a boat-shaped hull along the windshaft
    hull = []
    for z, s in ((-0.16, 0.62), (-0.12, 0.86), (-0.04, 1.0), (0.06, 1.0), (0.13, 0.9), (0.165, 0.7)):
        hull.append(([(0.125 * s * math.cos(math.pi * i / 12), 0.105 * s * math.sin(math.pi * i / 12)) for i in range(13)], z))
    cap = loft_z('cap', hull)
    K.xf(cap, (0, TOP - 0.004, 0.012))
    K.bevel(cap, BEV_S, now=True)
    out.append((K.join('mill_cap', [cap]), 'pale'))
    trim = []
    # the stage: an octagonal deck on eight struts, with a railing
    deck_in, deck_out = 0.186, 0.25
    deck = K.loft('deck', [(ngon(deck_out), STAGE_Y), (ngon(deck_out), STAGE_Y + 0.012)])
    K.cut(deck, K.loft('hole', [(ngon(deck_in - 0.004), STAGE_Y - 0.01), (ngon(deck_in - 0.004), STAGE_Y + 0.03)]))
    trim.append(deck)
    for i in range(8):
        a = TAU * i / 8 + math.pi / 8
        trim.append(beam('strut', on_wall(0.193, a, 0.1), on_wall(0.238, a, STAGE_Y), 0.007))
    # a post at each corner and one rail: drawn bar for bar (two posts a side
    # and a mid rail) the railing was a dotted double ring, the busiest line
    # on the layer
    trim += railing(deck_out - 0.006, STAGE_Y + 0.012, 0.042, 8, mid=False)
    # the beard board under the cap's nose
    trim.append(K.rbox('beard', (0.2, 0.032, 0.008), 0.01, pos=(0, TOP + 0.012, 0.176), axis='z', seg=4, bev=0.0015))
    tr = K.join('mill_trim', trim)
    K.finish(tr, 50)
    out.append((tr, 'pale'))
    # the windows: the base's two, set into their openings, and two up the smock
    wins = []
    apo = math.cos(math.pi / 8)  # an octagon's flat, as a fraction of its corner radius
    for a in (-math.pi / 4, math.pi / 4):
        r = (0.2 + (0.186 - 0.2) * (0.11 - 0.012) / (STAGE_Y - 0.012)) * apo
        wins.append(pane('w', 0.026, 0.046, on_wall(r - 0.004, a, 0.11), a))
    for a, y in ((-math.pi / 4, 0.36), (math.pi / 4, 0.47)):
        r = (0.176 + (0.118 - 0.176) * (y - STAGE_Y) / (TOP - STAGE_Y)) * apo
        wins.append(pane('w', 0.022, 0.034, on_wall(r + 0.0015, a, y), a))
    out.append((K.join('mill_windows', wins), 'mark'))
    out += sails()
    return out


def hub_part(back):
    """The windshaft's head, in hub space: the shaft running back into the cap
    (to z = -back) and the square head the two stocks pass through."""
    parts = [K.cyl('shaft', 0.018, back, pos=(0, 0, -back / 2), rot=(math.pi / 2, 0, 0), seg=16)]
    parts.append(K.box('head', (0.042, 0.042, 0.03), pos=(0, 0, -0.004), bev=0.004))
    parts.append(K.cyl('boss', 0.012, 0.012, pos=(0, 0, 0.016), rot=(math.pi / 2, 0, 0), seg=12))
    hub = K.join('hub', parts)
    K.finish(hub, 50)
    return hub


def sails():
    """The sails, at the city's weight: a Dutch sail's frame is a lattice, but
    drawn bar for bar it was the busiest thing on the layer. Here each sail's
    ladder is a bevelled whip, an outer rail and seven rungs (about the
    blocks' floor spacing) with no outline, and its one outline is the cloth
    panel's, a thin plate with rounded corners — so at rest a sail is a faint
    bare ladder, and set it's one quiet shape."""
    r_in, r_out, w = HUB['r_in'], HUB['r_out'], HUB['w']
    arms = []
    for k in range(4):
        parts = [K.loft('whip', [(rect(0.013, 0.011), 0.0), (rect(0.009, 0.008), r_out + 0.008)])]
        K.bevel(parts[-1], 0.002, now=True)
        parts.append(K.box('rail', (0.0055, r_out - r_in - 0.006, 0.0055), pos=(w - 0.003, (r_in + r_out) / 2, 0.003), bev=0.0016))
        for i in range(7):
            y = r_in + 0.012 + (r_out - r_in - 0.024) * i / 6
            parts.append(K.box('rung', (w - 0.004, 0.0055, 0.0045), pos=((w - 0.004) / 2 + 0.002, y, 0.0035), bev=0.0014))
        arm = K.join(f'arm{k}', parts)
        K.xf(arm, rot=(0, 0, k * math.pi / 2))
        arms.append(arm)
    ladders = K.join('mill_sails', arms + [hub_part(HUB['z'] - 0.02)])
    K.finish(ladders, 50)
    # one sail's cloth, just behind its ladder
    pts = K.rrect_pts(w, r_out - r_in, 0.012, 6)
    bm = bmesh.new()
    lo = [bm.verts.new((x + w / 2, y + (r_in + r_out) / 2, -0.006)) for x, y in pts]
    hi = [bm.verts.new((x + w / 2, y + (r_in + r_out) / 2, -0.002)) for x, y in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    cloth = K.mk('mill_cloth', bm)
    K.bevel(cloth, 0.0012, now=True)
    K.finish(cloth, 50)
    return [(ladders, 'pale'), (cloth, 'pale')]


def main():
    K.reset()
    t0 = time.time()
    parts = mill()
    print(f'mill: {len(parts)} meshes, {sum(K.tris(o) for o, _ in parts)} tris (one cloth), {time.time() - t0:.1f}s')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'mill-raw.glb')
    size = K.export(path, [o for o, _ in parts])
    print(f'exported {path} {size / 1024:.0f} KB in {time.time() - t0:.1f}s')
    if '--preview' in sys.argv:
        # the sails as the site sets them: at the hub, tilted, the cloth four times
        import bpy
        shown = []
        for ob, tint in parts:
            if ob.name in ('mill_sails', 'mill_cloth'):
                for k in range(1 if ob.name == 'mill_sails' else 4):
                    d = ob.copy()
                    d.data = ob.data.copy()
                    bpy.context.scene.collection.objects.link(d)
                    d.data.transform(Matrix.Translation((0, HUB['y'], HUB['z'])) @ Matrix.Rotation(-HUB['tilt'], 4, 'X') @ Matrix.Rotation(k * math.pi / 2 + 0.35, 4, 'Z'))
                    shown.append((d, tint))
                ob.hide_render = True
            else:
                shown.append((ob, tint))
        s = K.preview(os.path.join(OUT, 'prev-mill.png'), shown, (0.95, 0.72, 1.55), (0, 0.42, 0), lens=45, res=(900, 1000))
        print(f'preview {s:.1f}s')


if __name__ == '__main__':
    main()
