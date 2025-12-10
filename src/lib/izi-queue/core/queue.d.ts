import type { DatabaseAdapter, QueueConfig } from '../types.js';
type QueueState = 'running' | 'paused' | 'stopped';
export declare class Queue {
    private config;
    private database;
    private state;
    private running;
    private pollTimer?;
    private node;
    constructor(config: QueueConfig, database: DatabaseAdapter, node: string);
    get name(): string;
    get limit(): number;
    get currentState(): QueueState;
    get runningCount(): number;
    start(): Promise<void>;
    stop(gracePeriod?: number): Promise<void>;
    pause(): void;
    resume(): void;
    scale(limit: number): void;
    dispatch(): void;
    private schedulePoll;
    private poll;
    private execute;
    private handleSuccess;
    private handleError;
    private handleCancel;
    private handleSnooze;
}
export {};
//# sourceMappingURL=queue.d.ts.map