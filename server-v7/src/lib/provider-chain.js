// ============================================================================
// lib/provider-chain.js — generic primary/fallback provider runner
//
// Workorder: 2026-04-29-asr-tts-dual-provider §3.4
//
// Use case:
//   ASR / TTS / image-gen all need a "try primary, fall back to N alternates"
//   pattern. This module centralises that pattern so each service module can
//   focus on the actual upstream call.
//
// Public API:
//   callWithFallback(providers, args, options) → { result, provider, latencyMs, attempts }
//   ProviderError(message, { status, provider, cause, isClientError })
//
// Fallback rules:
//   - timeout / network error / 5xx / 401 / 403 / 408 / 429    → try next provider
//   - 4xx (excluding 401/403/408/429) → treat as CLIENT error  → DO NOT fall
//                                                                back, rethrow.
//   - all providers exhausted → throw last error (multi-cause via .attempts)
//
// Logging:
//   By default writes to console.warn / console.info. Pass a logger override
//   via options.logger ({ info(msg), warn(msg) }).
//
// Each provider entry shape:
//   { name: 'google', fn: async (args, signal) => result, timeout?: number }
//
// `fn` is invoked with (args, abortSignal). If it respects the AbortSignal,
// timeouts are clean. If it doesn't, the runner will still resolve/reject,
// but the in-flight request may continue in the background until completion.
// ============================================================================

export class ProviderError extends Error {
  /**
   * @param {string} message
   * @param {object} opts
   * @param {number} [opts.status]         HTTP status (or undefined for non-HTTP)
   * @param {string} [opts.provider]       Logical provider name (e.g. 'google')
   * @param {Error}  [opts.cause]          Original error, for chaining
   * @param {boolean} [opts.isClientError] True ⇢ DO NOT fall back, rethrow.
   *                                       Defaults to (status >= 400 && status < 500
   *                                       && status not in {401,403,408,429}).
   */
  constructor(message, { status, provider, cause, isClientError } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.provider = provider;
    this.cause = cause;
    if (isClientError === undefined) {
      this.isClientError =
        typeof status === 'number' &&
        status >= 400 &&
        status < 500 &&
        status !== 401 &&
        status !== 403 &&
        status !== 408 &&
        status !== 429;
    } else {
      this.isClientError = !!isClientError;
    }
  }
}

/**
 * Returns true if the given error should stop the fallback chain (do NOT
 * try the next provider). Currently: a ProviderError flagged isClientError.
 */
export function isClientError(err) {
  if (!err) return false;
  if (err.isClientError === true) return true;
  // Aborts due to timeout are NOT client errors (we want to fallback).
  if (err.name === 'AbortError') return false;
  return false;
}

/**
 * Run `fn(args, signal)` with a timeout. If the timeout fires, the signal
 * is aborted and the runner rejects with an Error whose name is 'AbortError'.
 *
 * If the underlying fn ignores the signal, the rejection still happens, but
 * the upstream request may continue in the background.
 */
async function runWithTimeout(fn, args, timeoutMs) {
  const ctrl = new AbortController();
  let timer;
  const timed = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error(`provider timeout after ${timeoutMs}ms`);
      e.name = 'AbortError';
      ctrl.abort(e);
      reject(e);
    }, timeoutMs);
  });
  try {
    return await Promise.race([fn(args, ctrl.signal), timed]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Try providers[0], then providers[1], ... until one succeeds or all fail.
 *
 * @template T
 * @param {Array<{name:string, fn:(args:any, signal:AbortSignal)=>Promise<T>, timeout?:number}>} providers
 * @param {any} args
 * @param {object} [options]
 * @param {number} [options.defaultTimeoutMs=10000]
 * @param {{info(msg):void, warn(msg):void}} [options.logger]
 * @param {string} [options.kind]  Logical operation name (e.g. 'asr', 'tts')
 *                                 used in log lines for grep-ability.
 * @returns {Promise<{result:T, provider:string, latencyMs:number, attempts:Array}>}
 */
export async function callWithFallback(providers, args, options = {}) {
  if (!Array.isArray(providers) || providers.length === 0) {
    throw new Error('callWithFallback: providers list is empty');
  }
  const logger = options.logger || console;
  const kind = options.kind || 'provider';
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 10000;

  const attempts = [];
  let lastErr = null;

  for (const p of providers) {
    if (!p || typeof p.fn !== 'function' || typeof p.name !== 'string') {
      throw new Error('callWithFallback: invalid provider entry');
    }
    const t0 = Date.now();
    const timeout = p.timeout ?? defaultTimeoutMs;
    try {
      const result = await runWithTimeout(p.fn, args, timeout);
      const latencyMs = Date.now() - t0;
      logger.info(
        `[${kind}] provider=${p.name} ok latency=${latencyMs}ms`,
      );
      attempts.push({ provider: p.name, ok: true, latencyMs });
      return { result, provider: p.name, latencyMs, attempts };
    } catch (err) {
      const latencyMs = Date.now() - t0;
      const status = err && typeof err.status === 'number' ? err.status : null;
      attempts.push({
        provider: p.name,
        ok: false,
        latencyMs,
        status,
        error: err?.message || String(err),
      });
      if (isClientError(err)) {
        // Hard client error (e.g. 400 invalid audio format).
        // Do NOT try the next provider — it would just waste quota.
        logger.warn(
          `[${kind}] provider=${p.name} client_error status=${status} msg="${err.message}" — NOT falling back`,
        );
        throw err;
      }
      logger.warn(
        `[${kind}] provider=${p.name} failed status=${status ?? 'n/a'} msg="${err?.message || err}" — falling back`,
      );
      lastErr = err;
    }
  }

  // All providers exhausted. Re-raise the last error with attempt history.
  const aggregate = new Error(
    `[${kind}] all providers failed: ` +
      attempts
        .map((a) => `${a.provider}(${a.status ?? 'n/a'}: ${a.error})`)
        .join(' | '),
  );
  aggregate.attempts = attempts;
  aggregate.lastError = lastErr;
  throw aggregate;
}
