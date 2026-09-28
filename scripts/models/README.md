# Chip layer models

The chip layer's parts — the board and its silkscreen, the accelerator package,
the patient monitor, the heatsink and fan, and the small parts — are modelled in
Blender from `build_chip.py`, with the shared helpers in `chipkit.py`. They ship
as one file, `public/models/chip.glb`, which `src/scene/maquette/kit.ts` loads
and `chip.tsx` dresses in the site's own materials.

## Rebuilding

You need Python 3.11 with Blender as a module, and Node for `gltfpack`:

```sh
python3.11 -m venv .venv-bpy && .venv-bpy/bin/pip install "bpy==4.5.*"
PYTHON=.venv-bpy/bin/python scripts/models/build-chip.sh
```

`build_chip.py` writes the raw export to `scripts/models/out/` (not committed);
`build-chip.sh` then compresses it with meshopt into `public/models/chip.glb`.
Pass part names to build only those (`build_chip.py pkg mon`), and add
`--preview` for a clay render in `out/` (`--board` lays every part out on its
slot, `--cam=x,y,z --target=x,y,z --lens=mm` aim it).

## Rules the parts follow

- **Site coordinates.** Everything is authored in the chip layer's own space
  (Y up, the board's top face at y 0.02), around the origin its JSX group
  already uses, and exported without axis conversion. A part drops onto its
  slot with no offsets in code.
- **One bevel.** Every hard edge gets the same round two-segment bevel. That
  splits a 90° corner into 22.5° + 45° + 22.5°, so the site's 35° outline
  (`<Edges threshold={35}>`) draws exactly one line per corner, on its ridge.
- **Names, not materials.** Each piece is named for what it is
  (`pkg_hbm`, `mon_controls`, `hs_rotor`); the site decides how it's drawn.
  Rename a piece and `chip.tsx` has to follow.
