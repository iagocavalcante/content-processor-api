# Content Processor API

A production-ready content processing API built with [izi-queue](https://github.com/IagoCavalcante/izi-queue) for reliable background job processing, designed for deployment on Fly.io.

## Features

- **Reliable Background Job Processing** with izi-queue (database-backed, ACID guarantees)
- **Multiple Worker Types**: Image processing, PDF generation, email sending, webhook delivery, data exports
- **Production-Ready**: Comprehensive error handling, logging, monitoring, and graceful shutdown
- **Observable**: Structured logging with Pino, Prometheus metrics, health checks
- **Scalable**: Horizontal scaling support, configurable queue concurrency
- **Type-Safe**: Full TypeScript implementation with Zod validation
- **API Documentation**: Auto-generated Swagger/OpenAPI documentation
- **Security**: Rate limiting, CORS, Helmet security headers

## Architecture

### High-Level Overview

```
┌─────────────────┐
│  Fly.io Edge    │
│  Load Balancer  │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼────┐
│ API 1 │ │ API 2 │  (Multiple instances)
│ +     │ │ +     │
│ Queue │ │ Queue │
└───┬───┘ └───┬───┘
    │         │
    └────┬────┘
         │
    ┌────▼─────┐
    │ Postgres │  (Fly Postgres)
    │ Jobs DB  │
    └──────────┘
```

### Queue Architecture

- **images**: Image processing (resize, format conversion, optimization)
- **documents**: PDF generation from templates
- **emails**: Transactional and bulk email delivery
- **webhooks**: Reliable webhook delivery with retries
- **exports**: Large data exports (CSV, JSON, XLSX)
- **default**: Miscellaneous jobs

### Technology Stack

- **Runtime**: Node.js 20+
- **Framework**: Fastify
- **Queue**: izi-queue (PostgreSQL-backed)
- **Database**: PostgreSQL (Fly Postgres)
- **Validation**: Zod
- **Logging**: Pino
- **Platform**: Fly.io

## Getting Started

### Prerequisites

- Node.js 20 or later
- PostgreSQL 14 or later
- Fly CLI (for deployment)

### Local Development

1. **Clone and install dependencies**

```bash
cd content-processor-api
npm install
```

2. **Set up environment variables**

```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Set up PostgreSQL database**

```bash
# Create database
createdb content_processor

# Set DATABASE_URL in .env
export DATABASE_URL=postgres://user:password@localhost:5432/content_processor
```

4. **Run migrations**

```bash
npm run migrate
```

5. **Start development server**

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

API Documentation: `http://localhost:3000/documentation`

### Using the API

#### Create an Image Processing Job

```bash
curl -X POST http://localhost:3000/jobs/images \
  -H "Content-Type: application/json" \
  -d '{
    "imageId": "img-123",
    "sourceUrl": "https://example.com/image.jpg",
    "operations": {
      "resize": { "width": 800, "height": 600 },
      "format": "webp",
      "optimize": true
    },
    "tenantId": "tenant-1"
  }'
```

#### Create an Email Job

```bash
curl -X POST http://localhost:3000/jobs/emails \
  -H "Content-Type: application/json" \
  -d '{
    "to": "user@example.com",
    "subject": "Welcome to our service",
    "html": "<h1>Welcome!</h1>",
    "tenantId": "tenant-1"
  }'
```

#### Check Job Status

```bash
curl http://localhost:3000/jobs/1
```

#### Get Queue Status

```bash
curl http://localhost:3000/admin/queues
```

## Deployment to Fly.io

### Prerequisites

1. Install Fly CLI: https://fly.io/docs/hands-on/install-flyctl/
2. Sign up: `fly auth signup` or login: `fly auth login`

### Initial Setup

1. **Create Fly app**

```bash
fly launch --no-deploy
```

This will create a `fly.toml` configuration file (already provided in this repo).

2. **Create PostgreSQL database**

```bash
fly postgres create --name content-processor-db --region iad
```

3. **Attach database to app**

```bash
fly postgres attach content-processor-db
```

This automatically sets the `DATABASE_URL` secret.

4. **Set secrets**

```bash
# Required
fly secrets set JWT_SECRET=$(openssl rand -base64 32)

# Optional external service credentials
fly secrets set AWS_ACCESS_KEY_ID=your_key
fly secrets set AWS_SECRET_ACCESS_KEY=your_secret
fly secrets set SMTP_HOST=smtp.sendgrid.net
fly secrets set SMTP_USER=apikey
fly secrets set SMTP_PASSWORD=your_api_key
```

5. **Deploy**

```bash
fly deploy
```

The release command will run migrations automatically.

6. **Check status**

```bash
fly status
fly logs
```

### Scaling

```bash
# Scale to 3 instances
fly scale count 3

# Scale VM size
fly scale vm shared-cpu-4x --memory 2048

# Scale specific queue limits (edit fly.toml and redeploy)
```

### Monitoring

```bash
# View logs
fly logs

# SSH into instance
fly ssh console

# Check metrics
fly dashboard
```

### Accessing Your App

```bash
# Get app URL
fly info

# Open in browser
fly open
```

## Configuration

All configuration is managed through environment variables. See `.env.example` for all options.

Key configurations:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `QUEUE_*_LIMIT` | Concurrency limit per queue | 5-20 |
| `WORKER_*_TIMEOUT` | Worker timeout in ms | 30000-600000 |
| `LIFELINE_RESCUE_AFTER` | Rescue stuck jobs after N seconds | 300 |
| `PRUNER_MAX_AGE` | Delete jobs older than N seconds | 604800 (7d) |

## API Reference

### Job Endpoints

- `POST /jobs/images` - Create image processing job
- `POST /jobs/documents` - Create PDF generation job
- `POST /jobs/emails` - Create email sending job
- `POST /jobs/webhooks` - Create webhook delivery job
- `POST /jobs/exports` - Create data export job
- `GET /jobs/:id` - Get job status
- `DELETE /jobs` - Cancel jobs by criteria

### Admin Endpoints

- `GET /health` - Health check
- `GET /admin/queues` - Get all queue statuses
- `GET /admin/queues/:name` - Get specific queue status
- `POST /admin/queues/:name/pause` - Pause queue
- `POST /admin/queues/:name/resume` - Resume queue
- `POST /admin/queues/:name/scale` - Scale queue concurrency
- `POST /admin/jobs/prune` - Manually prune old jobs
- `POST /admin/jobs/rescue` - Manually rescue stuck jobs
- `GET /metrics` - Prometheus metrics

## Monitoring & Observability

### Structured Logging

All logs are structured JSON with correlation IDs:

```json
{
  "level": "info",
  "time": "2025-12-09T10:30:00.000Z",
  "jobId": 123,
  "worker": "ProcessImage",
  "queue": "images",
  "msg": "Job completed successfully"
}
```

### Health Checks

The `/health` endpoint returns queue status and is used by Fly.io for health monitoring.

### Metrics

Prometheus-compatible metrics at `/metrics`:

- `queue_limit` - Queue concurrency limit
- `queue_running` - Currently running jobs
- `queue_state` - Queue state (0=stopped, 1=running, 2=paused)

### Telemetry Events

izi-queue emits events for:
- `job:start`, `job:complete`, `job:error`, `job:cancel`, `job:snooze`
- `job:rescue`, `job:unique_conflict`
- `queue:start`, `queue:stop`, `queue:pause`, `queue:resume`
- `plugin:start`, `plugin:stop`, `plugin:error`

## Production Best Practices

### Error Handling

- Workers return `WorkerResults.error()` for retryable errors
- Workers return `WorkerResults.cancel()` for permanent errors
- Exponential backoff with jitter for retries
- Custom backoff strategies per worker

### Resilience

- **Circuit Breaking**: Automatic retry with backoff
- **Graceful Degradation**: Jobs are persisted in DB
- **Timeout Protection**: All workers have configurable timeouts
- **Stuck Job Recovery**: Lifeline plugin rescues jobs
- **Job Pruning**: Automatic cleanup of old completed jobs

### Security

- Rate limiting on all endpoints
- Helmet security headers
- CORS configuration
- Input validation with Zod
- Secrets management with Fly secrets

### Performance

- Connection pooling (20 connections)
- Configurable queue concurrency
- Horizontal scaling support
- Database indexes for job queries
- LISTEN/NOTIFY for low-latency job dispatch

## Troubleshooting

### Jobs not processing

1. Check queue status: `curl http://localhost:3000/admin/queues`
2. Check if queue is paused
3. Check database connectivity
4. Review logs for errors

### High job latency

1. Scale queue concurrency: `POST /admin/queues/:name/scale`
2. Scale to more instances: `fly scale count N`
3. Check worker timeouts
4. Monitor database performance

### Stuck jobs

Jobs stuck in `executing` state are automatically rescued by the Lifeline plugin after 5 minutes (configurable).

Manually rescue: `POST /admin/jobs/rescue?rescueAfterSeconds=300`

### Database migrations failing

```bash
# SSH into Fly instance
fly ssh console

# Run migrations manually
cd app
node dist/scripts/migrate.js
```

## Development

### Project Structure

```
src/
├── config/          # Configuration management
├── database/        # Database adapter and connection
├── queue/           # Queue initialization and telemetry
├── routes/          # API route handlers
│   ├── admin.ts     # Admin endpoints
│   └── jobs.ts      # Job creation endpoints
├── workers/         # Job worker implementations
│   ├── image-processor.ts
│   ├── pdf-generator.ts
│   ├── email-sender.ts
│   ├── webhook-deliverer.ts
│   └── data-exporter.ts
├── scripts/         # Utility scripts
│   └── migrate.ts   # Database migration script
└── server.ts        # Application entry point
```

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

### Type Checking

```bash
npm run typecheck
```

## License

MIT

## Support

For issues and questions:
- izi-queue: https://github.com/IagoCavalcante/izi-queue/issues
- Fly.io docs: https://fly.io/docs
