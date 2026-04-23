// ============================================================================
// services/imageGen.js — cover-first + image-to-image fallback chain
//
// Architecture (per founder directive 2026-04-23):
//
//   PAGE 1 (cover — anchors character & style)
//     ┌─ Tier 1: OpenAI gpt-image-1  (precise prompt adherence)
//     ├─ Tier 2: Gemini imagen-3.0   (used when OpenAI content-policy blocks)
//     └─ placeholder                 (both failed)
//
//   PAGE 2-12 (subsequent — conditioned on page-1 image for consistency)
//     ┌─ Tier 1: FAL flux-pro/kontext  (img2img with page-1 reference)
//     ├─ Tier 2: FAL flux/dev          (text2image fallback; loses consistency)
//     └─ placeholder
//
// Why this shape:
//   - OpenAI gpt-image-1 follows character descriptions most precisely for the
//     cover, but has strict content policy → Gemini Imagen rescues when OpenAI
//     refuses on borderline child-story prompts.
//   - FAL flux-pro/kontext takes a reference image_url + a delta prompt, so
//     pages 2-12 stay visually consistent with the cover (same character,
//     palette, style).
//   - If FAL kontext fails we fall back to FAL flux/dev text2image to keep the
//     story generating, even though consistency will drop for that page.
//
// Public API:
//   generateCoverImage({ imagePrompt, characterDesc, seed, onAttempt })
//     → { imageUrl, imageUrlHd, provider, tier, durationMs, costCents,
//         sanitizer, attempts }
//
//   generateSubsequentPage({ imagePrompt, characterDesc, pageNum,
//                            referenceImageUrl, seed, onAttempt })
//     → same shape
//
//   generatePageImage(args)   — backward-compat shim used by storyJob:
//     routes to generateCoverImage when pageNum===1 && !referenceImageUrl,
//     otherwise to generateSubsequentPage.
//
// Mock mode (USE_MOCK_AI=1 or no keys): deterministic URLs, always succeeds.
// ============================================================================

import env from '../config/env.js';
import { sanitizeImagePrompt } from '../utils/storyPrompt.js';

// ----- Cost table (cents per call, for ImageGenLog / Story.genCostCents) -----
const COST = {
  openai: 4,          // gpt-image-1 1024x1024 medium
  imagen: 4,          // Imagen 3 fast
  'fal-kontext': 4,   // flux-pro/kontext
  fal: 4,             // flux/dev text2image fallback
};

// Content-policy error codes we explicitly route to Gemini on the cover page.
const OPENAI_CONTENT_POLICY_MARKERS = /content_policy|moderation_blocked|safety/i;

export function isMockMode() {
  if (process.env.USE_MOCK_AI === 'true' || process.env.USE_MOCK_AI === '1') return true;
  if (!env.FAL_KEY && !env.GEMINI_API_KEY && !env.OPENAI_API_KEY) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Public: generateCoverImage — page 1 only
// ---------------------------------------------------------------------------

export async function generateCoverImage(args) {
  const { imagePrompt, characterDesc = '', seed = '', onAttempt = null } = args;
  const attempts = [];

  // Tier 1: OpenAI gpt-image-1
  {
    const provider = 'openai';
    const tier = 1;
    const { finalPrompt, counters } = sanitizeImagePrompt(imagePrompt, {
      channel: provider, characterDesc,
    });
    const r = await runTier({
      provider, tier, finalPrompt, counters, pageNum: 1, seed,
      exec: () => callOpenAI(finalPrompt),
    });
    if (onAttempt) await onAttempt(r.attempt);
    attempts.push(r.attempt);
    if (r.success) return finalize(r, attempts, counters);
  }

  // Tier 2: Gemini imagen-3.0 (fallback for content-policy and other errors)
  {
    const provider = 'imagen';
    const tier = 2;
    const { finalPrompt, counters } = sanitizeImagePrompt(imagePrompt, {
      channel: provider, characterDesc,
    });
    const r = await runTier({
      provider, tier, finalPrompt, counters, pageNum: 1, seed,
      exec: () => callImagen(finalPrompt),
    });
    if (onAttempt) await onAttempt(r.attempt);
    attempts.push(r.attempt);
    if (r.success) return finalize(r, attempts, counters);
  }

  // Both failed → placeholder
  return placeholderResult(1, attempts);
}

// ---------------------------------------------------------------------------
// Public: generateSubsequentPage — pages 2-12 (img2img conditioned on cover)
// ---------------------------------------------------------------------------

export async function generateSubsequentPage(args) {
  const {
    imagePrompt, characterDesc = '', pageNum = 2,
    referenceImageUrl, seed = '', onAttempt = null,
  } = args;
  const attempts = [];

  // Tier 1: FAL flux-pro/kontext (needs a reference URL to do img2img)
  if (referenceImageUrl) {
    const provider = 'fal-kontext';
    const tier = 1;
    const { finalPrompt, counters } = sanitizeImagePrompt(imagePrompt, {
      channel: 'fal', characterDesc,
    });
    const r = await runTier({
      provider, tier, finalPrompt, counters, pageNum, seed,
      exec: () => callFalKontext(finalPrompt, referenceImageUrl),
    });
    if (onAttempt) await onAttempt(r.attempt);
    attempts.push(r.attempt);
    if (r.success) return finalize(r, attempts, counters);
  }

  // Tier 2: FAL flux/dev text2image (last resort — consistency will drop)
  {
    const provider = 'fal';
    const tier = 2;
    const { finalPrompt, counters } = sanitizeImagePrompt(imagePrompt, {
      channel: provider, characterDesc,
    });
    const r = await runTier({
      provider, tier, finalPrompt, counters, pageNum, seed,
      exec: () => callFalText(finalPrompt),
    });
    if (onAttempt) await onAttempt(r.attempt);
    attempts.push(r.attempt);
    if (r.success) return finalize(r, attempts, counters);
  }

  return placeholderResult(pageNum, attempts);
}

// ---------------------------------------------------------------------------
// Back-compat shim used by storyJob.js + smoke tests
// ---------------------------------------------------------------------------

export async function generatePageImage(args) {
  const { pageNum = 1, referenceImageUrl = null } = args;
  if (pageNum === 1 && !referenceImageUrl) {
    return generateCoverImage(args);
  }
  return generateSubsequentPage(args);
}

// ---------------------------------------------------------------------------
// Tier runner — encapsulates timing + mock + error-to-attempt normalisation
// ---------------------------------------------------------------------------

async function runTier({ provider, tier, finalPrompt, pageNum, seed, exec }) {
  const start = Date.now();
  try {
    const result = isMockMode()
      ? await mockProvider({ provider, pageNum, seed })
      : await exec();
    const durationMs = Date.now() - start;
    const attempt = {
      provider, tier, success: true, durationMs,
      costCents: COST[provider] ?? 0,
      errorCode: null, errorMessage: null,
    };
    return { success: true, result, attempt };
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = String(err?.message || err);
    const errorCode = OPENAI_CONTENT_POLICY_MARKERS.test(msg) ? 30003 : 30002;
    const attempt = {
      provider, tier, success: false, durationMs,
      costCents: 0, errorCode, errorMessage: msg.slice(0, 500),
    };
    return { success: false, result: null, attempt };
  }
}

function finalize(r, attempts, counters) {
  return {
    imageUrl: r.result.imageUrl,
    imageUrlHd: r.result.imageUrlHd,
    provider: r.attempt.provider,
    tier: r.attempt.tier,
    durationMs: r.attempt.durationMs,
    costCents: r.attempt.costCents,
    sanitizer: counters,
    attempts,
  };
}

function placeholderResult(pageNum, attempts) {
  return {
    imageUrl: placeholderUrl(pageNum),
    imageUrlHd: placeholderUrl(pageNum, 'hd'),
    provider: 'placeholder',
    tier: 99,
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
// Live providers
// ---------------------------------------------------------------------------

// --- OpenAI gpt-image-1 (cover, text2image) ---
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
      size: '1536x1024',      // closest to 16:9 for TV landscape
      quality: 'medium',
      n: 1,
    }),
  });
  if (!resp.ok) {
    const txt = await safeText(resp);
    throw new Error(`OpenAI image HTTP ${resp.status}: ${txt.slice(0, 300)}`);
  }
  const data = await resp.json();
  // gpt-image-1 returns b64_json, DALL-E-3 returns url. Handle both.
  const entry = data?.data?.[0];
  if (!entry) throw new Error('OpenAI returned no image');
  if (entry.url) return { imageUrl: entry.url, imageUrlHd: entry.url };
  if (entry.b64_json) {
    const url = `data:image/png;base64,${entry.b64_json}`;
    return { imageUrl: url, imageUrlHd: url };
  }
  throw new Error('OpenAI response missing url and b64_json');
}

// --- Gemini imagen-3.0 (cover fallback, text2image) ---
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
  if (!resp.ok) {
    const txt = await safeText(resp);
    throw new Error(`Imagen HTTP ${resp.status}: ${txt.slice(0, 300)}`);
  }
  const data = await resp.json();
  const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('Imagen returned no image');
  const url = `data:image/png;base64,${b64}`;
  return { imageUrl: url, imageUrlHd: url };
}

// --- FAL flux-pro/kontext (img2img) ---
async function callFalKontext(prompt, referenceImageUrl) {
  if (!env.FAL_KEY) throw new Error('FAL_KEY not configured');
  const resp = await fetch('https://fal.run/fal-ai/flux-pro/kontext', {
    method: 'POST',
    headers: {
      Authorization: `Key ${env.FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_url: referenceImageUrl,
      aspect_ratio: '16:9',
      num_images: 1,
      output_format: 'jpeg',
      safety_tolerance: '6',       // max permissive; we already sanitize
    }),
  });
  if (!resp.ok) {
    const txt = await safeText(resp);
    throw new Error(`FAL-kontext HTTP ${resp.status}: ${txt.slice(0, 300)}`);
  }
  const data = await resp.json();
  const url = data?.images?.[0]?.url;
  if (!url) throw new Error('FAL-kontext returned no image');
  return { imageUrl: url, imageUrlHd: url };
}

// --- FAL flux/dev (text2image fallback) ---
async function callFalText(prompt) {
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
  if (!resp.ok) {
    const txt = await safeText(resp);
    throw new Error(`FAL HTTP ${resp.status}: ${txt.slice(0, 300)}`);
  }
  const data = await resp.json();
  const url = data?.images?.[0]?.url;
  if (!url) throw new Error('FAL returned no image');
  return { imageUrl: url, imageUrlHd: url };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function safeText(resp) {
  try { return await resp.text(); } catch { return ''; }
}

function placeholderUrl(pageNum, variant = 'webp') {
  const kind = variant === 'hd' ? 'hd.png' : 'webp';
  return `https://mock.wonderbear.app/placeholder/page${pageNum}.${kind}`;
}
