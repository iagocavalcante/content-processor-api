import type { FastifyInstance } from 'fastify';
import { config } from './config/index.js';
import { buildServer } from './app.js';
import { startQueue, stopQueue } from './queue/index.js';

let fastify: FastifyInstance | undefined;

async function start(): Promise<void> {
  try {
    fastify = await buildServer();

    await startQueue(fastify.log);

    await fastify.listen({ port: config.port, host: config.host });

    fastify.log.info(`Server listening on http://${config.host}:${config.port}`);
    if (config.nodeEnv !== 'production') {
      fastify.log.info(`Documentation at http://${config.host}:${config.port}/documentation`);
    }
  } catch (error) {
    if (fastify) {
      fastify.log.error(error);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  const log = fastify?.log ?? console;
  log.info(`${signal} received, shutting down gracefully...`);

  try {
    // Stop accepting new requests before draining, so nothing new arrives
    // while workers are finishing.
    await fastify?.close();
    log.info('HTTP server closed');

    // `queue.shutdown()` owns the database pool and closes it. Calling
    // `closeDatabase()` afterwards ended the same pool a second time, which pg
    // rejects -- and that error is what made every SIGTERM exit with code 1.
    await stopQueue(log);

    log.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    log.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (error) => {
  const log = fastify?.log ?? console;
  log.error({ err: error }, 'Unhandled rejection');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  const log = fastify?.log ?? console;
  log.error({ err: error }, 'Uncaught exception');
  process.exit(1);
});

start();
