import { BasePlugin } from './plugin.js';
import { telemetry } from '../core/telemetry.js';
/**
 * Removes old completed/discarded/cancelled jobs
 */
export class PrunerPlugin extends BasePlugin {
    name = 'pruner';
    config;
    constructor(config = {}) {
        super();
        this.config = {
            interval: config.interval ?? 60000,
            maxAge: config.maxAge ?? 86400
        };
    }
    async onStart() {
        if (!this.context)
            return;
        telemetry.emit('plugin:start', { queue: this.name });
        this.timer = setInterval(() => this.prune(), this.config.interval);
    }
    async onStop() {
        telemetry.emit('plugin:stop', { queue: this.name });
    }
    async prune() {
        if (!this.context || !this.running)
            return;
        try {
            const pruned = await this.context.database.pruneJobs(this.config.maxAge);
            if (pruned > 0) {
                telemetry.emit('job:complete', {
                    result: { pruned, maxAge: this.config.maxAge },
                    queue: 'pruner'
                });
            }
        }
        catch (error) {
            telemetry.emit('plugin:error', {
                queue: this.name,
                error: error instanceof Error ? error : new Error(String(error))
            });
        }
    }
    validate() {
        const errors = [];
        if (this.config.interval < 1000) {
            errors.push('Pruner interval must be at least 1000ms');
        }
        if (this.config.maxAge < 60) {
            errors.push('Pruner maxAge must be at least 60 seconds');
        }
        return errors;
    }
}
export function createPrunerPlugin(config) {
    return new PrunerPlugin(config);
}
//# sourceMappingURL=pruner.js.map