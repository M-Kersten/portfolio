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

export default defineConfig({
  base,
  plugins: [react()],
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
