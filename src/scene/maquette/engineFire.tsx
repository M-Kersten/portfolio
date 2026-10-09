// The launch's fire (launchSite.tsx drives it every frame).
//
//   Plume       a stage's exhaust, all its engines together: a translucent
//               flame round a white-hot core with Mach diamonds in it, which
//               flares out into a wide bell as the air thins
//   Nozzles     one glow and one short flame per engine, each on its own
//               thrust level, so the startup lights ring by ring and MECO
//               leaves the centre three burning
//   RingJets    hot staging: the ship's exhaust pouring out sideways through
//               the eighteen vents in the ring
//   VaporCone   the condensation collar round the stack at Max-Q
//   Frost       the white frost on the cryogenic tanks, down to the level of
//               the propellant inside
//
// All of it additive and untouched by tone mapping, so it can run hotter than
// white and the launch's bloom (Stage.tsx) picks it up.
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { AdditiveBlending, Color, CylinderGeometry, DoubleSide, InstancedBufferAttribute, Matrix4, ShaderMaterial, Vector3, type InstancedMesh, type Mesh } from 'three';

/** Exhaust colours: a methalox flame is a translucent orange-pink round a
 *  near-white core. Scaled past 1 so the bloom catches them. */
const FLAME = new Color('#ff9a5c').multiplyScalar(1.6);
const CORE = new Color('#fff1dc').multiplyScalar(2.6);
const GLOW = new Color('#ffc58f').multiplyScalar(2.2);

const FIRE_VERT = /* glsl */ `
uniform float uFlare;
varying float vY;
varying float vFace;
void main() {
  vY = uv.y;
  // flare toward the tip as the air thins: the column becomes a bell
  vec3 p = position;
  p.xz *= mix(uFlare, 1.0, uv.y);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vFace = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`;

const PLUME_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uOpacity;
uniform float uDiamonds;
uniform float uTime;
varying float vY;
varying float vFace;
void main() {
  float y = 1.0 - vY;               // 0 at the nozzles, 1 at the tip
  float body = pow(vY, 1.6);        // thins out toward the tip
  // shock diamonds: bright bands down the first part of the core, at sea level
  float band = pow(0.5 + 0.5 * cos(y * 62.0), 7.0) * smoothstep(0.55, 0.05, y) * uDiamonds;
  // never the same flame two frames running
  float flick = 0.86 + 0.14 * sin(uTime * 41.0 + y * 23.0) * sin(uTime * 17.0 - y * 9.0);
  vec3 col = mix(uColor, uCore, clamp(vFace * vFace * 0.8 + band, 0.0, 1.0));
  float a = uOpacity * (body * (0.18 + 0.82 * vFace) * flick + band * 0.6 * vFace);
  gl_FragColor = vec4(col, a);
}`;

const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFace;
void main() {
  gl_FragColor = vec4(uColor, uOpacity * vFace * vFace * vFace);
}`;

/** The ball-shaped glow: bright where you look into it, gone at its rim. */
export function glowMat(color: Color, opacity: number) {
  return new ShaderMaterial({
    vertexShader: FIRE_VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: { uColor: { value: color.clone() }, uOpacity: { value: opacity }, uFlare: { value: 1 } },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
}

export interface PlumeApi {
  /** Size the plume: thrust 0–1 (its width and length follow it), how much
   *  wider and longer the thin air makes it, and how far it flares. */
  set(thrust: number, wide: number, long: number, flare: number, time: number): void;
}

/** A stage's exhaust hanging down from its group's origin: a long flame round
 *  a hotter, shorter core, and a glow at the nozzles. */
export const Plume = forwardRef<PlumeApi, { radius: number; length: number; diamonds?: number }>(function Plume({ radius, length, diamonds = 1 }, ref) {
  const group = useRef<Mesh>(null);
  const mats = useMemo(() => {
    const plume = (color: Color, core: Color, opacity: number, d: number) =>
      new ShaderMaterial({
        vertexShader: FIRE_VERT,
        fragmentShader: PLUME_FRAG,
        uniforms: {
          uColor: { value: color.clone() },
          uCore: { value: core.clone() },
          uOpacity: { value: opacity },
          uDiamonds: { value: d },
          uTime: { value: 0 },
          uFlare: { value: 1 },
        },
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      });
    return { flame: plume(FLAME, GLOW, 0.75, 0), core: plume(GLOW, CORE, 0.95, diamonds), glow: glowMat(GLOW, 0.7) };
  }, [diamonds]);
  useImperativeHandle(
    ref,
    () => ({
      set(thrust, wide, long, flare, time) {
        const g = group.current;
        if (!g) return;
        g.visible = thrust > 0.01;
        if (!g.visible) return;
        const lick = 0.9 + Math.random() * 0.2;
        // fewer engines burning: a narrower column, not just a fainter one
        const w = Math.sqrt(thrust) * wide;
        g.scale.set(w, (0.35 + 0.65 * thrust) * long * lick, w);
        for (const m of [mats.flame, mats.core]) {
          m.uniforms.uTime.value = time;
          m.uniforms.uFlare.value = flare;
        }
        // the diamonds wash out as the plume flares (they're a sea-level thing)
        mats.core.uniforms.uDiamonds.value = diamonds / flare;
        mats.flame.uniforms.uOpacity.value = 0.75 / Math.sqrt(flare);
      },
    }),
    [mats, diamonds],
  );
  return (
    <group ref={group as never} visible={false}>
      {/* open cones, wide at the nozzles */}
      <mesh position={[0, -length / 2, 0]} material={mats.flame} renderOrder={3}>
        <cylinderGeometry args={[radius * 1.08, radius * 0.4, length, 24, 1, true]} />
      </mesh>
      <mesh position={[0, -length * 0.22, 0]} material={mats.core} renderOrder={3}>
        <cylinderGeometry args={[radius * 0.86, radius * 0.22, length * 0.44, 20, 1, true]} />
      </mesh>
      <mesh position={[0, -radius * 0.35, 0]} scale={[1, 0.7, 1]} material={mats.glow} renderOrder={3}>
        <sphereGeometry args={[radius * 1.3, 16, 12]} />
      </mesh>
    </group>
  );
});

/* ---------- one flame per engine ---------- */

const NOZZLE_VERT = /* glsl */ `
attribute float iLevel;
uniform float uHalf;
varying float vY;
varying float vFace;
varying float vLevel;
void main() {
  vY = uv.y;
  vLevel = iLevel;
  // an engine that's out collapses to nothing; one spooling up grows its flame
  // hung from the nozzle exit (the instance's origin), so it grows downward
  vec3 p = position;
  p.y = (p.y - uHalf) * iLevel;
  p *= step(0.01, iLevel);
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  vFace = abs(dot(normalize(normalMatrix * mat3(instanceMatrix) * normal), normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`;
const NOZZLE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uOpacity;
varying float vY;
varying float vFace;
varying float vLevel;
void main() {
  vec3 col = mix(uColor, uCore, vFace * vY);
  gl_FragColor = vec4(col, uOpacity * vLevel * pow(vY, 1.3) * (0.3 + 0.7 * vFace));
}`;
const DOT_VERT = /* glsl */ `
attribute float iLevel;
varying float vFace;
varying float vLevel;
void main() {
  vLevel = iLevel;
  vec3 p = position * (0.55 + 0.45 * iLevel) * step(0.01, iLevel);
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  vFace = abs(dot(normalize(normalMatrix * mat3(instanceMatrix) * normal), normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`;
const DOT_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFace;
varying float vLevel;
void main() {
  gl_FragColor = vec4(uColor, uOpacity * vLevel * vFace * vFace * vFace);
}`;

export interface NozzlesApi {
  /** Each engine's thrust, 0–1, in the order the positions were given. */
  set(levels: ArrayLike<number>): void;
}

/** A glow at every nozzle exit and a short flame under it, each engine on its
 *  own level. `at` is each nozzle's exit (x, z) and its bell's radius, `y` the
 *  height of the exits. */
export const Nozzles = forwardRef<NozzlesApi, { at: { x: number; z: number; r: number }[]; y: number; length: number }>(function Nozzles({ at, y, length }, ref) {
  const flames = useRef<InstancedMesh>(null);
  const dots = useRef<InstancedMesh>(null);
  const n = at.length;
  const { level, flameMat, dotMat } = useMemo(() => {
    const level = new InstancedBufferAttribute(new Float32Array(n), 1);
    const flameMat = new ShaderMaterial({
      vertexShader: NOZZLE_VERT,
      fragmentShader: NOZZLE_FRAG,
      uniforms: { uColor: { value: FLAME.clone() }, uCore: { value: CORE.clone() }, uOpacity: { value: 0.9 }, uHalf: { value: length / 2 } },
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    });
    const dotMat = new ShaderMaterial({
      vertexShader: DOT_VERT,
      fragmentShader: DOT_FRAG,
      uniforms: { uColor: { value: CORE.clone() }, uOpacity: { value: 1 } },
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    return { level, flameMat, dotMat };
  }, [n, length]);
  const placed = useRef(false);
  const place = () => {
    const f = flames.current;
    const d = dots.current;
    if (!f || !d || placed.current) return;
    const m = new Matrix4();
    const s = new Vector3();
    for (let i = 0; i < n; i++) {
      const { x, z, r } = at[i];
      s.set(r / 0.0033, 1, r / 0.0033);
      // the flame hangs from the exit; the glow sits in the bell's mouth
      m.makeScale(s.x, 1, s.z).setPosition(x, y, z);
      f.setMatrixAt(i, m);
      m.makeScale(s.x, s.x * 0.6, s.z).setPosition(x, y + 0.0004, z);
      d.setMatrixAt(i, m);
    }
    f.instanceMatrix.needsUpdate = true;
    d.instanceMatrix.needsUpdate = true;
    f.geometry.setAttribute('iLevel', level);
    d.geometry.setAttribute('iLevel', level);
    placed.current = true;
  };
  useImperativeHandle(
    ref,
    () => ({
      set(levels) {
        place();
        const a = level.array as Float32Array;
        let any = false;
        for (let i = 0; i < n; i++) {
          a[i] = levels[i] ?? 0;
          if (a[i] > 0.01) any = true;
        }
        level.needsUpdate = true;
        if (flames.current) flames.current.visible = any;
        if (dots.current) dots.current.visible = any;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [level, n],
  );
  return (
    <group>
      <instancedMesh ref={flames} args={[undefined, undefined, n]} material={flameMat} renderOrder={3} frustumCulled={false} visible={false}>
        <cylinderGeometry args={[0.0031, 0.0016, length, 10, 1, true]} />
      </instancedMesh>
      <instancedMesh ref={dots} args={[undefined, undefined, n]} material={dotMat} renderOrder={3} frustumCulled={false} visible={false}>
        <sphereGeometry args={[0.0042, 10, 8]} />
      </instancedMesh>
    </group>
  );
});

/* ---------- hot staging: the ring's vents ---------- */

export interface LevelApi {
  set(level: number, time: number): void;
}

/** Eighteen flames thrown out sideways through the hot-staging ring's vents,
 *  at the height `y`, round radius `r`. */
export const RingJets = forwardRef<LevelApi, { y: number; r: number }>(function RingJets({ y, r }, ref) {
  const group = useRef<Mesh>(null);
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: FIRE_VERT,
        fragmentShader: PLUME_FRAG,
        uniforms: {
          uColor: { value: FLAME.clone() },
          uCore: { value: CORE.clone() },
          uOpacity: { value: 0.9 },
          uDiamonds: { value: 0 },
          uTime: { value: 0 },
          uFlare: { value: 2.2 },
        },
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      }),
    [],
  );
  const jets = useMemo(() => Array.from({ length: 18 }, (_, i) => (Math.PI * 2 * (i + 0.5)) / 18), []);
  useImperativeHandle(
    ref,
    () => ({
      set(level, time) {
        const g = group.current;
        if (!g) return;
        g.visible = level > 0.01;
        if (!g.visible) return;
        mat.uniforms.uTime.value = time;
        mat.uniforms.uOpacity.value = 0.95 * level;
        g.scale.set(0.6 + 0.4 * level, 1, 0.6 + 0.4 * level);
        // each jet's own axis is its inner group's y
        g.children.forEach((c) => c.children[0]?.scale.set(1, (0.5 + 0.7 * level) * (0.85 + Math.random() * 0.3), 1));
      },
    }),
    [mat],
  );
  const L = 0.05;
  return (
    <group ref={group as never} position={[0, y, 0]} visible={false}>
      {jets.map((a) => (
        // each jet lies on its side, pointing out from the ring
        <group key={a} rotation={[0, a, 0]}>
          <group position={[0, 0, r]} rotation={[-Math.PI / 2, 0, 0]}>
            <mesh position={[0, -L / 2, 0]} material={mat} renderOrder={3}>
              <cylinderGeometry args={[0.0026, 0.0012, L, 8, 1, true]} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
});

/* ---------- Max-Q: the condensation collar ---------- */

const CONE_VERT = /* glsl */ `
varying vec2 vUv;
varying float vFace;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFace = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`;
const CONE_FRAG = /* glsl */ `
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
varying float vFace;
void main() {
  // a hard bright front edge (the shock), fraying back along the stack in
  // streaks that flicker as the cloud forms and tears away
  float y = vUv.y;
  float front = smoothstep(1.0, 0.94, y) * smoothstep(0.78, 0.94, y);
  float body = smoothstep(1.0, 0.86, y) * smoothstep(0.0, 0.8, y);
  float streak = 0.55 + 0.45 * sin(vUv.x * 80.0 + uTime * 3.0) * sin(vUv.x * 23.0 - uTime * 1.7);
  float a = uOpacity * (front * 0.9 + body * streak * 0.75) * (0.45 + 0.55 * (1.0 - vFace));
  gl_FragColor = vec4(vec3(0.95, 0.97, 1.0), clamp(a, 0.0, 1.0));
}`;

/** The vapour cone that wraps the stack as it goes through the sound barrier
 *  and peak pressure: a frayed white collar flaring back from `y`. */
export const VaporCone = forwardRef<LevelApi, { y: number; r: number }>(function VaporCone({ y, r }, ref) {
  const mesh = useRef<Mesh>(null);
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: CONE_VERT,
        fragmentShader: CONE_FRAG,
        uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    [],
  );
  useImperativeHandle(
    ref,
    () => ({
      set(level, time) {
        const m = mesh.current;
        if (!m) return;
        m.visible = level > 0.01;
        mat.uniforms.uOpacity.value = 0.9 * level;
        mat.uniforms.uTime.value = time;
        m.scale.set(0.85 + 0.3 * level, 0.7 + 0.3 * level, 0.85 + 0.3 * level);
      },
    }),
    [mat],
  );
  // hung from its front edge, so it stretches back from there
  const geo = useMemo(() => new CylinderGeometry(r * 1.12, r * 2.9, 0.2, 48, 1, true).translate(0, -0.1, 0), [r]);
  return <mesh ref={mesh} position={[0, y, 0]} geometry={geo} material={mat} renderOrder={2} visible={false} />;
});

/* ---------- cryogenic frost ---------- */

const FROST_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
void main() {
  vUv = uv;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FROST_FRAG = /* glsl */ `
uniform float uLevel;   // 0–1 up the band: frost below, bare steel above
uniform float uOpacity;
uniform vec3 uLight;     // view-space direction to the key light
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
void main() {
  // the frost line: soft, a little ragged round the tank
  float edge = uLevel + 0.03 * sin(vUv.x * 38.0) + 0.02 * sin(vUv.x * 91.0 + 1.3);
  float below = smoothstep(edge + 0.015, edge - 0.03, vUv.y);
  float lit = 0.55 + 0.45 * max(dot(vN, uLight), 0.0);
  float rim = pow(1.0 - abs(dot(vN, vView)), 2.0);
  // a smooth coat, no fine pattern: stripes this thin alias into hard lines
  vec3 col = vec3(0.86, 0.9, 0.93) * lit + rim * 0.08;
  gl_FragColor = vec4(col, uOpacity * below * (0.6 + 0.25 * rim));
}`;

/** White frost on a cryogenic tank: a shell round the hull from `y0` to `y1`,
 *  frosted up to `level` of the way (the propellant inside). */
export const Frost = forwardRef<{ set(level: number, opacity: number): void }, { r: number; y0: number; y1: number }>(function Frost({ r, y0, y1 }, ref) {
  const mesh = useRef<Mesh>(null);
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: FROST_VERT,
        fragmentShader: FROST_FRAG,
        uniforms: { uLevel: { value: 1 }, uOpacity: { value: 0 }, uLight: { value: new Vector3(0.45, 0.8, 0.4).normalize() } },
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  useImperativeHandle(
    ref,
    () => ({
      set(level, opacity) {
        const m = mesh.current;
        if (!m) return;
        m.visible = opacity > 0.01 && level > 0.01;
        mat.uniforms.uLevel.value = level;
        mat.uniforms.uOpacity.value = opacity;
      },
    }),
    [mat],
  );
  return (
    <mesh ref={mesh} position={[0, (y0 + y1) / 2, 0]} material={mat} renderOrder={1} visible={false}>
      <cylinderGeometry args={[r, r, y1 - y0, 48, 1, true]} />
    </mesh>
  );
});
