---
title: Features
description: Key features and cloud-native breakthroughs of KITTY, the CloudEvent NATS speaker.
---

| Subsystem | Technical specification | Why it matters |
| :--- | :--- | :--- |
| **CNCF CloudEvents v1.0 NATS Consumer** | Subscribes to the NATS wildcard `cncf.>` on a [live NATS server over WebSocket](/kitty-event-bus-client/guides/live-nats/) (or the built-in demo bus), decodes structured- and binary-mode CloudEvents, and forwards each `data.message` to the cat. | Because reading JSON logs in `kubectl logs -f` is for cowards who fear eye contact. |
| **Speech-Synced Bubble Chunking (`chunkMessageForBubble`)** | Splits long payloads into ≤ 8-word chunks, highlights each word live, refreshes at inter-word acoustic valleys, and auto-dismisses once spoken. | Never overflows the viewport, never overwrites unread text, and vanishes polite seconds after the cat finishes judging your cluster. |
| **Dual Voice Personas (`Female` & `Male`)** | **Female:** warm neural `en-US` voice + high melodic feline formants.<br />**Male:** Kiwi `en-NZ` baritone with authentic vowel chain-shifts (*"evints"*, *"chicks"*). | Choose whether your outage is announced with soothing composure or Southern Hemisphere stoicism. |
| **Tri-Mode Vocalizer (`Both` / `Meow` / `TTS`)** | **Both:** meow preamble + speech. **Meow:** Web Audio formant synthesis (*"Mee-aa-o-ww!"*) mapped to syllable vowels. **TTS:** pure spoken English. | Every meow is procedurally synthesized with dual sawtooth/triangle oscillators and `F1`/`F2` bandpass vocal-tract filters. |
| **Terry Gilliam Cutout Jaw Lip-Sync** | Real-time `offCanvas` polygonal chin slicing along `traceUpperLipCurve`, driven at 60 fps by a 10 ms PCM RMS envelope and quantized to 12 fps stop-motion. | The cat's actual chin hinges downward in sync with every syllable to reveal paper-cutout fangs and a pink tongue. |
| **Thermonuclear `Critical Alert` Lasers** | `error` / `critical` CloudEvents trigger a feline yowl and dual ocular plasma beams (T ≈ 5,800 K) with ember sparks and scorch trails. | When an H100 hits `94°C`, the irises turn molten crimson and incinerate the canvas frame. |
| **Live NATS Inspector & Custom Publisher** | Slide-over drawer with every consumed CloudEvent JSON envelope, 1-click presets, replay buttons, and a custom subject/severity/message publisher. | Type anything, pick `critical`, click **Publish Event**, and watch the cat scream your message while firing eye lasers. |
| **Unhurried Palpebral Kinematics** | Natural blink cadence (4.5–7.0 s), chrome bionic eyelids, and gaze tracking toward the speech bubble. | Unlike PATIENCE (1 Hz blink), KITTY blinks at a relaxed, judgmental lounge-cat pace. |
| **Any-Screen Layout** | One viewport, no scrolling. The portrait is the largest circle that fits, from phones (portrait and landscape) to 4K NOC walls. | It mounts on any wall you own, including the small one in your pocket. |
| **Embeddable** | Ships as a Vue 3 component library and a standalone `<script>` build. | Put a screaming cat in *your* app. See [Use KITTY in your app](/kitty-event-bus-client/guides/embedding/). |

[Launch the speaker →](/kitty-event-bus-client/speaker/)
