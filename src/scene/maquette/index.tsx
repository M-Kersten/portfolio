// The maquette's composition root. Scale ladder (top → bottom): City (GIS /
// location), Room (games / apps / web), Chip (tools / CV / data). Each layer
// is a dot floor + point field + one rig of objects, stacked at LAYER_Y and
// scaled by LAYER_SCALE (see ../framing.ts, where the hotspots are authored
// too). The per-layer content lives in city.tsx / room.tsx / chip.tsx.
import { useThree } from '@react-three/fiber';
import { MAQUETTE_LAYERS, HOTSPOTS, LAYER_Y, LAYER_SCALE, layerGap, type Hotspot, type LayerId } from '../framing';
import { useSceneSelector } from '../store';
import { AccentCtx, PALETTE } from './shared';
import { DotFloor, PointCloud, DepthVeil, HoloFloor } from './backdrop';
import { PresenceGroup } from './presence';
import { CityRig } from './city';
import { RoomRig } from './room';
import { ChipRig } from './chip';
import { HotspotMarker } from './hotspots';
import { SignalLine, RELATIONS } from './signals';

const RIGS: Record<LayerId, () => JSX.Element> = { city: CityRig, room: RoomRig, chip: ChipRig };
const SEED: Record<LayerId, number> = { city: 11, room: 29, chip: 53 };
// journeyStep index per layer (0 = City at top … 2 = Chip at bottom).
const LAYER_STEP: Record<LayerId, number> = { city: 0, room: 1, chip: 2 };

export function Maquette({ onActivate }: { onActivate: (hotspot: Hotspot) => void }) {
  const journeyStep = useSceneSelector((s) => s.journeyStep);
  const selectedSlug = useSceneSelector((s) => s.selectedSlug);
  const launching = useSceneSelector((s) => s.launch) !== 'idle';
  const activeLayer = (['city', 'room', 'chip'] as LayerId[])[journeyStep] ?? 'city';
  // The layer that holds the light: the selected node's home while one is open
  // (a deep link can select a node the scroll hasn't reached), else the scroll's.
  const presenceLayer = HOTSPOTS.find((h) => h.slug === selectedSlug)?.layer ?? activeLayer;
  // Spread the layers vertically on tall/narrow screens (matched by the camera
  // targets + hotspot anchors in ../framing, so everything stays aligned).
  const gap = layerGap(useThree((s) => s.size.width / s.size.height));

  return (
    <group>
      <DepthVeil />
      {MAQUETTE_LAYERS.map((id) => {
        const Rig = RIGS[id];
        // Only the active layer and its immediate neighbour draw their full
        // geometry. A layer two steps away sits ~2.6 units deeper in the fog and
        // never reads on screen, so its ~140 meshes are pure waste — hiding it
        // roughly halves the draw calls at the City/Chip ends.
        //
        // Crucially this is a `visible` toggle, NOT a mount/unmount: three.js
        // skips invisible subtrees entirely (same draw-call saving), but the
        // rigs stay mounted, so crossing a layer boundary while scrolling costs
        // a boolean flip instead of allocating/disposing 140 meshes mid-scroll —
        // that churn was making the scroll stutter and "catch up".
        const near = Math.abs(LAYER_STEP[id] - journeyStep) <= 1;
        return (
          <AccentCtx.Provider key={id} value={PALETTE[id]}>
            <group position={[0, LAYER_Y[id] * gap, 0]} scale={LAYER_SCALE[id]}>
              <group visible={near}>
                {/* Holo-table sheen — outside the presence dimmer (it only shows
                    on the active layer, which is never the dimmed one). */}
                <HoloFloor active={presenceLayer === id} tint={PALETTE[id].accent} />
                {/* Presence: the layer in focus keeps full brightness, the
                    others rest dimmed (see presence.tsx). Only the dressing —
                    the life system's objects are exempt inside. */}
                <PresenceGroup active={presenceLayer === id}>
                  <DotFloor step={id === 'city' ? 0.17 : 0.26} />
                  <PointCloud seed={SEED[id]} />
                  <Rig />
                </PresenceGroup>
              </group>
              {activeLayer === id &&
                HOTSPOTS.filter((h) => h.layer === id).map((h) => (
                  <HotspotMarker key={h.slug} hotspot={h} color={PALETTE[id].accent} onActivate={onActivate} hidden={!!selectedSlug || launching} />
                ))}
            </group>
          </AccentCtx.Provider>
        );
      })}
      {RELATIONS.map((rel, i) => (
        <SignalLine key={i} {...rel} />
      ))}
    </group>
  );
}
