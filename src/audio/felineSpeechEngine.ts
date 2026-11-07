import type { EventSeverity } from '../events/cloudevents';

export type VoiceMode = 'both' | 'meow' | 'tts';

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
 * Formant filter table for smooth feminine feline vowel vocalization:
 * Maps English vowel classes to F1/F2 bandpass center frequencies and jaw openness.
 */
const VOWEL_FORMANTS: Record<
  'a' | 'e' | 'i' | 'o' | 'u',
  { f1: number; f2: number; open: number }
> = {
  a: { f1: 1280, f2: 2120, open: 0.92 }, // Warm open "aa"
  e: { f1: 880, f2: 2420, open: 0.72 },  // Mid-front "eh"
  i: { f1: 610, f2: 2680, open: 0.50 },  // Soft high "ee"
  o: { f1: 810, f2: 1460, open: 0.82 },  // Rounded "oh"
  u: { f1: 560, f2: 1260, open: 0.55 },  // Gentle "oo"
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
  options: { severity?: EventSeverity; minChunkMs?: number } = {}
): {
  syllables: SyllableKeyframe[];
  chunkEndTimesMs: number[];
  totalDurationMs: number;
} {
  const severity = options.severity ?? 'info';
  const syllables: SyllableKeyframe[] = [];
  const chunkEndTimesMs: number[] = [];

  let cursorMs = 0;
  const isUrgent = severity === 'critical' || severity === 'error';
  // Warm, feminine melodic fundamental pitch (around A4–C5)
  const basePitch = isUrgent ? 520 : severity === 'warning' ? 480 : 440;

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

        const formant = VOWEL_FORMANTS[vowel];
        const isStressed = s === 0;
        const endsExclaim = rawWord.endsWith('!');
        const endsQuestion = rawWord.endsWith('?');

        // Gentle, musical prosody curve across the phrase
        const phraseProgress = wordIdxInChunk / Math.max(1, chunk.words.length - 1);
        const phraseArch = Math.sin(phraseProgress * Math.PI) * 28;
        const inflection = endsQuestion ? 60 : endsExclaim ? 40 : isStressed ? 18 : -10;
        const pitchHz = Math.max(360, Math.min(680, basePitch + phraseArch + inflection));

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
 * Selects the clearest, most natural female English voice from the browser's
 * `window.speechSynthesis.getVoices()` list, prioritizing Neural / Natural / Online
 * and Google / Apple high-clarity female voices over local formant voices.
 */
export function selectPreferredFemaleVoice(
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  const englishVoices = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  const pool = englishVoices.length > 0 ? englishVoices : voices;

  // Tier 1: Neural / Natural / Online / Premium Female Voices
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

  // Tier 2: Clear OS Female Voices
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
    /\+f[2345]/i, // espeak-ng female voice variants on Linux
    /female/i,
    /woman/i,
  ];

  for (const pattern of tier2FemalePatterns) {
    const match = pool.find((v) => pattern.test(v.name));
    if (match) return match;
  }

  // Tier 3: Prefer any non-espeak natural English voice
  const naturalEn = pool.find((v) => /^en-(US|GB|AU|IE)/i.test(v.lang) && !/espeak/i.test(v.name));
  if (naturalEn) return naturalEn;

  return pool[0] ?? null;
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
  public selectedVoiceName = 'Neural Female TTS';

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
    this.timelineSyllables = [];
    this.ttsBoundaryActive = false;
    this.notifyState();
  }

  /**
   * Plays a strong, unmistakable synthesized feline vocalization (modeled on `../patience`):
   * - If `isMadScream` is true: fierce, vibrating mad-cat yowl + hiss
   * - Otherwise: strong, expressive double-formant melodic cat "Mee-aa-o-ww!"
   */
  public playCatVocalization(
    soundEnabled: boolean,
    isMadScream = false,
    durationScale = 1.0
  ): void {
    this.manualRoarBurst = 1.0;
    if (!soundEnabled) return;
    const actx = this.ensureAudioContext();
    if (!actx) return;

    this.triggerSingleStrongMeow(actx, actx.currentTime, {
      durationSec: (isMadScream ? 1.15 : 0.82) * durationScale,
      isMadScream,
      pitchScale: 1.0,
      peakGain: isMadScream ? 0.28 : 0.26,
    });
  }

  /**
   * Synthesizes a single strong, full-bodied cat meow ("Mee-aa-o-ww!") or fierce yowl
   * at `startTime` on the Web Audio graph using dual sawtooth+triangle vocal cords,
   * larynx vibrato LFO, and resonant M-EE-AA-O-W bandpass formant sweeps.
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
    }
  ): void {
    const dur = Math.max(0.38, opts.durationSec);
    const isMad = Boolean(opts.isMadScream);
    const pScale = opts.pitchScale ?? 1.0;
    const peakGain = opts.peakGain ?? (isMad ? 0.28 : 0.26);
    const inflection = opts.inflection ?? 'statement';

    // Feline vocal cord source: sawtooth + slightly detuned triangle for authentic cat rasp & body
    const osc1 = actx.createOscillator();
    const osc2 = actx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'triangle';

    // Larynx vibrato LFO
    const lfo = actx.createOscillator();
    const lfoGain = actx.createGain();
    lfo.frequency.setValueAtTime(isMad ? 25 : 7.8, startTime);
    lfoGain.gain.setValueAtTime(isMad ? 40 : 13, startTime);
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    // Feline Vocal Tract Formant Filters (High-Q resonant nasal/oral cavities)
    const formant1 = actx.createBiquadFilter();
    formant1.type = 'bandpass';
    formant1.Q.setValueAtTime(isMad ? 3.6 : 5.2, startTime);

    const formant2 = actx.createBiquadFilter();
    formant2.type = 'bandpass';
    formant2.Q.setValueAtTime(isMad ? 3.5 : 4.0, startTime);

    const masterGain = actx.createGain();

    if (isMad) {
      // Fierce Mad-Cat Yowl ("YAA-OOWW-RRR!") + Hiss
      const startF = 520 * pScale;
      const peak1F = 980 * pScale;
      const midF = 760 * pScale;
      const peak2F = 1040 * pScale;
      const endF = 440 * pScale;

      osc1.frequency.setValueAtTime(startF, startTime);
      osc1.frequency.exponentialRampToValueAtTime(peak1F, startTime + dur * 0.18);
      osc1.frequency.exponentialRampToValueAtTime(midF, startTime + dur * 0.52);
      osc1.frequency.exponentialRampToValueAtTime(peak2F, startTime + dur * 0.76);
      osc1.frequency.exponentialRampToValueAtTime(endF, startTime + dur);

      osc2.frequency.setValueAtTime(startF + 4, startTime);
      osc2.frequency.exponentialRampToValueAtTime(peak1F + 6, startTime + dur * 0.18);
      osc2.frequency.exponentialRampToValueAtTime(endF + 4, startTime + dur);

      formant1.frequency.setValueAtTime(900, startTime);
      formant1.frequency.exponentialRampToValueAtTime(1880, startTime + dur * 0.24);
      formant1.frequency.exponentialRampToValueAtTime(1120, startTime + dur * 0.72);
      formant1.frequency.exponentialRampToValueAtTime(660, startTime + dur);

      formant2.frequency.setValueAtTime(2200, startTime);
      formant2.frequency.exponentialRampToValueAtTime(3200, startTime + dur * 0.28);
      formant2.frequency.exponentialRampToValueAtTime(1700, startTime + dur);

      masterGain.gain.setValueAtTime(0.001, startTime);
      masterGain.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.05, dur * 0.1));
      masterGain.gain.setValueAtTime(peakGain * 0.92, startTime + dur * 0.72);
      masterGain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
    } else {
      // Strong, unmistakable Cat Meow ("MEE-AA-OO-WW!")
      const startF = 465 * pScale;
      const peakF = (inflection === 'exclaim' ? 860 : inflection === 'question' ? 830 : 795) * pScale;
      const sustainF = (inflection === 'question' ? 760 : 655) * pScale;
      const endF = (inflection === 'question' ? 590 : 385) * pScale;

      osc1.frequency.setValueAtTime(startF, startTime);
      osc1.frequency.exponentialRampToValueAtTime(peakF, startTime + dur * 0.26);
      osc1.frequency.exponentialRampToValueAtTime(sustainF, startTime + dur * 0.62);
      osc1.frequency.exponentialRampToValueAtTime(endF, startTime + dur);

      osc2.frequency.setValueAtTime(startF + 3.5, startTime);
      osc2.frequency.exponentialRampToValueAtTime(peakF + 4.5, startTime + dur * 0.26);
      osc2.frequency.exponentialRampToValueAtTime(sustainF + 3.5, startTime + dur * 0.62);
      osc2.frequency.exponentialRampToValueAtTime(endF + 2.5, startTime + dur);

      // Classic feline mouth opening & closing vowel sweep: "M-ee-aa-o-w"
      formant1.frequency.setValueAtTime(650, startTime);
      formant1.frequency.exponentialRampToValueAtTime(1600, startTime + dur * 0.28);
      formant1.frequency.exponentialRampToValueAtTime(1180, startTime + dur * 0.65);
      formant1.frequency.exponentialRampToValueAtTime(780, startTime + dur);

      formant2.frequency.setValueAtTime(1800, startTime);
      formant2.frequency.exponentialRampToValueAtTime(2720, startTime + dur * 0.28);
      formant2.frequency.exponentialRampToValueAtTime(1950, startTime + dur * 0.65);
      formant2.frequency.exponentialRampToValueAtTime(1350, startTime + dur);

      masterGain.gain.setValueAtTime(0.001, startTime);
      masterGain.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.06, dur * 0.12));
      masterGain.gain.setValueAtTime(peakGain * 0.9, startTime + dur * 0.58);
      masterGain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
    }

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
    severity: EventSeverity
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
          });

          meowCount += 1;
        }

        wIdx = groupEndWIdx + 1;
      }
    }
  }

  /**
   * Fetches and decodes a studio-grade Neural Female TTS audio buffer from `/api/tts`
   * (backed by Google Neural Female TTS in `vite.config.ts`).
   * Automatically skips network calls in headless WebDriver test runners or when offline.
   */
  private async fetchAndDecodeNeuralSpeech(spokenText: string): Promise<AudioBuffer | null> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
    // Skip remote neural fetch in automated headless Playwright tests so offline sandbox tests run instantaneously
    if (navigator.webdriver) return null;

    const actx = this.ensureAudioContext();
    if (!actx) return null;

    const cached = this.neuralBufferCache.get(spokenText);
    if (cached) return cached;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2200);
    try {
      const resp = await fetch(`/api/tts?tl=en-US&text=${encodeURIComponent(spokenText)}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) return null;

      const arrBuf = await resp.arrayBuffer();
      if (!arrBuf || arrBuf.byteLength < 256) return null;

      const audioBuffer = await actx.decodeAudioData(arrBuf.slice(0));
      if (this.neuralBufferCache.size > 60) {
        const firstKey = this.neuralBufferCache.keys().next().value;
        if (firstKey) this.neuralBufferCache.delete(firstKey);
      }
      this.neuralBufferCache.set(spokenText, audioBuffer);
      return audioBuffer;
    } catch {
      clearTimeout(timer);
      return null;
    }
  }

  /**
   * Pre-warms the Neural Female TTS audio cache in the background for instant zero-latency playback.
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
          this.fetchAndDecodeNeuralSpeech(spokenText).catch(() => {});
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
   * Plays a decoded Neural Female `AudioBuffer` through a warm vocal presence filter
   * on the Web Audio graph and resolves when playback completes.
   */
  private playDecodedNeuralSpeech(audioBuffer: AudioBuffer, runId: number): Promise<void> {
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

        // Warm vocal presence EQ: gentle low-mid warmth at 240 Hz + smooth high-shelf air
        const warmthFilter = actx.createBiquadFilter();
        warmthFilter.type = 'peaking';
        warmthFilter.frequency.setValueAtTime(240, actx.currentTime);
        warmthFilter.Q.setValueAtTime(1.1, actx.currentTime);
        warmthFilter.gain.setValueAtTime(2.2, actx.currentTime);

        const deHarshFilter = actx.createBiquadFilter();
        deHarshFilter.type = 'lowpass';
        deHarshFilter.frequency.setValueAtTime(9200, actx.currentTime);

        const gainNode = actx.createGain();
        gainNode.gain.setValueAtTime(1.0, actx.currentTime);

        source.connect(warmthFilter);
        warmthFilter.connect(deHarshFilter);
        deHarshFilter.connect(gainNode);
        gainNode.connect(actx.destination);

        source.onended = () => {
          if (this.currentRunId === runId) finish();
          else finish();
        };

        this.activeOscillators.push(source);
        this.activeNodes.push(warmthFilter, deHarshFilter, gainNode);

        this.speechStartPerf = performance.now();
        source.start(0);
      } catch {
        finish();
      }
    });
  }

  /**
   * Fallback Web Speech API synthesizer when offline or in headless test environments:
   * Uses normalized conversational text and native `pitch = 1.0`, `rate = 1.0` to avoid
   * browser phase-vocoder pitch-shifting distortion.
   */
  private speakContinuousWebSpeech(
    chunks: MessageChunk[],
    soundEnabled: boolean,
    _severity: EventSeverity,
    expectedDurationMs: number,
    runId: number
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
          const bestVoice = this.preferredVoice || selectPreferredFemaleVoice(voices);
          if (bestVoice) {
            this.preferredVoice = bestVoice;
            this.selectedVoiceName = bestVoice.name;
          }

          const utterance = new SpeechSynthesisUtterance(spokenText);
          if (bestVoice) {
            utterance.voice = bestVoice;
            utterance.lang = bestVoice.lang || 'en-US';
          } else {
            utterance.lang = 'en-US';
          }

          // Use native 1.0 pitch and 1.0 rate on female voices so the browser's PSOLA
          // time-stretcher/pitch-shifter never introduces metallic phase warble!
          const isEspeakGeneric =
            bestVoice && /espeak/i.test(bestVoice.name) && !/\+f/i.test(bestVoice.name);
          utterance.rate = 1.0;
          utterance.pitch = isEspeakGeneric ? 1.15 : 1.0;
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
   * Speaks a full CloudEvent message with smooth neural female speech (and automatic
   * offline fallback) plus speech-synced bubble chunk refreshes.
   */
  public async speakMessage(
    message: string,
    options: {
      voiceMode: VoiceMode;
      soundEnabled: boolean;
      severity?: EventSeverity;
      maxWordsPerChunk?: number;
      maxCharsPerChunk?: number;
      minChunkMs?: number;
      msPerWord?: number;
    }
  ): Promise<void> {
    const runId = ++this.currentRunId;
    this.stopActiveAudio();
    this.activeNeuralAlignment = null;

    const severity = options.severity ?? 'info';
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

    // Start fetching the Neural Female TTS audio buffer concurrently during the initial cat meow preamble!
    const wantsHumanVoice =
      options.soundEnabled && (options.voiceMode === 'tts' || options.voiceMode === 'both');
    const normalizedFullText = normalizeTextForSmoothSpeech(chunks.map((c) => c.text).join(' '));
    const neuralFetchPromise = wantsHumanVoice
      ? this.fetchAndDecodeNeuralSpeech(normalizedFullText)
      : Promise.resolve(null);

    // Cue preamble:
    // - On high-severity alerts: fierce mad-cat yowl before speaking
    // - In 'both' mode on normal events: a strong, classic cat meow before the clear female voice speaks
    if (severity === 'critical' || severity === 'error') {
      this.playCatVocalization(options.soundEnabled, true, 0.85);
      await this.waitMs(360, runId);
      if (this.currentRunId !== runId) return;
    } else if (options.voiceMode === 'both') {
      this.playCatVocalization(options.soundEnabled, false, 0.7);
      await this.waitMs(340, runId);
      if (this.currentRunId !== runId) return;
    }

    const { syllables, chunkEndTimesMs, totalDurationMs } = buildMessageSyllableTimeline(chunks, {
      severity,
      minChunkMs: options.minChunkMs ?? 1400,
    });

    this.timelineSyllables = syllables;
    this.chunkEndTimesMs = chunkEndTimesMs;
    this.speechStartPerf = performance.now();

    if (options.voiceMode === 'meow') {
      this.scheduleStrongMeowSpeak(chunks, syllables, options.soundEnabled, severity);
      await this.waitMs(totalDurationMs, runId);
    } else {
      // Try playing the studio-grade Neural Female AudioBuffer first;
      // if offline or in headless test mode, fall back seamlessly to Web Speech API + syllable timeline
      const neuralBuffer = await neuralFetchPromise;
      if (this.currentRunId !== runId) return;

      if (neuralBuffer) {
        this.selectedVoiceName = 'Google Neural Female (en-US)';
        const alignment = this.alignNeuralAudioToChunks(neuralBuffer, chunks);
        this.activeNeuralAlignment = alignment;
        this.chunkEndTimesMs = alignment.chunkEndTimesMs;
        this.notifyState();
        await this.playDecodedNeuralSpeech(neuralBuffer, runId);
      } else {
        const ttsPromise = wantsHumanVoice
          ? this.speakContinuousWebSpeech(
              chunks,
              options.soundEnabled,
              severity,
              totalDurationMs,
              runId
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
