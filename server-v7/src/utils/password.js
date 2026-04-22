// ============================================================================
// Password utilities — bcrypt hashing + strength validation.
//
// Per API_CONTRACT §4.2:
//   - Password is OPTIONAL at registration (code-login is primary path).
//   - When set: min 8 chars, must contain at least one letter and one digit.
//   - Wrong password returns PASSWORD_WRONG (10007). Account-less password
//     login also returns PASSWORD_WRONG (never PASSWORD_NOT_SET) to prevent
//     account enumeration.
//
// bcryptjs rounds = 12 (Step A used 10 — we bumped per HANDOFF_BATCH2).
// At 12 rounds, hash latency is ~250ms on a modern x86 CPU; acceptable for
// login-rate endpoints but NOT for per-request crypto (don't call this in
// a hot path).
// ============================================================================

import bcrypt from 'bcryptjs';

export const BCRYPT_ROUNDS = 12;

/**
 * Hash a plaintext password. Always use this before storing to DB.
 * @param {string} plain
 * @returns {Promise<string>} bcrypt hash (`$2a$12$...`)
 */
export async function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('hashPassword: plain must be non-empty string');
  }
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Verify a plaintext password against a stored hash. Constant-time by bcrypt.
 * Returns false (not throws) if hash is null/empty — lets routes treat
 * "no password set" identically to "wrong password" for anti-enumeration.
 * @param {string} plain
 * @param {string|null|undefined} hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plain, hash) {
  if (typeof plain !== 'string' || plain.length === 0) return false;
  if (typeof hash !== 'string' || hash.length === 0) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * Check password strength per API_CONTRACT §4.2:
 *   - >= 8 chars
 *   - contains at least one letter (any unicode letter class approximation: [A-Za-z])
 *   - contains at least one digit
 *
 * Returns { valid: boolean, reason?: string }. Routes should throw
 * BizError(PASSWORD_TOO_WEAK, 10009) when !valid.
 * @param {string} plain
 */
export function validatePasswordStrength(plain) {
  if (typeof plain !== 'string') {
    return { valid: false, reason: 'not a string' };
  }
  if (plain.length < 8) {
    return { valid: false, reason: 'too short (min 8)' };
  }
  if (!/[A-Za-z]/.test(plain)) {
    return { valid: false, reason: 'missing letter' };
  }
  if (!/[0-9]/.test(plain)) {
    return { valid: false, reason: 'missing digit' };
  }
  return { valid: true };
}
