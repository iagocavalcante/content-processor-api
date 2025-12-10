import type { Job, WorkerDefinition, WorkerResult } from '../types.js';
export declare function registerWorker<T = Record<string, unknown>>(definition: WorkerDefinition<T>): void;
export declare function getWorker(name: string): WorkerDefinition | undefined;
export declare function hasWorker(name: string): boolean;
export declare function getWorkerNames(): string[];
export declare function clearWorkers(): void;
export declare function executeWorker(job: Job): Promise<WorkerResult>;
export declare function getBackoffDelay(job: Job): number;
export declare function defineWorker<T = Record<string, unknown>>(name: string, perform: (job: Job<T>) => Promise<WorkerResult | void>, options?: Partial<Omit<WorkerDefinition<T>, 'name' | 'perform'>>): WorkerDefinition<T>;
export declare const WorkerResults: {
    ok: (value?: unknown) => WorkerResult;
    error: (error: Error | string) => WorkerResult;
    cancel: (reason: string) => WorkerResult;
    snooze: (seconds: number) => WorkerResult;
};
//# sourceMappingURL=worker.d.ts.map