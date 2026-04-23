// ============================================================================
// /api/tts/* — TTS synthesis + voice listing, per API_CONTRACT §八
//
// Endpoints:
//   POST /api/tts/synthesize     (§8.1) device token, 50/hour per device
//   GET  /api/tts/voices         (§8.2) device token
// ============================================================================

import { ErrorCodes } from '../utils/errorCodes.js';
import { BizError } from '../utils/response.js';
import { synthesize as ttsSynthesize } from '../services/tts.js';

const RATE_KEY_PREFIX = 'rate:tts:';
const HOURLY_LIMIT = 50;

function rateLimitKey(deviceId) {
  const hour = Math.floor(Date.now() / 3600_000);
  return `${RATE_KEY_PREFIX}${deviceId}:${hour}`;
}

export default async function ttsRoutes(fastify) {
  const { redis } = fastify;

  fastify.post(
    '/api/tts/synthesize',
    { onRequest: [fastify.authenticateDevice] },
    async (request) => {
      const body = request.body ?? {};
      const { text, lang = 'en', voiceId, speed = 1.0 } = body;
      if (typeof text !== 'string' || text.length === 0) {
        throw new BizError(ErrorCodes.PARAM_MISSING, { details: { field: 'text' } });
      }
      if (text.length > 500) {
        throw new BizError(ErrorCodes.PARAM_INVALID, {
          details: { field: 'text', maxLength: 500 },
        });
      }
      if (typeof speed !== 'number' || speed < 0.7 || speed > 1.3) {
        throw new BizError(ErrorCodes.PARAM_INVALID, {
          details: { field: 'speed', min: 0.7, max: 1.3 },
        });
      }

      // Rate limit
      const rateKey = rateLimitKey(request.auth.sub);
      const count = parseInt((await redis.get(rateKey)) || '0', 10);
      if (count >= HOURLY_LIMIT) {
        throw new BizError(ErrorCodes.RATE_LIMITED, {
          details: { limit: HOURLY_LIMIT, windowSeconds: 3600 },
        });
      }
      // Increment (TTL 1h). Fresh keys get TTL; incr keeps existing TTL.
      const newCount = count + 1;
      if (count === 0) {
        await redis.setex(rateKey, 3600, String(newCount));
      } else {
        await redis.set(rateKey, String(newCount));
      }

      try {
        const result = await ttsSynthesize({ text, lang, voiceId, speed });
        return {
          audioUrl: result.audioUrl,
          durationMs: result.durationMs,
          cached: result.cached,
        };
      } catch (err) {
        throw new BizError(ErrorCodes.TTS_FAILED, { cause: err.message });
      }
    },
  );

  fastify.get(
    '/api/tts/voices',
    { onRequest: [fastify.authenticateDevice] },
    async () => {
      // Static voice list — ElevenLabs voice IDs would come from env in prod
      return {
        voices: [
          { id: 'voice_default_en', lang: 'en', name: 'Warm Narrator (EN)', gender: 'female' },
          { id: 'voice_default_zh', lang: 'zh', name: '暖声旁白', gender: 'female' },
          { id: 'voice_default_pl', lang: 'pl', name: 'Ciepła Narratorka', gender: 'female' },
          { id: 'voice_default_ro', lang: 'ro', name: 'Naratoare Caldă', gender: 'female' },
        ],
      };
    },
  );
}
