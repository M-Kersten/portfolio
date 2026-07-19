// Stage dressing behind the objects: each layer's dot floor, its slowly
// drifting point field, the soft radial veil that grounds the stack, and the
// blob shadows that ground each object cluster onto its floor.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, Color, type Mesh, type Points as ThreePoints } from 'three';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useSceneSelector } from '../store';
import { BG, NEUTRAL, makeRand, useAccent, type V3 } from './shared';

export function DotFloor({ step = 0.26 }: { step?: number }) {
  const R = 2.2;
  const { accent } = useAccent();
  const { positions, colors } = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    const c = new Color(NEUTRAL);
    const acc = new Color(accent);
    const bg = new Color(BG);
    const tmp = new Color();
    for (let x = -R; x <= R + 1e-6; x += step)
      for (let z = -R; z <= R + 1e-6; z += step) {
        const d = Math.hypot(x, z);
        if (d > R) continue;
        pos.push(x, 0, z);
        const fade = Math.pow(1 - d / R, 1.5);
        // neutral blue-grey, warmed toward the layer's accent near the middle —
        // so the floor you're standing on glows the layer's colour, a strong but
        // local per-layer cue that never touches the black frame
        tmp.copy(bg).lerp(c, 0.06 + 0.5 * fade).lerp(acc, 0.5 * fade);
        col.push(tmp.r, tmp.g, tmp.b);
      }
    return { positions: new Float32Array(pos), colors: new Float32Array(col) };
  }, [step, accent]);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.022} vertexColors transparent opacity={0.7} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/** A sparse field of neutral points drifting slowly above the layer. */
export function PointCloud({ seed }: { seed: number }) {
  const ref = useRef<ThreePoints>(null);
  const reduced = useReducedMotion();
  const positions = useMemo(() => {
    const rnd = makeRand(seed);
    const n = 32;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const ang = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 1.95;
      a[i * 3] = Math.cos(ang) * r;
      a[i * 3 + 1] = 0.35 + rnd() * 1.0;
      a[i * 3 + 2] = Math.sin(ang) * r;
    }
    return a;
  }, [seed]);
  useFrame((state) => {
    if (ref.current && !reduced) ref.current.rotation.y = state.clock.elapsedTime * 0.02;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.016} color={NEUTRAL} transparent opacity={0.22} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/* ---------- Grounding: a soft dark pool under each object cluster, so things
   sit ON their floor instead of hovering over it. One shared radial texture;
   every blob is a cheap transparent disc — no real shadow rendering. */
let blobTex: CanvasTexture | null = null;
function blobShadowTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(2,4,6,0.9)');
    g.addColorStop(0.55, 'rgba(2,4,6,0.42)');
    g.addColorStop(1, 'rgba(2,4,6,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  blobTex = new CanvasTexture(c);
  return blobTex;
}

/** A soft contact-shadow disc under an object. `radius` is the half-size along
 *  X; `aspect` squashes Z for rectangular footprints (desk, couch). Rendered
 *  before the other transparents so glass always draws over it, and exempt
 *  from the life system (lifeSkip). */
export function BlobShadow({ position, radius, aspect = 1, opacity = 0.4 }: { position: V3; radius: number; aspect?: number; opacity?: number }) {
  const tex = useMemo(blobShadowTexture, []);
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} scale={[radius, radius * aspect, 1]} renderOrder={-1}>
      <circleGeometry args={[1, 28]} />
      <meshBasicMaterial userData={{ lifeSkip: true }} map={tex} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/* ---------- Depth: a soft shadow under the focused layer that also darkens the
   layers beneath it, so one reads as the subject. Follows the active layer. */
function radialVeilTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(4,6,8,0.85)');
    g.addColorStop(0.55, 'rgba(4,6,8,0.52)');
    g.addColorStop(1, 'rgba(4,6,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new CanvasTexture(c);
}

export function DepthVeil() {
  const journeyStep = useSceneSelector((s) => s.journeyStep);
  const reduced = useReducedMotion();
  const ref = useRef<Mesh>(null);
  const tex = useMemo(() => radialVeilTexture(), []);
  const targetY = ([1.32, 0, -1.32][journeyStep] ?? 1.32) - 0.34;
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.y = reduced ? targetY : ref.current.position.y + (targetY - ref.current.position.y) * 0.08;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, targetY, 0]}>
      <circleGeometry args={[2.7, 64]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} fog={false} />
    </mesh>
  );
}

