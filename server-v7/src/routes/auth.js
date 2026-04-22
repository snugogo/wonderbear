// ============================================================================
// /api/auth/* — six endpoints per API_CONTRACT §四.
//
//   POST /api/auth/send-code      — issue a 6-digit code to email
//   POST /api/auth/register        — create Parent (device binding deferred to batch 3)
//   POST /api/auth/login-code      — login via email code
//   POST /api/auth/login-password  — login via email + password (with lockout)
//   POST /api/auth/refresh          — refresh parent token (auth required)
//   POST /api/auth/logout           — revoke parent token (auth required)
//
// Batch 2 scope decision (Q3 @ 2026-04-22):
//   register accepts deviceId/activationCode schema-wise but does NOT touch
//   the Device table. `device: null` is returned in the response. H5 is
//   expected to immediately call /api/device/bind (batch 3) after register
//   succeeds. Keeps quota logic in exactly ONE place (batch 3) to avoid
//   double-counting the 6-book free allowance.
//
// All routes use the "throw BizError / return bare data" idiom — no manual
// envelopes, no manual catches. errorHandler + responseEnvelope do the rest.
// ============================================================================

import { ErrorCodes } from '../utils/errorCodes.js';
import { BizError } from '../utils/response.js';
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from '../utils/password.js';
import { signParentToken, TOKEN_TTL_SECONDS } from '../utils/jwt.js';
import {
  generateCode,
  storeCode,
  verifyCode,
  checkSendAllowed,
  markSent,
  SEND_COOLDOWN_SECONDS,
  CODE_TTL_SECONDS,
} from '../utils/verifyCode.js';
import { sendVerifyEmail } from '../utils/mailer.js';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

// RFC 5322 lite: practical email pattern. We don't enforce deliverability
// (the verification code round-trip does that).
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function normalizeEmail(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

function assertValidEmail(email) {
  if (email.length === 0 || email.length > 254 || !EMAIL_RE.test(email)) {
    throw new BizError(ErrorCodes.EMAIL_INVALID);
  }
}

function assertValidLocale(locale) {
  if (!['zh', 'en', 'pl', 'ro'].includes(locale)) {
    throw new BizError(ErrorCodes.PARAM_INVALID, {
      localeOverride: 'en',
      details: { field: 'locale', expected: ['zh', 'en', 'pl', 'ro'] },
    });
  }
}

function assertValidPurpose(purpose) {
  if (!['register', 'login'].includes(purpose)) {
    throw new BizError(ErrorCodes.PARAM_INVALID, {
      localeOverride: 'en',
      details: { field: 'purpose', expected: ['register', 'login'] },
    });
  }
}

function parentToResponse(parent) {
  return {
    id: parent.id,
    email: parent.email,
    locale: parent.locale,
    createdAt: parent.createdAt?.toISOString?.() ?? parent.createdAt,
    activated: Boolean(parent.devices?.length) || false,
  };
}

function subscriptionToSummary(sub) {
  if (!sub) return null;
  return {
    plan: sub.plan,
    status: sub.status,
    expiresAt: sub.expiresAt ? sub.expiresAt.toISOString() : null,
    pdfExportsLeft: sub.pdfExportsLeft ?? 0,
  };
}

// Anti-bruteforce constants — live here so they're easy to tune and test.
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

// --------------------------------------------------------------------------
// Route module
// --------------------------------------------------------------------------
export default async function authRoutes(fastify) {
  const { prisma, redis } = fastify;

  // ------------------------------------------------------------------
  // 4.1 POST /api/auth/send-code
  // ------------------------------------------------------------------
  fastify.post('/api/auth/send-code', async (request) => {
    const body = request.body ?? {};
    const email = normalizeEmail(body.email);
    const { purpose, locale } = body;

    assertValidEmail(email);
    assertValidPurpose(purpose);
    assertValidLocale(locale);

    // Rate-limit check: cooldown + hourly cap.
    const gate = await checkSendAllowed(redis, email);
    if (!gate.allowed) {
      throw new BizError(ErrorCodes.RATE_LIMITED, {
        localeOverride: 'en',
        details: {
          reason: gate.reason,
          nextRetryAfter: gate.retryAfter,
          limit: gate.reason === 'hourly' ? 3 : 1,
          windowSeconds: gate.reason === 'hourly' ? 3600 : SEND_COOLDOWN_SECONDS,
        },
      });
    }

    // Generate + persist code BEFORE attempting email send — that way a
    // transient Resend failure still leaves a consistent Redis state that
    // markSent() below is idempotent to re-issue.
    const code = generateCode();
    await storeCode(redis, email, purpose, code);

    try {
      await sendVerifyEmail({
        to: email,
        code,
        locale,
        purpose,
        logger: request.log,
      });
    } catch (err) {
      request.log.error({ err }, 'sendVerifyEmail failed');
      throw new BizError(ErrorCodes.EMAIL_SEND_FAILED, { cause: err.message });
    }

    // Only bump cooldown / hourly counter after a successful send attempt.
    await markSent(redis, email);

    return {
      expiresIn: CODE_TTL_SECONDS,
      nextRetryAfter: SEND_COOLDOWN_SECONDS,
    };
  });

  // ------------------------------------------------------------------
  // 4.2 POST /api/auth/register
  // ------------------------------------------------------------------
  fastify.post('/api/auth/register', async (request) => {
    const body = request.body ?? {};
    const email = normalizeEmail(body.email);
    const { code, password, deviceId, activationCode, locale /*, forceOverride */ } = body;

    assertValidEmail(email);
    assertValidLocale(locale);

    if (typeof code !== 'string' || code.length !== 6) {
      throw new BizError(ErrorCodes.VERIFY_CODE_INVALID);
    }
    // deviceId + activationCode are accepted by schema but NOT used in batch 2.
    // H5 is expected to immediately call /api/device/bind (batch 3) after
    // register succeeds. We still validate types so malformed payloads 400.
    if (deviceId !== undefined && typeof deviceId !== 'string') {
      throw new BizError(ErrorCodes.PARAM_INVALID, {
        localeOverride: 'en',
        details: { field: 'deviceId', expectedType: 'string' },
      });
    }
    if (activationCode !== undefined && typeof activationCode !== 'string') {
      throw new BizError(ErrorCodes.PARAM_INVALID, {
        localeOverride: 'en',
        details: { field: 'activationCode', expectedType: 'string' },
      });
    }

    // Verify code BEFORE uniqueness check — that way enumeration via "is this
    // email registered" requires also knowing the 6-digit code.
    const result = await verifyCode(redis, email, 'register', code);
    if (!result.ok) {
      if (result.reason === 'expired') {
        throw new BizError(ErrorCodes.VERIFY_CODE_EXPIRED);
      }
      throw new BizError(ErrorCodes.VERIFY_CODE_INVALID, {
        details: { attemptsLeft: result.attemptsLeft },
      });
    }

    // Uniqueness.
    const existing = await prisma.parent.findUnique({ where: { email } });
    if (existing) {
      throw new BizError(ErrorCodes.EMAIL_ALREADY_REGISTERED);
    }

    // Optional password.
    let passwordHash = null;
    if (password !== undefined && password !== null && password !== '') {
      const strength = validatePasswordStrength(password);
      if (!strength.valid) {
        throw new BizError(ErrorCodes.PASSWORD_TOO_WEAK, {
          details: { reason: strength.reason },
        });
      }
      passwordHash = await hashPassword(password);
    }

    const parent = await prisma.parent.create({
      data: {
        email,
        passwordHash,
        locale,
        lastLoginAt: new Date(),
      },
    });

    const { token, expiresAt } = await signParentToken(fastify, parent.id);

    return {
      parentToken: token,
      parent: {
        id: parent.id,
        email: parent.email,
        locale: parent.locale,
        createdAt: parent.createdAt.toISOString(),
        // "activated" in API_CONTRACT §4.2 = "has bound at least one device
        // and owns the 6-book allowance". Batch 2 never binds, so always false.
        activated: false,
      },
      // Device binding intentionally deferred to batch 3 per founder decision.
      device: null,
      tokenExpiresAt: expiresAt,
    };
  });

  // ------------------------------------------------------------------
  // 4.3 POST /api/auth/login-code
  // ------------------------------------------------------------------
  fastify.post('/api/auth/login-code', async (request) => {
    const body = request.body ?? {};
    const email = normalizeEmail(body.email);
    const { code } = body;

    assertValidEmail(email);
    if (typeof code !== 'string' || code.length !== 6) {
      throw new BizError(ErrorCodes.VERIFY_CODE_INVALID);
    }

    const result = await verifyCode(redis, email, 'login', code);
    if (!result.ok) {
      if (result.reason === 'expired') {
        throw new BizError(ErrorCodes.VERIFY_CODE_EXPIRED);
      }
      throw new BizError(ErrorCodes.VERIFY_CODE_INVALID, {
        details: { attemptsLeft: result.attemptsLeft },
      });
    }

    const parent = await prisma.parent.findUnique({
      where: { email },
      include: { subscription: true, devices: { select: { id: true } } },
    });
    if (!parent) {
      // Email not found — per API_CONTRACT §4.3, return PASSWORD_WRONG (10007)
      // to prevent enumeration. Code path reaches here only if a valid code
      // was issued for this email (via send-code), which already implies
      // existence; still, handle defensively.
      throw new BizError(ErrorCodes.PASSWORD_WRONG);
    }

    // Record successful login, clear any lingering lockout.
    await prisma.parent.update({
      where: { id: parent.id },
      data: {
        lastLoginAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    const { token, expiresAt } = await signParentToken(fastify, parent.id);

    return {
      parentToken: token,
      parent: {
        id: parent.id,
        email: parent.email,
        locale: parent.locale,
        activated: parent.devices.length > 0,
        subscription: subscriptionToSummary(parent.subscription),
      },
      tokenExpiresAt: expiresAt,
    };
  });

  // ------------------------------------------------------------------
  // 4.4 POST /api/auth/login-password
  // ------------------------------------------------------------------
  fastify.post('/api/auth/login-password', async (request) => {
    const body = request.body ?? {};
    const email = normalizeEmail(body.email);
    const { password } = body;

    assertValidEmail(email);
    if (typeof password !== 'string' || password.length === 0) {
      // Keep generic to avoid leaking that email exists but password is empty.
      throw new BizError(ErrorCodes.PASSWORD_WRONG);
    }

    const parent = await prisma.parent.findUnique({
      where: { email },
      include: { subscription: true, devices: { select: { id: true } } },
    });

    // Anti-enumeration: every "no match" path returns PASSWORD_WRONG (10007).
    // Order matters: check lockout FIRST for a known account so repeated
    // attempts against a locked account don't reset the counter.
    if (parent?.lockedUntil && parent.lockedUntil.getTime() > Date.now()) {
      throw new BizError(ErrorCodes.ACCOUNT_LOCKED, {
        details: { unlockAt: parent.lockedUntil.toISOString() },
      });
    }

    // No such account, OR account has no password set — same 10007.
    if (!parent || !parent.passwordHash) {
      throw new BizError(ErrorCodes.PASSWORD_WRONG);
    }

    const ok = await verifyPassword(password, parent.passwordHash);
    if (!ok) {
      const nextCount = (parent.failedLoginCount ?? 0) + 1;
      const shouldLock = nextCount >= MAX_FAILED_LOGINS;
      const lockedUntil = shouldLock
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
        : null;
      await prisma.parent.update({
        where: { id: parent.id },
        data: {
          // When locking, reset the counter so the user has a fresh 5 attempts
          // after the lockout window expires. Keeps lockouts bounded.
          failedLoginCount: shouldLock ? 0 : nextCount,
          lockedUntil,
        },
      });
      if (shouldLock) {
        throw new BizError(ErrorCodes.ACCOUNT_LOCKED, {
          details: { unlockAt: lockedUntil.toISOString() },
        });
      }
      throw new BizError(ErrorCodes.PASSWORD_WRONG, {
        details: { attemptsLeft: MAX_FAILED_LOGINS - nextCount },
      });
    }

    // Success — clear counters.
    await prisma.parent.update({
      where: { id: parent.id },
      data: {
        lastLoginAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    const { token, expiresAt } = await signParentToken(fastify, parent.id);

    return {
      parentToken: token,
      parent: {
        id: parent.id,
        email: parent.email,
        locale: parent.locale,
        activated: parent.devices.length > 0,
        subscription: subscriptionToSummary(parent.subscription),
      },
      tokenExpiresAt: expiresAt,
    };
  });

  // ------------------------------------------------------------------
  // 4.5 POST /api/auth/refresh
  // ------------------------------------------------------------------
  // Founder decision (Q2): signature-valid + not-blacklisted is enough.
  // No "must be within X minutes of expiry" window.
  fastify.post('/api/auth/refresh',
    { onRequest: [fastify.authenticateParent] },
    async (request) => {
      const { sub } = request.auth;

      // Confirm the parent still exists (could have been deleted).
      const parent = await prisma.parent.findUnique({ where: { id: sub } });
      if (!parent) {
        throw new BizError(ErrorCodes.TOKEN_EXPIRED, { cause: 'parent deleted' });
      }

      const { token, expiresAt } = await signParentToken(fastify, parent.id);
      return {
        parentToken: token,
        expiresAt,
      };
    },
  );

  // ------------------------------------------------------------------
  // 4.6 POST /api/auth/logout
  // ------------------------------------------------------------------
  fastify.post('/api/auth/logout',
    { onRequest: [fastify.authenticateParent] },
    async (request) => {
      const { token, payload } = request.auth;

      // Blacklist TTL = remaining seconds until natural expiry. Clamp to
      // non-negative; if somehow already expired, revokeToken is a no-op.
      const nowSec = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, (payload.exp ?? nowSec) - nowSec);
      // Cap at parent TTL just in case exp is exotic.
      const ttl = Math.min(remaining, TOKEN_TTL_SECONDS.parent);
      await fastify.revokeToken(token, ttl);

      return null; // → { code: 0, data: null, requestId }
    },
  );
}
