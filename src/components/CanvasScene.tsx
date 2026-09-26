import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { Stage } from '../scene/Stage';
import { MAQUETTE_HOME, type Hotspot } from '../scene/framing';

/** How long a lost context gets to come back. A driver reset or a restarted GPU
 *  process usually restores it within a second; one that stays gone means the
 *  browser has stopped giving this page a GPU. */
const RESTORE_GRACE_MS = 3000;

/** Calls `onLost` when the canvas loses its context and it isn't restored in
 *  time. three already keeps the context restorable (it prevents the lost
 *  event's default) and rebuilds itself on restore; this only watches. */
function watchContext(canvas: HTMLCanvasElement, onLost: () => void) {
  let timer = 0;
  canvas.addEventListener('webglcontextlost', () => {
    console.warn('The 3D view lost its GPU context; waiting for it to come back.');
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      console.warn('The GPU context was not restored; showing the static poster.');
      onLost();
    }, RESTORE_GRACE_MS);
  });
  canvas.addEventListener('webglcontextrestored', () => window.clearTimeout(timer));
}

// Lazy-loaded boundary for the whole WebGL stack. Splitting three/R3F behind a
// dynamic import lets the HTML hero text paint first (§12) and keeps three off
// the wire entirely when WebGL is unavailable.
export default function CanvasScene({
  frameloop,
  onActivate,
  onLost,
}: {
  frameloop: 'always' | 'demand' | 'never';
  onActivate: (hotspot: Hotspot) => void;
  onLost: () => void;
}) {
  // Adaptive resolution: everything downstream (MSAA, the composer passes,
  // transparent overdraw) scales with pixel count, so on a device that can't
  // hold frame-rate we drop the device-pixel-ratio toward 1 rather than
  // rendering millions of extra pixels. We cap the *ceiling* at 1.5 — a full 2×
  // on a Retina panel quadruples the pixels of 1× and was the main reason even
  // fast machines dropped frames; 1.5 is visually near-identical here for ~44%
  // fewer pixels. The flip-flop guard locks to the low tier if a device sits on
  // the fence, so it never oscillates.
  const [dpr, setDpr] = useState(1.25);
  return (
    <Canvas
      dpr={dpr}
      frameloop={frameloop}
      // No `shadows`: three would compile shadow sampling into every material
      // in the scene. The hover light's shadows are its own depth pass, drawn
      // only while something is lit (scene/maquette/lit.tsx).
      // No `antialias`: the EffectComposer resolves its own MSAA (see its
      // `multisampling` prop in Stage), so a multisampled default framebuffer is
      // pure wasted memory + a redundant resolve every frame.
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      camera={{
        position: [MAQUETTE_HOME.pos.x, MAQUETTE_HOME.pos.y, MAQUETTE_HOME.pos.z],
        fov: 42,
        near: 0.1,
        far: 2000,
      }}
      onCreated={({ gl }) => watchContext(gl.domElement, onLost)}
    >
      <PerformanceMonitor
        onIncline={() => setDpr(1.5)}
        onDecline={() => setDpr(1)}
        flipflops={3}
        onFallback={() => setDpr(1)}
      />
      <Stage onActivate={onActivate} />
    </Canvas>
  );
}
