import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Minimal local declaration so the config typechecks without pulling all of
// @types/node into the app's type space.
declare const process: { env: Record<string, string | undefined> };

// Base path is environment-driven so one build serves both deploy targets:
//   - Vercel / custom domain (served at root):  VITE_BASE unset  -> "/"
//   - GitHub Pages project site:                VITE_BASE="/portfolio/"
// Asset and route helpers read import.meta.env.BASE_URL, so nothing else changes.
const base = process.env.VITE_BASE ?? '/';

// In production builds, swap leva for an empty stub. The dev-only object
// scrubber (src/scene/devTweak.ts) imports leva, but its code path is compiled
// out of prod; leva ships no `sideEffects` flag, so without this alias Rollup
// would still bundle its ~180KB graph to satisfy the dead import. Dev keeps the
// real leva so the panel works. See src/scene/leva-stub.ts.
const levaStub = new URL('./src/scene/leva-stub.ts', import.meta.url).pathname;

export default defineConfig(({ command }) => {
  const alias: Record<string, string> = command === 'build' ? { leva: levaStub } : {};
  return {
    base,
    plugins: [react()],
    resolve: { alias },
    build: {
      target: 'es2020',
      // Keep three/R3F out of the home-route entry chunk so the 30-second text
      // path and first paint never wait on the WebGL stack (perf budget, §10).
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (/three|@react-three/.test(id)) return 'three';
              if (/react-router/.test(id)) return 'router';
            }
          },
        },
      },
    },
  };
});
