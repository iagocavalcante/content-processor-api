import { calculateBackoff } from './job.js';
const workerRegistry = new Map();
export function registerWorker(definition) {
    workerRegistry.set(definition.name, definition);
}
export function getWorker(name) {
    return workerRegistry.get(name);
}
export function hasWorker(name) {
    return workerRegistry.has(name);
}
export function getWorkerNames() {
    return Array.from(workerRegistry.keys());
}
export function clearWorkers() {
    workerRegistry.clear();
}
export async function executeWorker(job) {
    const worker = getWorker(job.worker);
    if (!worker) {
        return {
            status: 'error',
            error: new Error(`Worker "${job.worker}" not registered`)
        };
    }
    const timeout = worker.timeout ?? 60000;
    try {
        const result = await Promise.race([
            worker.perform(job),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Job timed out after ${timeout}ms`)), timeout))
        ]);
        if (result === undefined) {
            return { status: 'ok' };
        }
        return result;
    }
    catch (error) {
        return {
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error))
        };
    }
}
export function getBackoffDelay(job) {
    const worker = getWorker(job.worker);
    if (worker?.backoff) {
        return worker.backoff(job);
    }
    return calculateBackoff(job.attempt);
}
export function defineWorker(name, perform, options = {}) {
    return {
        name,
        perform,
        ...options
    };
}
export const WorkerResults = {
    ok: (value) => ({ status: 'ok', value }),
    error: (error) => ({ status: 'error', error }),
    cancel: (reason) => ({ status: 'cancel', reason }),
    snooze: (seconds) => ({ status: 'snooze', seconds })
};
//# sourceMappingURL=worker.js.map