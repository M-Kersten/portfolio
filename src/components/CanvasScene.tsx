import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { Stage } from '../scene/Stage';
import { MAQUETTE_HOME, type Hotspot } from '../scene/framing';

// Lazy-loaded boundary for the whole WebGL stack. Splitting three/R3F behind a
// dynamic import lets the HTML hero text paint first (§12) and keeps three off
// the wire entirely when WebGL is unavailable.
export default function CanvasScene({
  frameloop,
  onActivate,
}: {
  frameloop: 'always' | 'demand' | 'never';
  onActivate: (hotspot: Hotspot) => void;
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
