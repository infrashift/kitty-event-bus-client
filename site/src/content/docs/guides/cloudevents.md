---
title: CloudEvents & NATS
description: How KITTY consumes CNCF CloudEvents v1.0 envelopes from its NATS JetStream bus.
---

By default KITTY uses an **in-browser mock NATS bus** (`MockNatsBus` in `kitty/src/events/mockNatsBus.ts`). It needs no server, and its subject-matching semantics are real. The app subscribes a consumer to the wildcard subject **`cncf.>`** (configurable with the `subject` prop) and hands each message's `data.message` to the cat. To use a real server, see [Connect to a live NATS server](/kitty-event-bus-client/guides/live-nats/).

## Subject matching

`matchNatsSubject(pattern, subject)` implements NATS wildcards:

- `*` matches exactly one token: `cncf.*.pods.ready` matches `cncf.k8s.pods.ready`.
- `>` matches one or more trailing tokens: `cncf.>` matches everything under `cncf.`.

## The envelope

Every message is a [CNCF CloudEvents v1.0](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md) JSON envelope:

```json
{
  "specversion": "1.0",
  "id": "ce-mw5tfn2c-102",
  "source": "urn:infrashift:rack:h100-cluster-04",
  "type": "io.infrashift.gpu.thermal.critical",
  "subject": "ocular-plasma-cooler",
  "time": "2026-11-07T03:00:14.340Z",
  "datacontenttype": "application/json",
  "data": {
    "message": "Critical thermal runaway detected on GPU node four! …",
    "severity": "critical",
    "service": "ocular-plasma-cooler",
    "cluster": "prod-us-east-1",
    "metrics": { "sequence": 102, "consumerLagMs": 6 }
  }
}
```

`data.severity` is one of `info`, `warning`, `error`, `critical`. **`error` and `critical` fire the ocular plasma lasers** and swap the meow for a mad-cat yowl.

## Built-in presets

| Preset | NATS subject | Severity |
| :--- | :--- | :---: |
| K8s Pod Ready | `cncf.k8s.pods.ready` | `info` |
| Critical GPU Thermal Alert | `cncf.alerts.gpu.thermal` | `critical` |
| NATS JetStream Consumer Ack | `cncf.nats.jetstream.ack` | `info` |
| FluxCD Canary Promotion | `cncf.fluxcd.helm.reconciled` | `info` |
| Envoy Rate Limit Warning | `cncf.envoy.ratelimit.warn` | `warning` |
| Etcd QuorumDegraded Error | `cncf.alerts.etcd.quorum` | `error` |

These are exported as `CLOUDEVENT_PRESETS` from the package.

## The inspector drawer

Click **nats events** in the header to open the drawer. It shows:

- One-click buttons for every preset.
- A **custom publisher**: subject, severity and message. Press **Publish Event** and the cat speaks it. Messages without a pre-synthesized MP3 use the [dev TTS proxy or Web Speech](/kitty-event-bus-client/guides/voices/).
- The 50 most recent envelopes, newest first, with a **Speak Again** button on each.

## Feeding KITTY your own events

The demo bus is only the default. `<KittyApp>` takes a `bus` prop, and `natsConnectionBus(nc)` adapts a real NATS WebSocket connection to it, decoding both CloudEvents structured and binary (`ce-*` header) modes. Follow **[Connect to a live NATS server](/kitty-event-bus-client/guides/live-nats/)** to run a server with Podman or Docker, publish with nats-box, and point the speaker at it with `?nats=ws://localhost:8080`.
