// ============================================================================
// services/mediaStorage.js — Cloudflare R2 persistence for images + audio.
//
// Why this layer exists:
//   - OpenAI gpt-image-1 returns 1-hour-TTL URLs (or base64).
//   - Gemini Imagen returns base64 only.
//   - FAL flux/kontext returns 60-day-TTL URLs.
//   - ElevenLabs TTS is base64 in our wrapper.
//
// All of those are unfit for production storage. This module:
//   - Downloads / decodes whatever the upstream returned
//   - For images: re-encodes to webp (display) and png (HD master)
//   - For audio: passes through mp3 bytes
//   - Uploads to R2 with stable, predictable keys
//   - Returns the public URL the caller should persist into the DB
//
// Public API:
//   persistImage(sourceUrl, { storyId, pageNum, provider }) → { persistedUrl, sizeKb, format }
//   persistImageHd(sourceUrl, { storyId, pageNum, provider }) → { persistedUrl, sizeKb, format }
//   persistAudio(source, { storyId, pageNum, lang, voiceId }) → { persistedUrl, sizeKb }
//   isMockMode()
//
// R2 key layout:
//   stories/{storyId}/page_{NN}.webp           ← display
//   stories/{storyId}/page_{NN}_hd.png         ← HD master (PDF/print later)
//   stories/{storyId}/audio/{lang}/page_{NN}.mp3
//
// Mock mode:
//   When USE_MOCK_AI is on, OR when R2 credentials are missing, this module
//   becomes a no-op that returns the source URL verbatim. Lets smoke tests
//   keep their existing assertions about mock URLs and lets a partially-
//   configured local dev server still run end-to-end (just without
//   persistence).
// ============================================================================

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import env from '../config/env.js';

// --------------------------------------------------------------------------
// Mock-mode + lazy client
// --------------------------------------------------------------------------

export function isMockMode() {
  if (process.env.USE_MOCK_AI === '1' || process.env.USE_MOCK_AI === 'true') return true;
  // Treat "no R2 creds configured" as mock so a half-configured dev box still
  // boots and runs the pipeline. Production will always have these set.
  if (
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_ENDPOINT ||
    !env.R2_PUBLIC_URL
  ) {
    return true;
  }
  return false;
}

let _client = null;
function getClient() {
  if (_client) return _client;
  _client = new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  return _client;
}

function publicBase() {
  return (env.R2_PUBLIC_URL || '').replace(/\/$/, '');
}

// --------------------------------------------------------------------------
// Generic upload
// --------------------------------------------------------------------------

async function uploadToR2(key, buffer, contentType, metadata = {}) {
  const client = getClient();
  const cleanedMeta = {};
  // S3 metadata values must be ASCII strings.
  for (const [k, v] of Object.entries(metadata || {})) {
    if (v == null) continue;
    cleanedMeta[k.toLowerCase()] = String(v).slice(0, 256);
  }
  cleanedMeta.uploadedat = new Date().toISOString();

  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // Immutable cache: we never overwrite the same key for the same story.
      CacheControl: 'public, max-age=31536000, immutable',
      Metadata: cleanedMeta,
    }),
  );
  return `${publicBase()}/${key}`;
}

// --------------------------------------------------------------------------
// Download / decode helpers
// --------------------------------------------------------------------------

function pad(n) {
  return String(n).padStart(2, '0');
}

async function downloadToBuffer(sourceUrl, providerHint = 'unknown') {
  if (typeof sourceUrl !== 'string' || !sourceUrl) {
    throw new Error(`download: empty sourceUrl (provider=${providerHint})`);
  }
  if (sourceUrl.startsWith('data:')) {
    const idx = sourceUrl.indexOf(',');
    if (idx < 0) throw new Error('download: malformed dataURL');
    return Buffer.from(sourceUrl.slice(idx + 1), 'base64');
  }
  if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
    const resp = await fetch(sourceUrl);
    if (!resp.ok) {
      throw new Error(
        `download HTTP ${resp.status} from ${providerHint}: ${sourceUrl.slice(0, 80)}`,
      );
    }
    return Buffer.from(await resp.arrayBuffer());
  }
  throw new Error(`download: unsupported URL scheme: ${sourceUrl.slice(0, 32)}`);
}

// --------------------------------------------------------------------------
// Public: image persistence
// --------------------------------------------------------------------------

/**
 * Re-encode any source image to webp and upload to R2.
 *
 * @param {string} sourceUrl  — http(s):// URL or data: URL
 * @param {{storyId:string,pageNum:number,provider?:string}} meta
 * @returns {Promise<{persistedUrl:string,sizeKb:number,format:'webp',skipped?:boolean,r2Key?:string}>}
 */
export async function persistImage(sourceUrl, meta) {
  const { storyId, pageNum, provider = 'unknown' } = meta || {};
  if (!storyId) throw new Error('persistImage: storyId is required');
  if (pageNum == null) throw new Error('persistImage: pageNum is required');
  if (!sourceUrl) throw new Error('persistImage: sourceUrl is empty');

  if (isMockMode()) {
    // Pass-through: keep existing mock URL so smoke-test assertions about
    // mock.wonderbear.app/* keep working unchanged.
    return { persistedUrl: sourceUrl, sizeKb: 0, format: 'webp', skipped: true };
  }

  const raw = await downloadToBuffer(sourceUrl, provider);
  const webp = await sharp(raw).webp({ quality: 88 }).toBuffer();

  const key = `stories/${storyId}/page_${pad(pageNum)}.webp`;
  const url = await uploadToR2(key, webp, 'image/webp', {
    storyid: storyId,
    pagenum: pageNum,
    provider,
    type: 'image-webp',
  });

  return {
    persistedUrl: url,
    sizeKb: Math.round(webp.length / 1024),
    format: 'webp',
    r2Key: key,
  };
}

/**
 * Re-encode the same source image to PNG (HD master) and upload to R2.
 * Used for downstream PDF / print export.
 */
export async function persistImageHd(sourceUrl, meta) {
  const { storyId, pageNum, provider = 'unknown' } = meta || {};
  if (!storyId) throw new Error('persistImageHd: storyId is required');
  if (pageNum == null) throw new Error('persistImageHd: pageNum is required');
  if (!sourceUrl) throw new Error('persistImageHd: sourceUrl is empty');

  if (isMockMode()) {
    return { persistedUrl: sourceUrl, sizeKb: 0, format: 'png', skipped: true };
  }

  const raw = await downloadToBuffer(sourceUrl, provider);
  // Quality 100 keeps the master lossless-ish; PNG ignores numeric quality but
  // sharp accepts the option without error.
  const png = await sharp(raw).png({ compressionLevel: 6 }).toBuffer();

  const key = `stories/${storyId}/page_${pad(pageNum)}_hd.png`;
  const url = await uploadToR2(key, png, 'image/png', {
    storyid: storyId,
    pagenum: pageNum,
    provider,
    type: 'image-png-hd',
  });

  return {
    persistedUrl: url,
    sizeKb: Math.round(png.length / 1024),
    format: 'png',
    r2Key: key,
  };
}

// --------------------------------------------------------------------------
// Public: audio persistence
// --------------------------------------------------------------------------

/**
 * Upload mp3 audio to R2.
 *
 * @param {Buffer|string} source  — Buffer | data:audio/...;base64 | http(s):// URL
 * @param {{storyId:string,pageNum:number,lang:string,voiceId?:string}} meta
 * @returns {Promise<{persistedUrl:string,sizeKb:number,skipped?:boolean,r2Key?:string}>}
 */
export async function persistAudio(source, meta) {
  const { storyId, pageNum, lang, voiceId = 'unknown' } = meta || {};
  if (!storyId) throw new Error('persistAudio: storyId is required');
  if (pageNum == null) throw new Error('persistAudio: pageNum is required');
  if (!lang) throw new Error('persistAudio: lang is required');
  if (!source) throw new Error('persistAudio: source is empty');

  if (isMockMode()) {
    // Pass-through. If source is a Buffer in mock mode (shouldn't happen in
    // practice), fall back to a stub URL so callers get a string.
    if (typeof source === 'string') {
      return { persistedUrl: source, sizeKb: 0, skipped: true };
    }
    return {
      persistedUrl: `https://mock.wonderbear.app/tts/${storyId}_${pad(pageNum)}_${lang}.mp3`,
      sizeKb: Math.round((source.length || 0) / 1024),
      skipped: true,
    };
  }

  let buffer;
  if (Buffer.isBuffer(source)) {
    buffer = source;
  } else if (typeof source === 'string' && source.startsWith('data:')) {
    const idx = source.indexOf(',');
    if (idx < 0) throw new Error('persistAudio: malformed dataURL');
    buffer = Buffer.from(source.slice(idx + 1), 'base64');
  } else if (
    typeof source === 'string' &&
    (source.startsWith('http://') || source.startsWith('https://'))
  ) {
    const resp = await fetch(source);
    if (!resp.ok) {
      throw new Error(`persistAudio: download HTTP ${resp.status}`);
    }
    buffer = Buffer.from(await resp.arrayBuffer());
  } else {
    throw new Error(`persistAudio: unknown source format`);
  }

  const key = `stories/${storyId}/audio/${lang}/page_${pad(pageNum)}.mp3`;
  const url = await uploadToR2(key, buffer, 'audio/mpeg', {
    storyid: storyId,
    pagenum: pageNum,
    lang,
    voiceid: voiceId,
    type: 'audio-mp3',
  });

  return {
    persistedUrl: url,
    sizeKb: Math.round(buffer.length / 1024),
    r2Key: key,
  };
}

// --------------------------------------------------------------------------
// For tests: reset the cached client so multiple smoke runs don't share state
// --------------------------------------------------------------------------
export function _resetClientForTests() {
  _client = null;
}
