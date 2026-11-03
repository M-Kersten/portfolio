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
  Brigade's own kit, after a Meta Quest 3: a soft, pillow-shaped white visor
  with three dark sensor pills down its front, a foam face pad notched for the
  nose, short white arms, and a grey fabric strap put down behind it (a loop
  that drops from the arms to the desk, and a top strap). It ships as
  `public/models/headset.glb`; `room.tsx` (VRHeadset) gives the parts their glass.
- `build_table.py`: the Lightship Drive table in the Room, after the show-floor
  setup in the project's film: a low mid-century table (a rounded top with an
  eased edge, an apron, four tapered legs splayed out to the floor), and the
  light-blue faceted pieces set out on its mat, a kicker the cars jump off and
  a crystal pyramid. It ships as `public/models/table.glb`; `room.tsx`
  (CoffeeTableAR) lays out the mat, the AR course over the kicker and round
  the pyramids, and the race on it. The course is draped over the kicker's
  face, so a change to the kicker's size or facets has to be made in
  `RAMP_FACE` there too.
- `build_camera.py`: the Custom AR framework's camera on the chip layer, a
  bullet CCTV camera made in the chip kit's idiom (rounded housings, the kit
  bevel, deep bodies with pale fittings and a glass stand): a housing under a
  sun visor, a dark front panel with a ring of IR LEDs round the lens, a cable
  gland and pigtail on the back, on a post with a ball joint. It ships as
  `public/models/camera.glb`; `chip.tsx` (SecurityCamera) nods and pans the
  head on the ball, racks the lens, lights the IR ring and throws the beam.
- `build_phone.py`: the Popcore phone on the Room's couch, a current handset
  with soft edges, side keys and a three-lens camera island on its back. It
  lies face down, so the island is what reads as a phone from across the room.
  It ships as `public/models/phone.glb`; `room.tsx` (Phone) draws the screen
  over its front and turns it over when it's opened.

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
  +Z, the crown standing on y 0, the headset resting on y 0 with its
  visor facing +Z, the table on the floor with its top's surface at y 0.19,
  and the kicker and pyramid standing on y 0, the kicker rising toward +Z;
  the camera's mount on the board's top at y 0 with its head in the ball
  joint's own frame, and the phone centred on its own origin with its screen
  facing +Z. Each is authored around the
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
