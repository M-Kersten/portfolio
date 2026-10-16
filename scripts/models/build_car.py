# The Lightship Drive cars on the Room's AR table, after the game's own: a low,
# chunky wedge with a dark glass cabin, a neon stripe round its beltline, fat
# tyres with glowing rims, and the flat crown that floats over the leader.
# Exported as one glb of named parts for the site (src/scene/maquette/room.tsx,
# RaceCar and LeaderCrown, which colour them). See README.md to rebuild.
#
# Coordinates are the car's own (see modelkit.py): Y up, the wheels standing on
# the table at y 0, the nose pointing +Z (its heading on the loop).
#   car_body    the body: a wedge with a sloped hood and the wheel arches cut in
#   car_cabin   the cabin on top, glass all round
#   car_stripe  the beltline band, standing just proud of the body (the site
#               colours it with a gradient, nose to tail)
#   car_tyres   the four tyres
#   car_rims    their rim faces, on the outside of each wheel (the site lights them)
#   crown       the leader's crown, a flat cut-out standing on y 0, facing +Z
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modelkit as K  # noqa: E402  (imports bpy first)
import bmesh  # noqa: E402  (registered once bpy has loaded)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

# the body's side profile, as (z, y): tail at -Z, nose at +Z
BOTTOM = 0.0075
DECK = 0.0212  # the flat top behind the hood, where the cabin sits
BELT = 0.0192  # the sides stand straight up to here, then lean in to the deck
NOSE_Z, TAIL_Z = 0.030, -0.028
CHIN, NOSE_TOP = 0.0105, 0.0148  # the nose's front face, low and short
HOOD_Z = 0.011  # where the hood's slope meets the deck
HW, HW_TOP = 0.0148, 0.0126  # half-width at the sides, and across the deck

# wheels
WR, WW = 0.008, 0.0076  # tyre radius, width
AXLE_Z = 0.0185  # front at +AXLE_Z, rear at -AXLE_Z
TRACK = 0.0172  # wheel centre off the axis
ARCH_R = 0.0089

# the stripe's band, below the beltline where the sides are upright
STRIPE_LO, STRIPE_HI = 0.0170, 0.0189
PROUD = 0.0003

B = 0.0007  # the car's bevel


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


def hood_z(y):
    """Where the hood's slope is at height y."""
    return NOSE_Z - (y - NOSE_TOP) / (DECK - NOSE_TOP) * (NOSE_Z - HOOD_Z)


def side(pts_zy, hw):
    return [(s * hw, y, z) for z, y in pts_zy for s in (1, -1)]


def body():
    pts = side([(TAIL_Z, BOTTOM), (NOSE_Z - 0.003, BOTTOM), (NOSE_Z, CHIN), (NOSE_Z, NOSE_TOP), (hood_z(BELT), BELT), (TAIL_Z, BELT)], HW)
    pts += side([(HOOD_Z, DECK), (TAIL_Z + 0.0005, DECK)], HW_TOP)
    ob = hull('car_body', pts)
    # the arches: a cylinder into each side over each wheel, stopping short of
    # the middle so the body stays whole between them
    cutters = []
    for z in (AXLE_Z, -AXLE_Z):
        for s in (1, -1):
            cutters.append(K.cyl('arch', ARCH_R, 0.02, pos=(s * 0.019, WR, z), rot=(0, 0, math.pi / 2), seg=40))
    K.cut(ob, *cutters)
    K.bevel(ob, B, now=True)
    return K.finish(ob, 50)


def cabin():
    lo = DECK - 0.0005  # seated into the deck
    pts = side([(-0.0165, lo), (0.0095, lo)], 0.0116)
    pts += side([(-0.0125, 0.0292), (0.0015, 0.0292)], 0.0092)
    ob = hull('car_cabin', pts)
    K.bevel(ob, B, now=True)
    return K.finish(ob, 50)


def stripe():
    w = HW + PROUD
    pts = side([(TAIL_Z - PROUD, STRIPE_LO), (hood_z(STRIPE_LO) + PROUD, STRIPE_LO), (hood_z(STRIPE_HI) + PROUD, STRIPE_HI), (TAIL_Z - PROUD, STRIPE_HI)], w)
    ob = hull('car_stripe', pts)
    # the arches cut it too, so it runs over each wheel rather than across it
    cutters = []
    for z in (AXLE_Z, -AXLE_Z):
        for s in (1, -1):
            cutters.append(K.cyl('arch', ARCH_R + PROUD, 0.02, pos=(s * 0.019, WR, z), rot=(0, 0, math.pi / 2), seg=40))
    K.cut(ob, *cutters)
    return K.finish(ob, 50)


def wheels():
    tyres, rims = [], []
    # a fat tyre: a rounded tread and sidewalls, turned about X
    r_in = WR * 0.66
    prof = K.rounded_profile([(r_in, -WW / 2), (WR, -WW / 2), (WR, WW / 2), (r_in, WW / 2)], [0, 0.0022, 0.0022, 0])
    for z in (AXLE_Z, -AXLE_Z):
        for s in (1, -1):
            t = K.lathe('tyre', prof, seg=40, closed=True)
            K.xf(t, (s * TRACK, WR, z), (0, 0, math.pi / 2))
            tyres.append(t)
            # the rim face: a dished disc filling the tyre's bore on the outside
            rim = K.lathe('rim', [(0.0, 0.0002), (r_in * 0.5, 0.0007), (r_in * 0.96, 0.0002), (r_in, -0.0012), (0.0, -0.0012)], seg=40, closed=True)
            K.xf(rim, (s * (TRACK + WW / 2 - 0.0006), WR, z), (0, 0, -s * math.pi / 2))
            rims.append(rim)
    t = K.join('car_tyres', tyres)
    K.finish(t, 50)
    r = K.join('car_rims', rims)
    K.finish(r, 50)
    return t, r


def crown():
    w, base, tip, mid, dip = 0.011, 0.006, 0.016, 0.018, 0.009
    pts = [(-w, 0), (w, 0), (w, base), (w + 0.002, tip), (w * 0.5, dip), (0, mid), (-w * 0.5, dip), (-w - 0.002, tip), (-w, base)]
    ob = K.prism_ax('crown', pts, -0.002, 0.002, axis='z')
    K.bevel(ob, 0.0008, now=True)
    return K.finish(ob, 50)


def main():
    K.reset()
    t0 = time.time()
    tyres, rims = wheels()
    parts = [(body(), 'pale'), (cabin(), 'deep'), (stripe(), 'mark'), (tyres, 'deep'), (rims, 'metal'), (crown(), 'mark')]
    for ob, _ in parts:
        print(f'  {ob.name:12s} {K.tris(ob):6d} tris')
    print(f'car: {len(parts)} meshes, {sum(K.tris(o) for o, _ in parts)} tris, {time.time() - t0:.1f}s')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'car-raw.glb')
    size = K.export(path, [o for o, _ in parts])
    print(f'exported {path} {size / 1024:.0f} KB')
    if '--preview' in sys.argv:
        # the crown stands off to one side for the render
        crown_ob = parts[-1][0]
        crown_ob.data.transform(K.Matrix.Translation((0.04, 0.0, 0.0)))
        s = K.preview(os.path.join(OUT, 'prev-car.png'), parts, (0.09, 0.06, 0.11), (0.01, 0.012, 0), lens=60)
        print(f'preview {s:.1f}s')


if __name__ == '__main__':
    main()
