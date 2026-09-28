# The city's Alliander tower, built in Blender and exported as one glb of named
# parts for the site (src/scene/maquette/city.tsx). See README.md to rebuild.
#
# Coordinates are the city's (see modelkit.py): Y up, the ground at y 0, the
# tower standing on its plaza at the origin (city.tsx places the group). A
# setback tower: a podium with a recessed entrance under a canopy, three tiers
# stepping in, two crown steps, a slotted lantern, and a spire whose tip at
# y 1.0 carries the site's beacon.
#   tower_body     the podium, tiers, canopy and lantern: one glass shell
#   tower_ribs     five vertical ribs a face on the three tiers
#   tower_windows  the window strips between the ribs (lit with the city's windows)
#   tower_lamp     the light inside the lantern's slots (powers on with the beacon)
#   tower_spire    the four-sided spire
# city.tsx keeps its own copy of the three tiers (TOWER_TIERS): the cables land
# on them and the light-band steps in with them, so change both together.
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modelkit as K  # noqa: E402  (imports bpy first)
from modelkit import BEV_M, BEV_S  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

# (width, y0, y1, corner radius): the podium, three tiers, two crown steps
TIERS = [
    (0.34, 0.0, 0.06, 0.07),
    (0.27, 0.06, 0.46, 0.075),
    (0.23, 0.46, 0.66, 0.065),
    (0.19, 0.66, 0.80, 0.055),
    (0.15, 0.80, 0.845, 0.045),
    (0.11, 0.845, 0.885, 0.034),
]
LANTERN = (0.078, 0.885, 0.94)  # width, y0, y1


def on_face(face, u, d):
    """(x, z) of a point u along face `face` (0 front, then a quarter turn
    each), d out from the centre, and the face's turn about Y."""
    a = face * math.pi / 2
    return u * math.cos(a) + d * math.sin(a), -u * math.sin(a) + d * math.cos(a), a


def tower():
    out = []
    blocks = [K.rbox(f't{i}', (w, y1 - y0, w), r, pos=(0, (y0 + y1) / 2, 0), axis='y', seg=8) for i, (w, y0, y1, r) in enumerate(TIERS)]
    body = blocks[0]
    K.union(body, *blocks[1:])
    # the entrance: a recess in the podium's front, under a thin canopy
    door = K.box('door', (0.09, 0.045, 0.06), pos=(0, 0.0225, 0.17))
    K.cut(body, door)
    K.bevel(body, BEV_M, now=True)
    canopy = K.rbox('canopy', (0.15, 0.008, 0.05), 0.01, pos=(0, 0.049, 0.19), axis='y', seg=4, bev=0.002)
    # the lantern: a slotted glass box on the top step, three slots a face
    lw, ly0, ly1 = LANTERN
    lantern = K.rbox('lantern', (lw, ly1 - ly0, lw), 0.014, pos=(0, (ly0 + ly1) / 2, 0), axis='y', seg=6)
    slots = []
    for face in range(4):
        for u in (-0.018, 0, 0.018):
            x, z, a = on_face(face, u, lw / 2)
            slots.append(K.box('slot', (0.007, (ly1 - ly0) * 0.7, 0.03), pos=(x, (ly0 + ly1) / 2, z), rot=(0, a, 0)))
    K.cut(lantern, *slots)
    K.bevel(lantern, BEV_S, now=True)
    out.append((K.join('tower_body', [body, canopy, lantern]), 'glass'))
    # the lamp: a lit core inside the lantern, seen through the slots
    lamp = K.rbox('tower_lamp', (lw - 0.018, (ly1 - ly0) * 0.78, lw - 0.018), 0.01, pos=(0, (ly0 + ly1) / 2, 0), axis='y', seg=4)
    K.finish(lamp, 60)
    out.append((lamp, 'mark'))
    # five ribs a face up the three tiers, and a window strip between each pair
    ribs = []
    wins = []
    for (w, y0, y1, r) in TIERS[1:4]:
        flat = w / 2 - r
        us = [-flat * 0.85 + k * (flat * 1.7) / 4 for k in range(5)]
        h = y1 - y0 - 0.024
        for face in range(4):
            for u in us:
                x, z, a = on_face(face, u, w / 2 + 0.004)
                ribs.append(K.box('rib', (0.009, h, 0.011), pos=(x, (y0 + y1) / 2, z), rot=(0, a, 0), bev=0.0022))
            for u0, u1 in zip(us, us[1:]):
                x, z, a = on_face(face, (u0 + u1) / 2, w / 2 + 0.0015)
                wins.append(K.box('win', (u1 - u0 - 0.014, h - 0.03, 0.002), pos=(x, (y0 + y1) / 2 + 0.006, z), rot=(0, a, 0)))
    out.append((K.join('tower_ribs', ribs), 'metal'))
    windows = K.join('tower_windows', wins)
    K.finish(windows, 80)
    out.append((windows, 'mark'))
    spire = K.lathe('tower_spire', K.rounded_profile([(0, 0.94), (0.02, 0.94), (0.02, 0.948), (0.004, 0.99), (0.0035, 1.0), (0, 1.0)], [0, 0, 0.003, 0, 0, 0]), seg=4, phase=math.pi / 4)
    K.finish(spire, 50)
    out.append((spire, 'metal'))
    return out


def main():
    K.reset()
    t0 = time.time()
    parts = tower()
    print(f'tower: {len(parts)} meshes, {sum(K.tris(o) for o, _ in parts)} tris, {time.time() - t0:.1f}s')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'tower-raw.glb')
    size = K.export(path, [o for o, _ in parts])
    print(f'exported {path} {size / 1024:.0f} KB in {time.time() - t0:.1f}s')
    if '--preview' in sys.argv:
        s = K.preview(os.path.join(OUT, 'prev-tower.png'), parts, (0.9, 0.75, 1.9), (0, 0.48, 0), lens=45, res=(800, 1000))
        print(f'preview {s:.1f}s')


main()
