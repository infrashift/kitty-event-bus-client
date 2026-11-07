// @ts-check
/**
 * `kittyTtsProxy()` — a dev-only Vite plugin (also works in Astro via `vite.plugins`) that serves
 * `…/api/tts?tl=<lang>&text=<message>` by proxying Google's neural TTS (`translate_tts`) and
 * returning one continuous MP3 that KITTY decodes with the Web Audio API for lip-sync.
 *
 * Static hosts (GitHub Pages, etc.) don't run this: there KITTY plays the pre-synthesized
 * MP3s from the package's `dist/tts/` folder, or falls back to the browser's Web Speech API.
 *
 *   import { kittyTtsProxy } from 'kitty-event-bus-client/vite';
 *   export default defineConfig({ plugins: [vue(), kittyTtsProxy()] });
 *
 * Shipped as plain ESM with JSDoc types so it needs no build step.
 */

/**
 * Splits a long text into natural sentence/clause segments <= `maxLen` chars
 * (the `translate_tts` endpoint rejects longer inputs).
 * @param {string} text
 * @param {number} [maxLen]
 * @returns {string[]}
 */
export function splitTextForNeuralTts(text, maxLen = 185) {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];

  /** @type {string[]} */
  const segments = [];
  let remaining = cleaned;

  while (remaining.length > maxLen) {
    const slice = remaining.slice(0, maxLen);
    // Prefer breaking at sentence punctuation (. ! ?), then clause punctuation (, ; :), then space
    let splitIdx = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
    if (splitIdx > 40) {
      splitIdx += 1; // keep punctuation with first part
    } else {
      splitIdx = Math.max(slice.lastIndexOf(', '), slice.lastIndexOf('; '), slice.lastIndexOf(': '));
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

/** Matches `/api/tts` at the end of the path, under any base path (e.g. `/kitty-event-bus-client/api/tts`). */
const TTS_ROUTE = /(?:^|\/)api\/tts$/;

/**
 * @param {{ cacheSize?: number, timeoutMs?: number }} [options]
 * @returns {import('vite').Plugin}
 */
export function kittyTtsProxy(options = {}) {
  const { cacheSize = 150, timeoutMs = 2500 } = options;
  /** @type {Map<string, Buffer>} */
  const audioCache = new Map();

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {() => void} next
   */
  const handleTtsRequest = async (req, res, next) => {
    const urlObj = new URL(req.url ?? '/', 'http://localhost');
    if (!TTS_ROUTE.test(urlObj.pathname)) {
      next();
      return;
    }

    try {
      const rawText = (urlObj.searchParams.get('text') || '').trim();
      const tl = (urlObj.searchParams.get('tl') || 'en-US').trim();

      if (!rawText) {
        res.statusCode = 400;
        res.end('Missing text parameter');
        return;
      }

      const cacheKey = `${tl}::${rawText}`;
      let combined = audioCache.get(cacheKey);

      if (!combined) {
        /** @type {Buffer[]} */
        const buffers = [];
        for (const seg of splitTextForNeuralTts(rawText, 185)) {
          const ttsUrl = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(seg)}`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const upstream = await fetch(ttsUrl, {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              },
              signal: controller.signal,
            });
            if (!upstream.ok) throw new Error(`Upstream TTS HTTP ${upstream.status}`);
            buffers.push(Buffer.from(await upstream.arrayBuffer()));
          } finally {
            clearTimeout(timeout);
          }
        }

        combined = Buffer.concat(buffers);
        if (audioCache.size > cacheSize) {
          const oldestKey = audioCache.keys().next().value;
          if (oldestKey) audioCache.delete(oldestKey);
        }
        audioCache.set(cacheKey, combined);
      }

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
    name: 'kitty-neural-tts-proxy',
    configureServer(server) {
      server.middlewares.use(handleTtsRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleTtsRequest);
    },
  };
}

export default kittyTtsProxy;
