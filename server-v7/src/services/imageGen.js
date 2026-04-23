// ============================================================================
// services/imageGen.js — cover-first + image-to-image fallback chain (v2)
//
// 2026-04-24 refactor per FACTORY_WORKORDER_2026_04_24_IMAGE_PIPELINE.md:
//   PAGE 1 (cover):
//     Try 1:  sanitizePromptForPage1 → OpenAI gpt-image-1
//     Try 2:  Gemini-2.5-flash rewrite (round 1) → OpenAI
//     Try 3:  Gemini rewrite (round 2, ultra-conservative) → OpenAI
//     Fallback A: Nano Banana (gemini-2.5-flash-image-preview)
//     Fallback B: FAL flux/dev text2image
//     Final:  placeholder
//
//   PAGE 2-12 (unchanged):
//     Tier 1: FAL flux-pro/kontext (img2img using page1 url as reference)
//     Tier 2: FAL flux/dev text2image
//     Final:  placeholder
//
// Imagen 3.0 is removed (Google shuts Imagen 3/4 down 2026-06-24).
// ============================================================================

import env from '../config/env.js';
import {
  sanitizeImagePrompt,
  sanitizePromptForPage1,
  getStyleSuffix,
} from '../utils/storyPrompt.js';

const COST = {
  openai: 4,
  openai_rewrite1: 4,
  openai_rewrite2: 4,
  nano_banana: 3,
  'fal-kontext': 4,
  fal: 4,
};

const OPENAI_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

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

// --- Gemini rewrite helpers -----------------------------------------------

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
// Cover — Page 1
// ---------------------------------------------------------------------------

export async function generateCoverImage(args) {
  const { imagePrompt, characterDesc = '', seed = '', onAttempt = null } = args;
  const attempts = [];

  if (isMockMode()) {
    const mock = await mockProvider({ provider: 'openai', pageNum: 1, seed });
    return finalizeRaw({
      imageUrl: mock.imageUrl,
      imageUrlHd: mock.imageUrlHd,
      provider: 'openai',
      tier: 1,
      durationMs: 0,
      costCents: COST.openai,
      attempts: [{ provider: 'openai', tier: 1, success: true, durationMs: 0, costCents: COST.openai, errorCode: null, errorMessage: null }],
      counters: { replacementHits: 0, comboDetected: false, aggressiveRewrite: false },
    });
  }

  const style = getStyleSuffix('default');
  const page1Res = sanitizePromptForPage1(imagePrompt);
  const sanitizedCore = page1Res.sanitized;
  const assemble = (core) => [characterDesc, core, style].filter(Boolean).join(', ');

  // --- Try 1: static dictionary → OpenAI ----------------------------------
  {
    const finalPrompt = assemble(sanitizedCore);
    const r = await runExec('openai', 1, () => callOpenAI(finalPrompt));
    if (onAttempt) await onAttempt(r.attempt);
    attempts.push(r.attempt);
    if (r.success) {
      return finalizeRaw({
        ...r.result,
        provider: 'openai',
        tier: 1,
        durationMs: r.attempt.durationMs,
        costCents: r.attempt.costCents,
        attempts,
        counters: { replacementHits: page1Res.replacedTerms.length, comboDetected: page1Res.replacedTerms.includes('__triple_rewrite__'), aggressiveRewrite: false },
      });
    }
    if (!isSafetyRejection(r.error)) {
      // Non-safety error (network/5xx). Skip to Nano Banana / FAL directly —
      // retrying the same prompt through Gemini rewrite won't help.
      return coverFallbacks({ sanitizedCore, characterDesc, style, attempts, onAttempt, page1Res });
    }
  }

  // --- Try 2: Gemini rewrite round 1 → OpenAI -----------------------------
  let rewritten1 = null;
  try {
    rewritten1 = await geminiRewritePrompt(sanitizedCore, 1);
  } catch (err) {
    attempts.push({ provider: 'gemini_rewrite_r1', tier: 2, success: false, durationMs: 0, costCents: 0, errorCode: 30004, errorMessage: String(err?.message || err).slice(0, 500) });
    if (onAttempt) await onAttempt(attempts[attempts.length - 1]);
  }
  if (rewritten1) {
    const finalPrompt = assemble(rewritten1);
    const r = await runExec('openai_rewrite1', 2, () => callOpenAI(finalPrompt));
    if (onAttempt) await onAttempt(r.attempt);
    attempts.push(r.attempt);
    if (r.success) {
      return finalizeRaw({
        ...r.result,
        provider: 'openai',
        tier: 2,
        durationMs: r.attempt.durationMs,
        costCents: r.attempt.costCents,
        attempts,
        counters: { replacementHits: page1Res.replacedTerms.length, comboDetected: page1Res.replacedTerms.includes('__triple_rewrite__'), aggressiveRewrite: true },
      });
    }
    if (!isSafetyRejection(r.error)) {
      return coverFallbacks({ sanitizedCore, characterDesc, style, attempts, onAttempt, page1Res });
    }
  }

  // --- Try 3: Gemini rewrite round 2 (conservative) → OpenAI --------------
  let rewritten2 = null;
  try {
    rewritten2 = await geminiRewritePrompt(sanitizedCore, 2);
  } catch (err) {
    attempts.push({ provider: 'gemini_rewrite_r2', tier: 3, success: false, durationMs: 0, costCents: 0, errorCode: 30004, errorMessage: String(err?.message || err).slice(0, 500) });
    if (onAttempt) await onAttempt(attempts[attempts.length - 1]);
  }
  if (rewritten2) {
    const finalPrompt = assemble(rewritten2);
    const r = await runExec('openai_rewrite2', 3, () => callOpenAI(finalPrompt));
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
        counters: { replacementHits: page1Res.replacedTerms.length, comboDetected: page1Res.replacedTerms.includes('__triple_rewrite__'), aggressiveRewrite: true },
      });
    }
  }

  return coverFallbacks({ sanitizedCore, characterDesc, style, attempts, onAttempt, page1Res });
}

async function coverFallbacks({ sanitizedCore, characterDesc, style, attempts, onAttempt, page1Res }) {
  const assemble = (core) => [characterDesc, core, style].filter(Boolean).join(', ');

  // Fallback A: Nano Banana
  {
    const r = await runExec('nano_banana', 4, () => callNanoBanana(assemble(sanitizedCore)));
    if (onAttempt) await onAttempt(r.attempt);
    attempts.push(r.attempt);
    if (r.success) {
      return finalizeRaw({
        ...r.result,
        provider: 'nano_banana',
        tier: 4,
        durationMs: r.attempt.durationMs,
        costCents: r.attempt.costCents,
        attempts,
        counters: { replacementHits: page1Res.replacedTerms.length, comboDetected: false, aggressiveRewrite: false },
      });
    }
  }

  // Fallback B: FAL flux/dev text2image
  {
    const { finalPrompt } = sanitizeImagePrompt(sanitizedCore, { channel: 'fal', characterDesc });
    const r = await runExec('fal', 5, () => callFalText(finalPrompt));
    if (onAttempt) await onAttempt(r.attempt);
    attempts.push(r.attempt);
    if (r.success) {
      return finalizeRaw({
        ...r.result,
        provider: 'fal',
        tier: 5,
        durationMs: r.attempt.durationMs,
        costCents: r.attempt.costCents,
        attempts,
        counters: { replacementHits: page1Res.replacedTerms.length, comboDetected: false, aggressiveRewrite: false },
      });
    }
  }

  return placeholderResult(1, attempts);
}

// ---------------------------------------------------------------------------
// Pages 2-12 — unchanged logic (FAL Kontext → FAL text → placeholder)
// ---------------------------------------------------------------------------

export async function generateSubsequentPage(args) {
  const {
    imagePrompt, characterDesc = '', pageNum = 2,
    referenceImageUrl, seed = '', onAttempt = null,
    forceText2Image = false,
  } = args;
  const attempts = [];

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

  {
    const { finalPrompt, counters } = sanitizeImagePrompt(imagePrompt, { channel: 'fal', characterDesc });
    const r = await runExec('fal', 2, () => callFalText(finalPrompt));
    if (onAttempt) await onAttempt(r.attempt);
    attempts.push(r.attempt);
    if (r.success) {
      return finalizeRaw({
        ...r.result,
        provider: 'fal',
        tier: 2,
        durationMs: r.attempt.durationMs,
        costCents: r.attempt.costCents,
        attempts,
        counters,
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

async function runExec(provider, tier, exec) {
  const start = Date.now();
  try {
    const result = await exec();
    const durationMs = Date.now() - start;
    return {
      success: true,
      result,
      attempt: {
        provider, tier, success: true, durationMs,
        costCents: COST[provider] ?? 0,
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
      quality: 'medium',
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

// Nano Banana (Gemini 2.5 Flash Image Preview) — implemented in Phase 3.
async function callNanoBanana(prompt) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
  const model = process.env.NANO_BANANA_MODEL || 'gemini-2.5-flash-image';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['Image'] },
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
  const mime = imagePart.inline_data?.mime_type || imagePart.inlineData?.mimeType || 'image/png';
  const dataUrl = `data:${mime};base64,${b64}`;
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

async function safeText(resp) {
  try { return await resp.text(); } catch { return ''; }
}

function placeholderUrl(pageNum, variant = 'webp') {
  const kind = variant === 'hd' ? 'hd.png' : 'webp';
  return `https://mock.wonderbear.app/placeholder/page${pageNum}.${kind}`;
}
