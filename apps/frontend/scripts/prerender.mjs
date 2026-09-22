#!/usr/bin/env node
/**
 * Build-time prerender of public routes (SEO plan 2.1).
 * Prereq: `vite build` (→ dist/) and `vite build --ssr src/entry-server.tsx --outDir dist-ssr`.
 * Writes one static HTML file per route in src/seo/public-routes.ts. See outputPathFor().
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeStyleBlocks, injectHead, injectRoot, outputPathFor } from './prerender-lib.mjs';

// App stores read browser storage at module load. Prerender snapshots what a first-time,
// logged-out visitor sees, so give them empty in-memory storage (build process only).
class MemoryStorage {
  #m = new Map();
  get length() { return this.#m.size; }
  key(i) { return [...this.#m.keys()][i] ?? null; }
  getItem(k) { return this.#m.has(k) ? this.#m.get(k) : null; }
  setItem(k, v) { this.#m.set(k, String(v)); }
  removeItem(k) { this.#m.delete(k); }
  clear() { this.#m.clear(); }
}
for (const name of ['localStorage', 'sessionStorage']) {
  if (!(name in globalThis)) globalThis[name] = new MemoryStorage();
}

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(appDir, 'dist');
const ssrEntry = path.join(appDir, 'dist-ssr', 'entry-server.js');

const { render, PUBLIC_ROUTES, canonicalUrl } = await import(pathToFileURL(ssrEntry).href);
const template = await readFile(path.join(distDir, 'index.html'), 'utf8');

for (const route of PUBLIC_ROUTES) {
  const appHtml = decodeStyleBlocks(await render(route.path));
  const html = injectRoot(injectHead(template, route, canonicalUrl(route.path)), appHtml);
  const outFile = path.join(distDir, outputPathFor(route.path));
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, html, 'utf8');
  console.log(`prerender: ${route.path} → ${path.relative(appDir, outFile)} (${html.length} bytes)`);
}
