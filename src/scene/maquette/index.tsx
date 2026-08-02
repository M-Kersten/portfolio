// The maquette's composition root. Scale ladder (top → bottom): City (GIS /
// location), Room (games / apps / web), Chip (tools / CV / data). Each layer
// is a dot floor + point field + one rig of objects, stacked at LAYER_Y and
// scaled by LAYER_SCALE (see ../framing.ts, where the hotspots are authored
// too). The per-layer content lives in city.tsx / room.tsx / chip.tsx.
import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { type Group } from 'three';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { MAQUETTE_LAYERS, HOTSPOTS, LAYER_Y, LAYER_SCALE, layerGap, type Hotspot, type LayerId } from '../framing';
import { useSceneSelector, bootAt, MAQUETTE_BOOT } from '../store';
import { AccentCtx, PALETTE } from './shared';
import { PatternFloor, PointCloud, DepthVeil, HoloFloor } from './backdrop';
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

// The establishing reveal: the maquette powers on as its beat in the load
// sequence (after the hero name + subhead resolve — see the shared boot clock),
// scaling from a hair small up to full with a touch of overshoot (easeOutBack)
// so the world "clicks" into the frame. Paired with a bloom ignition surge in
// Stage on the same clock. One-shot; instant (no animation) under reduced motion.
const REVEAL_FROM = 0.92;
const REVEAL_DUR = 1400; // ms — the settle
function Reveal({ children }: { children: ReactNode }) {
  const grp = useRef<Group>(null);
  const reduced = useReducedMotion();
  const done = useRef(false);
  useFrame(() => {
    const g = grp.current;
    if (!g || done.current) return;
    if (reduced) {
      g.scale.setScalar(1);
      done.current = true;
      return;
    }
    const t = (performance.now() - bootAt - MAQUETTE_BOOT) / REVEAL_DUR;
    if (t <= 0) {
      g.scale.setScalar(REVEAL_FROM); // hold a hair small until the maquette's beat
      return;
    }
    if (t >= 1) {
      g.scale.setScalar(1);
      done.current = true; // settled — stop touching the transform
      return;
    }
    // easeOutBack — a gentle settle with a hair of overshoot past 1
    const c1 = 1.2;
    const c3 = c1 + 1;
    const e = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    g.scale.setScalar(REVEAL_FROM + (1 - REVEAL_FROM) * e);
  });
  return <group ref={grp}>{children}</group>;
}

// Cursor parallax: on the overview the whole diorama tilts a few degrees toward
// the pointer, so it reads as a physical model under glass you can peer around.
// A node close-up must stay precisely framed, so the tilt eases back to zero the
// moment one is open; off entirely under reduced motion and on coarse (touch)
// pointers.
const PARALLAX_YAW = 0.06; // ~3.4° left/right
const PARALLAX_PITCH = 0.035; // ~2° up/down
function Parallax({ children }: { children: ReactNode }) {
  const grp = useRef<Group>(null);
  const reduced = useReducedMotion();
  const selected = useSceneSelector((s) => s.selectedSlug);
  const pointer = useThree((s) => s.pointer);
  const coarse = useMemo(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(hover: none)').matches,
    [],
  );
  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    // active only on the overview, with a fine pointer, and not under reduced motion
    const on = !reduced && !coarse && selected === null;
    const tx = on ? pointer.y * PARALLAX_PITCH : 0; // lean toward the cursor
    const ty = on ? -pointer.x * PARALLAX_YAW : 0;
    const lerp = selected ? 0.16 : 0.05; // zero out quickly on select; drift gently otherwise
    g.rotation.x += (tx - g.rotation.x) * lerp;
    g.rotation.y += (ty - g.rotation.y) * lerp;
  });
  return <group ref={grp}>{children}</group>;
}

export function Maquette({ onActivate }: { onActivate: (hotspot: Hotspot) => void }) {
  const journeyStep = useSceneSelector((s) => s.journeyStep);
  const selectedSlug = useSceneSelector((s) => s.selectedSlug);
  const visited = useSceneSelector((s) => s.visited);
  const launching = useSceneSelector((s) => s.launch) !== 'idle';
  const activeLayer = (['city', 'room', 'chip'] as LayerId[])[journeyStep] ?? 'city';
  // The layer that holds the light: the selected node's home while one is open
  // (a deep link can select a node the scroll hasn't reached), else the scroll's.
  const presenceLayer = HOTSPOTS.find((h) => h.slug === selectedSlug)?.layer ?? activeLayer;
  // Spread the layers vertically on tall/narrow screens (matched by the camera
  // targets + hotspot anchors in ../framing, so everything stays aligned).
  const gap = layerGap(useThree((s) => s.size.width / s.size.height));

  return (
    <Parallax>
      <Reveal>
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
        const spots = HOTSPOTS.filter((h) => h.layer === id);
        // how alive this layer is — the fraction of its projects you've woken —
        // feeds the ambient field's presence (see PointCloud)
        const life = spots.length ? spots.filter((h) => visited.includes(h.slug)).length / spots.length : 0;
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
                  <PatternFloor step={id === 'city' ? 0.17 : 0.26} />
                  <PointCloud seed={SEED[id]} life={life} />
                  <Rig />
                </PresenceGroup>
              </group>
              {activeLayer === id &&
                spots.map((h) => (
                  <HotspotMarker key={h.slug} hotspot={h} color={PALETTE[id].accent} onActivate={onActivate} hidden={!!selectedSlug || launching} />
                ))}
            </group>
          </AccentCtx.Provider>
        );
      })}
      {RELATIONS.map((rel, i) => (
          <SignalLine key={i} {...rel} />
        ))}
      </Reveal>
    </Parallax>
  );
}
