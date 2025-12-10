import { BasePlugin } from './plugin.js';
export interface PrunerConfig {
    interval?: number;
    maxAge?: number;
}
/**
 * Removes old completed/discarded/cancelled jobs
 */
export declare class PrunerPlugin extends BasePlugin {
    readonly name = "pruner";
    private config;
    constructor(config?: PrunerConfig);
    protected onStart(): Promise<void>;
    protected onStop(): Promise<void>;
    private prune;
    validate(): string[];
}
export declare function createPrunerPlugin(config?: PrunerConfig): PrunerPlugin;
//# sourceMappingURL=pruner.d.ts.map