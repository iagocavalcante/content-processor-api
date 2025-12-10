import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { queue } from '../queue/index.js';

const ScaleQueueSchema = z.object({
  limit: z.number().min(1).max(100),
});

export async function registerAdminRoutes(fastify: FastifyInstance): Promise<void> {
  // Health check
  fastify.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const queues = queue.getAllQueueStatus();

    return reply.send({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      queues,
    });
  });

  // Get all queue statuses
  fastify.get('/admin/queues', async (_request: FastifyRequest, reply: FastifyReply) => {
    const queues = queue.getAllQueueStatus();

    return reply.send({
      success: true,
      queues,
    });
  });

  // Get specific queue status
  fastify.get(
    '/admin/queues/:name',
    async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      const { name } = request.params;
      const queueStatus = queue.getQueueStatus(name);

      if (!queueStatus) {
        return reply.code(404).send({ error: `Queue '${name}' not found` });
      }

      return reply.send({
        success: true,
        queue: queueStatus,
      });
    }
  );

  // Pause queue
  fastify.post(
    '/admin/queues/:name/pause',
    async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      const { name } = request.params;

      try {
        queue.pauseQueue(name);
        const queueStatus = queue.getQueueStatus(name);

        return reply.send({
          success: true,
          message: `Queue '${name}' paused`,
          queue: queueStatus,
        });
      } catch (error) {
        return reply.code(400).send({ error: `Failed to pause queue: ${error}` });
      }
    }
  );

  // Resume queue
  fastify.post(
    '/admin/queues/:name/resume',
    async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      const { name } = request.params;

      try {
        queue.resumeQueue(name);
        const queueStatus = queue.getQueueStatus(name);

        return reply.send({
          success: true,
          message: `Queue '${name}' resumed`,
          queue: queueStatus,
        });
      } catch (error) {
        return reply.code(400).send({ error: `Failed to resume queue: ${error}` });
      }
    }
  );

  // Scale queue
  fastify.post(
    '/admin/queues/:name/scale',
    async (
      request: FastifyRequest<{
        Params: { name: string };
        Body: z.infer<typeof ScaleQueueSchema>;
      }>,
      reply: FastifyReply
    ) => {
      const { name } = request.params;

      try {
        const { limit } = ScaleQueueSchema.parse(request.body);

        queue.scaleQueue(name, limit);
        const queueStatus = queue.getQueueStatus(name);

        return reply.send({
          success: true,
          message: `Queue '${name}' scaled to ${limit}`,
          queue: queueStatus,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({ error: 'Validation failed', details: error.errors });
        }
        return reply.code(400).send({ error: `Failed to scale queue: ${error}` });
      }
    }
  );

  // Prune old jobs manually
  fastify.post(
    '/admin/jobs/prune',
    async (
      request: FastifyRequest<{ Querystring: { maxAgeSeconds?: string } }>,
      reply: FastifyReply
    ) => {
      const maxAgeSeconds = request.query.maxAgeSeconds
        ? parseInt(request.query.maxAgeSeconds, 10)
        : 86400 * 7; // 7 days default

      if (isNaN(maxAgeSeconds)) {
        return reply.code(400).send({ error: 'Invalid maxAgeSeconds parameter' });
      }

      const pruned = await queue.pruneJobs(maxAgeSeconds);

      return reply.send({
        success: true,
        message: `Pruned ${pruned} old job(s)`,
        count: pruned,
        maxAgeSeconds,
      });
    }
  );

  // Rescue stuck jobs manually
  fastify.post(
    '/admin/jobs/rescue',
    async (
      request: FastifyRequest<{ Querystring: { rescueAfterSeconds?: string } }>,
      reply: FastifyReply
    ) => {
      const rescueAfterSeconds = request.query.rescueAfterSeconds
        ? parseInt(request.query.rescueAfterSeconds, 10)
        : 300; // 5 minutes default

      if (isNaN(rescueAfterSeconds)) {
        return reply.code(400).send({ error: 'Invalid rescueAfterSeconds parameter' });
      }

      const rescued = await queue.rescueStuckJobs(rescueAfterSeconds);

      return reply.send({
        success: true,
        message: `Rescued ${rescued} stuck job(s)`,
        count: rescued,
        rescueAfterSeconds,
      });
    }
  );

  // Metrics endpoint (Prometheus-compatible)
  fastify.get('/metrics', async (_request: FastifyRequest, reply: FastifyReply) => {
    const queues = queue.getAllQueueStatus();

    const metrics = queues
      .map((q) => {
        return [
          `# HELP queue_limit Queue concurrency limit`,
          `# TYPE queue_limit gauge`,
          `queue_limit{queue="${q.name}"} ${q.limit}`,
          `# HELP queue_running Currently running jobs`,
          `# TYPE queue_running gauge`,
          `queue_running{queue="${q.name}"} ${q.running}`,
          `# HELP queue_state Queue state (0=stopped, 1=running, 2=paused)`,
          `# TYPE queue_state gauge`,
          `queue_state{queue="${q.name}"} ${q.state === 'running' ? 1 : q.state === 'paused' ? 2 : 0}`,
        ].join('\n');
      })
      .join('\n\n');

    return reply.type('text/plain').send(metrics);
  });
}
