// ============================================================================
// storyQueue plugin — decorates fastify with an in-process story generation
// queue. Depends on `fastify.prisma`, so register AFTER prisma plugin.
//
// Tests can inject their own queue by decorating `storyQueue` before this
// plugin runs (it's a no-op if already present).
// ============================================================================

import fp from 'fastify-plugin';
import { createStoryQueue } from '../queues/storyJob.js';

async function storyQueuePlugin(fastify) {
  if (fastify.hasDecorator('storyQueue')) return;
  const queue = createStoryQueue(fastify.prisma);
  fastify.decorate('storyQueue', queue);
}

export default fp(storyQueuePlugin, {
  name: 'storyQueue',
  fastify: '4.x',
  dependencies: [],
});
