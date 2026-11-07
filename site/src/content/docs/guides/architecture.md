---
title: How it's built
description: How the KITTY Vue package is built in isolation, and how this Astro + Starlight site hosts it as an island.
---

The repository is a [Bun workspace](https://bun.sh/docs/install/workspaces) with two packages that are built separately:

```
kitty-event-bus-client/
├── kitty/        kitty-event-bus-client: the Vue 3 app & component library (Vite)
│   ├── src/              App.vue (KittyApp), components/, audio/, events/, style.css
│   │   ├── index.ts         library entry (ES module)
│   │   ├── standalone.ts    drop-in entry (IIFE, window.KittyEventBus)
│   │   └── main.ts          standalone dev/test harness
│   ├── public/tts/       pre-synthesized neural TTS MP3s
│   ├── vite-plugin-tts.mjs   kittyTtsProxy(): dev-only live TTS middleware
│   └── tests/            Playwright suite for the app on its own
├── site/         kitty-site: this Astro + Starlight site (private)
│   ├── src/pages/speaker.astro    the island page
│   ├── src/components/LiveKitty.vue  KittyApp + optional ?nats= live connection
│   ├── src/content/docs/          these docs
│   ├── public/examples/standalone/ plain-HTML drop-in example
│   ├── scripts/sync-kitty.ts      copies static package assets into public/kitty/
│   └── tests/            Playwright suite for the site
├── nats/         kitty-dev.conf: a local NATS server with WebSocket (`make nats`)
├── package.json  workspace root ("workspaces": ["kitty", "site"])
└── Makefile      builds kitty first, then the site
```

The rule: **`kitty/` knows nothing about the site.** It has no Astro dependency, and the site never imports from `kitty/src`. The site depends on `"kitty-event-bus-client": "workspace:*"` and only uses the package's public `exports`, the same entry points an outside project would use from npm.

## How the Vue package is built

`kitty/vite.config.ts` is one config with several modes:

| Command (`kitty/`) | Output | What it is |
| :--- | :--- | :--- |
| `bun run dev` | dev server on :4321 | The standalone harness (`index.html` → `src/main.ts`), with the `/api/tts` proxy. Use it for component work. |
| `bun run build:lib` | `dist/kitty-event-bus-client.js`, `dist/style.css`, `dist/tts/` | **ES module library.** `vue` is external (a peer dependency), so the host app's Vue is used. `public/` is copied into `dist/`, which ships the MP3s. |
| `bun run build:standalone` | `dist/kitty-event-bus-client.iife.js` | **Drop-in build.** Vue is bundled in. Defines `window.KittyEventBus.mount()`. |
| `bun run build:types` | `dist/types/` | `.d.ts` declarations (`vue-tsc`). |
| `bun run build` | all of the above | Type-checks first. This is what `make kitty-build` runs. |
| `bun run build:app` | `dist-app/` | The harness as a static page. Only kitty's own tests use it. It is not deployed. |

The package's `exports` map is its public interface:

| Import | File |
| :--- | :--- |
| `kitty-event-bus-client` | `dist/kitty-event-bus-client.js` (+ `dist/types/index.d.ts`) |
| `kitty-event-bus-client/style.css` | `dist/style.css` |
| `kitty-event-bus-client/standalone` | `dist/kitty-event-bus-client.iife.js` |
| `kitty-event-bus-client/tts/*` | `dist/tts/*` |
| `kitty-event-bus-client/vite` | `vite-plugin-tts.mjs` (`kittyTtsProxy`) |

`style.css` is built from Tailwind v4 **theme + utilities only**. It leaves out Tailwind's global preflight and adds a small reset scoped to `.kitty-app`, so loading KITTY can't restyle a host page. That matters here: Starlight's own styles stay intact.

## How the site hosts it

```
make build
  └─ kitty:  bun run build ──────────────► kitty/dist/
                                              │  (workspace:* link, via package "exports")
  └─ site:   scripts/sync-kitty.ts ── copies dist/tts, iife.js, style.css ─► site/public/kitty/
             astro build
               ├─ src/content/docs/**  → Starlight pages
               ├─ src/pages/speaker.astro
               │    import 'kitty-event-bus-client/style.css'
               │    <LiveKitty client:only="vue" ttsBaseUrl=".../kitty/tts/" docsUrl=".../" />
               │      └─ src/components/LiveKitty.vue
               │           import { KittyApp, natsConnectionBus } from 'kitty-event-bus-client'
               │           ?nats=ws://… → wsconnect() → <KittyApp :bus="natsConnectionBus(nc)" />
               └─ public/** (kitty/, examples/standalone/, favicon) copied as-is
                                              ▼
                                         site/dist/ ──► GitHub Pages
```

1. **The island.** [`speaker.astro`](https://github.com/infrashift/kitty-event-bus-client/blob/main/site/src/pages/speaker.astro) is a standalone page outside the Starlight layout, because KITTY is a one-viewport app. `@astrojs/vue` renders the site's [`LiveKitty.vue`](https://github.com/infrashift/kitty-event-bus-client/blob/main/site/src/components/LiveKitty.vue) as an Astro island with `client:only="vue"`: Astro ships an `<astro-island>` element, then loads Vue and the component in the browser and mounts it there. Astro gives islands `display: contents`, so KITTY's layout is unaffected.
2. **Props are the interface.** The page passes `ttsBaseUrl` (where the MP3s are served), `ttsProxyUrl` (the dev proxy under `astro dev`, `null` in production) and `docsUrl` (the "docs" link back to this site). `LiveKitty` forwards them to the package's `KittyApp`. When the URL has `?nats=ws://…`, it also loads `@nats-io/nats-core` on demand, connects, and passes `bus={natsConnectionBus(nc)}`. A live connection can't be a server-rendered prop, which is why this thin wrapper exists. See [Connect to a live NATS server](/kitty-event-bus-client/guides/live-nats/).
3. **Static assets.** Astro only bundles what JavaScript imports, and the MP3s are fetched at runtime. So `sync-kitty.ts` resolves the package through `import.meta.resolve('kitty-event-bus-client/package.json')` and copies `dist/tts/`, the IIFE and `style.css` into `site/public/kitty/` (gitignored). It fails with a clear message if `kitty` hasn't been built.
4. **Dev TTS.** `astro.config.mjs` adds `kittyTtsProxy()` from `kitty-event-bus-client/vite` to Astro's Vite config, so custom messages get neural speech under `make dev`.
5. **Theme.** A tiny inline script on the speaker page applies `localStorage['starlight-theme']` before first paint. KITTY reads and writes the same key, so the docs theme picker and the cat's toggle stay in sync.
6. **The drop-in example.** [`/examples/standalone/`](/kitty-event-bus-client/examples/standalone/) is a hand-written HTML file that loads the IIFE build from `public/kitty/`. It is a tested proof that the no-bundler path works.

## Tests and CI

- `kitty/tests/` checks the app on its own (the harness build) on six screen sizes: viewport fit, speech chunking, lasers, inspector, theme, calibration.
- `site/tests/` checks the docs pages, links, the theme hand-off, the `/speaker/` island, the hosted MP3s, the standalone example, and that KITTY's CSS doesn't leak into Starlight pages.
- `site/tests/live-nats.spec.ts` runs against a real `nats-server` when `NATS_WS_URL` is set. It publishes structured- and binary-mode CloudEvents from Node and checks that the cat speaks them, on both the island and the plain-HTML example.
- [`.github/workflows/deploy.yml`](https://github.com/infrashift/kitty-event-bus-client/blob/main/.github/workflows/deploy.yml) starts a NATS server (`make nats CONTAINER=docker`) and runs `make test` with `NATS_WS_URL` set, on every push and PR. On `main` it then runs `make build` and deploys `site/dist/` to GitHub Pages.
