import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';
export default defineConfig({
  root: 'src/offline',
  base: '/offline/',
  plugins: [svelte({ configFile: false })],
  build: { outDir: resolve('static/offline'), emptyOutDir: true },
  publicDir: false,
});
