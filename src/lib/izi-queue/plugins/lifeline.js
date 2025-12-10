import { BasePlugin } from './plugin.js';
import { telemetry } from '../core/telemetry.js';
/**
 * Rescues jobs stuck in executing state (e.g., after a crash)
 */
export class LifelinePlugin extends BasePlugin {
    name = 'lifeline';
    config;
    constructor(config = {}) {
        super();
        this.config = {
            interval: config.interval ?? 60000,
            rescueAfter: config.rescueAfter ?? 300
        };
    }
    async onStart() {
        if (!this.context)
            return;
        telemetry.emit('plugin:start', { queue: this.name });
        await this.rescue();
        this.timer = setInterval(() => this.rescue(), this.config.interval);
    }
    async onStop() {
        telemetry.emit('plugin:stop', { queue: this.name });
    }
    async rescue() {
        if (!this.context || !this.running)
            return;
        try {
            const rescued = await this.context.database.rescueStuckJobs(this.config.rescueAfter);
            if (rescued > 0) {
                telemetry.emit('job:rescue', {
                    result: { count: rescued, rescueAfter: this.config.rescueAfter }
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
            errors.push('Lifeline interval must be at least 1000ms');
        }
        if (this.config.rescueAfter < 10) {
            errors.push('Lifeline rescueAfter must be at least 10 seconds');
        }
        return errors;
    }
}
export function createLifelinePlugin(config) {
    return new LifelinePlugin(config);
}
//# sourceMappingURL=lifeline.js.map