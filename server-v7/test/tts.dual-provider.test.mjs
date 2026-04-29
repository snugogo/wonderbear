// ============================================================================
// Unit tests for src/services/tts.js dual-provider routing
//
// Workorder: 2026-04-29-asr-tts-dual-provider §5.3
//
// Coverage:
//   1. TTS_PRIMARY=dashscope + DashScope returns audio → caller gets a data
//      URL whose payload matches DashScope's body
//   2. TTS_PRIMARY=dashscope + DashScope HTTP 500 → falls back to ElevenLabs
//      and returns ElevenLabs audio
//
// Network is mocked by stubbing globalThis.fetch.
// ============================================================================

process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://x:x@localhost:5432/x';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ||
  'test_dummy_jwt_secret_at_least_32_bytes_long_abc123';

// Provider keys must be truthy or the providers will short-circuit before
// hitting our fetch stub.
process.env.DASHSCOPE_API_KEY =
  process.env.DASHSCOPE_API_KEY || 'sk-test-fake-dashscope';
process.env.ELEVENLABS_API_KEY =
  process.env.ELEVENLABS_API_KEY || 'sk-test-fake-eleven';

process.env.TTS_PRIMARY = 'dashscope';
process.env.TTS_FALLBACK_CHAIN = 'elevenlabs';
process.env.TTS_TIMEOUT_MS = '5000';
process.env.DASHSCOPE_TTS_MODEL = 'qwen3-tts-flash';
process.env.DASHSCOPE_TTS_VOICE_ZH = 'longhuhu_v3';
process.env.VOICE_ID_ZH = 'eleven_voice_zh_test';

// USE_MOCK_AI must NOT be set, or the mock branch wins.
delete process.env.USE_MOCK_AI;

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { synthesize, _clearCache } = await import('../src/services/tts.js');

// ----------------------------------------------------------------------------
// Helpers — fetch stubs
// ----------------------------------------------------------------------------
const realFetch = globalThis.fetch;

const FAKE_MP3 = Buffer.from(
  // 32 byte placeholder; estimateMp3DurationMs floors to 800ms
  'A'.repeat(32),
);
const FAKE_WAV_URL = 'https://example.test/fake-dashscope-audio.wav';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function audioResponse(buf, contentType = 'audio/wav') {
  return new Response(buf, {
    status: 200,
    headers: { 'content-type': contentType },
  });
}
function errorResponse(status, text = 'upstream error') {
  return new Response(text, { status });
}

function installFetchStub(handler) {
  globalThis.fetch = async (url, opts) => {
    const u = typeof url === 'string' ? url : url?.url;
    return handler(u, opts);
  };
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

// ----------------------------------------------------------------------------
// Test 1 — DashScope primary path
// ----------------------------------------------------------------------------
test('synthesize: DashScope primary returns audio data URL', async () => {
  _clearCache();
  let dashscopeCalled = 0;
  let downloadCalled = 0;
  installFetchStub(async (url, _opts) => {
    if (url.includes('multimodal-generation/generation')) {
      dashscopeCalled++;
      return jsonResponse(200, {
        output: { audio: { url: FAKE_WAV_URL } },
      });
    }
    if (url === FAKE_WAV_URL) {
      downloadCalled++;
      return audioResponse(FAKE_MP3, 'audio/wav');
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    const out = await synthesize({ text: '你好世界', lang: 'zh' });
    assert.equal(dashscopeCalled, 1);
    assert.equal(downloadCalled, 1);
    assert.equal(out.provider, 'dashscope');
    assert.match(out.audioUrl, /^data:audio\/wav;base64,/);
    assert.ok(out.durationMs >= 800);
    assert.equal(out.cached, false);
  } finally {
    restoreFetch();
  }
});

// ----------------------------------------------------------------------------
// Test 2 — DashScope 500 → ElevenLabs fallback
// ----------------------------------------------------------------------------
test('synthesize: DashScope 500 falls back to ElevenLabs', async () => {
  _clearCache();
  let dashscopeCalled = 0;
  let elevenCalled = 0;
  const FAKE_MP3_B64 = FAKE_MP3.toString('base64');
  installFetchStub(async (url, _opts) => {
    if (url.includes('multimodal-generation/generation')) {
      dashscopeCalled++;
      return errorResponse(500, '{"code":"InternalError"}');
    }
    if (url.includes('api.elevenlabs.io')) {
      elevenCalled++;
      return jsonResponse(200, {
        audio_base64: FAKE_MP3_B64,
        alignment: { character_end_times_seconds: [1.5] },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    const out = await synthesize({ text: '你好世界', lang: 'zh' });
    assert.equal(dashscopeCalled, 1);
    assert.equal(elevenCalled, 1);
    assert.equal(out.provider, 'elevenlabs');
    assert.match(out.audioUrl, /^data:audio\/mpeg;base64,/);
    assert.equal(out.durationMs, 1500);
    assert.equal(out.cached, false);
    // Cache hit on second call returns cached=true with same URL/duration.
    const out2 = await synthesize({ text: '你好世界', lang: 'zh' });
    assert.equal(out2.cached, true);
    assert.equal(out2.audioUrl, out.audioUrl);
  } finally {
    restoreFetch();
  }
});

// ----------------------------------------------------------------------------
// Test 3 — DashScope returns inline base64 (alternate response shape)
// ----------------------------------------------------------------------------
test('synthesize: DashScope inline base64 audio is decoded directly', async () => {
  _clearCache();
  installFetchStub(async (url, _opts) => {
    if (url.includes('multimodal-generation/generation')) {
      return jsonResponse(200, {
        output: {
          audio: {
            url: 'https://ignored-because-inline.test/x.wav',
            data: FAKE_MP3.toString('base64'),
          },
        },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    const out = await synthesize({ text: 'inline test', lang: 'en' });
    assert.equal(out.provider, 'dashscope');
    assert.match(out.audioUrl, /^data:audio\/wav;base64,/);
  } finally {
    restoreFetch();
  }
});
