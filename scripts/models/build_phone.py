# The Popcore phone on the Room's couch: a current handset, put down face down
# the way a phone is left on a cushion, so its back is what you see, and the
# camera island on that back is what says "phone" from across the room.
# Exported as one glb of named parts for the site (src/scene/maquette/room.tsx,
# Phone, which turns it over to show its screen). See README.md to rebuild.
#
# Coordinates are the phone's own (see modelkit.py): centred on the origin, the
# screen facing +Z, its top at +Y; the back at -Z. The screen itself is the
# site's (a plane with the game's screenshot on it) and lies just over the
# body's front face at z T/2.
#   ph_body    the body: a thin slab with rounded corners and soft edges
#   ph_keys    the volume keys down its left side, the power key on its right
#   ph_island  the raised camera island on the back, top corner
#   ph_lens    the three lens barrels standing out of the island
#   ph_glass   the lenses' dark glass, set into the barrels
#   ph_flash   the flash beside them
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modelkit as K  # noqa: E402  (imports bpy first)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

W, H, T = 0.075, 0.155, 0.0075  # the body: the site's screen is sized off W and H
R = 0.0165  # its corner radius
EDGE = 0.0024  # the soft round on its edges, front and back
BACK = -T / 2
# the camera island: at +x in the phone's own frame, which puts it top left
# when you look at the back
ISLAND = 0.034
ISLAND_R = 0.0095
ISLAND_T = 0.0014
ISLAND_AT = (W / 2 - 0.0045 - ISLAND / 2, H / 2 - 0.0045 - ISLAND / 2)
LENS_R, LENS_H = 0.0064, 0.0017
LENSES = [(-0.0078, 0.0078), (-0.0078, -0.0078), (0.0078, 0.0)]  # off the island's centre


def body():
    ob = K.rbox('ph_body', (W, H, T), R, axis='z', seg=8)
    K.bevel(ob, EDGE, seg=3, now=True)
    return K.finish(ob, 40)


def keys():
    out = []
    for side, y, length in ((-1, 0.031, 0.026), (-1, 0.0, 0.014), (1, 0.016, 0.03)):
        k = K.box('key', (0.0018, length, 0.0028), pos=(side * (W / 2 + 0.0001), y, 0), bev=0.0006)
        out.append(k)
    return K.finish(K.join('ph_keys', out), 40)


def island():
    x, y = ISLAND_AT
    ob = K.rbox('ph_island', (ISLAND, ISLAND, ISLAND_T + 0.001), ISLAND_R, pos=(x, y, BACK - ISLAND_T / 2 + 0.0005), axis='z', seg=6)
    K.bevel(ob, 0.0006, now=True)
    return K.finish(ob, 40)


def lenses():
    x, y = ISLAND_AT
    z0 = BACK - ISLAND_T  # the island's face
    barrels, glass = [], []
    for dx, dy in LENSES:
        # a ring standing out of the island: outer wall, a lip, and the inner
        # wall down to where the glass sits
        prof = [(LENS_R * 0.74, -0.0002), (LENS_R * 0.74, LENS_H * 0.6), (LENS_R * 0.86, LENS_H), (LENS_R, LENS_H), (LENS_R, -0.0002)]
        b = K.lathe('barrel', prof, seg=18, closed=True)
        K.xf(b, (x + dx, y + dy, z0), (-math.pi / 2, 0, 0))
        barrels.append(b)
        g = K.cyl('glass', LENS_R * 0.74, 0.0006, pos=(x + dx, y + dy, z0 - LENS_H * 0.55), rot=(math.pi / 2, 0, 0), seg=18)
        glass.append(g)
    return K.finish(K.join('ph_lens', barrels), 40), K.finish(K.join('ph_glass', glass), 40)


def flash():
    x, y = ISLAND_AT
    return K.finish(K.cyl('ph_flash', 0.0024, 0.0006, pos=(x + 0.0085, y + 0.0098, BACK - ISLAND_T - 0.0002), rot=(math.pi / 2, 0, 0), seg=12), 40)


def main():
    K.reset()
    t0 = time.time()
    lens, glass = lenses()
    parts = [(body(), 'glass'), (keys(), 'pale'), (island(), 'deep'), (lens, 'pale'), (glass, 'deep'), (flash(), 'pale')]
    for ob, _ in parts:
        print(f'  {ob.name:10s} {K.tris(ob):6d} tris')
    print(f'phone: {len(parts)} meshes, {sum(K.tris(o) for o, _ in parts)} tris, {time.time() - t0:.1f}s')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'phone-raw.glb')
    size = K.export(path, [o for o, _ in parts])
    print(f'exported {path} {size / 1024:.0f} KB')
    if '--preview' in sys.argv:
        # face down on the floor, as it lies on the couch
        for ob, _ in parts:
            ob.data.transform(K.Matrix.Rotation(math.pi / 2, 4, 'X'))
            ob.data.transform(K.Matrix.Translation((0, T / 2, 0)))
        s = K.preview(os.path.join(OUT, 'prev-phone.png'), parts, (0.16, 0.17, 0.2), (0, 0.0, 0.0), lens=60)
        print(f'preview {s:.1f}s')


if __name__ == '__main__':
    main()
