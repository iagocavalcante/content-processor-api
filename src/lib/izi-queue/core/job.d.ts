import type { Job, JobInsertOptions, JobState } from '../types.js';
export declare const STATE_TRANSITIONS: Record<JobState, JobState[]>;
export declare const TERMINAL_STATES: JobState[];
export declare function isValidTransition(from: JobState, to: JobState): boolean;
export declare function isTerminal(state: JobState): boolean;
export declare function createJob<T = Record<string, unknown>>(worker: string, options: JobInsertOptions<T>): Omit<Job<T>, 'id' | 'insertedAt'>;
/**
 * Calculate backoff delay with exponential backoff and jitter
 * Default: 15 + 2^attempt seconds with +/-10% jitter
 */
export declare function calculateBackoff(attempt: number, options?: {
    basePad?: number;
    multiplier?: number;
    maxPower?: number;
    jitterPercent?: number;
}): number;
export declare function formatError(error: Error | string, attempt: number): Job['errors'][0];
//# sourceMappingURL=job.d.ts.map