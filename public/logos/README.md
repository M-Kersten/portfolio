# Company logos (career timeline tooltips)

Drop a logo here for each employer and it shows in that stint's tooltip on the
Projects timeline. Filenames must match the `logo` paths in
`src/content/site.json`:

- `letink.svg` — Letink Design
- `dtt.svg` — DTT
- `popcore.svg` — Popcore
- `wonderment.svg` — Wonderment
- `philips.svg` — Philips
- `alliander.svg` — Alliander
- `marechaussee.svg` — Koninklijke Marechaussee

Notes:
- **SVG preferred** (crisp at any size). PNG works too — just change the
  extension in `site.json` to match (e.g. `"logo": "/logos/dtt.png"`).
- The tooltip is dark, so **white / light marks** read best (they sit straight
  on the dark panel, no chip behind them).
- Any company without a file here falls back to its website favicon, then to
  nothing — so missing logos never break the tooltip.
