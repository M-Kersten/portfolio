# The Lightship Drive table in the Room, after the show-floor setup in the
# project's film: a low mid-century coffee table the game is played across,
# and the light-blue faceted kicker set out on its mat (twice) for the cars to
# jump off. Exported as one glb of named parts for the site
# (src/scene/maquette/room.tsx, CoffeeTableAR, which lays out the mat, the
# course and the kickers). See README.md to rebuild.
#
# Coordinates are each part's own (see modelkit.py): Y up, +Z to the room.
#   tbl_frame  the table: a rounded top with an eased edge, an apron under it,
#              and four tapered legs splayed out to the floor; the top's
#              surface at y TOP, its centre on the origin
#   ramp       a kicker, standing on y 0 and centred on the origin, rising
#              toward +Z (the way the cars drive over it); faceted, flat-shaded
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modelkit as K  # noqa: E402  (imports bpy first)
import bmesh  # noqa: E402  (registered once bpy has loaded)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

TOP = 0.19  # the table top's surface (the mat lies on it, the cars on that)
W, D, R = 0.74, 0.42, 0.065  # the top: width (x), depth (z), corner radius
T = 0.026  # its thickness
APRON_IN, APRON_H, APRON_T = 0.045, 0.032, 0.012  # the apron: inset from the edge, height, thickness
LEG_AT = (0.29, 0.14)  # where the legs meet the apron's corners
LEG_SPLAY = 0.12  # radians out from the vertical, each way
LEG_R = (0.0085, 0.0135)  # foot, top

# the kicker: length along the drive, width, height at its lip. Wide enough
# for both lanes, so the two cars take off from it side by side.
RAMP_L, RAMP_W, RAMP_H = 0.08, 0.092, 0.03


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


def top():
    ob = K.prism('top', K.rrect_pts(W, D, R, 10), T, y0=TOP - T)
    # an eased edge all round, top and bottom: soft enough to catch the light
    # as a band rather than a hard cut line
    K.soften(ob, lambda x, y, z: True, 0.007, seg=4)
    return ob


def apron():
    ob = K.prism('apron', K.rrect_pts(W - 2 * APRON_IN, D - 2 * APRON_IN, R * 0.6, 8), APRON_H, y0=TOP - T - APRON_H + 0.002)
    inner = K.prism('inner', K.rrect_pts(W - 2 * APRON_IN - 2 * APRON_T, D - 2 * APRON_IN - 2 * APRON_T, R * 0.45, 8), APRON_H + 0.02, y0=TOP - T - APRON_H - 0.008)
    K.cut(ob, inner)
    K.bevel(ob, 0.002, now=True)
    return ob


def legs():
    out = []
    y_top = TOP - T - APRON_H + 0.01
    for sx in (1, -1):
        for sz in (1, -1):
            # long enough to reach the floor once splayed
            L = y_top / (math.cos(LEG_SPLAY) * math.cos(LEG_SPLAY * 0.7))
            leg = K.cyl('leg', LEG_R[0], L, pos=(0, -L / 2, 0), seg=18, r2=LEG_R[1])
            K.xf(leg, rot=(-sz * LEG_SPLAY * 0.7, 0, sx * LEG_SPLAY))
            K.xf(leg, pos=(sx * LEG_AT[0], y_top, sz * LEG_AT[1]))
            K.bevel(leg, 0.0012, now=True)
            out.append(leg)
    return out


def frame():
    ob = K.join('tbl_frame', [top(), apron()] + legs())
    # whatever the splay left below the floor goes
    K.cut(ob, K.box('floor', (2, 0.2, 2), pos=(0, -0.1, 0)))
    return K.finish(ob, 50)


def ramp():
    l, w, h = RAMP_L / 2, RAMP_W / 2, RAMP_H
    pts = [
        # its footprint
        (-w, 0, -l), (w, 0, -l), (-w, 0, l), (w, 0, l),
        # the lip at the back, narrower than the base: the sides lean in
        (-w * 0.9, h, l - 0.004), (w * 0.9, h, l - 0.004),
        # a facet across the face, so the climb reads as cut rather than drawn
        # (above the straight line from toe to lip, or the hull would drop it)
        (-w * 0.95, h * 0.64, 0.004), (w * 0.95, h * 0.64, 0.004),
        # the toe, just off the mat so a car meets an edge, not a knife
        (-w * 0.97, 0.0016, -l), (w * 0.97, 0.0016, -l),
    ]
    ob = hull('ramp', pts)
    return K.finish(ob, 12)  # flat-shaded: every facet catches the light on its own


def main():
    K.reset()
    t0 = time.time()
    parts = [(frame(), 'pale'), (ramp(), 'glass')]
    for ob, _ in parts:
        print(f'  {ob.name:10s} {K.tris(ob):6d} tris')
    print(f'table: {len(parts)} meshes, {sum(K.tris(o) for o, _ in parts)} tris, {time.time() - t0:.1f}s')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'table-raw.glb')
    size = K.export(path, [o for o, _ in parts])
    print(f'exported {path} {size / 1024:.0f} KB')
    if '--preview' in sys.argv:
        # the kicker stands on the table for the render
        parts[1][0].data.transform(K.Matrix.Translation((-0.12, TOP, 0.04)))
        s = K.preview(os.path.join(OUT, 'prev-table.png'), parts, (0.75, 0.62, 0.95), (0, 0.12, 0), lens=55)
        print(f'preview {s:.1f}s')


if __name__ == '__main__':
    main()
