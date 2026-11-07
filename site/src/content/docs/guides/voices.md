---
title: Voices & vocalizer
description: KITTY's voice personas, vocalizer modes, and where its speech audio comes from.
---

## Voice personas

| Persona | Voice | Feline formants |
| :--- | :--- | :--- |
| **Male** (default, `'nz-male'`) | Neural `en-AU` voice, time-compressed (SOLA, 1.12×) and pitch-shifted (0.88×) into a Kiwi baritone, with New Zealand vowel shifts applied to the text first (*"evints"*, *"chicks"*) | Lower, growlier |
| **Female** (`'female'`) | Neural `en-US` voice | High, melodic |

## Vocalizer modes

- **Both**: a meow preamble, then the spoken message.
- **Meow**: pure Web Audio formant synthesis (*"Mee-aa-o-ww!"*), one vowel per syllable. No speech.
- **TTS**: spoken English only.

## Where the speech audio comes from

For each message KITTY tries these sources in order:

1. **Pre-synthesized MP3s.** The package ships 12 files in `dist/tts/` (every preset × both personas), named by a hash of language + text (`hashTtsKey`). The app loads them from its `ttsBaseUrl`. On this site that is `/kitty-event-bus-client/kitty/tts/`. The waveform drives the jaw for exact lip-sync.
2. **The live TTS proxy**, if `ttsProxyUrl` is set. `kittyTtsProxy()` (exported from `kitty-event-bus-client/vite`) is a dev-server middleware that fetches neural TTS for any text, such as custom messages. It runs under `make dev`. GitHub Pages is static, so the hosted site disables it.
3. **The browser's Web Speech API**, as a last resort. The jaw then follows word boundaries and vowel keyframes instead of a waveform.

Meows never need audio files. Every one is synthesized live with dual sawtooth/triangle oscillators through `F1`/`F2` bandpass filters, plus a white-noise hiss.
