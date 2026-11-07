<div align="center">

# 📜 CHANGELOG — KITTY, CLOUDEVENT NATS SPEAKER

**Official Release Ledger, Rainforest Consumption Audit & Feline Firmware History**  
*Maintained by the Cloud-Native Feline Observability Division at [Infrashift.io](https://infrashift.io)*

All notable changes to this overly ambitious cat will be documented in this file.  
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and [Feline Emotional Volatility](https://github.com/infrashift/kitty-event-bus-client).

</div>

---

## [`1.4.0`] — 2026-11-06 — *The Kiwi Default Decree & Static Neural Audio Bundle*

### 🔄 Changed
- **Defaulted to `Male` (New Zealand Baritone) Voice Persona:** Elevated `Male` (`'nz-male'`) to the default startup voice persona across [`src/App.vue`](src/App.vue), [`src/components/KittySpeaker.vue`](src/components/KittySpeaker.vue), and [`src/audio/felineSpeechEngine.ts`](src/audio/felineSpeechEngine.ts). Upon initial page load, the cat now immediately greets your production cluster with friendly Southern Hemisphere composure (*"Pod catnip-scheduler-7f9b is riddy and purring..."*).
- **Backed Off SOLA Time-Compression (`transformToNewZealandMaleBuffer`):** Relaxed the SOLA time-compression ratio from `1.26x` (50% overlap) to `1.12x` (75% 4× Hann window overlap) and pitch-shift from `0.78x` to `0.88x` so Kiwi consonants remain crisp and phase-coherent.

### ✨ Added
- **Pre-Bundled Static Neural TTS Assets (`public/tts/*.mp3`):** Pre-synthesized and hashed (`hashTtsKey`) all 12 Neural TTS audio streams (`en-AU` Kiwi Male and `en-US` Female for every CloudEvent preset) directly into `public/tts/` so static deployments on GitHub Pages play crystal-clear neural speech with zero backend server required.

---

## [`1.3.0`] — 2026-11-06 — *The Cybernetic Palpebral Chrome Upgrade*

### ✨ Added
- **Shiny Metallic Bionic Eyelids (`drawCatEye`):** Upgraded the cat's organic fur eyelids to precision-machined **Liquid-Chrome & Brushed-Titanium Bionic Shutters** ([`src/components/KittySpeaker.vue`](src/components/KittySpeaker.vue)).
  - Multi-stop diagonal metallic gradients (`#141a22` gunmetal shadow → `#dde9f6` chrome → `#ffffff` mirror specular peak → `#7d8fa1` steel).
  - 3D spherical radial specular hotspots on both upper and lower eyelid domes that track the lid curvature during every blink.
  - Articulated telescopic titanium shutter seams, radial actuator panel lines, recessed orbital micro-rivets, and dual-bevel chrome eyelid rims that remain visibly poised around the eye socket even between blinks.
- **GitHub Pages CI/CD Pipeline ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)):** Automated 3-stage workflow (`test → build → deploy`) running all 36 Playwright E2E checks across 6 viewports before deploying to [GitHub Pages](https://infrashift.github.io/kitty-event-bus-client/).

---

## [`1.2.0`] — 2026-11-06 — *The Tom Waits Decommissioning & The Kiwi Realignment*

### 🔥 Removed
- **The `Tom Waits` Gruff Baritone Persona (`#voicePersonaTomWaits`):** Decommissioned the 6.9-semitone SOLA pitch/formant drop, sub-octave diplophonic chest-growl flip, and 33 Hz laryngeal vocal-fry gravel synthesizer.
  - *Post-Mortem Note:* While technically a triumph of browser-based DSP, beta testers reported that having a Kubernetes `CrashLoopBackOff` announced in the voice of a 1978 late-night diner regular who had gargled bourbon and asphalt caused on-call engineers to pour a glass of rye instead of fixing the cluster.

### 🔄 Changed
- **Standardized `Female` & `Male` Voice Personas:** Renamed the **`NZ Man`** button (`#voicePersonaNzMale`) to **`Male`**. All male CloudEvent announcements now exclusively utilize the crisp **New Zealand (`en-NZ` / Antipodean) Male Baritone**, complete with authentic Southern Hemisphere vowel chain-shifts (*"evints"*, *"chicks"*, *"sustem"*, *"crutical"*, and *"fush & chups"*).
- **Elevated NATS Telemetry Pedestal:** Moved the active NATS CloudEvent type readout (`NATS` badge + `#activeEventType`) from the left of `⚡ Send CloudEvent` onto its own dedicated centered row directly above the action buttons (`⚡ Send CloudEvent`, `🔥 Critical Alert`, `AUTO`).

---

## [`1.1.0`] — 2026-11-06 — *Palpebral Deceleration & Polite Bubble Dismissal*

### 🔄 Changed
- **Lounge-Cat Blink Kinematics:** Decelerated the eyelid blink interval from [`PATIENCE`](https://github.com/infrashift/patience)'s relentless `1.0 Hz` horological second-hand tick to a relaxed, judgmental `4.5s–7.0s` lounge-cat cadence with a gentler `~435ms` eyelid sweep (`dt * 7.2`). Sympathetic dry-eye complaints in the NOC have dropped by 94%.
- **Auto-Closing Speech Bubble (`bubbleCloseDelayMs`):** Taught the speech bubble basic manners. Instead of loitering permanently over the cat's chin after an event is read, the bubble now automatically dismisses `1.2s` after the final chunk completes (`cancelSpeech` / post-utterance cleanup).

---

## [`1.0.0`] — 2026-11-06 — *The Second Rainforest Epoch (Initial CNCF Release)*

### ✨ Added
- **CNCF CloudEvents v1.0 NATS Consumer Engine:** Extracted the kinetic tabby from [`infrashift/patience`](https://github.com/infrashift/patience) and wired its brain directly to a simulated NATS JetStream wildcard consumer (`cncf.k8s.>`, `cncf.nats.>`, `cncf.flux.>`, `cncf.envoy.>`, `infrashift.ai.>`).
- **Speech-Synced Bubble Chunking (`chunkMessageForBubble`):** Automatic splitting of verbose CloudEvent messages into $\le 8$-word / $\le 52$-character chunks with live word-by-word highlighting and acoustic energy-valley boundary alignment (`alignNeuralAudioToChunks`).
- **Tri-Mode Feline Vocalizer (`Both` / `Meow` / `TTS`):**
  - Procedural Web Audio dual-oscillator sawtooth/triangle cat meows routed through `F1`/`F2` vowel formant bandpass filters.
  - Neural TTS proxy (`/api/tts`) with automatic offline Web Speech API fallback (`window.speechSynthesis`).
- **Terry Gilliam / Monty Python Cutout Jaw Engine (`drawCatNoseAndMouth`):** Real-time polygonal chin shearing along a cubic Bezier upper-lip curve, quantized to $12\text{ fps}$ stop-motion and driven by $10\text{ ms}$ PCM RMS speech amplitude envelopes.
- **5,800 K Ocular Plasma Lasers & Scalloped Paper Burning (`stepAndBuildPaperBurnContour`):** Automatic thermonuclear eye-laser tantrums whenever `error` or `critical` CloudEvents arrive on the bus, charring the circular portrait bezel inward with glowing embers and rising smoke particles.
- **Slide-Over NATS Inspector & Custom Event Composer (`<CloudEventInspector />`):** Live `specversion: "1.0"` JSON payload viewer, 1-click preset triggers, event replay, and custom NATS subject/severity/message publishing.
- **6-Viewport Playwright E2E Verification Suite (`tests/kitty.spec.ts`):** Automated zero-scroll, circular-canvas, HiDPI, chunk-paging, laser-alert, and mouse/touch calibration assertions across `phone`, `phone-landscape`, `tablet`, `tablet-landscape`, `laptop`, and `desktop`.

---

## [`0.0.1-pre-nats`] — *The Horological Prehistory (`infrashift/patience`)*

- Burned down the first $\frac{1}{100}\text{th}$ of the Amazon rainforest to build a zero-dependency cat wall clock ([`infrashift/patience`](https://github.com/infrashift/patience)) whose eyeballs pointed at the hour and minute and whose pupils incinerated the clock bezel every 15 minutes.
- Realized that telling the time was only half of the enterprise observability puzzle.
