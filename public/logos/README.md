# Company logos (career timeline tooltips)

Drop a PNG logo here for each employer and it shows in that stint's tooltip on
the Projects timeline. Filenames must match the `logo` paths in
`src/content/site.json`:

- `letink.png` — Letink Design
- `dtt.png` — DTT
- `popcore.png` — Popcore
- `wonderment.png` — Wonderment
- `philips.png` — Philips
- `alliander.png` — Alliander
- `zwijsen.png` — Zwijsen
- `kmar.png` — Koninklijke Marechaussee

Notes:
- Use a **transparent PNG** at a decent size (~64–128px tall renders crisp).
- The tooltip is dark, so **white / light marks** read best (they sit straight
  on the dark panel, no chip behind them).
- Any company without a file here falls back to its website favicon, then to
  nothing — so missing logos never break the tooltip.
