/**
 * Copies the static, framework-free parts of the built `kitty-event-bus-client` package into
 * `public/kitty/` so they are served alongside the site:
 *
 *   public/kitty/tts/*.mp3                       pre-synthesized neural TTS (used by the /speaker/ island)
 *   public/kitty/kitty-event-bus-client.iife.js  standalone drop-in build (used by /examples/standalone/)
 *   public/kitty/style.css                       its stylesheet
 *
 * The package is resolved through its published `exports`, exactly as in any consumer project,
 * so this fails loudly if `kitty` hasn't been built yet (`make kitty-build`).
 * `public/kitty/` is generated — it is gitignored.
 */
import { cpSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = dirname(fileURLToPath(import.meta.resolve('kitty-event-bus-client/package.json')));
const dist = join(pkgDir, 'dist');
const out = fileURLToPath(new URL('../public/kitty/', import.meta.url));

const files = ['tts', 'kitty-event-bus-client.iife.js', 'style.css'];
for (const f of files) {
  if (!existsSync(join(dist, f))) {
    console.error(`sync-kitty: ${join(dist, f)} is missing. Build the package first: make kitty-build`);
    process.exit(1);
  }
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of files) cpSync(join(dist, f), join(out, f), { recursive: true });
console.log(`sync-kitty: copied ${files.join(', ')} from ${dist} → public/kitty/`);
