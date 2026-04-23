// ============================================================================
// services/imageGen.js — 3-way fallback image generator per PROMPT_SPEC_v7_1 §6
//
// Fallback order (v7.1 §6.1):  fal → imagen → openai → placeholder
//
// Each tier calls sanitizeImagePrompt() with the channel-appropriate config,
// so OpenAI gets stricter cleansing than FAL/Imagen.
//
// In MOCK mode (default when API keys missing), all calls succeed instantly
// with deterministic stub URLs so smoke tests don't need network.
//
// Returns:
//   { imageUrl, imageUrlHd, provider, tier, durationMs, costCents }
// ============================================================================

import env from '../config/env.js';
import { sanitizeImagePrompt } from '../utils/storyPrompt.js';

const TIERS = [
  { provider: 'fal', tier: 1, costCents: 4 },
  { provider: 'imagen', tier: 2, costCents: 4 },
  { provider: 'openai', tier: 3, costCents: 5 },
];

export function isMockMode() {
  if (process.env.USE_MOCK_AI === 'true' || process.env.USE_MOCK_AI === '1') return true;
  // If NONE of the three keys is present, force mock
  if (!env.FAL_KEY && !env.GEMINI_API_KEY && !env.OPENAI_API_KEY) return true;
  return false;
}

/**
 * Generate one page image with 3-way fallback.
 *
 * @param {object} args
 * @param {string} args.imagePrompt      LLM-produced scene prompt
 * @param {string} args.characterDesc    Character anchor prefix
 * @param {number} args.pageNum          1-12 (used for cache keying / logging)
 * @param {string} [args.seed]           Deterministic seed (storyId:pageNum)
 * @param {function} [args.onAttempt]    async (attempt) => void; called with each tier log
 * @returns {Promise<{
 *   imageUrl:string, imageUrlHd:string,
 *   provider:string, tier:number,
 *   durationMs:number, costCents:number,
 *   sanitizer: { replacementHits:number, comboDetected:boolean, aggressiveRewrite:boolean }
 * }>}
 */
export async function generatePageImage(args) {
  const { imagePrompt, characterDesc = '', pageNum = 1, seed = '', onAttempt = null } = args;
  const attempts = [];

  for (const tierInfo of TIERS) {
    const { provider, tier, costCents } = tierInfo;
    const { finalPrompt, counters } = sanitizeImagePrompt(imagePrompt, {
      channel: provider,
      characterDesc,
    });

    const start = Date.now();
    try {
      const result = isMockMode()
        ? await mockProvider({ provider, finalPrompt, pageNum, seed })
        : await liveProvider({ provider, finalPrompt });
      const durationMs = Date.now() - start;
      const attempt = { provider, tier, success: true, durationMs, costCents, errorCode: null, errorMessage: null };
      attempts.push(attempt);
      if (onAttempt) await onAttempt(attempt);
      return {
        imageUrl: result.imageUrl,
        imageUrlHd: result.imageUrlHd,
        provider,
        tier,
        durationMs,
        costCents,
        sanitizer: counters,
        attempts,
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      const attempt = {
        provider, tier, success: false, durationMs,
        costCents: 0, errorCode: 30002, errorMessage: err.message,
      };
      attempts.push(attempt);
      if (onAttempt) await onAttempt(attempt);
      // fall through to next tier
    }
  }

  // All 3 failed → placeholder
  return {
    imageUrl: placeholderUrl(pageNum),
    imageUrlHd: placeholderUrl(pageNum, 'hd'),
    provider: 'placeholder',
    tier: 4,
    durationMs: 0,
    costCents: 0,
    sanitizer: { replacementHits: 0, comboDetected: false, aggressiveRewrite: false },
    attempts,
  };
}

// ---------------------------------------------------------------------------
// Mock provider — deterministic URLs, always succeeds
// ---------------------------------------------------------------------------
async function mockProvider({ provider, pageNum, seed }) {
  const key = `${seed}-p${pageNum}-${provider}`;
  return {
    imageUrl: `https://mock.wonderbear.app/img/${encodeURIComponent(key)}.webp`,
    imageUrlHd: `https://mock.wonderbear.app/img/${encodeURIComponent(key)}.hd.png`,
  };
}

// ---------------------------------------------------------------------------
// Live providers — thin REST wrappers (Phase 1 scope; real usage will extract
// to dedicated modules later).  Kept small so batch 4 can ship with smoke-mock.
// ---------------------------------------------------------------------------
async function liveProvider({ provider, finalPrompt }) {
  if (provider === 'fal') return callFal(finalPrompt);
  if (provider === 'imagen') return callImagen(finalPrompt);
  if (provider === 'openai') return callOpenAI(finalPrompt);
  throw new Error(`Unknown provider ${provider}`);
}

async function callFal(prompt) {
  if (!env.FAL_KEY) throw new Error('FAL_KEY not configured');
  const resp = await fetch('https://fal.run/fal-ai/flux/dev', {
    method: 'POST',
    headers: {
      Authorization: `Key ${env.FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_size: 'landscape_16_9',
      num_images: 1,
      enable_safety_checker: true,
    }),
  });
  if (!resp.ok) throw new Error(`FAL HTTP ${resp.status}`);
  const data = await resp.json();
  const url = data?.images?.[0]?.url;
  if (!url) throw new Error('FAL returned no image');
  return { imageUrl: url, imageUrlHd: url };
}

async function callImagen(prompt) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { aspectRatio: '16:9', sampleCount: 1 },
      }),
    },
  );
  if (!resp.ok) throw new Error(`Imagen HTTP ${resp.status}`);
  const data = await resp.json();
  const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('Imagen returned no image');
  // Caller must upload this to R2/CDN and substitute real URL; here we return data URL
  const url = `data:image/png;base64,${b64}`;
  return { imageUrl: url, imageUrlHd: url };
}

async function callOpenAI(prompt) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      size: '1536x1024',
      n: 1,
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI image HTTP ${resp.status}`);
  const data = await resp.json();
  const url = data?.data?.[0]?.url;
  if (!url) throw new Error('OpenAI returned no image');
  return { imageUrl: url, imageUrlHd: url };
}

function placeholderUrl(pageNum, variant = 'webp') {
  const kind = variant === 'hd' ? 'hd.png' : 'webp';
  return `https://mock.wonderbear.app/placeholder/page${pageNum}.${kind}`;
}
