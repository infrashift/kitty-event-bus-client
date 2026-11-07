<script setup lang="ts">
/**
 * The /speaker/ page's island: KittyApp, optionally wired to a live NATS server.
 *
 *   /speaker/                                       in-browser demo bus
 *   /speaker/?nats=ws://localhost:8080              live NATS over WebSocket (subject cncf.>)
 *   /speaker/?nats=wss://nats.example.com&subject=prod.alerts.>
 *
 * Credentials are deliberately NOT accepted in the URL (they'd end up in browser history and
 * server logs). For an authenticated server, embed KittyApp in your own app; see /guides/live-nats/.
 */
import { onMounted, ref, shallowRef } from 'vue';
import { KittyApp, natsConnectionBus, type CloudEventBus } from 'kitty-event-bus-client';

defineProps<{ ttsBaseUrl: string; ttsProxyUrl: string | null; docsUrl: string }>();

const ready = ref(false);
const bus = shallowRef<CloudEventBus>();
const subject = ref('cncf.>');
const status = ref<{ ok: boolean; text: string } | null>(null);

onMounted(async () => {
  const q = new URLSearchParams(location.search);
  const server = q.get('nats');
  subject.value = q.get('subject') || 'cncf.>';

  if (server) {
    try {
      // Loaded only when ?nats= is used, so the demo page doesn't pay for the client.
      const { wsconnect } = await import('@nats-io/nats-core');
      const nc = await wsconnect({ servers: server, name: 'kitty-speaker', maxReconnectAttempts: -1 });
      bus.value = natsConnectionBus(nc);
      const live = { ok: true, text: `Live NATS: ${server} · ${subject.value}` };
      status.value = live;
      // Get out of the way after a moment (the inspector drawer keeps saying "live NATS").
      setTimeout(() => {
        if (status.value === live) status.value = null;
      }, 6000);
      nc.closed().then(() => (status.value = { ok: false, text: `Disconnected from ${server}` }));
    } catch (e) {
      status.value = {
        ok: false,
        text: `Couldn't connect to ${server} (${e instanceof Error ? e.message : e}). Showing the demo bus.`,
      };
    }
  }
  ready.value = true;
});
</script>

<template>
  <KittyApp
    v-if="ready"
    :bus="bus"
    :subject="subject"
    :tts-base-url="ttsBaseUrl"
    :tts-proxy-url="ttsProxyUrl"
    :docs-url="docsUrl"
  />
  <div v-if="status" id="natsStatus" role="status" :data-ok="status.ok" class="nats-status">
    {{ status.text }}
    <button type="button" aria-label="Dismiss" @click="status = null">×</button>
  </div>
</template>

<style scoped>
.nats-status {
  position: fixed;
  left: 50%;
  bottom: max(0.5rem, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 30;
  max-width: calc(100vw - 1rem);
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.3rem 0.4rem 0.3rem 0.75rem;
  border-radius: 999px;
  font: 11px/1.3 'JetBrains Mono', ui-monospace, monospace;
  background: #065f46;
  color: #ecfdf5;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.2);
}
.nats-status[data-ok='false'] {
  background: #7f1d1d;
  color: #fef2f2;
}
.nats-status button {
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 14px;
  cursor: pointer;
  padding: 0 0.3rem;
}
</style>
