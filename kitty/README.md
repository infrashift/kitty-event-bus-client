# kitty-event-bus-client

**KITTY, CloudEvent NATS Speaker (猫・イベントバス).** A Vue 3 cat that consumes CNCF CloudEvents v1.0 from NATS, reads them aloud through a Terry Gilliam paper-cutout jaw, and fires ocular plasma lasers at `error` / `critical` events.

📖 Docs: **https://infrashift.github.io/kitty-event-bus-client/** · 🐱 Live: [/speaker/](https://infrashift.github.io/kitty-event-bus-client/speaker/)

This package is built independently of the docs site. The site consumes it through the same `exports` listed below.

## Install

```bash
bun add kitty-event-bus-client vue        # vue is a peer dependency
bun add @nats-io/nats-core                # only if you connect to a live NATS server
```

## Use

**Vue**

```vue
<script setup lang="ts">
import { KittyApp } from 'kitty-event-bus-client';
import 'kitty-event-bus-client/style.css';
</script>

<template>
  <KittyApp tts-base-url="/kitty/tts/" />
</template>
```

**Astro**: `<KittyApp client:only="vue" ttsBaseUrl="/kitty/tts/" />` with `@astrojs/vue`.

**Any page, no bundler**:

```html
<link rel="stylesheet" href="/kitty/style.css">
<div id="cat"></div>
<script src="/kitty/kitty-event-bus-client.iife.js"></script>
<script>KittyEventBus.mount('#cat', { ttsBaseUrl: '/kitty/tts/' });</script>
```

**Live NATS** (the server needs its WebSocket listener enabled):

```ts
import { wsconnect } from '@nats-io/nats-core';
import { mountKitty, natsConnectionBus } from 'kitty-event-bus-client';

const nc = await wsconnect({ servers: 'wss://nats.example.com' });
mountKitty('#cat', { bus: natsConnectionBus(nc), subject: 'cncf.>', ttsBaseUrl: '/kitty/tts/' });
```

Both CloudEvents NATS binding modes are decoded: structured (a JSON envelope) and binary (`ce-*` headers). Guide: [Connect to a live NATS server](https://infrashift.github.io/kitty-event-bus-client/guides/live-nats/).

## Options (`<KittyApp>` props / `mountKitty` options)

| Option | Default | |
| :--- | :--- | :--- |
| `ttsBaseUrl` | `'./tts/'` | Where you host this package's `dist/tts/*.mp3`. |
| `ttsProxyUrl` | `null` | Live TTS endpoint, e.g. `kittyTtsProxy()` in dev. |
| `docsUrl` | — | Shows a "docs" link. |
| `bus` | in-browser demo bus | A `CloudEventBus`, e.g. `natsConnectionBus(nc)`. |
| `subject` | `'cncf.>'` | NATS subject to subscribe to. |
| `allowPublish` | `false` for a live bus | Let the demo buttons publish to a live bus, inside `subject`. |
| `pageTheme` | `true` | Sync dark mode with `<html>` + `localStorage['starlight-theme']`; `false` keeps it inside KITTY. |

Size it with the CSS variable `--kitty-height` (default `100dvh`). `style.css` has no global reset; KITTY's reset is scoped to `.kitty-app`.

## Exports

| Import | What |
| :--- | :--- |
| `kitty-event-bus-client` | `KittyApp`, `KittySpeaker`, `CloudEventInspector`, `mountKitty`, `natsConnectionBus`, `decodeNatsCloudEvent`, `MockNatsBus`, presets & types |
| `kitty-event-bus-client/style.css` | styles |
| `kitty-event-bus-client/standalone` | IIFE build (`window.KittyEventBus`, Vue bundled) |
| `kitty-event-bus-client/tts/*` | pre-synthesized neural TTS MP3s |
| `kitty-event-bus-client/vite` | `kittyTtsProxy()`, a dev-only Vite plugin serving `…/api/tts` |

## Develop

From the repo root: `make kitty-dev` (harness at http://localhost:4321/), `make kitty-build`, `make kitty-test`. See [How it's built](https://infrashift.github.io/kitty-event-bus-client/guides/architecture/).

MIT License (Meow In Transit) © 2026 Infrashift.io
