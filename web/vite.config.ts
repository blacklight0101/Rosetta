import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// P1-12, RF-1013: the front end builds into dist/web/ for the Fastify static server (P1-07). The
// server answers only `/`, `/sign-in` and files under `/assets/` without a session (P1-09), so
// every built file except index.html lands under `assets/`: there is no public folder (a
// favicon or robots file at the root would need a session) and no inline script or style (the
// content security policy allows neither).
const webRoot = fileURLToPath(new URL('.', import.meta.url));
const apiTarget = 'http://127.0.0.1:8080';

export default defineConfig({
  root: webRoot,
  publicDir: false,
  plugins: [preact()],
  build: {
    outDir: fileURLToPath(new URL('../dist/web/', import.meta.url)),
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false,
    // The preload polyfill is extra code the front end does not need in current browsers.
    modulePreload: { polyfill: false },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // The development server forwards the API to a local Rosetta server; it presents the server's
    // own origin so the Origin check of state-changing requests (RF-1009) passes.
    proxy: { '/api': { target: apiTarget, headers: { origin: apiTarget } } },
  },
});
