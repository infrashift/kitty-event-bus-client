import type { EventSeverity } from '../events/cloudevents';

export type VoiceMode = 'both' | 'meow' | 'tts';
export type VoicePersona = 'female' | 'nz-male';

export interface MessageChunk {
  index: number;
  totalChunks: number;
  words: string[];
  text: string;
  /** Character start offset of this chunk in the normalized full message */
  charStart: number;
  /** Character end offset (inclusive) of this chunk in the normalized full message */
  charEnd: number;
  /** Global word start index in the full message */
  globalWordStart: number;
  /** Minimum time (ms) this chunk must remain on screen based on word count */
  minReadDurationMs: number;
}

export interface SyllableKeyframe {
  chunkIndex: number;
  wordIndexInChunk: number;
  globalWordIndex: number;
  syllableText: string;
  vowel: 'a' | 'e' | 'i' | 'o' | 'u';
  f1: number;
  f2: number;
  pitchHz: number;
  mouthOpen: number;
  startOffsetMs: number;
  durationMs: number;
}

export interface SpeechChunkState {
  isSpeaking: boolean;
  chunks: MessageChunk[];
  activeChunkIndex: number;
  activeChunk: MessageChunk | null;
  activeWordIndex: number;
  mouthOpen: number;
  selectedVoiceName: string;
}

/**
 * Formant filter tables for each voice persona (`female`, `nz-male`):
 * Maps English vowel classes to F1/F2 bandpass center frequencies and jaw openness.
 */
const PERSONA_VOWEL_FORMANTS: Record<
  VoicePersona,
  Record<'a' | 'e' | 'i' | 'o' | 'u', { f1: number; f2: number; open: number }>
> = {
  female: {
    a: { f1: 1280, f2: 2120, open: 0.92 }, // Warm open "aa"
    e: { f1: 880, f2: 2420, open: 0.72 },  // Mid-front "eh"
    i: { f1: 610, f2: 2680, open: 0.50 },  // Soft high "ee"
    o: { f1: 810, f2: 1460, open: 0.82 },  // Rounded "oh"
    u: { f1: 560, f2: 1260, open: 0.55 },  // Gentle "oo"
  },
  'nz-male': {
    a: { f1: 640, f2: 1380, open: 0.88 }, // Fronted Kiwi TRAP/START vowel
    e: { f1: 390, f2: 2080, open: 0.68 }, // Raised Kiwi DRESS vowel (closer to "i")
    i: { f1: 510, f2: 1520, open: 0.56 }, // Centralized Kiwi KIT schwa ("fush/chups")
    o: { f1: 460, f2: 960, open: 0.80 },  // Rounded Commonwealth "oh"
    u: { f1: 350, f2: 1450, open: 0.58 }, // Fronted Kiwi GOOSE "oo"
  },
};

/**
 * Splits a CloudEvent message into readable, bite-sized chunks for the speech bubble
 * so long messages never overwhelm the UI.
 * Records exact character & word offsets so a single smooth continuous TTS utterance
 * can refresh the speech bubble the moment speech hits the end of each chunk.
 */
export function chunkMessageForBubble(
  rawText: string,
  options: { maxWords?: number; maxChars?: number; msPerWord?: number; minChunkMs?: number } = {}
): MessageChunk[] {
  const maxWords = options.maxWords ?? 8;
  const maxChars = options.maxChars ?? 52;
  const msPerWord = options.msPerWord ?? 280;
  const minChunkMs = options.minChunkMs ?? 1400;

  const cleaned = (rawText || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return [];

  const tokens = cleaned.split(' ');
  const rawChunks: string[][] = [];
  let currentWords: string[] = [];
  let currentCharLen = 0;

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    const addedLen = currentWords.length === 0 ? word.length : currentCharLen + 1 + word.length;

    const wouldExceedWords = currentWords.length >= maxWords;
    const wouldExceedChars = currentWords.length > 0 && addedLen > maxChars;

    if (wouldExceedWords || wouldExceedChars) {
      rawChunks.push(currentWords);
      currentWords = [word];
      currentCharLen = word.length;
    } else {
      currentWords.push(word);
      currentCharLen = addedLen;
    }

    // Break naturally at clause or sentence punctuation if we already have >= 3 words
    const endsWithSentenceBreak = /[.!?;:]$/.test(word);
    const endsWithClauseBreak = /[,—–]$/.test(word);
    const hasRemainingWords = i < tokens.length - 1;

    if (
      hasRemainingWords &&
      ((endsWithSentenceBreak && currentWords.length >= 2) ||
        (endsWithClauseBreak && currentWords.length >= 4))
    ) {
      rawChunks.push(currentWords);
      currentWords = [];
      currentCharLen = 0;
    }
  }

  if (currentWords.length > 0) {
    rawChunks.push(currentWords);
  }

  const totalChunks = rawChunks.length;
  let charCursor = 0;
  let globalWordCursor = 0;

  return rawChunks.map((words, index) => {
    const text = words.join(' ');
    const charStart = charCursor;
    const charEnd = charStart + text.length;
    const globalWordStart = globalWordCursor;

    charCursor = charEnd + 1; // +1 for space between chunks in normalized message
    globalWordCursor += words.length;

    const charBonusMs = Math.max(0, text.length - 25) * 18;
    const minReadDurationMs = Math.max(minChunkMs, words.length * msPerWord + charBonusMs);

    return {
      index,
      totalChunks,
      words,
      text,
      charStart,
      charEnd,
      globalWordStart,
      minReadDurationMs,
    };
  });
}

/**
 * Builds a smooth syllable timeline across all chunks of a message so word transitions
 * and chunk boundary refreshes are seamless.
 */
export function buildMessageSyllableTimeline(
  chunks: MessageChunk[],
  options: { severity?: EventSeverity; minChunkMs?: number; voicePersona?: VoicePersona } = {}
): {
  syllables: SyllableKeyframe[];
  chunkEndTimesMs: number[];
  totalDurationMs: number;
} {
  const severity = options.severity ?? 'info';
  const persona = options.voicePersona ?? 'nz-male';
  const formants = PERSONA_VOWEL_FORMANTS[persona];
  const syllables: SyllableKeyframe[] = [];
  const chunkEndTimesMs: number[] = [];

  let cursorMs = 0;
  const isUrgent = severity === 'critical' || severity === 'error';
  const basePitch =
    persona === 'female'
      ? isUrgent
        ? 520
        : severity === 'warning'
          ? 480
          : 440
      : isUrgent
        ? 172
        : severity === 'warning'
          ? 152
          : 138;

  for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
    const chunk = chunks[cIdx];
    const chunkStartMs = cursorMs;

    chunk.words.forEach((rawWord, wordIdxInChunk) => {
      const globalWordIdx = chunk.globalWordStart + wordIdxInChunk;
      const clean = rawWord.toLowerCase().replace(/[^a-z0-9]/g, '');
      const vowelMatches = clean.match(/[aeiouy]+/g);
      const sylCount = vowelMatches ? Math.min(3, Math.max(1, vowelMatches.length)) : 1;

      // Smooth word duration proportional to syllable count
      for (let s = 0; s < sylCount; s++) {
        const vCluster = vowelMatches?.[s] || 'a';
        const firstChar = vCluster[0];
        const vowel: 'a' | 'e' | 'i' | 'o' | 'u' =
          firstChar === 'a' ||
          firstChar === 'e' ||
          firstChar === 'i' ||
          firstChar === 'o' ||
          firstChar === 'u'
            ? firstChar
            : 'e';

        const formant = formants[vowel];
        const isStressed = s === 0;
        const endsExclaim = rawWord.endsWith('!');
        const endsQuestion = rawWord.endsWith('?');

        const phraseProgress = wordIdxInChunk / Math.max(1, chunk.words.length - 1);
        let pitchHz: number;
        if (persona === 'female') {
          const phraseArch = Math.sin(phraseProgress * Math.PI) * 28;
          const inflection = endsQuestion ? 60 : endsExclaim ? 40 : isStressed ? 18 : -10;
          pitchHz = Math.max(360, Math.min(680, basePitch + phraseArch + inflection));
        } else {
          // Kiwi male cadence with characteristic subtle high-rising terminal lift at phrase end
          const kiwiTerminalLift = phraseProgress > 0.72 ? (phraseProgress - 0.72) * 55 : 0;
          const phraseArch = Math.sin(phraseProgress * Math.PI) * 14 + kiwiTerminalLift;
          const inflection = endsQuestion ? 28 : endsExclaim ? 22 : isStressed ? 10 : -5;
          pitchHz = Math.max(105, Math.min(240, basePitch + phraseArch + inflection));
        }

        const durMs = isStressed ? 145 : 115;
        // Very small inter-syllable gap so words glide smoothly into one another
        const gapMs = s === sylCount - 1 ? 28 : 10;

        syllables.push({
          chunkIndex: cIdx,
          wordIndexInChunk: wordIdxInChunk,
          globalWordIndex: globalWordIdx,
          syllableText: vCluster,
          vowel,
          f1: formant.f1,
          f2: formant.f2,
          pitchHz,
          mouthOpen: Math.min(1.05, formant.open * (isStressed ? 1.0 : 0.85)),
          startOffsetMs: cursorMs,
          durationMs: durMs,
        });

        cursorMs += durMs + gapMs;
      }

      // Natural micro-pause at clause punctuation
      if (/[,;:—–]$/.test(rawWord)) {
        cursorMs += 90;
      } else if (/[.!?]$/.test(rawWord)) {
        cursorMs += 150;
      }
    });

    // Ensure the chunk timeline honors the minimum reading duration for the words in the bubble
    const spokenChunkElapsed = cursorMs - chunkStartMs;
    if (spokenChunkElapsed < chunk.minReadDurationMs) {
      cursorMs = chunkStartMs + chunk.minReadDurationMs;
    }

    chunkEndTimesMs.push(cursorMs);

    // Gentle breath transition between chunks
    if (cIdx < chunks.length - 1) {
      cursorMs += 180;
    }
  }

  return {
    syllables,
    chunkEndTimesMs,
    totalDurationMs: Math.max(400, cursorMs),
  };
}

/**
 * Normalizes technical CNCF CloudEvent strings (hyphens, pod hashes, acronyms,
 * semicolons) into smooth, natural conversational English for TTS synthesis
 * while keeping the original text intact in the visual speech bubble.
 */
export function normalizeTextForSmoothSpeech(rawText: string): string {
  return (
    rawText
      // Expand technical acronyms that TTS engines often spell out or stumble on
      .replace(/\bK8s\b/gi, 'Kubernetes')
      .replace(/\betcd\b/gi, 'et-see-dee')
      .replace(/\bJetStream\b/g, 'Jet Stream')
      .replace(/\bFluxCD\b/gi, 'Flux C D')
      .replace(/\bNATS\b/g, 'Nats')
      // Separate trailing pod hex hashes like "-7f9b" into smooth spoken characters
      .replace(/-([0-9a-f]{4,8})\b/gi, (_, hash: string) => ' ' + hash.split('').join(' '))
      // Replace internal hyphens between words (e.g. whisker-mesh, laser-pointer, sub-millisecond) with spaces
      .replace(/([a-zA-Z])-([a-zA-Z])/g, '$1 $2')
      // Replace hard semicolons and colons with soft conversational commas
      .replace(/[;:]/g, ',')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Applies subtle, authentic New Zealand English (Kiwi) phonetic vowel shifts
 * (the characteristic KIT -> schwa/u and DRESS -> i chain shift) for spoken TTS
 * while keeping the visual speech bubble text 100% untouched.
 */
export function applyNewZealandAccentPhonetics(spokenText: string): string {
  return spokenText
    .replace(/\bevents\b/gi, 'evints')
    .replace(/\bevent\b/gi, 'evint')
    .replace(/\bready\b/gi, 'riddy')
    .replace(/\bcheck\b/gi, 'chick')
    .replace(/\bmesh\b/gi, 'mish')
    .replace(/\bJet\b/g, 'Jit')
    .replace(/\bjet\b/g, 'jit')
    .replace(/\bset\b/gi, 'sit')
    .replace(/\btest\b/gi, 'tist')
    .replace(/\byes\b/gi, 'yiss')
    .replace(/\bseven\b/gi, 'siven')
    .replace(/\bbetter\b/gi, 'bitter')
    .replace(/\bnetwork\b/gi, 'nitwork')
    .replace(/\bmemory\b/gi, 'mimory')
    .replace(/\bthreshold\b/gi, 'thrishold')
    .replace(/\bdetected\b/gi, 'deticted')
    .replace(/\bmessage\b/gi, 'missage')
    .replace(/\bsystem\b/gi, 'sustem')
    .replace(/\bcritical\b/gi, 'crutical')
    .replace(/\bwhisker\b/gi, 'whusker')
    .replace(/\blimit\b/gi, 'lumut')
    .replace(/\bsix\b/gi, 'sux')
    .replace(/\bfish\b/gi, 'fush')
    .replace(/\bchips\b/gi, 'chups');
}

/**
 * Deterministic 32-bit FNV-1a hash used to look up pre-bundled static Neural TTS MP3s
 * in `public/tts/<hash>.mp3` on static hosts like GitHub Pages.
 */
export function hashTtsKey(tl: string, text: string): string {
  const input = `${tl}::${text}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Selects the clearest, most natural female English voice from the browser's
 * `window.speechSynthesis.getVoices()` list.
 */
export function selectPreferredFemaleVoice(
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  const englishVoices = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  const pool = englishVoices.length > 0 ? englishVoices : voices;

  const tier1NeuralFemale = [
    /Ava.*(Natural|Neural|Online|Premium|Enhanced)/i,
    /Aria.*(Natural|Neural|Online)/i,
    /Jenny.*(Natural|Neural|Online)/i,
    /Sonia.*(Natural|Neural|Online)/i,
    /Libby.*(Natural|Neural|Online)/i,
    /Natasha.*(Natural|Neural|Online)/i,
    /Samantha.*(Enhanced|Premium)/i,
    /(Natural|Neural|Premium|Enhanced).*(Female|Ava|Aria|Jenny|Sonia|Samantha|Allison|Serena)/i,
    /Google UK English Female/i,
    /Google US English/i,
  ];

  for (const pattern of tier1NeuralFemale) {
    const match = pool.find((v) => pattern.test(v.name));
    if (match) return match;
  }

  const tier2FemalePatterns = [
    /Microsoft Aria/i,
    /Microsoft Jenny/i,
    /Microsoft Sonia/i,
    /Samantha/i,
    /Ava/i,
    /Allison/i,
    /Serena/i,
    /Victoria/i,
    /Karen/i,
    /Moira/i,
    /Tessa/i,
    /Microsoft Zira/i,
    /Martha/i,
    /\+f[2345]/i,
    /female/i,
    /woman/i,
  ];

  for (const pattern of tier2FemalePatterns) {
    const match = pool.find((v) => pattern.test(v.name));
    if (match) return match;
  }

  const naturalEn = pool.find((v) => /^en-(US|GB|AU|IE)/i.test(v.lang) && !/espeak/i.test(v.name));
  if (naturalEn) return naturalEn;

  return pool[0] ?? null;
}

/**
 * Selects the deepest, gruffest male English voice from the browser's
 * `window.speechSynthesis.getVoices()` list for Tom Waits offline fallback.
 */
export function selectPreferredGruffMaleVoice(
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  const englishVoices = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  const pool = englishVoices.length > 0 ? englishVoices : voices;

  const tier1Male = [
    /Christopher.*(Natural|Neural|Online)/i,
    /Eric.*(Natural|Neural|Online)/i,
    /Guy.*(Natural|Neural|Online)/i,
    /Davis.*(Natural|Neural|Online)/i,
    /Steffan.*(Natural|Neural|Online)/i,
    /Ryan.*(Natural|Neural|Online)/i,
    /Google UK English Male/i,
    /(Natural|Neural|Premium|Enhanced).*(Male|Christopher|Eric|Guy|Davis|Daniel|Aaron|Fred)/i,
  ];

  for (const pattern of tier1Male) {
    const match = pool.find((v) => pattern.test(v.name));
    if (match) return match;
  }

  const tier2MalePatterns = [
    /Microsoft Christopher/i,
    /Microsoft Eric/i,
    /Microsoft Guy/i,
    /Microsoft Davis/i,
    /Microsoft David/i,
    /Microsoft Mark/i,
    /Daniel/i,
    /Alex/i,
    /Fred/i,
    /Aaron/i,
    /Arthur/i,
    /Oliver/i,
    /\+m[12345]/i,
    /\bmale\b/i,
    /\bman\b/i,
  ];

  for (const pattern of tier2MalePatterns) {
    const match = pool.find((v) => pattern.test(v.name));
    if (match) return match;
  }

  const naturalEn = pool.find((v) => /^en-(US|GB|AU|IE)/i.test(v.lang));
  if (naturalEn) return naturalEn;

  return pool[0] ?? null;
}

/**
 * Selects a New Zealand (`en-NZ`), Australian (`en-AU`), or Commonwealth (`en-GB`)
 * male English voice from the browser's `window.speechSynthesis.getVoices()` list.
 */
export function selectPreferredNewZealandMaleVoice(
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  const englishVoices = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  const pool = englishVoices.length > 0 ? englishVoices : voices;

  // Tier 1: Explicit New Zealand or Australian Male Voices
  const tier1Kiwi = [
    /Mitchell/i, // Microsoft Mitchell (en-NZ Male)
    /William.*(Natural|Neural|Online)/i, // Microsoft William (en-AU Male)
    /Darren/i,
    /Gordon/i,
    /Lee/i,
    /James.*(AU|NZ)/i,
  ];
  for (const pattern of tier1Kiwi) {
    const match = pool.find((v) => pattern.test(v.name));
    if (match) return match;
  }

  // Tier 2: Any en-NZ or en-AU voice
  const nzMatch = pool.find((v) => /^en[-_]NZ/i.test(v.lang));
  if (nzMatch) return nzMatch;
  const auMatch = pool.find((v) => /^en[-_]AU/i.test(v.lang));
  if (auMatch) return auMatch;

  // Tier 3: Commonwealth (en-GB) Male Voices
  const gbMale = pool.find(
    (v) =>
      /^en[-_]GB/i.test(v.lang) &&
      /(Male|Ryan|Thomas|George|Daniel|Oliver|Arthur)/i.test(v.name)
  );
  if (gbMale) return gbMale;

  return selectPreferredGruffMaleVoice(pool);
}

export function selectPreferredVoiceForPersona(
  voices: SpeechSynthesisVoice[],
  persona: VoicePersona
): SpeechSynthesisVoice | null {
  if (persona === 'female') return selectPreferredFemaleVoice(voices);
  return selectPreferredNewZealandMaleVoice(voices);
}

interface NeuralTimelineAlignment {
  durationMs: number;
  rmsEnvelope: Float32Array;
  frameStepMs: number;
  chunkEndTimesMs: number[];
  wordTimings: Array<{
    chunkIndex: number;
    wordIndexInChunk: number;
    startMs: number;
    endMs: number;
  }>;
}

/**
 * Web Audio Feline Vocalizer & Smooth Neural Female Speech Engine
 */
export class FelineSpeechEngine {
  private audioCtx: AudioContext | null = null;
  private activeNodes: AudioNode[] = [];
  private activeOscillators: Array<OscillatorNode | AudioBufferSourceNode> = [];
  private currentRunId = 0;
  private preferredVoice: SpeechSynthesisVoice | null = null;
  private neuralBufferCache = new Map<string, AudioBuffer>();

  // Live animation state sampled by KittySpeaker's 60fps requestAnimationFrame loop
  public isSpeaking = false;
  public chunks: MessageChunk[] = [];
  public activeChunkIndex = 0;
  public activeWordIndex = 0;
  public speechStartPerf = 0;
  public timelineSyllables: SyllableKeyframe[] = [];
  public chunkEndTimesMs: number[] = [];
  public manualRoarBurst = 0;
  public smoothedMouthOpen = 0;
  public selectedVoiceName = 'New Zealand Male Baritone (en-NZ)';

  // Active Neural AudioBuffer playback state (for real-time acoustic RMS lip-sync)
  private activeNeuralAlignment: NeuralTimelineAlignment | null = null;

  // Live TTS boundary tracking (when Web Speech API fallback emits word boundaries)
  private ttsBoundaryActive = false;

  private onStateChange?: (state: SpeechChunkState) => void;

  constructor(onStateChange?: (state: SpeechChunkState) => void) {
    this.onStateChange = onStateChange;
    this.initVoiceDiscovery();
  }

  private initVoiceDiscovery(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const updateVoices = () => {
      try {
        const voices = window.speechSynthesis.getVoices();
        const best = selectPreferredFemaleVoice(voices);
        if (best) {
          this.preferredVoice = best;
          this.selectedVoiceName = best.name;
        }
      } catch {}
    };
    updateVoices();
    if ('onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.addEventListener?.('voiceschanged', updateVoices);
    }
  }

  public ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.audioCtx = new AudioCtx();
        } catch {
          this.audioCtx = null;
        }
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public stopActiveAudio(): void {
    for (const osc of this.activeOscillators) {
      try {
        osc.stop();
      } catch {}
    }
    for (const node of this.activeNodes) {
      try {
        node.disconnect();
      } catch {}
    }
    this.activeOscillators = [];
    this.activeNodes = [];

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }

  public cancelSpeech(): void {
    this.currentRunId += 1;
    this.stopActiveAudio();
    this.isSpeaking = false;
    this.chunks = [];
    this.activeChunkIndex = 0;
    this.activeWordIndex = 0;
    this.timelineSyllables = [];
    this.ttsBoundaryActive = false;
    this.notifyState();
  }

  /**
   * Plays a strong, unmistakable synthesized feline vocalization tailored to `voicePersona`:
   * - `female`: classic melodic high-formant cat "Mee-aa-o-ww!"
   * - `nz-male`: warm, friendly Kiwi tomcat baritone meow
   */
  public playCatVocalization(
    soundEnabled: boolean,
    isMadScream = false,
    durationScale = 1.0,
    voicePersona: VoicePersona = 'nz-male'
  ): void {
    this.manualRoarBurst = 1.0;
    if (!soundEnabled) return;
    const actx = this.ensureAudioContext();
    if (!actx) return;

    this.triggerSingleStrongMeow(actx, actx.currentTime, {
      durationSec: (isMadScream ? 1.15 : 0.82) * durationScale,
      isMadScream,
      pitchScale: 1.0,
      peakGain: isMadScream ? 0.30 : 0.27,
      voicePersona,
    });
  }

  /**
   * Synthesizes a single strong cat meow or fierce yowl at `startTime` on the Web Audio graph,
   * adapting pitch and vocal-tract formants to the active `voicePersona`.
   */
  private triggerSingleStrongMeow(
    actx: AudioContext,
    startTime: number,
    opts: {
      durationSec: number;
      isMadScream?: boolean;
      pitchScale?: number;
      inflection?: 'statement' | 'question' | 'exclaim';
      peakGain?: number;
      voicePersona?: VoicePersona;
    }
  ): void {
    const persona = opts.voicePersona ?? 'nz-male';
    const dur = Math.max(0.38, opts.durationSec);
    const isMad = Boolean(opts.isMadScream);
    const pScale = opts.pitchScale ?? 1.0;
    const peakGain = opts.peakGain ?? (isMad ? 0.32 : 0.28);
    const inflection = opts.inflection ?? 'statement';

    // Smooth melodic feline meow (higher pitched for 'female', warm baritone tomcat for 'nz-male')
    const personaPitchMult = persona === 'nz-male' ? 0.52 : 1.0;
    const personaFormantMult = persona === 'nz-male' ? 0.68 : 1.0;

    const osc1 = actx.createOscillator();
    const osc2 = actx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'triangle';

    const lfo = actx.createOscillator();
    const lfoGain = actx.createGain();
    lfo.frequency.setValueAtTime(isMad ? 24 : 7.5, startTime);
    lfoGain.gain.setValueAtTime((isMad ? 36 : 11) * personaPitchMult, startTime);
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    const formant1 = actx.createBiquadFilter();
    formant1.type = 'bandpass';
    formant1.Q.setValueAtTime(isMad ? 3.5 : 4.8, startTime);

    const formant2 = actx.createBiquadFilter();
    formant2.type = 'bandpass';
    formant2.Q.setValueAtTime(isMad ? 3.4 : 3.8, startTime);

    const masterGain = actx.createGain();

    if (isMad) {
      const startF = 520 * pScale * personaPitchMult;
      const peak1F = 980 * pScale * personaPitchMult;
      const midF = 760 * pScale * personaPitchMult;
      const peak2F = 1040 * pScale * personaPitchMult;
      const endF = 440 * pScale * personaPitchMult;

      osc1.frequency.setValueAtTime(startF, startTime);
      osc1.frequency.exponentialRampToValueAtTime(peak1F, startTime + dur * 0.18);
      osc1.frequency.exponentialRampToValueAtTime(midF, startTime + dur * 0.52);
      osc1.frequency.exponentialRampToValueAtTime(peak2F, startTime + dur * 0.76);
      osc1.frequency.exponentialRampToValueAtTime(endF, startTime + dur);

      osc2.frequency.setValueAtTime(startF + 3, startTime);
      osc2.frequency.exponentialRampToValueAtTime(peak1F + 5, startTime + dur * 0.18);
      osc2.frequency.exponentialRampToValueAtTime(endF + 3, startTime + dur);

      formant1.frequency.setValueAtTime(900 * personaFormantMult, startTime);
      formant1.frequency.exponentialRampToValueAtTime(1880 * personaFormantMult, startTime + dur * 0.24);
      formant1.frequency.exponentialRampToValueAtTime(1120 * personaFormantMult, startTime + dur * 0.72);
      formant1.frequency.exponentialRampToValueAtTime(660 * personaFormantMult, startTime + dur);

      formant2.frequency.setValueAtTime(2200 * personaFormantMult, startTime);
      formant2.frequency.exponentialRampToValueAtTime(3200 * personaFormantMult, startTime + dur * 0.28);
      formant2.frequency.exponentialRampToValueAtTime(1700 * personaFormantMult, startTime + dur);
    } else {
      // For 'nz-male', add a friendly Kiwi upward lilt at the end of the meow
      const startF = 465 * pScale * personaPitchMult;
      const peakF =
        (inflection === 'exclaim' ? 860 : inflection === 'question' ? 830 : 795) *
        pScale *
        personaPitchMult;
      const sustainF = (inflection === 'question' ? 760 : 655) * pScale * personaPitchMult;
      const endF =
        (persona === 'nz-male' ? 690 : inflection === 'question' ? 590 : 385) *
        pScale *
        personaPitchMult;

      osc1.frequency.setValueAtTime(startF, startTime);
      osc1.frequency.exponentialRampToValueAtTime(peakF, startTime + dur * 0.26);
      osc1.frequency.exponentialRampToValueAtTime(sustainF, startTime + dur * 0.62);
      osc1.frequency.exponentialRampToValueAtTime(endF, startTime + dur);

      osc2.frequency.setValueAtTime(startF + 3, startTime);
      osc2.frequency.exponentialRampToValueAtTime(peakF + 4, startTime + dur * 0.26);
      osc2.frequency.exponentialRampToValueAtTime(sustainF + 3, startTime + dur * 0.62);
      osc2.frequency.exponentialRampToValueAtTime(endF + 2, startTime + dur);

      formant1.frequency.setValueAtTime(650 * personaFormantMult, startTime);
      formant1.frequency.exponentialRampToValueAtTime(1600 * personaFormantMult, startTime + dur * 0.28);
      formant1.frequency.exponentialRampToValueAtTime(1180 * personaFormantMult, startTime + dur * 0.65);
      formant1.frequency.exponentialRampToValueAtTime(780 * personaFormantMult, startTime + dur);

      formant2.frequency.setValueAtTime(1800 * personaFormantMult, startTime);
      formant2.frequency.exponentialRampToValueAtTime(2720 * personaFormantMult, startTime + dur * 0.28);
      formant2.frequency.exponentialRampToValueAtTime(1950 * personaFormantMult, startTime + dur * 0.65);
      formant2.frequency.exponentialRampToValueAtTime(1350 * personaFormantMult, startTime + dur);
    }

    masterGain.gain.setValueAtTime(0.001, startTime);
    masterGain.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.06, dur * 0.12));
    masterGain.gain.setValueAtTime(peakGain * 0.9, startTime + dur * 0.6);
    masterGain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

    osc1.connect(formant1);
    osc2.connect(formant2);
    formant1.connect(masterGain);
    formant2.connect(masterGain);
    masterGain.connect(actx.destination);

    osc1.start(startTime);
    osc2.start(startTime);
    lfo.start(startTime);
    osc1.stop(startTime + dur + 0.02);
    osc2.stop(startTime + dur + 0.02);
    lfo.stop(startTime + dur + 0.02);

    this.activeOscillators.push(osc1, osc2, lfo);
    this.activeNodes.push(lfoGain, formant1, formant2, masterGain);
  }

  /**
   * Schedules a sequence of strong, full-bodied cat meows ("MEE-OWW! MRR-OWW! MEE-AA-OWW!")
   * across the chunks of the message for `Meow-Speak` mode.
   * Each meow spans 1–2 words (~0.48s–0.75s) so every vocalization has the full feline
   * pitch arch and "M-ee-aa-o-w" formant sweep instead of short synthetic blips.
   */
  private scheduleStrongMeowSpeak(
    chunks: MessageChunk[],
    syllables: SyllableKeyframe[],
    soundEnabled: boolean,
    severity: EventSeverity,
    voicePersona: VoicePersona = 'nz-male'
  ): void {
    if (!soundEnabled || syllables.length === 0 || chunks.length === 0) return;
    const actx = this.ensureAudioContext();
    if (!actx) return;

    const baseNow = actx.currentTime + 0.02;
    const isUrgent = severity === 'critical' || severity === 'error';

    // Group words within each chunk into strong meow phrases (1 to 2 words per meow)
    // so every meow is ~0.48s - 0.78s long and sounds like a strong, real cat meow!
    let meowCount = 0;
    for (const chunk of chunks) {
      const chunkSyls = syllables.filter((s) => s.chunkIndex === chunk.index);
      if (chunkSyls.length === 0) continue;

      // Group word indices in this chunk into pairs (or single words if long/punctuated)
      let wIdx = 0;
      while (wIdx < chunk.words.length) {
        const word = chunk.words[wIdx];
        const hasPunct = /[,.;:!?—–]$/.test(word);
        const groupEndWIdx =
          !hasPunct && word.length <= 5 && wIdx + 1 < chunk.words.length ? wIdx + 1 : wIdx;

        const groupSyls = chunkSyls.filter(
          (s) => s.wordIndexInChunk >= wIdx && s.wordIndexInChunk <= groupEndWIdx
        );

        if (groupSyls.length > 0) {
          const firstSyl = groupSyls[0];
          const lastSyl = groupSyls[groupSyls.length - 1];
          const startSec = baseNow + firstSyl.startOffsetMs / 1000;
          const rawSpanSec =
            (lastSyl.startOffsetMs + lastSyl.durationMs - firstSyl.startOffsetMs) / 1000;
          // Ensure each meow has a strong, full-bodied feline duration (0.44s to 0.78s)
          const meowDurSec = Math.max(0.42, Math.min(0.78, rawSpanSec * 0.92 + 0.14));

          const combinedText = chunk.words.slice(wIdx, groupEndWIdx + 1).join(' ');
          const inflection: 'statement' | 'question' | 'exclaim' = combinedText.includes('?')
            ? 'question'
            : combinedText.includes('!')
              ? 'exclaim'
              : 'statement';

          // Expressive feline pitch variation from meow to meow
          const pitchOffsets = [1.0, 1.07, 0.95, 1.11, 0.98, 1.04];
          const pitchScale =
            pitchOffsets[meowCount % pitchOffsets.length] * (isUrgent ? 1.08 : 1.0);

          this.triggerSingleStrongMeow(actx, startSec, {
            durationSec: meowDurSec,
            isMadScream: isUrgent && meowCount % 3 === 0,
            pitchScale,
            inflection,
            peakGain: isUrgent ? 0.28 : 0.26,
            voicePersona,
          });

          meowCount += 1;
        }

        wIdx = groupEndWIdx + 1;
      }
    }
  }

  /**
   * Transforms a clean Antipodean (`en-AU`) TTS `AudioBuffer` into a crisp, natural
   * New Zealand (Kiwi) male baritone `AudioBuffer`:
   * 1. Gentle 4x-overlapped SOLA time-compression (`1.12x`) with a 38ms Hann window
   * 2. Clean formant + pitch down-sampling (`0.88x`, ~2.2 semitones down into a natural male vocal tract)
   *    with backed-off compression so consonants remain crystal-clear and artifact-free.
   */
  private transformToNewZealandMaleBuffer(
    actx: AudioContext,
    rawBuffer: AudioBuffer
  ): AudioBuffer {
    const sr = rawBuffer.sampleRate;
    const input = rawBuffer.getChannelData(0);
    if (input.length < 512) return rawBuffer;

    const tempoCompress = 1.12;
    const winLen = Math.max(512, Math.round(sr * 0.038));
    const hopS = Math.round(winLen * 0.25);
    const hopA = Math.round(hopS * tempoCompress);
    const searchRadius = Math.max(16, Math.round(sr * 0.005));

    const hann = new Float32Array(winLen);
    for (let i = 0; i < winLen; i++) {
      hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (winLen - 1)));
    }

    const estCompressedLen = Math.max(winLen * 2, Math.ceil(input.length / tempoCompress) + winLen);
    const compressed = new Float32Array(estCompressedLen);
    const normWin = new Float32Array(estCompressedLen);

    let inPos = 0;
    let outPos = 0;

    while (inPos + winLen < input.length && outPos + winLen < estCompressedLen) {
      let bestOffset = 0;
      if (outPos > 0) {
        let bestCorr = -Infinity;
        const overlapCheck = Math.min(hopS * 2, 384);
        for (let off = -searchRadius; off <= searchRadius; off += 2) {
          const candIn = inPos + off;
          if (candIn < 0 || candIn + winLen >= input.length) continue;
          let dot = 0;
          let e1 = 1e-6;
          let e2 = 1e-6;
          for (let k = 0; k < overlapCheck; k += 2) {
            const a = compressed[outPos + k];
            const b = input[candIn + k];
            dot += a * b;
            e1 += a * a;
            e2 += b * b;
          }
          const corr = dot / Math.sqrt(e1 * e2);
          if (corr > bestCorr) {
            bestCorr = corr;
            bestOffset = off;
          }
        }
      }

      const actualIn = Math.max(0, Math.min(input.length - winLen, inPos + bestOffset));
      for (let i = 0; i < winLen; i++) {
        const w = hann[i];
        compressed[outPos + i] += input[actualIn + i] * w;
        normWin[outPos + i] += w;
      }

      inPos += hopA;
      outPos += hopS;
    }

    const validCompressedLen = Math.min(estCompressedLen, outPos + hopS);
    for (let i = 0; i < validCompressedLen; i++) {
      if (normWin[i] > 0.05) {
        compressed[i] /= normWin[i];
      }
    }

    const pitchShift = 0.88;
    const outLen = Math.max(1, Math.floor(validCompressedLen / pitchShift));
    const outBuffer = actx.createBuffer(1, outLen, sr);
    const out = outBuffer.getChannelData(0);

    let peak = 0.001;
    for (let i = 0; i < outLen; i++) {
      const srcPos = i * pitchShift;
      const idx = Math.floor(srcPos);
      const frac = srcPos - idx;
      const s0 = compressed[Math.min(validCompressedLen - 1, idx)];
      const s1 = compressed[Math.min(validCompressedLen - 1, idx + 1)];
      const sample = s0 + (s1 - s0) * frac;
      out[i] = sample;
      const absS = Math.abs(sample);
      if (absS > peak) peak = absS;
    }

    const normGain = 0.92 / Math.max(0.05, peak);
    for (let i = 0; i < outLen; i++) {
      out[i] *= normGain;
    }

    return outBuffer;
  }

  /**
   * Fetches and decodes a Neural TTS audio buffer:
   * 1. First checks pre-bundled static MP3 assets (`./tts/<hash>.mp3`) so static deployments
   *    like GitHub Pages play crystal-clear Neural TTS with zero backend server required.
   * 2. Falls back to the Vite `/api/tts` proxy for dynamic/custom messages when running locally.
   * Automatically skips network calls in headless WebDriver test runners.
   */
  private async fetchAndDecodeNeuralSpeech(
    spokenText: string,
    voicePersona: VoicePersona = 'nz-male'
  ): Promise<AudioBuffer | null> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
    // Skip remote neural fetch in automated headless Playwright tests so offline sandbox tests run instantaneously
    if (navigator.webdriver) return null;

    const actx = this.ensureAudioContext();
    if (!actx) return null;

    const cacheKey = `${voicePersona}::${spokenText}`;
    const cached = this.neuralBufferCache.get(cacheKey);
    if (cached) return cached;

    const tl = voicePersona === 'nz-male' ? 'en-AU' : 'en-US';
    const textForTts =
      voicePersona === 'nz-male' ? applyNewZealandAccentPhonetics(spokenText) : spokenText;
    const staticHash = hashTtsKey(tl, textForTts);

    const candidateUrls = [
      `./tts/${staticHash}.mp3`,
      `./api/tts?tl=${tl}&text=${encodeURIComponent(textForTts)}`,
    ];

    for (const url of candidateUrls) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2200);
      try {
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        const contentType = resp.headers.get('content-type') || '';
        if (!resp.ok || contentType.includes('text/html')) continue;

        const arrBuf = await resp.arrayBuffer();
        if (!arrBuf || arrBuf.byteLength < 256) continue;

        const rawBuffer = await actx.decodeAudioData(arrBuf.slice(0));
        const finalBuffer =
          voicePersona === 'nz-male'
            ? this.transformToNewZealandMaleBuffer(actx, rawBuffer)
            : rawBuffer;

        if (this.neuralBufferCache.size > 60) {
          const firstKey = this.neuralBufferCache.keys().next().value;
          if (firstKey) this.neuralBufferCache.delete(firstKey);
        }
        this.neuralBufferCache.set(cacheKey, finalBuffer);
        return finalBuffer;
      } catch {
        clearTimeout(timer);
      }
    }

    return null;
  }

  /**
   * Pre-warms the Neural TTS audio cache in the background for instant zero-latency playback.
   */
  public prewarmMessages(rawMessages: string[]): void {
    if (typeof window === 'undefined' || (typeof navigator !== 'undefined' && navigator.webdriver)) {
      return;
    }
    setTimeout(() => {
      for (const msg of rawMessages) {
        const chunks = chunkMessageForBubble(msg);
        if (chunks.length > 0) {
          const spokenText = normalizeTextForSmoothSpeech(chunks.map((c) => c.text).join(' '));
          this.fetchAndDecodeNeuralSpeech(spokenText, 'nz-male').catch(() => {});
          this.fetchAndDecodeNeuralSpeech(spokenText, 'female').catch(() => {});
        }
      }
    }, 600);
  }

  /**
   * Analyzes the PCM waveform of a decoded Neural Female `AudioBuffer` to:
   * 1. Extract a 10ms-resolution acoustic RMS amplitude envelope for 60fps jaw lip-sync
   * 2. Align every word and speech-bubble chunk boundary (`chunkEndTimesMs`) to the actual
   *    inter-word energy valleys in the neural voice recording!
   */
  private alignNeuralAudioToChunks(
    audioBuffer: AudioBuffer,
    chunks: MessageChunk[]
  ): NeuralTimelineAlignment {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const durationMs = audioBuffer.duration * 1000;
    const frameStepMs = 10;
    const samplesPerFrame = Math.max(1, Math.floor((sampleRate * frameStepMs) / 1000));
    const totalFrames = Math.max(1, Math.ceil(channelData.length / samplesPerFrame));

    const rmsEnvelope = new Float32Array(totalFrames);
    let maxRms = 0.001;

    for (let f = 0; f < totalFrames; f++) {
      const start = f * samplesPerFrame;
      const end = Math.min(channelData.length, start + samplesPerFrame);
      let sumSq = 0;
      for (let i = start; i < end; i++) {
        const s = channelData[i];
        sumSq += s * s;
      }
      const rms = Math.sqrt(sumSq / Math.max(1, end - start));
      rmsEnvelope[f] = rms;
      if (rms > maxRms) maxRms = rms;
    }

    // Normalize RMS envelope into [0..1] with soft perceptual compression for expressive lip-sync
    let firstActiveFrame = 0;
    let lastActiveFrame = totalFrames - 1;
    const silenceThreshold = maxRms * 0.06;

    for (let f = 0; f < totalFrames; f++) {
      if (rmsEnvelope[f] > silenceThreshold) {
        firstActiveFrame = Math.max(0, f - 2);
        break;
      }
    }
    for (let f = totalFrames - 1; f >= 0; f--) {
      if (rmsEnvelope[f] > silenceThreshold) {
        lastActiveFrame = Math.min(totalFrames - 1, f + 2);
        break;
      }
    }

    for (let f = 0; f < totalFrames; f++) {
      const norm = Math.min(1, rmsEnvelope[f] / (maxRms * 0.78));
      rmsEnvelope[f] = Math.pow(norm, 0.72);
    }

    const speechStartMs = firstActiveFrame * frameStepMs;
    const speechEndMs = Math.max(speechStartMs + 200, lastActiveFrame * frameStepMs);
    const activeSpeechSpanMs = speechEndMs - speechStartMs;

    // Weight each word by phonetic syllable count + punctuation pause weight
    const wordMeta: Array<{
      chunkIndex: number;
      wordIndexInChunk: number;
      weight: number;
    }> = [];
    let totalWeight = 0;

    for (const chunk of chunks) {
      chunk.words.forEach((word, wIdx) => {
        const normalizedWord = normalizeTextForSmoothSpeech(word);
        const vowels = normalizedWord.match(/[aeiouy]+/gi);
        const sylWeight = Math.max(1, vowels ? vowels.length : 1) * 1.1 + normalizedWord.length * 0.14;
        const punctPause = /[.!?]$/.test(word) ? 2.4 : /[,;:—–]$/.test(word) ? 1.4 : 0;
        const w = sylWeight + punctPause;
        wordMeta.push({ chunkIndex: chunk.index, wordIndexInChunk: wIdx, weight: w });
        totalWeight += w;
      });
    }

    const wordTimings: NeuralTimelineAlignment['wordTimings'] = [];
    let accumWeight = 0;
    for (const wm of wordMeta) {
      const startMs = speechStartMs + (accumWeight / Math.max(1, totalWeight)) * activeSpeechSpanMs;
      accumWeight += wm.weight;
      const endMs = speechStartMs + (accumWeight / Math.max(1, totalWeight)) * activeSpeechSpanMs;
      wordTimings.push({
        chunkIndex: wm.chunkIndex,
        wordIndexInChunk: wm.wordIndexInChunk,
        startMs,
        endMs,
      });
    }

    // Snap each chunk boundary to the nearest acoustic energy valley (inter-word pause) within ±180ms
    const chunkEndTimesMs: number[] = [];
    for (let c = 0; c < chunks.length; c++) {
      if (c === chunks.length - 1) {
        chunkEndTimesMs.push(durationMs);
        continue;
      }
      const chunkWords = wordTimings.filter((w) => w.chunkIndex === c);
      const rawBoundaryMs =
        chunkWords.length > 0
          ? chunkWords[chunkWords.length - 1].endMs
          : ((c + 1) / chunks.length) * durationMs;

      const centerFrame = Math.round(rawBoundaryMs / frameStepMs);
      const searchRadiusFrames = Math.round(180 / frameStepMs);
      const minFrame = Math.max(firstActiveFrame + 5, centerFrame - searchRadiusFrames);
      const maxFrame = Math.min(lastActiveFrame - 5, centerFrame + searchRadiusFrames);

      let bestFrame = centerFrame;
      let lowestEnergy = Infinity;
      for (let f = minFrame; f <= maxFrame; f++) {
        // 3-frame local average + slight distance penalty from center
        const localEnergy =
          ((rmsEnvelope[f - 1] ?? rmsEnvelope[f]) +
            rmsEnvelope[f] +
            (rmsEnvelope[f + 1] ?? rmsEnvelope[f])) /
            3 +
          Math.abs(f - centerFrame) * 0.004;
        if (localEnergy < lowestEnergy) {
          lowestEnergy = localEnergy;
          bestFrame = f;
        }
      }
      chunkEndTimesMs.push(bestFrame * frameStepMs);
    }

    return {
      durationMs,
      rmsEnvelope,
      frameStepMs,
      chunkEndTimesMs,
      wordTimings,
    };
  }

  /**
   * Plays a decoded `AudioBuffer` through a persona-matched vocal presence EQ chain
   * on the Web Audio graph and resolves when playback completes.
   */
  private playDecodedNeuralSpeech(
    audioBuffer: AudioBuffer,
    runId: number,
    voicePersona: VoicePersona = 'nz-male'
  ): Promise<void> {
    const actx = this.ensureAudioContext();
    if (!actx) return Promise.resolve();

    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(safetyTimer);
        resolve();
      };

      const durationMs = audioBuffer.duration * 1000;
      const safetyTimer = setTimeout(finish, durationMs + 500);

      try {
        const source = actx.createBufferSource();
        source.buffer = audioBuffer;

        const chestFilter = actx.createBiquadFilter();
        chestFilter.type = 'peaking';

        const presenceFilter = actx.createBiquadFilter();
        presenceFilter.type = 'peaking';

        const deHarshFilter = actx.createBiquadFilter();
        deHarshFilter.type = 'lowpass';

        if (voicePersona === 'female') {
          chestFilter.frequency.setValueAtTime(240, actx.currentTime);
          chestFilter.Q.setValueAtTime(1.1, actx.currentTime);
          chestFilter.gain.setValueAtTime(2.2, actx.currentTime);

          presenceFilter.frequency.setValueAtTime(3200, actx.currentTime);
          presenceFilter.Q.setValueAtTime(1.0, actx.currentTime);
          presenceFilter.gain.setValueAtTime(1.5, actx.currentTime);

          deHarshFilter.frequency.setValueAtTime(9400, actx.currentTime);
        } else {
          // Warm Kiwi male baritone chest at 165 Hz + clear Antipodean vowel presence at 2450 Hz
          chestFilter.frequency.setValueAtTime(165, actx.currentTime);
          chestFilter.Q.setValueAtTime(1.1, actx.currentTime);
          chestFilter.gain.setValueAtTime(3.6, actx.currentTime);

          presenceFilter.frequency.setValueAtTime(2450, actx.currentTime);
          presenceFilter.Q.setValueAtTime(1.1, actx.currentTime);
          presenceFilter.gain.setValueAtTime(2.4, actx.currentTime);

          deHarshFilter.frequency.setValueAtTime(7800, actx.currentTime);
        }

        const gainNode = actx.createGain();
        gainNode.gain.setValueAtTime(1.0, actx.currentTime);

        source.connect(chestFilter);
        chestFilter.connect(presenceFilter);
        presenceFilter.connect(deHarshFilter);
        deHarshFilter.connect(gainNode);
        gainNode.connect(actx.destination);

        source.onended = () => {
          if (this.currentRunId === runId) finish();
          else finish();
        };

        this.activeOscillators.push(source);
        this.activeNodes.push(chestFilter, presenceFilter, deHarshFilter, gainNode);

        this.speechStartPerf = performance.now();
        source.start(0);
      } catch {
        finish();
      }
    });
  }

  /**
   * Fallback Web Speech API synthesizer when offline or in headless test environments:
   * Adapts voice selection, pitch, rate, and Kiwi phonetics to `voicePersona`.
   */
  private speakContinuousWebSpeech(
    chunks: MessageChunk[],
    soundEnabled: boolean,
    _severity: EventSeverity,
    expectedDurationMs: number,
    runId: number,
    voicePersona: VoicePersona = 'nz-male'
  ): Promise<void> {
    if (
      !soundEnabled ||
      typeof window === 'undefined' ||
      !('speechSynthesis' in window) ||
      typeof SpeechSynthesisUtterance === 'undefined'
    ) {
      return Promise.resolve();
    }

    const rawJoined = chunks.map((c) => c.text).join(' ');
    const spokenText = normalizeTextForSmoothSpeech(rawJoined);

    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        this.ttsBoundaryActive = false;
        clearTimeout(safetyTimer);
        resolve();
      };

      const safetyTimer = setTimeout(finish, Math.max(expectedDurationMs + 1500, 2500));

      const startUtterance = () => {
        if (this.currentRunId !== runId || settled) {
          finish();
          return;
        }
        try {
          const voices = window.speechSynthesis.getVoices();
          const bestVoice = selectPreferredVoiceForPersona(voices, voicePersona);
          if (bestVoice) {
            this.preferredVoice = bestVoice;
            this.selectedVoiceName = bestVoice.name;
          }

          const utterance = new SpeechSynthesisUtterance(spokenText);
          if (bestVoice) {
            utterance.voice = bestVoice;
            utterance.lang = bestVoice.lang || (voicePersona === 'nz-male' ? 'en-NZ' : 'en-US');
          } else {
            utterance.lang = voicePersona === 'nz-male' ? 'en-NZ' : 'en-US';
          }

          if (voicePersona === 'female') {
            const isEspeakGeneric =
              bestVoice && /espeak/i.test(bestVoice.name) && !/\+f/i.test(bestVoice.name);
            utterance.rate = 1.0;
            utterance.pitch = isEspeakGeneric ? 1.15 : 1.0;
          } else {
            utterance.rate = 1.0;
            utterance.pitch = 0.92;
          }
          utterance.volume = 1.0;

          // Map normalized word offsets for boundary tracking
          const wordMap: Array<{
            chunkIndex: number;
            wordIndexInChunk: number;
            charStart: number;
          }> = [];
          let normCursor = 0;
          for (const chunk of chunks) {
            chunk.words.forEach((word, wIdx) => {
              const normWord = normalizeTextForSmoothSpeech(word);
              wordMap.push({
                chunkIndex: chunk.index,
                wordIndexInChunk: wIdx,
                charStart: normCursor,
              });
              normCursor += normWord.length + 1;
            });
          }

          utterance.onboundary = (ev: SpeechSynthesisEvent) => {
            if (this.currentRunId !== runId) return;
            if (typeof ev.charIndex === 'number') {
              this.ttsBoundaryActive = true;
              let matched = wordMap[0];
              for (const entry of wordMap) {
                if (ev.charIndex >= entry.charStart) {
                  matched = entry;
                } else {
                  break;
                }
              }
              if (matched) {
                if (
                  matched.chunkIndex !== this.activeChunkIndex ||
                  matched.wordIndexInChunk !== this.activeWordIndex
                ) {
                  this.activeChunkIndex = matched.chunkIndex;
                  this.activeWordIndex = matched.wordIndexInChunk;
                  this.notifyState();
                }
              }
            }
          };

          utterance.onend = () => finish();
          utterance.onerror = () => finish();

          window.speechSynthesis.speak(utterance);
        } catch {
          finish();
        }
      };

      try {
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          window.speechSynthesis.cancel();
          setTimeout(startUtterance, 35);
        } else {
          startUtterance();
        }
      } catch {
        finish();
      }
    });
  }

  /**
   * Speaks a full CloudEvent message with the selected `voicePersona` (`female` or `nz-male`),
   * speech-synced bubble chunk refreshes, and automatic bubble dismissal shortly after completion.
   */
  public async speakMessage(
    message: string,
    options: {
      voiceMode: VoiceMode;
      voicePersona?: VoicePersona;
      soundEnabled: boolean;
      severity?: EventSeverity;
      maxWordsPerChunk?: number;
      maxCharsPerChunk?: number;
      minChunkMs?: number;
      msPerWord?: number;
      bubbleCloseDelayMs?: number;
    }
  ): Promise<void> {
    const runId = ++this.currentRunId;
    this.stopActiveAudio();
    this.activeNeuralAlignment = null;

    const severity = options.severity ?? 'info';
    const voicePersona = options.voicePersona ?? 'nz-male';
    const chunks = chunkMessageForBubble(message, {
      maxWords: options.maxWordsPerChunk ?? 8,
      maxChars: options.maxCharsPerChunk ?? 52,
      minChunkMs: options.minChunkMs ?? 1400,
      msPerWord: options.msPerWord ?? 280,
    });

    if (chunks.length === 0) {
      this.isSpeaking = false;
      this.chunks = [];
      this.notifyState();
      return;
    }

    this.chunks = chunks;
    this.isSpeaking = true;
    this.activeChunkIndex = 0;
    this.activeWordIndex = 0;
    this.ttsBoundaryActive = false;
    this.notifyState();

    // Start fetching the Neural TTS audio buffer concurrently during the initial cat meow preamble!
    const wantsHumanVoice =
      options.soundEnabled && (options.voiceMode === 'tts' || options.voiceMode === 'both');
    const normalizedFullText = normalizeTextForSmoothSpeech(chunks.map((c) => c.text).join(' '));
    const neuralFetchPromise = wantsHumanVoice
      ? this.fetchAndDecodeNeuralSpeech(normalizedFullText, voicePersona)
      : Promise.resolve(null);

    // Cue preamble:
    // - On high-severity alerts: fierce mad-cat yowl before speaking
    // - In 'both' mode on normal events: a persona-matched cat meow/growl before the human voice speaks
    if (severity === 'critical' || severity === 'error') {
      this.playCatVocalization(options.soundEnabled, true, 0.85, voicePersona);
      await this.waitMs(360, runId);
      if (this.currentRunId !== runId) return;
    } else if (options.voiceMode === 'both') {
      this.playCatVocalization(options.soundEnabled, false, 0.7, voicePersona);
      await this.waitMs(340, runId);
      if (this.currentRunId !== runId) return;
    }

    const { syllables, chunkEndTimesMs, totalDurationMs } = buildMessageSyllableTimeline(chunks, {
      severity,
      minChunkMs: options.minChunkMs ?? 1400,
      voicePersona,
    });

    this.timelineSyllables = syllables;
    this.chunkEndTimesMs = chunkEndTimesMs;
    this.speechStartPerf = performance.now();

    if (options.voiceMode === 'meow') {
      this.scheduleStrongMeowSpeak(chunks, syllables, options.soundEnabled, severity, voicePersona);
      await this.waitMs(totalDurationMs, runId);
    } else {
      const neuralBuffer = await neuralFetchPromise;
      if (this.currentRunId !== runId) return;

      if (neuralBuffer) {
        this.selectedVoiceName =
          voicePersona === 'female'
            ? 'Google Neural Female (en-US)'
            : 'New Zealand Male Baritone (en-NZ)';
        const alignment = this.alignNeuralAudioToChunks(neuralBuffer, chunks);
        this.activeNeuralAlignment = alignment;
        this.chunkEndTimesMs = alignment.chunkEndTimesMs;
        this.notifyState();
        await this.playDecodedNeuralSpeech(neuralBuffer, runId, voicePersona);
      } else {
        const ttsPromise = wantsHumanVoice
          ? this.speakContinuousWebSpeech(
              chunks,
              options.soundEnabled,
              severity,
              totalDurationMs,
              runId,
              voicePersona
            )
          : Promise.resolve();
        const timelinePromise = this.waitMs(totalDurationMs, runId);
        await Promise.all([ttsPromise, timelinePromise]);
      }
    }

    if (this.currentRunId !== runId) return;

    // Ensure final chunk & final word are shown at completion
    const lastChunkIdx = chunks.length - 1;
    this.activeChunkIndex = lastChunkIdx;
    this.activeWordIndex = Math.max(0, chunks[lastChunkIdx].words.length - 1);
    this.isSpeaking = false;
    this.activeNeuralAlignment = null;
    this.timelineSyllables = [];
    this.ttsBoundaryActive = false;
    this.notifyState();

    // Close the speech bubble shortly after finishing reading the final chunk
    const closeDelayMs = options.bubbleCloseDelayMs ?? 1200;
    if (closeDelayMs >= 0) {
      await this.waitMs(closeDelayMs, runId);
      if (this.currentRunId !== runId) return;
      this.chunks = [];
      this.activeChunkIndex = 0;
      this.activeWordIndex = 0;
      this.notifyState();
    }
  }

  /**
   * Sampled on every animation frame (60fps) by `<KittySpeaker />`.
   * Smoothly interpolates jaw movement (from real Neural Female PCM RMS energy when available,
   * or the syllable vowel timeline) and advances the speech bubble chunk when speech hits
   * the end of the active chunk.
   */
  public sampleLiveFrame(nowPerf: number, dt: number): {
    mouthOpen: number;
    activeWordIndex: number;
    activeChunk: MessageChunk | null;
  } {
    if (this.manualRoarBurst > 0) {
      this.manualRoarBurst = Math.max(0, this.manualRoarBurst - dt * 1.4);
    }

    if (!this.isSpeaking || (this.timelineSyllables.length === 0 && !this.activeNeuralAlignment)) {
      const idleTarget = this.manualRoarBurst * 0.75;
      this.smoothedMouthOpen += (idleTarget - this.smoothedMouthOpen) * Math.min(1, dt * 14);
      return {
        mouthOpen: this.smoothedMouthOpen,
        activeWordIndex: this.activeWordIndex,
        activeChunk: this.chunks[this.activeChunkIndex] ?? null,
      };
    }

    const elapsedMs = Math.max(0, nowPerf - this.speechStartPerf);

    // Path A: Real-time acoustic waveform lip-sync & valley-aligned chunk refresh for Neural Female TTS
    if (this.activeNeuralAlignment) {
      const align = this.activeNeuralAlignment;
      let chunkIdx = 0;
      for (let c = 0; c < align.chunkEndTimesMs.length; c++) {
        if (elapsedMs <= align.chunkEndTimesMs[c]) {
          chunkIdx = c;
          break;
        }
        chunkIdx = c;
      }

      let wordIdx = 0;
      for (const wt of align.wordTimings) {
        if (wt.chunkIndex === chunkIdx && elapsedMs >= wt.startMs) {
          wordIdx = wt.wordIndexInChunk;
        }
      }

      if (chunkIdx !== this.activeChunkIndex || wordIdx !== this.activeWordIndex) {
        this.activeChunkIndex = chunkIdx;
        this.activeWordIndex = wordIdx;
        this.notifyState();
      }

      const frameIdx = Math.min(
        align.rmsEnvelope.length - 1,
        Math.max(0, Math.floor(elapsedMs / align.frameStepMs))
      );
      const acousticOpen = align.rmsEnvelope[frameIdx] * 0.96;
      const combinedTarget = Math.max(acousticOpen, this.manualRoarBurst * 0.75);
      this.smoothedMouthOpen += (combinedTarget - this.smoothedMouthOpen) * Math.min(1, dt * 20);

      return {
        mouthOpen: this.smoothedMouthOpen,
        activeWordIndex: this.activeWordIndex,
        activeChunk: this.chunks[this.activeChunkIndex] ?? null,
      };
    }

    // Path B: Syllable-timeline lip-sync (Meow-Speak or offline Web Speech fallback)
    let activeSyl: SyllableKeyframe | null = null;
    let timelineChunkIdx = this.activeChunkIndex;
    let timelineWordIdx = this.activeWordIndex;

    for (let c = 0; c < this.chunkEndTimesMs.length; c++) {
      if (elapsedMs <= this.chunkEndTimesMs[c]) {
        timelineChunkIdx = c;
        break;
      }
      timelineChunkIdx = c;
    }

    for (const syl of this.timelineSyllables) {
      if (elapsedMs >= syl.startOffsetMs) {
        timelineChunkIdx = syl.chunkIndex;
        timelineWordIdx = syl.wordIndexInChunk;
      }
      if (elapsedMs >= syl.startOffsetMs && elapsedMs <= syl.startOffsetMs + syl.durationMs) {
        activeSyl = syl;
        break;
      }
    }

    if (!this.ttsBoundaryActive) {
      if (
        timelineChunkIdx !== this.activeChunkIndex ||
        timelineWordIdx !== this.activeWordIndex
      ) {
        this.activeChunkIndex = timelineChunkIdx;
        this.activeWordIndex = timelineWordIdx;
        this.notifyState();
      }
    }

    let rawTargetOpen = 0.14;
    if (activeSyl) {
      const phase = (elapsedMs - activeSyl.startOffsetMs) / Math.max(1, activeSyl.durationMs);
      const vowelArch = Math.sin(Math.min(1, Math.max(0, phase)) * Math.PI);
      rawTargetOpen = activeSyl.mouthOpen * (0.3 + 0.7 * vowelArch);
    }

    const combinedTarget = Math.max(rawTargetOpen, this.manualRoarBurst * 0.75);
    this.smoothedMouthOpen += (combinedTarget - this.smoothedMouthOpen) * Math.min(1, dt * 16);

    return {
      mouthOpen: this.smoothedMouthOpen,
      activeWordIndex: this.activeWordIndex,
      activeChunk: this.chunks[this.activeChunkIndex] ?? null,
    };
  }

  private waitMs(ms: number, runId: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  }

  private notifyState(): void {
    if (!this.onStateChange) return;
    this.onStateChange({
      isSpeaking: this.isSpeaking,
      chunks: this.chunks,
      activeChunkIndex: this.activeChunkIndex,
      activeChunk: this.chunks[this.activeChunkIndex] ?? null,
      activeWordIndex: this.activeWordIndex,
      mouthOpen: this.smoothedMouthOpen,
      selectedVoiceName: this.selectedVoiceName,
    });
  }
}
