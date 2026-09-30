# The city's six blocks round the tower, built in Blender and exported as one
# glb of named parts for the site (src/scene/maquette/city.tsx). See README.md
# to rebuild.
#
# Each block is modelled at its exact size: city_blocks() replays CityRig's
# seeded plan draw for draw, so a change to that plan has to land here too
# (the site warns in dev when the file and the plan disagree). Coordinates are
# block-local (see modelkit.py): Y up, the ground at y 0, the footprint centred
# on the origin; city.tsx places each block's group at its x, z.
#   block<i>_body     podium, shaft and setback crown: the glass the site outlines
#   block<i>_trim     cornices, sills, the door canopy and the plant room: a pale
#                     cut with no outline, so the resting drawing stays sparse
#   block<i>_windows  every pane, one-sided and facing out (the block's own
#                     window material, on its beat of the city's light ramp)
#   block<i>_lit      the one pane an occupied block keeps lit in the sleeping city
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modelkit as K  # noqa: E402  (imports bpy first)
from modelkit import BEV_S  # noqa: E402

import bmesh  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')


# ============================================================== the plan


def make_rand(seed):
    """shared.tsx's makeRand (mulberry32), bit for bit."""
    a = [seed & 0xffffffff]

    def imul(x, y):
        return ((x & 0xffffffff) * (y & 0xffffffff)) & 0xffffffff

    def rnd():
        a[0] = (a[0] + 0x6d2b79f5) & 0xffffffff
        x = a[0]
        t = imul(x ^ (x >> 15), 1 | x)
        t = ((t + imul(t ^ (t >> 7), 61 | t)) & 0xffffffff) ^ t
        return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296
    return rnd


def city_blocks():
    """CityRig's cluster: a block on each plot of the 3x3 grid but the tower's
    plaza, the transformer's plot (its draws still taken, so the rest of the
    skyline is unchanged) and the back-left plot, left open. Taller toward the
    middle. The rooflines alternate by index — flat with a plant room, then a
    setback — rather than being drawn, so they never move the skyline."""
    rnd = make_rand(1872)
    roofs = ('plant', 'setback')
    out = []
    cells = (-0.55, 0, 0.55)
    for cx in cells:
        for cz in cells:
            if cx == 0 and cz == 0:
                continue
            if cx < 0 and cz < 0:
                continue
            x = cx + (rnd() - 0.5) * 0.12
            z = cz + (rnd() - 0.5) * 0.12
            fall = max(0.1, 1 - (x * x + z * z) * 0.8)
            b = dict(x=x, z=z, w=0.175 + rnd() * 0.04, d=0.175 + rnd() * 0.04, h=0.24 + fall * 0.3 + rnd() * 0.1, roof=roofs[len(out) % 2])
            if cx == 0 and cz == 0.55:
                continue
            out.append(b)
    return out


BLOCKS = city_blocks()
# Only some blocks have someone home (the site's rule: skip every third).
OCCUPIED = [i for i in range(len(BLOCKS)) if i % 3 != 1]

# ============================================================== the block

# The podium: the ground floor, stepped out a little to meet the pavement.
PODIUM_H = 0.045
PODIUM_OUT = 0.006
# Crisp corners, but still rounded: the tower's rounded tiers make a razor
# edge look unfinished beside them.
CORNER = 0.012
# The setback crown: clearly smaller than the shaft it steps back from, or it
# reads as a lid balanced on a box.
CROWN = (0.54, 0.05)  # fraction of the shaft, height

# The facade module. FOUR BAYS ON EVERY BLOCK: fitting as many fixed-pitch bays
# as a block was wide came out at two almost every time, and a facade two
# windows across reads as the core of a building rather than a building. The
# pane stays fixed, so neighbouring blocks wear the same windows; the wall takes
# up the difference, split into three mullion gaps and two corner piers, the
# piers wider than the gaps (PIER) so a facade ends rather than looks cut off.
PANE = (0.03, 0.036)
BAYS = 4
PIER = 1.6
# The floor pitch, the same on every block so they line up floor for floor.
# The rows are centred between podium and roof, so the margins above and below
# match on every block.
WIN_ROW = 0.056


def bay_offsets(width):
    gap = (width - BAYS * PANE[0]) / (BAYS - 1 + 2 * PIER)
    pitch = PANE[0] + gap
    return [(k - (BAYS - 1) / 2) * pitch for k in range(BAYS)]


def rows(bot, top):
    avail = top - bot
    n = max(1, int(avail // WIN_ROW))
    y0 = bot + (avail - n * WIN_ROW) / 2 + WIN_ROW / 2
    return [y0 + r * WIN_ROW for r in range(n)]


def walls(w, d):
    """The four walls as (turn a, half-width, distance out): front +Z, right
    +X, back -Z, left -X. A point u along a wall and s out from the centre is
    on(a, u, s)."""
    return [(0.0, w / 2, d / 2), (math.pi / 2, d / 2, w / 2), (math.pi, w / 2, d / 2), (-math.pi / 2, d / 2, w / 2)]


def on(a, u, s):
    return u * math.cos(a) + s * math.sin(a), -u * math.sin(a) + s * math.cos(a)


def panes(name, specs):
    """One mesh of one-sided panes facing out, from (a, u, y, s, width, height)."""
    bm = bmesh.new()
    for a, u, y, s, qw, qh in specs:
        pts = []
        for du, dy in ((-qw / 2, -qh / 2), (qw / 2, -qh / 2), (qw / 2, qh / 2), (-qw / 2, qh / 2)):
            x, z = on(a, u + du, s)
            pts.append(bm.verts.new((x, y + dy, z)))
        bm.faces.new(pts)
    bm.normal_update()
    return K.mk(name, bm)


def ring(name, w, d, r, t, y0, h, seg=8):
    """A collar round a rounded rectangle (inner outline w, d, r), t thick, from
    y0 up h: a cornice that never enters the glass. No inner wall; it lies
    against the building's face, where nothing can see it."""
    inner = K.rrect_pts(w, d, r, seg)
    outer = K.rrect_pts(w + 2 * t, d + 2 * t, r + t, seg)
    bm = bmesh.new()
    lo_i = [bm.verts.new((x, y0, z)) for x, z in inner]
    hi_i = [bm.verts.new((x, y0 + h, z)) for x, z in inner]
    lo_o = [bm.verts.new((x, y0, z)) for x, z in outer]
    hi_o = [bm.verts.new((x, y0 + h, z)) for x, z in outer]
    n = len(inner)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo_o[i], lo_o[j], hi_o[j], hi_o[i]))  # outer wall
        bm.faces.new((hi_o[i], hi_o[j], hi_i[j], hi_i[i]))  # top
        bm.faces.new((lo_i[i], lo_i[j], lo_o[j], lo_o[i]))  # underside
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = K.mk(name, bm)
    K.bevel(ob, min(0.0015, t * 0.4, h * 0.4), now=True)
    return ob


def slab(name, w, h, d, r, y0, bev=BEV_S):
    """A rounded-corner box standing on y0."""
    return K.rbox(name, (w, h, d), r, pos=(0, y0 + h / 2, 0), axis='y', seg=8, bev=bev)


def block(i, b):
    w, d, h, roof = b['w'], b['d'], b['h'], b['roof']
    crown_h = CROWN[1] if roof == 'setback' else 0.0
    top = h - crown_h  # where the shaft ends
    trim = []
    body = slab('podium', w + 2 * PODIUM_OUT, PODIUM_H, d + 2 * PODIUM_OUT, CORNER + PODIUM_OUT, 0.0, bev=0)
    parts = [slab('shaft', w, top - PODIUM_H + 0.002, d, CORNER, PODIUM_H - 0.002, bev=0)]
    if roof == 'setback':
        parts.append(slab('crown', w * CROWN[0], crown_h + 0.001, d * CROWN[0], 0.01, top - 0.001, bev=0))
    K.union(body, *parts)
    # a doorway in the podium's street side, under a thin canopy
    front = d / 2 + PODIUM_OUT
    K.cut(body, K.box('door', (0.066 * 0.72, 0.03, 0.03), pos=(0, 0.015, front)))
    trim.append(K.rbox('canopy', (0.066, 0.005, 0.02), 0.004, pos=(0, 0.034, front + 0.004), axis='y', seg=3, bev=0.0012))
    # The podium's top edge, and the ledge where the shaft stands on it, are a
    # band rather than a silhouette: a soft round the site's outline passes
    # over, so the ground floor is shaded by the glass instead of drawn twice.
    K.soften(body, lambda x, y, z: abs(y - PODIUM_H) < 0.0008, BEV_S)
    K.bevel(body, BEV_S, now=True)
    # a cornice where the shaft ends, and a smaller one on the crown
    trim.append(ring('cornice', w, d, CORNER, 0.005, top - 0.008, 0.008))
    if roof == 'setback':
        trim.append(ring('cornice', w * CROWN[0], d * CROWN[0], 0.01, 0.004, h - 0.006, 0.006))
    else:
        # rooftop plant: the lift overrun / air handler every flat roof carries
        trim.append(slab('plant', w * 0.44, 0.036, d * 0.44, 0.008, h))
    # the grid, on all four walls (the city is seen from both sides of the
    # hero), each pane with a sill under it
    wins = []
    for (a, half, s) in walls(w, d):
        for u in bay_offsets(2 * half):
            for y in rows(PODIUM_H + 0.03, top - 0.03):
                wins.append((a, u, y, s + 0.0012, PANE[0], PANE[1]))
                x, z = on(a, u, s + 0.002)
                trim.append(K.box('sill', (PANE[0] + 0.006, 0.004, 0.005), pos=(x, y - PANE[1] / 2 - 0.003, z), rot=(0, a, 0)))
    out = []
    body.name = body.data.name = f'block{i}_body'
    K.finish(body, 50)
    out.append((body, 'glass'))
    tr = K.join(f'block{i}_trim', trim)
    K.finish(tr, 50)
    out.append((tr, 'pale'))
    wo = K.join(f'block{i}_windows', [panes('w', wins)])
    K.finish(wo, 80)
    out.append((wo, 'mark'))
    if i in OCCUPIED:
        # one pane on a camera-facing wall, a hair proud of the rest
        rnd = make_rand(4231 + i * 17)
        facing = [sp for sp in wins if sp[0] in (0.0, math.pi / 2)]
        a, u, y, s, pw, ph = facing[min(len(facing) - 1, int(rnd() * len(facing)))]
        out.append((panes(f'block{i}_lit', [(a, u, y, s + 0.0008, pw, ph)]), 'mark'))
    return out


def main():
    K.reset()
    t0 = time.time()
    parts = [p for i, b in enumerate(BLOCKS) for p in block(i, b)]
    print(f'blocks: {len(parts)} meshes, {sum(K.tris(o) for o, _ in parts)} tris, {time.time() - t0:.1f}s')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'blocks-raw.glb')
    size = K.export(path, [o for o, _ in parts])
    print(f'exported {path} {size / 1024:.0f} KB in {time.time() - t0:.1f}s')
    if '--preview' in sys.argv:
        # the blocks on their plots round the tower
        import build_tower
        for ob, _ in parts:
            b = BLOCKS[int(ob.name[5:].split('_')[0])]
            ob.location = (b['x'], 0, b['z'])  # in the preview rig's (three) space
        s = K.preview(os.path.join(OUT, 'prev-blocks.png'), parts + build_tower.tower(), (1.25, 1.05, 2.15), (0, 0.32, 0), lens=40, res=(1200, 800))
        print(f'preview {s:.1f}s')


if __name__ == '__main__':
    main()
