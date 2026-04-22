// ============================================================================
// Response utilities — build v7 envelopes per API_CONTRACT §1.2
//
// Two paths:
//   - ok(data)         → returned from route handlers; onSend hook wraps
//   - throw new BizError(code, details?, actions?)
//                      → caught by errorHandler, converted to fail() envelope
//
// BizError carries the numeric code only — locale and requestId resolution
// happen in the error handler (single source of truth, easier to test).
// ============================================================================

import { getMessageBundle, getName } from './errorCodes.js';

/**
 * Throw this from any route to signal a business-layer failure.
 * The global errorHandler converts it into the v7 error envelope.
 *
 * @param {number} code     5-digit error code from ErrorCodes
 * @param {object} [opts]
 * @param {object} [opts.details]  Extra context (e.g. { storiesLeft: 0 })
 * @param {Array}  [opts.actions]  Suggested next-step actions for client UI
 * @param {string} [opts.localeOverride]  Force a specific locale (rare)
 * @param {string} [opts.cause]    Original error message for logging
 */
export class BizError extends Error {
  constructor(code, opts = {}) {
    const name = getName(code);
    super(`${name} (${code})`);
    this.name = 'BizError';
    this.bizCode = code;
    this.details = opts.details ?? null;
    this.actions = opts.actions ?? null;
    this.localeOverride = opts.localeOverride ?? null;
    this.cause = opts.cause ?? null;
    // Mark so error handler can distinguish from generic Errors
    this.isBizError = true;
  }
}

/**
 * Wrap business data in a success envelope. Routes can use this OR just
 * return the bare object — onSend hook (responseEnvelope plugin) handles
 * both cases. Using ok() is preferred for clarity.
 */
export function ok(data = null) {
  return { __envelope: 'ok', data };
}

/**
 * Build a failure envelope. Mostly used internally by the error handler;
 * routes should `throw new BizError(...)` instead of building these by hand.
 *
 * @param {number} code
 * @param {string} requestId
 * @param {object} opts  { locale, details, actions }
 */
export function fail(code, requestId, opts = {}) {
  const locale = opts.locale ?? 'en';
  const bundle = getMessageBundle(code, locale);
  const env = {
    code,
    ...bundle,
    requestId,
  };
  if (opts.details != null) env.details = opts.details;
  if (opts.actions != null) env.actions = opts.actions;
  return env;
}

/**
 * Check if an object is already a fully-formed v7 envelope (has `code` field
 * and either `data` or `message`). Used by the onSend hook to avoid
 * double-wrapping responses that build their own envelope (e.g. health route
 * during batch 0, or webhook routes that need raw shapes).
 */
export function isEnvelope(obj) {
  if (obj == null || typeof obj !== 'object') return false;
  if (typeof obj.code !== 'number') return false;
  // Either success ({code:0, data, requestId}) or failure ({code, message, requestId})
  return 'data' in obj || 'message' in obj;
}
