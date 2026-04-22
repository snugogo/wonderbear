// ============================================================================
// Fastify app factory. Kept separate from server.js so tests can import it.
//
// Plugin registration order matters (Fastify plugin DAG):
//   1. helmet / cors / sensible — basic HTTP hygiene
//   2. requestId                — sets request.id + locale (other hooks rely)
//   3. responseEnvelope         — onSend hook to wrap return values
//   4. errorHandler             — setErrorHandler converts BizError → envelope
//   5. prisma / redis           — infra (don't depend on request lifecycle)
//   6. routes
// ============================================================================

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';

import env from './config/env.js';

import requestIdPlugin from './plugins/requestId.js';
import responseEnvelopePlugin from './plugins/responseEnvelope.js';
import errorHandlerPlugin from './plugins/errorHandler.js';
import prismaPlugin from './plugins/prisma.js';
import redisPlugin from './plugins/redis.js';
import authPlugin from './plugins/auth.js';

import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: 'info',
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
            }
          : undefined,
    },
    trustProxy: true,
    // We disable Fastify's default request id in favor of ours
    disableRequestLogging: false,
  });

  // 1. HTTP hygiene
  await app.register(helmet, { global: true });
  await app.register(cors, {
    origin: true, // dev: allow all; prod tightens via env list in batch 6
    credentials: true,
  });
  await app.register(sensible);

  // 2. Request lifecycle plumbing — must come before routes
  await app.register(requestIdPlugin);
  await app.register(responseEnvelopePlugin);
  await app.register(errorHandlerPlugin);

  // 3. Infra
  await app.register(prismaPlugin);
  await app.register(redisPlugin);

  // 3b. Auth (depends on redis for blacklist; registers @fastify/jwt)
  await app.register(authPlugin);

  // 4. Routes
  await app.register(healthRoutes);
  await app.register(authRoutes);

  // 5. Friendly root landing
  app.get('/', async () => ({
    name: 'WonderBear API',
    version: '0.1.0',
    docs: '/api/health',
  }));

  return app;
}
