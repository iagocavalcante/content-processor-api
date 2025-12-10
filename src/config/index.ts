import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const ConfigSchema = z.object({
  // Application
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.coerce.number().default(3000),
  host: z.string().default('0.0.0.0'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database
  databaseUrl: z.string().url(),

  // Queue Configuration
  queue: z.object({
    pollInterval: z.coerce.number().default(1000),
    stageInterval: z.coerce.number().default(1000),
    shutdownGracePeriod: z.coerce.number().default(15000),
    limits: z.object({
      images: z.coerce.number().default(10),
      documents: z.coerce.number().default(5),
      emails: z.coerce.number().default(20),
      webhooks: z.coerce.number().default(15),
      exports: z.coerce.number().default(3),
      default: z.coerce.number().default(5),
    }),
  }),

  // Worker Configuration
  workers: z.object({
    imageTimeout: z.coerce.number().default(300000),
    pdfTimeout: z.coerce.number().default(180000),
    emailTimeout: z.coerce.number().default(30000),
    webhookTimeout: z.coerce.number().default(30000),
    exportTimeout: z.coerce.number().default(600000),
  }),

  // Plugins
  plugins: z.object({
    lifeline: z.object({
      interval: z.coerce.number().default(60000),
      rescueAfter: z.coerce.number().default(300),
    }),
    pruner: z.object({
      interval: z.coerce.number().default(300000),
      maxAge: z.coerce.number().default(604800),
    }),
  }),

  // External Services
  aws: z.object({
    accessKeyId: z.string().optional(),
    secretAccessKey: z.string().optional(),
    region: z.string().default('us-east-1'),
    s3Bucket: z.string().optional(),
  }),

  smtp: z.object({
    host: z.string().optional(),
    port: z.coerce.number().optional(),
    user: z.string().optional(),
    password: z.string().optional(),
    from: z.string().email().optional(),
  }),

  // Security
  security: z.object({
    apiKeyHeader: z.string().default('X-API-Key'),
    jwtSecret: z.string().min(32),
  }),

  // Rate Limiting
  rateLimit: z.object({
    max: z.coerce.number().default(100),
    window: z.coerce.number().default(60000),
  }),

  // Monitoring
  monitoring: z.object({
    enableMetrics: z.coerce.boolean().default(true),
    metricsPort: z.coerce.number().default(9090),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  const rawConfig = {
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    host: process.env.HOST,
    logLevel: process.env.LOG_LEVEL,

    databaseUrl: process.env.DATABASE_URL,

    queue: {
      pollInterval: process.env.QUEUE_POLL_INTERVAL,
      stageInterval: process.env.QUEUE_STAGE_INTERVAL,
      shutdownGracePeriod: process.env.QUEUE_SHUTDOWN_GRACE_PERIOD,
      limits: {
        images: process.env.QUEUE_IMAGES_LIMIT,
        documents: process.env.QUEUE_DOCUMENTS_LIMIT,
        emails: process.env.QUEUE_EMAILS_LIMIT,
        webhooks: process.env.QUEUE_WEBHOOKS_LIMIT,
        exports: process.env.QUEUE_EXPORTS_LIMIT,
        default: process.env.QUEUE_DEFAULT_LIMIT,
      },
    },

    workers: {
      imageTimeout: process.env.WORKER_IMAGE_TIMEOUT,
      pdfTimeout: process.env.WORKER_PDF_TIMEOUT,
      emailTimeout: process.env.WORKER_EMAIL_TIMEOUT,
      webhookTimeout: process.env.WORKER_WEBHOOK_TIMEOUT,
      exportTimeout: process.env.WORKER_EXPORT_TIMEOUT,
    },

    plugins: {
      lifeline: {
        interval: process.env.LIFELINE_INTERVAL,
        rescueAfter: process.env.LIFELINE_RESCUE_AFTER,
      },
      pruner: {
        interval: process.env.PRUNER_INTERVAL,
        maxAge: process.env.PRUNER_MAX_AGE,
      },
    },

    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
      s3Bucket: process.env.S3_BUCKET,
    },

    smtp: {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
      from: process.env.SMTP_FROM,
    },

    security: {
      apiKeyHeader: process.env.API_KEY_HEADER,
      jwtSecret: process.env.JWT_SECRET || 'change-me-in-production-must-be-at-least-32-chars',
    },

    rateLimit: {
      max: process.env.RATE_LIMIT_MAX,
      window: process.env.RATE_LIMIT_WINDOW,
    },

    monitoring: {
      enableMetrics: process.env.ENABLE_METRICS,
      metricsPort: process.env.METRICS_PORT,
    },
  };

  const result = ConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    console.error('Configuration validation failed:');
    console.error(result.error.format());
    throw new Error('Invalid configuration');
  }

  return result.data;
}

export const config = loadConfig();
