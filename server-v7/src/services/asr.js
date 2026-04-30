// ============================================================================
// services/asr.js — dual-provider ASR (Google STT + DashScope paraformer)
//
// Workorder: 2026-04-29-asr-tts-dual-provider §2.1, §3.1, §3.2
//
// Public API (UNCHANGED — callers in src/routes/story.js do NOT need to change):
//   - transcribe({ audioBuffer, mimeType, locale }) → { text, locale }
//   - isMockMode()
//
// Routing:
//   - process.env.ASR_PRIMARY        ∈ {google, dashscope, whisper}
//   - process.env.ASR_FALLBACK_CHAIN  comma-separated, e.g. "dashscope"
//   - process.env.ASR_TIMEOUT_MS      per-provider timeout (default 8000)
//
// Providers:
//   - google     : Google Cloud Speech-to-Text (Service Account JSON →
//                  JWT-signed OAuth2 access token → REST v1)
//   - dashscope  : Aliyun DashScope paraformer-v2 (REST async job — upload
//                  audio to R2, submit task with public URL, poll until done)
//   - whisper    : OpenAI Whisper (DEPRECATED kept for future use; do not
//                  put in primary chain unless OPENAI_API_KEY quota restored)
// ============================================================================

import fs from 'node:fs';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import env from '../config/env.js';
import { callWithFallback, ProviderError } from '../lib/provider-chain.js';

// ----------------------------------------------------------------------------
// Mock mode (unchanged — used by USE_MOCK_AI=1 unit tests)
// ----------------------------------------------------------------------------
export function isMockMode() {
  if (process.env.USE_MOCK_AI === 'true' || process.env.USE_MOCK_AI === '1') return true;
  // No fail-soft on missing keys — "no provider key configured" should be a
  // loud server boot warning, not a silent mock fallback. We DO still allow
  // unit tests to opt into mock mode via USE_MOCK_AI explicitly.
  return false;
}

function mockTranscribe({ audioBuffer, locale = 'en' }) {
  const bank = {
    zh: ['是一只小猫', '有一只小狗', '我想听公主', '有一个勇敢的小熊', '去海边吧'],
    en: ['a little kitten', 'a brave puppy', 'a princess please', 'a tiny bear', 'to the seaside'],
    pl: ['mały kotek', 'odważny szczeniak', 'księżniczka proszę', 'mały miś', 'nad morze'],
    ro: ['o pisicuță mică', 'un cățeluș curajos', 'o prințesă te rog', 'un ursuleț mic', 'la mare'],
  };
  const options = bank[locale] || bank.en;
  const len = Buffer.isBuffer(audioBuffer) ? audioBuffer.length : (audioBuffer?.length || 0);
  if (len < 4) throw new Error('ASR: empty audio buffer');
  return { text: options[len % options.length], locale };
}

// ----------------------------------------------------------------------------
// Public entry point — provider chain orchestration
// ----------------------------------------------------------------------------

/**
 * @param {object} args
 * @param {Buffer} args.audioBuffer
 * @param {string} args.mimeType   e.g. 'audio/webm', 'audio/mpeg', 'audio/wav'
 * @param {'zh'|'en'|'pl'|'ro'} args.locale
 * @returns {Promise<{ text:string, locale:string, provider?:string, latencyMs?:number }>}
 */
export async function transcribe(args) {
  if (isMockMode()) return mockTranscribe(args);

  const primary = (env.ASR_PRIMARY || 'google').trim();
  const chain = (env.ASR_FALLBACK_CHAIN || 'dashscope')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const order = [primary, ...chain.filter((n) => n !== primary)];
  const timeoutMs = env.ASR_TIMEOUT_MS || 8000;

  const providers = order.map((name) => {
    const fn = PROVIDERS[name];
    if (!fn) {
      throw new Error(
        `ASR: unknown provider "${name}". Valid: ${Object.keys(PROVIDERS).join(',')}`,
      );
    }
    return { name, fn, timeout: timeoutMs };
  });

  const { result, provider, latencyMs } = await callWithFallback(
    providers,
    args,
    { kind: 'asr', defaultTimeoutMs: timeoutMs },
  );
  return { ...result, provider, latencyMs };
}

// ----------------------------------------------------------------------------
// Provider 1 — Google Cloud Speech-to-Text (Service Account JWT OAuth2)
// ----------------------------------------------------------------------------

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const GOOGLE_SPEECH_URL = 'https://speech.googleapis.com/v1/speech:recognize';

let _googleCreds = null;
let _googleToken = null; // { token, exp }

function loadGoogleCreds() {
  if (_googleCreds) return _googleCreds;
  const path = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path) {
    // Per workorder §3.1: "凭证文件加载失败立刻抛错,不静默降级"
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS env var not set; cannot use google ASR',
    );
  }
  if (!fs.existsSync(path)) {
    throw new Error(`Google credentials file not found at ${path}`);
  }
  const raw = fs.readFileSync(path, 'utf8');
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Google credentials JSON parse failed: ${e.message}`);
  }
  if (!json.private_key || !json.client_email) {
    throw new Error(
      'Google credentials JSON missing private_key or client_email',
    );
  }
  _googleCreds = json;
  return json;
}

function base64UrlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function getGoogleAccessToken(signal) {
  if (_googleToken && _googleToken.exp - Date.now() > 60_000) {
    return _googleToken.token;
  }
  const creds = loadGoogleCreds();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: creds.private_key_id };
  const claim = {
    iss: creds.client_email,
    scope: GOOGLE_SCOPE,
    aud: creds.token_uri || GOOGLE_TOKEN_URI,
    exp: now + 3600,
    iat: now,
  };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const claimB64 = base64UrlEncode(JSON.stringify(claim));
  const signingInput = `${headerB64}.${claimB64}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const sig = signer.sign(creds.private_key);
  const jwt = `${signingInput}.${base64UrlEncode(sig)}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });
  const resp = await fetch(creds.token_uri || GOOGLE_TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new ProviderError(
      `Google OAuth token exchange HTTP ${resp.status}: ${text.slice(0, 200)}`,
      { status: resp.status, provider: 'google' },
    );
  }
  const data = await resp.json();
  const ttl = (data.expires_in || 3600) * 1000;
  _googleToken = {
    token: data.access_token,
    exp: Date.now() + ttl,
  };
  return _googleToken.token;
}

function googleEncodingFor(mimeType) {
  if (!mimeType) return { encoding: 'ENCODING_UNSPECIFIED', rate: undefined };
  if (/webm|opus/i.test(mimeType)) return { encoding: 'WEBM_OPUS', rate: 48000 };
  if (/ogg/i.test(mimeType)) return { encoding: 'OGG_OPUS', rate: 48000 };
  if (/wav|wave|x-wav/i.test(mimeType)) return { encoding: 'LINEAR16', rate: 16000 };
  if (/flac/i.test(mimeType)) return { encoding: 'FLAC', rate: undefined };
  if (/mpeg|mp3/i.test(mimeType)) return { encoding: 'MP3', rate: 16000 };
  if (/mp4|m4a|aac/i.test(mimeType)) return { encoding: 'MP3', rate: 16000 }; // best-effort
  return { encoding: 'ENCODING_UNSPECIFIED', rate: undefined };
}

const GOOGLE_LANG_MAP = {
  zh: 'cmn-Hans-CN',
  en: 'en-US',
  pl: 'pl-PL',
  ro: 'ro-RO',
};

async function googleTranscribe(args, signal) {
  const { audioBuffer, mimeType, locale } = args || {};
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new ProviderError('empty audioBuffer', { status: 400, provider: 'google' });
  }
  const token = await getGoogleAccessToken(signal);
  const { encoding, rate } = googleEncodingFor(mimeType);
  const langCode = GOOGLE_LANG_MAP[locale] || GOOGLE_LANG_MAP[env.ASR_LANGUAGE_DEFAULT] || 'cmn-Hans-CN';
  const config = {
    encoding,
    languageCode: langCode,
    model: 'latest_long',
    enableAutomaticPunctuation: true,
  };
  if (rate) config.sampleRateHertz = rate;
  const body = {
    config,
    audio: { content: audioBuffer.toString('base64') },
  };

  const resp = await fetch(GOOGLE_SPEECH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new ProviderError(
      `Google STT HTTP ${resp.status}: ${text.slice(0, 200)}`,
      { status: resp.status, provider: 'google' },
    );
  }
  const data = await resp.json();
  const results = data?.results || [];
  const text = results
    .map((r) => r?.alternatives?.[0]?.transcript || '')
    .join(' ')
    .trim();
  if (!text) {
    // Empty result == upstream acknowledged but couldn't transcribe.
    // Treat as a non-client failure so we fall back to DashScope.
    throw new ProviderError('Google STT returned empty transcription', {
      status: 502,
      provider: 'google',
    });
  }
  return { text, locale: locale || 'zh' };
}

// ----------------------------------------------------------------------------
// Provider 2 — DashScope paraformer-v2 (Aliyun) async REST
//
// Flow:
//   1. Upload audio buffer to R2 (we already have R2 client wired up).
//   2. POST /api/v1/services/audio/asr/transcription with X-DashScope-Async
//      header + R2 public URL.
//   3. Poll /api/v1/tasks/{task_id} every ~700ms until status is SUCCEEDED
//      or FAILED.
//   4. Fetch transcription_url JSON, extract `.transcripts[0].text`.
//   5. Best-effort: delete the temp R2 object (non-fatal if it stays a few
//      hours; we use a TTL-friendly key prefix).
// ----------------------------------------------------------------------------

const DASHSCOPE_BASE = 'https://dashscope.aliyuncs.com';

let _r2Client = null;
function getR2Client() {
  if (_r2Client) return _r2Client;
  if (
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_ENDPOINT ||
    !env.R2_PUBLIC_URL ||
    !env.R2_BUCKET_NAME
  ) {
    throw new Error(
      'DashScope ASR requires R2 to host the audio; R2 credentials are missing',
    );
  }
  _r2Client = new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  return _r2Client;
}

const DASHSCOPE_LANG_MAP = {
  zh: 'zh',
  en: 'en',
  pl: 'pl',
  ro: 'ro',
};

function extFromMime(mimeType) {
  if (!mimeType) return 'webm';
  if (/wav/i.test(mimeType)) return 'wav';
  if (/ogg/i.test(mimeType)) return 'ogg';
  if (/mpeg|mp3/i.test(mimeType)) return 'mp3';
  if (/mp4|m4a/i.test(mimeType)) return 'm4a';
  if (/webm/i.test(mimeType)) return 'webm';
  if (/aac/i.test(mimeType)) return 'aac';
  return 'webm';
}

async function uploadAudioToR2(audioBuffer, mimeType) {
  const client = getR2Client();
  const ext = extFromMime(mimeType);
  const id = crypto.randomBytes(8).toString('hex');
  const key = `tmp/asr/${Date.now()}_${id}.${ext}`;
  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: audioBuffer,
      ContentType: mimeType || 'application/octet-stream',
      // Short cache; this is throwaway audio.
      CacheControl: 'public, max-age=3600',
    }),
  );
  const url = `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  return { url, key };
}

async function deleteR2ObjectBestEffort(key) {
  try {
    const client = getR2Client();
    await client.send(
      new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }),
    );
  } catch (_) {
    /* non-fatal */
  }
}

async function dashscopeTranscribe(args, signal) {
  const { audioBuffer, mimeType, locale } = args || {};
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new ProviderError('empty audioBuffer', { status: 400, provider: 'dashscope' });
  }
  if (!env.DASHSCOPE_API_KEY) {
    throw new ProviderError('DASHSCOPE_API_KEY not configured', {
      status: 401,
      provider: 'dashscope',
    });
  }

  // 1. Upload to R2
  let uploaded;
  try {
    uploaded = await uploadAudioToR2(audioBuffer, mimeType);
  } catch (e) {
    throw new ProviderError(`R2 upload failed: ${e.message}`, {
      status: 502,
      provider: 'dashscope',
      cause: e,
    });
  }

  try {
    // 2. Submit task
    const lang = DASHSCOPE_LANG_MAP[locale] || 'zh';
    const submitResp = await fetch(
      `${DASHSCOPE_BASE}/api/v1/services/audio/asr/transcription`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify({
          model: env.DASHSCOPE_ASR_MODEL || 'paraformer-v2',
          input: { file_urls: [uploaded.url] },
          parameters: { language_hints: [lang] },
        }),
        signal,
      },
    );
    if (!submitResp.ok) {
      const text = await submitResp.text().catch(() => '');
      throw new ProviderError(
        `DashScope submit HTTP ${submitResp.status}: ${text.slice(0, 200)}`,
        { status: submitResp.status, provider: 'dashscope' },
      );
    }
    const submitData = await submitResp.json();
    const taskId = submitData?.output?.task_id;
    if (!taskId) {
      throw new ProviderError(
        `DashScope submit returned no task_id: ${JSON.stringify(submitData).slice(0, 200)}`,
        { status: 502, provider: 'dashscope' },
      );
    }

    // 3. Poll task
    const deadline = Date.now() + 30_000; // hard polling cap
    let pollData;
    while (Date.now() < deadline) {
      if (signal?.aborted) {
        throw new ProviderError('aborted by caller', {
          status: 408,
          provider: 'dashscope',
        });
      }
      await new Promise((r) => setTimeout(r, 700));
      const pollResp = await fetch(
        `${DASHSCOPE_BASE}/api/v1/tasks/${taskId}`,
        {
          headers: { Authorization: `Bearer ${env.DASHSCOPE_API_KEY}` },
          signal,
        },
      );
      if (!pollResp.ok) {
        const text = await pollResp.text().catch(() => '');
        throw new ProviderError(
          `DashScope poll HTTP ${pollResp.status}: ${text.slice(0, 200)}`,
          { status: pollResp.status, provider: 'dashscope' },
        );
      }
      pollData = await pollResp.json();
      const status = pollData?.output?.task_status;
      if (status === 'SUCCEEDED') break;
      if (status === 'FAILED') {
        throw new ProviderError(
          `DashScope task failed: ${pollData?.output?.message || JSON.stringify(pollData).slice(0, 200)}`,
          { status: 502, provider: 'dashscope' },
        );
      }
    }
    if (!pollData || pollData?.output?.task_status !== 'SUCCEEDED') {
      throw new ProviderError('DashScope task polling timed out', {
        status: 504,
        provider: 'dashscope',
      });
    }

    // 4. Fetch transcription file
    const results = pollData?.output?.results || [];
    const tUrl = results[0]?.transcription_url;
    if (!tUrl) {
      throw new ProviderError(
        `DashScope task SUCCEEDED but no transcription_url: ${JSON.stringify(pollData).slice(0, 200)}`,
        { status: 502, provider: 'dashscope' },
      );
    }
    const tResp = await fetch(tUrl, { signal });
    if (!tResp.ok) {
      throw new ProviderError(
        `DashScope transcription_url fetch HTTP ${tResp.status}`,
        { status: tResp.status, provider: 'dashscope' },
      );
    }
    const tJson = await tResp.json();
    const transcripts = tJson?.transcripts || [];
    const text = transcripts
      .map((t) => (t?.text || '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    if (!text) {
      throw new ProviderError('DashScope returned empty transcription', {
        status: 502,
        provider: 'dashscope',
      });
    }
    return { text, locale: locale || 'zh' };
  } finally {
    deleteR2ObjectBestEffort(uploaded.key);
  }
}

// ----------------------------------------------------------------------------
// Provider 3 — OpenAI Whisper (DEPRECATED kept for future use)
//
// NOTE: not in default chain. Kept for the day Whisper quota is restored or
// for an emergency manual override via ASR_PRIMARY=whisper.
// ----------------------------------------------------------------------------

async function whisperTranscribe(args, signal) {
  const { audioBuffer, mimeType = 'audio/mpeg', locale = 'zh' } = args || {};
  if (!env.OPENAI_API_KEY) {
    throw new ProviderError('OPENAI_API_KEY not configured', {
      status: 401,
      provider: 'whisper',
    });
  }
  const blob = new Blob([audioBuffer], { type: mimeType });
  const form = new FormData();
  form.append('file', blob, `audio.${extFromMime(mimeType)}`);
  form.append('model', 'whisper-1');
  form.append('language', locale);

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new ProviderError(
      `Whisper HTTP ${resp.status}: ${text.slice(0, 200)}`,
      { status: resp.status, provider: 'whisper' },
    );
  }
  const data = await resp.json();
  const text = (data?.text || '').trim();
  if (!text) {
    throw new ProviderError('Whisper returned empty transcription', {
      status: 502,
      provider: 'whisper',
    });
  }
  console.log('[asr-whisper] transcription=' + JSON.stringify(text) + ' locale=' + locale); return { text, locale };
}

// ----------------------------------------------------------------------------
// Provider registry
// ----------------------------------------------------------------------------
const PROVIDERS = {
  google: googleTranscribe,
  dashscope: dashscopeTranscribe,
  whisper: whisperTranscribe, // DEPRECATED
};

// Test-only helpers
export const __test__ = {
  googleTranscribe,
  dashscopeTranscribe,
  whisperTranscribe,
  resetGoogleTokenCache() {
    _googleToken = null;
    _googleCreds = null;
  },
};
