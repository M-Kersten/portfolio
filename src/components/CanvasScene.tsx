import { Canvas } from '@react-three/fiber';
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
  return (
    <Canvas
      dpr={[1, 2]}
      frameloop={frameloop}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{
        position: [MAQUETTE_HOME.pos.x, MAQUETTE_HOME.pos.y, MAQUETTE_HOME.pos.z],
        fov: 42,
        near: 0.1,
        far: 2000,
      }}
    >
      <Stage onActivate={onActivate} />
    </Canvas>
  );
}
