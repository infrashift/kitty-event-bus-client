<template>
  <div
    v-if="open"
    id="inspectorDrawerBackdrop"
    class="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] flex justify-end"
    @click.self="$emit('close')"
  >
    <aside
      id="inspectorDrawer"
      data-testid="inspector-drawer"
      class="w-full max-w-lg h-full bg-gallery-light dark:bg-gallery-darkPaper border-l border-neutral-300 dark:border-neutral-800 shadow-2xl flex flex-col text-xs overflow-hidden"
    >
      <!-- Drawer Header -->
      <div class="px-4 py-3 border-b border-neutral-300/70 dark:border-neutral-800 flex items-center justify-between gap-2">
        <div>
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <h2 class="font-serif text-base tracking-wider uppercase font-normal text-neutral-900 dark:text-neutral-100">
              NATS JetStream Consumer
            </h2>
          </div>
          <p class="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 mt-0.5">
            SUB: <span id="inspectorSubject" class="text-emerald-600 dark:text-emerald-400">{{ subject }}</span> &bull; Spec: CNCF CloudEvents v1.0
            &bull; <span id="inspectorBusKind">{{ live ? 'live NATS' : 'in-browser demo bus' }}</span>
          </p>
        </div>

        <button
          id="closeInspectorBtn"
          class="tap px-2.5 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          @click="$emit('close')"
        >
          ✕ Close
        </button>
      </div>

      <!-- Publish Custom / Preset CloudEvent Section (hidden for a read-only live bus) -->
      <div v-if="canPublish" class="p-3.5 border-b border-neutral-300/70 dark:border-neutral-800 bg-neutral-200/40 dark:bg-neutral-900/50 space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-mono uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            {{ live ? 'Publish Demo CloudEvent to Live NATS' : 'Publish Mock CloudEvent to NATS Bus' }}
          </span>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="(preset, idx) in presets"
              :key="preset.label"
              :data-testid="`preset-btn-${idx}`"
              class="px-2 py-0.5 rounded text-[10px] border transition-colors cursor-pointer"
              :class="
                preset.severity === 'critical' || preset.severity === 'error'
                  ? 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-500/20'
                  : 'border-neutral-300 dark:border-neutral-700 bg-white/80 dark:bg-neutral-800 hover:border-neutral-500'
              "
              @click="$emit('publishPreset', idx)"
            >
              {{ preset.label }}
            </button>
          </div>
        </div>

        <!-- Custom Message Form -->
        <form class="space-y-2" @submit.prevent="submitCustomEvent">
          <div class="grid grid-cols-3 gap-2">
            <input
              id="customSubjectInput"
              v-model="customSubject"
              type="text"
              placeholder="NATS Subject (cncf.custom)"
              class="col-span-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 font-mono text-[11px] focus:outline-none"
            />
            <select
              id="customSeveritySelect"
              v-model="customSeverity"
              class="px-2 py-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 font-mono text-[11px] focus:outline-none"
            >
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="error">error (lasers)</option>
              <option value="critical">critical (lasers)</option>
            </select>
          </div>

          <div class="flex gap-2">
            <input
              id="customMessageInput"
              v-model="customMessage"
              type="text"
              placeholder="Enter CloudEvent data.message for the kitty to speak..."
              class="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-xs focus:outline-none"
            />
            <button
              id="publishCustomBtn"
              type="submit"
              class="px-3 py-1.5 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-medium text-xs hover:opacity-90 transition-opacity cursor-pointer shrink-0"
            >
              Publish Event
            </button>
          </div>
        </form>
      </div>

      <!-- Consumed CloudEvents Stream List -->
      <div class="flex-1 overflow-y-auto p-3.5 space-y-3" data-testid="event-log-list">
        <div class="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-neutral-500">
          <span>Consumed CloudEvents ({{ events.length }})</span>
          <span>Newest First</span>
        </div>

        <div
          v-for="item in events"
          :key="item.cloudEvent.id"
          data-testid="cloudevent-card"
          class="rounded-xl border border-neutral-300/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/90 p-3 space-y-2 shadow-sm"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 min-w-0">
              <span
                class="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase font-semibold shrink-0"
                :class="[
                  item.cloudEvent.data.severity === 'critical' || item.cloudEvent.data.severity === 'error'
                    ? 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30'
                    : item.cloudEvent.data.severity === 'warning'
                      ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30',
                ]"
              >
                {{ item.cloudEvent.data.severity }}
              </span>
              <span class="font-mono text-[11px] font-medium truncate text-neutral-800 dark:text-neutral-200">
                {{ item.subject }}
              </span>
            </div>

            <button
              class="px-2 py-0.5 rounded-full text-[10px] border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
              @click="$emit('replay', item)"
            >
              🔊 Speak Again
            </button>
          </div>

          <p class="font-serif text-sm text-neutral-900 dark:text-neutral-100 leading-snug">
            "{{ item.cloudEvent.data.message }}"
          </p>

          <!-- Raw CNCF CloudEvent v1.0 JSON Envelope -->
          <pre
            class="text-[10px] font-mono bg-neutral-950 text-emerald-400 p-2.5 rounded-lg overflow-x-auto leading-relaxed select-all"
          >{{ JSON.stringify(item.cloudEvent, null, 2) }}</pre>
        </div>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { CLOUDEVENT_PRESETS, type EventSeverity } from '../events/cloudevents';
import type { NatsEnvelope } from '../events/mockNatsBus';

withDefaults(
  defineProps<{
    open: boolean;
    events: NatsEnvelope[];
    subject?: string;
    live?: boolean;
    canPublish?: boolean;
  }>(),
  { subject: 'cncf.>', live: false, canPublish: true }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'publishPreset', index: number): void;
  (
    e: 'publishCustom',
    payload: { natsSubject: string; severity: EventSeverity; message: string }
  ): void;
  (e: 'replay', envelope: NatsEnvelope): void;
}>();

const presets = CLOUDEVENT_PRESETS;
const customSubject = ref('cncf.k8s.custom.event');
const customSeverity = ref<EventSeverity>('info');
const customMessage = ref('');

function submitCustomEvent() {
  const msg = customMessage.value.trim();
  if (!msg) return;
  emit('publishCustom', {
    natsSubject: customSubject.value.trim() || 'cncf.custom.event',
    severity: customSeverity.value,
    message: msg,
  });
  customMessage.value = '';
}
</script>
