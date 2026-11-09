import { defineConfig } from 'vite';

// The client lives in client/. In dev, Vite serves it on :5173 and proxies the
// WebSocket at /ws to the game server on :3000. In production the game server
// serves the built files from dist/client itself.
export default defineConfig({
  root: 'client',
  publicDir: 'public',
  build: { outDir: '../dist/client', emptyOutDir: true, sourcemap: true },
  server: {
    port: 5173,
    proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
});
