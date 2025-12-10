import type { TelemetryEvent, TelemetryHandler, TelemetryPayload } from '../types.js';
declare class Telemetry {
    private handlers;
    on(event: TelemetryEvent | '*', handler: TelemetryHandler): () => void;
    once(event: TelemetryEvent | '*', handler: TelemetryHandler): () => void;
    emit(event: TelemetryEvent, payload: Omit<TelemetryPayload, 'event' | 'timestamp'>): void;
    off(event?: TelemetryEvent | '*'): void;
}
export declare const telemetry: Telemetry;
export {};
//# sourceMappingURL=telemetry.d.ts.map