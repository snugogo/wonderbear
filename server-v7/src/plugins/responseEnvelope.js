// ============================================================================
// responseEnvelope plugin — wrap route return values into v7 success envelope.
//
// Behavior matrix (handled in onSend hook):
//
//   Route returns                    → Sent to client
//   ─────────────────────────────────────────────────────────────────────────
//   ok({foo: 1})                     → {code:0, data:{foo:1}, requestId}
//   bare object {foo: 1}             → {code:0, data:{foo:1}, requestId}
//   bare array [...]                 → {code:0, data:[...], requestId}
//   null / undefined                 → {code:0, data:null, requestId}
//   already-formed envelope {code:0,..} → passed through (no double-wrap)
//   error envelope {code:!=0, message,..} → passed through
//   raw string (e.g. webhook ack)    → passed through (Fastify default)
//   throws BizError                  → handled by errorHandler, not here
//
// Routes that need raw output (webhooks expecting `{received: true}` per
// Stripe spec) can either return the literal envelope shape OR set
// reply.raw=true via the route opts (batch 5 will add that escape hatch).
// ============================================================================

import fp from 'fastify-plugin';
import { isEnvelope } from '../utils/response.js';

async function responseEnvelopePlugin(fastify) {
  fastify.addHook('onSend', async (request, reply, payload) => {
    // Skip if route opted out
    if (reply.raw && reply.raw._wbSkipEnvelope) return payload;

    // onSend gives us payload as a string (Fastify already serialized).
    // We only re-wrap when the original route returned an object/array/null.
    // Fastify sets context.config when route was registered with config,
    // but for now we detect via Content-Type + JSON parse attempt.
    const contentType = reply.getHeader('content-type');
    if (typeof contentType !== 'string' || !contentType.includes('application/json')) {
      return payload; // non-JSON (e.g. file download, redirect)
    }

    // payload at this point is a string. Parse it back to inspect shape.
    let parsed;
    try {
      parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    } catch {
      return payload; // malformed JSON, leave alone (shouldn't happen)
    }

    // Already an envelope (success or error) — pass through
    if (isEnvelope(parsed)) {
      // But ensure requestId is present (e.g. health route in batch 0
      // generated its own; routes in batch 2+ might not)
      if (!parsed.requestId) {
        parsed.requestId = request.id;
        return JSON.stringify(parsed);
      }
      return payload;
    }

    // Marker object from ok() helper — unwrap and rebuild
    if (parsed && typeof parsed === 'object' && parsed.__envelope === 'ok') {
      const env = {
        code: 0,
        data: parsed.data ?? null,
        requestId: request.id,
      };
      return JSON.stringify(env);
    }

    // Plain object/array/null — wrap in success envelope
    const env = {
      code: 0,
      data: parsed === undefined ? null : parsed,
      requestId: request.id,
    };
    return JSON.stringify(env);
  });
}

export default fp(responseEnvelopePlugin, {
  name: 'responseEnvelope',
  fastify: '4.x',
  // Must register AFTER requestId so request.id is set
  dependencies: ['requestId'],
});
