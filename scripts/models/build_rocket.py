# The launch vehicle on the city's pad: a Starship stack, built in Blender and
# exported as one glb of named parts for the site (src/scene/maquette/rocket.tsx,
# which the pad in city.tsx and the asteroids game both draw). See README.md to
# rebuild.
#
# Coordinates are the rocket's own (see modelkit.py): Y up, the stack standing
# on its axis at x = z = 0, the booster's skirt resting at y 0.09 (the launch
# mount's top). The windward side, where the ship carries its heat shield, faces
# +Z; the flaps and chines sit on ±X.
#   sh_engines    Super Heavy's 33 engines, three rings of bells in its skirt
#   sh_body       the booster's hull, its two chines and the raceway
#   sh_fins       the four grid fins under the top
#   sh_ring       the hot-staging ring: a vented band on the booster's top
#   sh_ring_core  what you see through its vents
#   ss_body       Starship's hull and nose, its steel (leeward) half
#   ss_tiles      the other half: the heat shield
#   ss_flaps      the two forward flaps, the two aft flaps and the chines: their
#                 steel (leeward) faces
#   ss_flaps_tiles  …and their windward faces, tiled like the heat shield
#   ss_engines    the ship's six engines: three sea-level, three vacuum bells
# The pad stacks them in that order, a few at a time (city.tsx BUILD), and the
# launch separates the sh_ parts from the ss_ parts at staging.
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modelkit as K  # noqa: E402  (imports bpy first)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
TAU = math.tau

R = 0.03  # hull radius (the stack is ~12 diameters tall; the real one ~13.7)
WALL = 0.0022  # skirt wall, so the engines sit up inside it
Y0 = 0.09  # the booster's skirt, on the mount
BOOST_TOP = 0.49
RING_TOP = 0.505  # the hot-staging ring: BOOST_TOP → RING_TOP
SHIP_BASE = RING_TOP
NOSE = 0.70  # where the ship's barrel starts to taper
TIP = 0.795
SEG = 64  # round enough that the hull never draws a facet line
B = 0.0012  # the rocket's bevel


def nose_r(y):
    """The nose's radius at height y: an ogive that leaves the barrel without a
    kink and closes on a blunt, rounded tip rather than a point."""
    L = TIP - NOSE
    u = min(max((y - NOSE) / L, 0.0), 1.0)
    return R * max(0.0, 1.0 - u ** 2.3) ** 0.72


def hull_r(y):
    return R if y <= NOSE else nose_r(y)


def bell(name, r_top, r_rim, y_top, y_rim, x=0.0, z=0.0, seg=10):
    """A hollow engine bell hanging from y_top (its throat) to y_rim (its exit)."""
    t = 0.0005
    prof = [
        (0.0, y_top + 0.0008),
        (r_top, y_top + 0.0008),
        (r_top, y_top),
        (r_top + (r_rim - r_top) * 0.45, y_top - (y_top - y_rim) * 0.55),
        (r_rim, y_rim),
        (r_rim - t, y_rim),
        (r_top + (r_rim - r_top) * 0.45 - t, y_top - (y_top - y_rim) * 0.55),
        (max(0.0003, r_top - t), y_top - 0.0005),
        (0.0, y_top - 0.0005),
    ]
    return K.lathe(name, prof, seg=seg, pos=(x, 0, z))


def ring_of(n, r, phase=0.0):
    return [(r * math.sin(TAU * i / n + phase), r * math.cos(TAU * i / n + phase)) for i in range(n)]


def wedge(name, side, y0, y1, out, base, ramp):
    """A chine: a thin triangular strake standing off the hull on side ±1 (±X),
    tapering in at both ends."""
    secs = []
    for y, k in ((y0, 0.15), (y0 + ramp, 1.0), (y1 - ramp, 1.0), (y1, 0.15)):
        r = hull_r(y) - 0.0004
        o = out * k
        b = base * (0.5 + 0.5 * k)
        # triangle in XZ: two base corners on the hull, the ridge out on ±X
        pts = [(side * r, -b / 2), (side * (r + o), 0.0), (side * r, b / 2)]
        if side < 0:
            pts = list(reversed(pts))
        secs.append((pts, y))
    return K.loft(name, secs)


def flap(name, side, y0, y1, out0, out1, thick):
    """A flap on side ±1 (±X): a trapezoid standing off the hull, its inner edge
    following the hull's taper, `out0` long at the root's base and `out1` at
    its top, `thick` through."""
    r0 = hull_r(y0) - 0.0006
    r1 = hull_r(y1) - 0.0006
    pts = [(r0, y0), (r0 + out0, y0 + (y1 - y0) * 0.08), (r1 + out1, y1 - (y1 - y0) * 0.1), (r1, y1)]
    pts = K.rounded_profile(pts + [pts[0]], [0, 0.0015, 0.0015, 0, 0])[:-1]
    # outline in the XY plane (x out from the axis, y up), extruded through Z
    ob = K.prism_ax(name, [(side * x, y) for x, y in pts] if side > 0 else [(side * x, y) for x, y in reversed(pts)], -thick / 2, thick / 2, axis='z')
    K.bevel(ob, 0.0007, now=True)
    return ob


def booster():
    out = []
    # 33 engines in the skirt: 3 in the middle, a ring of 10, a ring of 20
    bells = []
    y_top, y_rim = Y0 + 0.0075, Y0 + 0.0006
    for n, r, ph in ((3, 0.0055, 0.0), (10, 0.0152, 0.1), (20, 0.0236, 0.0)):
        for x, z in ring_of(n, r, ph):
            bells.append(bell('b', 0.0012, 0.0033, y_top, y_rim, x, z))
    eng = K.join('sh_engines', bells)
    K.finish(eng, 60)
    out.append((eng, 'deep'))

    # the hull: a skirt round the engines, a straight barrel, a flat top
    prof = [(0.0, y_top + 0.0008), (R - WALL, y_top + 0.0008), (R - WALL, Y0), (R, Y0), (R, BOOST_TOP), (0.0, BOOST_TOP)]
    hull = K.lathe('sh_hull', K.rounded_profile(prof, [0, 0.0006, 0.0006, B, B, 0]), seg=SEG)
    # two chines low on ±X, and the raceway up the side facing the camera
    chines = [wedge('ch', s, Y0 + 0.018, 0.27, 0.0048, 0.007, 0.03) for s in (1, -1)]
    a = math.radians(-28)  # from +Z toward -X: clear of the chines, in view
    race = K.rbox('race', (0.0042, BOOST_TOP - Y0 - 0.03, 0.0032), 0.0012, pos=(R * math.sin(a), (Y0 + BOOST_TOP) / 2 + 0.008, R * math.cos(a)), rot=(0, a, 0), axis='y', seg=3)
    body = K.join('sh_body', [hull, *chines, race])
    K.finish(body, 50)
    out.append((body, 'metal'))

    # four grid fins under the top, sticking straight out: lattices whose
    # cells the air runs through along the stack
    fins = []
    for k in range(4):
        a = TAU * (k + 0.5) / 4
        span, width, thick = 0.026, 0.03, 0.006
        f = K.box('fin', (width, thick, span), pos=(0, 0, 0), bev=0.0005)
        K.bake(f)
        holes = []
        for i in range(3):
            for j in range(3):
                hx = -width / 2 + width * (i + 0.5) / 3
                hz = -span / 2 + span * (j + 0.5) / 3 + 0.0005
                holes.append(K.box('h', (width / 3 - 0.0022, thick * 3, span / 3 - 0.0022), pos=(hx, 0, hz)))
        K.cut(f, *holes)
        root = K.box('root', (0.006, thick * 1.6, 0.006), pos=(0, 0, -span / 2 - 0.002), bev=0.0006)
        fin = K.join('fin', [f, root])
        K.xf(fin, pos=(0, 0, R + span / 2 + 0.0025))
        K.xf(fin, rot=(0, a, 0))
        K.xf(fin, pos=(0, BOOST_TOP - 0.022, 0))
        fins.append(fin)
    fin_ob = K.join('sh_fins', fins)
    K.finish(fin_ob, 50)
    out.append((fin_ob, 'metal'))

    # the hot-staging ring: a band of vents the ship's engines light through
    tube = K.lathe('ring', K.rounded_profile([(R * 0.9, BOOST_TOP), (R * 0.985, BOOST_TOP), (R * 0.985, RING_TOP), (R * 0.9, RING_TOP)], [0, 0.0006, 0.0006, 0]), seg=SEG, closed=True)
    vents = []
    for x, z in ring_of(18, R * 0.95, TAU / 36):
        a = math.atan2(x, z)
        vents.append(K.box('v', (0.0042, (RING_TOP - BOOST_TOP) * 0.62, 0.012), pos=(x, (BOOST_TOP + RING_TOP) / 2, z), rot=(0, a, 0)))
    K.cut(tube, *vents)
    K.finish(tube, 50)
    tube.name = tube.data.name = 'sh_ring'
    out.append((tube, 'metal'))
    core = K.cyl('sh_ring_core', R * 0.88, RING_TOP - BOOST_TOP - 0.001, pos=(0, (BOOST_TOP + RING_TOP) / 2, 0), seg=32)
    K.finish(core, 60)
    out.append((core, 'deep'))
    return out


def ship():
    out = []
    # six engines: three sea-level bells in the middle, three big vacuum bells
    y_top, y_rim = SHIP_BASE + 0.0075, SHIP_BASE + 0.0006
    bells = [bell('b', 0.0012, 0.0034, y_top, y_rim, x, z) for x, z in ring_of(3, 0.0062, 0.0)]
    bells += [bell('b', 0.002, 0.0072, y_top, y_rim, x, z, seg=16) for x, z in ring_of(3, 0.0185, math.pi / 3)]
    eng = K.join('ss_engines', bells)
    K.finish(eng, 60)
    out.append((eng, 'deep'))

    # the hull: skirt, barrel and the ogive nose (sampled closer near the tip,
    # where it turns fastest)
    prof = [(0.0, y_top + 0.0008), (R - WALL, y_top + 0.0008), (R - WALL, SHIP_BASE), (R, SHIP_BASE), (R, NOSE)]
    n = 28
    for i in range(1, n):
        t = 1 - (1 - i / n) ** 1.6
        y = NOSE + (TIP - NOSE) * t
        prof.append((nose_r(y), y))
    prof.append((0.0, TIP))
    radii = [0, 0.0006, 0.0006, B] + [0] * (len(prof) - 4)
    hull = K.lathe('ss_hull', K.rounded_profile(prof, radii), seg=SEG)
    K.finish(hull, 50)
    # the heat shield covers the windward (+Z) half, skirt to nose
    steel, tiles = K.split(hull, 'ss_body', 'ss_tiles', lambda c: not (c.z > 0 and c.y > SHIP_BASE + 0.0015))
    out.append((steel, 'metal'))
    out.append((tiles, 'deep'))

    # flaps on ±X: small forward ones where the nose starts to turn in, big
    # aft ones on the skirt; a chine along the hull joins each pair
    parts = []
    for s in (1, -1):
        parts.append(flap('ff', s, NOSE + 0.008, NOSE + 0.044, 0.016, 0.011, 0.0026))
        parts.append(flap('af', s, SHIP_BASE + 0.002, SHIP_BASE + 0.058, 0.024, 0.017, 0.0032))
        parts.append(wedge('ch', s, SHIP_BASE + 0.05, NOSE + 0.012, 0.0028, 0.005, 0.012))
    flaps = K.join('ss_flaps_all', parts)
    K.finish(flaps, 50)
    # tiled on their windward faces like the hull behind them, steel on the lee
    steel, tiles = K.split(flaps, 'ss_flaps', 'ss_flaps_tiles', lambda c: c.z <= 0)
    out.append((steel, 'metal'))
    out.append((tiles, 'deep'))
    return out


def main():
    K.reset()
    t0 = time.time()
    parts = booster() + ship()
    for ob, _ in parts:
        print(f'  {ob.name:14s} {K.tris(ob):6d} tris')
    print(f'rocket: {len(parts)} meshes, {sum(K.tris(o) for o, _ in parts)} tris, {time.time() - t0:.1f}s')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'rocket-raw.glb')
    size = K.export(path, [o for o, _ in parts])
    print(f'exported {path} {size / 1024:.0f} KB in {time.time() - t0:.1f}s')
    if '--preview' in sys.argv:
        cam = (0.55, 0.62, 0.95)
        for arg in sys.argv:
            if arg.startswith('--cam='):
                cam = tuple(float(v) for v in arg[6:].split(','))
        target = (0, 0.44, 0)
        for arg in sys.argv:
            if arg.startswith('--target='):
                target = tuple(float(v) for v in arg[9:].split(','))
        lens = 50
        for arg in sys.argv:
            if arg.startswith('--lens='):
                lens = float(arg[7:])
        s = K.preview(os.path.join(OUT, 'prev-rocket.png'), parts, cam, target, lens=lens, res=(700, 1000))
        print(f'preview {s:.1f}s')


if __name__ == '__main__':
    main()
