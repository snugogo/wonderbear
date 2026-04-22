// Redis plugin — register ioredis client as singleton.
import fp from 'fastify-plugin';
import Redis from 'ioredis';
import env from '../config/env.js';

async function redisPlugin(fastify, opts) {
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    retryStrategy: (times) => {
      if (times > 10) return null; // stop retrying after 10 attempts
      return Math.min(times * 200, 2000);
    },
  });

  redis.on('error', (err) => {
    fastify.log.error({ err }, 'Redis error');
  });

  redis.on('connect', () => {
    fastify.log.info('✅ Redis connected');
  });

  // Confirm readiness with a ping before decorating
  try {
    await redis.ping();
  } catch (err) {
    fastify.log.error({ err }, 'Redis initial ping failed');
    throw err;
  }

  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async (instance) => {
    await instance.redis.quit();
    instance.log.info('Redis disconnected');
  });
}

export default fp(redisPlugin, {
  name: 'redis',
  fastify: '4.x',
});
