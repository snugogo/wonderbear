// ============================================================================
// auth plugin — registers @fastify/jwt and exposes per-type authenticators.
//
// Three gates are installed as Fastify decorators:
//   fastify.authenticateParent   — enforces token.type === 'parent'
//   fastify.authenticateDevice   — enforces token.type === 'device'
//   fastify.authenticateSeller   — enforces token.type === 'seller'
//
// Each runs the same pipeline:
//   1. Extract Bearer token from Authorization header.
//   2. Verify signature + expiry via fastify.jwt.verify.
//   3. Check Redis blacklist (auth:blacklist:<sha256(token)>) → 10010.
//   4. Enforce expected type → 10006.
//   5. Attach request.auth = { type, sub, payload, token }.
//
// On failure, the gate throws a BizError with the correct 1xxxx code; the
// global errorHandler translates into the v7 error envelope.
//
// For logout: routes can call request.server.revokeToken(token, ttlSeconds)
// to add a token to the blacklist until its natural exp.
// ============================================================================

import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import env from '../config/env.js';
import { ErrorCodes } from '../utils/errorCodes.js';
import { BizError } from '../utils/response.js';
import { TOKEN_TYPES, hashTokenForBlacklist } from '../utils/jwt.js';

const BLACKLIST_KEY_PREFIX = 'auth:blacklist:';

function blacklistKey(token) {
  return `${BLACKLIST_KEY_PREFIX}${hashTokenForBlacklist(token)}`;
}

/**
 * Extract "Bearer xxx" from the Authorization header. Returns null if absent
 * or malformed; caller converts that to TOKEN_EXPIRED (10001) per API_CONTRACT
 * (missing token is treated the same as expired — we don't leak whether a
 * token was ever present).
 */
function extractBearer(request) {
  const h = request.headers.authorization;
  if (typeof h !== 'string') return null;
  const parts = h.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  const token = parts[1];
  if (!token) return null;
  return token;
}

/**
 * Build an authenticator function for a specific token type.
 * Returned function is suitable as a Fastify preHandler / onRequest hook
 * passed via { onRequest: [...] } or awaited manually in a handler.
 */
function makeAuthenticator(expectedType) {
  return async function authenticator(request /* , reply */) {
    const token = extractBearer(request);
    if (!token) {
      throw new BizError(ErrorCodes.TOKEN_EXPIRED, { cause: 'missing bearer' });
    }

    // Verify signature + expiry. @fastify/jwt throws typed errors we map here.
    let payload;
    try {
      payload = request.server.jwt.verify(token);
    } catch (err) {
      // Any verify failure is funnelled to TOKEN_EXPIRED (10001). The only
      // exception is an explicit revocation, handled below by blacklist check.
      throw new BizError(ErrorCodes.TOKEN_EXPIRED, { cause: err.message });
    }

    // Revocation check BEFORE type enforcement — if a user explicitly logged
    // out, they get the clearer TOKEN_REVOKED message even if they're also
    // hitting the wrong token-type endpoint.
    const redis = request.server.redis;
    if (redis) {
      try {
        const hit = await redis.get(blacklistKey(token));
        if (hit) {
          throw new BizError(ErrorCodes.TOKEN_REVOKED, { cause: 'blacklisted' });
        }
      } catch (err) {
        if (err instanceof BizError) throw err;
        // Redis unreachable — fail safe: reject. Better to force relogin than
        // to honor a possibly-revoked token.
        request.log.error({ err }, 'auth: redis blacklist check failed');
        throw new BizError(ErrorCodes.REDIS_UNAVAILABLE, { cause: err.message });
      }
    }

    if (payload?.type !== expectedType) {
      throw new BizError(ErrorCodes.TOKEN_TYPE_MISMATCH, {
        cause: `expected ${expectedType}, got ${payload?.type}`,
      });
    }

    request.auth = {
      type: payload.type,
      sub: payload.sub,
      payload,
      token,
    };
  };
}

async function authPlugin(fastify) {
  // 1. Register @fastify/jwt with the shared secret.
  await fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    // We manage our own verify flow (for blacklist + type check), so disable
    // the "auto-attach to request" convenience behaviour. Routes call the
    // per-type authenticator explicitly.
    sign: { algorithm: 'HS256' },
  });

  // 2. Decorate the three authenticators.
  fastify.decorate('authenticateParent', makeAuthenticator(TOKEN_TYPES.PARENT));
  fastify.decorate('authenticateDevice', makeAuthenticator(TOKEN_TYPES.DEVICE));
  fastify.decorate('authenticateSeller', makeAuthenticator(TOKEN_TYPES.SELLER));

  // 3. Decorate a revoker used by /api/auth/logout.
  // TTL should be the token's remaining exp so the blacklist entry
  // disappears naturally once the token would have expired anyway.
  fastify.decorate('revokeToken', async function revokeToken(token, ttlSeconds) {
    if (!token || ttlSeconds <= 0) return;
    await fastify.redis.setex(blacklistKey(token), ttlSeconds, '1');
  });

  // 4. Decorate the blacklist-key builder (exposed for tests + dev tools).
  fastify.decorate('blacklistKeyFor', blacklistKey);
}

export default fp(authPlugin, {
  name: 'auth',
  fastify: '4.x',
  // NOTE: `redis` plugin isn't listed as a hard dependency so unit tests
  // can decorate `fastify.redis` directly with a stub. Production wiring in
  // app.js registers redis plugin BEFORE this one.
  dependencies: ['requestId'],
});
