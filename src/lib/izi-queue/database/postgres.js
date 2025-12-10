import { BaseAdapter, SQL, rowToJob } from './adapter.js';
import { postgresMigrations } from './migrations.js';
export class PostgresAdapter extends BaseAdapter {
    pool;
    client;
    listening = false;
    reconnecting = false;
    reconnectAttempts = 0;
    maxReconnectAttempts = 10;
    reconnectDelay = 1000;
    constructor(pool) {
        super();
        this.pool = pool;
        this.setupErrorHandling();
    }
    setupErrorHandling() {
        this.pool.on('error', (err) => {
            console.error('[izi-queue] PostgreSQL pool error:', err.message);
            this.handleConnectionError();
        });
    }
    async handleConnectionError() {
        if (this.reconnecting)
            return;
        this.reconnecting = true;
        while (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`[izi-queue] Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            try {
                await this.pool.query('SELECT 1');
                console.log('[izi-queue] Reconnected successfully');
                this.reconnecting = false;
                this.reconnectAttempts = 0;
                return;
            }
            catch {
                const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
                await new Promise(resolve => setTimeout(resolve, Math.min(delay, 30000)));
            }
        }
        console.error('[izi-queue] Failed to reconnect after maximum attempts');
        this.reconnecting = false;
    }
    async migrate() {
        await this.pool.query(`
      CREATE TABLE IF NOT EXISTS izi_migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
        const result = await this.pool.query('SELECT version FROM izi_migrations ORDER BY version');
        const appliedVersions = new Set(result.rows.map(r => r.version));
        for (const migration of postgresMigrations) {
            if (!appliedVersions.has(migration.version)) {
                console.log(`[izi-queue] Applying migration ${migration.version}: ${migration.name}`);
                const client = await this.pool.connect();
                try {
                    await client.query('BEGIN');
                    const statements = migration.up.split(';').filter(s => s.trim());
                    for (const stmt of statements) {
                        if (stmt.trim()) {
                            await client.query(stmt);
                        }
                    }
                    await client.query('INSERT INTO izi_migrations (version, name) VALUES ($1, $2)', [migration.version, migration.name]);
                    await client.query('COMMIT');
                }
                catch (error) {
                    await client.query('ROLLBACK');
                    throw error;
                }
                finally {
                    client.release();
                }
            }
        }
    }
    async rollback(targetVersion = 0) {
        const result = await this.pool.query('SELECT version FROM izi_migrations WHERE version > $1 ORDER BY version DESC', [targetVersion]);
        for (const row of result.rows) {
            const migration = postgresMigrations.find(m => m.version === row.version);
            if (migration?.down) {
                console.log(`[izi-queue] Rolling back migration ${migration.version}: ${migration.name}`);
                const client = await this.pool.connect();
                try {
                    await client.query('BEGIN');
                    await client.query(migration.down);
                    await client.query('DELETE FROM izi_migrations WHERE version = $1', [migration.version]);
                    await client.query('COMMIT');
                }
                catch (error) {
                    await client.query('ROLLBACK');
                    throw error;
                }
                finally {
                    client.release();
                }
            }
        }
    }
    async getMigrationStatus() {
        const result = await this.pool.query('SELECT version, name FROM izi_migrations');
        const applied = new Map(result.rows.map(r => [r.version, r.name]));
        return postgresMigrations.map(m => ({
            version: m.version,
            name: m.name,
            applied: applied.has(m.version)
        }));
    }
    async insertJob(job) {
        const result = await this.pool.query(SQL.postgres.insertJob, [
            job.state,
            job.queue,
            job.worker,
            JSON.stringify(job.args),
            JSON.stringify(job.meta),
            job.tags,
            JSON.stringify(job.errors),
            job.attempt,
            job.maxAttempts,
            job.priority,
            job.scheduledAt
        ]);
        return rowToJob(result.rows[0]);
    }
    async fetchJobs(queue, limit) {
        const result = await this.pool.query(SQL.postgres.fetchJobs, [queue, limit]);
        return result.rows.map(rowToJob);
    }
    async updateJob(id, updates) {
        const result = await this.pool.query(SQL.postgres.updateJob, [
            id,
            updates.state ?? null,
            updates.errors ? JSON.stringify(updates.errors) : null,
            updates.completedAt ?? null,
            updates.discardedAt ?? null,
            updates.cancelledAt ?? null,
            updates.scheduledAt ?? null,
            updates.meta ? JSON.stringify(updates.meta) : null
        ]);
        return result.rows[0] ? rowToJob(result.rows[0]) : null;
    }
    async getJob(id) {
        const result = await this.pool.query(SQL.postgres.getJob, [id]);
        return result.rows[0] ? rowToJob(result.rows[0]) : null;
    }
    async pruneJobs(maxAge) {
        const result = await this.pool.query(SQL.postgres.pruneJobs, [maxAge]);
        return result.rowCount ?? 0;
    }
    async stageJobs() {
        const result = await this.pool.query(SQL.postgres.stageJobs);
        return result.rowCount ?? 0;
    }
    async cancelJobs(criteria) {
        let sql = SQL.postgres.cancelJobs;
        const params = [];
        let paramIndex = 1;
        if (criteria.queue) {
            sql += ` AND queue = $${paramIndex++}`;
            params.push(criteria.queue);
        }
        if (criteria.worker) {
            sql += ` AND worker = $${paramIndex++}`;
            params.push(criteria.worker);
        }
        if (criteria.state && criteria.state.length > 0) {
            sql += ` AND state = ANY($${paramIndex++})`;
            params.push(criteria.state);
        }
        const result = await this.pool.query(sql, params);
        return result.rowCount ?? 0;
    }
    async rescueStuckJobs(rescueAfter) {
        const result = await this.pool.query(SQL.postgres.rescueStuckJobs, [rescueAfter]);
        return result.rowCount ?? 0;
    }
    async checkUnique(options, job) {
        const fields = options.fields ?? ['worker', 'queue', 'args'];
        const states = options.states ?? ['available', 'scheduled', 'executing', 'retryable'];
        const period = options.period === 'infinity' ? 999999999 : (options.period ?? 60);
        let sql = 'SELECT * FROM izi_jobs WHERE state = ANY($1)';
        const params = [states];
        let paramIndex = 2;
        if (period !== 999999999) {
            sql += ` AND inserted_at > NOW() - INTERVAL '1 second' * $${paramIndex++}`;
            params.push(period);
        }
        if (fields.includes('worker')) {
            sql += ` AND worker = $${paramIndex++}`;
            params.push(job.worker);
        }
        if (fields.includes('queue')) {
            sql += ` AND queue = $${paramIndex++}`;
            params.push(job.queue);
        }
        if (fields.includes('args')) {
            if (options.keys && options.keys.length > 0) {
                for (const key of options.keys) {
                    sql += ` AND args->>'${key}' = $${paramIndex++}`;
                    params.push(String(job.args[key] ?? ''));
                }
            }
            else {
                sql += ` AND args = $${paramIndex++}`;
                params.push(JSON.stringify(job.args));
            }
        }
        sql += ' LIMIT 1';
        const result = await this.pool.query(sql, params);
        return result.rows[0] ? rowToJob(result.rows[0]) : null;
    }
    async listen(callback) {
        if (this.listening)
            return;
        this.client = await this.pool.connect();
        await this.client.query('LISTEN izi_jobs_insert');
        this.listening = true;
        this.client.on('notification', (msg) => {
            if (msg.channel === 'izi_jobs_insert' && msg.payload) {
                try {
                    const payload = JSON.parse(msg.payload);
                    callback({ queue: payload.queue });
                }
                catch {
                    // Ignore parse errors
                }
            }
        });
    }
    async notify(queue) {
        const payload = JSON.stringify({ queue });
        await this.pool.query('SELECT pg_notify($1, $2)', ['izi_jobs_insert', payload]);
    }
    async close() {
        if (this.client) {
            this.client.release();
            this.client = undefined;
        }
        this.listening = false;
        await this.pool.end();
    }
}
export function createPostgresAdapter(pool) {
    return new PostgresAdapter(pool);
}
//# sourceMappingURL=postgres.js.map