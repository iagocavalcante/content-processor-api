import type { Pool } from 'pg';
import type { Job, JobState, UniqueOptions } from '../types.js';
import { BaseAdapter } from './adapter.js';
export declare class PostgresAdapter extends BaseAdapter {
    private pool;
    private client?;
    private listening;
    private reconnecting;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    constructor(pool: Pool);
    private setupErrorHandling;
    private handleConnectionError;
    migrate(): Promise<void>;
    rollback(targetVersion?: number): Promise<void>;
    getMigrationStatus(): Promise<{
        version: number;
        name: string;
        applied: boolean;
    }[]>;
    insertJob(job: Omit<Job, 'id' | 'insertedAt'>): Promise<Job>;
    fetchJobs(queue: string, limit: number): Promise<Job[]>;
    updateJob(id: number, updates: Partial<Job>): Promise<Job | null>;
    getJob(id: number): Promise<Job | null>;
    pruneJobs(maxAge: number): Promise<number>;
    stageJobs(): Promise<number>;
    cancelJobs(criteria: {
        queue?: string;
        worker?: string;
        state?: JobState[];
    }): Promise<number>;
    rescueStuckJobs(rescueAfter: number): Promise<number>;
    checkUnique(options: UniqueOptions, job: Omit<Job, 'id' | 'insertedAt'>): Promise<Job | null>;
    listen(callback: (event: {
        queue: string;
    }) => void): Promise<void>;
    notify(queue: string): Promise<void>;
    close(): Promise<void>;
}
export declare function createPostgresAdapter(pool: Pool): PostgresAdapter;
//# sourceMappingURL=postgres.d.ts.map