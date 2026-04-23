// ============================================================================
// services/tts.js — ElevenLabs TTS with mock fallback
//
// Public API:
//   - synthesize({ text, lang, voiceId, speed }) → { audioUrl, durationMs, cached }
//   - isMockMode()
//
// Mock mode (default when ELEVENLABS_API_KEY missing): returns stable stub URL
// whose path encodes (text hash + voice + speed) so tests can assert caching.
// ============================================================================

import { createHash } from 'node:crypto';
import env from '../config/env.js';

export function isMockMode() {
  if (process.env.USE_MOCK_AI === 'true' || process.env.USE_MOCK_AI === '1') return true;
  if (!env.ELEVENLABS_API_KEY) return true;
  return false;
}

// Simple in-process cache — keyed by sha256(text|voice|lang|speed).
// Real deployment will use R2 + signed URLs; Phase 1 is mock-only.
const cache = new Map();

function defaultVoiceId(lang) {
  const map = {
    en: env.VOICE_ID_EN,
    pl: env.VOICE_ID_PL,
    ro: env.VOICE_ID_RO,
    zh: env.VOICE_ID_ZH,
  };
  return map[lang] || null;
}

function cacheKey({ text, voiceId, lang, speed }) {
  const h = createHash('sha256')
    .update(`${text}|${voiceId || ''}|${lang}|${speed}`)
    .digest('hex');
  return h;
}

/**
 * @param {object} args
 * @param {string} args.text               max 500 chars
 * @param {'zh'|'en'|'pl'|'ro'} args.lang
 * @param {string} [args.voiceId]
 * @param {number} [args.speed=1.0]
 * @returns {Promise<{ audioUrl:string, durationMs:number, cached:boolean }>}
 */
export async function synthesize({ text, lang = 'en', voiceId = null, speed = 1.0 }) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('tts.synthesize: text is empty');
  }
  if (text.length > 500) {
    throw new Error('tts.synthesize: text exceeds 500 chars');
  }
  const effVoice = voiceId || defaultVoiceId(lang) || 'voice_default';
  const key = cacheKey({ text, voiceId: effVoice, lang, speed });
  if (cache.has(key)) {
    return { ...cache.get(key), cached: true };
  }

  const result = isMockMode()
    ? await mockSynthesize({ text, lang, voiceId: effVoice, speed, key })
    : await liveSynthesize({ text, lang, voiceId: effVoice, speed, key });

  cache.set(key, result);
  return { ...result, cached: false };
}

function mockSynthesize({ text, key }) {
  const durationMs = Math.max(1200, Math.round(text.length * 80));
  return {
    audioUrl: `https://mock.wonderbear.app/tts/${key.slice(0, 16)}.mp3`,
    durationMs,
  };
}

async function liveSynthesize({ text, voiceId, speed }) {
  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed },
      }),
    },
  );
  if (!resp.ok) throw new Error(`ElevenLabs HTTP ${resp.status}`);
  const data = await resp.json();
  const audioBase64 = data?.audio_base64 || '';
  // In production we'd upload this to R2 and return a signed URL. For Phase 1
  // we return a data URL so the contract type is preserved.
  return {
    audioUrl: `data:audio/mpeg;base64,${audioBase64}`,
    durationMs: Math.round((data?.alignment?.character_end_times_seconds?.at(-1) ?? 1.2) * 1000),
  };
}

// For tests
export function _clearCache() {
  cache.clear();
}
