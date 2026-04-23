// ============================================================================
// Pricing — per-operation cost estimates in integer US cents.
//
// Used by story job to populate ImageGenLog.costCents and roll up to
// Story.genCostCents. Prices reflect public list prices as of 2026-04 and
// are TABLES, not runtime calls — we can always adjust later without a
// schema migration.
//
// Keep numbers conservative (slightly above street price) so Story.genCostCents
// is a safe UPPER bound, not a surprise-downside estimate.
// ============================================================================

export const IMAGE_COST_CENTS = Object.freeze({
  fal:    4,  // Flux-schnell ≈ $0.04
  imagen: 4,  // Gemini Imagen 3 ≈ $0.04
  openai: 5,  // gpt-image-1.5 ≈ $0.05
});

// Per 1k tokens for gpt-4o / gemini-2.0-flash. Story job typically uses
// ~3k tokens (context) + ~2k tokens (output).
export const LLM_COST_CENTS_PER_1K = Object.freeze({
  'gpt-4o':           250,    // $2.50 / 1M input  → $0.0025 / 1k  → cents×100
  'gpt-4o-output':    1000,   // $10   / 1M out
  'gemini-2.0-flash': 7,      // $0.075 / 1M input → ~$0.0001/1k  (keep round)
  'gemini-2.0-flash-output': 30,
});

// ElevenLabs: ~$0.18 per 1k characters (Multilingual v2 rate).
export const TTS_COST_CENTS_PER_1K_CHARS = 18;

// Whisper: $0.006 per minute → ~0.1¢ per second. We charge per 1s.
export const ASR_COST_CENTS_PER_SECOND = 1;

/**
 * Story LLM cost: single expansion call with rough token split.
 * Returns integer cents; used at story.status.done to write genCostCents.
 */
export function estimateLlmCostCents(model, inputTokens = 2500, outputTokens = 2000) {
  const inKey = model;
  const outKey = `${model}-output`;
  const inRate = LLM_COST_CENTS_PER_1K[inKey] ?? 0;
  const outRate = LLM_COST_CENTS_PER_1K[outKey] ?? 0;
  const cents = Math.ceil(
    (inputTokens / 1000) * (inRate / 100) + (outputTokens / 1000) * (outRate / 100),
  );
  return Math.max(0, cents);
}

export function imageCostCents(provider) {
  return IMAGE_COST_CENTS[provider] ?? 0;
}

export function ttsCostCents(charCount) {
  if (typeof charCount !== 'number' || charCount <= 0) return 0;
  return Math.ceil((charCount / 1000) * TTS_COST_CENTS_PER_1K_CHARS);
}

export function asrCostCents(durationMs) {
  if (typeof durationMs !== 'number' || durationMs <= 0) return 0;
  return Math.ceil((durationMs / 1000) * ASR_COST_CENTS_PER_SECOND);
}

/** Sum helper for Story.genCostCents aggregation. */
export function totalStoryCostCents({ llmCents = 0, imageLogs = [], ttsChars = 0, asrDurationMs = 0 } = {}) {
  const imageCents = imageLogs.reduce((sum, log) => sum + (log.costCents ?? 0), 0);
  return llmCents + imageCents + ttsCostCents(ttsChars) + asrCostCents(asrDurationMs);
}
