---
title: Running KITTY
description: Open KITTY in a browser, on a phone or tablet, or on your NOC wall.
---

## In your browser

The hosted speaker lives at **[infrashift.github.io/kitty-event-bus-client/speaker/](https://infrashift.github.io/kitty-event-bus-client/speaker/)**. Click anywhere on the cat (or **⚡ Send CloudEvent**) to wake the audio engine. Browsers only allow sound after a user gesture. Use the ⛶ button for fullscreen.

On first load KITTY publishes a welcome `cncf.k8s.pods.ready` event so the speech bubble and inspector start populated.

## Header controls

| Control | What it does |
| :--- | :--- |
| **nats events** | Opens the NATS inspector drawer. The badge counts consumed events. |
| **docs** | Back to this site. |
| **github** | The repository. |
| **sound on / muted** | Toggles all speech and meows. |
| **dark mode / light mode** | Gallery theme. Shared with this docs site's theme picker. |
| ⛶ | Fullscreen. |

## Footer controls

- **⚡ Send CloudEvent** publishes the next preset. **🔥 Critical Alert** publishes the GPU thermal alert. **AUTO** streams a preset every 14 seconds.
- **Female / Male** switches the voice persona. **Both / Meow / TTS** switches the vocalizer mode.
- **Normal / Laser Alert** forces laser mode. **Calibrate Eyes and Mouth** opens the [calibration HUD](/kitty-event-bus-client/guides/calibration/).

## On a phone or tablet

Open the hosted URL and use your browser's **Add to Home Screen**. The layout adapts to portrait and landscape. In landscape on a phone, the cat takes the full height and the controls move to the side.

## On a NOC wall or as a desktop wallpaper

Point any kiosk browser (or [Plash](https://sindresorhus.com/plash) on macOS) at the speaker URL. For a demo, turn on **AUTO**. For the real thing, add `?nats=wss://your-nats-server` so the cat reads your production CloudEvents; see [Connect to a live NATS server](/kitty-event-bus-client/guides/live-nats/). For a permanent install with authentication, embed the component in your own dashboard ([Use KITTY in your app](/kitty-event-bus-client/guides/embedding/)).
