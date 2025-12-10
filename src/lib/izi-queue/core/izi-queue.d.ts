import type { DatabaseAdapter, IziQueueConfig, Job, JobInsertOptions, JobState, TelemetryEvent, TelemetryHandler, WorkerDefinition } from '../types.js';
import type { Plugin } from '../plugins/plugin.js';
export interface IziQueueFullConfig extends IziQueueConfig {
    plugins?: Plugin[];
}
export interface InsertResult<T = Record<string, unknown>> {
    job: Job<T>;
    conflict: boolean;
}
export declare class IziQueue {
    private config;
    private queues;
    private stageTimer?;
    private started;
    constructor(config: IziQueueFullConfig);
    get database(): DatabaseAdapter;
    get node(): string;
    get isStarted(): boolean;
    migrate(): Promise<void>;
    register<T = Record<string, unknown>>(worker: WorkerDefinition<T>): this;
    start(): Promise<void>;
    stop(): Promise<void>;
    shutdown(): Promise<void>;
    insert<T = Record<string, unknown>>(worker: string | WorkerDefinition<T>, options: JobInsertOptions<T>): Promise<Job<T>>;
    insertWithResult<T = Record<string, unknown>>(worker: string | WorkerDefinition<T>, options: JobInsertOptions<T>): Promise<InsertResult<T>>;
    insertAll<T = Record<string, unknown>>(worker: string | WorkerDefinition<T>, jobs: JobInsertOptions<T>[]): Promise<Job<T>[]>;
    getJob(id: number): Promise<Job | null>;
    cancelJobs(criteria: {
        queue?: string;
        worker?: string;
        state?: JobState[];
    }): Promise<number>;
    pruneJobs(maxAgeSeconds?: number): Promise<number>;
    rescueStuckJobs(rescueAfterSeconds?: number): Promise<number>;
    pauseQueue(name: string): void;
    resumeQueue(name: string): void;
    scaleQueue(name: string, limit: number): void;
    getQueueStatus(name: string): {
        name: string;
        state: string;
        limit: number;
        running: number;
    } | null;
    getAllQueueStatus(): Array<{
        name: string;
        state: string;
        limit: number;
        running: number;
    }>;
    on(event: TelemetryEvent | '*', handler: TelemetryHandler): () => void;
    private stageJobs;
    drain(queueName?: string): Promise<void>;
}
export declare function createIziQueue(config: IziQueueFullConfig): IziQueue;
//# sourceMappingURL=izi-queue.d.ts.map