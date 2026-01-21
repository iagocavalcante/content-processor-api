import { createIziQueue, createLifelinePlugin, createPrunerPlugin } from 'izi-queue';
import { config } from '../config/index.js';
import { queueAdapter } from '../database/index.js';
import {
  imageProcessorWorker,
  pdfGeneratorWorker,
  emailSenderWorker,
  isolatedEmailSenderWorker,
  webhookDelivererWorker,
  dataExporterWorker,
} from '../workers/index.js';

export const queue = createIziQueue({
  database: queueAdapter,
  queues: {
    images: config.queue.limits.images,
    documents: config.queue.limits.documents,
    emails: config.queue.limits.emails,
    webhooks: config.queue.limits.webhooks,
    exports: config.queue.limits.exports,
    default: config.queue.limits.default,
  },
  pollInterval: config.queue.pollInterval,
  stageInterval: config.queue.stageInterval,
  shutdownGracePeriod: config.queue.shutdownGracePeriod,
  plugins: [
    createLifelinePlugin({
      interval: config.plugins.lifeline.interval,
      rescueAfter: config.plugins.lifeline.rescueAfter,
    }),
    createPrunerPlugin({
      interval: config.plugins.pruner.interval,
      maxAge: config.plugins.pruner.maxAge,
    }),
  ],
  // Isolation configuration for worker threads
  // This controls the thread pool for isolated workers
  isolation: {
    maxThreads: 8,    // Maximum concurrent isolated worker threads
    minThreads: 2,    // Minimum threads to keep alive (warm pool)
    idleTimeoutMs: 30000, // Kill idle threads after 30 seconds
  },
});

// Register all workers
export function registerWorkers(): void {
  queue.register(imageProcessorWorker);
  queue.register(pdfGeneratorWorker);

  // Standard in-process email worker
  queue.register(emailSenderWorker);

  // Isolated email worker - runs in a separate thread for memory safety
  // Use this for high-volume or memory-intensive email processing
  // Jobs can be routed to this worker by using 'SendEmailIsolated' as the worker name
  queue.register(isolatedEmailSenderWorker);

  queue.register(webhookDelivererWorker);
  queue.register(dataExporterWorker);
}

// Setup telemetry and logging
export function setupTelemetry(logger: any): void {
  queue.on('job:start', ({ job }) => {
    if (job) logger.info({ jobId: job.id, worker: job.worker, queue: job.queue }, 'Job started');
  });

  queue.on('job:complete', ({ job, duration }) => {
    if (job) logger.info(
      { jobId: job.id, worker: job.worker, queue: job.queue, duration },
      'Job completed successfully'
    );
  });

  queue.on('job:error', ({ job, error }) => {
    if (job) logger.error(
      { jobId: job.id, worker: job.worker, queue: job.queue, error: error?.message, attempt: job.attempt },
      'Job failed'
    );
  });

  queue.on('job:cancel', ({ job }) => {
    if (job) logger.warn({ jobId: job.id, worker: job.worker, queue: job.queue }, 'Job cancelled');
  });

  queue.on('job:snooze', ({ job }) => {
    if (job) logger.info({ jobId: job.id, worker: job.worker, queue: job.queue }, 'Job snoozed');
  });

  queue.on('job:rescue', ({ result }) => {
    logger.info({ result }, 'Jobs rescued');
  });

  queue.on('job:unique_conflict', ({ job }) => {
    logger.info({ jobId: job?.id, worker: job?.worker }, 'Unique job conflict detected');
  });

  queue.on('queue:start', ({ queue }) => {
    logger.info({ queue }, 'Queue started');
  });

  queue.on('queue:stop', ({ queue }) => {
    logger.info({ queue }, 'Queue stopped');
  });

  queue.on('plugin:start', ({ queue }) => {
    logger.info({ plugin: queue }, 'Plugin started');
  });

  queue.on('plugin:stop', ({ queue }) => {
    logger.info({ plugin: queue }, 'Plugin stopped');
  });

  queue.on('plugin:error', ({ queue, error }) => {
    logger.error({ plugin: queue, error: error?.message }, 'Plugin error');
  });
}

export async function startQueue(logger: any): Promise<void> {
  logger.info('Running database migrations...');
  await queue.migrate();

  logger.info('Registering workers...');
  registerWorkers();

  logger.info('Setting up telemetry...');
  setupTelemetry(logger);

  logger.info('Starting queue processing...');
  await queue.start();

  logger.info('Queue processing started successfully');
}

export async function stopQueue(logger: any): Promise<void> {
  logger.info('Stopping queue processing...');
  await queue.shutdown();
  logger.info('Queue processing stopped');
}
