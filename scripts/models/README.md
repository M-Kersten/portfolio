# Blender models

Some of the maquette's models are built in Blender from a script, one file per
model, with the shared helpers in `modelkit.py`:

- `build_chip.py`: the chip layer's parts (the board and its silkscreen, the
  accelerator package, the patient monitor, the heatsink and fan, and the
  small parts). They ship as `public/models/chip.glb`, and `chip.tsx` dresses
  them.
- `build_tower.py`: the city's Alliander tower, a stepped setback tower with a
  lit lantern and a spire. It ships as `public/models/tower.glb`, and
  `city.tsx` dresses it.
- `build_blocks.py`: the six blocks round the tower, each at its exact size.
  It replays the seeded plan in `city.tsx` (CityRig's cluster), so a change to
  that plan has to be made in both; in dev the site warns when the file and
  the plan disagree. It ships as `public/models/blocks.glb`.
- `build_mill.py`: the windmill at the city's edge, a stage mill with a
  railed stage and a boat-shaped cap. It holds one sail's cloth, which the
  site draws four times and sets across the sails when the mill is engaged.
  It ships as `public/models/mill.glb`.
- `build_trafo.py`: the transformer house in front of the tower, a Dutch
  compact substation with the blocks' rounded corners and plinth, an
  overhanging roof, a louvred double door and three insulators on the roof,
  where the tower's power line lands. It ships as `public/models/trafo.glb`.
- `build_rocket.py`: the launch vehicle on the city's pad, a Starship stack:
  Super Heavy (33 engines in its skirt, chines, grid fins, the vented
  hot-staging ring) under Starship (its heat-shield half, forward and aft
  flaps tiled on the same side, six engines). The pad stacks its parts in
  order as projects wake,
  the launch separates the booster's `sh_` parts from the ship's `ss_` parts,
  and the asteroids game flies the ship alone. It ships as
  `public/models/rocket.glb`, and `rocket.tsx` dresses it.
- `build_car.py`: the Lightship Drive cars on the Room's AR table, after the
  game's own: a low wedge with a dark glass cabin, a beltline stripe, fat
  tyres with rim faces, and the flat crown that floats over the leader. It
  ships as `public/models/car.glb`; `room.tsx` (RaceCar, LeaderCrown) gives
  the parts the game's colours, with the stripe's gradient painted on in code.
- `build_headset.py`: the VR headset on the Room's desk, the Virtuele
  Brigade's own kit: a rounded visor with a dark glass front and tracking
  lenses, a foam gasket notched for the nose, and the head strap put down
  behind it (a loop that rises from the desk to the visor, a top strap, a
  cushion and a tension dial). It ships as `public/models/headset.glb`;
  `room.tsx` (VRHeadset) gives the parts their glass, and the dial the accent.

`src/scene/maquette/kit.ts` loads the files, and the layers give every part
the site's own materials.

## Rebuilding

You need Python 3.11 with Blender as a module, and Node for `gltfpack`:

```sh
python3.11 -m venv .venv-bpy && .venv-bpy/bin/pip install "bpy==4.5.*"
PYTHON=.venv-bpy/bin/python scripts/models/build.sh          # all of them
PYTHON=.venv-bpy/bin/python scripts/models/build.sh tower    # just one
```

Each script writes its raw export to `scripts/models/out/` (not committed), and
`build.sh` then compresses it with meshopt into `public/models/`. Add
`--preview` to a script for a clay render in `out/`. `build_chip.py` also takes
part names to build only those (`build_chip.py pkg mon`); `--board` lays every
part out on its slot, and `--cam=x,y,z --target=x,y,z --lens=mm` aim the render.

## Rules the parts follow

- **Site coordinates.** Everything is authored in its layer's own space (Y up):
  the chip's parts with the board's top face at y 0.02, the tower on its plaza
  at the origin with the spire's tip at y 1.0, each block on its own plot's
  origin, the mill on its own with its sails in the hub's space, the
  transformer house on its own plot's origin, the rocket on its axis with its
  skirt on the launch mount at y 0.09, the car on its wheels at y 0 nose to
  +Z, the crown standing on y 0, and the headset resting on y 0 with its
  visor facing +Z. Each is authored around the
  origin its JSX group already uses, and exported without axis conversion, so
  a part drops onto its slot with no offsets in code.
- **One bevel.** Every hard edge gets the same round two-segment bevel. That
  splits a 90° corner into 22.5° + 45° + 22.5°, so the site's 35° outline
  (`<Crease threshold={35}>`, materials.tsx) draws exactly one line per corner,
  on its ridge. The outline only draws folds that turn outward: an inward
  crease (a wall meeting the ledge it stands on) can't be on a silhouette.
- **Bands aren't drawn.** An edge that only traces a band (a podium's or a
  plinth's top, the ledge under the mill's stage) gets `soften()` instead:
  a four-step round the outline passes over, so a ground floor is shaded by
  the glass rather than drawn as a line.
- **Names, not materials.** Each piece is named for what it is
  (`pkg_hbm`, `tower_ribs`, `block3_trim`); the site decides how it's drawn.
  Rename a piece and `kit.ts` and its layer have to follow.
