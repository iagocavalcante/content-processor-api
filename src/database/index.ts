import pg from 'pg';
import { createPostgresAdapter } from '../lib/izi-queue/index.js';
import { config } from '../config/index.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

export const queueAdapter = createPostgresAdapter(pool);

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
