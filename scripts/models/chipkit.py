# chipkit — shared bpy helpers for the chip layer's models (see README.md).
#
# Everything is authored in the SITE's space: three.js axes (Y up, +Z toward
# the viewer), chip-local units (the board is 2.05 across), y = 0.02 is the
# board's top face. Exported with export_yup=False, so coordinates land in the
# site unchanged. Transforms are baked into mesh data as parts are made, so
# every object sits at identity and its vertices are already where they belong.
#
# One bevel rule for the whole kit, which is most of what makes the parts read
# as one set: every hard edge gets a round, 2-segment bevel. On a 90° corner
# that splits the turn into 22.5° + 45° + 22.5°, so an outline threshold of 35°
# (the site's <Edges>) draws exactly one line per corner, on its ridge — and the
# fresnel rim catches the curve as a highlight.
import math
import os
import time

import bpy  # first: the module build registers bmesh & co. when it loads

import bmesh
from mathutils import Euler, Matrix, Vector

TAU = math.tau

# The bevel scale, by size class (chip units; the board is 2.05 ≈ 100 mm).
BEV_S = 0.0025  # pins, passives, lands, the smaller bodies
BEV_M = 0.005  # housings, the package substrate, the monitor


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def scene():
    return bpy.context.scene


def euler3(rx=0.0, ry=0.0, rz=0.0):
    """three.js Euler(x, y, z, 'XYZ') as a 4x4 (Blender's 'ZYX' is the same product)."""
    return Euler((rx, ry, rz), 'ZYX').to_matrix().to_4x4()


def mk(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene().collection.objects.link(ob)
    return ob


def xf(ob, pos=(0, 0, 0), rot=(0, 0, 0), scale=None):
    """Bake a three-style transform (scale, then rotate, then move) into the data."""
    M = Matrix.Translation(Vector(pos)) @ euler3(*rot)
    if scale is not None:
        M = M @ Matrix.Diagonal((*scale, 1.0))
    ob.data.transform(M)
    ob.data.update()
    return ob


def add_mod(ob, kind, **kw):
    m = ob.modifiers.new(kind.lower(), kind)
    for k, v in kw.items():
        setattr(m, k, v)
    return m


def bake(ob):
    """Apply every modifier (via the depsgraph — no operator context needed)."""
    if not ob.modifiers:
        return ob
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)
    return ob


def bevel(ob, width, seg=2, angle=30, harden=True, now=False):
    """The kit bevel. Smooth-shaded first so harden_normals can keep the flats
    flat while the rounds blend; `now` applies it on the spot."""
    me = ob.data
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    add_mod(ob, 'BEVEL', width=width, segments=seg, limit_method='ANGLE', angle_limit=math.radians(angle), profile=0.5, harden_normals=harden, miter_outer='MITER_ARC', use_clamp_overlap=True)
    if now:
        bake(ob)
    return ob


def remove(ob):
    me = ob.data
    bpy.data.objects.remove(ob)
    if me and me.users == 0:
        bpy.data.meshes.remove(me)


# ---------------------------------------------------------------- primitives


def box(name, size, pos=(0, 0, 0), rot=(0, 0, 0), bev=0.0, seg=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    ob = xf(mk(name, bm), pos, rot)
    if bev:
        bevel(ob, bev, seg)
    return ob


def rbox(name, size, r, pos=(0, 0, 0), rot=(0, 0, 0), bev=0.0, seg=6, axis='y'):
    """A box whose four edges parallel to `axis` are rounded to radius r (a
    rounded-rect extruded along the axis), plus the kit bevel on the rest."""
    sx, sy, sz = size
    if axis == 'y':
        w, d, h = sx, sz, sy
    elif axis == 'z':
        w, d, h = sx, sy, sz
    else:
        w, d, h = sz, sy, sx
    pts = rrect_pts(w, d, r, seg)
    ob = prism(name, pts, h)
    # prism is built in XZ, extruded along Y; turn it onto the requested axis
    if axis == 'z':
        xf(ob, rot=(math.pi / 2, 0, 0))
    elif axis == 'x':
        xf(ob, rot=(0, 0, -math.pi / 2))
    xf(ob, pos, rot)
    if bev:
        bevel(ob, bev, 2)
    return ob


def rrect_pts(w, d, r, seg=6):
    """Rounded-rectangle outline in the XZ plane, counter-clockwise from above."""
    r = max(1e-5, min(r, w / 2 - 1e-5, d / 2 - 1e-5))
    hw, hd = w / 2 - r, d / 2 - r
    pts = []
    for cx, cz, a0 in ((hw, hd, 0), (-hw, hd, math.pi / 2), (-hw, -hd, math.pi), (hw, -hd, 1.5 * math.pi)):
        for i in range(seg + 1):
            a = a0 + (i / seg) * (math.pi / 2)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def prism(name, pts, h, y0=None):
    """Extrude a closed XZ outline along +Y, centred on y = 0 unless y0 given."""
    bm = bmesh.new()
    lo = -h / 2 if y0 is None else y0
    bot = [bm.verts.new((x, lo, z)) for x, z in pts]
    top = [bm.verts.new((x, lo + h, z)) for x, z in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bm.faces.new(list(reversed(bot)))
    bm.faces.new(top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mk(name, bm)


def prism_ax(name, pts, lo, hi, axis='y'):
    """Extrude a closed 2D outline between lo and hi along an axis. The outline's
    (u, v) are the other two axes in order: y → (x, z), x → (y, z), z → (x, y)."""
    def P(u, v, w):
        if axis == 'y':
            return (u, w, v)
        if axis == 'x':
            return (w, u, v)
        return (u, v, w)
    bm = bmesh.new()
    a = [bm.verts.new(P(u, v, lo)) for u, v in pts]
    b = [bm.verts.new(P(u, v, hi)) for u, v in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(list(reversed(a)))
    bm.faces.new(b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mk(name, bm)


def knurl(name, r, depth, lo, hi, n=36, axis='z', flat=0.5):
    """A knurled / ribbed ring: n flat-topped teeth round an axis."""
    pts = []
    for i in range(n):
        a0 = TAU * i / n
        w = TAU / n
        for f, rr in ((0.0, r - depth), (0.5 - flat / 2, r), (0.5 + flat / 2, r), (1.0 - 1e-3, r - depth)):
            a = a0 + f * w
            pts.append((rr * math.cos(a), rr * math.sin(a)))
    return prism_ax(name, pts, lo, hi, axis)


def strip(name, path, thick, lo, hi, axis='x'):
    """A bent flat strip (a gull-wing lead, a bracket): a 2D polyline in the
    plane across `axis`, given thickness, swept between lo and hi."""
    left, right = [], []
    P = [Vector(p) for p in path]
    for i, p in enumerate(P):
        if i == 0:
            d = (P[1] - P[0]).normalized()
            n = Vector((-d.y, d.x))
            off = n * (thick / 2)
        elif i == len(P) - 1:
            d = (P[-1] - P[-2]).normalized()
            n = Vector((-d.y, d.x))
            off = n * (thick / 2)
        else:
            d0 = (P[i] - P[i - 1]).normalized()
            d1 = (P[i + 1] - P[i]).normalized()
            n0 = Vector((-d0.y, d0.x))
            n1 = Vector((-d1.y, d1.x))
            m = (n0 + n1).normalized()
            off = m * (thick / 2) / max(0.3, m.dot(n0))
        left.append(tuple(p + off))
        right.append(tuple(p - off))
    return prism_ax(name, left + list(reversed(right)), lo, hi, axis)


def cyl(name, r, h, pos=(0, 0, 0), rot=(0, 0, 0), seg=32, r2=None, bev=0.0, cap=True):
    """A cylinder (or frustum, r → r2 bottom → top) along +Y, centred."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-math.pi / 2, 3, 'X'))
    ob = xf(mk(name, bm), pos, rot)
    if bev:
        bevel(ob, bev, 2)
    return ob


def lathe(name, prof, seg=48, pos=(0, 0, 0), rot=(0, 0, 0), closed=False, phase=0.0):
    """Turn a (radius, y) profile about +Y. r == 0 ends collapse to a pole.
    `closed` joins the last ring back to the first (a profile drawn as a loop)."""
    bm = bmesh.new()
    rings = []
    for r, y in prof:
        if r <= 1e-9:
            rings.append([bm.verts.new((0.0, y, 0.0))])
        else:
            rings.append([bm.verts.new((r * math.sin(TAU * i / seg + phase), y, r * math.cos(TAU * i / seg + phase))) for i in range(seg)])
    pairs = list(zip(rings, rings[1:]))
    if closed:
        pairs.append((rings[-1], rings[0]))
    for a, b in pairs:
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            for i in range(seg):
                bm.faces.new((a[0], b[(i + 1) % seg], b[i]))
        elif len(b) == 1:
            for i in range(seg):
                bm.faces.new((a[i], a[(i + 1) % seg], b[0]))
        else:
            for i in range(seg):
                bm.faces.new((a[i], a[(i + 1) % seg], b[(i + 1) % seg], b[i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return xf(mk(name, bm), pos, rot)


def sphere(name, r, pos=(0, 0, 0), seg=12, rings=8, scale=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    return xf(mk(name, bm), pos, (0, 0, 0), scale)


# ---------------------------------------------------------------- booleans


def cut(target, *cutters, solver='EXACT', keep=False):
    """Subtract cutters from target (applied immediately)."""
    for c in cutters:
        bake(c)
        add_mod(target, 'BOOLEAN', operation='DIFFERENCE', object=c, solver=solver)
        bake(target)
        if not keep:
            remove(c)
    return target


def union(target, *others, solver='EXACT'):
    for o in others:
        bake(o)
        add_mod(target, 'BOOLEAN', operation='UNION', object=o, solver=solver)
        bake(target)
        remove(o)
    return target


def join(name, obs):
    """Merge objects into one mesh object (no boolean — shells just combine).
    Through the operator, because it carries custom (hardened) normals across."""
    obs = [o for o in obs if o is not None]
    for o in obs:
        bake(o)
    if len(obs) == 1:
        obs[0].name = name
        obs[0].data.name = name
        return obs[0]
    vl = bpy.context.view_layer
    for o in scene().objects:
        o.select_set(False)
    for o in obs:
        o.select_set(True)
    vl.objects.active = obs[0]
    bpy.ops.object.join()
    ob = vl.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def split(ob, name_a, name_b, pred):
    """Split a mesh's faces in two objects by a predicate on each face's centre
    (three space) — a two-tone part that still shares one seamless surface."""
    bake(ob)
    out = []
    for name, want in ((name_a, True), (name_b, False)):
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        kill = [f for f in bm.faces if bool(pred(f.calc_center_median())) != want]
        bmesh.ops.delete(bm, geom=kill, context='FACES')
        out.append(mk(name, bm))
    remove(ob)
    return out


def rounded_profile(pts, radii):
    """A 2D polyline [(a, b), ...] with each interior corner i replaced by a
    two-segment arc of radius radii[i] (0 = keep sharp). Two segments split a
    turn θ into θ/4, θ/2, θ/4 — the kit's bevel rule, so a 90° corner draws one
    outline on its ridge and the 22.5° steps stay smooth."""
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        r = radii[i] if i < len(radii) else 0
        P = Vector(pts[i])
        if not r:
            out.append(pts[i])
            continue
        d1 = (P - Vector(pts[i - 1])).normalized()
        d2 = (Vector(pts[i + 1]) - P).normalized()
        cosang = max(-1.0, min(1.0, d1.dot(d2)))
        theta = math.acos(cosang)  # turning angle
        if theta < 1e-4:
            out.append(pts[i])
            continue
        t = r * math.tan(theta / 2)
        A = P - d1 * t
        B = P + d2 * t
        bis = (d2 - d1).normalized()  # points into the turn
        C = P + bis * (r / math.cos(theta / 2))
        M = C + (P - C).normalized() * r
        out += [tuple(A), tuple(M), tuple(B)]
    out.append(pts[-1])
    return out


# ---------------------------------------------------------------- finishing


def finish(ob, sharp=50):
    """Smooth-shade, keeping edges sharper than `sharp` degrees crisp. Bevels
    turn in 22.5°/45° steps, so they stay smooth; an unbevelled 90° stays hard."""
    bake(ob)
    me = ob.data
    for p in me.polygons:
        p.use_smooth = True
    bm = bmesh.new()
    bm.from_mesh(me)
    lim = math.radians(sharp)
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0) > lim:
            e.smooth = False
    bm.to_mesh(me)
    bm.free()
    me.update()
    return ob


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def export(path, obs):
    for o in scene().objects:
        o.select_set(False)
    for o in obs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_yup=False,
        export_apply=True,
        export_normals=True,
        export_texcoords=False,
        export_tangents=False,
        export_materials='NONE',
        export_vertex_color='NONE',
        export_extras=False,
        use_mesh_edges=False,
        use_mesh_vertices=False,
    )
    return os.path.getsize(path)


# ---------------------------------------------------------------- previews

TINT = {
    'pale': (0.72, 0.76, 0.80),
    'glass': (0.42, 0.47, 0.53),
    'deep': (0.16, 0.19, 0.23),
    'metal': (0.85, 0.87, 0.9),
    'mark': (0.62, 0.95, 0.35),
}


def clay(tint):
    name = f'clay_{tint}'
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*TINT[tint], 1)
    b.inputs['Roughness'].default_value = 0.35 if tint == 'metal' else 0.55
    b.inputs['Metallic'].default_value = 0.8 if tint == 'metal' else 0.0
    if tint == 'mark':
        b.inputs['Emission Color'].default_value = (*TINT['mark'], 1)
        b.inputs['Emission Strength'].default_value = 1.5
    return m


def preview(path, obs_tints, cam, target, lens=50, res=(1000, 700), samples=48, floor=True):
    """Clay render. Objects are Y-up; a parent turns the lot Z-up for Blender."""
    rig = bpy.data.objects.new('rig', None)
    scene().collection.objects.link(rig)
    rig.rotation_euler = (math.pi / 2, 0, 0)
    for ob, tint in obs_tints:
        ob.data.materials.clear()
        ob.data.materials.append(clay(tint))
        ob.parent = rig
    if floor:
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6)
        fl = mk('floor', bm)
        fl.data.materials.append(clay('deep'))
        fl.location = (0, 0, -0.0005)
    w = bpy.data.worlds.new('W')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.05, 0.06, 0.075, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    scene().world = w
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    scene().collection.objects.link(sun)
    sun.data.energy = 3.0
    sun.data.angle = math.radians(8)
    sun.rotation_euler = (math.radians(48), math.radians(8), math.radians(-35))
    fill = bpy.data.objects.new('Fill', bpy.data.lights.new('Fill', 'AREA'))
    scene().collection.objects.link(fill)
    fill.data.energy = 40
    fill.data.size = 3
    fill.location = (-2.2, -2.5, 2.4)
    fill.rotation_euler = (math.radians(50), 0, math.radians(-40))
    c = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    scene().collection.objects.link(c)
    c.data.lens = lens
    c.data.clip_start = 0.01
    # given in three space → Blender (x, -z, y)
    c.location = (cam[0], -cam[2], cam[1])
    aim = bpy.data.objects.new('Aim', None)
    scene().collection.objects.link(aim)
    aim.location = (target[0], -target[2], target[1])
    tr = c.constraints.new('TRACK_TO')
    tr.target = aim
    tr.track_axis = 'TRACK_NEGATIVE_Z'
    tr.up_axis = 'UP_Y'
    s = scene()
    s.camera = c
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.cycles.samples = samples
    try:
        s.cycles.use_denoising = True
        s.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        pass
    s.render.resolution_x, s.render.resolution_y = res
    s.render.resolution_percentage = 100
    s.render.filepath = path
    s.view_settings.view_transform = 'AgX' if 'AgX' in [v.identifier for v in s.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
    t = time.time()
    bpy.ops.render.render(write_still=True)
    return time.time() - t
