// The load fade-up: the page opens on the near-black frame colour and clears over
// the first beat and a half, while CameraRig's dolly is already pushing in — so
// the site fades in from black *as* it zooms rather than simply appearing.
//
// Deliberately pure CSS off mount rather than a timer: the rest of the boot
// sequence is choreographed in wall-clock ms from `bootAt`, and a JS-driven fade
// would be the one part that could drift against it if the first frame is slow.
// `--paper` is also the 3D background, so the veil is invisible against both the
// pre-React paint and the scene behind it — only its opacity reads.
export function BootVeil() {
  return <div className="boot-veil" aria-hidden="true" />;
}
