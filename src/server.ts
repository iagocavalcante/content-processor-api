import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config/index.js';
import { closeDatabase } from './database/index.js';
import { startQueue, stopQueue } from './queue/index.js';
import { registerJobRoutes } from './routes/jobs.js';
import { registerAdminRoutes } from './routes/admin.js';

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: config.logLevel,
    transport:
      config.nodeEnv === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  },
});

// Register plugins
async function registerPlugins(): Promise<void> {
  // CORS
  await fastify.register(cors, {
    origin: config.nodeEnv === 'production' ? false : '*',
    credentials: true,
  });

  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: config.nodeEnv === 'production',
  });

  // Rate limiting
  await fastify.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.window,
  });

  // Swagger documentation
  await fastify.register(swagger, {
    swagger: {
      info: {
        title: 'Content Processor API',
        description: 'Production-ready content processing API with background job queue',
        version: '1.0.0',
      },
      externalDocs: {
        url: 'https://github.com/IagoCavalcante/izi-queue',
        description: 'izi-queue documentation',
      },
      host: config.nodeEnv === 'production' ? 'api.example.com' : `localhost:${config.port}`,
      schemes: config.nodeEnv === 'production' ? ['https'] : ['http'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'jobs', description: 'Job management endpoints' },
        { name: 'admin', description: 'Administrative endpoints' },
      ],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });
}

// Register routes
async function registerRoutes(): Promise<void> {
  await registerJobRoutes(fastify);
  await registerAdminRoutes(fastify);

  // Root endpoint
  fastify.get('/', async () => {
    return {
      name: 'Content Processor API',
      version: '1.0.0',
      status: 'running',
      docs: '/documentation',
    };
  });
}

// Error handler
fastify.setErrorHandler((error: any, request, reply) => {
  fastify.log.error({ error, url: request.url }, 'Request error');

  if (error.validation) {
    return reply.status(400).send({
      error: 'Validation error',
      details: error.validation,
    });
  }

  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? 'Internal server error' : error.message;

  return reply.status(statusCode).send({
    error: message,
    statusCode,
  });
});

// Not found handler
fastify.setNotFoundHandler((request, reply) => {
  return reply.status(404).send({
    error: 'Route not found',
    path: request.url,
  });
});

// Start server
async function start(): Promise<void> {
  try {
    // Register plugins
    await registerPlugins();

    // Register routes
    await registerRoutes();

    // Start queue processing
    await startQueue(fastify.log);

    // Start HTTP server
    await fastify.listen({
      port: config.port,
      host: config.host,
    });

    fastify.log.info(`Server listening on http://${config.host}:${config.port}`);
    fastify.log.info(`Documentation available at http://${config.host}:${config.port}/documentation`);
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  fastify.log.info(`${signal} received, shutting down gracefully...`);

  try {
    // Stop accepting new requests
    await fastify.close();
    fastify.log.info('HTTP server closed');

    // Stop queue processing
    await stopQueue(fastify.log);

    // Close database connections
    await closeDatabase();
    fastify.log.info('Database connections closed');

    fastify.log.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    fastify.log.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  }
}

// Signal handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Unhandled errors
process.on('unhandledRejection', (error) => {
  fastify.log.error({ err: error }, 'Unhandled rejection');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  fastify.log.error({ err: error }, 'Uncaught exception');
  process.exit(1);
});

// Start the server
start();
