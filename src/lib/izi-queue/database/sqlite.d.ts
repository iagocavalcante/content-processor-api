import type { Database } from 'better-sqlite3';
import type { Job, JobState, UniqueOptions } from '../types.js';
import { BaseAdapter } from './adapter.js';
export declare class SQLiteAdapter extends BaseAdapter {
    private db;
    constructor(db: Database);
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
    close(): Promise<void>;
}
export declare function createSQLiteAdapter(db: Database): SQLiteAdapter;
//# sourceMappingURL=sqlite.d.ts.map