// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import vue from '@astrojs/vue';
import { existsSync } from 'node:fs';
// The site uses the kitty package only through its published entry points (see package.json "exports").
import { kittyTtsProxy } from 'kitty-event-bus-client/vite';

const BASE = '/kitty-event-bus-client';

const REPO = 'https://github.com/infrashift/kitty-event-bus-client';

/**
 * Dev-only: serve `public/<dir>/index.html` for `/<base>/<dir>` and `/<base>/<dir>/`,
 * matching GitHub Pages and `astro preview`. (Vite's dev server doesn't resolve directory
 * indexes for files in `public/`, so `/examples/standalone/` would 404 in `make dev`.)
 */
const publicDirectoryIndex = {
  name: 'public-directory-index',
  hooks: {
    'astro:server:setup': ({ server }) => {
      server.middlewares.use((req, res, next) => {
        const [path, query = ''] = (req.url ?? '').split('?');
        // Astro may already have stripped the base from req.url, so accept it either way.
        const match = path.match(new RegExp(`^(?:${BASE})?/(.+?)/?$`));
        const dir = match?.[1];
        if (dir && !dir.includes('.') && existsSync(`public/${dir}/index.html`)) {
          const q = query ? `?${query}` : '';
          if (!path.endsWith('/')) {
            res.writeHead(301, { Location: `${BASE}/${dir}/${q}` });
            return res.end();
          }
          req.url = `${path.startsWith(BASE + '/') ? BASE : ''}/${dir}/index.html${q}`;
        }
        next();
      });
    },
  },
};

// https://astro.build/config
export default defineConfig({
  // Served from GitHub Pages as a project site: https://infrashift.github.io/kitty-event-bus-client/
  site: 'https://infrashift.github.io',
  base: BASE,
  integrations: [
    publicDirectoryIndex,
    // Renders the kitty package's Vue components as Astro islands (see src/pages/speaker.astro).
    vue(),
    starlight({
      title: 'KITTY',
      description:
        'KITTY, CloudEvent NATS Speaker (猫・イベントバス) — an enterprise-grade feline CNCF CloudEvents v1.0 NATS consumer, formant vocalizer & ocular laser incident responder by Infrashift.io.',
      logo: { light: './src/assets/logo-light.svg', dark: './src/assets/logo-dark.svg', alt: 'KITTY event bus cat logo' },
      favicon: '/favicon.svg',
      social: [
        { icon: 'github', label: 'GitHub', href: REPO },
        { icon: 'external', label: 'Infrashift.io', href: 'https://infrashift.io' },
      ],
      editLink: { baseUrl: `${REPO}/edit/main/site/` },
      lastUpdated: true,
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        { label: 'Launch the Speaker', link: '/speaker/', attrs: { target: '_self' } },
        { label: 'Features', slug: 'features' },
        {
          label: 'Guides',
          items: [
            { label: 'Running KITTY', slug: 'guides/running' },
            { label: 'CloudEvents & NATS', slug: 'guides/cloudevents' },
            { label: 'Connect to live NATS', slug: 'guides/live-nats' },
            { label: 'Voices & vocalizer', slug: 'guides/voices' },
            { label: 'Calibration', slug: 'guides/calibration' },
          ],
        },
        {
          label: 'Developers',
          items: [
            { label: 'Use KITTY in your app', slug: 'guides/embedding' },
            { label: "How it's built", slug: 'guides/architecture' },
            { label: 'Local development', slug: 'guides/development' },
          ],
        },
        { label: 'Changelog', slug: 'changelog' },
        { label: 'Contributing', slug: 'contributing' },
        { label: 'Sponsor', slug: 'sponsor' },
        { label: 'License', slug: 'license' },
      ],
    }),
  ],
  vite: {
    // Dev-only live neural TTS for messages without a pre-synthesized MP3 (`…/api/tts`).
    // GitHub Pages is static, so production uses public/kitty/tts/*.mp3 + Web Speech fallback.
    plugins: [kittyTtsProxy()],
  },
});
