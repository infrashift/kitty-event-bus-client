import type { CloudEventBus } from './events/bus';

/** Public props of `<KittyApp />` (also accepted as `mountKitty()` options). */
export interface KittyAppProps {
  /**
   * Folder holding the pre-synthesized neural TTS `<hash>.mp3` files.
   * Host the package's `dist/tts/` folder somewhere and point this at it. Default: `'./tts/'`.
   */
  ttsBaseUrl?: string;
  /**
   * Optional live TTS proxy endpoint for messages without a pre-synthesized MP3
   * (e.g. `kittyTtsProxy()` from `kitty-event-bus-client/vite` in dev). `null` disables it.
   * Default: `'./api/tts'`. Without audio, KITTY falls back to the browser's Web Speech API.
   */
  ttsProxyUrl?: string | null;
  /** When set, shows a "docs" link in the header pointing here. */
  docsUrl?: string;
  /**
   * Where CloudEvents come from. Default: an in-browser `MockNatsBus` demo.
   * For a live NATS server pass `natsConnectionBus(await wsconnect({ servers }))`.
   * Read once when KittyApp mounts.
   */
  bus?: CloudEventBus;
  /** NATS subject (wildcards allowed) KITTY subscribes to. Default: `'cncf.>'`. */
  subject?: string;
}
