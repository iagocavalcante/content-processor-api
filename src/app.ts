import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config/index.js';
import { registerAuth } from './plugins/auth.js';
import { registerJobRoutes } from './routes/jobs.js';
import { registerAdminRoutes } from './routes/admin.js';

/**
 * Builds the HTTP application without starting it or the queue.
 *
 * Separated from `server.ts` so the routing and authentication behaviour can be
 * exercised with `app.inject()` -- no socket, no database, no background
 * workers.
 */
export async function buildServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: config.nodeEnv === 'test' ? 'silent' : config.logLevel,
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

  await fastify.register(cors, {
    origin: config.nodeEnv === 'production' ? false : '*',
    credentials: true,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: config.nodeEnv === 'production',
  });

  await fastify.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.window,
  });

  // Before routes: an unauthenticated request must not reach a handler.
  registerAuth(fastify);

  // The docs enumerate every administrative endpoint, and Swagger UI cannot
  // send an API key header. Served in development only -- an allowlist rather
  // than "everywhere except production", so a new environment name does not
  // silently expose them.
  if (config.nodeEnv === 'development') {
    await fastify.register(swagger, {
      swagger: {
        info: {
          title: 'Content Processor API',
          description: 'Content processing API with a database-backed job queue',
          version: '1.0.0',
        },
        externalDocs: {
          url: 'https://github.com/iagocavalcante/izi-queue',
          description: 'izi-queue documentation',
        },
        host: `localhost:${config.port}`,
        schemes: ['http'],
        consumes: ['application/json'],
        produces: ['application/json'],
        securityDefinitions: {
          apiKey: {
            type: 'apiKey',
            name: config.security.apiKeyHeader,
            in: 'header',
          },
        },
        security: [{ apiKey: [] }],
        tags: [
          { name: 'jobs', description: 'Job management endpoints' },
          { name: 'admin', description: 'Administrative endpoints' },
        ],
      },
    });

    await fastify.register(swaggerUi, {
      routePrefix: '/documentation',
      uiConfig: { docExpansion: 'list', deepLinking: false },
    });
  }

  await registerJobRoutes(fastify);
  await registerAdminRoutes(fastify);

  fastify.get('/', async () => ({
    name: 'Content Processor API',
    version: '1.0.0',
    status: 'running',
    docs: config.nodeEnv === 'production' ? null : '/documentation',
  }));

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

    return reply.status(statusCode).send({ error: message, statusCode });
  });

  fastify.setNotFoundHandler((request, reply) =>
    reply.status(404).send({ error: 'Route not found', path: request.url })
  );

  return fastify;
}
