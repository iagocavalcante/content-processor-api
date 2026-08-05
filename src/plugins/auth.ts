import { timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/index.js';

/**
 * Routes reachable without credentials.
 *
 * Only the health check: the platform polls it to decide whether the machine
 * is alive, and it exposes nothing beyond queue names and counts.
 */
const PUBLIC_PATHS = new Set(['/health']);

/**
 * Compares two secrets without leaking their contents through timing.
 *
 * `timingSafeEqual` throws on a length mismatch, and returning early on length
 * would itself leak, so a mismatch still performs a comparison of equal-length
 * buffers before failing.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }

  return timingSafeEqual(a, b);
}

/**
 * Requires an API key on every request except the health check.
 *
 * Registered as `onRequest` so it runs before body parsing and before any
 * handler touches the queue: an unauthenticated request never reaches the
 * database.
 */
export function registerAuth(fastify: FastifyInstance): void {
  const headerName = config.security.apiKeyHeader.toLowerCase();

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (PUBLIC_PATHS.has(request.url.split('?')[0])) return;

    const provided = request.headers[headerName];

    if (typeof provided !== 'string' || !secretsMatch(provided, config.security.apiKey)) {
      // Deliberately uninformative: distinguishing "missing" from "wrong"
      // tells an attacker which half they got right.
      request.log.warn(
        { url: request.url, method: request.method, ip: request.ip },
        'Rejected unauthenticated request'
      );
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
}
