import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

const API_KEY = 'test-api-key-that-is-at-least-32-characters-long';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://user:pass@localhost:5432/does-not-connect';
process.env.API_KEY = API_KEY;

const { buildServer } = await import('../src/app.js');

/**
 * Every route except the health check must require the API key. These assert it
 * per route rather than in aggregate: a guard that misses one endpoint is the
 * failure mode worth catching, and an aggregate test would not notice.
 */
describe('authentication', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const protectedRoutes: Array<{ method: 'GET' | 'POST' | 'DELETE'; url: string }> = [
    { method: 'GET', url: '/' },
    { method: 'GET', url: '/admin/queues' },
    { method: 'GET', url: '/admin/queues/emails' },
    { method: 'GET', url: '/metrics' },
    { method: 'POST', url: '/admin/queues/emails/pause' },
    { method: 'POST', url: '/admin/queues/emails/resume' },
    { method: 'POST', url: '/admin/queues/emails/scale' },
    { method: 'POST', url: '/admin/jobs/prune' },
    { method: 'POST', url: '/admin/jobs/rescue' },
    { method: 'POST', url: '/jobs/images' },
    { method: 'POST', url: '/jobs/documents' },
    { method: 'POST', url: '/jobs/emails' },
    { method: 'POST', url: '/jobs/webhooks' },
    { method: 'POST', url: '/jobs/exports' },
    { method: 'GET', url: '/jobs/1' },
    { method: 'DELETE', url: '/jobs' },
  ];

  it.each(protectedRoutes)('rejects $method $url without a key', async ({ method, url }) => {
    const response = await app.inject({ method, url });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthorized' });
  });

  it.each(protectedRoutes)('rejects $method $url with a wrong key', async ({ method, url }) => {
    const response = await app.inject({
      method,
      url,
      headers: { 'x-api-key': 'wrong-key-of-exactly-the-same-length-padding' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('allows the health check without a key', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });

  it('accepts a valid key', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: { 'x-api-key': API_KEY },
    });

    expect(response.statusCode).toBe(200);
  });

  it('is not fooled by a key that only shares a prefix', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: { 'x-api-key': API_KEY.slice(0, -1) },
    });

    expect(response.statusCode).toBe(401);
  });

  it('ignores the key when passed as a query parameter', async () => {
    // Credentials in a URL end up in access logs and referrers.
    const response = await app.inject({ method: 'GET', url: `/?apiKey=${API_KEY}` });

    expect(response.statusCode).toBe(401);
  });

  it('does not serve API documentation outside development', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/documentation',
      headers: { 'x-api-key': API_KEY },
    });

    expect(response.statusCode).toBe(404);
  });
});

/**
 * The bulk cancel endpoint forwards optional query filters straight to the
 * queue. With none supplied it used to cancel every pending job in the
 * database -- which is exactly what a caller does by hitting DELETE /jobs.
 */
describe('bulk cancel scoping', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = { 'x-api-key': API_KEY };

  it('refuses an unscoped cancel', async () => {
    const response = await app.inject({ method: 'DELETE', url: '/jobs', headers: auth });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/refusing to cancel every job/i);
  });

  it('refuses when filters are present but empty', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/jobs?worker=&queue=&state=',
      headers: auth,
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects an unknown job state instead of passing it through', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/jobs?state=bogus',
      headers: auth,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/unknown job state/i);
  });

  it('still requires the API key', async () => {
    const response = await app.inject({ method: 'DELETE', url: '/jobs?worker=SendEmail' });

    expect(response.statusCode).toBe(401);
  });
});
