export class BasePlugin {
    context;
    timer;
    running = false;
    async start(context) {
        if (this.running)
            return;
        this.context = context;
        this.running = true;
        await this.onStart();
    }
    async stop() {
        if (!this.running)
            return;
        this.running = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
        await this.onStop();
    }
    async onStop() { }
    validate() {
        return [];
    }
}
//# sourceMappingURL=plugin.js.map