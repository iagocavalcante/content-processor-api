class Telemetry {
    handlers = new Map();
    on(event, handler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event).add(handler);
        return () => {
            this.handlers.get(event)?.delete(handler);
        };
    }
    once(event, handler) {
        const wrapper = (payload) => {
            unsubscribe();
            handler(payload);
        };
        const unsubscribe = this.on(event, wrapper);
        return unsubscribe;
    }
    emit(event, payload) {
        const fullPayload = {
            ...payload,
            event,
            timestamp: new Date()
        };
        this.handlers.get(event)?.forEach(handler => {
            try {
                handler(fullPayload);
            }
            catch {
                // Ignore handler errors
            }
        });
        this.handlers.get('*')?.forEach(handler => {
            try {
                handler(fullPayload);
            }
            catch {
                // Ignore handler errors
            }
        });
    }
    off(event) {
        if (event) {
            this.handlers.delete(event);
        }
        else {
            this.handlers.clear();
        }
    }
}
export const telemetry = new Telemetry();
//# sourceMappingURL=telemetry.js.map