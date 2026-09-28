// The maquette's Blender models: meshopt-compressed glbs of named pieces
// (public/models, built from scripts/models). A file only carries shapes — its
// layer looks each piece up by name, places it, and dresses it in the
// maquette's own materials, so the parts wake, light and outline exactly like
// everything else.
//   chip.glb   the chip layer's parts (chip.tsx)
//   tower.glb  the city's Alliander tower (city.tsx)
import { useEffect, useState } from 'react';
import { BufferAttribute, BufferGeometry, type InterleavedBufferAttribute, type Mesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { asset } from '../../lib/asset';

/** Every piece each file must hold. A rename in its scripts/models/build_*.py
 *  has to land here too — a missing piece fails the load loudly instead of
 *  drawing an empty mesh. */
const CHIP_PARTS = [
  'board', 'board_rings', 'board_silk',
  'pkg_sub', 'pkg_frame', 'pkg_ip', 'pkg_hbm', 'pkg_caps', 'pkg_balls', 'pkg_die', 'pkg_tiles',
  'mon_stand', 'mon_legs', 'mon_body', 'mon_controls', 'mon_alarm',
  'hs_chip', 'hs_pads', 'hs_sink', 'hs_fan', 'hs_rotor',
  'cap_can', 'cap_stripe', 'cap_bung',
  'hdr_body', 'hdr_pins',
  'ic_body', 'ic_lands',
  'pas_body', 'pas_ends',
] as const;
const TOWER_PARTS = ['tower_body', 'tower_ribs', 'tower_windows', 'tower_lamp', 'tower_spire'] as const;
export type ChipKit = Record<(typeof CHIP_PARTS)[number], BufferGeometry>;
export type TowerKit = Record<(typeof TOWER_PARTS)[number], BufferGeometry>;

/** gltfpack stores positions and normals as quantized integers and parks the
 *  scale that undoes it on the piece's node. Bake that back into plain floats
 *  in the piece's authored (layer-local) coordinates: the JSX places the parts,
 *  not the file, and the lit pass and outlines want ordinary geometry. */
function toFloat(a: BufferAttribute | InterleavedBufferAttribute): BufferAttribute {
  const n = a.count;
  const s = a.itemSize;
  const out = new Float32Array(n * s);
  for (let i = 0; i < n; i++) {
    out[i * s] = a.getX(i);
    if (s > 1) out[i * s + 1] = a.getY(i);
    if (s > 2) out[i * s + 2] = a.getZ(i);
    if (s > 3) out[i * s + 3] = a.getW(i);
  }
  return new BufferAttribute(out, s);
}
function bake(mesh: Mesh): BufferGeometry {
  const src = mesh.geometry;
  const g = new BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) g.setAttribute(name, toFloat(attr as BufferAttribute));
  if (src.index) g.setIndex(src.index.clone());
  g.applyMatrix4(mesh.matrixWorld);
  if (g.attributes.normal) g.normalizeNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  src.dispose();
  return g;
}

function load<P extends string>(file: string, parts: readonly P[]): Promise<Record<P, BufferGeometry>> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      asset(`/models/${file}`),
      (gltf) => {
        gltf.scene.updateMatrixWorld(true);
        const found: Record<string, BufferGeometry> = {};
        gltf.scene.traverse((o) => {
          const m = o as Mesh;
          if (!m.isMesh) return;
          // A named node keeps its name in userData; gltfpack hangs the mesh on
          // an unnamed child of it (the loader calls that one 'mesh_N').
          let named: Object3D | null = m;
          while (named && !named.userData.name) named = named.parent;
          if (named) found[named.userData.name as string] = bake(m);
        });
        const missing = parts.filter((p) => !found[p]);
        if (missing.length) reject(new Error(`${file} is missing ${missing.join(', ')}`));
        else resolve(found as Record<P, BufferGeometry>);
      },
      undefined,
      reject,
    );
  });
}

/** One model file: loaded once for the page (a second caller gets the same
 *  promise), and a failed load clears itself so the next caller tries again. */
function modelFile<P extends string>(file: string, parts: readonly P[], what: string) {
  type Kit = Record<P, BufferGeometry>;
  let pending: Promise<Kit> | null = null;
  function get(): Promise<Kit> {
    if (!pending) {
      pending = load(file, parts).catch((e: unknown) => {
        pending = null;
        throw e;
      });
    }
    return pending;
  }
  /** The parts once they've arrived — null until then. One retry after a
   *  failure (a blip on the network), then the layer stays without them. */
  function useKit(): Kit | null {
    const [kit, setKit] = useState<Kit | null>(null);
    useEffect(() => {
      let live = true;
      let timer = 0;
      const attempt = (retries: number) =>
        get().then(
          (k) => {
            if (live) setKit(k);
          },
          (e: unknown) => {
            if (!live) return;
            if (retries > 0) timer = window.setTimeout(() => attempt(retries - 1), 2000);
            else console.warn(`The ${what} models could not be loaded.`, e);
          },
        );
      attempt(1);
      return () => {
        live = false;
        clearTimeout(timer);
      };
    }, []);
    return kit;
  }
  return { get, useKit };
}

const chip = modelFile('chip.glb', CHIP_PARTS, 'chip layer');
const tower = modelFile('tower.glb', TOWER_PARTS, "city's tower");

export const loadChipKit = chip.get;
export const useChipKit = chip.useKit;
export const loadTowerKit = tower.get;
export const useTowerKit = tower.useKit;
