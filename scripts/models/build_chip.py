# The chip layer's models, built in Blender and exported as one glb of named
# parts for the site (src/scene/maquette/chip.tsx). See README.md to rebuild.
#
# Coordinates are the site's (see modelkit.py): chip-local, Y up, the board's
# top face at y = 0.02. Each part is authored around the origin its JSX group
# already uses, so it drops onto the existing slot unchanged:
#   board_*  the PCB and its silkscreen ...... ChipRig origin (board centre)
#   pkg_*    the accelerator package ......... ChipRig origin
#   hrt_*    the heart's projector chip ...... HeartHologram group (its slot centre)
#   hs_*     QFN, heatsink and fan ........... its slot centre
#   cap_*    radial electrolytic ............. its slot centre (placed twice)
#   hdr_*    shrouded box header ............. its slot centre
#   ic_*     the small QFN ................... its slot centre
# The site looks each part up by name and gives it its material; a name says
# what the piece is, never how it's drawn.
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modelkit as K  # noqa: E402  (imports bpy first)
from modelkit import BEV_M, BEV_S, TAU  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
Y0 = 0.02  # the board's top face


# ============================================================== board


def board():
    b = K.rbox('board', (2.05, 0.02, 2.05), 0.045, pos=(0, 0.01, 0), seg=8)
    holes = [K.cyl(f'h{i}', 0.03, 0.06, pos=(sx * 0.935, 0.01, sz * 0.935), seg=28) for i, (sx, sz) in enumerate(((1, 1), (-1, 1), (1, -1), (-1, -1)))]
    K.cut(b, *holes)
    K.bevel(b, 0.004, now=True)
    rings = []
    for i, (sx, sz) in enumerate(((1, 1), (-1, 1), (1, -1), (-1, -1))):
        ring = K.lathe(f'ring{i}', K.rounded_profile([(0.031, Y0 - 0.0005), (0.05, Y0 - 0.0005), (0.05, Y0 + 0.0025), (0.031, Y0 + 0.0025)], [0, 0.0012, 0.0012, 0]), seg=28, pos=(sx * 0.935, 0, sz * 0.935), closed=True)
        rings.append(ring)
    r = K.join('board_rings', rings)
    K.finish(r, 35)
    return [(b, 'deep'), (r, 'pale')]


MK_MARK = 'M899.87 0H757.06L533.58 258.97V0H531.29H424.07H380.35L265.63 188.7L151.69 0H0V517.98H107.28V137.63L202.01 292.28L244.19 359.63H287.85L329.28 292.28L424.01 137.63V517.98H424.07H531.29H533.58V260.48L603.89 343.34L755.58 517.98H898.39L676.39 260.48L899.87 0Z'
MK_APERTURE = 'M1016.33 245.03C985.412 245.03 960.362 219.97 960.362 189.06C960.362 168.18 972.292 150.68 989.242 141.06C975.812 136.18 961.522 133.08 946.412 133.08C876.882 133.08 820.512 189.45 820.512 258.98C820.512 328.51 876.882 384.88 946.412 384.88C1015.94 384.88 1072.31 328.51 1072.31 258.98C1072.31 243.87 1069.21 229.57 1064.33 216.14C1054.71 233.08 1037.22 245.02 1016.34 245.02L1016.33 245.03Z'


def svg_poly(d, steps=8):
    """The absolute M/H/V/L/C/Z subset the logo uses, as one polygon."""
    import re
    toks = re.findall(r'[MHVLCZ]|-?\d*\.?\d+', d)
    pts, i, cmd, cur = [], 0, None, (0.0, 0.0)
    while i < len(toks):
        t = toks[i]
        if t in 'MHVLCZ':
            cmd = t
            i += 1
            if cmd == 'Z':
                continue
        if cmd == 'M' or cmd == 'L':
            cur = (float(toks[i]), float(toks[i + 1]))
            pts.append(cur)
            i += 2
        elif cmd == 'H':
            cur = (float(toks[i]), cur[1])
            pts.append(cur)
            i += 1
        elif cmd == 'V':
            cur = (cur[0], float(toks[i]))
            pts.append(cur)
            i += 1
        elif cmd == 'C':
            c1 = (float(toks[i]), float(toks[i + 1]))
            c2 = (float(toks[i + 2]), float(toks[i + 3]))
            p = (float(toks[i + 4]), float(toks[i + 5]))
            for k in range(1, steps + 1):
                u = k / steps
                a, b, c, e = (1 - u) ** 3, 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u * u, u ** 3
                pts.append((a * cur[0] + b * c1[0] + c * c2[0] + e * p[0], a * cur[1] + b * c1[1] + c * c2[1] + e * p[1]))
            cur = p
            i += 6
        else:
            i += 1
    out = []
    for p in pts:  # drop repeats (H then H at the same x, the closing point)
        if not out or math.dist(p, out[-1]) > 1e-3:
            out.append(p)
    if math.dist(out[0], out[-1]) < 1e-3:
        out.pop()
    return out


def silk():
    """The MK mark, printed on the board in silkscreen by the front edge — the
    maker's mark every real board carries somewhere."""
    import bmesh
    W = 0.2  # printed width
    cx, cz = -0.37, 0.915
    s = W / 1073.0
    from mathutils.geometry import tessellate_polygon
    bm = bmesh.new()
    for d in (MK_MARK, MK_APERTURE):
        poly = svg_poly(d)
        vs = [bm.verts.new((cx + (x - 1073 / 2) * s, Y0 + 0.0006, cz + (y - 518 / 2) * s)) for x, y in poly]
        # scanfill, not ear-clipping: the K's notch nearly pinches the outline
        for tri in tessellate_polygon([[(x, y, 0.0) for x, y in poly]]):
            f = bm.faces.new([vs[i] for i in tri])
            f.normal_update()
            if f.normal.y < 0:
                f.normal_flip()
    return [(K.mk('board_silk', bm), 'pale')]


# ============================================================== package


def package():
    """An AI accelerator: the compute die flanked by four HBM stacks on a
    silicon interposer, on an organic substrate with a stiffener frame,
    standing on its ball grid. (The field of decoupling caps that ringed the
    frame is gone: at the size the board is seen, a hundred and fifty tiny
    boxes drew a dashed border round the package, not capacitors.)"""
    parts = []
    # --- ball grid: the outer ring shows as a dotted seam under the substrate
    balls = []
    n = 19
    for k in range(n):
        u = (k - (n - 1) / 2) * 0.05
        for (x, z) in ((0.47, u), (-0.47, u), (u, 0.47), (u, -0.47)):
            balls.append(K.sphere('b', 0.0078, pos=(x, Y0 + 0.0068, z), seg=6, rings=3, scale=(1, 0.86, 1)))
    bg = K.join('pkg_balls', balls)
    K.finish(bg, 80)
    parts.append((bg, 'metal'))

    # --- substrate
    sub_y = (Y0 + 0.0135, Y0 + 0.0495)  # riding on the balls; thicker than life so it reads from afar
    sub = K.rbox('pkg_sub', (1.05, sub_y[1] - sub_y[0], 1.05), 0.03, pos=(0, sum(sub_y) / 2, 0), seg=8, bev=BEV_M)
    parts.append((K.bake(sub), 'glass'))
    top = sub_y[1]

    # --- stiffener frame (a ring) + interposer + HBM stacks: the pale cut
    fr_h = 0.014
    outer = K.rbox('fo', (1.0, fr_h, 1.0), 0.028, pos=(0, top + fr_h / 2, 0), seg=8)
    inner = K.rbox('fi', (0.9, fr_h * 3, 0.9), 0.02, pos=(0, top + fr_h / 2, 0), seg=6)
    K.cut(outer, inner)
    # pin-1: a chamfer notch on the frame's back-left corner
    notch = K.box('n', (0.07, 0.05, 0.07), pos=(-0.5, top + fr_h, -0.5), rot=(0, math.pi / 4, 0))
    K.cut(outer, notch)
    K.bevel(outer, BEV_S, now=True)

    ip_h = 0.013
    ip = K.rbox('ip', (0.68, ip_h, 0.68), 0.012, pos=(0, top + ip_h / 2, 0), seg=6, bev=BEV_S)
    K.bake(ip)
    ip_top = top + ip_h

    die_h = 0.042
    hbm = []
    layers = 5
    lh = die_h / layers
    for sx in (-1, 1):
        for sz in (-1, 1):
            for L in range(layers):
                y = ip_top + L * lh + lh / 2
                hbm.append(K.box('hb', (0.1, lh * 0.97, 0.16), pos=(sx * 0.28, y, sz * 0.092), bev=0.0014))
    outer.name = 'pkg_frame'
    parts.append((outer, 'glass'))
    ip.name = 'pkg_ip'
    parts.append((ip, 'deep'))
    hb = K.join('pkg_hbm', hbm)
    parts.append((hb, 'pale'))

    # --- the die: a silicon slab (its base glows low) and the compute tiles
    die = K.rbox('pkg_die', (0.4, die_h, 0.4), 0.008, pos=(0, ip_top + die_h / 2, 0), seg=4, bev=BEV_S)
    parts.append((K.bake(die), 'mark'))
    tiles = []
    g, n, gap = 0.078, 4, 0.012
    span = n * g + (n - 1) * gap
    for i in range(n):
        for j in range(n):
            x = -span / 2 + g / 2 + i * (g + gap)
            z = -span / 2 + g / 2 + j * (g + gap)
            tiles.append(K.box('t', (g, 0.0016, g), pos=(x, ip_top + die_h + 0.0008, z)))
    tg = K.join('pkg_tiles', tiles)
    K.finish(tg, 80)
    parts.append((tg, 'mark'))
    return parts


# ============================================================== caps


def cap():
    """A radial electrolytic: aluminium can with the rolled crimp, the scored
    vent on top, a polarity stripe down one side, a rubber bung under it."""
    R = 0.05
    prof = [
        (0.0, 0.136), (0.0435, 0.136), (0.0445, 0.1385), (0.0482, 0.1392), (R, 0.1365),
        (R, 0.058), (0.0472, 0.0545), (0.0472, 0.0495), (R, 0.046),
        (R, 0.028), (0.0472, 0.0262), (0.0, 0.0262),
    ]
    rad = [0, 0, 0, 0, 0.0025, 0, 0.002, 0.002, 0, 0.002, 0, 0]
    can = K.lathe('can', K.rounded_profile(prof, rad), seg=48)
    # a three-way (Y) vent scored into the top: three half-bars from the centre
    vbars = []
    for i in range(3):
        a = i * TAU / 3 + math.pi / 2
        vbars.append(K.box(f'vb{i}', (0.0045, 0.012, 0.032), pos=(0.016 * math.cos(a), 0.1375, 0.016 * math.sin(a)), rot=(0, -a + math.pi / 2, 0)))
    K.cut(can, *vbars)
    K.finish(can, 35)
    stripe, body = K.split(can, 'cap_stripe', 'cap_can', lambda c: c.y > 0.058 and c.y < 0.1355 and math.hypot(c.x, c.z) > R - 0.001 and abs(math.atan2(c.x, c.z)) < math.radians(28))
    bung = K.lathe('cap_bung', K.rounded_profile([(0.0, 0.0262), (0.046, 0.0262), (0.046, Y0), (0.0, Y0)], [0, 0.0015, 0, 0]), seg=40)
    K.finish(bung, 35)
    return [(body, 'glass'), (stripe, 'pale'), (bung, 'deep')]


# ============================================================== heart projector


def projector():
    """The Philips module: a square IC-style package soldered to the board by
    gull-wing legs down all four sides, carrying a round emitter (a raised
    collar round a domed lens). The site projects its holographic heart out
    of the lens, and the catheter comes up out of its middle (HeartHologram)."""
    out = []
    body = K.rbox('hrt_body', (0.2, 0.024, 0.2), 0.022, pos=(0, Y0 + 0.012, 0), axis='y', seg=8, bev=BEV_M)
    out.append((body, 'deep'))
    top = Y0 + 0.024
    ring = K.lathe('hrt_ring', K.rounded_profile([(0.05, top), (0.072, top), (0.072, top + 0.014), (0.05, top + 0.014)], [0, 0.003, 0.004, 0]), seg=40, closed=True)
    K.finish(ring, 35)
    out.append((ring, 'pale'))
    lens = K.lathe('hrt_lens', [(0, top + 0.012), (0.022, top + 0.0115), (0.04, top + 0.009), (0.05, top + 0.005), (0.05, top + 0.002), (0, top + 0.002)], seg=40)
    K.finish(lens, 60)
    out.append((lens, 'mark'))
    legs = []
    for i in range(4):
        t = -0.054 + i * 0.036
        for s_ in (1, -1):
            # down the two z sides: the outline in (y, z), swept along x
            legs.append(K.strip('lg', [(0.032, s_ * 0.092), (0.032, s_ * 0.106), (Y0 + 0.0022, s_ * 0.115), (Y0 + 0.0022, s_ * 0.126)], 0.0042, t - 0.0065, t + 0.0065, 'x'))
            # and the two x sides: in (x, y), swept along z
            legs.append(K.strip('lg', [(s_ * 0.092, 0.032), (s_ * 0.106, 0.032), (s_ * 0.115, Y0 + 0.0022), (s_ * 0.126, Y0 + 0.0022)], 0.0042, t - 0.0065, t + 0.0065, 'z'))
    lm = K.join('hrt_legs', legs)
    K.finish(lm, 50)
    out.append((lm, 'metal'))
    return out


# ============================================================== heatsink + fan


def heatsink():
    """A secondary IC under a finned sink, with a small fan on top whose rotor
    the site can spin while the board is powered."""
    out = []
    chip = K.rbox('hs_chip', (0.24, 0.026, 0.24), 0.01, pos=(0, Y0 + 0.013, 0), axis='y', seg=4, bev=BEV_S)
    out.append((K.bake(chip), 'glass'))
    pads = []
    for e in range(4):
        for k in range(7):
            t = (k - 3) * 0.03
            d = 0.124
            x, z = [(d, t), (t, d), (-d, t), (t, -d)][e]
            pads.append(K.box('pd', (0.014, 0.004, 0.02) if e % 2 == 0 else (0.02, 0.004, 0.014), pos=(x, Y0 + 0.002, z)))
    pm = K.join('hs_pads', pads)
    K.finish(pm, 80)
    out.append((pm, 'metal'))
    sink = K.rbox('sk', (0.22, 0.012, 0.22), 0.008, pos=(0, Y0 + 0.032, 0), axis='y', seg=4)
    fins = [K.box('fn', (0.0065, 0.084, 0.22), pos=(-0.104 + i * 0.026, Y0 + 0.08, 0)) for i in range(9)]
    K.union(sink, *fins)
    K.bevel(sink, BEV_S, now=True)
    out.append((K.bake(sink), 'glass'))
    sink.name = 'hs_sink'
    fy0 = Y0 + 0.122  # the fan frame's underside
    frame = K.rbox('fr', (0.226, 0.026, 0.226), 0.024, pos=(0, fy0 + 0.013, 0), axis='y', seg=8)
    bore = K.cyl('bo', 0.1, 0.08, pos=(0, fy0 + 0.013, 0), seg=44)
    screws = [K.cyl('sh', 0.0065, 0.08, pos=(sx * 0.093, fy0 + 0.013, sz * 0.093), seg=16) for sx in (-1, 1) for sz in (-1, 1)]
    K.cut(frame, bore, *screws)
    motor = K.cyl('mo', 0.036, 0.006, pos=(0, fy0 + 0.003, 0), seg=40)
    struts = [K.box('st', (0.105, 0.005, 0.006), pos=(0.064, fy0 + 0.003, 0), rot=(0, 0, 0)) for _ in range(3)]
    for i, st in enumerate(struts):
        K.xf(st, rot=(0, i * TAU / 3 + 0.4, 0))
    K.union(frame, motor, *struts)
    K.bevel(frame, BEV_S, now=True)
    frame.name = 'hs_fan'
    out.append((frame, 'glass'))
    # rotor: the hub and seven pitched blades, spun about +Y by the site
    hub = K.lathe('hb', K.rounded_profile([(0, fy0 + 0.007), (0.033, fy0 + 0.007), (0.033, fy0 + 0.024), (0, fy0 + 0.024)], [0, 0, 0.005, 0]), seg=40)
    blades = []
    for i in range(7):
        b = K.box('bl', (0.06, 0.0026, 0.034), bev=0.0009)
        K.bake(b)
        K.xf(b, rot=(0.55, 0, 0.06))
        K.xf(b, pos=(0.062, fy0 + 0.0155, 0))
        K.xf(b, rot=(0, i * TAU / 7, 0))
        blades.append(b)
    rotor = K.join('hs_rotor', [hub] + blades)
    K.finish(rotor, 50)
    out.append((rotor, 'pale'))
    return out


# ============================================================== pin header


def header():
    """A shrouded 2×6 box header — the key slot in its wall, square posts with
    pointed tips standing in the well."""
    out = []
    shroud = K.rbox('sh', (0.3, 0.085, 0.11), 0.007, pos=(0, Y0 + 0.0425, 0), axis='y', seg=4)
    well = K.rbox('wl', (0.282, 0.2, 0.092), 0.004, pos=(0, Y0 + 0.015 + 0.1, 0), axis='y', seg=4)
    key = K.box('ky', (0.05, 0.1, 0.04), pos=(0, Y0 + 0.085 + 0.03, 0.055))
    K.cut(shroud, well, key)
    K.bevel(shroud, BEV_S, now=True)
    shroud.name = 'hdr_body'
    out.append((shroud, 'glass'))
    pins = []
    for i in range(6):
        for z in (-0.021, 0.021):
            x = -0.1 + i * 0.04
            pins.append(K.box('pn', (0.0085, 0.056, 0.0085), pos=(x, Y0 + 0.015 + 0.028, z)))
            pins.append(K.cyl('tp', 0.006, 0.008, r2=0.0012, seg=4, pos=(x, Y0 + 0.015 + 0.056 + 0.004, z), rot=(0, math.pi / 4, 0)))
    pm = K.join('hdr_pins', pins)
    K.finish(pm, 40)
    out.append((pm, 'metal'))
    return out


# ============================================================== small IC


def small_ic():
    """A small QFN — the co-processor on the right-hand slot, pin 1 dimpled."""
    body = K.rbox('ic', (0.16, 0.02, 0.16), 0.008, pos=(0, Y0 + 0.01, 0), axis='y', seg=4)
    dimple = K.sphere('dm', 0.009, pos=(-0.052, Y0 + 0.02 + 0.0062, -0.052), seg=16, rings=10)
    K.cut(body, dimple)
    K.bevel(body, BEV_S, now=True)
    body.name = 'ic_body'
    lands = []
    for e in range(4):
        for k in range(5):
            t = (k - 2) * 0.028
            d = 0.083
            x, z = [(d, t), (t, d), (-d, t), (t, -d)][e]
            lands.append(K.box('ln', (0.013, 0.003, 0.016) if e % 2 == 0 else (0.016, 0.003, 0.013), pos=(x, Y0 + 0.0015, z)))
    lm = K.join('ic_lands', lands)
    K.finish(lm, 80)
    return [(body, 'glass'), (lm, 'metal')]


# where the site's JSX hangs a part that isn't on its slot's origin (single-part
# previews); none at the moment
PREVIEW_OFFSETS = {}

BUILDERS = {'board': board, 'silk': silk, 'pkg': package, 'cap': cap, 'hrt': projector, 'hs': heatsink, 'hdr': header, 'ic': small_ic}


CORNER, EDGE = 0.75, 0.85
SLOTS = {  # name prefix → (x, y, z, yaw[, tilt]): where ChipRig puts each part
    'hrt_': (-CORNER, 0, -CORNER, 0),
    'hs_': (-CORNER, 0, CORNER, 0),
    'ic_': (EDGE, 0, 0, 0),
    'hdr_': (0, 0, EDGE, 0),
}


def assemble(parts):
    """Lay every part out on its ChipRig slot (whole-board previews only)."""
    import bpy
    out = []
    for ob, tint in parts:
        n = ob.name
        if n.startswith('cap_'):
            for (x, z) in ((-EDGE, 0), (0, -EDGE)):
                d = ob.copy()
                bpy.context.scene.collection.objects.link(d)
                d.location = (x, 0, z)
                out.append((d, tint))
            continue
        for pre, sl in SLOTS.items():
            if n.startswith(pre):
                ob.location = sl[:3]
                ob.rotation_euler = (sl[4] if len(sl) > 4 else 0, sl[3], 0)
        out.append((ob, tint))
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    want = args or list(BUILDERS)
    K.reset()
    t0 = time.time()
    everything = []
    for name in want:
        t = time.time()
        parts = BUILDERS[name]()
        everything += parts
        tr = sum(K.tris(o) for o, _ in parts)
        print(f'{name}: {len(parts)} meshes, {tr} tris, {time.time() - t:.1f}s')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'chip-raw.glb' if not args else f'{"-".join(want)}-raw.glb')
    size = K.export(path, [o for o, _ in everything])
    print(f'exported {path} {size / 1024:.0f} KB in {time.time() - t0:.1f}s')
    if '--preview' in sys.argv:
        cam = (1.9, 1.3, 2.3)
        target = (0, 0.05, 0)
        for a in sys.argv:
            if a.startswith('--cam='):
                cam = tuple(float(v) for v in a[6:].split(','))
            if a.startswith('--target='):
                target = tuple(float(v) for v in a[9:].split(','))
        lens = 50
        for a in sys.argv:
            if a.startswith('--lens='):
                lens = float(a[7:])
        tag = '-'.join(want)
        if '--board' in sys.argv:
            everything = assemble(everything)
        # assemble the pivoted parts for the preview (the site does this in JSX)
        for ob, _ in ([] if '--board' in sys.argv else everything):
            for pre, off in PREVIEW_OFFSETS.items():
                if ob.name.startswith(pre):
                    ob.location = off  # in the rig's (three) space
        s = K.preview(os.path.join(OUT, f'prev-{tag}.png'), everything, cam, target, lens=lens)
        print(f'preview {s:.1f}s')


main()
