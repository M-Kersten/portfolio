// Gallery light. The model is an exhibition, so its exhibits are lit the way a
// gallery lights them: a faint pool of white light at the foot of each one
// you've seen (the tally's "lit", made literal), and, on the one you've opened,
// a soft cone falling onto it from above, as from a spot in the ceiling you
// can't see. Neutral white on every layer: it's the museum's light, not the
// project's colour. No real lights: a disc and a cone of additive glow each,
// fading out at their edges, so the whole gallery costs a few dozen triangles
// and nothing in the shaders of the model under them.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, CanvasTexture, Color, DoubleSide, ShaderMaterial, type Mesh, type MeshBasicMaterial } from 'three';
import { useReducedMotion } from '../../lib/media';
import { useSceneSelector } from '../store';
import { HOTSPOTS, type LayerId } from '../framing';
import type { V3 } from './shared';

/* Where each exhibit's light falls, layer-local: the pool's centre on the
   floor the exhibit stands on (under its contact shadow, so the light lands
   where the object does), its radius, and how far above that the cone's
   unseen spot hangs. */
const POOLS: Record<string, { at: V3; r: number; h: number }> = {
  // city (the ground at 0, the park on its raised disc)
  arcam: { at: [1.3, 0.03, -0.23], r: 0.55, h: 1.0 },
  'alliander-hololens': { at: [0, 0.012, 0.2], r: 0.46, h: 1.7 },
  'dtt-amsterdam': { at: [-1.2, 0.012, -0.06], r: 0.42, h: 1.2 },
  // room (the rug's top at 0.022)
  'virtuele-brigade': { at: [-1.357, 0.026, 0.21], r: 0.52, h: 1.35 },
  'popcore-games': { at: [0.123, 0.026, -0.24], r: 0.48, h: 1.0 },
  'lightship-drive': { at: [0, 0.026, 0.52], r: 0.46, h: 1.0 },
  'zwijsen-ar-books': { at: [0.989, 0.026, -1.021], r: 0.46, h: 1.45 },
  // chip (the board's top at 0.02)
  'amsterdam-ai': { at: [0, 0.0215, 0], r: 0.46, h: 0.9 },
  'custom-ar-framework': { at: [0.75, 0.0215, -0.75], r: 0.24, h: 0.75 },
  'philips-medical-xr': { at: [-0.75, 0.0215, -0.75], r: 0.3, h: 0.85 },
};

const POOL_SEEN = 0.1; // a pool's strength once you've seen its exhibit
const POOL_OPEN = 0.2; // …and while it's open
const POOL_AWAY = 0.35; // on a layer that isn't the one in focus, of that
const CONE_OPEN = 0.055; // the cone's strength, at its brightest (its foot, face-on)
const FADE = 1.6; // how fast the light comes up and goes down (1/s)

let poolTex: CanvasTexture | null = null;
/** A soft disc of light: full at its heart, gone by its edge. */
function poolTexture(): CanvasTexture {
  if (poolTex) return poolTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  }
  return (poolTex = new CanvasTexture(c));
}

/* The cone: light in the air, not a shape. Its strength falls away toward
   its edges as seen from where you stand (where its surface turns edge-on to
   you), so it has no outline, and up toward the spot it comes from. */
function coneMaterial(): ShaderMaterial {
  const m = new ShaderMaterial({
    uniforms: { uColor: { value: new Color('#ffffff') }, uOpacity: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vUp;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        vUp = uv.y; // 0 at the foot, 1 at the tip
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vUp;
      void main() {
        float face = abs(dot(normalize(vNormal), normalize(vView)));
        float a = pow(face, 2.2) * pow(1.0 - vUp, 1.6) * uOpacity;
        gl_FragColor = vec4(uColor, a); // additive: added in at its alpha
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  m.userData.lifeSkip = true;
  return m;
}

function ExhibitLight({ slug, active }: { slug: string; active: boolean }) {
  const p = POOLS[slug];
  const seen = useSceneSelector((s) => s.visited.includes(slug));
  const open = useSceneSelector((s) => s.selectedSlug === slug);
  const reduced = useReducedMotion();
  const pool = useRef<MeshBasicMaterial>(null);
  const coneMesh = useRef<Mesh>(null);
  const k = useRef({ pool: 0, cone: 0 });
  const poolMap = useMemo(poolTexture, []);
  const coneMat = useMemo(coneMaterial, []);
  useEffect(() => () => coneMat.dispose(), [coneMat]);
  useFrame((_, delta) => {
    const want = { pool: (open ? POOL_OPEN : seen ? POOL_SEEN : 0) * (active || open ? 1 : POOL_AWAY), cone: open ? CONE_OPEN : 0 };
    const f = reduced ? 1 : 1 - Math.exp(-Math.min(delta, 1 / 30) * FADE * 3);
    const v = k.current;
    v.pool += (want.pool - v.pool) * f;
    v.cone += (want.cone - v.cone) * f;
    if (pool.current) {
      pool.current.opacity = v.pool;
      pool.current.visible = v.pool > 0.002;
    }
    coneMat.uniforms.uOpacity.value = v.cone;
    if (coneMesh.current) coneMesh.current.visible = v.cone > 0.002;
  });
  if (!p) return null;
  return (
    <group position={p.at}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={p.r} renderOrder={-1}>
        <circleGeometry args={[1, 40]} />
        <meshBasicMaterial ref={pool} userData={{ lifeSkip: true }} map={poolMap} transparent opacity={0} visible={false} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={coneMesh} position={[0, p.h / 2, 0]} material={coneMat} visible={false}>
        <coneGeometry args={[p.r * 0.92, p.h, 40, 1, true]} />
      </mesh>
    </group>
  );
}

/** The gallery light for one layer's exhibits; `active` is the layer in focus. */
export function GalleryLights({ layer, active }: { layer: LayerId; active: boolean }) {
  return (
    <>
      {HOTSPOTS.filter((h) => h.layer === layer).map((h) => (
        <ExhibitLight key={h.slug} slug={h.slug} active={active} />
      ))}
    </>
  );
}
