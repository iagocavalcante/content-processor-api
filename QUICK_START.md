# Quick Start Guide

Get the Content Processor API running locally in 5 minutes!

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- npm or yarn

## 1. Install Dependencies

```bash
npm install
```

## 2. Set Up Environment

```bash
cp .env.example .env
```

Edit `.env` and set your `DATABASE_URL`:

```bash
DATABASE_URL=postgres://user:password@localhost:5432/content_processor
```

## 3. Create Database

```bash
createdb content_processor
```

Or using psql:

```sql
CREATE DATABASE content_processor;
```

## 4. Run Migrations

```bash
npm run migrate
```

## 5. Start Development Server

```bash
npm run dev
```

The API will start at http://localhost:3000

## 6. Test It Out

Open http://localhost:3000/documentation in your browser to see the Swagger UI.

Or try the health endpoint:

```bash
curl http://localhost:3000/health
```

## 7. Create Your First Job

```bash
curl -X POST http://localhost:3000/jobs/emails \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "subject": "Test Email",
    "text": "This is a test email from izi-queue!",
    "tenantId": "test-tenant"
  }'
```

Check the console logs to see the job being processed!

## Next Steps

- Read the [Architecture Document](./ARCHITECTURE.md) to understand the system design
- Check out [examples.http](./examples.http) for more API examples
- Deploy to Fly.io using the [Deployment Guide](./DEPLOYMENT.md)

## Troubleshooting

**Database connection error?**
- Verify PostgreSQL is running: `pg_isready`
- Check DATABASE_URL format: `postgres://user:password@host:port/database`

**Port already in use?**
- Change PORT in `.env` file
- Or stop the process using port 3000

**Migration errors?**
- Drop and recreate database: `dropdb content_processor && createdb content_processor`
- Run migrations again: `npm run migrate`

**Module not found errors?**
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Make sure you're using Node.js 20+: `node --version`
