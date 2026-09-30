# The city's transformer house, built in Blender and exported as one glb of
# named parts for the site (src/scene/maquette/city.tsx). See README.md to
# rebuild.
#
# A Dutch compact substation (the neighbourhood "trafohuisje" that steps the
# grid down for the blocks round it), drawn in the blocks' language: the same
# rounded corners and plinth, an overhanging flat roof, a louvred double door
# on the street side, a vent in each flank, and three ribbed insulators on the
# roof where the tower's power lines come in. Coordinates are house-local (see
# modelkit.py): Y up, the ground at y 0, the footprint centred on the origin,
# the door facing +Z (the camera); city.tsx places the group on its plot.
#   trafo_body    plinth, walls and roof slab, one glass shell (outlined)
#   trafo_doors   the door leaves in their recess (the deep cut, no outline)
#   trafo_trim    louvres, vents, the sign plate and the insulators (pale, no
#                 outline)
#   trafo_power   the insulators' caps and the bolt on the sign: the site's
#                 power glow, faint at rest and bright when the grid is live
# city.tsx keeps a copy of CAP (TRAFO_CAP): the power line lands on the
# middle cap.
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modelkit as K  # noqa: E402  (imports bpy first)
from modelkit import BEV_S  # noqa: E402

import bmesh  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

# The footprint and height the old box had, so the plot, its shadow and the
# power line's landing still fit.
W, D, H = 0.18, 0.14, 0.1
# The plinth: the blocks' podium in miniature, a low step all round.
PLINTH_H, PLINTH_OUT = 0.012, 0.005
# The blocks' corner radius, so it reads as one of them.
CORNER = 0.012
# The roof: a thin slab that overhangs on every side, the trafohuisje's mark.
ROOF_T, ROOF_OUT = 0.01, 0.013
TOP = H + ROOF_T
# The double door, centred on the street side, standing on the plinth.
DOOR_W, DOOR_H, RECESS = 0.072, 0.07, 0.006
SILL = PLINTH_H + 0.0012
# The flank vents, high up, and their slats.
VENT = (0.07, 0.024)
# The insulators: three in a row across the roof, set back from the eaves.
BUSH_X = (-0.05, 0.0, 0.05)
BUSH_Z = -0.028
BUSH_H = 0.032
CAP = dict(y=TOP + BUSH_H + 0.005, z=BUSH_Z, r=0.0068)


def body():
    """Plinth, walls and roof slab as one shell, the door and vents cut in."""
    b = K.rbox('plinth', (W + 2 * PLINTH_OUT, PLINTH_H, D + 2 * PLINTH_OUT), CORNER + PLINTH_OUT, pos=(0, PLINTH_H / 2, 0), axis='y', seg=8)
    wall_h = H - PLINTH_H + 0.004
    walls = K.rbox('walls', (W, wall_h, D), CORNER, pos=(0, PLINTH_H - 0.002 + wall_h / 2, 0), axis='y', seg=8)
    roof = K.rbox('roof', (W + 2 * ROOF_OUT, ROOF_T, D + 2 * ROOF_OUT), CORNER + ROOF_OUT, pos=(0, H + ROOF_T / 2, 0), axis='y', seg=8)
    K.union(b, walls, roof)
    # the door's recess, standing a hair above the plinth's top (which is its
    # threshold): a floor flush with the step leaves the boolean two coplanar
    # faces to choose between, and it nicked the corner
    K.cut(b, K.box('door', (DOOR_W, DOOR_H, 2 * RECESS), pos=(0, SILL + DOOR_H / 2, D / 2)))
    # a vent in each flank, under the eaves
    for s in (-1, 1):
        K.cut(b, K.box('vent', (2 * 0.004, VENT[1], VENT[0]), pos=(s * W / 2, H - 0.026, 0)))
    K.bevel(b, BEV_S, now=True)
    b.name = b.data.name = 'trafo_body'
    K.finish(b, 50)
    return b


def louvre(name, w, n, y0, pitch, z, depth=0.0022, t=0.0024, axis='z'):
    """n slats w long, stepping up from y0; they face +Z (axis 'z') or run
    along Z on a flank (axis 'x', z is then the x position)."""
    out = []
    for i in range(n):
        y = y0 + i * pitch
        # plain boxes: a slat is 2 mm of pale trim with no outline, and a
        # bevel on it would be a thousand triangles nobody can see
        if axis == 'z':
            out.append(K.box(name, (w, t, depth), pos=(0, y, z)))
        else:
            out.append(K.box(name, (depth, t, w), pos=(z, y, 0)))
    return out


def bolt(name, h, pos, depth=0.0009):
    """The high-voltage sign's lightning bolt, h tall, facing +Z."""
    s = h / 1.0
    pts = [(0.12, 0.5), (-0.22, -0.04), (0.02, -0.04), (-0.12, -0.5), (0.24, 0.1), (-0.02, 0.1)]
    bm = bmesh.new()
    lo = [bm.verts.new((x * s, y * s, 0.0)) for x, y in pts]
    hi = [bm.verts.new((x * s, y * s, depth)) for x, y in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return K.xf(K.mk(name, bm), pos)


def triangle(name, side, pos, depth=0.0012):
    """A warning sign's plate: an equilateral triangle, point up, rounded off
    by the kit bevel, facing +Z."""
    h = side * math.sqrt(3) / 2
    pts = [(-side / 2, -h / 3), (side / 2, -h / 3), (0.0, 2 * h / 3)]
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, 0.0)) for x, y in pts]
    hi = [bm.verts.new((x, y, depth)) for x, y in pts]
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = K.xf(K.mk(name, bm), pos)
    K.bevel(ob, 0.0006, now=True)
    return ob


def insulator(x):
    """A porcelain bushing standing on the roof: a collar, then three sheds
    tapering up the stem, ribbed the way the real ones are."""
    prof = [(0.0, 0.0), (0.0095, 0.0), (0.0095, 0.004), (0.0048, 0.0055)]
    y = 0.0055
    for r in (0.0105, 0.0092, 0.008):
        prof += [(r, y + 0.003), (r, y + 0.0048), (0.0045, y + 0.0078)]
        y += 0.0078
    prof += [(0.0042, BUSH_H - 0.001), (0.0, BUSH_H)]
    return K.lathe('bushing', prof, seg=14, pos=(x, TOP - 0.001, BUSH_Z))


def rim(name, w, d, r, t, y0, h, seg=8):
    """An upstand t thick round a rounded rectangle whose OUTER outline is w by
    d (radius r), standing on y0, h tall."""
    outer = K.rrect_pts(w, d, r, seg)
    inner = K.rrect_pts(w - 2 * t, d - 2 * t, max(0.001, r - t), seg)
    bm = bmesh.new()
    lo_o = [bm.verts.new((x, y0, z)) for x, z in outer]
    hi_o = [bm.verts.new((x, y0 + h, z)) for x, z in outer]
    lo_i = [bm.verts.new((x, y0, z)) for x, z in inner]
    hi_i = [bm.verts.new((x, y0 + h, z)) for x, z in inner]
    n = len(outer)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo_o[i], lo_o[j], hi_o[j], hi_o[i]))
        bm.faces.new((hi_o[i], hi_o[j], hi_i[j], hi_i[i]))
        bm.faces.new((lo_i[j], lo_i[i], hi_i[i], hi_i[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = K.mk(name, bm)
    K.bevel(ob, 0.001, now=True)
    return ob


def house():
    parts = [(body(), 'glass')]
    # the door: two leaves set back in the recess, a hair apart
    back = D / 2 - RECESS
    leaf_w = DOOR_W / 2 - 0.0035
    leaf_h = DOOR_H - 0.004
    doors = []
    for s in (-1, 1):
        doors.append(K.box('leaf', (leaf_w, leaf_h, 0.002), pos=(s * (leaf_w / 2 + 0.0008), SILL + leaf_h / 2 + 0.001, back + 0.0012), bev=0.0006))
    dr = K.join('trafo_doors', doors)
    K.finish(dr, 50)
    parts.append((dr, 'deep'))
    trim = []
    # louvres low and high on each leaf, where a substation breathes
    for s in (-1, 1):
        cx = s * (leaf_w / 2 + 0.0008)
        for y0 in (SILL + 0.009, SILL + DOOR_H - 0.022):
            for sl in louvre('slat', leaf_w - 0.009, 4, y0, 0.0042, back + 0.0028):
                K.xf(sl, (cx, 0, 0))
                trim.append(sl)
    # the flank vents' slats, set in their recesses
    for s in (-1, 1):
        trim += louvre('vslat', VENT[0] - 0.006, 4, H - 0.026 - VENT[1] / 2 + 0.0045, 0.0048, s * (W / 2 - 0.0026), axis='x')
    # the high-voltage sign on the right leaf: the plate is trim, the bolt glows
    sign = (leaf_w / 2 + 0.0008, SILL + DOOR_H * 0.52, back + 0.0034)
    trim.append(triangle('sign', 0.017, sign))
    # the roof's edge trim, a low upstand just in from the eaves: the hero
    # looks down on this roof, and a bare slab reads as a lid
    trim.append(rim('rim', W + 2 * ROOF_OUT - 0.008, D + 2 * ROOF_OUT - 0.008, CORNER + ROOF_OUT - 0.004, 0.003, TOP - 0.0005, 0.0032))
    # the insulators on the roof
    trim += [insulator(x) for x in BUSH_X]
    tr = K.join('trafo_trim', trim)
    K.finish(tr, 50)
    parts.append((tr, 'pale'))
    power = [K.sphere('cap', CAP['r'], pos=(x, CAP['y'], CAP['z']), seg=12, rings=8, scale=(1, 0.8, 1)) for x in BUSH_X]
    power.append(bolt('bolt', 0.0105, (sign[0], sign[1] - 0.0012, sign[2] + 0.0012)))
    pw = K.join('trafo_power', power)
    K.finish(pw, 50)
    parts.append((pw, 'mark'))
    return parts


def main():
    K.reset()
    t0 = time.time()
    parts = house()
    print(f'trafo: {len(parts)} meshes, {sum(K.tris(o) for o, _ in parts)} tris, {time.time() - t0:.1f}s')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'trafo-raw.glb')
    size = K.export(path, [o for o, _ in parts])
    print(f'exported {path} {size / 1024:.0f} KB in {time.time() - t0:.1f}s')
    if '--preview' in sys.argv:
        # on its plot, between the blocks and in front of the tower
        import build_blocks
        import build_tower
        for ob, _ in parts:
            ob.location = (0, 0, 0.55)  # in the preview rig's (three) space
        near = []
        for i, b in enumerate(build_blocks.BLOCKS):
            if abs(b['z'] - 0.55) < 0.2 or abs(b['x']) < 0.2:
                for ob, tint in build_blocks.block(i, b):
                    ob.location = (b['x'], 0, b['z'])
                    near.append((ob, tint))
        s = K.preview(os.path.join(OUT, 'prev-trafo.png'), parts + near + build_tower.tower(), (0.55, 0.42, 1.35), (0, 0.08, 0.5), lens=55, res=(1100, 750))
        print(f'preview {s:.1f}s')


if __name__ == '__main__':
    main()
