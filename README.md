# 🐱📡 KITTY EVENT BUS CLIENT (猫・イベントバス)

**An Astro-Island-Ready Vue 3 Feline CNCF CloudEvents Consumer & Formant Vocalizer**  
*Inspired by [`PATIENCE, Cat Laser Wall Clock`](../patience)*

---

## ✨ Overview

`kitty-event-bus-client` turns the kinetic tabby portrait from `patience` into a live **CNCF CloudEvents v1.0 NATS Consumer & Speaker**. Instead of telling the time, the cat subscribes to a mocked NATS JetStream subject router (`cncf.>`) and vocalizes incoming event messages:

1. **Chunked Speech Bubble & Speech-Boundary Paging**:
   - Long CloudEvent `data.message` strings are automatically split into bite-sized chunks (`chunkMessageForBubble`) so the speech bubble never overflows.
   - Each chunk highlights words live as the cat speaks them and refreshes to the next chunk **when the speech reaches the end of the active chunk** (enforcing a word-count-based reading-time floor so fast speech never overwrites unread text).
2. **Dual Feline Speech Synthesis (`Both` / `Meow-Speak` / `TTS Only`)**:
   - **Procedural Feline Formant "Meow-Speak"**: Maps the dominant vowel of every syllable (`a`, `e`, `i`, `o`, `u`) through dual bandpass vocal-tract formant filters (`F1`/`F2`) driven by sawtooth/triangle oscillators + vibrato LFO.
   - **Web Speech API (`window.speechSynthesis`)**: Speaks the English CloudEvent message aloud with word-boundary tracking.
3. **Terry Gilliam / Monty Python Cutout Jaw Lip-Sync**:
   - Real-time 12fps stop-motion jaw hinge (`drawCatNoseAndMouth`) synchronized to each syllable's vowel openness.
4. **Thermonuclear Ocular Plasma Lasers on Critical CloudEvents**:
   - High-severity events (`error` / `critical`) trigger a mad-cat yowl/hiss and dual ocular plasma lasers with ember sparks and smoldering rim scorch trails.
5. **Reusable Vue 3 Island (`<KittySpeaker />`)**:
   - Self-contained in `src/components/KittySpeaker.vue` so it can be dropped directly into an Astro + Starlight site as `<KittySpeaker client:load />`.

---

## 🚀 Quick Start

Requires [Bun](https://bun.sh) and `make`:

```bash
make install    # Install dependencies with bun
make dev        # Start live-reload dev server at http://localhost:4321/
make build      # Type-check and build production bundle into dist/
make test       # Build and run Playwright responsive E2E test suite
```
