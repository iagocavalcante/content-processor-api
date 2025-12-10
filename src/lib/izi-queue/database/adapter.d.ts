import type { DatabaseAdapter, Job, JobState } from '../types.js';
export declare const SQL: {
    postgres: {
        createTable: string;
        createIndexes: string[];
        insertJob: string;
        fetchJobs: string;
        updateJob: string;
        getJob: string;
        pruneJobs: string;
        stageJobs: string;
        cancelJobs: string;
        rescueStuckJobs: string;
        checkUnique: string;
    };
    mysql: {
        createTable: string;
        insertJob: string;
        fetchJobs: string;
        updateFetched: string;
        updateJob: string;
        getJob: string;
        pruneJobs: string;
        stageJobs: string;
        cancelJobs: string;
        rescueStuckJobs: string;
        checkUnique: string;
    };
    sqlite: {
        createTable: string;
        createIndexes: string[];
        insertJob: string;
        fetchJobs: string;
        updateJob: string;
        getJob: string;
        pruneJobs: string;
        stageJobs: string;
        cancelJobs: string;
        rescueStuckJobs: string;
        checkUnique: string;
    };
};
export declare function rowToJob(row: Record<string, unknown>): Job;
export declare abstract class BaseAdapter implements DatabaseAdapter {
    abstract migrate(): Promise<void>;
    abstract insertJob(job: Omit<Job, 'id' | 'insertedAt'>): Promise<Job>;
    abstract fetchJobs(queue: string, limit: number): Promise<Job[]>;
    abstract updateJob(id: number, updates: Partial<Job>): Promise<Job | null>;
    abstract getJob(id: number): Promise<Job | null>;
    abstract pruneJobs(maxAge: number): Promise<number>;
    abstract stageJobs(): Promise<number>;
    abstract cancelJobs(criteria: {
        queue?: string;
        worker?: string;
        state?: JobState[];
    }): Promise<number>;
    abstract rescueStuckJobs(rescueAfter: number): Promise<number>;
    abstract close(): Promise<void>;
}
//# sourceMappingURL=adapter.d.ts.map