# Bake a district — 3DBAG → `public/models/<id>.glb`

The "digital twin" is real Dutch building data, prepared **once, offline** into an
ordinary glTF binary and then loaded like any other asset (build spec §5). No
live tiles, no runtime geospatial math. Do this once per district; every other
district is the same recipe.

> **Licence (non-negotiable, §5.6).** 3DBAG is open data, free to use, but its
> copyright notice must be shown wherever the data appears. The twin scene and
> the footer already render the credit. If you add an aerial drape, add the PDOK
> credit too. Don't remove either.

---

## What you need

- **[Blender](https://www.blender.org/)** (free). All the real work is here, and
  it's Blender work, not GIS plumbing.
- Optional: **[`gltf-transform`](https://gltf-transform.dev/)** CLI for
  compression — only if the plain `.glb` is too big.
  `npm i -g @gltf-transform/cli`

## Steps

### 1. Get the data

Open the **3DBAG download page** (<https://3dbag.nl> → Downloads). Find the
tile(s) covering your district and download **LoD2.2** (full roof shapes) as
**Wavefront OBJ** or **CityJSON**. You only need the small area around your
district — never the whole country.

### 2. Crop and centre in Blender

This single step replaces all the runtime coordinate math the streaming approach
needed.

1. `File ▸ Import` the OBJ/CityJSON tile.
2. Delete everything outside your district (box-select + `X`).
3. Select all remaining buildings, then move them so the **district centre sits
   at the world origin (0, 0, 0)**. A quick way: `Shift+S ▸ Cursor to Selected`
   to drop the 3D cursor on the selection centre, then `Object ▸ Set Origin ▸
   Origin to 3D Cursor`, then `Alt+G` to clear location.
4. 3DBAG is Z-up in metres; this project (three.js) is **Y-up in metres**. On
   export, tick **+Y up** (glTF default) so the model lands flat. If it comes in
   on its side, rotate −90° about X and apply the transform.

Keep the scale in **metres** — the camera framings in `src/data/places.ts`
(`distance`, `min/maxDistance`) assume a district roughly 100–150 m across.

### 3. Tidy materials

- Assign the flat slate building material (one shared material is enough; see the
  palette in `src/ui/tokens.css` — `--model-mid #6B8CA3` / `--model-deep
  #46627A`). Matte, low-spec; the scene's lighting does the rest.
- **Single merged mesh** = fewest draw calls, fastest. Do this if you only need
  to look at the district.
- **Keep buildings as separate objects, named by their BAG id** = enables
  per-building hover/click later (§5.5). Costlier; merge the ones you don't need
  to pick.

### 4. (Optional) Bake the data colours in — the part that makes it GIS

Loading buildings is table stakes; *reading the attributes* is the capability
claim (§5.5). 3DBAG carries `bouwjaar` (construction year), height and roof
surface area per building. Tint each building by one attribute and export that —
the site then just loads a pre-coloured model, zero runtime logic.

The live attribute toggle in the running site (Year / Height / Roof area) is the
*runtime* version of this. To wire it to a baked model you'd keep buildings as
named objects and ship a sidecar `src/data/<id>.attributes.json` mapping BAG id →
values; until then the toggle drives the procedural placeholder.

### 5. Export `.glb`

`File ▸ Export ▸ glTF 2.0`, format **glTF Binary (.glb)**. Save to:

```
public/models/<id>.glb
```

where `<id>` matches a registry entry in `src/data/places.ts`. That's it — the
twin auto-detects the file (HEAD check) and renders it instead of the
placeholder, with the proper 3DBAG attribution.

### 6. (Optional) Compress — only if it's too big

A single district is small; ship the plain `.glb` first. If it exceeds a few MB:

```bash
gltf-transform optimize public/models/<id>.glb public/models/<id>.glb \
  --compress draco
```

`useGLTF` (drei) supports Draco/meshopt decoders. If you compress, register the
matching decoder on the loader — see the drei `useGLTF` docs. Skipping this keeps
setup simpler.

---

## Register the place (tailored twin, §5.8)

Add one entry to `PLACES` in `src/data/places.ts`:

```ts
{
  id: 'arnhem',                    // url-safe; the value of ?place=
  label: 'Arnhem',
  model: '/models/arnhem.glb',     // what you just exported
  view: { distance: 220, pitch: 50, bearing: -25 },
  attribute: 'roof_area',
  dedication: 'Framed for the Municipality of Arnhem', // optional, quiet
}
```

Then share `…/work/municipal-twin?place=arnhem`. Selection is **allowlist-only**:
`?place=` can only choose an id that already exists here, and never carries
coordinates, so no crafted link can aim the scene anywhere you didn't bake and
compose (§5.8).

**Constraints:** recognisable, public, non-sensitive locations only. No private
residences, no defence sites, nothing that reads as surveillance. Test the
framing on a friendly contact before sending to a stranger.

## Add a static poster (recommended)

For the no-WebGL / low-power fallback, drop a still render at
`public/posters/<id>.jpg` (a Blender viewport render is fine) so corporate
viewers who never get the 3D still see a good image. The built-in SVG poster is
the default until then.
