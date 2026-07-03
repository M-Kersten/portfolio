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
  // Adaptive resolution: everything downstream (bloom, transmission, MSAA) scales
  // with pixel count, so on a device that can't hold frame-rate we drop the
  // device-pixel-ratio to 1 rather than rendering millions of extra pixels.
  // Capable GPUs climb back to 2×; the flip-flop guard locks to the low tier if a
  // device sits on the fence, so it never oscillates.
  const [dpr, setDpr] = useState(1.5);
  return (
    <Canvas
      dpr={dpr}
      frameloop={frameloop}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{
        position: [MAQUETTE_HOME.pos.x, MAQUETTE_HOME.pos.y, MAQUETTE_HOME.pos.z],
        fov: 42,
        near: 0.1,
        far: 2000,
      }}
    >
      <PerformanceMonitor
        onIncline={() => setDpr(2)}
        onDecline={() => setDpr(1)}
        flipflops={3}
        onFallback={() => setDpr(1)}
      />
      <Stage onActivate={onActivate} />
    </Canvas>
  );
}
