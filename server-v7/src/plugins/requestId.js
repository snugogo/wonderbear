// ============================================================================
// requestId plugin — assign a unique `req_xxxxxxxxxxxx` to every request.
//
// Source priority:
//   1. X-Request-Id header from client (preserves CDN/proxy trace IDs)
//   2. Newly generated `req_<12-char nanoid>`
//
// Side effects:
//   - request.id is set so logger automatically includes it
//   - X-Request-Id response header is set for downstream observability
//   - request.locale is also resolved here (cheap, same lifecycle)
//
// Note: Fastify already has its own request.id (numeric counter). We
// override with our format because the v7 contract wants `req_*` strings.
// ============================================================================

import fp from 'fastify-plugin';
import { nanoid } from 'nanoid';
import { resolveLocale } from '../utils/locale.js';

function generateRequestId() {
  return `req_${nanoid(12)}`;
}

async function requestIdPlugin(fastify) {
  // Override Fastify's default genReqId so request.id has the right format
  // from the moment the request enters the pipeline.
  fastify.addHook('onRequest', async (request, reply) => {
    const fromHeader = request.headers['x-request-id'];
    const id =
      typeof fromHeader === 'string' && fromHeader.length > 0 && fromHeader.length <= 64
        ? fromHeader
        : generateRequestId();

    // Override the auto-assigned id. Fastify's logger will include it
    // automatically because of how the request context is built.
    request.id = id;

    // Always echo back the id, even on errors / before route runs
    reply.header('X-Request-Id', id);
  });

  // Resolve locale once per request after body parsing finishes.
  // preHandler runs after body is parsed but before the route handler.
  fastify.addHook('preHandler', async (request) => {
    request.locale = resolveLocale(request);
  });
}

export default fp(requestIdPlugin, {
  name: 'requestId',
  fastify: '4.x',
});
