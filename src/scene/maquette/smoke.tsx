// Smoke for the launch (launchSite.tsx): the steam cloud the engines make of
// the deluge water at ignition, the deluge's own spray, the trail the booster
// leaves on the way up, the wisps that vent off the stack, the booster's
// thrusters and its landing burn. A pool of soft puffs drawn as camera-facing
// quads in a single instanced draw. Each puff is launched with a velocity and
// slowed by the air (and pulled down, if it's water), swells as it ages,
// starts out warm where the flame lights it and greys as it cools, and fades
// out; the scene's fog takes the ones left far below. The engines light the
// cloud from inside: `light()` puts the fire somewhere and every puff near it
// glows with it, brightest on its underside.
//
// The parent decides where and how often (puff()); this keeps the pool moving.
// Positions are in the frame of whatever group this is placed in.
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { film } from '../launchPlan';
import { Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, PlaneGeometry, ShaderMaterial, UniformsLib, UniformsUtils, Vector3, type Mesh } from 'three';

const N = 1800;

export interface SmokeApi {
  /** Launch one puff at (x, y, z) with velocity (vx, vy, vz) — `drag` per
   *  second slows it — growing from size0 to size1 across `life` seconds,
   *  `alpha` at its densest and `warm` lit by the flame at birth (0–1). */
  puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, o: { size0: number; size1: number; life: number; alpha: number; warm: number; drag: number; rise?: number }): void;
  /** Where the fire is (in this group's frame) and how bright, 0 for none: the
   *  puffs round it glow with it. */
  light(x: number, y: number, z: number, intensity: number): void;
  /** Clear the sky. */
  clear(): void;
}

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec3 iPos;
attribute vec4 iLook; // size, alpha, warmth, spin
uniform vec3 uFirePos;
uniform float uFireI;
varying vec2 vUv;
varying float vAlpha;
varying float vWarm;
varying float vFire;
void main() {
  vUv = uv;
  vWarm = iLook.z;
  // lit by the engines: falls off with distance from the fire, and a big puff
  // close by catches more of it than a wisp
  float fd = distance(iPos, uFirePos);
  vFire = uFireI * exp(-fd * 7.0) * (0.6 + 2.0 * iLook.x);
  vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
  // a puff rolling up to the lens thins away before it fills the picture, and
  // one that's gone (or spent) collapses to nothing, so it costs no fill
  float size = iLook.x;
  vAlpha = iLook.y * smoothstep(0.5 * size + 0.04, 1.2 * size + 0.1, -mvPosition.z);
  size *= step(0.002, vAlpha);
  float c = cos(iLook.w);
  float s = sin(iLook.w);
  vec2 p = position.xy;
  mvPosition.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y) * size;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uSmoke;
uniform vec3 uShade;
uniform vec3 uWarm;
uniform vec3 uFire;
varying vec2 vUv;
varying float vAlpha;
varying float vWarm;
varying float vFire;
void main() {
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  // a lumpy rim, so a crowd of them reads as billows rather than balls
  float a = atan(d.y, d.x);
  float rim = 0.86 + 0.08 * sin(a * 3.0) + 0.05 * sin(a * 7.0 + 1.7);
  float m = 1.0 - smoothstep(rim * 0.3, rim, r);
  if (m < 0.004) discard;
  // lit from above: the top of each puff brighter than its underside
  vec3 col = mix(uShade, uSmoke, clamp(0.55 + d.y * 1.1 + (1.0 - r) * 0.25, 0.0, 1.0));
  col = mix(col, uWarm, vWarm);
  // the fire's light, strongest on the underside facing it
  col += uFire * clamp(vFire * (0.7 - d.y * 1.2), 0.0, 1.6);
  gl_FragColor = vec4(col, m * vAlpha);
  #include <fog_fragment>
}`;

export const LaunchSmoke = forwardRef<SmokeApi>(function LaunchSmoke(_, ref) {
  const mesh = useRef<Mesh>(null);
  const sim = useMemo(
    () => ({
      pos: new Float32Array(N * 3),
      vel: new Float32Array(N * 3),
      age: new Float32Array(N).fill(1),
      life: new Float32Array(N).fill(1),
      size0: new Float32Array(N),
      size1: new Float32Array(N),
      alpha: new Float32Array(N),
      warm: new Float32Array(N),
      drag: new Float32Array(N),
      rise: new Float32Array(N),
      spin: new Float32Array(N),
      spinV: new Float32Array(N),
      next: 0,
      live: 0,
    }),
    [],
  );
  const { geo, mat, iPos, iLook } = useMemo(() => {
    const base = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    const iPos = new InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(DynamicDrawUsage);
    const iLook = new InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(DynamicDrawUsage);
    geo.setAttribute('iPos', iPos);
    geo.setAttribute('iLook', iLook);
    geo.instanceCount = N;
    const mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uSmoke: { value: new Color('#dfe6ea') },
          uShade: { value: new Color('#7d8a94') },
          uWarm: { value: new Color('#ffb27a') },
          uFire: { value: new Color('#ff9a52') },
          uFirePos: { value: new Vector3() },
          uFireI: { value: 0 },
        },
      ]),
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    return { geo, mat, iPos, iLook };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      puff(x, y, z, vx, vy, vz, o) {
        const i = sim.next;
        sim.next = (i + 1) % N;
        sim.pos[i * 3] = x;
        sim.pos[i * 3 + 1] = y;
        sim.pos[i * 3 + 2] = z;
        sim.vel[i * 3] = vx;
        sim.vel[i * 3 + 1] = vy;
        sim.vel[i * 3 + 2] = vz;
        sim.age[i] = 0;
        sim.life[i] = o.life;
        sim.size0[i] = o.size0;
        sim.size1[i] = o.size1;
        sim.alpha[i] = o.alpha;
        sim.warm[i] = o.warm;
        sim.drag[i] = o.drag;
        sim.rise[i] = o.rise ?? 0.025;
        sim.spin[i] = Math.random() * Math.PI * 2;
        sim.spinV[i] = (Math.random() - 0.5) * 0.6;
        sim.live = Math.max(sim.live, 1);
      },
      light(x, y, z, intensity) {
        mat.uniforms.uFirePos.value.set(x, y, z);
        mat.uniforms.uFireI.value = intensity;
      },
      clear() {
        sim.age.fill(1);
        sim.life.fill(1);
        sim.live = 0;
        const look = iLook.array as Float32Array;
        look.fill(0);
        iLook.needsUpdate = true;
        if (mesh.current) mesh.current.visible = false;
      },
    }),
    [sim, iLook, mat],
  );

  useFrame((_, delta) => {
    const m = mesh.current;
    if (!m || sim.live === 0) return;
    // the film's own step when the capture tooling drives it (launchPlan.ts)
    const dt = film.fixed || Math.min(delta, 1 / 20);
    const P = iPos.array as Float32Array;
    const L = iLook.array as Float32Array;
    let live = 0;
    for (let i = 0; i < N; i++) {
      const life = sim.life[i];
      let age = sim.age[i];
      if (age >= life) {
        L[i * 4 + 1] = 0;
        continue;
      }
      age += dt;
      sim.age[i] = age;
      if (age >= life) {
        L[i * 4 + 1] = 0;
        continue;
      }
      live++;
      const k = Math.exp(-sim.drag[i] * dt);
      sim.vel[i * 3] *= k;
      sim.vel[i * 3 + 1] = sim.vel[i * 3 + 1] * k + sim.rise[i] * dt; // warm air rises, water falls
      sim.vel[i * 3 + 2] *= k;
      for (let j = 0; j < 3; j++) {
        sim.pos[i * 3 + j] += sim.vel[i * 3 + j] * dt;
        P[i * 3 + j] = sim.pos[i * 3 + j];
      }
      const f = age / life;
      const grow = 1 - (1 - f) * (1 - f); // swells fast, then settles
      sim.spin[i] += sim.spinV[i] * dt;
      L[i * 4] = sim.size0[i] + (sim.size1[i] - sim.size0[i]) * grow;
      L[i * 4 + 1] = sim.alpha[i] * Math.min(1, age / 0.18) * (1 - Math.max(0, (f - 0.45) / 0.55) ** 1.5);
      L[i * 4 + 2] = sim.warm[i] * Math.max(0, 1 - f / 0.3);
      L[i * 4 + 3] = sim.spin[i];
    }
    sim.live = live;
    iPos.needsUpdate = true;
    iLook.needsUpdate = true;
    m.visible = live > 0;
  });

  // drawn after the hardware, before the flames (renderOrder), and never
  // culled: its bounds are a unit quad at the origin, not the cloud
  return <mesh ref={mesh} geometry={geo} material={mat} frustumCulled={false} renderOrder={2} visible={false} />;
});
