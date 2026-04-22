// ============================================================================
// Verification code utilities — 6-digit numeric codes with Redis storage.
//
// Per API_CONTRACT §4.1:
//   - 6 digits, numeric only (no letters — avoids 0/O, 1/l confusion).
//   - TTL 300s (5 minutes).
//   - 3 attempts per issued code; on 4th wrong attempt, code is wiped.
//   - Send cooldown: 60s per email.
//   - Hourly cap: 3 sends per email per hour.
//
// Redis key layout (documented in HANDOFF_BATCH2 §"反爆破"):
//   auth:verify:{email}:{purpose}       value="{code}:{attemptsLeft}"  TTL 300
//   auth:verify:cooldown:{email}        value="1"                       TTL 60
//   auth:verify:hourly:{email}          value=<integer counter>         TTL 3600
//
// purpose ∈ {'register', 'login'} (API_CONTRACT §4.1 Request.purpose).
// Email is normalized (lowercased + trimmed) by callers BEFORE hitting
// these helpers, so keys are stable.
// ============================================================================

import { randomInt } from 'node:crypto';

export const CODE_TTL_SECONDS = 300;          // 5 min
export const SEND_COOLDOWN_SECONDS = 60;       // 1 min
export const HOURLY_SEND_CAP = 3;
export const HOURLY_WINDOW_SECONDS = 3600;
export const MAX_ATTEMPTS = 3;

export const SUPPORTED_PURPOSES = Object.freeze(['register', 'login']);

// --------------------------------------------------------------------------
// Key builders — kept private so no caller can diverge from the layout.
// --------------------------------------------------------------------------
function keyCode(email, purpose)     { return `auth:verify:${email}:${purpose}`; }
function keyCooldown(email)          { return `auth:verify:cooldown:${email}`; }
function keyHourly(email)            { return `auth:verify:hourly:${email}`; }

// --------------------------------------------------------------------------
// Code generation
// --------------------------------------------------------------------------
/**
 * Generate a 6-digit numeric code as a zero-padded string.
 * Uses crypto.randomInt for uniform distribution (not Math.random).
 */
export function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// --------------------------------------------------------------------------
// Send-side: cooldown + hourly quota
// --------------------------------------------------------------------------
/**
 * Before sending a code, call this. Returns:
 *   { allowed: true }                       — proceed to send + storeCode
 *   { allowed: false, reason: 'cooldown', retryAfter: <seconds> }
 *   { allowed: false, reason: 'hourly',   retryAfter: <seconds> }
 *
 * Retry-after is derived from Redis TTL; callers echo it into the 90003
 * BizError's details.nextRetryAfter.
 *
 * @param {import('ioredis').Redis} redis
 * @param {string} email  already normalized
 */
export async function checkSendAllowed(redis, email) {
  // Cooldown check
  const cooldownTtl = await redis.ttl(keyCooldown(email));
  if (cooldownTtl > 0) {
    return { allowed: false, reason: 'cooldown', retryAfter: cooldownTtl };
  }

  // Hourly cap — we only bump the counter in markSent(), checking here keeps
  // read vs write logically separate for easier reasoning.
  const hourlyRaw = await redis.get(keyHourly(email));
  const hourlyCount = hourlyRaw ? parseInt(hourlyRaw, 10) : 0;
  if (hourlyCount >= HOURLY_SEND_CAP) {
    const hourlyTtl = await redis.ttl(keyHourly(email));
    return {
      allowed: false,
      reason: 'hourly',
      retryAfter: hourlyTtl > 0 ? hourlyTtl : HOURLY_WINDOW_SECONDS,
    };
  }

  return { allowed: true };
}

/**
 * After a successful send, call this to:
 *   - set cooldown (60s)
 *   - INCR hourly counter (and set TTL if newly created)
 *
 * We do this AFTER sending so that send failures don't punish the user.
 * If the send itself takes longer than the cooldown window (unusual),
 * double-sends are still prevented because storeCode() overwrites the
 * existing code key with fresh TTL.
 */
export async function markSent(redis, email) {
  await redis.setex(keyCooldown(email), SEND_COOLDOWN_SECONDS, '1');

  // INCR returns the new value; if it's 1, set the TTL (just created).
  const newCount = await redis.incr(keyHourly(email));
  if (newCount === 1) {
    await redis.expire(keyHourly(email), HOURLY_WINDOW_SECONDS);
  }
}

// --------------------------------------------------------------------------
// Code storage + verification
// --------------------------------------------------------------------------
/**
 * Store the issued code for a given email+purpose. Always overwrites any
 * existing key (resending a code invalidates the previous one AND resets
 * the attempts counter to MAX_ATTEMPTS).
 */
export async function storeCode(redis, email, purpose, code) {
  if (!SUPPORTED_PURPOSES.includes(purpose)) {
    throw new Error(`storeCode: invalid purpose ${purpose}`);
  }
  const value = `${code}:${MAX_ATTEMPTS}`;
  await redis.setex(keyCode(email, purpose), CODE_TTL_SECONDS, value);
}

/**
 * Verify a submitted code. Returns:
 *   { ok: true }                                                   — match, code wiped
 *   { ok: false, reason: 'expired' }                                — no key (TTL elapsed or never issued)
 *   { ok: false, reason: 'mismatch', attemptsLeft: number }         — wrong code, decremented
 *   { ok: false, reason: 'mismatch', attemptsLeft: 0 }              — last attempt burned, code now wiped
 *
 * Routes should map:
 *   expired           → BizError(VERIFY_CODE_EXPIRED, 10004)
 *   mismatch          → BizError(VERIFY_CODE_INVALID, 10002) + details.attemptsLeft
 *
 * The stored value is rewritten with decremented attempt count if still > 0;
 * deleted when the attempt hit 0 (matches "3 次错锁" contract).
 */
export async function verifyCode(redis, email, purpose, submitted) {
  if (!SUPPORTED_PURPOSES.includes(purpose)) {
    throw new Error(`verifyCode: invalid purpose ${purpose}`);
  }
  const k = keyCode(email, purpose);
  const raw = await redis.get(k);

  if (!raw) {
    return { ok: false, reason: 'expired' };
  }

  const [storedCode, attemptsStr] = String(raw).split(':');
  const attemptsLeft = parseInt(attemptsStr, 10);

  if (storedCode === submitted) {
    // Success — consume (single-use) by deleting the key.
    await redis.del(k);
    return { ok: true };
  }

  // Mismatch — decrement; if that brings us to 0, wipe.
  const remaining = attemptsLeft - 1;
  if (remaining <= 0) {
    await redis.del(k);
    return { ok: false, reason: 'mismatch', attemptsLeft: 0 };
  }

  // Preserve the original TTL (don't reset to CODE_TTL_SECONDS on every
  // attempt — that would let an attacker indefinitely extend the window).
  const ttl = await redis.ttl(k);
  const newValue = `${storedCode}:${remaining}`;
  if (ttl > 0) {
    await redis.setex(k, ttl, newValue);
  } else {
    // Unexpected: key exists but TTL=-1 (no TTL). Reset TTL defensively.
    await redis.setex(k, CODE_TTL_SECONDS, newValue);
  }
  return { ok: false, reason: 'mismatch', attemptsLeft: remaining };
}

// --------------------------------------------------------------------------
// Helpers exposed for testing / dev tools
// --------------------------------------------------------------------------
/** Peek at the stored code without consuming/decrementing (dev tool only). */
export async function peekCode(redis, email, purpose) {
  const raw = await redis.get(keyCode(email, purpose));
  if (!raw) return null;
  const [code, attemptsStr] = String(raw).split(':');
  return { code, attemptsLeft: parseInt(attemptsStr, 10) };
}

/** Wipe all verify-code related state for an email. Used by /api/dev/reset-code. */
export async function resetForEmail(redis, email) {
  const keys = [
    keyCode(email, 'register'),
    keyCode(email, 'login'),
    keyCooldown(email),
    keyHourly(email),
  ];
  await redis.del(...keys);
}
