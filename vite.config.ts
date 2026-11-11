import { defineConfig } from 'vite';

// The client lives in client/. In dev, Vite serves it on :5173 and proxies the
// WebSocket at /ws to the game server on :3000. In production the game server
// serves the built files from dist/client itself.
export default defineConfig({
  root: 'client',
  publicDir: 'public',
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        // three.js in its own file: it changes far less often than the game, so
        // browsers keep it cached across updates, and both download in parallel.
        manualChunks: (id) => (id.includes('/node_modules/three/') ? 'three' : undefined),
      },
    },
    // The three.js chunk alone is ~500 kB minified (~125 kB gzipped); the warning would only repeat that.
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
});
