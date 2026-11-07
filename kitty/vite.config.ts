import { defineConfig, type UserConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { kittyTtsProxy } from './vite-plugin-tts.mjs';

/**
 * One config, three builds (selected with `--mode`):
 *
 *   vite                          dev harness (index.html → src/main.ts) with the /api/tts proxy
 *   vite build --mode app         harness build → dist-app/   (what kitty's Playwright suite tests)
 *   vite build --mode lib         ES library   → dist/kitty-event-bus-client.js + style.css + tts/
 *                                 (`vue` stays external: it's a peer dependency)
 *   vite build --mode standalone  drop-in IIFE → dist/kitty-event-bus-client.iife.js
 *                                 (Vue bundled in, exposes `window.KittyEventBus`)
 *
 * None of these know anything about the Astro site; the site consumes `dist/` like any other user.
 */
export default defineConfig(({ mode }): UserConfig => {
  const shared: UserConfig = {
    plugins: [vue(), tailwindcss(), kittyTtsProxy()],
    server: { port: 4321, host: '0.0.0.0' },
    preview: { port: 4322, host: '127.0.0.1' },
  };

  if (mode === 'lib') {
    return {
      ...shared,
      build: {
        outDir: 'dist',
        emptyOutDir: true,
        copyPublicDir: true, // ships public/tts/*.mp3 as dist/tts/
        lib: {
          entry: 'src/index.ts',
          formats: ['es'],
          fileName: () => 'kitty-event-bus-client.js',
          cssFileName: 'style',
        },
        rollupOptions: { external: ['vue'] },
      },
    };
  }

  if (mode === 'standalone') {
    return {
      ...shared,
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      build: {
        outDir: 'dist',
        emptyOutDir: false, // runs after the lib build
        copyPublicDir: false,
        lib: {
          entry: 'src/standalone.ts',
          formats: ['iife'],
          name: 'KittyEventBus',
          fileName: () => 'kitty-event-bus-client.iife.js',
          cssFileName: 'style',
        },
      },
    };
  }

  // Dev server and `--mode app` harness build.
  return {
    ...shared,
    base: './',
    build: { outDir: 'dist-app', emptyOutDir: true },
  };
});
