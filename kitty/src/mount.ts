import { createApp } from 'vue';
import KittyApp from './App.vue';
import type { KittyAppProps } from './types';

export interface KittyMountHandle {
  /** Unmounts KITTY and stops its audio, animation loop and mock NATS stream. */
  unmount(): void;
}

/**
 * Mounts the full KITTY app into an element (or CSS selector) in any page.
 * Used by the standalone `<script>` build, and handy in non-Vue frameworks.
 * Remember to also load `kitty-event-bus-client/style.css`.
 */
export function mountKitty(target: string | Element, options: KittyAppProps = {}): KittyMountHandle {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) throw new Error(`mountKitty: no element matches ${String(target)}`);
  const app = createApp(KittyApp, { ...options });
  app.mount(el);
  return { unmount: () => app.unmount() };
}
