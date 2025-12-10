import { createJob } from './job.js';
import { Queue } from './queue.js';
import { telemetry } from './telemetry.js';
import { registerWorker, clearWorkers, getWorker } from './worker.js';
import { randomUUID } from 'crypto';
export class IziQueue {
    config;
    queues = new Map();
    stageTimer;
    started = false;
    constructor(config) {
        const queues = Array.isArray(config.queues)
            ? config.queues
            : Object.entries(config.queues).map(([name, limit]) => ({
                name,
                limit,
                paused: false,
                pollInterval: config.pollInterval ?? 1000
            }));
        this.config = {
            database: config.database,
            queues,
            plugins: config.plugins ?? [],
            node: config.node ?? `node-${randomUUID().slice(0, 8)}`,
            stageInterval: config.stageInterval ?? 1000,
            shutdownGracePeriod: config.shutdownGracePeriod ?? 15000,
            pollInterval: config.pollInterval ?? 1000
        };
        for (const plugin of this.config.plugins) {
            if (plugin.validate) {
                const errors = plugin.validate();
                if (errors.length > 0) {
                    throw new Error(`Plugin "${plugin.name}" validation failed: ${errors.join(', ')}`);
                }
            }
        }
    }
    get database() {
        return this.config.database;
    }
    get node() {
        return this.config.node;
    }
    get isStarted() {
        return this.started;
    }
    async migrate() {
        await this.config.database.migrate();
    }
    register(worker) {
        registerWorker(worker);
        return this;
    }
    async start() {
        if (this.started)
            return;
        for (const queueConfig of this.config.queues) {
            const queue = new Queue(queueConfig, this.config.database, this.config.node);
            this.queues.set(queueConfig.name, queue);
        }
        this.stageTimer = setInterval(() => this.stageJobs(), this.config.stageInterval);
        await Promise.all(Array.from(this.queues.values()).map(q => q.start()));
        if (this.config.database.listen) {
            await this.config.database.listen(({ queue }) => {
                this.queues.get(queue)?.dispatch();
            });
        }
        const pluginContext = {
            database: this.config.database,
            node: this.config.node,
            queues: Array.from(this.queues.keys())
        };
        for (const plugin of this.config.plugins) {
            await plugin.start(pluginContext);
        }
        this.started = true;
    }
    async stop() {
        if (!this.started)
            return;
        for (const plugin of this.config.plugins) {
            await plugin.stop();
        }
        if (this.stageTimer) {
            clearInterval(this.stageTimer);
            this.stageTimer = undefined;
        }
        await Promise.all(Array.from(this.queues.values()).map(q => q.stop(this.config.shutdownGracePeriod)));
        this.started = false;
    }
    async shutdown() {
        await this.stop();
        await this.config.database.close();
        clearWorkers();
    }
    async insert(worker, options) {
        const result = await this.insertWithResult(worker, options);
        return result.job;
    }
    async insertWithResult(worker, options) {
        const workerName = typeof worker === 'string' ? worker : worker.name;
        const workerDef = getWorker(workerName);
        const jobData = createJob(workerName, {
            ...options,
            queue: options.queue ?? workerDef?.queue ?? 'default',
            maxAttempts: options.maxAttempts ?? workerDef?.maxAttempts ?? 20,
            priority: options.priority ?? workerDef?.priority ?? 0
        });
        if (options.unique && this.config.database.checkUnique) {
            const existingJob = await this.config.database.checkUnique(options.unique, jobData);
            if (existingJob) {
                telemetry.emit('job:unique_conflict', {
                    job: existingJob,
                    queue: existingJob.queue
                });
                return { job: existingJob, conflict: true };
            }
        }
        const job = await this.config.database.insertJob(jobData);
        if (this.started && this.config.database.notify) {
            await this.config.database.notify(job.queue);
        }
        return { job: job, conflict: false };
    }
    async insertAll(worker, jobs) {
        return Promise.all(jobs.map(options => this.insert(worker, options)));
    }
    async getJob(id) {
        return this.config.database.getJob(id);
    }
    async cancelJobs(criteria) {
        return this.config.database.cancelJobs(criteria);
    }
    async pruneJobs(maxAgeSeconds = 86400 * 7) {
        return this.config.database.pruneJobs(maxAgeSeconds);
    }
    async rescueStuckJobs(rescueAfterSeconds = 300) {
        return this.config.database.rescueStuckJobs(rescueAfterSeconds);
    }
    pauseQueue(name) {
        this.queues.get(name)?.pause();
    }
    resumeQueue(name) {
        this.queues.get(name)?.resume();
    }
    scaleQueue(name, limit) {
        this.queues.get(name)?.scale(limit);
    }
    getQueueStatus(name) {
        const queue = this.queues.get(name);
        if (!queue)
            return null;
        return {
            name: queue.name,
            state: queue.currentState,
            limit: queue.limit,
            running: queue.runningCount
        };
    }
    getAllQueueStatus() {
        return Array.from(this.queues.values()).map(queue => ({
            name: queue.name,
            state: queue.currentState,
            limit: queue.limit,
            running: queue.runningCount
        }));
    }
    on(event, handler) {
        return telemetry.on(event, handler);
    }
    async stageJobs() {
        try {
            const staged = await this.config.database.stageJobs();
            if (staged > 0) {
                this.queues.forEach(queue => queue.dispatch());
            }
        }
        catch (error) {
            console.error('[izi-queue] Error staging jobs:', error);
        }
    }
    async drain(queueName) {
        const queuesToDrain = queueName
            ? [this.queues.get(queueName)].filter(Boolean)
            : Array.from(this.queues.values());
        await this.stageJobs();
        let hasJobs = true;
        while (hasJobs) {
            hasJobs = false;
            for (const queue of queuesToDrain) {
                if (!queue)
                    continue;
                const jobs = await this.config.database.fetchJobs(queue.name, queue.limit);
                if (jobs.length > 0) {
                    hasJobs = true;
                    for (const job of jobs) {
                        await this.config.database.updateJob(job.id, { state: 'available' });
                    }
                    queue.dispatch();
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        }
    }
}
export function createIziQueue(config) {
    return new IziQueue(config);
}
//# sourceMappingURL=izi-queue.js.map