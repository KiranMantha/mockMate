/**
 * build-ext.mjs
 * After `vite build`, assembles the final Chrome extension in dist-ext/:
 *   - Vite output (dashboard HTML/JS/CSS)
 *   - Extension manifest
 *   - Content/background/bridge scripts
 *   - Icons
 */
import { cpSync, mkdirSync, rmSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const distExt = resolve(root, 'dist-ext');

// Clean
rmSync(distExt, { recursive: true, force: true });
mkdirSync(distExt, { recursive: true });

// 1. Vite build output (dashboard)
cpSync(resolve(root, 'dist'), distExt, { recursive: true });

// 2. Extension manifest
cpSync(resolve(root, 'extension', 'manifest.json'), resolve(distExt, 'manifest.json'));

// 3. Content / background / bridge scripts
mkdirSync(resolve(distExt, 'src'), { recursive: true });
['content.js', 'background.js', 'bridge.js'].forEach((f) => {
  cpSync(resolve(root, 'extension', 'src', f), resolve(distExt, 'src', f));
});

// 4. Icons
cpSync(resolve(root, 'extension', 'icons'), resolve(distExt, 'icons'), { recursive: true });

console.log('✅ Extension assembled in dist-ext/');
console.log('   Load dist-ext/ as an unpacked extension in Chrome.');
