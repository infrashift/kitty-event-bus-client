<template>
  <div class="clock-frame relative flex items-center justify-center select-none">
    <!-- Soft ambient backdrop bezel shadow -->
    <div
      class="absolute inset-2 sm:inset-4 rounded-full bg-gradient-to-b from-black/[0.03] to-black/[0.08] dark:from-white/[0.02] dark:to-white/[0.06] shadow-2xl backdrop-blur-[2px] transition-all duration-700 pointer-events-none"
    ></div>

    <!-- The Core 800x800 HiDPI Cat Canvas -->
    <canvas
      id="faceCanvas"
      ref="canvasRef"
      class="relative z-10 w-full h-full cursor-pointer rounded-full"
      @click="onCanvasClick"
      @mousedown="onPointerDown"
      @touchstart.passive="false"
      @touchstart="onPointerDown"
      @wheel.passive="false"
      @wheel="onWheel"
    ></canvas>

    <!-- Chunked Speech Bubble Overlay (Positioned cleanly over the lower rim below the jaw) -->
    <div
      v-if="activeChunk && !isCalibrating"
      id="speechBubble"
      data-testid="speech-bubble"
      class="absolute z-20 bottom-[4%] left-1/2 -translate-x-1/2 w-[88%] max-w-[440px] rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 backdrop-blur-md shadow-xl border transition-all duration-200 pointer-events-none"
      :class="
        laserAlertMode
          ? 'bg-neutral-950/90 border-red-500/70 text-amber-50 shadow-red-950/50'
          : 'bg-white/90 dark:bg-neutral-900/90 border-neutral-300/80 dark:border-neutral-700/80 text-neutral-900 dark:text-neutral-100'
      "
    >
      <!-- Speech pointer triangle pointing up toward the cat's hinged jaw -->
      <div
        class="absolute -top-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rotate-45 border-l border-t"
        :class="
          laserAlertMode
            ? 'bg-neutral-950/90 border-red-500/70'
            : 'bg-white/90 dark:bg-neutral-900/90 border-neutral-300/80 dark:border-neutral-700/80'
        "
      ></div>

      <!-- Bubble Top Telemetry Bar: NATS Subject + Chunk Indicator -->
      <div class="flex items-center justify-between gap-2 text-[9px] sm:text-[10px] font-mono uppercase tracking-wider mb-1 opacity-80">
        <div class="flex items-center gap-1.5 truncate">
          <span
            class="inline-block w-2 h-2 rounded-full shrink-0"
            :class="[
              currentSeverity === 'critical' || currentSeverity === 'error'
                ? 'bg-red-500 animate-ping'
                : currentSeverity === 'warning'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500',
            ]"
          ></span>
          <span id="bubbleSubject" class="truncate">{{ currentSubject }}</span>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <span
            v-if="isSpeaking"
            class="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 font-semibold"
          >
            SPEAKING
          </span>
          <span
            id="chunkIndicator"
            data-testid="chunk-indicator"
            class="px-1.5 py-0.2 rounded border border-current/20"
          >
            {{ activeChunk.index + 1 }} / {{ activeChunk.totalChunks }}
          </span>
        </div>
      </div>

      <!-- Chunked Spoken Message with Word-by-Word Highlighting -->
      <p
        id="bubbleText"
        data-testid="bubble-chunk-text"
        class="font-serif text-sm sm:text-base md:text-lg leading-snug tracking-wide text-center"
        :class="laserAlertMode ? 'text-white' : 'text-neutral-900 dark:text-neutral-100'"
      >
        <template
          v-for="(word, wIdx) in activeChunk.words"
          :key="`${activeChunk.index}-${wIdx}`"
        >
          <span
            :data-word-index="wIdx"
            :data-active="isSpeaking && wIdx === activeWordIndex ? 'true' : 'false'"
            class="inline-block px-1 rounded"
            :class="[
              isSpeaking && wIdx === activeWordIndex
                ? laserAlertMode
                  ? 'bg-red-500/60 text-white font-semibold'
                  : 'bg-amber-400/35 dark:bg-amber-500/30 text-neutral-950 dark:text-white font-semibold'
                : laserAlertMode
                  ? 'text-white'
                  : 'text-neutral-900 dark:text-neutral-100',
            ]"
          >{{ word }}</span>{{ wIdx < activeChunk.words.length - 1 ? ' ' : '' }}
        </template>
      </p>
    </div>

    <!-- Autoplay gate: the browser blocks sound until the first user gesture -->
    <button
      v-if="awaitingAudioUnlock && !isCalibrating"
      id="audioUnlockHint"
      data-testid="audio-unlock-hint"
      type="button"
      class="absolute z-30 bottom-[8%] left-1/2 -translate-x-1/2 w-max max-w-[90%] px-3.5 py-1.5 rounded-full bg-neutral-900/85 dark:bg-neutral-100/90 text-white dark:text-neutral-900 text-[11px] sm:text-xs tracking-wide shadow-lg cursor-pointer animate-pulse"
      title="Your browser blocks sound until you interact with the page"
      @click="speechEngine.unlockAudioFromGesture()"
    >
      🔈 Tap anywhere to hear KITTY
    </button>

    <!-- Calibration Instructional Text -->
    <div
      id="hoverGuide"
      class="absolute z-30 bottom-2 left-1/2 -translate-x-1/2 w-max max-w-[95%] px-3 py-1 rounded-full bg-gallery-light/90 dark:bg-gallery-dark/90 pointer-events-none text-[10px] sm:text-xs tracking-widest text-center uppercase transition-opacity duration-300"
      :class="
        isCalibrating
          ? 'opacity-100 text-amber-600 dark:text-amber-400 font-medium'
          : 'opacity-0 text-neutral-400 dark:text-neutral-500'
      "
    >
      {{ calibrationHint }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue';
import {
  FelineSpeechEngine,
  DEFAULT_TTS_BASE_URL,
  DEFAULT_TTS_PROXY_URL,
  type VoiceMode,
  type VoicePersona,
  type MessageChunk,
  type SpeechChunkState,
} from '../audio/felineSpeechEngine';
import {
  CLOUDEVENT_PRESETS,
  type EventSeverity,
  type KittyEventPayload,
} from '../events/cloudevents';

export interface EyeFeature {
  x: number;
  y: number;
  rx: number;
  ry: number;
  angle?: number;
}

export interface MouthFeature {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export interface CatSubject {
  name: string;
  url: string;
  cropZoom: number;
  cropOffsetY: number;
  leftEye: EyeFeature;
  rightEye: EyeFeature;
  mouth: MouthFeature;
  irisColor: string;
  irisInner: string;
  irisOuter: string;
  skinSample: string;
  skinShadow: string;
  autoDetected: boolean;
}

const props = withDefaults(
  defineProps<{
    eventPayload?: KittyEventPayload | null;
    voiceMode?: VoiceMode;
    voicePersona?: VoicePersona;
    soundEnabled?: boolean;
    isDark?: boolean;
    laserAlertMode?: boolean;
    isCalibrating?: boolean;
    maxWordsPerChunk?: number;
    maxCharsPerChunk?: number;
    minChunkMs?: number;
    msPerWord?: number;
    /** Folder holding the pre-synthesized `<hash>.mp3` neural TTS files (the package's `dist/tts/`). */
    ttsBaseUrl?: string;
    /** Optional live TTS proxy endpoint (dev only); `null` disables it. */
    ttsProxyUrl?: string | null;
  }>(),
  {
    eventPayload: null,
    voiceMode: 'both',
    voicePersona: 'nz-male',
    soundEnabled: true,
    isDark: false,
    laserAlertMode: false,
    isCalibrating: false,
    maxWordsPerChunk: 8,
    maxCharsPerChunk: 52,
    minChunkMs: 1400,
    msPerWord: 260,
    ttsBaseUrl: DEFAULT_TTS_BASE_URL,
    ttsProxyUrl: DEFAULT_TTS_PROXY_URL,
  }
);

const emit = defineEmits<{
  (e: 'update:laserAlertMode', value: boolean): void;
  (e: 'calibrationChange', configSnippet: string): void;
  (e: 'speechStateChange', state: SpeechChunkState): void;
}>();

const PUPIL_ORBIT_RADIUS = 14;

const SUBJECTS: CatSubject[] = [
  {
    name: 'Tabby Cat',
    url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=1000&height=1000&q=85',
    cropZoom: 1.35,
    cropOffsetY: -20,
    leftEye: { x: 295.9, y: 294.9, rx: 42, ry: 34, angle: 0.12 },
    rightEye: { x: 499.9, y: 295.9, rx: 42, ry: 34, angle: -0.12 },
    mouth: { x: 392.8, y: 479.5, rx: 42, ry: 22 },
    irisColor: '#7ca82b',
    irisInner: '#d4e868',
    irisOuter: '#2d4212',
    skinSample: '#786858',
    skinShadow: '#3e332a',
    autoDetected: true,
  },
];

interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  isSmoke: boolean;
}

interface ScorchMark {
  x: number;
  y: number;
  life: number;
  r: number;
}

interface FrameMap {
  mapX: (x: number) => number;
  mapY: (y: number) => number;
  invX: (cx: number) => number;
  invY: (cy: number) => number;
  scaleBreath: number;
}

const PAPER_SEGMENTS = 180;
const paperGrain = new Float32Array(PAPER_SEGMENTS);
for (let i = 0; i < PAPER_SEGMENTS; i++) {
  const a = (i / PAPER_SEGMENTS) * Math.PI * 2;
  paperGrain[i] =
    1.0 +
    Math.sin(a * 7 + 0.5) * 0.22 +
    Math.cos(a * 17 - 1.1) * 0.16 +
    Math.sin(a * 31 + 2.4) * 0.1;
}

const state = {
  subjectIndex: 0,
  faceLoaded: false,
  lastFrameMap: null as FrameMap | null,
  blinkState: 0,
  isBlinking: false,
  blinkProgress: 0,
  blinkCooldown: 4.5,
  breathPhase: 0,
  subtleDriftX: 0,
  subtleDriftY: 0,
  leftEye: { x: 0, y: 0, targetX: 0, targetY: 0 },
  rightEye: { x: 0, y: 0, targetX: 0, targetY: 0 },
  screamOpen: 0,
  draggingFeature: null as 'leftEye' | 'rightEye' | 'mouth' | null,
  sparks: [] as SparkParticle[],
  scorchMarks: [] as ScorchMark[],
  laserSweepAngle: -Math.PI / 3,
  burnDepth: new Float32Array(PAPER_SEGMENTS),
  emberHeat: new Float32Array(PAPER_SEGMENTS),
  burnInitialized: false,
};

const canvasRef = ref<HTMLCanvasElement | null>(null);
const isSpeaking = ref(false);
const awaitingAudioUnlock = ref(false);
let lastSpokenPayload: KittyEventPayload | null = null;
// Laser mode switched on by a critical/error event (rather than the manual Laser control).
// The silent "scream" jaw pose is reserved for manual laser mode: an alert's jaw is driven
// purely by its yowl and speech, so it stays shut in the bubble-close gap after speaking.
let alertLaserRunId = 0;
let alertLaserActive = false;
const activeChunk = ref<MessageChunk | null>(null);
const activeChunkIndex = ref(0);
const activeWordIndex = ref(0);
const currentSubject = ref('cncf.events.ready');
const currentSeverity = ref<EventSeverity>('info');

const isCoarsePointer = ref(false);
const calibrationHint = computed(() => {
  if (!props.isCalibrating) return '';
  return isCoarsePointer.value
    ? 'Drag an eye or the mouth to align • Pinch to resize'
    : 'Drag Left Eye, Right Eye, or Mouth to align • Scroll wheel to resize';
});

// Speech & Formant Engine instance
const speechEngine = new FelineSpeechEngine((speechState) => {
  isSpeaking.value = speechState.isSpeaking;
  awaitingAudioUnlock.value = speechState.awaitingAudioUnlock;
  activeChunk.value = speechState.activeChunk;
  activeChunkIndex.value = speechState.activeChunkIndex;
  activeWordIndex.value = speechState.activeWordIndex;
  emit('speechStateChange', speechState);
}, { ttsBaseUrl: props.ttsBaseUrl, ttsProxyUrl: props.ttsProxyUrl });

watch(
  () => [props.ttsBaseUrl, props.ttsProxyUrl] as const,
  ([ttsBaseUrl, ttsProxyUrl]) => speechEngine.setTtsEndpoints({ ttsBaseUrl, ttsProxyUrl })
);

let offCanvas: HTMLCanvasElement | null = null;
let offCtx: CanvasRenderingContext2D | null = null;
let resizeObserver: ResizeObserver | null = null;
let rafId = 0;

/**
 * Draws a rich fallback tabby cat portrait onto `offCanvas` immediately so the canvas
 * is 100% functional from frame 1 (even before Unsplash finishes or in offline CI).
 */
function drawProceduralTabbyFallback(ctx: CanvasRenderingContext2D) {
  ctx.save();
  const bgGrad = ctx.createRadialGradient(400, 400, 60, 400, 400, 420);
  bgGrad.addColorStop(0, '#96826e');
  bgGrad.addColorStop(0.55, '#786858');
  bgGrad.addColorStop(0.85, '#54463a');
  bgGrad.addColorStop(1, '#362c24');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 800, 800);

  // Subtle tabby forehead M-stripes and cheek fur strokes
  ctx.strokeStyle = 'rgba(38, 28, 20, 0.45)';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  for (let side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(400 + side * (25 + i * 28), 150 + i * 18);
      ctx.quadraticCurveTo(400 + side * (55 + i * 35), 220, 400 + side * (35 + i * 25), 260);
      ctx.stroke();
    }
  }

  // Lighter whisker pads and chin tuft
  const muzzleGrad = ctx.createRadialGradient(393, 495, 15, 393, 495, 135);
  muzzleGrad.addColorStop(0, '#cbbba8');
  muzzleGrad.addColorStop(0.65, '#a89682');
  muzzleGrad.addColorStop(1, 'rgba(120, 104, 88, 0)');
  ctx.fillStyle = muzzleGrad;
  ctx.beginPath();
  ctx.arc(393, 495, 135, 0, Math.PI * 2);
  ctx.fill();

  // Pinkish feline nose triangle
  ctx.fillStyle = '#c47a76';
  ctx.beginPath();
  ctx.moveTo(362, 445);
  ctx.lineTo(424, 445);
  ctx.lineTo(393, 474);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function loadSubject(index: number) {
  state.subjectIndex = index;
  const subj = SUBJECTS[index];
  if (!offCanvas) {
    offCanvas = document.createElement('canvas');
    offCanvas.width = 800;
    offCanvas.height = 800;
    offCtx = offCanvas.getContext('2d');
  }
  if (offCtx) {
    drawProceduralTabbyFallback(offCtx);
    state.faceLoaded = true;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (!offCtx) return;
    prepareOffscreenFace(img, subj);
    state.faceLoaded = true;
    sampleSubjectSkin(subj);
  };
  img.src = subj.url;
}

function prepareOffscreenFace(img: HTMLImageElement, subj: CatSubject) {
  if (!offCtx) return;
  offCtx.clearRect(0, 0, 800, 800);
  const zoom = subj.cropZoom || 1.25;
  const offsetY = subj.cropOffsetY || 0;
  const baseS = Math.min(img.width, img.height);
  const s = baseS / zoom;
  const sx = (img.width - s) / 2;
  const sy = Math.max(0, Math.min(img.height - s, (img.height - s) / 2 + offsetY));
  offCtx.drawImage(img, sx, sy, s, s, 0, 0, 800, 800);
}

function sampleSubjectSkin(subj: CatSubject) {
  if (!offCtx) return;
  try {
    const p = offCtx.getImageData(
      Math.round(subj.leftEye.x),
      Math.round(subj.leftEye.y - subj.leftEye.ry - 8),
      1,
      1
    ).data;
    if (p[3] > 0) {
      subj.skinSample = `rgb(${p[0]}, ${p[1]}, ${p[2]})`;
      subj.skinShadow = `rgb(${Math.max(0, p[0] - 34)}, ${Math.max(0, p[1] - 34)}, ${Math.max(0, p[2] - 34)})`;
    }
  } catch {}
}

function emitCalibrationConfig() {
  const subj = SUBJECTS[state.subjectIndex];
  if (!subj) return;
  const fmt = (n: number) => Math.round(n * 10) / 10;
  const snippet = `leftEye: { x: ${fmt(subj.leftEye.x)}, y: ${fmt(subj.leftEye.y)}, rx: ${fmt(subj.leftEye.rx)}, ry: ${fmt(subj.leftEye.ry)}, angle: ${subj.leftEye.angle || 0} },
rightEye: { x: ${fmt(subj.rightEye.x)}, y: ${fmt(subj.rightEye.y)}, rx: ${fmt(subj.rightEye.rx)}, ry: ${fmt(subj.rightEye.ry)}, angle: ${subj.rightEye.angle || 0} },
mouth: { x: ${fmt(subj.mouth.x)}, y: ${fmt(subj.mouth.y)}, rx: ${fmt(subj.mouth.rx)}, ry: ${fmt(subj.mouth.ry)} },`;
  emit('calibrationChange', snippet);
}

// Calibration pointer & pinch handlers
function clientToCanvas(clientX: number, clientY: number) {
  const canvas = canvasRef.value;
  if (!canvas) return { x: 400, y: 400 };
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * 800,
    y: ((clientY - rect.top) / rect.height) * 800,
  };
}

function getCanvasCoords(e: MouseEvent | TouchEvent) {
  const touches = (e as TouchEvent).touches;
  const clientX = touches && touches.length > 0 ? touches[0].clientX : (e as MouseEvent).clientX;
  const clientY = touches && touches.length > 0 ? touches[0].clientY : (e as MouseEvent).clientY;
  return clientToCanvas(clientX, clientY);
}

function featureAt(pt: { x: number; y: number }, slack = 0): 'leftEye' | 'rightEye' | 'mouth' | null {
  if (!state.lastFrameMap) return null;
  const subj = SUBJECTS[state.subjectIndex];
  const { invX, invY } = state.lastFrameMap;
  const ux = invX(pt.x);
  const uy = invY(pt.y);
  if (Math.hypot(ux - subj.leftEye.x, uy - subj.leftEye.y) < 48 + slack) return 'leftEye';
  if (Math.hypot(ux - subj.rightEye.x, uy - subj.rightEye.y) < 48 + slack) return 'rightEye';
  if (Math.hypot(ux - subj.mouth.x, uy - subj.mouth.y) < 55 + slack) return 'mouth';
  return null;
}

function scaleFeature(feature: 'leftEye' | 'rightEye' | 'mouth', rx: number, ry: number) {
  const target = SUBJECTS[state.subjectIndex][feature];
  target.rx = Math.min(200, Math.max(8, rx));
  target.ry = Math.min(200, Math.max(8, ry));
  emitCalibrationConfig();
}

let pinch: {
  feature: 'leftEye' | 'rightEye' | 'mouth';
  d0: number;
  rx0: number;
  ry0: number;
} | null = null;

function touchDistance(t: TouchList) {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
}

function onPointerDown(e: MouseEvent | TouchEvent) {
  speechEngine.ensureAudioContext();
  if (!props.isCalibrating || !state.lastFrameMap) return;

  const touches = (e as TouchEvent).touches;
  if (touches && touches.length === 2) {
    const mid = clientToCanvas(
      (touches[0].clientX + touches[1].clientX) / 2,
      (touches[0].clientY + touches[1].clientY) / 2
    );
    const feature = featureAt(mid, 25) || state.draggingFeature;
    state.draggingFeature = null;
    if (feature) {
      const target = SUBJECTS[state.subjectIndex][feature];
      pinch = { feature, d0: touchDistance(touches), rx0: target.rx, ry0: target.ry };
      if (e.cancelable) e.preventDefault();
    }
    return;
  }

  state.draggingFeature = featureAt(getCanvasCoords(e));
  if (state.draggingFeature && e.cancelable) e.preventDefault();
}

function onPointerMove(e: MouseEvent | TouchEvent) {
  const touches = (e as TouchEvent).touches;
  if (pinch && touches && touches.length === 2) {
    if (e.cancelable) e.preventDefault();
    const f = touchDistance(touches) / (pinch.d0 || 1);
    scaleFeature(pinch.feature, pinch.rx0 * f, pinch.ry0 * f);
    return;
  }
  if (!props.isCalibrating || !state.draggingFeature || !state.lastFrameMap) return;
  if (e.cancelable) e.preventDefault();
  const pt = getCanvasCoords(e);
  const subj = SUBJECTS[state.subjectIndex];
  const { invX, invY } = state.lastFrameMap;
  const target = subj[state.draggingFeature];
  target.x = invX(pt.x);
  target.y = invY(pt.y);
  sampleSubjectSkin(subj);
  emitCalibrationConfig();
}

function onPointerUp(e?: MouseEvent | TouchEvent) {
  state.draggingFeature = null;
  const touches = e && (e as TouchEvent).touches;
  if (!touches || touches.length < 2) pinch = null;
}

function onWheel(e: WheelEvent) {
  if (!props.isCalibrating || !state.lastFrameMap) return;
  e.preventDefault();
  const feature = featureAt(getCanvasCoords(e), 7);
  if (!feature) return;
  const factor = e.deltaY < 0 ? 1.05 : 0.95;
  const target = SUBJECTS[state.subjectIndex][feature];
  scaleFeature(feature, target.rx * factor, target.ry * factor);
}

function onCanvasClick() {
  speechEngine.ensureAudioContext();
  if (props.isCalibrating) return;
  triggerBlink(true);
}

function triggerBlink(forced = false) {
  if (state.isBlinking && !forced) return;
  state.isBlinking = true;
  state.blinkProgress = 0;
  state.blinkCooldown = 4.5 + Math.random() * 2.5;
}

function resizeCanvas() {
  const canvas = canvasRef.value;
  if (!canvas || !canvas.parentElement) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  const size = Math.min(rect.width, rect.height);
  if (!size) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const scale = (size * dpr) / 800;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.resetTransform();
    ctx.scale(scale, scale);
  }
}

let lastTime = 0;

function render(currentTime: number) {
  rafId = requestAnimationFrame(render);
  const dt = lastTime ? Math.min((currentTime - lastTime) / 1000, 0.1) : 0.016;
  lastTime = currentTime;

  const now = new Date();
  const seconds = now.getSeconds();
  const ms = now.getMilliseconds();
  const totalSeconds = now.getMinutes() * 60 + seconds + ms / 1000;

  // Sample the speech engine's live syllable lip-sync envelope
  const speechSample = speechEngine.sampleLiveFrame(currentTime, dt);
  const manualScream = props.laserAlertMode && !alertLaserActive && !speechEngine.isSpeaking;
  const targetMouth = speechSample.mouthOpen + (manualScream ? 0.85 : 0);
  state.screamOpen += (Math.min(1.2, targetMouth) - state.screamOpen) * Math.min(1, dt * 15);

  // Relaxed feline blink cycle (~4.5s - 7.0s interval, ~435ms gentle eyelid sweep)
  state.blinkCooldown -= dt;
  if (state.blinkCooldown <= 0) {
    triggerBlink(true);
  }

  if (state.isBlinking) {
    state.blinkProgress += dt * 7.2;
    if (state.blinkProgress >= Math.PI) {
      state.blinkProgress = 0;
      state.isBlinking = false;
      state.blinkState = 0;
    } else {
      state.blinkState = Math.pow(Math.sin(state.blinkProgress), 0.85);
    }
  }

  // Breathing Cycle (~4.2s)
  state.breathPhase = ((totalSeconds % 4.2) / 4.2) * Math.PI * 2;
  const breathScale = Math.sin(state.breathPhase);

  // Expressive Gaze Tracking:
  // In Laser Alert mode, sweep slowly along the paper edge so the lasers visibly char and burn it
  state.laserSweepAngle += dt * (props.laserAlertMode ? 0.52 : 1.2);
  const leftAngle = state.laserSweepAngle;
  const rightAngle = -state.laserSweepAngle * 0.85 + Math.PI * 0.28;

  if (props.laserAlertMode) {
    state.leftEye.targetX = Math.cos(leftAngle) * PUPIL_ORBIT_RADIUS;
    state.leftEye.targetY = Math.sin(leftAngle) * PUPIL_ORBIT_RADIUS;
    state.rightEye.targetX = Math.cos(rightAngle) * PUPIL_ORBIT_RADIUS;
    state.rightEye.targetY = Math.sin(rightAngle) * PUPIL_ORBIT_RADIUS;
  } else if (speechEngine.isSpeaking && speechSample.activeChunk) {
    const wordCount = Math.max(1, speechSample.activeChunk.words.length - 1);
    const wordProgress = (speechSample.activeWordIndex / wordCount) * 2 - 1; // -1 (left) to +1 (right)
    const lookX = wordProgress * (PUPIL_ORBIT_RADIUS * 0.75);
    const lookY = 4.5 + Math.sin(currentTime * 0.008) * 2.0; // Looking slightly down toward the speech bubble
    state.leftEye.targetX = lookX;
    state.leftEye.targetY = lookY;
    state.rightEye.targetX = lookX;
    state.rightEye.targetY = lookY;
  } else {
    // Calm presenter gaze with organic micro-saccades
    const idleX = Math.sin(currentTime * 0.0009) * 5;
    const idleY = Math.cos(currentTime * 0.0012) * 3.5;
    state.leftEye.targetX = idleX;
    state.leftEye.targetY = idleY;
    state.rightEye.targetX = idleX;
    state.rightEye.targetY = idleY;
  }

  state.rightEye.x += (state.rightEye.targetX - state.rightEye.x) * Math.min(1, dt * 10);
  state.rightEye.y += (state.rightEye.targetY - state.rightEye.y) * Math.min(1, dt * 10);
  state.leftEye.x += (state.leftEye.targetX - state.leftEye.x) * Math.min(1, dt * 10);
  state.leftEye.y += (state.leftEye.targetY - state.leftEye.y) * Math.min(1, dt * 10);

  state.subtleDriftX = Math.sin(currentTime * 0.001) * 2;
  state.subtleDriftY = Math.cos(currentTime * 0.0014) * 1.5;

  const canvas = canvasRef.value;
  const ctx = canvas?.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 800, 800);
    drawCatPortrait(ctx, breathScale, rightAngle, leftAngle, dt);
  }
}

function drawCatPortrait(
  ctx: CanvasRenderingContext2D,
  breath: number,
  rightBeamAngle: number,
  leftBeamAngle: number,
  dt: number
) {
  const centerX = 400 + state.subtleDriftX * 0.6;
  const centerY = 400 + state.subtleDriftY * 0.6 + breath * 1.1;
  const isDark = props.isDark;
  const subj = SUBJECTS[state.subjectIndex];
  const showOverlay = props.laserAlertMode;

  ctx.save();

  // Advance or reset paper burn contour before clipping so the burned paper edge IS the portrait boundary
  let burnPts: PaperBurnPoint[] | null = null;
  if (showOverlay) {
    burnPts = stepAndBuildPaperBurnContour(rightBeamAngle, leftBeamAngle, dt);
  } else if (state.burnInitialized) {
    state.burnDepth.fill(0);
    state.emberHeat.fill(0);
    state.burnInitialized = false;
  }

  // 1. Portrait Mask (Scalloped burning paper contour in Alert mode, clean circle in Normal mode)
  ctx.beginPath();
  if (burnPts && burnPts.length > 0) {
    for (let i = 0; i < burnPts.length; i++) {
      if (i === 0) ctx.moveTo(burnPts[i].x, burnPts[i].y);
      else ctx.lineTo(burnPts[i].x, burnPts[i].y);
    }
    ctx.closePath();
  } else {
    ctx.arc(400, 400, 380, 0, Math.PI * 2);
  }
  ctx.clip();

  ctx.fillStyle = isDark ? '#1a1a1d' : '#e8e4dc';
  ctx.fillRect(0, 0, 800, 800);

  let leftEyePos: EyeFeature | null = null;
  let rightEyePos: EyeFeature | null = null;
  let mouthPos: MouthFeature | null = null;

  if (state.faceLoaded && offCanvas) {
    const scaleBreath = 1.06 + breath * 0.005;
    const drawSize = 800 * scaleBreath;
    const offsetX = centerX - drawSize / 2;
    const offsetY = centerY - drawSize / 2;

    ctx.drawImage(offCanvas, offsetX, offsetY, drawSize, drawSize);

    const mapX = (x: number) => offsetX + (x / 800) * drawSize;
    const mapY = (y: number) => offsetY + (y / 800) * drawSize;
    const invX = (cx: number) => ((cx - offsetX) / drawSize) * 800;
    const invY = (cy: number) => ((cy - offsetY) / drawSize) * 800;
    state.lastFrameMap = { mapX, mapY, invX, invY, scaleBreath };

    leftEyePos = {
      x: mapX(subj.leftEye.x),
      y: mapY(subj.leftEye.y),
      rx: subj.leftEye.rx * scaleBreath,
      ry: subj.leftEye.ry * scaleBreath,
      angle: subj.leftEye.angle || 0,
    };

    rightEyePos = {
      x: mapX(subj.rightEye.x),
      y: mapY(subj.rightEye.y),
      rx: subj.rightEye.rx * scaleBreath,
      ry: subj.rightEye.ry * scaleBreath,
      angle: subj.rightEye.angle || 0,
    };

    mouthPos = {
      x: mapX(subj.mouth.x),
      y: mapY(subj.mouth.y),
      rx: subj.mouth.rx * scaleBreath,
      ry: subj.mouth.ry * scaleBreath,
    };

    // 2. Real-time Feline Animated Eyes
    drawCatEye(ctx, {
      pos: leftEyePos,
      gazeX: state.leftEye.x,
      gazeY: state.leftEye.y,
      blink: state.blinkState,
      subj,
      showOverlay,
    });

    drawCatEye(ctx, {
      pos: rightEyePos,
      gazeX: state.rightEye.x,
      gazeY: state.rightEye.y,
      blink: state.blinkState,
      subj,
      showOverlay,
    });

    // 3. Terry Gilliam Cutout Jaw Engine driven by live speech lip-sync
    drawCatNoseAndMouth(ctx, mouthPos, breath, subj);
  }

  // 4. Rim Vignette
  const vignette = ctx.createRadialGradient(400, 400, 275, 400, 400, 382);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(0.78, showOverlay ? 'rgba(15,5,0,0.28)' : 'rgba(0,0,0,0.08)');
  vignette.addColorStop(1, showOverlay ? 'rgba(10,2,0,0.72)' : 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, 800, 800);

  // 5. Slowly Burning Paper Edge + High-Energy Ocular Laser Beams in Alert Mode
  if (showOverlay && leftEyePos && rightEyePos && burnPts) {
    drawEdgeFire(ctx, burnPts, dt);
    drawLaserBeamsAndSparks(ctx, leftEyePos, rightEyePos, rightBeamAngle, leftBeamAngle, dt);
  }

  // 7. Calibration Alignment Handles
  if (props.isCalibrating && leftEyePos && rightEyePos && mouthPos) {
    drawCalibrationHandles(ctx, leftEyePos, rightEyePos, mouthPos);
  }

  ctx.restore();

  // Outer Bezel Ring (only in Normal mode; in Laser Alert mode the paper edge itself burns away)
  if (!showOverlay) {
    ctx.beginPath();
    ctx.arc(400, 400, 380, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
    ctx.stroke();
  }
}

function drawCatEye(
  ctx: CanvasRenderingContext2D,
  {
    pos,
    gazeX,
    gazeY,
    blink,
    subj,
    showOverlay,
  }: {
    pos: EyeFeature;
    gazeX: number;
    gazeY: number;
    blink: number;
    subj: CatSubject;
    showOverlay: boolean;
  }
) {
  const { x, y, rx, ry, angle } = pos;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle || 0);

  ctx.save();
  const socketFeather = ctx.createRadialGradient(0, 0, rx * 0.85, 0, 0, rx * 1.12);
  socketFeather.addColorStop(0, 'rgba(20, 15, 12, 0.32)');
  socketFeather.addColorStop(0.6, 'rgba(30, 24, 20, 0.12)');
  socketFeather.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = socketFeather;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 1.12, ry * 1.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const defineEyeAperture = (openRatio = 1) => {
    const h = ry * Math.max(0.02, openRatio);
    ctx.beginPath();
    ctx.moveTo(-rx * 1.05, 0);
    ctx.bezierCurveTo(-rx * 0.55, -h * 1.18, rx * 0.52, -h * 1.15, rx * 1.05, 0);
    ctx.bezierCurveTo(rx * 0.52, h * 1.15, -rx * 0.55, h * 1.18, -rx * 1.05, 0);
    ctx.closePath();
  };

  // Bionic eyelid aperture ratio:
  // Even at rest (blink = 0), sleek metallic upper/lower bionic eyelid hoods frame the top & bottom of the socket;
  // during a blink (blink -> 1), the articulated chrome shutters slide smoothly together to seal the eye.
  const openRatio = Math.max(0.015, (1 - blink * 0.985) * 0.84);

  // 1. Render the full eyeball clipped to the outer orbital socket
  ctx.save();
  defineEyeAperture(1.04);
  ctx.clip();

  const globeGrad = ctx.createRadialGradient(gazeX * 0.4, gazeY * 0.4, rx * 0.1, 0, 0, rx * 1.15);
  if (showOverlay) {
    globeGrad.addColorStop(0, '#ffea75');
    globeGrad.addColorStop(0.48, '#e85d12');
    globeGrad.addColorStop(0.85, '#6e1405');
    globeGrad.addColorStop(1, '#1a0300');
  } else {
    globeGrad.addColorStop(0, subj.irisInner || '#d4e868');
    globeGrad.addColorStop(0.55, subj.irisColor || '#7ca82b');
    globeGrad.addColorStop(0.88, subj.irisOuter || '#2d4212');
    globeGrad.addColorStop(1, '#0b0e06');
  }
  ctx.fillStyle = globeGrad;
  ctx.fillRect(-rx * 1.2, -ry * 1.2, rx * 2.4, ry * 2.4);

  const gx = gazeX * 1.15;
  const gy = gazeY * 0.95;

  ctx.save();
  ctx.translate(gx, gy);

  const fiberCount = 44;
  for (let i = 0; i < fiberCount; i++) {
    const a = (i / fiberCount) * Math.PI * 2;
    const len = rx * (0.78 + (i % 3) * 0.12);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (rx * 0.14), Math.sin(a) * (ry * 0.22));
    ctx.lineTo(Math.cos(a + 0.04) * len, Math.sin(a + 0.04) * len);
    if (showOverlay) {
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(255, 210, 90, 0.34)' : 'rgba(95, 12, 0, 0.36)';
    } else {
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(235, 255, 140, 0.22)' : 'rgba(25, 42, 10, 0.28)';
    }
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }

  const collarette = ctx.createRadialGradient(0, 0, rx * 0.08, 0, 0, rx * 0.56);
  collarette.addColorStop(0, showOverlay ? 'rgba(255, 160, 40, 0.72)' : 'rgba(240, 255, 130, 0.38)');
  collarette.addColorStop(0.55, showOverlay ? 'rgba(255, 45, 0, 0.32)' : 'rgba(0, 0, 0, 0)');
  collarette.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = collarette;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.45, ry * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.rotate(-(angle || 0));

  const slitW = showOverlay ? rx * 0.19 : rx * 0.16;
  const slitH = ry * 0.88;

  if (showOverlay) {
    ctx.shadowColor = '#ff3300';
    ctx.shadowBlur = 14;
  }

  ctx.beginPath();
  ctx.moveTo(0, -slitH);
  ctx.quadraticCurveTo(slitW, 0, 0, slitH);
  ctx.quadraticCurveTo(-slitW, 0, 0, -slitH);
  ctx.closePath();
  ctx.fillStyle = showOverlay ? '#2a0400' : '#050507';
  ctx.fill();

  if (showOverlay) {
    ctx.beginPath();
    ctx.moveTo(0, -slitH * 0.75);
    ctx.quadraticCurveTo(slitW * 0.55, 0, 0, slitH * 0.75);
    ctx.quadraticCurveTo(-slitW * 0.55, 0, 0, -slitH * 0.75);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 190, 90, 0.85)';
    ctx.fill();
  }

  ctx.restore();
  ctx.restore();

  // Cast shadow from the overhanging bionic upper eyelid onto the eyeball
  const hUpperShadow = ry * openRatio * 1.16;
  const lidShadow = ctx.createLinearGradient(0, -hUpperShadow, 0, -hUpperShadow + ry * 0.55);
  lidShadow.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
  lidShadow.addColorStop(0.5, 'rgba(0, 0, 0, 0.18)');
  lidShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = lidShadow;
  ctx.fillRect(-rx * 1.1, -ry * 1.1, rx * 2.2, ry * 2.2);

  // Corneal catchlights (clipped to open aperture so the bionic lid covers them when blinking)
  ctx.save();
  defineEyeAperture(openRatio);
  ctx.clip();

  ctx.save();
  ctx.translate(gx * 0.35 - rx * 0.24, gy * 0.35 - ry * 0.26);
  ctx.rotate(-0.35);
  const catchGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, rx * 0.28);
  catchGrad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
  catchGrad.addColorStop(0.6, 'rgba(240, 248, 255, 0.35)');
  catchGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = catchGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.24, ry * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.beginPath();
  ctx.arc(gx * 0.25 + rx * 0.28, gy * 0.25 + ry * 0.24, rx * 0.065, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Shiny Bionic Metal Eyelids (Upper & Lower Articulated Chrome Shutters)
  const hUpper = ry * openRatio * 1.18;
  const hLower = ry * openRatio * 1.15;

  const traceUpperLidShell = () => {
    ctx.beginPath();
    ctx.moveTo(-rx * 1.15, 0);
    ctx.lineTo(-rx * 1.15, -ry * 1.35);
    ctx.lineTo(rx * 1.15, -ry * 1.35);
    ctx.lineTo(rx * 1.15, 0);
    ctx.bezierCurveTo(rx * 0.52, -hUpper, -rx * 0.55, -hUpper, -rx * 1.15, 0);
    ctx.closePath();
  };

  const traceLowerLidShell = () => {
    ctx.beginPath();
    ctx.moveTo(-rx * 1.15, 0);
    ctx.lineTo(-rx * 1.15, ry * 1.35);
    ctx.lineTo(rx * 1.15, ry * 1.35);
    ctx.lineTo(rx * 1.15, 0);
    ctx.bezierCurveTo(rx * 0.52, hLower, -rx * 0.55, hLower, -rx * 1.15, 0);
    ctx.closePath();
  };

  // Multi-stop liquid-chrome & brushed-titanium gradient
  const chromeGrad = ctx.createLinearGradient(-rx * 0.85, -ry * 1.18, rx * 0.75, ry * 1.18);
  chromeGrad.addColorStop(0.0, '#141a22');
  chromeGrad.addColorStop(0.15, '#5b6b7c');
  chromeGrad.addColorStop(0.3, '#dde9f6');
  chromeGrad.addColorStop(0.4, '#ffffff');
  chromeGrad.addColorStop(0.52, '#7d8fa1');
  chromeGrad.addColorStop(0.66, '#242e38');
  chromeGrad.addColorStop(0.82, '#cad8e6');
  chromeGrad.addColorStop(1.0, '#384554');

  // Render Upper Bionic Eyelid Dome
  ctx.save();
  traceUpperLidShell();
  ctx.fillStyle = chromeGrad;
  ctx.fill();
  ctx.clip();

  // Convex 3D chrome specular hotspot on upper lid
  const specY = -hUpper * 0.45 - ry * 0.32;
  const upperSpec = ctx.createRadialGradient(
    -rx * 0.22,
    specY,
    rx * 0.04,
    -rx * 0.15,
    specY,
    rx * 0.78
  );
  upperSpec.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
  upperSpec.addColorStop(
    0.35,
    showOverlay ? 'rgba(255, 185, 120, 0.55)' : 'rgba(215, 238, 255, 0.58)'
  );
  upperSpec.addColorStop(0.7, 'rgba(120, 145, 170, 0.15)');
  upperSpec.addColorStop(1, 'rgba(15, 22, 30, 0.45)');
  ctx.fillStyle = upperSpec;
  ctx.fillRect(-rx * 1.2, -ry * 1.3, rx * 2.4, ry * 1.5);

  // Articulated telescopic titanium shutter seams on upper lid
  for (const frac of [0.34, 0.62, 0.84]) {
    const seamH = hUpper + (ry * 1.18 - hUpper) * frac;
    ctx.beginPath();
    ctx.moveTo(-rx * 1.06, 0);
    ctx.bezierCurveTo(-rx * 0.55, -seamH, rx * 0.52, -seamH, rx * 1.06, 0);
    ctx.strokeStyle = 'rgba(12, 18, 26, 0.78)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-rx * 1.06, 1.2);
    ctx.bezierCurveTo(-rx * 0.55, -seamH + 1.5, rx * 0.52, -seamH + 1.5, rx * 1.06, 1.2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.lineWidth = 1.0;
    ctx.stroke();
  }

  // Bionic actuator segmentation lines & micro-rivets on upper lid
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * rx * 0.52, -ry * 1.2);
    ctx.lineTo(side * rx * 0.38, -hUpper * 0.65);
    ctx.strokeStyle = 'rgba(15, 22, 30, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  for (const rxFrac of [-0.68, -0.35, 0, 0.35, 0.68]) {
    const rvx = rx * rxFrac;
    const archFactor = 1 - rxFrac * rxFrac * 0.75;
    const rvy = -(hUpper + (ry * 1.12 - hUpper) * 0.48) * archFactor;
    ctx.beginPath();
    ctx.arc(rvx, rvy, 1.7, 0, Math.PI * 2);
    ctx.fillStyle = '#18222c';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(rvx - 0.4, rvy - 0.4, 1.0, 0, Math.PI * 2);
    ctx.fillStyle = '#f0f7ff';
    ctx.fill();
  }
  ctx.restore();

  // Render Lower Bionic Eyelid Plate
  ctx.save();
  traceLowerLidShell();
  ctx.fillStyle = chromeGrad;
  ctx.fill();
  ctx.clip();

  const lowerSpecY = hLower * 0.45 + ry * 0.28;
  const lowerSpec = ctx.createRadialGradient(
    rx * 0.18,
    lowerSpecY,
    rx * 0.04,
    rx * 0.12,
    lowerSpecY,
    rx * 0.75
  );
  lowerSpec.addColorStop(0, 'rgba(255, 255, 255, 0.88)');
  lowerSpec.addColorStop(0.4, 'rgba(200, 225, 248, 0.45)');
  lowerSpec.addColorStop(1, 'rgba(18, 25, 34, 0.5)');
  ctx.fillStyle = lowerSpec;
  ctx.fillRect(-rx * 1.2, 0, rx * 2.4, ry * 1.35);

  for (const frac of [0.42, 0.76]) {
    const seamH = hLower + (ry * 1.15 - hLower) * frac;
    ctx.beginPath();
    ctx.moveTo(-rx * 1.06, 0);
    ctx.bezierCurveTo(-rx * 0.55, seamH, rx * 0.52, seamH, rx * 1.06, 0);
    ctx.strokeStyle = 'rgba(12, 18, 26, 0.72)';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-rx * 1.06, -1.1);
    ctx.bezierCurveTo(-rx * 0.55, seamH - 1.4, rx * 0.52, seamH - 1.4, rx * 1.06, -1.1);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
  ctx.restore();

  // 3. Precision-Machined Chrome Eyelid Margin Rim (Inner moving edge)
  ctx.beginPath();
  ctx.moveTo(-rx * 1.05, 0);
  ctx.bezierCurveTo(-rx * 0.55, -hUpper, rx * 0.52, -hUpper, rx * 1.05, 0);
  ctx.bezierCurveTo(rx * 0.52, hLower, -rx * 0.55, hLower, -rx * 1.05, 0);
  ctx.closePath();
  ctx.strokeStyle = '#0e141b';
  ctx.lineWidth = 3.8;
  ctx.stroke();

  const rimBevelGrad = ctx.createLinearGradient(-rx, -ry * 0.8, rx, ry * 0.8);
  rimBevelGrad.addColorStop(0, '#566678');
  rimBevelGrad.addColorStop(0.28, '#ffffff');
  rimBevelGrad.addColorStop(0.55, '#92a5b8');
  rimBevelGrad.addColorStop(0.8, '#f0f7ff');
  rimBevelGrad.addColorStop(1, '#435160');
  ctx.strokeStyle = rimBevelGrad;
  ctx.lineWidth = 2.1;
  ctx.stroke();

  ctx.restore();

  // 4. Outer Orbital Bionic Housing Bezel Ring
  defineEyeAperture(1.04);
  ctx.strokeStyle = '#11161d';
  ctx.lineWidth = 3.6;
  ctx.stroke();

  const outerBezelGrad = ctx.createLinearGradient(-rx, -ry, rx, ry);
  outerBezelGrad.addColorStop(0, '#78899b');
  outerBezelGrad.addColorStop(0.35, '#f5faff');
  outerBezelGrad.addColorStop(0.65, '#3b4754');
  outerBezelGrad.addColorStop(1, '#c5d4e3');
  ctx.strokeStyle = outerBezelGrad;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.restore();
}

interface PaperBurnPoint {
  x: number;
  y: number;
  r: number;
  a: number;
  heat: number;
  depth: number;
}

/**
 * Returns the current unburned outer radius (in 800x800 canvas space) at any angle `a`,
 * accounting for how far the paper edge has charred inward.
 */
function getPaperEdgeRadiusAtAngle(a: number): number {
  const norm = (((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
  const idx = Math.floor(norm * PAPER_SEGMENTS) % PAPER_SEGMENTS;
  return Math.max(330, 378 - state.burnDepth[idx]);
}

/**
 * Advances the slow laser-ignited paper-burning physics and returns the 180-point
 * scalloped paper contour used both as the portrait clip mask and for char/ember rendering.
 */
function stepAndBuildPaperBurnContour(
  rightBeamAngle: number,
  leftBeamAngle: number,
  dt: number
): PaperBurnPoint[] {
  const angleDiff = (a: number, b: number) => {
    const d = Math.abs(a - b) % (Math.PI * 2);
    return d > Math.PI ? Math.PI * 2 - d : d;
  };

  if (!state.burnInitialized) {
    state.burnInitialized = true;
    for (let i = 0; i < PAPER_SEGMENTS; i++) {
      const a = (i / PAPER_SEGMENTS) * Math.PI * 2;
      const dMin = Math.min(angleDiff(a, rightBeamAngle), angleDiff(a, leftBeamAngle));
      const trail = Math.max(0, 1 - dMin / 1.05);
      const baseSinge = 5.0 * paperGrain[i];
      state.burnDepth[i] = baseSinge + Math.pow(trail, 1.35) * 24 * paperGrain[i];
      state.emberHeat[i] = Math.max(0.32, Math.pow(trail, 1.1) * 1.0);
    }
  }

  const safeDt = Math.min(0.05, Math.max(0.004, dt));
  for (let i = 0; i < PAPER_SEGMENTS; i++) {
    const a = (i / PAPER_SEGMENTS) * Math.PI * 2;
    const dRight = angleDiff(a, rightBeamAngle);
    const dLeft = angleDiff(a, leftBeamAngle);
    const dLaser = Math.min(dRight, dLeft);

    if (dLaser < 0.26) {
      const intensity = 1 - dLaser / 0.26;
      state.emberHeat[i] = Math.min(1.0, state.emberHeat[i] + safeDt * 6.5 * intensity);
      state.burnDepth[i] = Math.min(
        46 * paperGrain[i],
        state.burnDepth[i] + safeDt * 18.0 * intensity * paperGrain[i]
      );
    }

    const prev = (i - 1 + PAPER_SEGMENTS) % PAPER_SEGMENTS;
    const next = (i + 1) % PAPER_SEGMENTS;
    const neighborHeat = Math.max(state.emberHeat[prev], state.emberHeat[next]);
    if (neighborHeat > 0.3) {
      state.emberHeat[i] = Math.min(
        0.9,
        state.emberHeat[i] + safeDt * 1.15 * (neighborHeat - 0.22)
      );
    }

    if (state.emberHeat[i] > 0.1) {
      state.burnDepth[i] = Math.min(
        46 * paperGrain[i],
        state.burnDepth[i] + safeDt * 3.6 * state.emberHeat[i] * paperGrain[i]
      );
    }

    state.emberHeat[i] = Math.max(0.22, state.emberHeat[i] - safeDt * 0.14);
  }

  const pts: PaperBurnPoint[] = [];
  for (let i = 0; i < PAPER_SEGMENTS; i++) {
    const a = (i / PAPER_SEGMENTS) * Math.PI * 2;
    const microJagged =
      Math.sin(a * 43 + i * 1.7) * 1.4 + Math.cos(a * 71 - i * 0.9) * 0.9;
    const r = Math.max(330, 379 - state.burnDepth[i] + microJagged);
    pts.push({
      x: 400 + Math.cos(a) * r,
      y: 400 + Math.sin(a) * r,
      r,
      a,
      heat: state.emberHeat[i],
      depth: state.burnDepth[i],
    });
  }
  return pts;
}

/**
 * Renders the toasted sepia halo, curled blackened carbon char band, and glowing
 * smoldering ember front along the burned paper edge `pts`.
 */
function drawEdgeFire(ctx: CanvasRenderingContext2D, pts: PaperBurnPoint[], dt: number) {
  const t = performance.now() * 0.001;
  ctx.save();

  // 1. Warm toasted-paper brownish-sepia heat halo bleeding slightly into the green background
  ctx.save();
  ctx.beginPath();
  ctx.arc(400, 400, 386, 0, Math.PI * 2, false);
  for (let i = PAPER_SEGMENTS - 1; i >= 0; i--) {
    const p = pts[i];
    const innerToastR = p.r - 15 - p.heat * 8;
    const tx = 400 + Math.cos(p.a) * innerToastR;
    const ty = 400 + Math.sin(p.a) * innerToastR;
    if (i === PAPER_SEGMENTS - 1) ctx.moveTo(tx, ty);
    else ctx.lineTo(tx, ty);
  }
  ctx.closePath();
  const toastGrad = ctx.createRadialGradient(400, 400, 315, 400, 400, 380);
  toastGrad.addColorStop(0, 'rgba(70, 30, 5, 0)');
  toastGrad.addColorStop(0.55, 'rgba(75, 32, 6, 0.55)');
  toastGrad.addColorStop(1, 'rgba(25, 10, 2, 0.95)');
  ctx.fillStyle = toastGrad;
  ctx.fill('evenodd');
  ctx.restore();

  // 2. Crisp Blackened Carbonized Paper Char Band (curled burnt paper edge)
  ctx.save();
  ctx.beginPath();
  ctx.arc(400, 400, 386, 0, Math.PI * 2, false);
  for (let i = PAPER_SEGMENTS - 1; i >= 0; i--) {
    const p = pts[i];
    const charR = p.r - 7.0;
    const cx = 400 + Math.cos(p.a) * charR;
    const cy = 400 + Math.sin(p.a) * charR;
    if (i === PAPER_SEGMENTS - 1) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  }
  ctx.closePath();
  ctx.fillStyle = '#120905';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 6;
  ctx.fill('evenodd');
  ctx.restore();

  // 3. Glowing Smoldering Ember Line & Delicate Slow Paper-Fire Licks right along `pts`
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < PAPER_SEGMENTS; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % PAPER_SEGMENTS];
    const shimmer = 0.78 + 0.22 * Math.sin(t * 9 + i * 1.9);
    const heat = Math.min(1, p1.heat * shimmer);

    if (heat > 0.08) {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = `rgba(255, ${Math.round(55 + heat * 135)}, ${Math.round(heat * 45)}, ${0.55 + heat * 0.45})`;
      ctx.lineWidth = 2.8 + heat * 3.6;
      ctx.shadowColor = '#ff3b00';
      ctx.shadowBlur = 10 + heat * 12;
      ctx.stroke();

      if (heat > 0.32) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = `rgba(255, 240, 170, ${(heat - 0.28) * 1.3})`;
        ctx.lineWidth = 1.4 + heat * 1.6;
        ctx.stroke();
      }

      if (heat > 0.48 && i % 2 === 0) {
        const flicker = Math.max(0, Math.sin(t * 11 + i * 2.7) * 0.6 + 0.4);
        const lickLen = (5 + heat * 11) * flicker;
        const tipR = p1.r - lickLen;
        const tipX = 400 + Math.cos(p1.a) * tipR;
        const tipY = 400 + Math.sin(p1.a) * tipR - 3.5 * heat;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.quadraticCurveTo((p1.x + p2.x) * 0.5, (p1.y + p2.y) * 0.5 - 2, tipX, tipY);
        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        ctx.fillStyle = `rgba(255, ${Math.round(130 + heat * 90)}, 30, ${0.48 * heat})`;
        ctx.fill();
      }
    }
  }
  ctx.restore();

  // 4. Fine rising smoke wisps and tiny glowing paper-ash specks from the active burn front
  if (dt > 0 && state.sparks.length < 110 && Math.random() < 0.65) {
    const hotIdx = Math.floor(Math.random() * PAPER_SEGMENTS);
    const p = pts[hotIdx];
    if (p.heat > 0.35) {
      const isSmoke = Math.random() < 0.55;
      state.sparks.push({
        x: p.x + (Math.random() - 0.5) * 3,
        y: p.y + (Math.random() - 0.5) * 3,
        vx: (Math.random() - 0.5) * 14,
        vy: -18 - Math.random() * 28,
        life: 0.45 + Math.random() * 0.5,
        maxLife: 0.95,
        size: isSmoke ? 2.2 + Math.random() * 2.0 : 1.1 + Math.random() * 1.4,
        isSmoke,
      });
    }
  }

  ctx.restore();
}

function drawCalibrationHandles(
  ctx: CanvasRenderingContext2D,
  leftEyePos: EyeFeature,
  rightEyePos: EyeFeature,
  mouthPos: MouthFeature
) {
  ctx.save();
  const features = [
    { pos: leftEyePos, label: 'Left Eye' },
    { pos: rightEyePos, label: 'Right Eye' },
    { pos: mouthPos, label: 'Mouth / Jaw Hinge' },
  ];

  features.forEach(({ pos, label }) => {
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y, pos.rx, pos.ry, (pos as EyeFeature).angle || 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '500 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fef3c7';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 4;
    ctx.fillText(label, pos.x, pos.y - pos.ry - 10);
  });

  ctx.restore();
}

/**
 * Terry Gilliam / Monty Python Cutout Jaw Engine synchronized to speech syllables.
 */
function drawCatNoseAndMouth(
  ctx: CanvasRenderingContext2D,
  mouthPos: MouthFeature,
  breath: number,
  subj: CatSubject
) {
  const { x, y, rx, ry } = mouthPos;
  const purrFactor = (breath + 1) * 0.5;
  const scream = state.screamOpen;

  ctx.save();

  // 1. Nostril alignment marks: a guide for lining up the mouth, so only shown while calibrating
  const nostrilY = y - ry * 0.36;
  for (const side of props.isCalibrating ? [-1, 1] : []) {
    ctx.save();
    ctx.translate(x + side * rx * 0.16, nostrilY);
    ctx.rotate(side * 0.45);
    ctx.beginPath();
    ctx.ellipse(
      0,
      0,
      rx * (0.08 + purrFactor * 0.025),
      ry * (0.14 + purrFactor * 0.04),
      0,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = `rgba(18, 8, 10, ${0.32 + purrFactor * 0.22})`;
    ctx.fill();
    ctx.restore();
  }

  // 2. Monty Python Cutout Hinged Jaw & Exaggerated Teeth + Cat Tongue
  if (scream > 0.02) {
    const smoothTime = performance.now() * 0.006;
    // The angry stepped jitter is for the silent laser scream only: while KITTY speaks, the jaw
    // must follow her voice, and a 75ms wobble unrelated to it reads as lip-sync drift.
    const modulator =
      props.laserAlertMode && !speechEngine.isSpeaking
        ? Math.sin(Math.floor(performance.now() / 75) * 1.9) * 0.12
        : Math.sin(smoothTime) * 0.03;
    const openAmt = Math.max(0.04, Math.min(1.25, scream * (0.96 + modulator)));

    const seamY = y + ry * 0.16;
    const cutW = rx * 1.52;
    const cutH = ry * 3.6;
    const dropPx = openAmt * ry * 2.15;
    const hingeTilt = (Math.sin(smoothTime * 0.7) * 0.025 + 0.015) * openAmt;

    const traceUpperLipCurve = (ox: number, oy: number) => {
      ctx.moveTo(ox - cutW * 0.92, oy + ry * 0.32);
      ctx.bezierCurveTo(
        ox - cutW * 0.62,
        oy + ry * 0.38,
        ox - cutW * 0.22,
        oy - ry * 0.24,
        ox,
        oy - ry * 0.36
      );
      ctx.bezierCurveTo(
        ox + cutW * 0.22,
        oy - ry * 0.24,
        ox + cutW * 0.62,
        oy + ry * 0.38,
        ox + cutW * 0.92,
        oy + ry * 0.32
      );
    };

    const getLipCurveY = (dx: number, baseSeamY: number) => {
      const norm = Math.min(1, Math.abs(dx) / (cutW * 0.92));
      const arch = Math.pow(norm, 1.35);
      return baseSeamY - ry * 0.36 + arch * (ry * 0.68);
    };

    const defineJawCutoutPath = (ox: number, oy: number) => {
      ctx.beginPath();
      traceUpperLipCurve(ox, oy);
      ctx.lineTo(ox + cutW * 1.02, oy + cutH * 0.5);
      ctx.lineTo(ox + cutW * 0.68, oy + cutH * 0.92);
      ctx.lineTo(ox, oy + cutH * 1.04);
      ctx.lineTo(ox - cutW * 0.68, oy + cutH * 0.92);
      ctx.lineTo(ox - cutW * 1.02, oy + cutH * 0.5);
      ctx.closePath();
    };

    // A. Dark Mouth Cavity Void
    ctx.save();
    ctx.beginPath();
    traceUpperLipCurve(x, seamY);
    ctx.lineTo(x + cutW * 0.86, seamY + dropPx + ry * 0.9);
    ctx.lineTo(x, seamY + dropPx + ry * 1.25);
    ctx.lineTo(x - cutW * 0.86, seamY + dropPx + ry * 0.9);
    ctx.closePath();

    const voidGrad = ctx.createLinearGradient(x, seamY - ry * 0.36, x, seamY + dropPx + ry);
    voidGrad.addColorStop(0, '#140507');
    voidGrad.addColorStop(0.55, '#2b090e');
    voidGrad.addColorStop(1, '#120305');
    ctx.fillStyle = voidGrad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    ctx.clip();

    // B. Upper Cutout Teeth & Fangs
    const upperToothCount = 6;
    const toothSpan = cutW * 0.84;
    const toothW = toothSpan / upperToothCount;
    for (let i = 0; i < upperToothCount; i++) {
      const tx = x - toothSpan * 0.5 + i * toothW;
      const toothCenterDx = tx + toothW * 0.5 - x;
      const lipY = getLipCurveY(toothCenterDx, seamY);
      const jitterH = (i % 2 === 0 ? 1.08 : 0.94) * ry * 0.6 * Math.min(1, openAmt * 1.3);
      ctx.fillStyle = i % 2 === 0 ? '#fcf8ec' : '#f2ebd9';
      ctx.strokeStyle = '#2b2118';
      ctx.lineWidth = 1.6;

      ctx.beginPath();
      ctx.moveTo(tx + 1, lipY - 3);
      ctx.lineTo(tx + toothW - 1, lipY - 3);
      ctx.lineTo(tx + toothW * 0.82, lipY + jitterH);
      ctx.lineTo(tx + toothW * 0.18, lipY + jitterH);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const drawCutoutFang = (fx: number, fy: number, fw: number, fh: number, dirY: number) => {
      ctx.fillStyle = '#fffdf4';
      ctx.strokeStyle = '#241a12';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(fx - fw * 0.5, fy);
      ctx.lineTo(fx + fw * 0.5, fy);
      ctx.lineTo(fx + (fx < x ? fw * 0.18 : -fw * 0.18), fy + fh * dirY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(fx - fw * 0.3, fy + fh * 0.22 * dirY);
      ctx.lineTo(fx + fw * 0.3, fy + fh * 0.22 * dirY);
      ctx.strokeStyle = 'rgba(60, 45, 30, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    };

    const fangH = ry * 1.28 * Math.min(1.1, openAmt * 1.25);
    const fangW = rx * 0.3;
    const fangDx = cutW * 0.56;
    const upperFangLipY = getLipCurveY(fangDx, seamY);
    drawCutoutFang(x - fangDx, upperFangLipY - 3, fangW, fangH, 1);
    drawCutoutFang(x + fangDx, upperFangLipY - 3, fangW, fangH, 1);

    // C. Waggling Monty Python Paper-Cutout Cat Tongue
    const tongueWaggleX = Math.sin(smoothTime * 1.4) * rx * 0.14 * openAmt;
    const tongueBobY = Math.cos(smoothTime * 1.8) * ry * 0.12 * openAmt;
    const tongueBaseY = seamY + dropPx * 0.72;
    const tongueTipX = x + tongueWaggleX;
    const tongueTipY = seamY + dropPx * 0.38 + ry * 0.65 + tongueBobY;

    ctx.save();
    ctx.fillStyle = '#ee5d76';
    ctx.strokeStyle = '#260b10';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x - rx * 0.48, tongueBaseY + ry * 0.5);
    ctx.bezierCurveTo(
      x - rx * 0.62,
      tongueBaseY - ry * 0.3,
      tongueTipX - rx * 0.55,
      tongueTipY,
      tongueTipX,
      tongueTipY
    );
    ctx.bezierCurveTo(
      tongueTipX + rx * 0.55,
      tongueTipY,
      x + rx * 0.62,
      tongueBaseY - ry * 0.3,
      x + rx * 0.48,
      tongueBaseY + ry * 0.5
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, tongueBaseY + ry * 0.25);
    ctx.quadraticCurveTo(
      x + tongueWaggleX * 0.5,
      (tongueBaseY + tongueTipY) * 0.5,
      tongueTipX,
      tongueTipY - ry * 0.12
    );
    ctx.strokeStyle = '#7a192b';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    ctx.fillStyle = '#ffb3c1';
    for (let p = -2; p <= 2; p++) {
      const px = tongueTipX + p * rx * 0.12;
      const py = tongueTipY - Math.abs(p) * 3 - ry * 0.22;
      ctx.beginPath();
      ctx.moveTo(px - 2.5, py);
      ctx.lineTo(px, py - 5);
      ctx.lineTo(px + 2.5, py);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.restore(); // End mouth cavity clip

    // D. Hinged Lower Jaw Cutout
    ctx.save();
    const pivotX = x - cutW * 0.85;
    const pivotY = seamY + ry * 0.32;
    ctx.translate(pivotX, pivotY + dropPx);
    ctx.rotate(hingeTilt);
    ctx.translate(-pivotX, -pivotY);

    for (let i = 0; i < upperToothCount; i++) {
      const tx = x - toothSpan * 0.46 + i * (toothW * 0.92);
      const toothCenterDx = tx + toothW * 0.45 - x;
      const lipY = getLipCurveY(toothCenterDx, seamY);
      const jitterH = (i % 2 === 1 ? 0.95 : 0.82) * ry * 0.48 * Math.min(1, openAmt * 1.25);
      ctx.fillStyle = i % 2 === 0 ? '#f4eedc' : '#fcf8ec';
      ctx.strokeStyle = '#2b2118';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(tx + 1, lipY + 4);
      ctx.lineTo(tx + toothW * 0.88 - 1, lipY + 4);
      ctx.lineTo(tx + toothW * 0.72, lipY - jitterH);
      ctx.lineTo(tx + toothW * 0.16, lipY - jitterH);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const lowerFangDx = cutW * 0.48;
    const lowerFangLipY = getLipCurveY(lowerFangDx, seamY);
    drawCutoutFang(x - lowerFangDx, lowerFangLipY + 4, fangW * 0.85, fangH * 0.78, -1);
    drawCutoutFang(x + lowerFangDx, lowerFangLipY + 4, fangW * 0.85, fangH * 0.78, -1);

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.68)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 7;
    defineJawCutoutPath(x, seamY);
    ctx.fillStyle = subj.skinShadow || '#3b3026';
    ctx.fill();
    ctx.restore();

    ctx.save();
    defineJawCutoutPath(x, seamY);
    ctx.clip();

    if (state.lastFrameMap && offCanvas) {
      const { scaleBreath } = state.lastFrameMap;
      const drawSize = 800 * scaleBreath;
      const offsetX = state.lastFrameMap.mapX(0);
      const offsetY = state.lastFrameMap.mapY(0);
      ctx.drawImage(offCanvas, offsetX, offsetY, drawSize, drawSize);
    }
    ctx.restore();

    defineJawCutoutPath(x, seamY);
    ctx.strokeStyle = 'rgba(245, 238, 220, 0.38)';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    ctx.beginPath();
    traceUpperLipCurve(x, seamY);
    ctx.strokeStyle = '#1a120e';
    ctx.lineWidth = 2.6;
    ctx.stroke();

    ctx.restore();

    ctx.beginPath();
    traceUpperLipCurve(x, seamY);
    ctx.strokeStyle = '#1a120e';
    ctx.lineWidth = 2.8;
    ctx.stroke();
  }

  ctx.restore();
}

function drawLaserBeamsAndSparks(
  ctx: CanvasRenderingContext2D,
  leftEyePos: EyeFeature,
  rightEyePos: EyeFeature,
  rightBeamAngle: number,
  leftBeamAngle: number,
  dt: number
) {
  const beamPower = Math.max(0.45, 1 - state.blinkState * 0.65);

  const getPupilOrigin = (eyePos: EyeFeature, gaze: { x: number; y: number }) => {
    const cosA = Math.cos(eyePos.angle || 0);
    const sinA = Math.sin(eyePos.angle || 0);
    const lx = gaze.x * 1.15;
    const ly = gaze.y * 0.95;
    return {
      x: eyePos.x + (lx * cosA - ly * sinA),
      y: eyePos.y + (lx * sinA + ly * cosA),
    };
  };

  const leftOrigin = getPupilOrigin(leftEyePos, state.leftEye);
  const rightOrigin = getPupilOrigin(rightEyePos, state.rightEye);

  const leftEdgeR = getPaperEdgeRadiusAtAngle(leftBeamAngle);
  const rightEdgeR = getPaperEdgeRadiusAtAngle(rightBeamAngle);
  const leftTarget = {
    x: 400 + Math.cos(leftBeamAngle) * leftEdgeR,
    y: 400 + Math.sin(leftBeamAngle) * leftEdgeR,
  };
  const rightTarget = {
    x: 400 + Math.cos(rightBeamAngle) * rightEdgeR,
    y: 400 + Math.sin(rightBeamAngle) * rightEdgeR,
  };

  if (beamPower > 0.25) {
    state.scorchMarks.push(
      {
        x: leftTarget.x + (Math.random() - 0.5) * 4,
        y: leftTarget.y + (Math.random() - 0.5) * 4,
        life: 1.0,
        r: 5 + Math.random() * 4,
      },
      {
        x: rightTarget.x + (Math.random() - 0.5) * 4,
        y: rightTarget.y + (Math.random() - 0.5) * 4,
        life: 1.0,
        r: 7 + Math.random() * 5,
      }
    );
    if (state.scorchMarks.length > 90) {
      state.scorchMarks.splice(0, state.scorchMarks.length - 90);
    }

    const spawnImpactParticles = (target: { x: number; y: number }, isHeavy: boolean) => {
      const count = isHeavy ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const spreadAngle = Math.atan2(400 - target.y, 400 - target.x) + (Math.random() - 0.5) * 2.2;
        const speed = 35 + Math.random() * 110;
        state.sparks.push({
          x: target.x + (Math.random() - 0.5) * 6,
          y: target.y + (Math.random() - 0.5) * 6,
          vx: Math.cos(spreadAngle) * speed,
          vy: Math.sin(spreadAngle) * speed - 20,
          life: 0.4 + Math.random() * 0.45,
          maxLife: 0.85,
          size: 1.4 + Math.random() * 2.4,
          isSmoke: Math.random() < 0.28,
        });
      }
    };
    spawnImpactParticles(leftTarget, false);
    spawnImpactParticles(rightTarget, true);
  }

  ctx.save();

  for (let i = state.scorchMarks.length - 1; i >= 0; i--) {
    const m = state.scorchMarks[i];
    m.life -= dt * 0.9;
    if (m.life <= 0) {
      state.scorchMarks.splice(i, 1);
      continue;
    }
    const grad = ctx.createRadialGradient(m.x, m.y, 0.5, m.x, m.y, m.r);
    grad.addColorStop(0, `rgba(255, 160, 40, ${m.life * 0.65})`);
    grad.addColorStop(0.5, `rgba(200, 30, 0, ${m.life * 0.45})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const drawSingleLaser = (
    origin: { x: number; y: number },
    target: { x: number; y: number },
    widthScale: number
  ) => {
    if (beamPower <= 0.05) return;
    const flicker = 0.88 + Math.random() * 0.24;
    const alpha = beamPower * flicker;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(target.x, target.y);
    ctx.strokeStyle = `rgba(255, 25, 0, ${0.42 * alpha})`;
    ctx.lineWidth = 14 * widthScale * flicker;
    ctx.shadowColor = '#ff1100';
    ctx.shadowBlur = 24;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(target.x, target.y);
    ctx.strokeStyle = `rgba(255, 110, 20, ${0.85 * alpha})`;
    ctx.lineWidth = 5.5 * widthScale * flicker;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(target.x, target.y);
    ctx.strokeStyle = `rgba(255, 255, 240, ${0.98 * alpha})`;
    ctx.lineWidth = 2.0 * widthScale;
    ctx.stroke();

    const eyeFlare = ctx.createRadialGradient(origin.x, origin.y, 1, origin.x, origin.y, 22 * widthScale);
    eyeFlare.addColorStop(0, `rgba(255, 255, 255, ${0.95 * alpha})`);
    eyeFlare.addColorStop(0.35, `rgba(255, 90, 10, ${0.8 * alpha})`);
    eyeFlare.addColorStop(1, 'rgba(255, 0, 0, 0)');
    ctx.fillStyle = eyeFlare;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 22 * widthScale, 0, Math.PI * 2);
    ctx.fill();

    const impactR = (26 + Math.random() * 10) * widthScale;
    const impactFlare = ctx.createRadialGradient(target.x, target.y, 1, target.x, target.y, impactR);
    impactFlare.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    impactFlare.addColorStop(0.3, `rgba(255, 180, 40, ${0.95 * alpha})`);
    impactFlare.addColorStop(0.65, `rgba(255, 35, 0, ${0.65 * alpha})`);
    impactFlare.addColorStop(1, 'rgba(255, 0, 0, 0)');
    ctx.fillStyle = impactFlare;
    ctx.beginPath();
    ctx.arc(target.x, target.y, impactR, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  drawSingleLaser(leftOrigin, leftTarget, 0.88);
  drawSingleLaser(rightOrigin, rightTarget, 1.15);

  for (let i = state.sparks.length - 1; i >= 0; i--) {
    const p = state.sparks[i];
    p.life -= dt;
    if (p.life <= 0) {
      state.sparks.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.isSmoke) {
      p.vy -= 18 * dt;
      p.vx *= 0.96;
    } else {
      p.vy += 120 * dt;
    }

    const lifeRatio = Math.max(0, p.life / p.maxLife);
    ctx.save();
    if (p.isSmoke) {
      ctx.fillStyle = `rgba(40, 32, 30, ${lifeRatio * 0.35})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (2.4 - lifeRatio), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = lifeRatio > 0.5 ? '#ffffff' : '#ff6600';
      ctx.shadowColor = '#ff2200';
      ctx.shadowBlur = 8;
      ctx.lineWidth = p.size * lifeRatio;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Public API: Speak a consumed CNCF CloudEvent payload chunk-by-chunk.
 */
async function speakEvent(
  payload: KittyEventPayload,
  overrideTiming?: {
    minChunkMs?: number;
    msPerWord?: number;
    maxWordsPerChunk?: number;
    bubbleCloseDelayMs?: number;
    voicePersona?: VoicePersona;
  }
) {
  lastSpokenPayload = payload;
  currentSubject.value = payload.natsSubject;
  currentSeverity.value = payload.severity;

  const isCriticalOrError = payload.severity === 'critical' || payload.severity === 'error';
  const runId = ++alertLaserRunId;
  if (isCriticalOrError) {
    alertLaserActive = true;
    emit('update:laserAlertMode', true);
  } else if (alertLaserActive) {
    // This event interrupted an alert that was still speaking: clear the alert's lasers.
    alertLaserActive = false;
    emit('update:laserAlertMode', false);
  }

  await speechEngine.speakMessage(payload.message, {
    voiceMode: props.voiceMode,
    voicePersona: overrideTiming?.voicePersona ?? props.voicePersona,
    soundEnabled: props.soundEnabled,
    severity: payload.severity,
    maxWordsPerChunk: overrideTiming?.maxWordsPerChunk ?? props.maxWordsPerChunk,
    maxCharsPerChunk: props.maxCharsPerChunk,
    minChunkMs: overrideTiming?.minChunkMs ?? props.minChunkMs,
    msPerWord: overrideTiming?.msPerWord ?? props.msPerWord,
    bubbleCloseDelayMs: overrideTiming?.bubbleCloseDelayMs,
  });

  // A newer event took over while this one was speaking: it owns the laser state now.
  if (runId !== alertLaserRunId) return;
  if (isCriticalOrError) {
    alertLaserActive = false;
    emit('update:laserAlertMode', false);
  }
}

function triggerMeow(isMadScream = false) {
  speechEngine.playCatVocalization(props.soundEnabled, isMadScream, 1.0, props.voicePersona);
}

watch(
  () => props.eventPayload,
  (newPayload) => {
    if (newPayload) {
      speakEvent(newPayload);
    }
  }
);

onMounted(() => {
  isCoarsePointer.value = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  loadSubject(0);
  resizeCanvas();
  emitCalibrationConfig();
  speechEngine.prewarmMessages(CLOUDEVENT_PRESETS.map((p) => p.message));

  if (canvasRef.value?.parentElement && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvasRef.value.parentElement);
  } else {
    window.addEventListener('resize', resizeCanvas);
  }

  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  window.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('touchend', onPointerUp);
  window.addEventListener('touchcancel', onPointerUp);

  // Expose calibration & animation state on window for Playwright E2E inspection
  (window as unknown as Record<string, unknown>).__kittyDebug = {
    SUBJECTS,
    state,
    speechEngine,
    speakEvent,
  };

  rafId = requestAnimationFrame(render);
});

// Muting silences whatever is already playing (the bubble and jaw carry on silently).
// If a message is still waiting for the audio unlock, show it now, silently.
watch(
  () => props.soundEnabled,
  (on) => {
    speechEngine.setMuted(!on);
    if (!on && speechEngine.awaitingAudioUnlock && lastSpokenPayload) speakEvent(lastSpokenPayload);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  speechEngine.dispose();
  resizeObserver?.disconnect();
  window.removeEventListener('resize', resizeCanvas);
  window.removeEventListener('mousemove', onPointerMove);
  window.removeEventListener('mouseup', onPointerUp);
  window.removeEventListener('touchmove', onPointerMove);
  window.removeEventListener('touchend', onPointerUp);
  window.removeEventListener('touchcancel', onPointerUp);
});

defineExpose({
  speakEvent,
  triggerMeow,
  SUBJECTS,
  state,
});
</script>
