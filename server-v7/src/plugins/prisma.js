// Prisma plugin — register PrismaClient as singleton on Fastify instance.
// Using fastify-plugin so the decoration is available in all routes.
// The onClose hook prevents connection leaks during nodemon hot-reload.
import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';

async function prismaPlugin(fastify, opts) {
  const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  await prisma.$connect();
  fastify.log.info('✅ Prisma connected to PostgreSQL');

  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect();
    instance.log.info('Prisma disconnected');
  });
}

export default fp(prismaPlugin, {
  name: 'prisma',
  fastify: '4.x',
});
