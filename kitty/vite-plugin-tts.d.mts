import type { Plugin } from 'vite';

/** Splits text into <= maxLen segments at sentence/clause boundaries. */
export declare function splitTextForNeuralTts(text: string, maxLen?: number): string[];

/** Dev-only Vite plugin serving `…/api/tts?tl=&text=` via Google neural TTS. */
export declare function kittyTtsProxy(options?: { cacheSize?: number; timeoutMs?: number }): Plugin;

export default kittyTtsProxy;
