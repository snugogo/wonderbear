// ============================================================================
// services/tts.js — dual-provider TTS (DashScope CosyVoice + ElevenLabs)
//
// Workorder: 2026-04-29-asr-tts-dual-provider §2.1, §3.3, §3.4
//
// Public API (UNCHANGED — callers in src/routes/story.js and others do NOT
// need to change):
//   - synthesize({ text, lang, voiceId, speed, storyId, pageNum })
//       → { audioUrl, durationMs, cached, provider?, latencyMs? }
//   - isMockMode()
//   - _clearCache()
//
// Routing:
//   - process.env.TTS_PRIMARY        ∈ {dashscope, elevenlabs}
//   - process.env.TTS_FALLBACK_CHAIN  comma-separated, e.g. "elevenlabs"
//   - process.env.TTS_TIMEOUT_MS      per-provider timeout (default 15000)
//
// Providers:
//   - dashscope  : Aliyun DashScope CosyVoice / Qwen-TTS (REST
//                  multimodal-generation/generation, returns audio.url JSON
//                  → we download the mp3/wav and return a Buffer).
//                  CosyVoice-v2 voices (longhuhu_v3 etc.) require the
//                  WebSocket path which is NOT implemented here; the REST
//                  endpoint accepts the qwen3-tts-flash family + voices like
//                  Cherry/Ethan/Serena. If env.DASHSCOPE_TTS_MODEL is set to
//                  cosyvoice-v2 the REST call may 400/InvalidParameter, in
//                  which case the provider chain falls back to ElevenLabs.
//   - elevenlabs : ElevenLabs text-to-speech with timestamps (existing
//                  implementation, unchanged behavior — returns mp3 base64).
//
// All providers return { audioBytes: Buffer, durationMs: number }. The outer
// `synthesize` wraps that into the { audioUrl, durationMs, cached } shape
// callers already use, persisting to R2 when storyId+pageNum are supplied.
// ============================================================================

import { createHash } from 'node:crypto';
import env from '../config/env.js';
import { persistAudio } from './mediaStorage.js';
import { callWithFallback, ProviderError } from '../lib/provider-chain.js';

// ----------------------------------------------------------------------------
// Mock mode (USE_MOCK_AI=1 only — do NOT auto-mock when keys are missing,
// per workorder §1 "不接受 mock 兜底"). Unit tests can still opt in.
// ----------------------------------------------------------------------------
export function isMockMode() {
  if (process.env.USE_MOCK_AI === 'true' || process.env.USE_MOCK_AI === '1') return true;
  return false;
}

// ----------------------------------------------------------------------------
// In-process cache — keyed by sha256(text|voice|lang|speed|provider-chain).
// Cached value is the post-persistence shape (R2 URL or dataURL fallback).
// ----------------------------------------------------------------------------
const cache = new Map();

function defaultElevenLabsVoiceId(lang) {
  const map = {
    en: env.VOICE_ID_EN,
    pl: env.VOICE_ID_PL,
    ro: env.VOICE_ID_RO,
    es: env.VOICE_ID_ES,
    fr: env.VOICE_ID_FR,
    zh: env.VOICE_ID_ZH,
  };
  return map[lang] || null;
}

function defaultDashScopeVoiceId(lang) {
  // workorder §3.3 voice IDs from .env
  if (lang === 'zh') return env.DASHSCOPE_TTS_VOICE_ZH;
  if (lang === 'en') return env.DASHSCOPE_TTS_VOICE_EN;
  return env.DASHSCOPE_TTS_VOICE_ZH; // safe fallback
}

function cacheKey({ text, voiceId, lang, speed, chainKey }) {
  return createHash('sha256')
    .update(`${text}|${voiceId || ''}|${lang}|${speed}|${chainKey}`)
    .digest('hex');
}

// Rough mp3 length estimate from byte size: ~16 KB ≈ 1 s at 128 kbps.
// Used only when the upstream doesn't return a duration.
function estimateMp3DurationMs(bytes) {
  const seconds = bytes / 16000;
  return Math.max(800, Math.round(seconds * 1000));
}

// ----------------------------------------------------------------------------
// Public entry point
// ----------------------------------------------------------------------------
export async function synthesize({
  text,
  lang = 'en',
  voiceId = null,
  speed = 1.0,
  storyId = null,
  pageNum = null,
}) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('tts.synthesize: text is empty');
  }
  if (text.length > 500) {
    throw new Error('tts.synthesize: text exceeds 500 chars');
  }
  if (typeof speed !== 'number' || Number.isNaN(speed)) speed = 1.0;

  const primary = (env.TTS_PRIMARY || 'dashscope').trim();
  const chain = (env.TTS_FALLBACK_CHAIN || 'elevenlabs')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const order = [primary, ...chain.filter((n) => n !== primary)];
  const chainKey = order.join('>');

  // Cache key uses the *resolved* voiceId for the primary provider so that
  // calls with no explicit voiceId share cache entries deterministically.
  const effVoiceForKey =
    voiceId ||
    (primary === 'dashscope'
      ? defaultDashScopeVoiceId(lang)
      : defaultElevenLabsVoiceId(lang)) ||
    'voice_default';

  const key = cacheKey({ text, voiceId: effVoiceForKey, lang, speed, chainKey });
  if (cache.has(key)) {
    return { ...cache.get(key), cached: true };
  }

  if (isMockMode()) {
    const result = mockSynthesize({ text, key });
    cache.set(key, result);
    return { ...result, cached: false };
  }

  const timeoutMs = env.TTS_TIMEOUT_MS || 15000;
  const providers = order.map((name) => {
    const fn = PROVIDERS[name];
    if (!fn) {
      throw new Error(
        `TTS: unknown provider "${name}". Valid: ${Object.keys(PROVIDERS).join(',')}`,
      );
    }
    return {
      name,
      timeout: timeoutMs,
      fn: (args, signal) =>
        fn({ ...args, voiceId: voiceId || resolveVoiceId(name, lang) }, signal),
    };
  });

  const { result: liveResult, provider, latencyMs, attempts } =
    await callWithFallback(providers, { text, lang, speed }, {
      kind: 'tts',
      defaultTimeoutMs: timeoutMs,
    });

  // liveResult is { audioBytes: Buffer, durationMs: number, mimeType: string }
  let audioUrl;
  if (storyId && pageNum != null) {
    try {
      const persisted = await persistAudio(liveResult.audioBytes, {
        storyId,
        pageNum,
        lang,
        voiceId: voiceId || resolveVoiceId(provider, lang) || provider,
      });
      audioUrl = persisted.persistedUrl;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[tts] persistAudio failed story=${storyId} p${pageNum} lang=${lang}: ${err?.message || err}`,
      );
      audioUrl = bufferToDataUrl(liveResult.audioBytes, liveResult.mimeType);
    }
  } else {
    // Pre-warm path / dialogue opener path — no story context yet, return
    // a data URL that callers can play directly.
    audioUrl = bufferToDataUrl(liveResult.audioBytes, liveResult.mimeType);
  }

  const cached = false;
  const result = {
    audioUrl,
    durationMs: liveResult.durationMs,
    cached,
    provider,
    latencyMs,
    attempts,
  };
  cache.set(key, { audioUrl, durationMs: liveResult.durationMs, provider, latencyMs });
  return result;
}

function resolveVoiceId(providerName, lang) {
  if (providerName === 'dashscope') return defaultDashScopeVoiceId(lang);
  if (providerName === 'elevenlabs') return defaultElevenLabsVoiceId(lang);
  return null;
}

function bufferToDataUrl(buf, mimeType = 'audio/mpeg') {
  if (!Buffer.isBuffer(buf)) throw new Error('tts: bufferToDataUrl: not a Buffer');
  return `data:${mimeType};base64,${buf.toString('base64')}`;
}

function mockSynthesize({ text, key }) {
  const durationMs = Math.max(1200, Math.round(text.length * 80));
  return {
    audioUrl: `https://mock.wonderbear.app/tts/${key.slice(0, 16)}.mp3`,
    durationMs,
  };
}

// ----------------------------------------------------------------------------
// Provider 1 — DashScope CosyVoice / Qwen-TTS via REST multimodal-generation
//
// Endpoint:
//   POST {DASHSCOPE_BASE}/api/v1/services/aigc/multimodal-generation/generation
//   Authorization: Bearer {DASHSCOPE_API_KEY}
//   Body:
//     {
//       "model": "<DASHSCOPE_TTS_MODEL>",
//       "input": {
//         "text":  "<text>",
//         "voice": "<voice id from .env>",
//         "language_type": "<Chinese|English|...>"
//       }
//     }
//   Response:
//     { output: { audio: { url, expires_at } }, ... }
//
// The returned URL is a 24h-TTL upstream wav/mp3. We download it into a
// Buffer so callers don't need to handle URL expiration.
//
// IMPORTANT: this REST endpoint backs the qwen3-tts-flash model family and
// (per Aliyun docs) the cosyvoice-v3-flash family. cosyvoice-v2 voices like
// `longhuhu_v3` are documented as WebSocket-only. If DASHSCOPE_TTS_MODEL is
// configured to cosyvoice-v2 + longhuhu_v3 the upstream will respond with an
// HTTP 400 InvalidParameter; the provider-chain treats 400 as a CLIENT error
// and the workorder explicitly forbids mock fallback, so the chain will then
// proceed to ElevenLabs (we override the 400 here to a non-client error so
// the fallback actually triggers — see explanation below).
// ----------------------------------------------------------------------------

const DASHSCOPE_BASE_INTL = 'https://dashscope-intl.aliyuncs.com';
const DASHSCOPE_BASE_CN = 'https://dashscope.aliyuncs.com';

function dashscopeBase() {
  // Allow override; default to international endpoint (Singapore region) so
  // it matches the API key Kristy provisioned.
  return env.DASHSCOPE_BASE_URL || DASHSCOPE_BASE_INTL;
}

const DASHSCOPE_LANG_TYPE = {
  zh: 'Chinese',
  en: 'English',
  pl: 'Polish',
  ro: 'Romanian',
  es: 'Spanish',
  fr: 'French',
};

async function dashscopeTts(args, signal) {
  const { text, lang, voiceId, speed } = args;
  if (!env.DASHSCOPE_API_KEY) {
    throw new ProviderError('DASHSCOPE_API_KEY not configured', {
      status: 401,
      provider: 'dashscope',
    });
  }
  const model = env.DASHSCOPE_TTS_MODEL || 'cosyvoice-v2';
  const voice = voiceId || defaultDashScopeVoiceId(lang) || 'longhuhu_v3';

  const body = {
    model,
    input: {
      text,
      voice,
      language_type: DASHSCOPE_LANG_TYPE[lang] || 'Chinese',
    },
  };
  // Speed control is an instruction-only feature in qwen-tts-instruct; for
  // generic models it's ignored. We pass it through `parameters` for
  // forward-compat — DashScope ignores unknown fields.
  if (speed && Math.abs(speed - 1.0) > 0.01) {
    body.parameters = { speech_rate: speed };
  }

  const url = `${dashscopeBase()}/api/v1/services/aigc/multimodal-generation/generation`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    // Mark 400 as NON-client-error here so the provider chain still
    // falls back to ElevenLabs. The default ProviderError treatment of 400
    // assumes "you sent garbage and the next provider will reject it too";
    // in the cosyvoice-v2-via-REST scenario the next provider (ElevenLabs)
    // genuinely *is* a different upstream and may succeed.
    throw new ProviderError(
      `DashScope TTS HTTP ${resp.status}: ${txt.slice(0, 200)}`,
      { status: resp.status, provider: 'dashscope', isClientError: false },
    );
  }
  const data = await resp.json();
  const audioUrl = data?.output?.audio?.url;
  if (!audioUrl) {
    throw new ProviderError(
      `DashScope TTS returned no audio.url: ${JSON.stringify(data).slice(0, 200)}`,
      { status: 502, provider: 'dashscope' },
    );
  }
  // Some payloads also return base64 inline. Prefer base64 to avoid an
  // extra round-trip.
  const inlineB64 = data?.output?.audio?.data;
  let audioBytes;
  let mimeType = 'audio/wav'; // multimodal-generation defaults to wav
  if (typeof inlineB64 === 'string' && inlineB64.length > 0) {
    audioBytes = Buffer.from(inlineB64, 'base64');
  } else {
    const dlResp = await fetch(audioUrl, { signal });
    if (!dlResp.ok) {
      throw new ProviderError(
        `DashScope TTS audio download HTTP ${dlResp.status}`,
        { status: dlResp.status, provider: 'dashscope' },
      );
    }
    const ct = dlResp.headers.get('content-type') || '';
    if (/wav/i.test(ct)) mimeType = 'audio/wav';
    else if (/mpeg|mp3/i.test(ct)) mimeType = 'audio/mpeg';
    audioBytes = Buffer.from(await dlResp.arrayBuffer());
  }
  if (!audioBytes || audioBytes.length === 0) {
    throw new ProviderError('DashScope TTS audio is empty', {
      status: 502,
      provider: 'dashscope',
    });
  }
  const durationMs = estimateMp3DurationMs(audioBytes.length);
  return { audioBytes, durationMs, mimeType };
}

// ----------------------------------------------------------------------------
// Provider 2 — ElevenLabs text-to-speech with timestamps (existing path)
//
// Returns mp3 base64 plus character-level timestamps; we use the last
// `character_end_times_seconds` entry as the duration when available.
// ----------------------------------------------------------------------------

async function elevenlabsTts(args, signal) {
  const { text, voiceId, speed, lang } = args;
  if (!env.ELEVENLABS_API_KEY) {
    throw new ProviderError('ELEVENLABS_API_KEY not configured', {
      status: 401,
      provider: 'elevenlabs',
    });
  }
  const voice = voiceId || defaultElevenLabsVoiceId(lang) || 'voice_default';
  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps`,
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
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          speed: typeof speed === 'number' ? speed : 1.0,
        },
      }),
      signal,
    },
  );
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new ProviderError(
      `ElevenLabs HTTP ${resp.status}: ${txt.slice(0, 200)}`,
      { status: resp.status, provider: 'elevenlabs' },
    );
  }
  const data = await resp.json();
  const b64 = data?.audio_base64 || '';
  if (!b64) {
    throw new ProviderError('ElevenLabs returned empty audio_base64', {
      status: 502,
      provider: 'elevenlabs',
    });
  }
  const audioBytes = Buffer.from(b64, 'base64');
  const lastEnd = data?.alignment?.character_end_times_seconds?.at(-1);
  const durationMs =
    typeof lastEnd === 'number' && lastEnd > 0
      ? Math.round(lastEnd * 1000)
      : estimateMp3DurationMs(audioBytes.length);
  return { audioBytes, durationMs, mimeType: 'audio/mpeg' };
}

// ----------------------------------------------------------------------------
// Provider registry
// ----------------------------------------------------------------------------
const PROVIDERS = {
  dashscope: dashscopeTts,
  elevenlabs: elevenlabsTts,
};

// ----------------------------------------------------------------------------
// Test-only helpers
// ----------------------------------------------------------------------------
export function _clearCache() {
  cache.clear();
}

export const __test__ = {
  dashscopeTts,
  elevenlabsTts,
  defaultElevenLabsVoiceId,
  defaultDashScopeVoiceId,
  bufferToDataUrl,
  estimateMp3DurationMs,
};
