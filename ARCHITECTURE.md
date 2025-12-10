# Architecture Document: Content Processor API

## Executive Summary

The Content Processor API is a production-ready backend system designed for reliable asynchronous job processing using **izi-queue**, a database-backed job queue library. The system is architected for horizontal scalability, fault tolerance, and operational simplicity on the Fly.io platform.

**Key Architecture Principles:**
- Database-backed queue for ACID guarantees and reliability
- Stateless application servers for horizontal scalability
- PostgreSQL LISTEN/NOTIFY for low-latency job dispatch
- Comprehensive observability with structured logging and metrics
- Graceful degradation and resilience patterns

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Fly.io Edge                              │
│                   (Global Load Balancer)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───────┐ ┌───▼────────┐ ┌──▼─────────┐
     │  API Instance  │ │  API Inst  │ │  API Inst  │
     │  (Region: IAD) │ │ (Reg: LHR) │ │ (Reg: FRA) │
     │                │ │            │ │            │
     │  ┌──────────┐  │ │ ┌────────┐ │ │ ┌────────┐ │
     │  │  Fastify │  │ │ │Fastify │ │ │ │Fastify │ │
     │  │  Server  │  │ │ │ Server │ │ │ │ Server │ │
     │  └────┬─────┘  │ │ └───┬────┘ │ │ └───┬────┘ │
     │       │        │ │     │      │ │     │      │
     │  ┌────▼─────┐  │ │ ┌───▼────┐ │ │ ┌───▼────┐ │
     │  │ izi-queue│  │ │ │izi-que │ │ │ │izi-que │ │
     │  │  Engine  │  │ │ │ Engine │ │ │ │ Engine │ │
     │  └────┬─────┘  │ │ └───┬────┘ │ │ └───┬────┘ │
     │       │        │ │     │      │ │     │      │
     │  ┌────▼─────┐  │ │ ┌───▼────┐ │ │ ┌───▼────┐ │
     │  │ Workers: │  │ │ │Workers │ │ │ │Workers │ │
     │  │ - Image  │  │ │ │ 5 types│ │ │ │5 types │ │
     │  │ - PDF    │  │ │ │        │ │ │ │        │ │
     │  │ - Email  │  │ │ │        │ │ │ │        │ │
     │  │ - Webhook│  │ │ │        │ │ │ │        │ │
     │  │ - Export │  │ │ │        │ │ │ │        │ │
     │  └────┬─────┘  │ │ └───┬────┘ │ │ └───┬────┘ │
     └───────┼────────┘ └─────┼──────┘ └─────┼──────┘
             │                │              │
             │     ┌──────────┴──────────┐   │
             └─────►   Fly Postgres      ◄───┘
                   │  (Primary Region)   │
                   │                     │
                   │  - Job Queue Tables │
                   │  - Application Data │
                   │  - LISTEN/NOTIFY    │
                   └─────────────────────┘
                             │
                   ┌─────────▼─────────┐
                   │  External Services│
                   │  - S3/Tigris      │
                   │  - SMTP/SendGrid  │
                   │  - Webhooks       │
                   └───────────────────┘
```

---

## Component Architecture

### 1. API Layer (Fastify)

**Responsibilities:**
- HTTP request handling and routing
- Input validation (Zod schemas)
- Authentication and authorization
- Rate limiting and security headers
- API documentation (Swagger/OpenAPI)

**Key Components:**
- **routes/jobs.ts**: Job creation endpoints (POST /jobs/*)
- **routes/admin.ts**: Queue management and monitoring (GET/POST /admin/*)
- **Validation**: Zod schemas for type-safe input validation
- **Error Handling**: Centralized error handler with proper HTTP status codes

**Resilience Patterns:**
- Rate limiting (configurable per endpoint)
- Request timeouts
- Circuit breaking via @fastify/rate-limit

---

### 2. Queue Layer (izi-queue)

**Responsibilities:**
- Job lifecycle management (insert, fetch, execute, retry)
- Queue concurrency control
- Job scheduling and prioritization
- Unique job enforcement
- Telemetry and observability

**Architecture:**

```
┌─────────────────────────────────────────────────────────┐
│                    IziQueue Instance                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│  │  Queue:    │  │  Queue:    │  │  Queue:    │       │
│  │  images    │  │  documents │  │  emails    │  ...  │
│  │  limit: 10 │  │  limit: 5  │  │  limit: 20 │       │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘       │
│        │               │               │               │
│        └───────────────┼───────────────┘               │
│                        │                               │
│                  ┌─────▼─────┐                         │
│                  │  Job Pool │                         │
│                  │  (DB)     │                         │
│                  └─────┬─────┘                         │
│                        │                               │
│        ┌───────────────┼───────────────┐               │
│        │               │               │               │
│  ┌─────▼──────┐  ┌────▼─────┐  ┌─────▼──────┐        │
│  │  Worker    │  │  Worker  │  │  Worker    │        │
│  │  Registry  │  │ Executor │  │  Backoff   │        │
│  └────────────┘  └──────────┘  └────────────┘        │
│                                                         │
│  ┌─────────────────────────────────────────────┐       │
│  │            Plugins                          │       │
│  │  - Lifeline (stuck job rescue)              │       │
│  │  - Pruner (old job cleanup)                 │       │
│  └─────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

**Key Features:**
- **Multiple Queues**: Isolated queues with independent concurrency limits
- **Priority System**: 0-10 priority scale (0 = highest)
- **Unique Jobs**: Deduplication based on configurable fields and time window
- **LISTEN/NOTIFY**: PostgreSQL pub/sub for instant job dispatch
- **Plugins**: Modular extensions (Lifeline, Pruner)

---

### 3. Worker Layer

**Worker Types:**

1. **ImageProcessorWorker** (`queue: images`)
   - Image resizing, format conversion, optimization
   - Timeout: 300s, Max Attempts: 3
   - Integrates with S3/object storage

2. **PDFGeneratorWorker** (`queue: documents`)
   - HTML to PDF conversion, template rendering
   - Timeout: 180s, Max Attempts: 3

3. **EmailSenderWorker** (`queue: emails`)
   - Transactional and bulk email delivery
   - Timeout: 30s, Max Attempts: 5
   - Custom exponential backoff with jitter

4. **WebhookDelivererWorker** (`queue: webhooks`)
   - HTTP webhook delivery with retries
   - Timeout: 30s, Max Attempts: 10
   - Circuit breaking for 4xx errors

5. **DataExporterWorker** (`queue: exports`)
   - Large data exports (CSV, JSON, XLSX)
   - Timeout: 600s, Max Attempts: 3
   - Progress tracking via job metadata

**Worker Lifecycle:**

```
Job Inserted → Scheduled → Available → Fetched → Executing
                                                      │
                         ┌────────────────────────────┼──────────────┐
                         │                            │              │
                    ┌────▼────┐                  ┌────▼────┐    ┌───▼───┐
                    │  Error  │                  │   OK    │    │Cancel │
                    │ (Retry) │                  │         │    │       │
                    └────┬────┘                  └────┬────┘    └───┬───┘
                         │                            │             │
                    ┌────▼────┐                  ┌────▼────┐    ┌───▼───┐
                    │Retryable│                  │Complete │    │Discard│
                    └────┬────┘                  └─────────┘    └───────┘
                         │
                    (Exponential
                     Backoff)
                         │
                         └──► Available (Retry)
```

---

### 4. Database Layer (PostgreSQL)

**Schema:**

```sql
-- izi_jobs table (managed by izi-queue)
CREATE TABLE izi_jobs (
  id SERIAL PRIMARY KEY,
  state VARCHAR(20) NOT NULL,
  queue VARCHAR(255) NOT NULL,
  worker VARCHAR(255) NOT NULL,
  args JSONB NOT NULL,
  meta JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  errors JSONB DEFAULT '[]',
  attempt INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 20,
  priority INTEGER DEFAULT 0,
  inserted_at TIMESTAMP DEFAULT NOW(),
  scheduled_at TIMESTAMP DEFAULT NOW(),
  attempted_at TIMESTAMP,
  completed_at TIMESTAMP,
  discarded_at TIMESTAMP,
  cancelled_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_jobs_queue_state ON izi_jobs(queue, state);
CREATE INDEX idx_jobs_scheduled ON izi_jobs(scheduled_at) WHERE state = 'scheduled';
CREATE INDEX idx_jobs_state ON izi_jobs(state);
```

**LISTEN/NOTIFY for Low-Latency:**

When a job is inserted, izi-queue notifies listening instances:

```sql
-- Notify format: "queue_name"
NOTIFY izi_queue, 'images';
```

All instances with `queue.listen()` receive notification and immediately fetch jobs.

---

## Data Flow

### Job Creation Flow

```
1. Client Request
   POST /jobs/images
   │
2. Validation (Zod)
   │
3. Queue Insert
   queue.insert('ProcessImage', args)
   │
4. Database Transaction
   INSERT INTO izi_jobs ...
   │
5. NOTIFY Event (if queue started)
   NOTIFY izi_queue, 'images'
   │
6. All Instances Listen
   ├─► Instance 1: Fetch jobs
   ├─► Instance 2: Fetch jobs
   └─► Instance 3: Fetch jobs
   │
7. Worker Execution
   executeWorker(job)
   │
8. Result Handling
   ├─► OK: Mark completed
   ├─► Error: Retry with backoff
   └─► Cancel: Mark discarded
```

### Job Execution Flow

```
┌────────────────────────────────────────────────────────┐
│                Queue.dispatch()                        │
│                                                        │
│  1. Fetch available jobs (LIMIT = queue.limit)        │
│     SELECT * FROM izi_jobs                            │
│     WHERE queue = 'images'                            │
│       AND state = 'available'                         │
│     ORDER BY priority, scheduled_at                   │
│     LIMIT 10                                          │
│     FOR UPDATE SKIP LOCKED                            │
│                                                        │
│  2. Update state to 'executing'                       │
│                                                        │
│  3. Execute worker concurrently                       │
│     Promise.allSettled(jobs.map(executeWorker))       │
│                                                        │
│  4. Handle results                                    │
│     ├─► OK: UPDATE state = 'completed'                │
│     ├─► Error: UPDATE state = 'retryable',            │
│     │           scheduled_at = NOW() + backoff        │
│     └─► Cancel: UPDATE state = 'discarded'            │
└────────────────────────────────────────────────────────┘
```

---

## Resilience Patterns

### 1. Retry with Exponential Backoff

**Implementation:**

```typescript
backoff(attempt) = min(
  baseDelay * 2^(attempt - 1) + jitter,
  maxDelay
)

// Example for emails:
baseDelay = 1000ms
maxDelay = 300000ms (5 min)
jitter = random(0, 1000ms)

attempt 1: ~1s
attempt 2: ~2s
attempt 3: ~4s
attempt 4: ~8s
attempt 5: ~16s
...
```

**Per-Worker Backoff:**
- Emails: 1s → 5min
- Webhooks: 2s → 1hour
- Default: Exponential with 1min max

### 2. Circuit Breaking

**Worker-Level:**
- Workers distinguish transient vs permanent errors
- 4xx HTTP errors → Cancel (don't retry)
- 5xx HTTP errors → Retry
- Network errors → Retry

**Application-Level:**
- Rate limiting per endpoint (100 req/min default)
- Connection pool limits (20 connections)

### 3. Timeout Protection

All workers have configurable timeouts:

```typescript
const result = await Promise.race([
  worker.perform(job),
  timeoutPromise(worker.timeout)
]);
```

### 4. Graceful Degradation

- Jobs persist in database (survive crashes)
- Lifeline plugin rescues stuck jobs (5min default)
- Queue pause/resume for maintenance
- Graceful shutdown (30s grace period)

### 5. Idempotency

- Unique jobs prevent duplicates
- Workers should be idempotent (safe to retry)
- Job IDs for deduplication

---

## Scalability

### Horizontal Scaling

**Application Servers:**
- Stateless design (no in-memory state)
- All instances can process any job
- Scale to 10s or 100s of instances
- Fly.io auto-scaling support

**Database:**
- Connection pooling (20 per instance)
- Read replicas (future enhancement)
- Connection limits managed by pool

**Concurrency Control:**
```
Total Concurrency =
  Instances × Queue Limit

Example:
3 instances × 10 (images) = 30 concurrent image jobs
3 instances × 20 (emails) = 60 concurrent email jobs
```

### Vertical Scaling

**Per-Queue Concurrency:**
- Adjust `QUEUE_*_LIMIT` environment variables
- Runtime scaling via `POST /admin/queues/:name/scale`

**VM Sizing:**
- shared-cpu-1x (512MB): Dev/testing
- shared-cpu-2x (1GB): Light production
- shared-cpu-4x (2GB): Standard production
- dedicated-cpu-2x (4GB): High-performance

---

## Observability

### Structured Logging (Pino)

**Log Format:**
```json
{
  "level": 30,
  "time": 1733742600000,
  "pid": 123,
  "hostname": "abc123",
  "jobId": 456,
  "worker": "ProcessImage",
  "queue": "images",
  "msg": "Job completed successfully",
  "duration": 1234
}
```

**Log Levels:**
- `fatal`: Application crash
- `error`: Job failures, unhandled errors
- `warn`: Retries, deprecated features
- `info`: Job lifecycle, queue events
- `debug`: Detailed execution info
- `trace`: Very verbose

### Telemetry Events

izi-queue emits structured events:

```typescript
queue.on('job:start', ({ job }) => {
  logger.info({ jobId: job.id, worker: job.worker }, 'Job started');
});

queue.on('job:complete', ({ job, duration }) => {
  logger.info({ jobId: job.id, duration }, 'Job completed');
});

queue.on('job:error', ({ job, error }) => {
  logger.error({ jobId: job.id, error }, 'Job failed');
});
```

### Metrics (Prometheus)

**Exposed Metrics:**
- `queue_limit{queue="images"}` - Concurrency limit
- `queue_running{queue="images"}` - Currently running jobs
- `queue_state{queue="images"}` - Queue state (0/1/2)

**Custom Metrics (Future):**
- `jobs_completed_total` - Counter
- `jobs_failed_total` - Counter
- `job_duration_seconds` - Histogram
- `queue_depth` - Gauge

### Health Checks

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "ok",
  "uptime": 123456,
  "timestamp": "2025-12-09T10:00:00.000Z",
  "queues": [
    {
      "name": "images",
      "state": "running",
      "limit": 10,
      "running": 3
    }
  ]
}
```

**Health Check Criteria:**
- HTTP 200 if queue is running
- HTTP 503 if critical failure

---

## Security

### Application Security

1. **Input Validation**: Zod schemas for all inputs
2. **Rate Limiting**: 100 req/min per IP (configurable)
3. **Security Headers**: Helmet middleware (CSP, HSTS, etc.)
4. **CORS**: Configurable origin whitelist
5. **Secrets Management**: Fly.io encrypted secrets

### Network Security

1. **TLS**: Fly.io terminates TLS at edge
2. **Private Network**: Database on Fly private network
3. **mTLS**: Optional for service-to-service

### Authentication (Future Enhancement)

```typescript
// JWT-based authentication
fastify.addHook('onRequest', async (request, reply) => {
  const token = request.headers.authorization?.split(' ')[1];
  const payload = verifyJWT(token, config.security.jwtSecret);
  request.user = payload;
});
```

---

## Deployment Architecture

### Multi-Region Setup

```
Primary Region (IAD):
├─ 2 API Instances
├─ PostgreSQL Primary
└─ Metrics Collection

Secondary Region (LHR):
├─ 1 API Instance
└─ Read Replica (optional)

Tertiary Region (FRA):
├─ 1 API Instance
└─ Read Replica (optional)
```

### Deployment Strategy

**Rolling Deployment:**
1. Deploy to 1 instance
2. Health check passes
3. Deploy to next instance
4. Repeat until all updated

**Zero-Downtime Requirements:**
- Minimum 2 instances
- Health checks configured
- Graceful shutdown (SIGTERM)
- 30s grace period

---

## Trade-Offs & Design Decisions

### 1. Database-Backed Queue vs In-Memory

**Chosen: Database-Backed (izi-queue)**

**Rationale:**
- ACID guarantees (jobs never lost)
- No additional infrastructure (Redis, RabbitMQ)
- Transactional job insertion with business data
- Built-in persistence and observability

**Trade-off:**
- Slightly higher latency than in-memory queues
- Database load increases with job throughput

**Mitigation:**
- LISTEN/NOTIFY for low-latency dispatch
- Connection pooling
- Database indexes for fast queries

### 2. Multiple Queues vs Single Queue with Priorities

**Chosen: Multiple Queues**

**Rationale:**
- Isolation (image processing doesn't block emails)
- Independent concurrency limits
- Easier monitoring and debugging
- Better resource allocation

**Trade-off:**
- More complex configuration
- Requires queue selection logic

### 3. Stateless Workers vs Dedicated Worker Processes

**Chosen: Stateless Workers (in-process)**

**Rationale:**
- Simpler deployment (single process)
- Lower resource overhead
- Easier scaling (just add instances)
- No inter-process communication

**Trade-off:**
- Worker crash takes down HTTP server
- All workers compete for resources

**Mitigation:**
- Worker timeouts prevent runaway jobs
- Process managers (dumb-init) restart on crash
- Multiple instances for redundancy

### 4. PostgreSQL vs MySQL vs SQLite

**Chosen: PostgreSQL**

**Rationale:**
- LISTEN/NOTIFY for pub/sub
- Excellent JSONB support
- FOR UPDATE SKIP LOCKED (concurrency)
- Industry standard for production

**Trade-off:**
- Requires managed database service

---

## Future Enhancements

### Phase 1: Enhanced Observability
- [ ] Distributed tracing (OpenTelemetry)
- [ ] Custom Prometheus metrics
- [ ] Grafana dashboards
- [ ] Alerting (PagerDuty, Opsgenie)

### Phase 2: Performance Optimization
- [ ] Read replicas for job queries
- [ ] Redis caching layer
- [ ] Job batching for exports
- [ ] Connection pooling optimization

### Phase 3: Advanced Features
- [ ] Job dependencies (DAG workflows)
- [ ] Scheduled/cron jobs
- [ ] Multi-tenancy improvements
- [ ] Dead letter queue
- [ ] Job result storage (separate table)

### Phase 4: Developer Experience
- [ ] CLI for job management
- [ ] Web UI for queue monitoring
- [ ] GraphQL API
- [ ] Webhooks for job events

---

## References

- **izi-queue**: https://github.com/IagoCavalcante/izi-queue
- **Fastify**: https://fastify.dev
- **Fly.io**: https://fly.io/docs
- **PostgreSQL**: https://www.postgresql.org/docs
- **12-Factor App**: https://12factor.net
