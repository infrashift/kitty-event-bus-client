<template>
  <!-- Grain ambience -->
  <div class="fixed inset-0 pointer-events-none film-grain z-0 opacity-60"></div>

  <!-- Header / Curatorial Note -->
  <header
    class="app-header relative z-10 w-full pb-1.5 sm:pb-3 lg:!px-12 flex justify-between items-start gap-2 text-xs tracking-widest uppercase"
  >
    <div class="min-w-0">
      <h1
        class="font-serif text-base sm:text-xl tracking-wider text-neutral-900 dark:text-neutral-100 font-light truncate"
      >
        <span>KITTY, CloudEvent NATS Speaker</span>
        <span
          class="jp-title hidden sm:inline text-xs font-sans tracking-normal opacity-40 not-italic ml-2 font-normal"
        >
          猫・イベントバス
        </span>
      </h1>
      <p
        class="app-subtitle hidden sm:block text-[10px] sm:text-xs opacity-50 tracking-wider font-light mt-0.5"
      >
        Feline CNCF CloudEvents Consumer &bull; Formant &amp; TTS Vocalizer
      </p>
    </div>

    <!-- Gallery & NATS Utilities -->
    <div
      class="flex shrink-0 flex-wrap items-center gap-0.5 lg:gap-3 text-[11px] lowercase tracking-wider"
    >
      <button
        id="inspectorBtn"
        class="tap opacity-75 hover:opacity-100 transition-opacity p-1.5 focus:outline-none flex items-center gap-1.5 cursor-pointer"
        title="Open Live NATS Consumer & CloudEvent JSON Inspector"
        @click="inspectorOpen = true"
      >
        <span class="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
        <span class="hidden md:inline">nats events</span>
        <span
          id="eventCountBadge"
          class="px-1.5 py-0.2 rounded-full bg-neutral-200 dark:bg-neutral-800 text-[10px] font-mono"
        >
          {{ consumedEvents.length }}
        </span>
      </button>

      <a
        id="githubLink"
        href="https://github.com/infrashift/kitty-event-bus-client"
        class="tap opacity-60 hover:opacity-100 transition-opacity p-1.5 flex items-center gap-1.5"
        title="kitty-event-bus-client on GitHub"
        rel="noopener"
      >
        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2 0 1.9 1.2 1.9 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8 0 3.2.9.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1 .9 2.2v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3"
          />
        </svg>
        <span class="hidden lg:inline">github</span>
      </a>

      <button
        id="soundToggleBtn"
        class="tap opacity-60 hover:opacity-100 transition-opacity p-1.5 focus:outline-none flex items-center gap-1.5 cursor-pointer"
        title="Toggle Cat Speech & Formant Sound"
        @click="toggleSound"
      >
        <span id="soundIcon">{{ soundEnabled ? '🔊' : '🔇' }}</span>
        <span id="soundLabel" class="hidden lg:inline">{{
          soundEnabled ? 'sound on' : 'muted'
        }}</span>
      </button>

      <button
        id="themeToggleBtn"
        class="tap opacity-60 hover:opacity-100 transition-opacity p-1.5 focus:outline-none flex items-center gap-1.5 cursor-pointer"
        title="Toggle Gallery Light / Dark"
        @click="setTheme(!isDarkMode)"
      >
        <span id="themeIcon">◐</span>
        <span id="themeLabel" class="hidden lg:inline">{{
          isDarkMode ? 'light mode' : 'dark mode'
        }}</span>
      </button>

      <button
        id="fullscreenBtn"
        class="tap opacity-60 hover:opacity-100 transition-opacity p-1.5 focus:outline-none flex items-center cursor-pointer"
        title="Toggle Fullscreen"
        @click="toggleFullscreen"
      >
        <svg class="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
          />
        </svg>
      </button>
    </div>
  </header>

  <!-- Main Kitty Speaker Canvas Container -->
  <main class="app-main relative z-10 flex items-center justify-center p-1.5 sm:p-3">
    <KittySpeaker
      ref="kittyRef"
      :event-payload="latestPayload"
      :voice-mode="voiceMode"
      :voice-persona="voicePersona"
      :sound-enabled="soundEnabled"
      :is-dark="isDarkMode"
      :laser-alert-mode="laserAlertMode"
      :is-calibrating="isCalibrating"
      @update:laser-alert-mode="(val) => (laserAlertMode = val)"
      @calibration-change="(cfg) => (devConfigSnippet = cfg)"
    />
  </main>

  <!-- Lower Panel: NATS Event Bus Controls & Voice/Calibration Settings -->
  <footer
    class="app-footer relative z-10 w-full max-w-4xl mx-auto pt-1 flex flex-col items-center gap-1.5 sm:gap-2 text-xs font-light text-neutral-600 dark:text-neutral-400"
  >
    <!-- NATS Consumer Telemetry Readout (above) & Quick Publish Action Buttons (below) -->
    <div
      class="w-full flex flex-col items-center justify-center gap-1 sm:gap-1.5 border-b border-neutral-300/40 dark:border-neutral-800/80 pb-1.5"
    >
      <div class="flex items-center justify-center gap-1.5 min-w-0 max-w-full">
        <span
          class="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 opacity-75 shrink-0"
        >
          NATS
        </span>
        <span
          id="activeEventType"
          class="font-mono text-xs sm:text-sm text-neutral-900 dark:text-neutral-100 truncate max-w-[280px] sm:max-w-[460px]"
        >
          {{ latestPayload ? latestPayload.type : 'io.cncf.nats.consumer.listening' }}
        </span>
      </div>

      <div class="flex flex-wrap items-center justify-center gap-1.5">
        <button
          id="sendEventBtn"
          class="pill px-2.5 py-1 rounded-full bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[10px] font-medium tracking-wide hover:opacity-90 transition-opacity cursor-pointer"
          title="Publish next simulated CNCF CloudEvent to NATS consumer"
          @click="publishNextEvent"
        >
          ⚡ Send CloudEvent
        </button>

        <button
          id="sendAlertBtn"
          class="pill px-2.5 py-1 rounded-full border border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300 text-[10px] font-medium tracking-wide hover:bg-red-500/20 transition-colors cursor-pointer"
          title="Publish high-severity GPU Thermal Alert CloudEvent"
          @click="publishCriticalAlert"
        >
          🔥 Critical Alert
        </button>

        <button
          id="autoStreamBtn"
          class="pill px-2 py-1 rounded-full border text-[10px] font-mono tracking-wider transition-colors cursor-pointer"
          :class="
            autoStreamEnabled
              ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              : 'border-neutral-300 dark:border-neutral-700 opacity-70 hover:opacity-100'
          "
          title="Toggle automatic NATS CloudEvent stream"
          @click="toggleAutoStream"
        >
          {{ autoStreamEnabled ? 'AUTO: ON' : 'AUTO: OFF' }}
        </button>
      </div>
    </div>

    <!-- Voice Persona, Voice Mode, Laser Alert Mode & Calibration Controls -->
    <div class="w-full flex flex-wrap items-center justify-center gap-1.5 sm:gap-2.5">
      <!-- Voice Persona Selector Pills (Female / Male) -->
      <div
        id="voicePersonaSelector"
        data-testid="voice-persona-selector"
        class="inline-flex rounded-full p-0.5 bg-neutral-200/70 dark:bg-neutral-800/80 border border-neutral-300/50 dark:border-neutral-700/50 text-[10px] sm:text-[11px]"
      >
        <button
          id="voicePersonaFemale"
          class="pill px-2 py-0.5 rounded-full transition-all cursor-pointer"
          :class="
            voicePersona === 'female'
              ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
          "
          title="Smooth Female Voice"
          @click="selectVoicePersona('female')"
        >
          Female
        </button>
        <button
          id="voicePersonaNzMale"
          class="pill px-2 py-0.5 rounded-full transition-all cursor-pointer"
          :class="
            voicePersona === 'nz-male'
              ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
          "
          title="New Zealand Male Voice"
          @click="selectVoicePersona('nz-male')"
        >
          Male
        </button>
      </div>

      <!-- Voice Mode Selector Pills -->
      <div
        class="inline-flex rounded-full p-0.5 bg-neutral-200/70 dark:bg-neutral-800/80 border border-neutral-300/50 dark:border-neutral-700/50 text-[10px] sm:text-[11px]"
      >
        <button
          id="voiceBoth"
          class="pill px-2 py-0.5 rounded-full transition-all cursor-pointer"
          :class="
            voiceMode === 'both'
              ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
          "
          @click="voiceMode = 'both'"
        >
          Both
        </button>
        <button
          id="voiceMeow"
          class="pill px-2 py-0.5 rounded-full transition-all cursor-pointer"
          :class="
            voiceMode === 'meow'
              ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
          "
          @click="voiceMode = 'meow'"
        >
          Meow
        </button>
        <button
          id="voiceTts"
          class="pill px-2 py-0.5 rounded-full transition-all cursor-pointer"
          :class="
            voiceMode === 'tts'
              ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
          "
          @click="voiceMode = 'tts'"
        >
          TTS
        </button>
      </div>

      <!-- Visual Mode Selector Pills -->
      <div
        class="inline-flex rounded-full p-0.5 bg-neutral-200/70 dark:bg-neutral-800/80 border border-neutral-300/50 dark:border-neutral-700/50 text-[10px] sm:text-[11px]"
      >
        <button
          id="modePure"
          class="pill px-2.5 py-0.5 rounded-full transition-all cursor-pointer"
          :class="
            !laserAlertMode
              ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
          "
          @click="laserAlertMode = false"
        >
          Normal
        </button>
        <button
          id="modeOverlay"
          class="pill px-2.5 py-0.5 rounded-full transition-all cursor-pointer"
          :class="
            laserAlertMode
              ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
          "
          @click="activateLaserMode"
        >
          Laser Alert
        </button>
      </div>

      <!-- Calibrate Button & Developer Mode Checkbox -->
      <div class="flex items-center space-x-2.5 text-[10px] sm:text-[11px]">
        <button
          id="calibrateBtn"
          class="pill px-2.5 py-0.5 rounded-full border transition-colors cursor-pointer"
          :class="
            isCalibrating
              ? 'bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300'
              : 'border-neutral-300 dark:border-neutral-700 hover:border-neutral-500'
          "
          title="Drag eyes/mouth to align perfectly"
          @click="isCalibrating = !isCalibrating"
        >
          {{ isCalibrating ? 'Done Calibrating' : 'Calibrate Eyes and Mouth' }}
        </button>
        <label
          class="hidden sm:inline-flex items-center space-x-1.5 cursor-pointer select-none opacity-75 hover:opacity-100 transition-opacity"
          title="Display live eye & mouth coordinates"
        >
          <input
            id="devModeCheckbox"
            v-model="devModeOpen"
            type="checkbox"
            class="rounded border-neutral-400 text-amber-600 focus:ring-0 cursor-pointer"
          />
          <span>Dev Mode</span>
        </label>
      </div>
    </div>

    <!-- Developer Mode Live Attributes Readout -->
    <div
      v-if="devModeOpen"
      id="devModePanel"
      class="w-full max-w-xl bg-neutral-900/95 text-emerald-400 font-mono text-[11px] p-3 rounded-xl border border-neutral-700 shadow-lg transition-all"
    >
      <div
        class="flex items-center justify-between pb-1.5 mb-1.5 border-b border-neutral-800 text-[10px] text-neutral-400 uppercase tracking-wider"
      >
        <span>SUBJECTS[0] Eye &amp; Mouth Attributes (Live)</span>
        <button
          id="copyDevConfigBtn"
          class="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-600 transition-colors cursor-pointer"
          @click="copyDevConfig"
        >
          {{ copiedDevConfig ? 'Copied!' : 'Copy Config' }}
        </button>
      </div>
      <pre id="devModeOutput" class="overflow-x-auto leading-relaxed select-all whitespace-pre">{{
        devConfigSnippet
      }}</pre>
    </div>

    <!-- Subtle Legend -->
    <div
      class="legend flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-6 gap-y-0.5 text-[10px] tracking-wider text-neutral-400 dark:text-neutral-500 text-center"
    >
      <span>Consumer: <strong class="font-normal text-neutral-600 dark:text-neutral-300">CNCF CloudEvents v1.0</strong></span>
      <span>Bubble Paging: <strong class="font-normal text-neutral-600 dark:text-neutral-300">Speech-Chunk Synced</strong></span>
      <span>Critical Events: <strong class="font-normal text-neutral-600 dark:text-neutral-300">Ocular Plasma Lasers</strong></span>
    </div>
  </footer>

  <!-- Slide-Over NATS Consumer & CloudEvent JSON Inspector Drawer -->
  <CloudEventInspector
    :open="inspectorOpen"
    :events="consumedEvents"
    @close="inspectorOpen = false"
    @publish-preset="onPublishPreset"
    @publish-custom="onPublishCustom"
    @replay="onReplayEnvelope"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import KittySpeaker from './components/KittySpeaker.vue';
import CloudEventInspector from './components/CloudEventInspector.vue';
import {
  MockNatsBus,
  createKittyNatsConsumer,
  type NatsEnvelope,
} from './events/mockNatsBus';
import {
  CLOUDEVENT_PRESETS,
  buildCloudEventFromPreset,
  type EventSeverity,
  type KittyEventPayload,
} from './events/cloudevents';
import type { VoiceMode, VoicePersona } from './audio/felineSpeechEngine';

const THEME_KEY = 'starlight-theme';

const kittyRef = ref<InstanceType<typeof KittySpeaker> | null>(null);
const isDarkMode = ref(false);
const soundEnabled = ref(true);
const voiceMode = ref<VoiceMode>('both');
const voicePersona = ref<VoicePersona>('female');
const laserAlertMode = ref(false);
const isCalibrating = ref(false);
const devModeOpen = ref(false);
const devConfigSnippet = ref('');
const copiedDevConfig = ref(false);
const inspectorOpen = ref(false);
const autoStreamEnabled = ref(false);

const latestPayload = ref<KittyEventPayload | null>(null);
const consumedEvents = ref<NatsEnvelope[]>([]);

const natsBus = new MockNatsBus();
let unsubscribeConsumer: (() => void) | null = null;

function setTheme(dark: boolean, persist = true) {
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    } catch {}
  }
  isDarkMode.value = dark;
  if (dark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

function toggleSound() {
  soundEnabled.value = !soundEnabled.value;
  if (soundEnabled.value) {
    kittyRef.value?.triggerMeow(laserAlertMode.value);
  }
}

function selectVoicePersona(persona: VoicePersona) {
  voicePersona.value = persona;
  if (latestPayload.value) {
    kittyRef.value?.speakEvent(latestPayload.value, { voicePersona: persona });
  } else {
    kittyRef.value?.triggerMeow(laserAlertMode.value);
  }
}

function activateLaserMode() {
  laserAlertMode.value = true;
  kittyRef.value?.triggerMeow(true);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

function publishNextEvent() {
  natsBus.publishNextPreset();
}

function publishCriticalAlert() {
  // Preset index 1 is the Critical GPU Thermal Alert
  natsBus.publishPresetByIndex(1);
}

function toggleAutoStream() {
  autoStreamEnabled.value = !autoStreamEnabled.value;
  if (autoStreamEnabled.value) {
    natsBus.publishNextPreset();
    natsBus.startAutoStream(14000);
  } else {
    natsBus.stopAutoStream();
  }
}

function onPublishPreset(index: number) {
  natsBus.publishPresetByIndex(index);
}

function onPublishCustom(custom: {
  natsSubject: string;
  severity: EventSeverity;
  message: string;
}) {
  const basePreset = CLOUDEVENT_PRESETS[0];
  const { natsSubject, cloudEvent } = buildCloudEventFromPreset(basePreset, {
    natsSubject: custom.natsSubject,
    severity: custom.severity,
    type: `io.cncf.custom.${custom.severity}`,
    message: custom.message,
  });
  natsBus.publish(natsSubject, cloudEvent);
}

function onReplayEnvelope(envelope: NatsEnvelope) {
  const { cloudEvent, subject } = envelope;
  latestPayload.value = {
    id: `${cloudEvent.id}-replay-${Date.now()}`,
    natsSubject: subject,
    type: cloudEvent.type,
    source: cloudEvent.source,
    severity: cloudEvent.data.severity,
    message: cloudEvent.data.message,
    time: new Date().toISOString(),
  };
}

function copyDevConfig() {
  navigator.clipboard?.writeText(devConfigSnippet.value).catch(() => {});
  copiedDevConfig.value = true;
  setTimeout(() => {
    copiedDevConfig.value = false;
  }, 1400);
}

onMounted(() => {
  // Initialize theme from localStorage 'starlight-theme'
  let savedTheme = '';
  try {
    savedTheme = localStorage.getItem(THEME_KEY) || '';
  } catch {}
  if (savedTheme === 'dark' || savedTheme === 'light') {
    setTheme(savedTheme === 'dark', false);
  } else {
    setTheme(
      !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches),
      false
    );
  }

  // Subscribe the NATS Consumer to `cncf.>` and forward extracted message payloads to <KittySpeaker />
  unsubscribeConsumer = createKittyNatsConsumer(natsBus, 'cncf.>', {
    onKittyMessage: (payload, rawEnvelope) => {
      consumedEvents.value = [rawEnvelope, ...consumedEvents.value.slice(0, 49)];
      latestPayload.value = payload;
    },
  });

  // Publish an initial welcome CloudEvent so the speech bubble and inspector are populated on load
  natsBus.publishPresetByIndex(0);
});

onBeforeUnmount(() => {
  natsBus.stopAutoStream();
  unsubscribeConsumer?.();
});
</script>
