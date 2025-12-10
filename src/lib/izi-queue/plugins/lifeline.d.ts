import { BasePlugin } from './plugin.js';
export interface LifelineConfig {
    interval?: number;
    rescueAfter?: number;
}
/**
 * Rescues jobs stuck in executing state (e.g., after a crash)
 */
export declare class LifelinePlugin extends BasePlugin {
    readonly name = "lifeline";
    private config;
    constructor(config?: LifelineConfig);
    protected onStart(): Promise<void>;
    protected onStop(): Promise<void>;
    private rescue;
    validate(): string[];
}
export declare function createLifelinePlugin(config?: LifelineConfig): LifelinePlugin;
//# sourceMappingURL=lifeline.d.ts.map