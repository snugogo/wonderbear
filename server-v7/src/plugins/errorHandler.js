// ============================================================================
// errorHandler plugin — convert ALL exceptions to v7 error envelopes.
//
// Handled categories:
//   1. BizError                → use its code, details, actions (HTTP 200)
//   2. Fastify validation err  → 90002 PARAM_INVALID (HTTP 200)
//   3. Fastify 401 (jwt fail)  → 10001 TOKEN_EXPIRED (HTTP 401 per §1.2)
//   4. Fastify 4xx (parse/etc) → preserve HTTP code, generic envelope
//   5. Anything else           → 50001 INTERNAL_ERROR (HTTP 200), logged
//
// Per API_CONTRACT §1.2: business errors return HTTP 200 with code !== 0.
// True 4xx/5xx HTTP codes only for protocol-level failures (auth, parse,
// method not allowed, server crash).
// ============================================================================

import fp from 'fastify-plugin';
import { ErrorCodes } from '../utils/errorCodes.js';
import { fail } from '../utils/response.js';
import env from '../config/env.js';

async function errorHandlerPlugin(fastify) {
  fastify.setErrorHandler((err, request, reply) => {
    const requestId = request.id;
    const locale = request.locale ?? 'en';

    // ---- 1. BizError — the happy path for business failures ----
    if (err && err.isBizError) {
      const body = fail(err.bizCode, requestId, {
        locale,
        details: err.details,
        actions: err.actions,
      });
      // Optional cause logging (e.g. upstream API error message), no PII
      if (err.cause) {
        request.log.warn({ bizCode: err.bizCode, cause: err.cause }, 'BizError');
      }
      return reply.code(200).send(body);
    }

    // ---- 2. Fastify schema validation error ----
    if (err.validation) {
      const details = {
        validationErrors: err.validation.map((v) => ({
          path: v.instancePath || v.dataPath || '',
          message: v.message,
        })),
      };
      const body = fail(ErrorCodes.PARAM_INVALID, requestId, { locale, details });
      return reply.code(200).send(body);
    }

    // ---- 3. JWT failures from @fastify/jwt → 10001 with HTTP 401 ----
    // (batch 2 will register @fastify/jwt; this branch ready for it)
    if (err.statusCode === 401 || err.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER' ||
        err.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED' ||
        err.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
      const body = fail(ErrorCodes.TOKEN_EXPIRED, requestId, { locale });
      return reply.code(401).send(body);
    }

    // ---- 4. Method not allowed / parse errors ----
    if (err.statusCode === 405) {
      return reply
        .code(405)
        .send(fail(ErrorCodes.METHOD_NOT_ALLOWED, requestId, { locale }));
    }
    if (err.statusCode === 400) {
      // Bad JSON body etc.
      return reply
        .code(400)
        .send(fail(ErrorCodes.PARAM_INVALID, requestId, { locale }));
    }

    // ---- 5. Unexpected — log full stack, return 50001 ----
    request.log.error({ err }, 'Unhandled error');
    const body = fail(ErrorCodes.INTERNAL_ERROR, requestId, {
      locale,
      // In dev, leak the message to help debugging. Prod stays generic.
      details: env.NODE_ENV === 'development' ? { devMessage: err.message } : null,
    });
    return reply.code(200).send(body);
  });

  // Same for "no route matches" → uniform envelope with 9xxxx
  fastify.setNotFoundHandler((request, reply) => {
    const body = fail(ErrorCodes.PARAM_INVALID, request.id, {
      locale: request.locale ?? 'en',
      details: { reason: 'route not found', path: request.url, method: request.method },
    });
    return reply.code(404).send(body);
  });
}

export default fp(errorHandlerPlugin, {
  name: 'errorHandler',
  fastify: '4.x',
  dependencies: ['requestId'],
});
