import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { queue } from '../queue/index.js';

// Validation schemas
const ImageJobSchema = z.object({
  imageId: z.string(),
  sourceUrl: z.string().url(),
  operations: z.object({
    resize: z.object({ width: z.number(), height: z.number() }).optional(),
    format: z.enum(['webp', 'jpeg', 'png']).optional(),
    quality: z.number().min(1).max(100).optional(),
    optimize: z.boolean().optional(),
  }),
  tenantId: z.string(),
});

const PDFJobSchema = z.object({
  documentId: z.string(),
  template: z.string(),
  data: z.record(z.unknown()),
  options: z
    .object({
      format: z.enum(['A4', 'Letter']).optional(),
      orientation: z.enum(['portrait', 'landscape']).optional(),
      includeHeader: z.boolean().optional(),
      includeFooter: z.boolean().optional(),
    })
    .optional(),
  tenantId: z.string(),
});

const EmailJobSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email())]),
  from: z.string().email().optional(),
  subject: z.string().min(1),
  html: z.string().optional(),
  text: z.string().optional(),
  template: z
    .object({
      name: z.string(),
      data: z.record(z.unknown()),
    })
    .optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        url: z.string().url(),
      })
    )
    .optional(),
  tenantId: z.string(),
  messageId: z.string().optional(),
  // Option to use isolated worker for memory-intensive operations
  isolated: z.boolean().optional(),
});

const WebhookJobSchema = z.object({
  webhookId: z.string(),
  url: z.string().url(),
  method: z.enum(['POST', 'PUT', 'PATCH']),
  headers: z.record(z.string()).optional(),
  payload: z.record(z.unknown()),
  event: z.string(),
  tenantId: z.string(),
  retryStrategy: z
    .object({
      maxAttempts: z.number().optional(),
      backoffMultiplier: z.number().optional(),
    })
    .optional(),
});

const ExportJobSchema = z.object({
  exportId: z.string(),
  format: z.enum(['csv', 'json', 'xlsx']),
  query: z.object({
    table: z.string(),
    filters: z.record(z.unknown()).optional(),
    columns: z.array(z.string()).optional(),
  }),
  tenantId: z.string(),
  notifyEmail: z.string().email().optional(),
});

const ScheduleOptionsSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  priority: z.number().min(0).max(10).optional(),
  maxAttempts: z.number().min(1).max(20).optional(),
  unique: z
    .object({
      keys: z.array(z.string()).optional(),
      period: z.number().or(z.literal('infinity')).optional(),
    })
    .optional(),
});

export async function registerJobRoutes(fastify: FastifyInstance): Promise<void> {
  // Image processing job
  fastify.post(
    '/jobs/images',
    async (request: FastifyRequest<{ Body: z.infer<typeof ImageJobSchema> }>, reply: FastifyReply) => {
      try {
        const args = ImageJobSchema.parse(request.body);

        const job = await queue.insert('ProcessImage', {
          args,
          queue: 'images',
        });

        return reply.code(201).send({
          success: true,
          jobId: job.id,
          message: 'Image processing job created',
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({ error: 'Validation failed', details: error.errors });
        }
        throw error;
      }
    }
  );

  // PDF generation job
  fastify.post(
    '/jobs/documents',
    async (request: FastifyRequest<{ Body: z.infer<typeof PDFJobSchema> }>, reply: FastifyReply) => {
      try {
        const args = PDFJobSchema.parse(request.body);

        const job = await queue.insert('GeneratePDF', {
          args,
          queue: 'documents',
        });

        return reply.code(201).send({
          success: true,
          jobId: job.id,
          message: 'PDF generation job created',
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({ error: 'Validation failed', details: error.errors });
        }
        throw error;
      }
    }
  );

  // Email sending job
  // Supports both standard (in-process) and isolated (thread-based) workers
  fastify.post(
    '/jobs/emails',
    async (request: FastifyRequest<{ Body: z.infer<typeof EmailJobSchema> }>, reply: FastifyReply) => {
      try {
        const { isolated, ...args } = EmailJobSchema.parse(request.body);

        // Use isolated worker for memory-intensive operations
        // The isolated worker runs in a separate thread with memory limits
        const workerName = isolated ? 'SendEmailIsolated' : 'SendEmail';

        const job = await queue.insert(workerName, {
          args,
          queue: 'emails',
        });

        return reply.code(201).send({
          success: true,
          jobId: job.id,
          message: isolated ? 'Isolated email job created' : 'Email job created',
          isolated: !!isolated,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({ error: 'Validation failed', details: error.errors });
        }
        throw error;
      }
    }
  );

  // Webhook delivery job
  fastify.post(
    '/jobs/webhooks',
    async (request: FastifyRequest<{ Body: z.infer<typeof WebhookJobSchema> }>, reply: FastifyReply) => {
      try {
        const args = WebhookJobSchema.parse(request.body);

        const job = await queue.insert('DeliverWebhook', {
          args,
          queue: 'webhooks',
        });

        return reply.code(201).send({
          success: true,
          jobId: job.id,
          message: 'Webhook delivery job created',
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({ error: 'Validation failed', details: error.errors });
        }
        throw error;
      }
    }
  );

  // Data export job
  fastify.post(
    '/jobs/exports',
    async (request: FastifyRequest<{ Body: z.infer<typeof ExportJobSchema> }>, reply: FastifyReply) => {
      try {
        const args = ExportJobSchema.parse(request.body);

        const job = await queue.insert('ExportData', {
          args,
          queue: 'exports',
        });

        return reply.code(201).send({
          success: true,
          jobId: job.id,
          message: 'Data export job created',
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({ error: 'Validation failed', details: error.errors });
        }
        throw error;
      }
    }
  );

  // Get job status
  fastify.get(
    '/jobs/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const jobId = parseInt(request.params.id, 10);

      if (isNaN(jobId)) {
        return reply.code(400).send({ error: 'Invalid job ID' });
      }

      const job = await queue.getJob(jobId);

      if (!job) {
        return reply.code(404).send({ error: 'Job not found' });
      }

      return reply.send({
        success: true,
        job: {
          id: job.id,
          state: job.state,
          worker: job.worker,
          queue: job.queue,
          args: job.args,
          meta: job.meta,
          attempt: job.attempt,
          maxAttempts: job.maxAttempts,
          errors: job.errors,
          insertedAt: job.insertedAt,
          scheduledAt: job.scheduledAt,
          attemptedAt: job.attemptedAt,
          completedAt: job.completedAt,
        },
      });
    }
  );

  // Cancel jobs
  fastify.delete(
    '/jobs',
    async (
      request: FastifyRequest<{
        Querystring: { worker?: string; queue?: string; state?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { worker, queue: queueName, state } = request.query;

      const criteria: { worker?: string; queue?: string; state?: any[] } = {};
      if (worker) criteria.worker = worker;
      if (queueName) criteria.queue = queueName;
      if (state) criteria.state = state.split(',');

      const cancelled = await queue.cancelJobs(criteria);

      return reply.send({
        success: true,
        message: `Cancelled ${cancelled} job(s)`,
        count: cancelled,
      });
    }
  );
}
