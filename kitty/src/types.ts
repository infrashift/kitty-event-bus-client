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
   * Default: `null` (off). Without audio, KITTY falls back to the browser's Web Speech API.
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
  /**
   * Let the demo buttons (Send CloudEvent, Critical Alert, AUTO, inspector publisher) publish
   * to a live `bus`. Off by default for live buses so simulated alerts never reach a real
   * server by accident; always on for the built-in demo bus. Published presets are mapped
   * into `subject` so KITTY hears them back.
   */
  allowPublish?: boolean;
  /**
   * Sync the light/dark theme with the host page: toggle `dark` on `<html>` and persist the
   * choice in `localStorage['starlight-theme']` (Astro Starlight's key). Default `true`.
   * Set `false` to keep the theme inside KITTY's own root and leave the page untouched.
   */
  pageTheme?: boolean;
}
