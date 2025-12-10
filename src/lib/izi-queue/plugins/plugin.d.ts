import type { DatabaseAdapter } from '../types.js';
export interface PluginConfig {
    name: string;
}
export interface PluginContext {
    database: DatabaseAdapter;
    node: string;
    queues: string[];
}
export interface Plugin {
    readonly name: string;
    start(context: PluginContext): Promise<void>;
    stop(): Promise<void>;
    validate?(): string[];
}
export declare abstract class BasePlugin implements Plugin {
    abstract readonly name: string;
    protected context?: PluginContext;
    protected timer?: ReturnType<typeof setInterval>;
    protected running: boolean;
    start(context: PluginContext): Promise<void>;
    stop(): Promise<void>;
    protected abstract onStart(): Promise<void>;
    protected onStop(): Promise<void>;
    validate(): string[];
}
//# sourceMappingURL=plugin.d.ts.map