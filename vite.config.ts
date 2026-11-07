import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Splits a long text into natural sentence/clause segments <= 185 chars
 * for Google Neural TTS (`translate_tts`) synthesis.
 */
function splitTextForNeuralTts(text: string, maxLen = 185): string[] {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];

  const segments: string[] = [];
  let remaining = cleaned;

  while (remaining.length > maxLen) {
    const slice = remaining.slice(0, maxLen);
    // Prefer breaking at sentence punctuation (. ! ?), then clause punctuation (, ; :), then space
    let splitIdx = Math.max(
      slice.lastIndexOf('. '),
      slice.lastIndexOf('! '),
      slice.lastIndexOf('? ')
    );
    if (splitIdx > 40) {
      splitIdx += 1; // keep punctuation with first part
    } else {
      splitIdx = Math.max(
        slice.lastIndexOf(', '),
        slice.lastIndexOf('; '),
        slice.lastIndexOf(': ')
      );
      if (splitIdx > 40) {
        splitIdx += 1;
      } else {
        splitIdx = slice.lastIndexOf(' ');
      }
    }

    if (splitIdx <= 0) splitIdx = maxLen;
    segments.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }

  if (remaining) segments.push(remaining);
  return segments;
}

/**
 * Vite middleware plugin that proxies `/api/tts?text=...` to Google's Neural Female TTS
 * (`translate.googleapis.com/translate_tts`), returning a smooth, continuous MP3 audio stream
 * that `<KittySpeaker />` decodes via Web Audio API for natural human speech & waveform lip-sync.
 */
function neuralFemaleTtsPlugin(): Plugin {
  const audioCache = new Map<string, Buffer>();

  const handleTtsRequest = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url || !req.url.startsWith('/api/tts')) {
      next();
      return;
    }

    try {
      const urlObj = new URL(req.url, 'http://localhost');
      const rawText = (urlObj.searchParams.get('text') || '').trim();
      const tl = (urlObj.searchParams.get('tl') || 'en-US').trim();

      if (!rawText) {
        res.statusCode = 400;
        res.end('Missing text parameter');
        return;
      }

      const cacheKey = `${tl}::${rawText}`;
      const cached = audioCache.get(cacheKey);
      if (cached) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.end(cached);
        return;
      }

      const segments = splitTextForNeuralTts(rawText, 185);
      const buffers: Buffer[] = [];

      for (const seg of segments) {
        const ttsUrl = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(seg)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);

        try {
          const upstream = await fetch(ttsUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            },
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (!upstream.ok) {
            throw new Error(`Upstream TTS HTTP ${upstream.status}`);
          }
          const arrBuf = await upstream.arrayBuffer();
          buffers.push(Buffer.from(arrBuf));
        } finally {
          clearTimeout(timeout);
        }
      }

      const combined = Buffer.concat(buffers);
      if (audioCache.size > 150) {
        const oldestKey = audioCache.keys().next().value;
        if (oldestKey) audioCache.delete(oldestKey);
      }
      audioCache.set(cacheKey, combined);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.end(combined);
    } catch {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Neural TTS unavailable, falling back to Web Speech API' }));
    }
  };

  return {
    name: 'kitty-neural-female-tts',
    configureServer(server) {
      server.middlewares.use(handleTtsRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleTtsRequest);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss(), neuralFemaleTtsPlugin()],
  server: {
    port: 4321,
    host: '0.0.0.0',
  },
  preview: {
    port: 4322,
    host: '127.0.0.1',
  },
});
