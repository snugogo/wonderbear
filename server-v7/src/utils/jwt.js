// ============================================================================
// JWT utilities — sign/verify three token types: parent / device / seller.
//
// Per API_CONTRACT §1.3:
//   Payload shape: { sub: <id>, type: 'parent'|'device'|'seller', iat, exp }
//   TTLs:          parent = 7d, device = 30d, seller = 1d
//
// This module is a THIN wrapper. Actual signing uses @fastify/jwt (registered
// on the Fastify instance). Routes get a decorated method `fastify.jwt.sign`,
// but we encapsulate TTL + type literals here so handlers never pass them by
// hand (reduces risk of type-confusion bugs).
//
// Token verification and type-enforcement lives in plugins/auth.js.
// ============================================================================

import { createHash } from 'node:crypto';

export const TOKEN_TYPES = Object.freeze({
  PARENT: 'parent',
  DEVICE: 'device',
  SELLER: 'seller',
});

// Seconds for JWT `expiresIn` option.
export const TOKEN_TTL_SECONDS = Object.freeze({
  parent: 7 * 24 * 60 * 60,    // 7 days
  device: 30 * 24 * 60 * 60,   // 30 days
  seller: 1 * 24 * 60 * 60,    // 1 day
});

/**
 * Sign a parent token. Used by /api/auth/{register,login-code,login-password,refresh}.
 * @param {import('fastify').FastifyInstance} fastify
 * @param {string} parentId
 * @returns {Promise<{token: string, expiresAt: string}>}
 */
export async function signParentToken(fastify, parentId) {
  return signToken(fastify, parentId, TOKEN_TYPES.PARENT);
}

/**
 * Sign a device token. Used by /api/device/register (batch 3).
 * Exposed here so batch 2 unit tests can exercise the TTL math.
 */
export async function signDeviceToken(fastify, deviceId) {
  return signToken(fastify, deviceId, TOKEN_TYPES.DEVICE);
}

/**
 * Sign a seller token. Used by /api/seller/login (batch 7).
 */
export async function signSellerToken(fastify, sellerId) {
  return signToken(fastify, sellerId, TOKEN_TYPES.SELLER);
}

/**
 * Generic signer. All three public helpers funnel through here so the
 * TTL/type invariant is enforced in one place.
 */
async function signToken(fastify, sub, type) {
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new Error(`signToken: sub must be non-empty string (got ${typeof sub})`);
  }
  const ttl = TOKEN_TTL_SECONDS[type];
  if (!ttl) throw new Error(`signToken: unknown type ${type}`);

  const token = await fastify.jwt.sign({ sub, type }, { expiresIn: ttl });

  // Compute expiresAt ISO 8601 — used by /api/auth/refresh response.
  // We rely on iat being "now" at sign time.
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  return { token, expiresAt };
}

/**
 * Decode a JWT and enforce the `type` field. Does NOT check revocation —
 * that's plugins/auth.js's responsibility (it also owns the Redis blacklist
 * check and translates outcomes into BizError instances).
 *
 * Returns the decoded payload on success.
 * Throws the underlying jwt error on signature/expiry failure — caller
 * must catch and map. On type mismatch throws a sentinel Error with
 * .tokenTypeMismatch=true.
 *
 * @param {import('fastify').FastifyInstance} fastify
 * @param {string} token
 * @param {string} expectedType 'parent'|'device'|'seller'
 */
export async function verifyTokenOfType(fastify, token, expectedType) {
  const payload = await fastify.jwt.verify(token);
  if (payload?.type !== expectedType) {
    const err = new Error(
      `token type mismatch: expected ${expectedType}, got ${payload?.type}`,
    );
    err.tokenTypeMismatch = true;
    err.actualType = payload?.type ?? null;
    throw err;
  }
  return payload;
}

/**
 * Hash a token for Redis blacklist key. SHA-256 keeps keys fixed-size and
 * avoids storing raw tokens in Redis (defense-in-depth against log leaks).
 */
export function hashTokenForBlacklist(token) {
  return createHash('sha256').update(token).digest('hex');
}
