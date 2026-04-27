// ============================================================================
// services/imageGen.js — dual-engine fallback chain (v4)
//
// 2026-04-27 refactor per PRODUCT_CONSTITUTION §4.2 (dual-engine fallback)
// + STYLE_PROMPT_REFERENCE §8.2 (Nano Banana Cover/Interior split):
//
//   PAGE 1 (cover) — single chain, no age-routing:
//     T1: Nano Banana Pro (gemini-3-pro-image-preview, 16:9 native, 2K)
//     T2: sanitizePromptForPage1 → OpenAI gpt-image-1.5 (medium, 1536x1024)
//     T3: FAL flux/dev text2image (16:9)
//     Final: placeholder
//
//   PAGE 2-12 (interior) — chained reference orchestrated by storyJob.js:
//     T1: FAL flux-pro/kontext (img2img, 16:9, reference = previous page URL)
//     T2: Nano Banana Flash (gemini-2.5-flash-image, 16:9 native)
//     T3: sanitizePromptForPage1 → OpenAI gpt-image-1.5 (medium, 1536x1024)
//     Final: placeholder
//
// Why dual-engine fallback (PRODUCT_CONSTITUTION §4.2 + 教训 39):
//   - Nano Banana: fast (~7s), cheap, content-lenient, BUT IP-strict (拒 Cinderella/Disney)
//   - OpenAI:     IP-lenient (可画 Cinderella) BUT 儿童内容 78% 拒绝率
//   - 两家审核盲区互补,组合命中率 95%+
//
// Notes:
//   - cropAndResizeGeminiImage kept exported (tools/test_gemini_crop.js still imports)
//     but no longer called in production: Pro 2K + Flash both natively output 16:9
//     via generationConfig.imageConfig.aspectRatio.
//   - Imagen 3.0 removed (Google shuts Imagen 3/4 down 2026-06-24).
//   - Round-1/Round-2 Gemini rewrite kept as dead code for fast re-enablement.
//   - Age-based routing (isYoungAge / coverYoungBranch / coverOldBranch) removed —
//     v4 uses a single deterministic Cover chain. storyJob.js may still pass
//     `childAge` arg; it is now ignored.
//   - DEBUG_FORCE_OPENAI_FAIL kept (env-guarded, default off) for regression
//     testing of the fallback chain.
// ============================================================================

import env from '../config/env.js';
import sharp from 'sharp';
import {
  sanitizeImagePrompt,
  sanitizePromptForPage1,
  getStyleSuffix,
} from '../utils/storyPrompt.js';

// Target aspect for the TV cover (16:9 landscape).
const NB_TARGET_W = 1536;
const NB_TARGET_H = 1024;
const NB_TARGET_RATIO = NB_TARGET_W / NB_TARGET_H; // 1.5

// Crop + resize a Gemini Nano Banana image (typically 1024x1024) into the TV
// cover landscape format (1536x1024 PNG). Center-crops the largest 16:9 region
// then resizes. Robust to any input aspect: if input is already 16:9 or wider,
// we still center-crop the matching region; if it's a square or taller, we
// crop top+bottom evenly.
//
// NOTE (v4): No longer called in production — both Pro and Flash now request
// 16:9 natively via generationConfig.imageConfig.aspectRatio. Kept exported
// because tools/test_gemini_crop.js still imports it for unit testing.
//
// @param {Buffer} input  raw image bytes (PNG/JPEG/etc as returned by Gemini)
// @returns {Promise<Buffer>}  PNG bytes at exactly 1536x1024
export async function cropAndResizeGeminiImage(input) {
  if (!input || !Buffer.isBuffer(input)) {
    throw new Error('cropAndResizeGeminiImage: input must be a Buffer');
  }
  const meta = await sharp(input).metadata();
  const w = meta.width;
  const h = meta.height;
  if (!w || !h) throw new Error('cropAndResizeGeminiImage: invalid metadata');

  let pipeline = sharp(input);
  const aspect = w / h;
  if (aspect > NB_TARGET_RATIO) {
    const cropW = Math.round(h * NB_TARGET_RATIO);
    const left = Math.max(0, Math.round((w - cropW) / 2));
    pipeline = pipeline.extract({ left, top: 0, width: cropW, height: h });
  } else if (aspect < NB_TARGET_RATIO) {
    const cropH = Math.round(w / NB_TARGET_RATIO);
    const top = Math.max(0, Math.round((h - cropH) / 2));
    pipeline = pipeline.extract({ left: 0, top, width: w, height: cropH });
  }
  return pipeline.resize(NB_TARGET_W, NB_TARGET_H).png().toBuffer();
}

// ---------------------------------------------------------------------------
// Cost table — 4-dimension verified against official price pages 2026-04-26.
// All values in USD cents per image (rounded to integer for COST table; see
// per-line comments for exact USD).
// ---------------------------------------------------------------------------
//
//   Cover (Nano Banana Pro):
//     model=gemini-3-pro-image-preview, resolution=2K, aspect=16:9 native
//     per-image=$0.134  → 13 cents
//
//   Interior Nano fallback (Nano Banana Flash):
//     model=gemini-2.5-flash-image, aspect=16:9 native (default ~1K)
//     per-image=$0.039  → 4 cents
//
//   OpenAI (Cover/Interior shared fallback):
//     model=gpt-image-1.5, quality=medium, resolution=1536x1024 landscape
//     per-image=$0.050  → 5 cents
//
//   FAL Kontext (Interior primary):
//     model=fal-flux-kontext-pro, mode=img2img-chain, aspect=16:9
//     per-image=$0.040  → 4 cents
//
//   FAL Flux text2image (Cover Tier 3 fallback):
//     model=fal-flux/dev, image_size=landscape_16_9
//     per-image=$0.025  → 3 cents (legacy 'fal' key, kept for backward compat)
//
//   imagen 已废弃移除 (Google shuts Imagen 3/4 down 2026-06-24)
//
// Note: 'nano_banana' key holds the Flash/interior cost (4 cents) as the COST
// default; the Cover (Pro) call site passes a `costCents` override of 13 to
// runExec() so attempts logging records the correct per-image cost.
const COST = {
  openai: 5,
  openai_rewrite1: 5,
  openai_rewrite2: 5,
  nano_banana: 4,        // default = Flash interior; Cover Pro overrides to 13
  'fal-kontext': 4,
  fal: 3,
};
const COST_NANO_BANANA_COVER = 13;

const OPENAI_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5';
const OPENAI_QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'medium';

export function isMockMode() {
  if (process.env.USE_MOCK_AI === 'true' || process.env.USE_MOCK_AI === '1') return true;
  if (!env.FAL_KEY && !env.GEMINI_API_KEY && !env.OPENAI_API_KEY) return true;
  return false;
}

// --- Error classification -------------------------------------------------

export function isSafetyRejection(err) {
  const msg = String(err?.message || err?.error?.message || err || '').toLowerCase();
  if (!msg) return false;
  if (msg.includes('image_download_failed')) return false;
  if (msg.includes('timeout')) return false;
  if (msg.includes('econnreset')) return false;
  if (msg.includes('enotfound')) return false;
  if (err?.status >= 500) return false;
  const markers = [
    'safety system',
    'safety_violation',
    'safety violation',
    'moderation_blocked',
    'content_policy',
    'content policy',
    'your request was rejected',
    'rejected as a result of our safety system',
  ];
  return markers.some((m) => msg.includes(m));
}

// --- Gemini rewrite helpers (kept as dead code for fast re-enablement) ----

const REWRITE_PROMPT_ROUND1 = [
  'You are an expert at rewriting image generation prompts to pass OpenAI\'s image safety filters, especially the CSAM classifier which is hypersensitive to word combinations.',
  '',
  'Your job: rewrite the ORIGINAL PROMPT to generate the SAME visual scene but using wording that will not trigger the CSAM classifier.',
  '',
  'STRICT RULES:',
  '1. Do NOT mention children, kids, boys, girls, babies directly. Use "a young explorer", "a small figure", "a tiny dreamer" instead.',
  '2. Do NOT describe bedrooms, beds, bathrooms as indoor private spaces. Use "a cozy reading nook", "a small room with soft light", "a quiet corner" instead.',
  '3. Do NOT use "at night". Use "in the soft evening light", "at twilight", "under a warm amber lamp" instead.',
  '4. Do NOT use voyeuristic angles. Use "a warm intimate scene", "a gentle scene" instead.',
  '5. Keep ALL visual style words: watercolor, soft, pastel, illustrated, storybook — these are safe.',
  '6. Keep ALL animal characters — these are safe.',
  '7. Keep the core action and mood of the original.',
  '',
  'Output ONLY the rewritten prompt. No preamble, no quotes, no markdown.',
].join('\n');

const REWRITE_PROMPT_ROUND2 = [
  'You are rewriting an image generation prompt that was ALREADY REJECTED TWICE by OpenAI\'s safety system. This is the last attempt before falling back to another model.',
  '',
  'Rewrite the ORIGINAL PROMPT to be MAXIMALLY conservative:',
  '',
  '1. Remove any human character entirely if possible. Keep only animals and objects.',
  '2. If a human presence is essential, replace with a silhouette or back-view figure without age cues.',
  '3. Describe only objects, landscape, lighting, color. Treat it like a still life.',
  '4. Remove all indoor private-space descriptions. Move the scene outdoors.',
  '5. Keep the watercolor / storybook style words.',
  '',
  'Output ONLY the rewritten prompt. No preamble, no quotes, no markdown.',
].join('\n');

// eslint-disable-next-line no-unused-vars
async function geminiRewritePrompt(originalPrompt, round = 1) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
  const sysPrompt = round === 1 ? REWRITE_PROMPT_ROUND1 : REWRITE_PROMPT_ROUND2;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${sysPrompt}\n\nORIGINAL PROMPT:\n${originalPrompt}\n\nREWRITTEN PROMPT:` }],
        },
      ],
      generationConfig: { maxOutputTokens: 2048, temperature: 0.4 },
    }),
  });
  if (!resp.ok) {
    const txt = await safeText(resp);
    throw new Error(`gemini_rewrite_http_${resp.status}: ${txt.slice(0, 300)}`);
  }
  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = parts?.map((p) => p.text).filter(Boolean).join(' ').trim();
  if (!text) throw new Error('gemini_rewrite_empty_response');
  return text.replace(/^["'`]+|["'`]+$/g, '').trim();
}

// ---------------------------------------------------------------------------
// Cover — Page 1 (single chain, no age-routing)
//
// Chain: Nano Banana Pro → OpenAI → FAL flux/dev
// ---------------------------------------------------------------------------

export async function generateCoverImage(args) {
  // childAge is accepted but ignored in v4 (kept for backward compat with storyJob.js)
  const {
    imagePrompt,
    characterDesc = '',
    seed = '',
    onAttempt = null,
  } = args;
  const attempts = [];

  if (isMockMode()) {
    const mock = await mockProvider({ provider: 'nano_banana', pageNum: 1, seed });
    return finalizeRaw({
      imageUrl: mock.imageUrl,
      imageUrlHd: mock.imageUrlHd,
      provider: 'nano_banana',
      tier: 1,
      durationMs: 0,
      costCents: COST_NANO_BANANA_COVER,
      attempts: [{ provider: 'nano_banana', tier: 1, success: true, durationMs: 0, costCents: COST_NANO_BANANA_COVER, errorCode: null, errorMessage: null }],
      counters: { replacementHits: 0, comboDetected: false, aggressiveRewrite: false },
    });
  }

  const style = getStyleSuffix('default');
  const page1Res = sanitizePromptForPage1(imagePrompt);
  const sanitizedCore = page1Res.sanitized;
  const assemble = (core) => [characterDesc, core, style].filter(Boolean).join(', ');

  // T1: Nano Banana Pro (16:9 2K native, no sharp post-crop)
  {
    const finalPrompt = assemble(imagePrompt);
    const r = await runExec('nano_banana', 1, () => callNanoBanana(finalPrompt, true), COST_NANO_BANANA_COVER);
    if (onAttempt) await onAttempt(r.attempt);
    attempts.push(r.attempt);
    if (r.success) return finalizeFromExec(r, 'nano_banana', 1, attempts, page1Res, false);
  }

  // T2: sanitizer → OpenAI gpt-image-1.5 medium 1536x1024
  {
    const finalPrompt = assemble(sanitizedCore);
    const r = await runExec('openai', 2, () => callOpenAI(finalPrompt));
    if (onAttempt) await onAttempt(r.attempt);
    attempts.push(r.attempt);
    if (r.success) return finalizeFromExec(r, 'openai', 2, attempts, page1Res, false);
  }

  // T3: FAL flux/dev text2image (16:9 landscape)
  {
    const { finalPrompt } = sanitizeImagePrompt(sanitizedCore, { channel: 'fal', characterDesc });
    const r = await runExec('fal', 3, () => callFalText(finalPrompt));
    if (onAttempt) await onAttempt(r.attempt);
    attempts.push(r.attempt);
    if (r.success) return finalizeFromExec(r, 'fal', 3, attempts, page1Res, false);
  }

  return placeholderResult(1, attempts);
}

function finalizeFromExec(r, providerOut, tierOut, attempts, page1Res, aggressive) {
  return finalizeRaw({
    ...r.result,
    provider: providerOut,
    tier: tierOut,
    durationMs: r.attempt.durationMs,
    costCents: r.attempt.costCents,
    attempts,
    counters: {
      replacementHits: page1Res.replacedTerms?.length || 0,
      comboDetected: page1Res.replacedTerms?.includes('__triple_rewrite__') || false,
      aggressiveRewrite: aggressive,
    },
  });
}

// ---------------------------------------------------------------------------
// Pages 2-12 — interior chain (FAL Kontext → Nano Banana Flash → OpenAI)
//
// referenceImageUrl is supplied by the caller (storyJob.js). For chained
// reference (P2→P1, P3→P2, ..., P12→P11) the caller must pass the previous
// page's URL. This module accepts any URL the caller provides.
// ---------------------------------------------------------------------------

export async function generateSubsequentPage(args) {
  const {
    imagePrompt, characterDesc = '', pageNum = 2,
    referenceImageUrl, seed = '', onAttempt = null,
    forceText2Image = false,
  } = args;
  const attempts = [];

  if (isMockMode()) {
    const mock = await mockProvider({ provider: 'fal-kontext', pageNum, seed });
    const att = { provider: 'fal-kontext', tier: 1, success: true, durationMs: 0, costCents: COST['fal-kontext'], errorCode: null, errorMessage: null };
    attempts.push(att);
    if (onAttempt) await onAttempt(att);
    return finalizeRaw({
      imageUrl: mock.imageUrl,
      imageUrlHd: mock.imageUrlHd,
      provider: 'fal-kontext',
      tier: 1,
      durationMs: 0,
      costCents: COST['fal-kontext'],
      attempts,
      counters: { replacementHits: 0, comboDetected: false, aggressiveRewrite: false },
    });
  }

  // T1: FAL Kontext img2img (only when we have a real reference)
  if (referenceImageUrl && !forceText2Image) {
    const { finalPrompt, counters } = sanitizeImagePrompt(imagePrompt, { channel: 'fal', characterDesc });
    const r = await runExec('fal-kontext', 1, () => callFalKontext(finalPrompt, referenceImageUrl));
    if (onAttempt) await onAttempt(r.attempt);
    attempts.push(r.attempt);
    if (r.success) {
      return finalizeRaw({
        ...r.result,
        provider: 'fal-kontext',
        tier: 1,
        durationMs: r.attempt.durationMs,
        costCents: r.attempt.costCents,
        attempts,
        counters,
      });
    }
  }

  // T2: Nano Banana Flash (16:9 native, no reference)
  {
    const style = getStyleSuffix('default');
    const finalPrompt = [characterDesc, imagePrompt, style].filter(Boolean).join(', ');
    const r = await runExec('nano_banana', 2, () => callNanoBanana(finalPrompt, false));
    if (onAttempt) await onAttempt(r.attempt);
    attempts.push(r.attempt);
    if (r.success) {
      return finalizeRaw({
        ...r.result,
        provider: 'nano_banana',
        tier: 2,
        durationMs: r.attempt.durationMs,
        costCents: r.attempt.costCents,
        attempts,
        counters: { replacementHits: 0, comboDetected: false, aggressiveRewrite: false },
      });
    }
  }

  // T3: sanitizer → OpenAI gpt-image-1.5 medium (shared fallback)
  {
    const page1Res = sanitizePromptForPage1(imagePrompt);
    const style = getStyleSuffix('default');
    const finalPrompt = [characterDesc, page1Res.sanitized, style].filter(Boolean).join(', ');
    const r = await runExec('openai', 3, () => callOpenAI(finalPrompt));
    if (onAttempt) await onAttempt(r.attempt);
    attempts.push(r.attempt);
    if (r.success) {
      return finalizeRaw({
        ...r.result,
        provider: 'openai',
        tier: 3,
        durationMs: r.attempt.durationMs,
        costCents: r.attempt.costCents,
        attempts,
        counters: {
          replacementHits: page1Res.replacedTerms?.length || 0,
          comboDetected: page1Res.replacedTerms?.includes('__triple_rewrite__') || false,
          aggressiveRewrite: false,
        },
      });
    }
  }

  return placeholderResult(pageNum, attempts);
}

export async function generatePageImage(args) {
  const { pageNum = 1, referenceImageUrl = null } = args;
  if (pageNum === 1 && !referenceImageUrl) return generateCoverImage(args);
  return generateSubsequentPage(args);
}

// ---------------------------------------------------------------------------
// Execution helpers
// ---------------------------------------------------------------------------

async function runExec(provider, tier, exec, costOverride = null) {
  const start = Date.now();
  try {
    const result = await exec();
    const durationMs = Date.now() - start;
    return {
      success: true,
      result,
      attempt: {
        provider, tier, success: true, durationMs,
        costCents: costOverride ?? COST[provider] ?? 0,
        errorCode: null, errorMessage: null,
      },
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = String(err?.message || err);
    const safety = isSafetyRejection(err);
    const errorCode = safety ? 30003 : 30002;
    return {
      success: false,
      error: err,
      attempt: {
        provider, tier, success: false, durationMs,
        costCents: 0, errorCode, errorMessage: msg.slice(0, 500),
      },
    };
  }
}

function finalizeRaw({ imageUrl, imageUrlHd, provider, tier, durationMs, costCents, attempts, counters }) {
  return {
    imageUrl,
    imageUrlHd: imageUrlHd || imageUrl,
    provider,
    tier,
    durationMs,
    costCents,
    sanitizer: counters || { replacementHits: 0, comboDetected: false, aggressiveRewrite: false },
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

async function mockProvider({ provider, pageNum, seed }) {
  const key = `${seed}-p${pageNum}-${provider}`;
  return {
    imageUrl: `https://mock.wonderbear.app/img/${encodeURIComponent(key)}.webp`,
    imageUrlHd: `https://mock.wonderbear.app/img/${encodeURIComponent(key)}.hd.png`,
  };
}

// ---------------------------------------------------------------------------
// Provider calls
// ---------------------------------------------------------------------------

async function callOpenAI(prompt) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  // DEBUG: when DEBUG_FORCE_OPENAI_FAIL=1, simulate every OpenAI image call as a
  // safety rejection so the pipeline flows through the fallback chain. Used by
  // tools/probe_*.js regression scripts.
  if (process.env.DEBUG_FORCE_OPENAI_FAIL === '1' || process.env.DEBUG_FORCE_OPENAI_FAIL === 'true') {
    const err = new Error('DEBUG_FORCE_OPENAI_FAIL: Your request was rejected as a result of our safety system');
    err.status = 400;
    throw err;
  }
  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      prompt,
      size: '1536x1024',
      quality: OPENAI_QUALITY,
      n: 1,
    }),
  });
  if (!resp.ok) {
    const txt = await safeText(resp);
    const err = new Error(`OpenAI image HTTP ${resp.status}: ${txt.slice(0, 400)}`);
    err.status = resp.status;
    throw err;
  }
  const data = await resp.json();
  const entry = data?.data?.[0];
  if (!entry) throw new Error('OpenAI returned no image');
  if (entry.url) return { imageUrl: entry.url, imageUrlHd: entry.url };
  if (entry.b64_json) {
    const url = `data:image/png;base64,${entry.b64_json}`;
    return { imageUrl: url, imageUrlHd: url };
  }
  throw new Error('OpenAI response missing url and b64_json');
}

// Nano Banana — Cover (Pro 2K) vs Interior (Flash) split.
//
// @param {string}  prompt   final image prompt (already assembled w/ style suffix)
// @param {boolean} isCover  true → use Pro at 2K, false → use Flash (default 1K)
//
// generationConfig.imageConfig:
//   - aspectRatio '16:9' is set for both (Pro and Flash both honor this).
//   - imageSize '2K' is sent only for Cover (Pro). Flash interior does not
//     accept imageSize and would error if we set it.
//
// No sharp post-processing — both models output 16:9 natively now.
async function callNanoBanana(prompt, isCover = false) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
  const model = isCover
    ? (process.env.NANO_BANANA_COVER_MODEL || 'gemini-3-pro-image-preview')
    : (process.env.NANO_BANANA_INTERIOR_MODEL || 'gemini-2.5-flash-image');

  const imageConfig = { aspectRatio: '16:9' };
  if (isCover) {
    imageConfig.imageSize = process.env.NANO_BANANA_RESOLUTION || '2K';
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['Image'],
        imageConfig,
      },
    }),
  });
  if (!resp.ok) {
    const txt = await safeText(resp);
    const err = new Error(`nano_banana_http_${resp.status}: ${txt.slice(0, 400)}`);
    err.status = resp.status;
    throw err;
  }
  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p.inline_data || p.inlineData);
  if (!imagePart) throw new Error('nano_banana_no_image_in_response');
  const b64 = imagePart.inline_data?.data || imagePart.inlineData?.data;
  if (!b64) throw new Error('nano_banana_empty_image_data');
  // Native 16:9 — no sharp crop. Wrap as data URL for downstream uploader.
  const dataUrl = `data:image/png;base64,${b64}`;
  return { imageUrl: dataUrl, imageUrlHd: dataUrl };
}

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
      safety_tolerance: '6',
    }),
  });
  if (!resp.ok) {
    const txt = await safeText(resp);
    const err = new Error(`FAL-kontext HTTP ${resp.status}: ${txt.slice(0, 400)}`);
    err.status = resp.status;
    throw err;
  }
  const data = await resp.json();
  const url = data?.images?.[0]?.url;
  if (!url) throw new Error('FAL-kontext returned no image');
  return { imageUrl: url, imageUrlHd: url };
}

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
    const err = new Error(`FAL HTTP ${resp.status}: ${txt.slice(0, 400)}`);
    err.status = resp.status;
    throw err;
  }
  const data = await resp.json();
  const url = data?.images?.[0]?.url;
  if (!url) throw new Error('FAL returned no image');
  return { imageUrl: url, imageUrlHd: url };
}

// Public alias — Page 1 fallback B (text2image, no reference image needed).
// Wrapper around the existing FAL flux/dev call; kept for backward compat.
export async function callFalFluxT2I(prompt) {
  return callFalText(prompt);
}

async function safeText(resp) {
  try { return await resp.text(); } catch { return ''; }
}

function placeholderUrl(pageNum, variant = 'webp') {
  const kind = variant === 'hd' ? 'hd.png' : 'webp';
  return `https://mock.wonderbear.app/placeholder/page${pageNum}.${kind}`;
}
