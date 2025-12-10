# Deployment Guide: Content Processor API on Fly.io

This guide covers the complete deployment process for the Content Processor API on Fly.io, including production best practices, monitoring, and operations.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Deployment](#initial-deployment)
3. [Database Setup](#database-setup)
4. [Environment Configuration](#environment-configuration)
5. [Deployment Strategy](#deployment-strategy)
6. [Scaling](#scaling)
7. [Monitoring & Observability](#monitoring--observability)
8. [Backup & Disaster Recovery](#backup--disaster-recovery)
9. [Operations](#operations)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

1. **Fly CLI**: Install from https://fly.io/docs/hands-on/install-flyctl/

```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh

# Windows
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

2. **Node.js 20+**: https://nodejs.org/

3. **PostgreSQL Client** (for local testing): https://www.postgresql.org/download/

### Fly.io Account Setup

```bash
# Sign up or log in
fly auth signup
# or
fly auth login

# Verify authentication
fly auth whoami
```

---

## Initial Deployment

### Step 1: Create Fly App

```bash
# Navigate to project directory
cd content-processor-api

# Initialize Fly app (use existing fly.toml)
fly launch --no-deploy --name content-processor-api --region iad

# Choose options:
# - Organization: your-org
# - Region: iad (or closest to your users)
# - PostgreSQL: No (we'll create separately)
# - Redis: No
```

### Step 2: Create PostgreSQL Database

```bash
# Create Postgres cluster
fly postgres create \
  --name content-processor-db \
  --region iad \
  --vm-size shared-cpu-2x \
  --volume-size 10

# Note the connection details shown
```

### Step 3: Attach Database to App

```bash
# Attach database (sets DATABASE_URL automatically)
fly postgres attach content-processor-db --app content-processor-api

# Verify attachment
fly postgres db list --app content-processor-db
```

### Step 4: Set Required Secrets

```bash
# Generate and set JWT secret
fly secrets set JWT_SECRET=$(openssl rand -base64 32) --app content-processor-api

# Set external service credentials (optional)
fly secrets set \
  AWS_ACCESS_KEY_ID=your_aws_key \
  AWS_SECRET_ACCESS_KEY=your_aws_secret \
  AWS_REGION=us-east-1 \
  S3_BUCKET=your-bucket \
  --app content-processor-api

# Set SMTP credentials (optional)
fly secrets set \
  SMTP_HOST=smtp.sendgrid.net \
  SMTP_PORT=587 \
  SMTP_USER=apikey \
  SMTP_PASSWORD=your_sendgrid_key \
  SMTP_FROM=noreply@yourdomain.com \
  --app content-processor-api

# View configured secrets (values hidden)
fly secrets list --app content-processor-api
```

### Step 5: Deploy Application

```bash
# Build and deploy
fly deploy --app content-processor-api

# The release command will run migrations automatically
# Watch deployment progress
fly logs --app content-processor-api
```

### Step 6: Verify Deployment

```bash
# Check app status
fly status --app content-processor-api

# View recent logs
fly logs --app content-processor-api

# Test health endpoint
fly open /health --app content-processor-api

# Or curl directly
curl https://content-processor-api.fly.dev/health
```

---

## Database Setup

### Connection Management

The app uses a connection pool with these settings:

```typescript
{
  max: 20,              // Maximum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
}
```

### Database Migrations

Migrations run automatically on deployment via the `release_command` in `fly.toml`:

```toml
[deploy]
  release_command = "node dist/scripts/migrate.js"
```

Manual migration:

```bash
# SSH into instance
fly ssh console --app content-processor-api

# Run migrations
cd /app
node dist/scripts/migrate.js
```

### Database Maintenance

```bash
# Connect to database
fly postgres connect --app content-processor-db

# View database size
SELECT pg_database_size('content_processor');

# Analyze job queue performance
SELECT state, queue, COUNT(*)
FROM izi_jobs
GROUP BY state, queue;

# Find long-running jobs
SELECT id, worker, queue, state,
       NOW() - attempted_at as duration
FROM izi_jobs
WHERE state = 'executing'
ORDER BY attempted_at;
```

### Database Backups

Fly.io automatically backs up Postgres daily. Manual backup:

```bash
# Create snapshot
fly postgres backup create --app content-processor-db

# List backups
fly postgres backup list --app content-processor-db

# Restore from backup (creates new instance)
fly postgres restore --app content-processor-db --snapshot-id <id>
```

---

## Environment Configuration

### fly.toml Configuration

The `fly.toml` file controls app behavior:

```toml
# Key settings to adjust per environment

[http_service]
  min_machines_running = 2    # Minimum instances (production: 2+)
  auto_stop_machines = false  # Keep running (production: false)
  auto_start_machines = true  # Auto-start on traffic

[[vm]]
  size = "shared-cpu-2x"      # VM size (scale up for production)
  memory = "1gb"              # Memory (scale up for heavy workloads)

[deploy]
  strategy = "rolling"        # Deployment strategy (rolling/canary/immediate)
```

### Environment-Specific Configuration

**Development:**
```toml
min_machines_running = 1
auto_stop_machines = true
size = "shared-cpu-1x"
memory = "512mb"
```

**Staging:**
```toml
min_machines_running = 1
auto_stop_machines = false
size = "shared-cpu-2x"
memory = "1gb"
```

**Production:**
```toml
min_machines_running = 3
auto_stop_machines = false
size = "shared-cpu-4x"
memory = "2gb"
```

---

## Deployment Strategy

### Rolling Deployment (Default)

Zero-downtime deployment, one machine at a time:

```bash
fly deploy --strategy rolling --app content-processor-api
```

### Canary Deployment

Deploy to one instance first, then roll out:

```bash
fly deploy --strategy canary --app content-processor-api
```

### Immediate Deployment

Deploy to all instances simultaneously (downtime):

```bash
fly deploy --strategy immediate --app content-processor-api
```

### Blue-Green Deployment

For critical changes, use a separate app:

```bash
# Clone existing app
fly apps create content-processor-api-green

# Deploy to green
fly deploy --app content-processor-api-green

# Test green deployment
curl https://content-processor-api-green.fly.dev/health

# Swap DNS (or use load balancer)
fly apps move content-processor-api content-processor-api-blue
fly apps move content-processor-api-green content-processor-api
```

### Rollback

```bash
# List releases
fly releases --app content-processor-api

# Rollback to previous version
fly releases rollback <version> --app content-processor-api
```

---

## Scaling

### Horizontal Scaling (More Instances)

```bash
# Scale to 3 instances
fly scale count 3 --app content-processor-api

# Scale per region
fly scale count 2 --region iad
fly scale count 1 --region lhr
```

### Vertical Scaling (Larger VMs)

```bash
# List available VM sizes
fly platform vm-sizes

# Scale to larger VM
fly scale vm shared-cpu-4x --memory 2048 --app content-processor-api

# For high-performance workloads
fly scale vm performance-2x --memory 4096 --app content-processor-api
```

### Queue-Specific Scaling

Edit queue limits in `fly.toml` or set via environment:

```bash
fly secrets set \
  QUEUE_IMAGES_LIMIT=20 \
  QUEUE_EMAILS_LIMIT=50 \
  QUEUE_WEBHOOKS_LIMIT=30 \
  --app content-processor-api

fly deploy --app content-processor-api
```

### Auto-Scaling

Fly.io supports auto-scaling based on metrics:

```bash
# Enable auto-scaling
fly autoscale set min=2 max=10 --app content-processor-api

# Set scaling metric (connections, cpu, memory)
fly autoscale set --metric cpu --target 80 --app content-processor-api

# View auto-scale config
fly autoscale show --app content-processor-api
```

---

## Monitoring & Observability

### Logs

```bash
# Tail logs
fly logs --app content-processor-api

# Filter by instance
fly logs -i <instance-id> --app content-processor-api

# Search logs
fly logs --app content-processor-api | grep "ERROR"
```

### Metrics

Access Prometheus metrics:

```bash
curl https://content-processor-api.fly.dev/metrics
```

Integrate with Grafana Cloud or Datadog:

```bash
# Example: Forward metrics to Grafana
fly extensions grafana create --app content-processor-api
```

### Health Checks

Built-in health check at `/health`:

```bash
# Manual health check
curl https://content-processor-api.fly.dev/health

# Response includes queue status
{
  "status": "ok",
  "uptime": 123456,
  "timestamp": "2025-12-09T10:00:00.000Z",
  "queues": [
    {"name": "images", "state": "running", "limit": 10, "running": 3},
    {"name": "emails", "state": "running", "limit": 20, "running": 8}
  ]
}
```

### Dashboard

```bash
# Open Fly.io dashboard
fly dashboard --app content-processor-api
```

### Alerts

Set up alerts for critical events:

1. **Via Fly.io**: Configure in dashboard (Health checks, deployments)
2. **Via Prometheus**: Integrate with Alertmanager
3. **Via Application Logs**: Use log aggregation service (Datadog, Logtail)

---

## Backup & Disaster Recovery

### Database Backups

```bash
# Automatic daily backups (enabled by default)

# Manual backup
fly postgres backup create --app content-processor-db

# Download backup
fly postgres backup download <backup-id> --app content-processor-db
```

### Application State

Jobs are persisted in PostgreSQL, so database backup = full state backup.

### Recovery Procedures

**Database Failure:**

```bash
# Restore from backup to new cluster
fly postgres restore --snapshot-id <id> --app content-processor-db-restored

# Attach to app
fly postgres attach content-processor-db-restored --app content-processor-api
```

**App Failure:**

```bash
# Redeploy from git
git checkout <known-good-commit>
fly deploy --app content-processor-api

# Or rollback
fly releases rollback <version> --app content-processor-api
```

**Region Failure:**

Deploy to multiple regions for high availability:

```bash
fly regions add lhr fra --app content-processor-api
fly scale count 2 --region lhr
fly scale count 2 --region fra
```

---

## Operations

### Queue Management

```bash
# Pause queue (stop processing)
curl -X POST https://content-processor-api.fly.dev/admin/queues/emails/pause

# Resume queue
curl -X POST https://content-processor-api.fly.dev/admin/queues/emails/resume

# Scale queue concurrency
curl -X POST https://content-processor-api.fly.dev/admin/queues/emails/scale \
  -H "Content-Type: application/json" \
  -d '{"limit": 30}'
```

### Job Management

```bash
# Get job status
curl https://content-processor-api.fly.dev/jobs/123

# Cancel jobs
curl -X DELETE "https://content-processor-api.fly.dev/jobs?worker=ProcessImage&queue=images"

# Prune old jobs (older than 7 days)
curl -X POST "https://content-processor-api.fly.dev/admin/jobs/prune?maxAgeSeconds=604800"

# Rescue stuck jobs
curl -X POST "https://content-processor-api.fly.dev/admin/jobs/rescue?rescueAfterSeconds=300"
```

### Maintenance Mode

```bash
# Stop processing new jobs (pause all queues)
for queue in images documents emails webhooks exports default; do
  curl -X POST https://content-processor-api.fly.dev/admin/queues/$queue/pause
done

# Resume all queues
for queue in images documents emails webhooks exports default; do
  curl -X POST https://content-processor-api.fly.dev/admin/queues/$queue/resume
done
```

### Secret Rotation

```bash
# Update JWT secret
fly secrets set JWT_SECRET=$(openssl rand -base64 32) --app content-processor-api

# Update SMTP credentials
fly secrets set SMTP_PASSWORD=new_password --app content-processor-api

# Secrets are applied on next deployment or restart
fly apps restart --app content-processor-api
```

---

## Troubleshooting

### High Memory Usage

```bash
# Check memory usage
fly status --app content-processor-api

# View detailed metrics
fly dashboard --app content-processor-api

# Solutions:
# 1. Scale to larger VM
fly scale vm shared-cpu-4x --memory 2048

# 2. Reduce queue concurrency
# Update QUEUE_*_LIMIT in fly.toml or secrets

# 3. Add more instances
fly scale count 3
```

### Database Connection Pool Exhausted

```bash
# Check connection pool size (default: 20)
# Symptoms: "sorry, too many clients already" errors

# Solutions:
# 1. Increase max connections in code (database/index.ts)
# 2. Scale to more instances (distributes load)
# 3. Upgrade database VM
fly postgres update --vm-size dedicated-cpu-2x --app content-processor-db
```

### Jobs Processing Slowly

```bash
# Check queue status
curl https://content-processor-api.fly.dev/admin/queues

# Identify bottlenecks:
# - running == limit? Increase concurrency
# - High job backlog? Scale horizontally

# Solutions:
# 1. Increase queue concurrency
curl -X POST https://content-processor-api.fly.dev/admin/queues/images/scale \
  -d '{"limit": 20}'

# 2. Add more instances
fly scale count 4

# 3. Check worker timeouts (might be too short)
```

### Deployment Failures

```bash
# View deployment logs
fly logs --app content-processor-api

# Common issues:
# 1. Migration failure: Check database connectivity
# 2. Build failure: Check Dockerfile and dependencies
# 3. Health check failure: Verify /health endpoint

# Rollback if needed
fly releases rollback --app content-processor-api
```

### Instance Crashes

```bash
# Check crash logs
fly logs --app content-processor-api | grep -i "crash\|error\|fatal"

# SSH into instance for debugging
fly ssh console --app content-processor-api

# Check Node.js memory limits
node --max-old-space-size=1024 dist/server.js  # Adjust in Dockerfile if needed
```

---

## Best Practices Checklist

- [ ] **Multi-Region Deployment**: Deploy to 2+ regions for HA
- [ ] **Minimum 2 Instances**: Ensure zero-downtime deployments
- [ ] **Database Backups**: Verify automatic backups are enabled
- [ ] **Health Checks**: Ensure /health endpoint is responsive
- [ ] **Secrets Management**: Rotate secrets regularly
- [ ] **Monitoring**: Set up alerts for critical metrics
- [ ] **Resource Limits**: Configure appropriate queue concurrency
- [ ] **Graceful Shutdown**: Test SIGTERM handling (30s grace period)
- [ ] **Rate Limiting**: Configure per-tenant limits
- [ ] **Log Aggregation**: Forward logs to external service

---

## Support Resources

- **Fly.io Docs**: https://fly.io/docs
- **Fly.io Community**: https://community.fly.io
- **izi-queue**: https://github.com/IagoCavalcante/izi-queue
- **Fly.io Status**: https://status.fly.io

For production support, consider Fly.io's paid support plans: https://fly.io/plans
