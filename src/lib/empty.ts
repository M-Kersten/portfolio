// Empty stand-in module, wired up as a resolve alias in vite.config.ts.
//
// @react-three/drei's barrel entry eagerly re-exports components we never use —
// <Stats>/<StatsGl> (which import `stats.js`) and spring-driven helpers (which
// pull `@react-spring/types`, a types-only package with no runtime entry). On
// some machines Vite's dep pre-bundler fails to resolve those, breaking
// `npm run dev`. Aliasing them to this empty module sidesteps the resolution
// entirely; it's safe because that drei code is never rendered here. A default
// export covers `import Stats from 'stats.js'`; no named exports are needed for
// `export * from '@react-spring/types'`.
export default {};
