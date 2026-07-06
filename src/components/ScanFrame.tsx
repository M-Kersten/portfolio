// Razor-thin scanner-frame corner brackets — the "instrument viewport" idiom
// shared by the projects timeline, the About/Contact panels and the About
// portrait. Purely decorative: the four L-shaped corners are drawn by
// `.scanframe i` in global.css. `variant` picks the inset/scale via a modifier.
export function ScanFrame({ variant }: { variant?: 'section' | 'portrait' }) {
  const cls = variant ? `scanframe scanframe--${variant}` : 'scanframe';
  return (
    <span className={cls} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
