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

// @react-three/drei's barrel eagerly pulls optional peers we never use — `stats.js`
// (<Stats>) and `@react-spring/types` (a types-only package with no runtime entry).
// On some machines Vite's dep pre-bundler can't resolve those and `npm run dev`
// dies. Alias them to an empty module so resolution always succeeds; safe because
// none of that drei code is rendered. See src/lib/empty.ts.
//
// `.pathname` (not `fileURLToPath`, which needs @types/node — see the `process`
// note above) keeps a leading slash in front of a Windows drive letter, e.g.
// "/C:/Users/x/portfolio/...". That's spec-correct for a URL but isn't a valid
// filesystem path, and esbuild's resolver re-rooted it against the project dir,
// doubling the drive into "C:\C:\Users\...\empty.ts" — hence the decode +
// drive-letter strip below (a no-op on POSIX, where pathname is already right).
const emptyStub = decodeURIComponent(new URL('./src/lib/empty.ts', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      'stats.js': emptyStub,
      '@react-spring/types': emptyStub,
    },
  },
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
});
