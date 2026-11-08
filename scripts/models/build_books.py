# The books on the Room's bookcase (the Zwijsen shelf), built as real
# hardcovers rather than rounded boxes: two cover boards standing a little
# proud of the page block at the top, bottom and fore-edge, a rounded spine
# with a groove where it meets each board, and two raised bands across the
# spine. One book, at a typical size; the site places it along the shelves at
# each book's own size. And the Zwijsen picture book's own parts, which the
# site hinges open. Exported as one glb of named parts for the site
# (src/scene/maquette/room.tsx, Bookcase and OpenBook). See README.md to rebuild.
#
# Coordinates (see modelkit.py), Y up:
#   a shelved book, standing upright and centred on the origin: its thickness
#   along X (T), its height along Y (H), its depth along Z (D), the spine
#   facing +Z (the room)
#     book_cover  the boards and the spine, as one shell
#     book_pages  the page block, set in between them
#     book_bands  the two raised bands across the spine
#   one half of the Zwijsen book, lying open, in its hinge's frame: the spine
#   on the origin, the half running out along +X, its cover board's middle on
#   y 0 and the page block on top of it (the site mirrors it for the other half)
#     zw_board    the cover board, its outer corners rounded
#     zw_block    the half's page block
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import modelkit as K  # noqa: E402  (imports bpy first)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

T, H, D = 0.05, 0.17, 0.17  # the shelved book: thickness, height, depth
BOARD = 0.0026  # a cover board's thickness
SQUARE = 0.0032  # how far the boards stand proud of the pages (a binder's "square")
BULGE = 0.011  # how far the rounded spine stands out past the boards' front edge
GROOVE = 0.0011  # the joint's groove, where the spine meets each board
SPINE_Z = D / 2 - BULGE  # where the boards end and the spine's curve begins
ARC = 10  # points along the spine's curve

# the Zwijsen picture book (room.tsx, BOOK_*): one half's width, the board's
# thickness, the page depth (spine length), and the page block's thickness.
# A picture book's own proportions, its pages three wide to four high (it was
# a tall, narrow one, and a picture had to squeeze into each page).
ZW_W, ZW_T, ZW_H, ZW_PT = 0.135, 0.011, 0.18, 0.009
ZW_SQUARE = 0.004  # how far the board stands proud of the pages, top, bottom and fore-edge


def spine_outline(r_out):
    """The spine's curve from the right board round to the left, as (x, z):
    half an ellipse, x half-width r_out, standing BULGE (+ the shell's extra
    width) out in front of SPINE_Z."""
    pts = []
    for i in range(ARC + 1):
        a = -math.pi / 2 + math.pi * i / ARC  # right (+x) round to left
        pts.append((-r_out * math.sin(a), SPINE_Z + (BULGE + (r_out - T / 2)) * math.cos(a)))
    return pts


def cover():
    o = T / 2
    i = T / 2 - BOARD
    back = -D / 2
    # outside: down the right board from the fore-edge to the joint, its
    # groove, round the spine, the left joint's groove, back along the left
    # board; then inside, the same way back
    outer = [(o, back), (o, SPINE_Z - 0.006), (o - GROOVE, SPINE_Z - 0.003), (o, SPINE_Z)]
    outer += spine_outline(o)[1:-1]
    outer += [(-o, SPINE_Z), (-o + GROOVE, SPINE_Z - 0.003), (-o, SPINE_Z - 0.006), (-o, back)]
    inner = [(-i, back), (-i, SPINE_Z)] + [(x * i / o, SPINE_Z + (z - SPINE_Z) * (BULGE - BOARD) / BULGE) for x, z in reversed(spine_outline(o)[1:-1])] + [(i, SPINE_Z), (i, back)]
    # the prism wants counter-clockwise from above (x, z); the loop runs
    # outside round and back inside
    ob = K.prism('book_cover', list(reversed(outer + inner)), H)
    K.bevel(ob, 0.0008, now=True)
    return K.finish(ob, 35)


def pages():
    w = T - 2 * BOARD - 0.0004
    ob = K.box('book_pages', (w, H - 2 * SQUARE, SPINE_Z + D / 2 - SQUARE + 0.004), pos=(0, 0, (SPINE_Z + 0.004 - D / 2 + SQUARE) / 2))
    return K.finish(ob, 35)


def bands():
    out = []
    for y in (H / 2 - 0.022, -H / 2 + 0.026):
        pts = spine_outline(T / 2 + 0.0012)
        inner = [(x * (T / 2 - 0.001) / (T / 2 + 0.0012), SPINE_Z + (z - SPINE_Z) * 0.6) for x, z in reversed(pts)]
        b = K.prism('band', list(reversed(pts + inner)), 0.0045, y0=y - 0.00225)
        out.append(b)
    return K.finish(K.join('book_bands', out), 35)


def zw_board():
    r = 0.012
    pts = [(0, -ZW_H / 2)]
    for cx, cz, a0 in ((ZW_W - r, -ZW_H / 2 + r, -math.pi / 2), (ZW_W - r, ZW_H / 2 - r, 0)):
        for k in range(7):
            a = a0 + (math.pi / 2) * k / 6
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    pts.append((0, ZW_H / 2))
    ob = K.prism('zw_board', pts, ZW_T)
    K.bevel(ob, 0.0018, now=True)
    return K.finish(ob, 35)


def zw_block():
    # right into the gutter, so the two halves' pages meet at the fold
    r = 0.003
    x0, x1 = 0.0012, ZW_W - ZW_SQUARE
    h = ZW_H - 2 * ZW_SQUARE
    pts = [(x0, -h / 2)]
    for cx, cz, a0 in ((x1 - r, -h / 2 + r, -math.pi / 2), (x1 - r, h / 2 - r, 0)):
        for k in range(5):
            a = a0 + (math.pi / 2) * k / 4
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    pts.append((x0, h / 2))
    ob = K.prism('zw_block', pts, ZW_PT, y0=ZW_T / 2)
    K.bevel(ob, 0.0008, now=True)
    return K.finish(ob, 35)


def main():
    K.reset()
    t0 = time.time()
    parts = [(cover(), 'deep'), (pages(), 'pale'), (bands(), 'pale'), (zw_board(), 'deep'), (zw_block(), 'pale')]
    for ob, _ in parts:
        print(f'  {ob.name:10s} {K.tris(ob):6d} tris')
    print(f'books: {len(parts)} meshes, {sum(K.tris(o) for o, _ in parts)} tris, {time.time() - t0:.1f}s')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'books-raw.glb')
    size = K.export(path, [o for o, _ in parts])
    print(f'exported {path} {size / 1024:.0f} KB')
    if '--preview' in sys.argv:
        # a few books in a row, one leaning, and the Zwijsen half beside them
        import bpy
        shelf = []
        for n, (dx, s, lean) in enumerate(((0.0, 1.0, 0), (0.055, 1.08, 0), (0.105, 0.94, 0), (0.17, 1.0, -0.2))):
            for ob, tint in parts[:3]:
                c = ob.copy()
                c.data = ob.data.copy()
                bpy.context.collection.objects.link(c)
                c.data.transform(K.Matrix.Diagonal((1, s, 1, 1)))
                c.data.transform(K.Matrix.Rotation(lean, 4, 'Z'))
                c.data.transform(K.Matrix.Translation((dx, H * s / 2, 0)))
                shelf.append((c, tint))
        for ob, _ in parts[:3]:
            ob.hide_render = True
        for ob, _ in parts[3:]:
            ob.data.transform(K.Matrix.Translation((0.26, 0.02, 0)))
        s = K.preview(os.path.join(OUT, 'prev-books.png'), shelf + parts[3:], (0.2, 0.26, 0.5), (0.13, 0.08, 0), lens=50)
        print(f'preview {s:.1f}s')


if __name__ == '__main__':
    main()
