---
title: Local development
description: Build and preview KITTY and its site locally with bun, and run the Playwright test suites.
---

The repo is a Bun workspace: [`kitty/`](https://github.com/infrashift/kitty-event-bus-client/tree/main/kitty) is the Vue package and [`site/`](https://github.com/infrashift/kitty-event-bus-client/tree/main/site) is this [Astro](https://astro.build) + [Starlight](https://starlight.astro.build) site. [How it's built](/kitty-event-bus-client/guides/architecture/) explains how the two fit together. Requires [Bun](https://bun.sh) and `make`.

## Make targets

```bash
make                # list targets
make install        # bun install (whole workspace)

make kitty-dev      # work on the app alone → http://localhost:4321/  (Vite, hot reload)
make kitty-build    # build the package → kitty/dist/

make dev            # build the package, then the site dev server → http://localhost:4321/kitty-event-bus-client/
make build          # kitty-build, then the site → site/dist/
make preview        # serve the production site build

make test           # kitty suite + site suite
make pack           # dry-run `bun pm pack` for the package (what would be published)
make clean

make nats           # local NATS server with WebSocket (podman; CONTAINER=docker also works)
make nats-box       # nats CLI shell connected to it
make nats-publish   # send sample CloudEvents
make nats-stop
```

`make dev` uses the package's built `dist/`. If you change code in `kitty/src`, re-run `make kitty-build` (or use `make kitty-dev` while working on the component). Both dev servers listen on all interfaces, so you can open the printed network URL on a phone on the same Wi-Fi.

## Tests

```bash
make test-install   # one-time: download Playwright's Chromium
make test           # both suites, headless, 6 screen sizes
make kitty-test     # just the app
make site-test      # just the site
NATS_WS_URL=ws://localhost:8080 make site-test   # include the live NATS tests (after `make nats`)
make test-report    # open the last HTML reports
```
