import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// P1-12, P1-15, RF-1013: the front end builds into dist/web/ for the Fastify static server (P1-07). The
// server answers only `/`, `/sign-in` and files under `/assets/` without a session (P1-09), so
// every built file except index.html lands under `assets/`; the public folder holds only `assets/brand/`
// (DEC-161), because a file at the root, such as a favicon, would need a session. There is no inline script or style (the
// content security policy allows neither). The landing page (P1-15) is written by the server, which
// links its style sheet as /assets/landing.css, so that one file keeps a name without a hash.
const webRoot = fileURLToPath(new URL('.', import.meta.url));
const apiTarget = 'http://127.0.0.1:8080';

export default defineConfig({
  root: webRoot,
  publicDir: fileURLToPath(new URL('public/', import.meta.url)),
  plugins: [preact()],
  build: {
    outDir: fileURLToPath(new URL('../dist/web/', import.meta.url)),
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false,
    // The preload polyfill is extra code the front end does not need in current browsers.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        landing: fileURLToPath(new URL('src/landing/landing.css', import.meta.url)),
      },
      output: {
        assetFileNames: (asset) =>
          asset.names.includes('landing.css')
            ? 'assets/landing.css'
            : 'assets/[name]-[hash][extname]',
      },
    },
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
