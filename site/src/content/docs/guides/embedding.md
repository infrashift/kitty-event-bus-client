---
title: Use KITTY in your app
description: Install the kitty-event-bus-client package and use KITTY as a Vue component, an Astro island, or a plain <script> drop-in.
---

KITTY is published from this repository as the **`kitty-event-bus-client`** package (in the [`kitty/`](https://github.com/infrashift/kitty-event-bus-client/tree/main/kitty) folder). It is built independently of this docs site, and this site uses it [exactly like you would](/kitty-event-bus-client/guides/architecture/).

| You have… | Use | Vue needed? |
| :--- | :--- | :--- |
| A Vue 3 / Nuxt app | `import { KittyApp } from 'kitty-event-bus-client'` | Yes (peer dependency) |
| An Astro site | the same component as a `client:only="vue"` island | Yes, plus `@astrojs/vue` |
| Any other page (plain HTML, React, Rails, a CMS…) | the standalone `<script>` build | No, it's bundled in |

## Install

The package is publish-ready but not on npm yet. Until it is, install it from git or from a local build:

```bash
# from a local clone, after `make kitty-build`
bun add vue /path/to/kitty-event-bus-client/kitty

# once published
bun add kitty-event-bus-client vue
```

## In a Vue app

```vue
<script setup lang="ts">
import { KittyApp } from 'kitty-event-bus-client';
import 'kitty-event-bus-client/style.css';
</script>

<template>
  <KittyApp tts-base-url="/kitty/tts/" />
</template>
```

Or, without a template, `mountKitty('#cat', { ttsBaseUrl: '/kitty/tts/' })` mounts the whole app into any element and returns `{ unmount }`.

## In an Astro site

This is exactly what [`site/src/pages/speaker.astro`](https://github.com/infrashift/kitty-event-bus-client/blob/main/site/src/pages/speaker.astro) does:

```bash
bun add kitty-event-bus-client vue @astrojs/vue
```

```js
// astro.config.mjs
import vue from '@astrojs/vue';
import { kittyTtsProxy } from 'kitty-event-bus-client/vite'; // optional, dev-only live TTS

export default defineConfig({
  integrations: [vue()],
  vite: { plugins: [kittyTtsProxy()] },
});
```

```astro
---
import { KittyApp } from 'kitty-event-bus-client';
import 'kitty-event-bus-client/style.css';
const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
---
<KittyApp
  client:only="vue"
  ttsBaseUrl={`${base}kitty/tts/`}
  ttsProxyUrl={import.meta.env.DEV ? `${base}api/tts` : null}
/>
```

Use **`client:only="vue"`**, not `client:load`. KITTY draws on a canvas and uses Web Audio, so there is nothing useful to server-render.

## As a plain `<script>` drop-in

```html
<link rel="stylesheet" href="/kitty/style.css">
<div id="cat"></div>
<script src="/kitty/kitty-event-bus-client.iife.js"></script>
<script>
  KittyEventBus.mount('#cat', { ttsBaseUrl: '/kitty/tts/' });
</script>
```

Copy `kitty-event-bus-client.iife.js`, `style.css` and the `tts/` folder from the package's `dist/` to your web server. A live example is at [`/examples/standalone/`](/kitty-event-bus-client/examples/standalone/).

## Options

`<KittyApp>` props and `mountKitty()` / `KittyEventBus.mount()` options:

| Option | Default | Description |
| :--- | :--- | :--- |
| `ttsBaseUrl` | `'./tts/'` | URL of the folder where you host the package's `dist/tts/*.mp3`. |
| `ttsProxyUrl` | `null` (off) | Live TTS endpoint for messages without an MP3, e.g. `kittyTtsProxy()` in dev. A URL with its own query string works. |
| `docsUrl` | none | When set, shows a **docs** link in the header. |
| `bus` | in-browser `MockNatsBus` demo | Where CloudEvents come from. Use `natsConnectionBus(await wsconnect(…))` for a live NATS server. See [Connect to a live NATS server](/kitty-event-bus-client/guides/live-nats/). Read once at mount. |
| `subject` | `'cncf.>'` | NATS subject (wildcards allowed) to subscribe to. |
| `allowPublish` | `false` for a live `bus` | Lets the demo buttons (Send CloudEvent, Critical Alert, AUTO, inspector publisher) publish to a live bus. The demo bus always allows it. Presets are published *inside* `subject`, so KITTY hears them back. |
| `pageTheme` | `true` | Sync light/dark with the page (`dark` on `<html>`, `localStorage['starlight-theme']`). Set `false` to keep the theme inside KITTY and never touch the host page. |

Sizing: by default KITTY is exactly one viewport tall (`100dvh`). Set the CSS variable **`--kitty-height`** on a parent element to fit it into your layout, for example `#cat { --kitty-height: 600px }`.

## Things to know

- **Styles are scoped.** `style.css` contains Tailwind's utilities and theme variables but **not** Tailwind's global reset. KITTY applies a minimal reset inside `.kitty-app` only, so it won't restyle your page.
- **Fonts aren't bundled.** For the gallery look, load Cormorant Garamond, Inter, JetBrains Mono and Noto Serif JP from Google Fonts (see the example page). Otherwise KITTY uses system fonts.
- **Theme.** By default the light/dark toggle adds or removes `dark` on `<html>` and stores the choice in `localStorage['starlight-theme']`, the same key Astro Starlight uses. That's how this site and the speaker share one theme. If your page manages its own dark mode, pass `pageTheme: false`: KITTY then keeps its theme on its own root element and leaves your page alone.
- **Audio** needs a user gesture (the browser autoplay policy). KITTY listens for the first click, tap or key anywhere on the page. Until then it holds the newest event behind a *Tap anywhere to hear KITTY* hint, instead of animating it in silence. Muted KITTY (sound off) isn't held.
- **The portrait** is loaded at runtime from Unsplash.
- **Debugging.** `window.__kittyDebug` exposes internals for tests.

## Lower level: `<KittySpeaker>`

`KittyApp` is the whole experience: header, mock NATS bus, controls and inspector. To drive the cat from your own event source, use the lower-level component:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { KittySpeaker, type KittyEventPayload } from 'kitty-event-bus-client';
import 'kitty-event-bus-client/style.css';

const event = ref<KittyEventPayload | null>(null);
// e.g. from a nats.ws subscription:
// event.value = { id, natsSubject, type, source, severity, message, time };
</script>

<template>
  <div class="kitty-app" style="--kitty-height: 480px">
    <KittySpeaker :event-payload="event" voice-persona="female" tts-base-url="/kitty/tts/" />
  </div>
</template>
```

Wrap it in an element with the `kitty-app` class so the scoped reset applies. Through a template ref, `KittySpeaker` also exposes `speakEvent(payload, options)` and `triggerMeow(isMad)`. The package also exports `natsConnectionBus`, `decodeNatsCloudEvent`, `MockNatsBus`, `createKittyNatsConsumer`, `matchNatsSubject`, `CLOUDEVENT_PRESETS`, the `CloudEventBus` interface and all the CloudEvent types. `decodeNatsCloudEvent(msg)` turns a raw NATS message into a CloudEvent if you're feeding `KittySpeaker` yourself.
