import { Suspense, useEffect, useMemo, useState } from 'react';
import { Edges, Grid, Html, useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { asset } from '../lib/asset';
import { useAssetExists } from '../lib/useAssetExists';
import { useSceneSelector, sceneStore } from './store';
import { resolvePlace, ATTRIBUTE_META } from '../data/places';
import { generateDistrict, colorFor, type Building } from './district.gen';

// The twin (§5). A baked 3DBAG model is ordinary R3F: load the .glb, orbit it.
// Until that model is dropped in public/models/<id>.glb, we render an honest
// procedural placeholder so the whole experience is demonstrable.

function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[1200, 1200]} />
        <meshStandardMaterial color="#0c0f13" roughness={1} metalness={0} />
      </mesh>
      <Grid
        position={[0, 0, 0]}
        args={[10, 10]}
        cellSize={6}
        cellThickness={0.6}
        cellColor="#1d2630"
        sectionSize={36}
        sectionThickness={1}
        sectionColor="#236e72"
        infiniteGrid
        fadeDistance={460}
        fadeStrength={1.3}
        followCamera={false}
      />
    </group>
  );
}

function BakedDistrict({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  // A real bake is centred at the origin (§5.2); render it as-is. Runtime
  // attribute recolouring of a baked model (named objects + sidecar JSON) is the
  // optional Phase-3 path — baked-in colours work with zero runtime logic.
  return <primitive object={scene} />;
}

function ProceduralDistrict({ seed, blocks }: { seed: number; blocks: number }) {
  const attribute = useSceneSelector((s) => s.twinAttribute);
  const [hovered, setHovered] = useState<Building | null>(null);
  const buildings = useMemo(() => generateDistrict(seed, blocks), [seed, blocks]);

  useEffect(() => {
    sceneStore.setTwinPlaceholder(true);
    return () => {
      document.body.style.cursor = '';
    };
  }, []);

  const onOver = (b: Building) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(b);
    document.body.style.cursor = 'pointer';
  };
  const onOut = () => {
    setHovered(null);
    document.body.style.cursor = '';
  };

  return (
    <group>
      {buildings.map((b) => (
        <mesh key={b.id} position={[b.x, b.height / 2, b.z]} onPointerOver={onOver(b)} onPointerOut={onOut}>
          <boxGeometry args={[b.w, b.height, b.d]} />
          <meshStandardMaterial color={colorFor(b, attribute)} roughness={0.85} metalness={0.05} />
          <Edges threshold={20} color="#46586f" />
        </mesh>
      ))}

      {hovered && (
        <Html position={[hovered.x, hovered.height + 2, hovered.z]} center zIndexRange={[15, 0]} className="readout-wrap">
          <div className="readout" role="status">
            <div className="readout__id">{hovered.id}</div>
            <dl>
              <dt>Year</dt>
              <dd>{hovered.bouwjaar}</dd>
              <dt>Height</dt>
              <dd>{hovered.height.toFixed(1)} m</dd>
              <dt>Roof area</dt>
              <dd>{hovered.roof_area} m²</dd>
            </dl>
            <div className="readout__note">synthetic placeholder · {ATTRIBUTE_META[attribute].label}</div>
          </div>
        </Html>
      )}
    </group>
  );
}

export function District() {
  const placeId = useSceneSelector((s) => s.placeId);
  const place = resolvePlace(placeId);
  const url = asset(place.model);
  const status = useAssetExists(url);

  useEffect(() => {
    if (status === 'present') sceneStore.setTwinPlaceholder(false);
  }, [status]);

  return (
    <group>
      <Ground />
      {status === 'present' && (
        <Suspense fallback={null}>
          <BakedDistrict url={url} />
        </Suspense>
      )}
      {status === 'absent' && place.placeholder && (
        <ProceduralDistrict seed={place.placeholder.seed} blocks={place.placeholder.blocks} />
      )}
    </group>
  );
}
