// The Svelte screens' build (npm run build / watch): svelte/<group>.js -> gen/<group>.js, one ES module per screen
// group plus the shared runtime chunk (gen/chunks/), minified. The plain modules they import (../ui.js, controls/,
// screens/, read.js) stay external relative imports: served beside gen/ as they are, never bundled twice. Component
// CSS is injected by the JS (no stylesheet to load). gen/ is gitignored; ship-client.sh builds it.
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readdirSync } from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname), src = path.join(here, 'svelte');
const entry = Object.fromEntries(readdirSync(src).filter(f => /^[a-z]+\.js$/.test(f)).map(f => [f.slice(0, -3), path.join(src, f)]));
// external: a relative import from svelte/ that leaves it (a plain htmlui module, or ../ui.js beside htmlui/), never
// one inside node_modules (the runtime's own)
const external = (id, from) => !!from && id.startsWith('.') && from.startsWith(src + path.sep) &&
  !path.resolve(path.dirname(from), id).startsWith(src + path.sep);
export default defineConfig({
  plugins: [svelte({ compilerOptions: { css: 'injected' } })],
  logLevel: 'warn',
  build: {
    outDir: path.join(here, 'gen'), emptyOutDir: true, target: 'es2022', minify: true, copyPublicDir: false,
    lib: { entry, formats: ['es'] },
    rollupOptions: { external, output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js', minify: true } },
  },
});
