// ============================================================================
// services/staticTtsCache.js — boot-time TTS pre-warming for dialogue openers
//
// Pre-renders all (lang × opener) combos from dialoguePromptPool at server
// start. /dialogue/start then serves a cached URL with zero extra latency
// instead of making a live TTS call in the request path.
//
// Boot cost: 20 TTS calls concurrently (4 langs × 5 openers).
// If any call fails the cache slot stays null — the route falls back to
// live synthesis as before, non-fatal.
// ============================================================================

import { iterateAllOpeners } from '../data/dialoguePromptPool.js';
import { synthesize } from './tts.js';

// Map key: `${lang}:${index}` → audioUrl string
const openerCache = new Map();

export async function preheatAll() {
  const entries = [...iterateAllOpeners()];
  const results = await Promise.allSettled(
    entries.map(async ({ lang, index, text }) => {
      const { audioUrl } = await synthesize({ text, lang });
      openerCache.set(`${lang}:${index}`, audioUrl);
      return `${lang}:${index}`;
    }),
  );
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const fail = results.filter((r) => r.status === 'rejected').length;
  return { total: entries.length, ok, fail };
}

export function getOpenerTtsUrl(lang, index) {
  return openerCache.get(`${lang}:${index}`) ?? null;
}
