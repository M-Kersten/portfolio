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
  origin, the mill on its own with its sails in the hub's space. Each is
  authored around the origin its JSX group already uses, and exported without
  axis conversion, so a part drops onto its slot with no offsets in code.
- **One bevel.** Every hard edge gets the same round two-segment bevel. That
  splits a 90° corner into 22.5° + 45° + 22.5°, so the site's 35° outline
  (`<Edges threshold={35}>`) draws exactly one line per corner, on its ridge.
- **Names, not materials.** Each piece is named for what it is
  (`pkg_hbm`, `tower_ribs`, `block3_trim`); the site decides how it's drawn.
  Rename a piece and `kit.ts` and its layer have to follow.
