---
title: Connect to a live NATS server
description: How CloudEvents reach KITTY, and how to point it at your own NATS server over WebSocket, with Podman or Docker.
---

Out of the box KITTY listens to an in-browser **demo bus**. This guide connects it to a **real NATS server** so it speaks the CloudEvents your services publish.

## How messages reach the cat

```
your services ──publish──► NATS server ──WebSocket──► browser
                              (4222)        (8080)       │
                                                         ▼
                              wsconnect()  from @nats-io/nats-core
                                                         │  NatsConnection
                                                         ▼
                              natsConnectionBus(nc)      from kitty-event-bus-client
                                │ decodes each message into a CloudEvents v1.0 envelope
                                │ (structured mode, binary mode, or plain text/JSON)
                                ▼
                              <KittyApp :bus subject="cncf.>">
                                │ subscribes to the subject, logs the envelope in the inspector,
                                ▼ extracts { type, source, severity, message, … }
                              <KittySpeaker>  speaks data.message; error/critical fire the lasers
```

Browsers can't open raw TCP sockets, so KITTY connects to NATS's **WebSocket listener**. That listener is off by default and has to be enabled on the server, as shown below.

KITTY uses a plain core-NATS subscription, so it hears events published *while it is open*. Events also stored in a JetStream stream are still delivered to it live, but there is no replay of history.

## 1. Run a NATS server

The repo includes a dev config, [`nats/kitty-dev.conf`](https://github.com/infrashift/kitty-event-bus-client/blob/main/nats/kitty-dev.conf). It turns on the client port 4222, the WebSocket port 8080 (no TLS) and the monitoring port 8222:

```text
port: 4222
http_port: 8222
websocket {
  port: 8080
  no_tls: true
}
```

From a clone, one command starts it in a container (Podman by default):

```bash
make nats                     # podman
make nats CONTAINER=docker    # or docker
make nats NATS_WS_PORT=8089   # if port 8080 is taken on your machine
make nats-logs                # follow the server log
make nats-stop                # stop it (the container is removed)
```

Or run the containers yourself. The server and nats-box share a named network, so nats-box reaches the server by container name. That works the same on Linux, macOS and Windows, and for rootless Podman.

### With Podman (preferred)

```bash
podman network create kitty-nats

podman run -d --rm --name kitty-nats --network kitty-nats \
  -p 4222:4222 -p 8080:8080 \
  -v "$PWD/nats/kitty-dev.conf:/etc/nats/kitty.conf:ro,Z" \
  docker.io/library/nats:2.11-alpine -c /etc/nats/kitty.conf
```

Podman notes:

- **Fully qualified image names** (`docker.io/library/…`, `docker.io/natsio/…`). Podman doesn't assume Docker Hub unless your `registries.conf` says so.
- **`:Z`** on the volume relabels the config file for SELinux (Fedora, RHEL, CentOS). Without it, the server can't read the file there. On systems without SELinux it is ignored.
- **Rootless works.** The ports are above 1024, so no root is needed.
- **macOS and Windows:** start the VM first with `podman machine init && podman machine start`. Published ports are forwarded to `localhost` as usual.

### With Docker

```bash
docker network create kitty-nats

docker run -d --rm --name kitty-nats --network kitty-nats \
  -p 4222:4222 -p 8080:8080 \
  -v "$PWD/nats/kitty-dev.conf:/etc/nats/kitty.conf:ro" \
  nats:2.11-alpine -c /etc/nats/kitty.conf
```

Either way the log should show `Listening for websocket clients on ws://0.0.0.0:8080`.

## 2. Open KITTY against it

- **Hosted site:** [`/speaker/?nats=ws://localhost:8080`](/kitty-event-bus-client/speaker/?nats=ws://localhost:8080). Chromium-based browsers let an `https://` page open `ws://localhost`. If yours blocks it as mixed content (Safari does), use the local site below. Any host other than localhost needs `wss://`.
- **Local site:** `make dev`, then open `http://localhost:4321/kitty-event-bus-client/speaker/?nats=ws://localhost:8080`.
- **Plain-HTML example:** [`/examples/standalone/?nats=ws://localhost:8080`](/kitty-event-bus-client/examples/standalone/?nats=ws://localhost:8080).

Add `&subject=prod.alerts.>` to listen somewhere other than `cncf.>`. A green **Live NATS** pill briefly confirms the connection, and the inspector drawer keeps saying **live NATS**. If the connection fails, a red pill appears and KITTY falls back to the demo bus.

With a live bus, KITTY never publishes anything unprompted. Its **Send CloudEvent**, **Critical Alert**, **AUTO** and inspector **Publish** buttons send real messages to your server. That's handy for testing, and the read-only setup [below](#production-checklist) blocks it.

## 3. Publish CloudEvents

### With nats-box (the `nats` CLI)

[nats-box](https://github.com/nats-io/nats-box) is a small image with the `nats` CLI. Start an interactive shell on the same network:

```bash
make nats-box     # = podman run --rm -it --network kitty-nats -e NATS_URL=nats://kitty-nats:4222 docker.io/natsio/nats-box:latest

# with Podman by hand
podman run --rm -it --network kitty-nats -e NATS_URL=nats://kitty-nats:4222 docker.io/natsio/nats-box:latest

# with Docker by hand
docker run --rm -it --network kitty-nats -e NATS_URL=nats://kitty-nats:4222 natsio/nats-box:latest
```

`NATS_URL` points the CLI at the server, so you don't need `-s`. Inside the shell, publish in either CloudEvents mode:

```bash
# Structured mode: the payload is the whole CloudEvent
nats pub cncf.k8s.pods.ready '{"specversion":"1.0","id":"1","source":"urn:cli","type":"io.cncf.k8s.pod.ready","data":{"message":"Hello from the NATS CLI.","severity":"info"}}'

# Binary mode: attributes as ce-* headers, the payload is the data (here plain text)
nats pub cncf.alerts.disk "Disk is ninety percent full." \
  -H ce-specversion:1.0 -H ce-id:2 -H ce-type:io.example.disk.full \
  -H ce-source:urn:cli -H ce-severity:warning

# Watch what's on the bus
nats sub "cncf.>"
```

For one-off commands without a shell, append the command to the `run` line:

```bash
podman run --rm --network kitty-nats -e NATS_URL=nats://kitty-nats:4222 \
  docker.io/natsio/nats-box:latest nats pub cncf.hello '{"specversion":"1.0","id":"3","source":"urn:cli","type":"io.example.hello","data":{"message":"Hi, cat."}}'
```

### With the sample script

`make nats-publish` runs [`site/scripts/nats-publish.ts`](https://github.com/infrashift/kitty-event-bus-client/blob/main/site/scripts/nats-publish.ts). It sends one structured-mode and one binary-mode event over WebSocket, with the same client a browser uses.

### From your services

Any NATS client works. Publish to a subject under the one KITTY listens to, in either CloudEvents mode. The official [CloudEvents SDKs](https://cloudevents.io/) include a NATS protocol binding for Go (`github.com/cloudevents/sdk-go/protocol/nats/v2`). In other languages, publish the JSON envelope (structured mode).

## What KITTY reads from a message

`natsConnectionBus` decodes every message with `decodeNatsCloudEvent`, following the [CloudEvents NATS protocol binding](https://github.com/cloudevents/spec/blob/main/cloudevents/bindings/nats-protocol-binding.md):

| Message shape | How it's recognized | Notes |
| :--- | :--- | :--- |
| **Structured** | JSON payload with `specversion` | `data` may be an object or a string. `data_base64` is decoded. |
| **Binary** | a `ce-specversion` header | Other `ce-*` headers become attributes (case-insensitive). The payload is `data`, as JSON or plain text. |
| **Anything else** | none of the above | Wrapped as `type: io.nats.message`, `source: nats:<subject>`, so plain text or JSON is still spoken. |

| KITTY needs | Taken from (first match) | Default |
| :--- | :--- | :--- |
| What to say | `data.message`, `data.text`, `data.summary`, or `data` itself if it is a string | `Received CloudEvent <type> from <source>` |
| Severity | `data.severity`, `data.level`, or a `severity` extension (`ce-severity` header / top-level `severity`) | `info` |
| Header line | `type` | `io.nats.message` |

Severity accepts `info`, `warning`, `error`, `critical`, plus common aliases (`warn`, `err`, `fatal`, `crit`, `alert`, `emergency`). **`error` and `critical` fire the lasers.** Keep messages to a sentence or two: the cat reads every word.

## 4. Use it in your own app

The `?nats=` parameter is a convenience on this site. In your own dashboard, connect with your own credentials and pass the bus in:

```bash
bun add kitty-event-bus-client vue @nats-io/nats-core
```

```vue
<script setup lang="ts">
import { shallowRef, onMounted } from 'vue';
import { wsconnect } from '@nats-io/nats-core';
import { KittyApp, natsConnectionBus, type CloudEventBus } from 'kitty-event-bus-client';
import 'kitty-event-bus-client/style.css';

const bus = shallowRef<CloudEventBus>();
onMounted(async () => {
  const nc = await wsconnect({ servers: 'wss://nats.example.com', user: 'kitty', pass: '…' });
  bus.value = natsConnectionBus(nc);
});
</script>

<template>
  <!-- bus is read once at mount, so mount KittyApp after connecting -->
  <KittyApp v-if="bus" :bus="bus" subject="prod.alerts.>" tts-base-url="/kitty/tts/" :tts-proxy-url="null" />
</template>
```

Without a bundler, load the NATS client from a CDN as an ES module and use the drop-in build:

```html
<script src="/kitty/kitty-event-bus-client.iife.js"></script>
<script type="module">
  import { wsconnect } from 'https://cdn.jsdelivr.net/npm/@nats-io/nats-core@3.4.0/+esm';
  const nc = await wsconnect({ servers: 'wss://nats.example.com' });
  KittyEventBus.mount('#cat', { bus: KittyEventBus.natsConnectionBus(nc), subject: 'cncf.>', ttsBaseUrl: '/kitty/tts/' });
</script>
```

In an Astro site, the bus can't be passed as a prop from the server, because a live connection isn't serializable. Wrap `KittyApp` in a small Vue component that connects in `onMounted`, as this site's [`LiveKitty.vue`](https://github.com/infrashift/kitty-event-bus-client/blob/main/site/src/components/LiveKitty.vue) does, and render that with `client:only="vue"`.

**Not NATS?** `bus` accepts anything with `subscribe(subjectPattern, callback) → unsubscribe` and `publish(subject, cloudEvent)` (the `CloudEventBus` interface), so an SSE stream, a Kafka-over-WebSocket bridge or a webhook relay works too.

## Production checklist

The dev config has no TLS and no auth. Before exposing a server:

- **TLS:** browsers on `https://` pages need `wss://`. Give the `websocket` block a `tls { cert_file, key_file }`, or terminate TLS at a reverse proxy.
- **Limit origins:** `allowed_origins` restricts which sites may open WebSocket connections.
- **Least privilege:** anything a browser uses to log in is visible to its user. Give KITTY a **subscribe-only** user and keep publishing credentials on your services. This site never accepts credentials in the URL.

The config below was tested with `nats-server` 2.11. Browsers connect anonymously and are mapped to the read-only `kitty` user, which also disables KITTY's publish buttons (the server rejects them with a permissions violation). Services publish as `publisher`.

```text
port: 4222
websocket {
  port: 443
  tls { cert_file: "/etc/nats/tls/fullchain.pem", key_file: "/etc/nats/tls/privkey.pem" }
  allowed_origins: ["https://noc.example.com", "https://infrashift.github.io"]
}
authorization {
  users: [
    { user: kitty,     password: "unused-but-required",
      permissions: { subscribe: "cncf.>", publish: { deny: ">" } } }
    { user: publisher, password: "$PUBLISHER_PASSWORD",
      permissions: { publish: "cncf.>", subscribe: "_INBOX.>" } }
  ]
}
no_auth_user: kitty
```

## Troubleshooting

| Symptom | Likely cause |
| :--- | :--- |
| Red pill: *Couldn't connect* | WebSocket not enabled, wrong port, or `ws://` to a non-localhost host from an `https://` page (use `wss://`). |
| Connected, but nothing is spoken | The subject doesn't match. Check `&subject=` and the inspector's **SUB:** line, and watch the bus with `nats sub ">"` in nats-box. |
| Events appear in the inspector but the cat says *"Received CloudEvent …"* | No `data.message` / `data.text` / string `data` was found. See [what KITTY reads](#what-kitty-reads-from-a-message). |
| Container can't read the config (`permission denied`) | SELinux: add `:Z` to the Podman volume mount. |
| `address already in use` on 8080 | Another service owns the port. Use `make nats NATS_WS_PORT=8089` and `?nats=ws://localhost:8089`. |
| nats-box: `lookup localhost … no such host` | Inside a container, `localhost` is the container itself. Use the shared network and `nats://kitty-nats:4222`, as above. |
| No sound | Browsers block audio until you click or tap the page once. |
