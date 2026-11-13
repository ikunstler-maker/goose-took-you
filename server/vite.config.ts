import { defineConfig } from 'vite';

/** Bundles the game server (and the sim it runs) into one file for Node. */
export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'server/index.ts',
    outDir: 'server/dist',
    emptyOutDir: true,
    target: 'node22',
  },
});
