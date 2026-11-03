# The Virtuele Brigade monitor on the Room's desk: a current slim monitor,
# its screen running almost to the edge (a thin bezel, a slightly deeper
# chin), a shallow rounded housing on its back for the electronics, on an L
# stand: a flat base plate and one flat upright leaning up to a hinge on the
# housing. Exported as one glb of named parts for the site
# (src/scene/maquette/room.tsx, Desk, which puts the picture on its screen).
# See README.md to rebuild.
#
# Coordinates are the desk's (see modelkit.py): Y up, the desk top's surface
# at y DESK, the screen facing +Z with its glass in the plane z FRONT (the
# site's screen lies just in front of it, so nothing structural crosses the
# picture).
#   mon_panel   the panel and the housing behind it
#   mon_stand   the base plate, the upright and the hinge
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modelkit as K  # noqa: E402  (imports bpy first)
from modelkit import BEV_S  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

DESK = 0.395  # the desk top
FRONT = -0.125  # the panel's front face
PANEL_W, PANEL_H, PANEL_T = 0.56, 0.33, 0.01
PANEL_Y = 0.625  # its centre
BEZEL, CHIN = 0.008, 0.018  # the screen's border at the sides and top, and below
HOUSING = (0.3, 0.17, 0.026)  # the bump on the back: width, height, depth
HOUSING_Y = 0.6
HINGE = (0.0, 0.615, FRONT - PANEL_T - HOUSING[2] - 0.006)  # where the upright meets the housing
FOOT = (0.24, 0.008, 0.14)  # the base plate
FOOT_Z = -0.165
UPRIGHT_W, UPRIGHT_T = 0.05, 0.012


def panel():
    p = K.rbox('panel', (PANEL_W, PANEL_H, PANEL_T), 0.012, pos=(0, PANEL_Y, FRONT - PANEL_T / 2), axis='z', seg=6)
    K.bevel(p, 0.0025, seg=2, now=True)
    # the screen's well: a hair deep, so the bezel reads as a frame round it
    sw, sh = PANEL_W - 2 * BEZEL, PANEL_H - BEZEL - CHIN
    well = K.rbox('well', (sw, sh, 0.004), 0.004, pos=(0, PANEL_Y + (CHIN - BEZEL) / 2, FRONT), axis='z', seg=3)
    K.cut(p, well)
    # the housing: a shallow, rounded box on the back, its corners soft
    hw, hh, hd = HOUSING
    h = K.rbox('housing', (hw, hh, hd + 0.004), 0.05, pos=(0, HOUSING_Y, FRONT - PANEL_T - hd / 2 + 0.002), axis='z', seg=6)
    K.bevel(h, 0.008, seg=3, now=True)
    return K.finish(K.join('mon_panel', [p, h]), 35)


def stand():
    fw, ft, fd = FOOT
    foot = K.rbox('foot', (fw, ft, fd), 0.022, pos=(0, DESK + ft / 2, FOOT_Z), seg=6, bev=BEV_S)
    # the upright: from the foot's back up to the hinge, leaning forward
    base = (0, DESK + ft, FOOT_Z - fd / 2 + 0.018)
    dy, dz = HINGE[1] - base[1], HINGE[2] - base[2]
    length = math.hypot(dy, dz)
    lean = math.atan2(dz, dy)
    up = K.rbox('upright', (UPRIGHT_W, length, UPRIGHT_T), 0.006, pos=(0, base[1] + dy / 2, base[2] + dz / 2), rot=(lean, 0, 0), axis='y', seg=3, bev=BEV_S)
    hinge = K.cyl('hinge', 0.011, UPRIGHT_W + 0.012, pos=HINGE, rot=(0, 0, math.pi / 2), seg=16, bev=0.0015)
    return K.finish(K.join('mon_stand', [foot, up, hinge]), 35)


def main():
    K.reset()
    t0 = time.time()
    parts = [(panel(), 'glass'), (stand(), 'pale')]
    for ob, _ in parts:
        print(f'  {ob.name:10s} {K.tris(ob):6d} tris')
    print(f'monitor: {len(parts)} meshes, {sum(K.tris(o) for o, _ in parts)} tris, {time.time() - t0:.1f}s')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'monitor-raw.glb')
    size = K.export(path, [o for o, _ in parts])
    print(f'exported {path} {size / 1024:.0f} KB')
    if '--preview' in sys.argv:
        view = sys.argv[sys.argv.index('--view') + 1] if '--view' in sys.argv else 'front'
        cams = {'front': (0.45, 0.75, 0.6), 'side': (0.75, 0.62, -0.1), 'back': (-0.4, 0.75, -0.75)}
        s = K.preview(os.path.join(OUT, f'prev-monitor-{view}.png'), parts, cams[view], (0, 0.58, -0.15), lens=40)
        print(f'preview {s:.1f}s')


if __name__ == '__main__':
    main()
