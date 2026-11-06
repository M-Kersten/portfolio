# creature_kit — the park creatures' shapes and paint (build_creatures.py).
#
# The creatures are soft toys, not the kit's bevelled hard-surface parts:
# metaball bodies, skinned tubes for limbs and tails, curve wires for
# whiskers, glossy cartoon eyes pressed into the surface where a ray from
# outside lands on it. Each part is painted rather than given a material: a
# Paint says what colour a corner is from where it sits (its position, normal,
# UV), and paint() bakes that into a corner colour attribute the site reads as
# vertex colours. The colour's alpha says how much the part glows.
#
# Authored in toy units (a creature is a few units tall) in three.js axes, Y up,
# facing +X; build_creatures.py turns, centres and scales each one into the
# park's own units on export.
import math

import modelkit as K  # first: it imports bpy

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree

D = bpy.data
TAU = math.tau
MB = 0.574  # a metaball's surface lands at this fraction of its radius (stiffness 2, threshold 0.6)
# the view the creatures were designed from: up a little and off to the right;
# the site turns each one to show this side to the camera
CAM = Vector((0.62, 0.45, 0.75))


def lin(h):
    """sRGB hex → linear RGB."""
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(srgb_to_lin(v) for v in c)


def srgb_to_lin(v):
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def ramp(stops, f):
    """Linear colour ramp: stops are (position, linear rgb), in order."""
    if f <= stops[0][0]:
        return stops[0][1]
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        if f <= p1:
            return mix(c0, c1, (f - p0) / max(1e-6, p1 - p0))
    return stops[-1][1]


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / max(1e-6, b - a)))
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------- paint

class Paint:
    """What colour a corner is. `faceted` paints each face whole, from its
    centre (crisp pixels and checks) instead of corner by corner."""
    faceted = False
    glow = 0.0

    def rgb(self, co, no, uv):
        raise NotImplementedError

    def at(self, co, no, uv):
        return (*self.rgb(co, no, uv), self.glow)


class Flat(Paint):
    def __init__(self, col, glow=0.0):
        self.c = lin(col)
        self.glow = glow

    def rgb(self, co, no, uv):
        return self.c


class Ramp(Paint):
    """Two tones by which way the surface faces: dot(normal, axis) from -1..1
    mapped over the two stops (a belly under a back, a paler underside)."""
    def __init__(self, cols, axis=(0, 1, 0), stops=(0.35, 0.65)):
        self.c0, self.c1 = lin(cols[0]), lin(cols[1])
        self.axis = Vector(axis)
        self.s = stops

    def rgb(self, co, no, uv):
        f = (no.dot(self.axis) + 1) / 2
        return mix(self.c0, self.c1, min(1.0, max(0.0, (f - self.s[0]) / max(1e-6, self.s[1] - self.s[0]))))


class Bands(Paint):
    """Soft bands across Y, a little wavy (a gas giant's)."""
    def __init__(self, stops, period=0.75, wave=0.06):
        self.stops = [(p, lin(c)) for p, c in stops]
        self.period = period
        self.wave = wave

    def rgb(self, co, no, uv):
        y = co.y + self.wave * math.sin(co.x * 2.3 + co.z * 1.7)
        return ramp(self.stops, 0.5 + 0.5 * math.sin(TAU * y / self.period - math.pi / 2))


def _hash(i, j, k):
    h = (i * 73856093) ^ (j * 19349663) ^ (k * 83492791)
    h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFF
    return (h & 0xFFFF) / 65536.0


class Pixels(Paint):
    """Camouflage in square pixels (cells of a grid in space, each a shade
    picked at random), fading to a plain belly by which way it faces."""
    faceted = True

    def __init__(self, shades, belly, axis=(0, -1, 0), stops=(0.4, 0.62), cell=0.2):
        self.shades = [(p, lin(c)) for p, c in shades]
        self.belly = lin(belly)
        self.axis = Vector(axis)
        self.s = stops
        self.cell = cell

    def rgb(self, co, no, uv):
        i, j, k = (int(math.floor(v / self.cell)) for v in co)
        f = _hash(i, j, k)
        shade = self.shades[0][1]
        for p, c in self.shades:
            if f >= p:
                shade = c
        b = smoothstep(self.s[0], self.s[1], (no.dot(self.axis) + 1) / 2)
        return mix(shade, self.belly, b)


class YBands(Paint):
    """A colour with bands across it at heights (fractions of y0..y1): a
    high-vis vest's reflective stripes, a traffic cone's."""
    faceted = True

    def __init__(self, y0, y1, base, band, bands):
        self.y0, self.y1 = y0, y1
        self.base, self.band = lin(base), lin(band)
        self.bands = bands

    def rgb(self, co, no, uv):
        f = (co.y - self.y0) / (self.y1 - self.y0)
        return self.band if any(a <= f < b for a, b in self.bands) else self.base


class Checker(Paint):
    """Black and white checks across the UVs (a chequered flag)."""
    faceted = True

    def __init__(self, n=4):
        self.n = n
        self.w, self.k = lin('#f4f4f0'), lin('#18191c')

    def rgb(self, co, no, uv):
        if uv is None:
            return self.w
        return self.w if (int(uv[0] * self.n) + int(uv[1] * self.n)) % 2 == 0 else self.k


PAINT = {}  # object name → its Paint


def put(ob, paint):
    PAINT[ob.name] = paint
    return ob


def paint(ob):
    """Bake the object's Paint into its corner colours ('Col', active)."""
    p = PAINT.get(ob.name) or Flat('#808080')
    me = ob.data
    for a in list(me.color_attributes):
        me.color_attributes.remove(a)
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    uvl = me.uv_layers.active.data if me.uv_layers else None
    vs = me.vertices
    loops = me.loops
    data = col.data
    for poly in me.polygons:
        if p.faceted:
            uv = None
            if uvl:
                uv = [sum(uvl[li].uv[0] for li in poly.loop_indices) / poly.loop_total, sum(uvl[li].uv[1] for li in poly.loop_indices) / poly.loop_total]
            c = p.at(poly.center, poly.normal, uv)
            for li in poly.loop_indices:
                data[li].color = c
        else:
            for li in poly.loop_indices:
                v = vs[loops[li].vertex_index]
                data[li].color = p.at(v.co, v.normal, uvl[li].uv if uvl else None)
    me.color_attributes.active_color = col
    return ob


# --------------------------------------------------------------- shapes

def smooth(ob):
    me = ob.data
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.update()
    return ob


def xform(obs, M):
    for o in obs:
        o.data.transform(M)
        o.data.update()
    return obs


def rot_about(axis, angle, pivot=(0, 0, 0)):
    p = Vector(pivot)
    return Matrix.Translation(p) @ Matrix.Rotation(angle, 4, axis) @ Matrix.Translation(-p)


def basis(a, b, c, t):
    """The 4×4 whose columns are a, b, c (scaled axes) and t (its origin)."""
    return Matrix(((a[0], b[0], c[0], t[0]), (a[1], b[1], c[1], t[1]), (a[2], b[2], c[2], t[2]), (0, 0, 0, 1)))


def facing(f, up=(0, 1, 0)):
    """Forward, up and right-hand side for something facing f."""
    f = Vector(f).normalized()
    s = f.cross(Vector(up)).normalized()
    return f, s.cross(f).normalized(), s


def toward(yaw, pitch, f, u, s):
    """A direction yaw (toward the right side) and pitch (up) off forward."""
    return (f * (math.cos(pitch) * math.cos(yaw)) + s * (math.cos(pitch) * math.sin(yaw)) + u * math.sin(pitch)).normalized()


TURN = {'az': 0.0}


def cam_az():
    return math.atan2(CAM.z, CAM.x)


def turn_to(parts, azimuth):
    """Turn what faces +X to face `azimuth` (radians from +X toward +Z), as it
    was posed for its portrait; the export turns it back to face +X."""
    TURN['az'] = azimuth
    return xform(parts, Matrix.Rotation(-azimuth, 4, 'Y'))


def ball(co, R, s=2.0):
    return {'type': 'BALL', 'co': tuple(co), 'r': R / MB, 's': s}


def ell(co, R, size, rot=(0, 0, 0)):
    return {'type': 'ELLIPSOID', 'co': tuple(co), 'r': R / MB, 'size': size, 'rot': rot}


def ell_along(co, R, d, length=1.5, thick=0.8):
    """A metaball ellipsoid stretched along direction d."""
    q = Vector((1, 0, 0)).rotation_difference(Vector(d).normalized())
    return {'type': 'ELLIPSOID', 'co': tuple(co), 'r': R / MB, 'size': (length, thick, thick), 'quat': q}


def blobs(name, elems, res=0.05, neg=()):
    """Metaballs, meshed: soft unions of balls and ellipsoids."""
    mb = D.metaballs.new(name + '_mb')
    mb.resolution = res
    mb.render_resolution = res
    mb.threshold = 0.6
    ob = D.objects.new(name + '_mb', mb)
    K.scene().collection.objects.link(ob)
    for e in list(elems) + [dict(x, neg=True) for x in neg]:
        el = mb.elements.new(type=e['type'])
        el.co = e['co']
        el.radius = e['r']
        el.stiffness = e.get('s', 2.0)
        if 'size' in e:
            el.size_x, el.size_y, el.size_z = e['size']
        if 'quat' in e:
            el.rotation = e['quat']
        elif 'rot' in e:
            el.rotation = Euler(e['rot'], 'XYZ').to_quaternion()
        if e.get('neg'):
            el.use_negative = True
    dg = bpy.context.evaluated_depsgraph_get()
    me = D.meshes.new_from_object(ob.evaluated_get(dg))
    D.objects.remove(ob)
    D.metaballs.remove(mb)
    out = D.objects.new(name, me)
    K.scene().collection.objects.link(out)
    return smooth(out)


def skin(name, pts, radii, sub=2, flat=None):
    """A smooth tube through the points, its radius per point."""
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    for a, b in zip(vs, vs[1:]):
        bm.edges.new((a, b))
    me = D.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = D.objects.new(name, me)
    K.scene().collection.objects.link(ob)
    ob.modifiers.new('skin', 'SKIN')
    for i, sv in enumerate(me.skin_vertices[0].data):
        r = radii[i] if isinstance(radii, (list, tuple)) else radii
        sv.radius = (r, r * (flat or 1.0))
    me.skin_vertices[0].data[0].use_root = True
    sm = ob.modifiers.new('sub', 'SUBSURF')
    sm.levels = sub
    sm.render_levels = sub
    K.bake(ob)
    return smooth(ob)


def wire(name, pts, r, res=6):
    """A round wire along a smooth path (feelers, whiskers, a smile)."""
    cu = D.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = 2
    cu.resolution_u = res
    sp = cu.splines.new('NURBS')
    sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts):
        p.co = (*c, 1)
    sp.use_endpoint_u = True
    sp.order_u = min(4, len(pts))
    ob = D.objects.new(name, cu)
    K.scene().collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = D.meshes.new_from_object(ob.evaluated_get(dg))
    D.objects.remove(ob)
    out = D.objects.new(name, me)
    K.scene().collection.objects.link(out)
    return smooth(out)


def torus(name, R, r, pos=(0, 0, 0), rot=(0, 0, 0), seg=48, ring=12, arc=TAU, scale=None):
    """A ring about +Y (lying flat), or just an arc of it."""
    bm = bmesh.new()
    n = seg if arc >= TAU - 1e-6 else seg + 1
    rings = []
    for i in range(n):
        a = arc * i / seg
        c = Vector((R * math.cos(a), 0, R * math.sin(a)))
        out = Vector((math.cos(a), 0, math.sin(a)))
        rings.append([bm.verts.new(c + out * (r * math.cos(t)) + Vector((0, r * math.sin(t), 0))) for t in [TAU * k / ring for k in range(ring)]])
    pairs = list(zip(rings, rings[1:]))
    if arc >= TAU - 1e-6:
        pairs.append((rings[-1], rings[0]))
    for A, B in pairs:
        for k in range(ring):
            bm.faces.new((A[k], A[(k + 1) % ring], B[(k + 1) % ring], B[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = K.xf(K.mk(name, bm), pos, rot, scale)
    return smooth(ob)


def plane(name, w, h, sub=1):
    """A w × h plane in X/Y facing +Z, UVs 0–1."""
    bm = bmesh.new()
    bm.loops.layers.uv.new('UVMap')  # create_grid only fills a UV layer that's already there
    bmesh.ops.create_grid(bm, x_segments=sub, y_segments=sub, size=0.5, calc_uvs=True)
    bmesh.ops.scale(bm, vec=(w, h, 1), verts=bm.verts)
    return K.mk(name, bm)


def annulus(name, r0, r1, t=0.025, seg=96):
    return smooth(K.lathe(name, [(r0, -t), (r1, -t), (r1, t), (r0, t)], seg=seg, closed=True))


def catmull(pts, n=12):
    P = [Vector(p) for p in pts]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-2])
    return out


# ------------------------------------------------------ the surface, a face

def surface(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    t = BVHTree.FromBMesh(bm)
    bm.free()
    return t


def land(tree, centre, d, reach=6.0):
    """Where a ray from outside, aimed back at `centre` along -d, meets the
    surface: (point, normal)."""
    d = Vector(d).normalized()
    loc, nrm, _, _ = tree.ray_cast(Vector(centre) + d * reach, -d)
    if loc is None:
        raise RuntimeError(f'no surface toward {tuple(d)} from {tuple(centre)}')
    return loc, nrm


EYE = '#12141b'
CATCH = Flat('#ffffff', glow=0.3)


def toon_eye(name, at, n, up, r, h=1.3, depth=0.42):
    """A big glossy cartoon eye set into a surface at `at`, facing n: a dark
    oval taller than wide, a white catchlight high on the left and a small
    glint low on the right (the same for every eye, as from one light)."""
    n = Vector(n).normalized()
    upv = Vector(up)
    upv = (upv - n * upv.dot(n)).normalized()
    side = upv.cross(n).normalized()  # the viewer's right
    c = Vector(at) - n * (r * depth * 0.4)
    eye = K.sphere(name, 1.0, (0, 0, 0), 24, 14)
    eye.data.transform(basis(side * r, upv * (r * h), n * (r * depth), c))
    out = [put(smooth(eye), Flat(EYE))]
    for k, (x, y, rr) in enumerate([(-0.33, 0.4, 0.3), (0.3, -0.36, 0.13)]):
        z = math.sqrt(max(0.05, 1 - x * x - y * y))
        p = c + side * (r * x) + upv * (r * h * y) + n * (r * depth * z * 1.06)
        g = K.sphere(f'{name}_glint{k}', 1.0, (0, 0, 0), 8, 5)
        g.data.transform(basis(side * (r * rr), upv * (r * rr * 1.1), n * (r * rr * 0.3), p))
        out.append(put(smooth(g), CATCH))
    return out


def patch(name, at, n, up, w, h, depth, paint_, sink=0.4):
    """A flattened round pressed into a surface: a cheek, an eye's white, a tummy."""
    n = Vector(n).normalized()
    upv = Vector(up)
    upv = (upv - n * upv.dot(n)).normalized()
    side = upv.cross(n).normalized()
    ob = K.sphere(name, 1.0, (0, 0, 0), 24, 14)
    ob.data.transform(basis(side * w, upv * h, n * depth, Vector(at) - n * (depth * sink)))
    return put(smooth(ob), paint_)


def smile_on(name, tree, centre, dirs, r, paint_, lift=0.004):
    """A mouth line laid on the surface through the directions given."""
    pts = []
    for d in dirs:
        p, nn = land(tree, centre, d)
        pts.append(tuple(p + nn * lift))
    return put(wire(name, pts, r), paint_)


def ring_on(name, tree, centre, tilt, r, paint_, n=40, lift=0.012):
    """A closed band laid round a body (a collar), tipped forward by `tilt`."""
    pts = []
    for i in range(n + 1):
        a = TAU * i / n
        p, nn = land(tree, centre, Vector((math.cos(a), -tilt * math.cos(a), math.sin(a))))
        pts.append(tuple(p + nn * lift))
    return put(wire(name, pts, r, res=4), paint_)


BLUSH = Flat('#ff9aa6')
INK = Flat('#2a1c1e')
