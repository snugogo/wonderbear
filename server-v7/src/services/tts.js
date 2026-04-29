// ============================================================================
// services/tts.js — dual-provider TTS (DashScope CosyVoice + ElevenLabs)
//
// Workorders:
//   - 2026-04-29-asr-tts-dual-provider     §2.1, §3.3, §3.4 (provider chain)
//   - 2026-04-29-cosyvoice-websocket       (WebSocket for cosyvoice-v2)
//   - 2026-04-29-tts-three-voice-roles     (3 purposes: narration/dialogue/vocab,
//                                           each with its own model + voice)
//
// Public API:
//   - synthesize({ text, lang, voiceId, speed, storyId, pageNum, purpose })
//       → { audioUrl, durationMs, cached, provider?, latencyMs? }
//       purpose ∈ { 'narration' (default) | 'dialogue' | 'vocab' }
//   - isMockMode()
//   - _clearCache()
//
// Routing:
//   - process.env.TTS_PRIMARY        ∈ {dashscope, elevenlabs}
//   - process.env.TTS_FALLBACK_CHAIN  comma-separated, e.g. "elevenlabs"
//   - process.env.TTS_TIMEOUT_MS      per-provider timeout (default 15000)
//
// Providers:
//   - dashscope  : Aliyun DashScope CosyVoice via WebSocket
//                  (wss://dashscope.aliyuncs.com/api-ws/v1/inference/).
//                  Workorder 2026-04-29-cosyvoice-websocket — REST was
//                  replaced with WebSocket because cosyvoice-v2 voices like
//                  longhuhu_v3 are documented as WebSocket-only. Returns an
//                  mp3 Buffer (format=mp3, sample_rate=22050).
//   - elevenlabs : ElevenLabs text-to-speech with timestamps (existing
//                  implementation, unchanged behavior — returns mp3 base64).
//
// All providers return { audioBytes: Buffer, durationMs: number }. The outer
// `synthesize` wraps that into the { audioUrl, durationMs, cached } shape
// callers already use, persisting to R2 when storyId+pageNum are supplied.
// ============================================================================

import { createHash, randomUUID } from 'node:crypto';
import WebSocket from 'ws';
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

// ----------------------------------------------------------------------------
// Per-purpose voice + model resolver — workorder 2026-04-29-tts-three-voice-roles
//
// Three purposes, each with its own model + per-language voice:
//   - narration : 12-page story narration   (cosyvoice-v2 + longxiaoxia_v2)
//   - dialogue  : 小熊 dialogue / Q&A        (cosyvoice-v3-flash + longhuhu_v3)
//   - vocab     : single-word vocab readout  (cosyvoice-v2 + longxiaoxia_v2)
//
// Reads from process.env directly (NOT env.js) so that new fields don't
// require an env.js change (red line: don't touch src/config/env.js). New
// field names take precedence; missing → fall back to legacy fields:
//   - DASHSCOPE_TTS_VOICE_ZH / EN / VOCAB
//   - DASHSCOPE_TTS_MODEL
// ----------------------------------------------------------------------------
const VALID_PURPOSES = new Set(['narration', 'dialogue', 'vocab']);

function resolvePurposeConfig(purpose, lang) {
  const p = VALID_PURPOSES.has(purpose) ? purpose : 'narration';
  const upPurpose = p.toUpperCase();
  const upLang = (lang === 'en' ? 'EN' : 'ZH'); // any non-en treated as zh

  // ---- model ----
  const newModel = process.env[`DASHSCOPE_TTS_MODEL_${upPurpose}`];
  const legacyModel = env.DASHSCOPE_TTS_MODEL;
  const model = newModel || legacyModel || 'cosyvoice-v2';

  // ---- voice ----
  // New per-purpose, per-lang field takes precedence.
  const newVoice = process.env[`DASHSCOPE_TTS_VOICE_${upPurpose}_${upLang}`];

  // Legacy fallback — vocab had its own legacy field; narration/dialogue
  // share the lang-specific legacy fields.
  let legacyVoice;
  if (p === 'vocab') {
    legacyVoice = env.DASHSCOPE_TTS_VOICE_VOCAB || defaultDashScopeVoiceId(lang);
  } else {
    legacyVoice = defaultDashScopeVoiceId(lang);
  }
  const voice = newVoice || legacyVoice || 'longxiaoxia_v2';

  return { model, voice, purpose: p };
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
  purpose = 'narration',
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

  // Resolve per-purpose model + voice for DashScope. ElevenLabs keeps its
  // existing voice mapping (purpose-agnostic).
  const dashscopeCfg = resolvePurposeConfig(purpose, lang);

  // Cache key uses the *resolved* voiceId for the primary provider so that
  // calls with no explicit voiceId share cache entries deterministically.
  const effVoiceForKey =
    voiceId ||
    (primary === 'dashscope'
      ? dashscopeCfg.voice
      : defaultElevenLabsVoiceId(lang)) ||
    'voice_default';

  // Include purpose+model in cache key so narration/dialogue/vocab don't
  // collide on the same text.
  const key = cacheKey({
    text,
    voiceId: effVoiceForKey,
    lang,
    speed,
    chainKey: `${chainKey}|${dashscopeCfg.purpose}|${dashscopeCfg.model}`,
  });
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
      fn: (args, signal) => {
        // Per-provider voice + (DashScope-only) model resolution.
        const providerArgs = {
          ...args,
          voiceId:
            voiceId ||
            (name === 'dashscope'
              ? dashscopeCfg.voice
              : resolveVoiceId(name, lang)),
        };
        if (name === 'dashscope') {
          providerArgs.model = dashscopeCfg.model;
        }
        return fn(providerArgs, signal);
      },
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
// Provider 1 — DashScope CosyVoice via WebSocket (cosyvoice-v2 + longhuhu_v3)
//
// Workorder: 2026-04-29-cosyvoice-websocket
//
// Endpoint:
//   wss://dashscope.aliyuncs.com/api-ws/v1/inference/
//   Header: Authorization: bearer <DASHSCOPE_API_KEY>
//           X-DashScope-DataInspection: enable
//
// Protocol (simplified short-text duplex):
//   1. open WS
//   2. send run-task   (JSON, declares model/voice/format)
//   3. wait for header.event === 'task-started'
//   4. send continue-task  (JSON, payload.input.text = the actual text)
//   5. send finish-task    (JSON, payload.input = {})
//   6. server streams binary mp3 frames + emits text events
//   7. wait for header.event === 'task-finished'
//   8. concat binary buffers → return mp3 Buffer
//
// Errors: header.event === 'task-failed' → ProviderError(non-client).
// Premature WS close before task-finished → ProviderError(non-client) so
// the provider chain falls back to ElevenLabs.
//
// Timeout: caller (provider-chain) wraps the call with AbortSignal+timeout.
// We listen on signal.abort to close the WS and reject promptly.
// ----------------------------------------------------------------------------

const DASHSCOPE_WS_URL =
  'wss://dashscope.aliyuncs.com/api-ws/v1/inference/';

function clampRate(speed) {
  // DashScope cosyvoice rate range is roughly 0.5–2.0; clamp to be safe.
  if (typeof speed !== 'number' || !Number.isFinite(speed)) return 1;
  if (speed < 0.5) return 0.5;
  if (speed > 2) return 2;
  return speed;
}

async function dashscopeTts(args, signal) {
  const { text, lang, voiceId, speed, model: argsModel } = args;
  if (!env.DASHSCOPE_API_KEY) {
    throw new ProviderError('DASHSCOPE_API_KEY not configured', {
      status: 401,
      provider: 'dashscope',
    });
  }
  // Per-purpose model selection (workorder 2026-04-29-tts-three-voice-roles):
  // synthesize() resolves the correct model via resolvePurposeConfig and
  // passes it down here. Keep legacy DASHSCOPE_TTS_MODEL as final fallback
  // so direct callers (tests, REPL) still work.
  const model = argsModel || env.DASHSCOPE_TTS_MODEL || 'cosyvoice-v2';
  const voice = voiceId || defaultDashScopeVoiceId(lang) || 'longhuhu_v3';
  const taskId = randomUUID().replace(/-/g, '');

  const audioBytes = await new Promise((resolve, reject) => {
    const audioChunks = [];
    let settled = false;
    let abortListener = null;
    let started = false;

    const ws = new WebSocket(DASHSCOPE_WS_URL, {
      headers: {
        Authorization: `bearer ${env.DASHSCOPE_API_KEY}`,
        'X-DashScope-DataInspection': 'enable',
      },
    });

    function cleanup() {
      try {
        ws.removeAllListeners();
      } catch (_) {
        /* ignore */
      }
      try {
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
        }
      } catch (_) {
        /* ignore */
      }
      if (signal && abortListener) {
        try {
          signal.removeEventListener('abort', abortListener);
        } catch (_) {
          /* ignore */
        }
      }
    }

    function fail(err) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }

    function succeed(buf) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(buf);
    }

    if (signal) {
      if (signal.aborted) {
        fail(
          new ProviderError('aborted by caller', {
            status: 408,
            provider: 'dashscope',
          }),
        );
        return;
      }
      abortListener = () => {
        fail(
          new ProviderError('aborted by caller (timeout)', {
            status: 408,
            provider: 'dashscope',
          }),
        );
      };
      signal.addEventListener('abort', abortListener, { once: true });
    }

    ws.on('open', () => {
      const runTask = {
        header: {
          action: 'run-task',
          task_id: taskId,
          streaming: 'duplex',
        },
        payload: {
          task_group: 'audio',
          task: 'tts',
          function: 'SpeechSynthesizer',
          model,
          parameters: {
            text_type: 'PlainText',
            voice,
            format: 'mp3',
            sample_rate: 22050,
            volume: 50,
            rate: clampRate(speed),
            pitch: 1,
          },
          input: {},
        },
      };
      try {
        ws.send(JSON.stringify(runTask), (err) => {
          if (err) {
            fail(
              new ProviderError(
                `DashScope WS run-task send failed: ${err.message}`,
                { status: 502, provider: 'dashscope', cause: err },
              ),
            );
          }
        });
      } catch (err) {
        fail(
          new ProviderError(`DashScope WS send threw: ${err.message}`, {
            status: 502,
            provider: 'dashscope',
            cause: err,
          }),
        );
      }
    });

    ws.on('message', (data, isBinary) => {
      if (settled) return;
      if (isBinary) {
        // Binary audio chunk
        audioChunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
        return;
      }
      // Text control event
      let msg;
      try {
        const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
        msg = JSON.parse(raw);
      } catch (_) {
        // Some servers send binary as ArrayBuffer when isBinary mis-detected;
        // treat unparseable text as audio bytes (defensive).
        if (Buffer.isBuffer(data)) audioChunks.push(data);
        return;
      }
      const event = msg?.header?.event;
      if (event === 'task-started') {
        started = true;
        // Send the text in continue-task, then immediately finish-task
        // (short-text mode, all text fits in one frame).
        const continueTask = {
          header: {
            action: 'continue-task',
            task_id: taskId,
            streaming: 'duplex',
          },
          payload: { input: { text } },
        };
        const finishTask = {
          header: {
            action: 'finish-task',
            task_id: taskId,
            streaming: 'duplex',
          },
          payload: { input: {} },
        };
        try {
          ws.send(JSON.stringify(continueTask), (err) => {
            if (err) {
              fail(
                new ProviderError(
                  `DashScope WS continue-task send failed: ${err.message}`,
                  { status: 502, provider: 'dashscope', cause: err },
                ),
              );
              return;
            }
            ws.send(JSON.stringify(finishTask), (err2) => {
              if (err2) {
                fail(
                  new ProviderError(
                    `DashScope WS finish-task send failed: ${err2.message}`,
                    { status: 502, provider: 'dashscope', cause: err2 },
                  ),
                );
              }
            });
          });
        } catch (err) {
          fail(
            new ProviderError(`DashScope WS send threw: ${err.message}`, {
              status: 502,
              provider: 'dashscope',
              cause: err,
            }),
          );
        }
      } else if (event === 'task-finished') {
        const buf = Buffer.concat(audioChunks);
        if (buf.length === 0) {
          fail(
            new ProviderError(
              'DashScope TTS task-finished but no audio bytes received',
              { status: 502, provider: 'dashscope' },
            ),
          );
        } else {
          succeed(buf);
        }
      } else if (event === 'task-failed') {
        const errCode = msg?.header?.error_code || '';
        const errMsg =
          msg?.header?.error_message ||
          JSON.stringify(msg).slice(0, 200);
        // Auth / permission style errors map to 401/403 → fallback to
        // ElevenLabs. Everything else → 502 (also fallback). We never set
        // isClientError here because the workorder requires fallback to
        // ElevenLabs in all live failure scenarios except aborts.
        const status = /auth|permission|denied|invalidapikey|unauthorized/i.test(
          `${errCode} ${errMsg}`,
        )
          ? 401
          : 502;
        fail(
          new ProviderError(
            `DashScope TTS task-failed code=${errCode || 'n/a'} msg="${errMsg}"`,
            { status, provider: 'dashscope', isClientError: false },
          ),
        );
      }
      // Other events (e.g. 'result-generated' metadata) are ignored.
    });

    ws.on('error', (err) => {
      fail(
        new ProviderError(`DashScope WS error: ${err.message}`, {
          status: 502,
          provider: 'dashscope',
          cause: err,
        }),
      );
    });

    ws.on('close', (code, reason) => {
      if (settled) return;
      const reasonStr = reason
        ? Buffer.isBuffer(reason)
          ? reason.toString('utf8')
          : String(reason)
        : '';
      // We only get here if the close happened before a task-finished /
      // task-failed event (those branches call succeed/fail synchronously,
      // which sets settled=true and triggers cleanup → close → no-op here).
      const phase = started ? 'after task-started' : 'before task-started';
      fail(
        new ProviderError(
          `DashScope WS closed prematurely ${phase} code=${code} reason="${reasonStr.slice(
            0,
            200,
          )}"`,
          { status: 502, provider: 'dashscope', isClientError: false },
        ),
      );
    });
  });

  const durationMs = estimateMp3DurationMs(audioBytes.length);
  return { audioBytes, durationMs, mimeType: 'audio/mpeg' };
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
  resolvePurposeConfig,
  bufferToDataUrl,
  estimateMp3DurationMs,
};
