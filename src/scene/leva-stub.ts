// Production stand-in for `leva`, wired up in vite.config.ts.
//
// The dev-only position scrubber (src/scene/devTweak.ts) imports `useControls`
// from leva, but that whole code path is compiled out of production builds
// (`import.meta.env.DEV` is statically `false`). leva declares no `sideEffects`
// flag, so Rollup would otherwise still pull its ~180KB graph (emotion,
// react-colorful, zustand) into the bundle just to satisfy the now-dead import.
// Aliasing leva to this empty, side-effect-free module during `vite build`
// keeps it out of production entirely. Dev (`vite`) uses the real leva.
export const useControls = (): Record<string, never> => ({});
